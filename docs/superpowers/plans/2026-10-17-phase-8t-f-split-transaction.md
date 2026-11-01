# Phase 8T-F: A Train Split as One Transaction: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close 8T's restart window. A split's two party writes (the old train loses the group; the new train gets who went, as they were at that moment) become one database transaction, so a stop of the process can no longer leave a member on the wrong train or on neither.

**Architecture:**

- **Store and storage** (task 1): `PartyStore.updateBoth(ids, change)` takes both parties' locks, lowest id first (nested; two such calls never wait on each other), runs a synchronous `change(first, second)` with both current parties, and writes the changed ones in one `PartyStorage.saveBoth` call (one party changed: the plain `save`); memory is replaced only after the commit, both or neither, and listeners run after it. `PartyRepository.saveBoth` writes both rows in one `inTransaction`: a missing row rolls back both (the store drops that party, as `update` does, and throws). History notes keep `withNote`'s guarantees: a note that ends a party behind its own savepoint in the transaction, each failed one to `historyFailed` (with its own error) after the commit; a deadlock that loses the savepoint rewrites both rows in a transaction of their own; notes of steps only after the commit. `MemoryPartyStorage` (`test/support/parties.ts`) implements it, refusing a duplicate post within the pair as the unique key does.
- **The split** (task 2): `PartyService.splitNow` makes one `updateBoth([old, new])`: the old train loses the group (`splitOffGroup`) and the new train, as it is then, gets `carriedSplit` and `splitSettled` from that very split. No carry-over write, no retry, no "settle as the old train says". A pending new train now means only "its post exists and the paired write did not commit": `settleSplit` (at start and with the upkeep) takes it back; one its old train lists (only 8T's first build could leave that) is settled as stored and logged as an error. `splitSettled` loses its `old` parameter. Docs: `trains.md`, `history.md`, `parties-and-posts.md`, `testing.md`, the 8T design's Atomicity, the 8T staging checklist (steps 3, 25).

**Tech Stack:** TypeScript 6.0, Node 24, Kysely on MySQL 8.4, Vitest. No new dependency, no migration, no change of the party state document (still version 11).

**Spec:** Matt, 2026-10-17, in chat: "Sounds like we should do transactional" (the two writes in one transaction rather than an idempotent redo). Brief `.superpowers/sdd/2026-10-17-phase-8t-f-split-transaction/design.md` (git-ignored); the 8T design `docs/superpowers/specs/2026-10-17-train-split-design.md` ("Atomicity").

**Every diff in this plan was run before the plan was written** on a throwaway branch (`proto-8tf`), one commit per task, each typechecked with its tests green. On the tip the full check (7,584 unit tests), the build and the database suite (448) are clean. An Opus reviewer went through the prototype (ready; one minor, four nits, all folded into the commits below).

## Decisions in this plan

1. **A press can wait for the pair:** the paired change holds the lower id's lock while it waits for the higher one, so a press on the party with the lower id waits until the pair is written (`trains.md`).
2. **A pending train is always taken back**, also when its old train ended since (it used to be settled): the paired write never committed, so the split never happened.
3. **A pending train its old train lists** (not producible by this code) is settled as stored, with an error in the log: taking it back would leave the group on neither train.
4. **A commit whose acknowledgement is lost** (the connection drops after MySQL committed) is the same rare risk as any `update`: the take-back then leaves the group on neither train in the database until the old train's next write; accepted, documented in `trains.md`.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8tf`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`. Stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Both rows or neither; memory and listeners only after the commit; the deadlock rewrite.
2. Lock order and reentrancy (nothing inside the pair takes a party lock).
3. The split's pending handling at start and in the upkeep.

### Task 1: Plan 8T-F T1: Party store: one change of two parties, written in one transaction (8T-F-1)

Prototype commit: `b9df333cccb5d547ce860c4def5dc2bb7f7d38a0`

PartyStore.updateBoth([id, id], change) takes both parties' locks in the
order of their ids, runs one synchronous change over both (undefined for
one that is not active) and writes the changed ones through one storage
call: PartyStorage.saveBoth, both UPDATEs in one transaction, both or
neither (a row that is gone rolls the other back too). Memory is replaced
after the commit only, both before the listeners hear of either. The
notes keep withNote's guarantees: an end behind its own savepoint inside
the transaction, steps after the commit, a transaction lost to a failing
record run again without the notes. MemoryPartyStorage has it too.

**Files:**

```
 docs/architecture/parties-and-posts.md           |   2 +-
 src/db/repositories/history-recording.db.test.ts | 123 +++++++++++++++++++++++++
 src/db/repositories/party-repository.db.test.ts  |  47 ++++++++++
 src/db/repositories/party-repository.ts          | 142 ++++++++++++++++++++++++----
 src/services/party-store.test.ts                 | 215 +++++++++++++++++++++++++++++++++++++++++++
 src/services/party-store.ts                      |  98 +++++++++++++++++++-
 test/support/parties.ts                          |  41 ++++++++-
 7 files changed, 644 insertions(+), 24 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/party-store.test.ts`, then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/history-recording.db.test.ts src/db/repositories/party-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff b9df333cccb5d547ce860c4def5dc2bb7f7d38a0 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-f-split-transaction.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T-F T1: Party store: one change of two parties, written in one transaction (8T-F-1)`, the body above and the trailer, staging exactly
  `docs/architecture/parties-and-posts.md src/db/repositories/history-recording.db.test.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/party-repository.ts src/services/party-store.test.ts src/services/party-store.ts test/support/parties.ts`.

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 9af48e838fe082b02ec9f312d2d7ca41b0b0532a..be385e656d23733d8120dc152f10e002b9d86164 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -7,7 +7,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - A party (a raid, a meetup or a train) is an immutable plain object (`src/domain/party/party.ts`). Everything that can happen to it is a pure function in `src/domain/party/` (`attendance.ts`, `raid.ts`) that returns a changed party with what came of it, or `{ ok: false, reason }` (`Change`); a function returns the very same object when nothing changed. Commands turn a `reason` into a sentence. Never mutate a party.
 - `Party` is a union, `RaidParty | MeetupParty | TrainParty`. Code that is about a raid narrows: `isRaid` in the domain and services, the guard `requireRaid` with `commandRaid(interaction, ctx)` in a handler, `raidOf` elsewhere; likewise `isTimed` / `requireTimed` / `commandTimed` and `isMeetup` / `requireMeetup` / `commandMeetup`. A change inside `PartyStore.update` keeps the kind (`asKindOf(original, changed)`; the store throws when the kind changes). Never cast to a kind.
 - What the clock does is `partyTick(party, input)` (`tick.ts`; it dispatches to `raidTick` or `timedTick`): it returns the party as it should be now, `effects` (`stage`, `ask-complete`, `completed`, `warn`, `end`) and `render`. It is idempotent and catches up after downtime by itself. `end` comes alone and repeats until the caller has ended the party with `endParty`.
-- A party changes only through `PartyStore.update(id, change)` (`src/services/party-store.ts`): one change at a time per party, written to the database first, then replaced in memory. `change` is synchronous and decides inside the callback (a `get` made earlier may be stale); the result has `written`. A reported raid is stored only through `addRaidUnlessTaken`. Handlers read through `ctx.parties` (`get`, `byPost`, `active`, `inRegion`, `raidAt`).
+- A party changes only through `PartyStore.update(id, change)` (`src/services/party-store.ts`): one change at a time per party, written to the database first, then replaced in memory. `change` is synchronous and decides inside the callback (a `get` made earlier may be stale); the result has `written`. Two parties that must change together (a train's split: the old train loses the group, the new one is made to match) change through `PartyStore.updateBoth([id, id], change)`: `change(first, second)` gets both as they are (undefined for one that is not active: it decides) and returns `parties` in the same order, both written by one storage call in one transaction (`PartyStorage.saveBoth`; the notes as `save`'s: an end behind its savepoint inside the transaction, steps after the commit), memory replaced only after the commit, both before the listeners hear of either; a failed write leaves both as they were, a row that is gone writes neither. It takes both locks in the order of the ids, so a change of either waits for it and two such changes never deadlock; nothing inside it takes a lock again (`KeyedLock` is not re-entrant). A reported raid is stored only through `addRaidUnlessTaken`. Handlers read through `ctx.parties` (`get`, `byPost`, `active`, `inRegion`, `raidAt`).
 - Every party that ends is recorded in the party history (`history.md`): the store asks `PartyHistory` for a note of each write, which the storage writes with the party, and a change that ends a party says why with `ended` in its result (`PartyEnd`: the scheduler `clock`, `PartyService.end` `cancelled` by default, a move `moved`, a party that never had its post `failed`). Once recorded, an ended party's `Party` row is deleted (it holds its members' ids; Matt, 2026-10-16): what reads ended parties (`endedPosts`, `partyForums`) also reads `EndedPartyPost`, and nothing may count on an ended row being there.
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
diff --git a/src/db/repositories/history-recording.db.test.ts b/src/db/repositories/history-recording.db.test.ts
index fee7fe4b538a5256b50fc220f23e17f44c94221d..e942c7f6a3c19b3b971250dcf90ed732002137ec 100644
--- a/src/db/repositories/history-recording.db.test.ts
+++ b/src/db/repositories/history-recording.db.test.ts
@@ -32,6 +32,7 @@ import { PartyRepository } from './party-repository.js';
 const T = PARTY_NOW;
 const MOVED = '00000000-0000-4000-8000-000000000009';
 const SPLIT = '00000000-0000-4000-8000-00000000000a';
+const PAIRED = '00000000-0000-4000-8000-00000000000b';
 const POST = '900000000000000001';
 const FORUM = '900000000000000002';
 
@@ -489,6 +490,128 @@ describe('the party history, written with the parties', () => {
     ]);
   });
 
+  /** Two raids that have been written once; the second is joined by Alice in the pair. */
+  async function pair(): Promise<[Party, Party]> {
+    const one = await live([testRaid()]);
+    const two = await live([{ ...testRaid(), id: PAIRED, gymId: 11 }]);
+    return [one, two];
+  }
+  const joined = (party: Party, at: number): Party => ({
+    ...withAttendees(party, { [ALICE]: {} }),
+    updatedAt: at,
+  });
+
+  it('writes the notes of two parties saved together: the end in the transaction, steps after it', async () => {
+    const [one, two] = await pair();
+    const last = ending(one, T + MINUTE);
+    const next = joined(two, T + MINUTE);
+    expect(
+      await parties.saveBoth([
+        { party: last, note: noteOf(one, last) },
+        { party: next, note: noteOf(two, next) },
+      ]),
+    ).toEqual([true, true]);
+    expect((await kept()).map((row) => row.partyId)).toEqual([one.id]);
+    expect(await rowOf(one.id)).toBeUndefined();
+    expect((await stepsOf(PAIRED)).map((step) => step.subject)).toEqual([REPORTER, ALICE]);
+    expect(await parties.findById(PAIRED)).toEqual({ ok: true, party: next });
+    expect(failures).toEqual([]);
+  });
+
+  it('ends both parties saved together although a record cannot be made, and says so after', async () => {
+    const [one, two] = await pair();
+    const last = ending(one, T + MINUTE);
+    const over = ending(two, T + MINUTE);
+    const broken = noteOf(one, last, recordOf(last, 'insert'));
+    await parties.saveBoth([
+      { party: last, note: broken },
+      { party: over, note: noteOf(two, over) },
+    ]);
+    // The first record is undone alone; the second is written, in the same transaction.
+    expect((await kept()).map((row) => row.partyId)).toEqual([PAIRED]);
+    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
+    expect(await rowOf(PAIRED)).toBeUndefined();
+    expect(failures.map((failure) => failure.note)).toEqual([broken]);
+  });
+
+  it('writes both parties alone when a record took the whole transaction with it', async () => {
+    const killing = new PartyRepository(db, {
+      historyFailed,
+      // A deadlock: MySQL rolls the whole transaction back, the savepoint with it.
+      history: (on) => ({
+        write: async () => {
+          await sql`rollback`.execute(on);
+          throw new Error('Deadlock found when trying to get lock');
+        },
+      }),
+    });
+    const [one, two] = await pair();
+    const last = ending(one, T + MINUTE);
+    const next = joined(two, T + MINUTE);
+    const ended = noteOf(one, last);
+    const steps = noteOf(two, next);
+    expect(
+      await killing.saveBoth([
+        { party: last, note: ended },
+        { party: next, note: steps },
+      ]),
+    ).toEqual([true, true]);
+    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
+    expect(await parties.findById(PAIRED)).toEqual({ ok: true, party: next });
+    // The end and the steps are both handed over, to be tried again.
+    expect(failures.map((failure) => [failure.note, String(failure.err)])).toEqual([
+      [ended, 'Error: Deadlock found when trying to get lock'],
+      [steps, 'Error: Deadlock found when trying to get lock'],
+    ]);
+  });
+
+  it('hands over each end with its own error when a later record took the transaction with it', async () => {
+    const killing = new PartyRepository(db, {
+      historyFailed,
+      // The second party's record deadlocks; the first's is written as ever (and fails here).
+      history: (on) => ({
+        write: async (note) => {
+          if (note.partyId !== PAIRED) return new HistoryRepository(on).write(note);
+          await sql`rollback`.execute(on);
+          throw new Error('Deadlock found when trying to get lock');
+        },
+      }),
+    });
+    const [one, two] = await pair();
+    const last = ending(one, T + MINUTE);
+    const over = ending(two, T + MINUTE);
+    const broken = noteOf(one, last, recordOf(last, 'build'));
+    const killed = noteOf(two, over);
+    expect(
+      await killing.saveBoth([
+        { party: last, note: broken },
+        { party: over, note: killed },
+      ]),
+    ).toEqual([true, true]);
+    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
+    expect(await rowOf(PAIRED)).toEqual({ status: 'ended' });
+    expect(failures.map((failure) => [failure.note, String(failure.err)])).toEqual([
+      [broken, 'Error: the record could not be made'],
+      [killed, 'Error: Deadlock found when trying to get lock'],
+    ]);
+  });
+
+  it('writes no note of two parties that were not saved because a row was gone', async () => {
+    const [one] = await pair();
+    const last = ending(one, T + MINUTE);
+    const stray = { ...testRaid(), id: SPLIT };
+    expect(
+      await parties.saveBoth([
+        { party: last, note: noteOf(one, last) },
+        { party: stray, note: noteOf(undefined, stray) },
+      ]),
+    ).toEqual([true, false]);
+    expect(await kept()).toEqual([]);
+    expect(await rowOf(one.id)).toEqual({ status: 'active' });
+    expect(await stepsOf(SPLIT)).toEqual([]);
+    expect(failures).toEqual([]);
+  });
+
   it('names nobody who opted out while the party ended (the opt-ins are read under a lock)', async () => {
     await optIn(ALICE);
     const raid = testRaid();
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index df39bfdcc37dc9402a52ff760925e0e853af81e8..0706730bb68136f103ee28114caf89e7b0afabfd 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -350,6 +350,53 @@ describe('PartyRepository', () => {
     await expect(parties.save(egg)).resolves.toBe(true);
   });
 
+  it('saves two parties in one transaction: a failure of the second leaves the first as it was', async () => {
+    const one = testRaid({ id: ID(1) });
+    const two = testRaid({ id: ID(2) });
+    const taken = fullRaid(3);
+    for (const party of [one, two, taken]) await parties.insert(party);
+    const changed: RaidParty = { ...fullRaid(1), forumPostId: null, updatedAt: PARTY_NOW + MINUTE };
+    // The second row's post is another party's: its update fails after the first row's.
+    const clash: RaidParty = { ...two, forumPostId: taken.forumPostId, saved: true };
+    await expect(parties.saveBoth([{ party: changed }, { party: clash }])).rejects.toThrow(
+      /Duplicate/,
+    );
+    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: one });
+    await expect(parties.findById(ID(2))).resolves.toEqual({ ok: true, party: two });
+
+    const saved: RaidParty = { ...two, saved: true, updatedAt: PARTY_NOW + MINUTE };
+    await expect(parties.saveBoth([{ party: changed }, { party: saved }])).resolves.toEqual([
+      true,
+      true,
+    ]);
+    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: changed });
+    await expect(parties.findById(ID(2))).resolves.toEqual({ ok: true, party: saved });
+  });
+
+  it('saves neither of two parties when a row is gone, and says which', async () => {
+    const one = testRaid({ id: ID(1) });
+    await parties.insert(one);
+    const changed: RaidParty = { ...one, saved: true };
+    await expect(
+      parties.saveBoth([{ party: changed }, { party: testRaid({ id: ID(5) }) }]),
+    ).resolves.toEqual([true, false]);
+    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: one });
+  });
+
+  it('saves neither of two parties when one could not be read back', async () => {
+    const one = testRaid({ id: ID(1) });
+    const two = testRaid({ id: ID(2) });
+    await parties.insert(one);
+    await parties.insert(two);
+    const faulty = withAttendees(two, {
+      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: 1.5 },
+    });
+    await expect(
+      parties.saveBoth([{ party: { ...one, saved: true } }, { party: faulty }]),
+    ).rejects.toThrow(/cannot be stored/);
+    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: one });
+  });
+
   it('refuses a second party for the same post, and a second row with the same id', async () => {
     await parties.insert(fullRaid(1));
     await expect(parties.insert({ ...fullRaid(1), id: ID(2) })).rejects.toThrow(/Duplicate/);
diff --git a/src/db/repositories/party-repository.ts b/src/db/repositories/party-repository.ts
index 4538be09b86fdb60763312e5e050fe1bb13245db..c581acb07951a92387a4c3c2f89196394139a57f 100644
--- a/src/db/repositories/party-repository.ts
+++ b/src/db/repositories/party-repository.ts
@@ -28,6 +28,12 @@ export interface PartyList {
   unreadable: UnreadableParty[];
 }
 
+/** One party of `saveBoth`, with what it adds to the party history. */
+export interface PartySave {
+  party: Party;
+  note?: HistoryNote;
+}
+
 /** What the party store needs from storage. */
 export interface PartyStorage {
   /**
@@ -40,6 +46,12 @@ export interface PartyStorage {
    * no such row (and writes no note).
    */
   save(party: Party, note?: HistoryNote): Promise<boolean>;
+  /**
+   * Writes two parties in one transaction, each as `save` does with its note: both or neither
+   * (`PartyStore.updateBoth`). Says, per party, whether its row is there; when one is not,
+   * neither is written and no note is.
+   */
+  saveBoth(writes: readonly [PartySave, PartySave]): Promise<[boolean, boolean]>;
   /** Every party that has not ended, oldest first. */
   listActive(): Promise<PartyList>;
   /** Those of these forum posts that are the post of a party that has ended. */
@@ -107,6 +119,34 @@ function changeable(party: Party) {
   };
 }
 
+/** Writes a party's changeable columns; false when there is no such row. */
+async function updateRow(
+  db: Kysely<DB>,
+  row: { id: string; values: ReturnType<typeof changeable> },
+): Promise<boolean> {
+  const result = await db
+    .updateTable('Party')
+    .set(row.values)
+    .where('id', '=', row.id)
+    .executeTakeFirst();
+  // The driver reports matched rows, so an unchanged row already counts; the look-up only
+  // tells a missing row from a present one when the count is zero.
+  if (result.numUpdatedRows > 0n) return true;
+  const found = await db
+    .selectFrom('Party')
+    .select('id')
+    .where('id', '=', row.id)
+    .executeTakeFirst();
+  return found !== undefined;
+}
+
+/** Thrown inside `saveBoth`'s transaction to roll it back when a row is gone. */
+class RowsMissing extends Error {
+  constructor(readonly found: [boolean, boolean]) {
+    super('A party of the pair is no longer in the database');
+  }
+}
+
 function listOf(rows: Selectable<PartyTable>[]): PartyList {
   const list: PartyList = { parties: [], unreadable: [] };
   for (const row of rows) {
@@ -175,22 +215,92 @@ export class PartyRepository implements PartyStorage {
   }
 
   save(party: Party, note?: HistoryNote): Promise<boolean> {
-    return this.withNote(note, async (db) => {
-      const result = await db
-        .updateTable('Party')
-        .set(changeable(party))
-        .where('id', '=', party.id)
-        .executeTakeFirst();
-      // The driver reports matched rows, so an unchanged row already counts; the look-up only
-      // tells a missing row from a present one when the count is zero.
-      if (result.numUpdatedRows > 0n) return true;
-      const row = await db
-        .selectFrom('Party')
-        .select('id')
-        .where('id', '=', party.id)
-        .executeTakeFirst();
-      return row !== undefined;
-    });
+    return this.withNote(note, (db) => updateRow(db, { id: party.id, values: changeable(party) }));
+  }
+
+  /**
+   * As `save` for two parties, in one transaction: both rows or neither (a row that is gone
+   * rolls the other one back too). Both documents are made before anything is written, so one
+   * that cannot be stored writes neither. The notes keep the guarantees of `withNote`: one that
+   * ends its party is written inside the transaction behind a savepoint of its own, rolled back
+   * alone when it fails and handed to `historyFailed` once the parties' writes have committed;
+   * when a failure takes the whole transaction with it (the savepoint is gone, and so is what
+   * the other note wrote), both parties' writes are run again alone, and every note that ends a
+   * party goes to `historyFailed` (with its own error when it had failed by itself before).
+   * Notes of steps alone follow the commit, one statement each.
+   */
+  async saveBoth(writes: readonly [PartySave, PartySave]): Promise<[boolean, boolean]> {
+    const [first, second] = writes;
+    const rows = [
+      { id: first.party.id, values: changeable(first.party) },
+      { id: second.party.id, values: changeable(second.party) },
+    ] as const;
+    const notes = [first.note, second.note].filter(
+      (note): note is HistoryNote =>
+        note !== undefined && (note.steps.length > 0 || note.end !== undefined),
+    );
+    const ending = notes.filter((note) => note.end !== undefined);
+    const both = async (db: Kysely<DB>): Promise<[boolean, boolean]> => {
+      const found: [boolean, boolean] = [
+        await updateRow(db, rows[0]),
+        await updateRow(db, rows[1]),
+      ];
+      if (!found[0] || !found[1]) throw new RowsMissing(found);
+      return found;
+    };
+    const { historyFailed } = this.options;
+    const failures: { note: HistoryNote; err: unknown }[] = [];
+    let lost: { err: unknown } | undefined;
+    let found: [boolean, boolean];
+    try {
+      try {
+        found = await inTransaction(this.db, async (trx) => {
+          const there = await both(trx);
+          for (const note of ending) {
+            await sql`savepoint party_history`.execute(trx);
+            try {
+              await this.history(trx).write(note);
+              await sql`release savepoint party_history`.execute(trx);
+            } catch (err) {
+              failures.push({ note, err });
+              try {
+                await sql`rollback to savepoint party_history`.execute(trx);
+              } catch {
+                lost = { err };
+                throw err;
+              }
+            }
+          }
+          return there;
+        });
+      } catch (err) {
+        if (lost === undefined) throw err;
+        found = await inTransaction(this.db, both);
+        const { err: cause } = lost;
+        // A note that had failed by itself keeps its own error; the others lost theirs with it.
+        failures.splice(
+          0,
+          failures.length,
+          ...ending.map((note) => ({
+            note,
+            err: failures.find((failure) => failure.note === note)?.err ?? cause,
+          })),
+        );
+      }
+    } catch (err) {
+      if (err instanceof RowsMissing) return err.found;
+      throw err;
+    }
+    for (const failure of failures) historyFailed(failure.note, failure.err);
+    for (const note of notes) {
+      if (note.end !== undefined) continue;
+      try {
+        await this.history(this.db).write(note);
+      } catch (err) {
+        historyFailed(note, err);
+      }
+    }
+    return found;
   }
 
   /**
diff --git a/src/services/party-store.test.ts b/src/services/party-store.test.ts
index 097374b4e688db7a5fed51055ef8df418495531b..8a24318b23b0e680a2ca3798fed77508e9cd133e 100644
--- a/src/services/party-store.test.ts
+++ b/src/services/party-store.test.ts
@@ -4,6 +4,7 @@ import {
   ALICE,
   at,
   BOB,
+  CAROL,
   MemoryPartyStorage,
   MINUTE,
   PARTY_NOW,
@@ -394,6 +395,220 @@ describe('PartyStore', () => {
     });
   });
 
+  describe('updateBoth', () => {
+    const two = (): [RaidParty, RaidParty] => [
+      testRaid({ id: ID(1) }),
+      testRaid({ id: ID(2), gymId: 2 }),
+    ];
+    /** Counts the storage's calls of each kind. */
+    function counted(storage: MemoryPartyStorage): { save: number; saveBoth: number } {
+      const calls = { save: 0, saveBoth: 0 };
+      const save = storage.save.bind(storage);
+      const saveBoth = storage.saveBoth.bind(storage);
+      storage.save = (party, note) => {
+        calls.save += 1;
+        return save(party, note);
+      };
+      storage.saveBoth = (writes) => {
+        calls.saveBoth += 1;
+        return saveBoth(writes);
+      };
+      return calls;
+    }
+
+    it('writes a change of two parties in one call of the storage, then has both in memory', async () => {
+      const { store, storage } = await partyStoreWith(two(), () => PARTY_NOW + 5 * MINUTE);
+      const calls = counted(storage);
+      const result = await store.updateBoth([ID(2), ID(1)], (second, first) => ({
+        parties: [second && join(BOB)(second).party, first && join(ALICE)(first).party] as const,
+        said: 'both',
+      }));
+      expect(calls).toEqual({ save: 0, saveBoth: 1 });
+      expect(result.written).toBe(true);
+      expect(result.said).toBe('both');
+      const [second, first] = result.parties;
+      expect(second).toMatchObject({ id: ID(2), updatedAt: PARTY_NOW + 5 * MINUTE });
+      expect(first?.attendees).toHaveProperty(ALICE);
+      expect(store.get(ID(1))).toBe(first);
+      expect(store.get(ID(2))).toBe(second);
+      expect(storage.rows.get(ID(1))).toBe(first);
+      expect(storage.rows.get(ID(2))).toBe(second);
+    });
+
+    it('writes neither when the write fails: both stay in memory as they were', async () => {
+      const [one, other] = two();
+      const { store, storage } = await partyStoreWith([one, other]);
+      const told: string[] = [];
+      store.onChange((_before, after) => told.push(after.id));
+      storage.failing = new Error('connection lost');
+      await expect(
+        store.updateBoth([ID(1), ID(2)], (a, b) => ({
+          parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
+        })),
+      ).rejects.toThrow('connection lost');
+      expect(store.get(ID(1))).toBe(one);
+      expect(store.get(ID(2))).toBe(other);
+      expect(told).toEqual([]);
+    });
+
+    it('writes neither when both parties of the pair would have the same post', async () => {
+      const [one, other] = two();
+      const { store, storage } = await partyStoreWith([one, other]);
+      const post = '300000000000000001';
+      await expect(
+        store.updateBoth([ID(1), ID(2)], (a, b) => ({
+          parties: [a && { ...a, forumPostId: post }, b && { ...b, forumPostId: post }] as const,
+        })),
+      ).rejects.toThrow('Duplicate entry');
+      expect(store.get(ID(1))).toBe(one);
+      expect(store.get(ID(2))).toBe(other);
+      expect(storage.rows.get(ID(1))).toBe(one);
+      expect(storage.writes).toEqual([]);
+    });
+
+    it('drops a party whose row is gone and writes neither', async () => {
+      const [one, other] = two();
+      const { store, storage } = await partyStoreWith([one, other]);
+      storage.rows.delete(ID(2));
+      await expect(
+        store.updateBoth([ID(1), ID(2)], (a, b) => ({
+          parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
+        })),
+      ).rejects.toThrow(`Party ${ID(2)} is no longer in the database`);
+      expect(store.get(ID(1))).toBe(one);
+      expect(storage.rows.get(ID(1))).toBe(one);
+      expect(store.get(ID(2))).toBeUndefined();
+    });
+
+    it('hands the change undefined for a party that is not active, and writes the other alone', async () => {
+      const [one] = two();
+      const { store, storage } = await partyStoreWith([one]);
+      const calls = counted(storage);
+      const seen: (Party | undefined)[] = [];
+      const result = await store.updateBoth([ID(1), ID(9)], (a, b) => {
+        seen.push(a, b);
+        return { parties: [a && join(ALICE)(a).party, b] as const };
+      });
+      expect(seen).toEqual([one, undefined]);
+      expect(result.written).toBe(true);
+      expect(result.parties[1]).toBeUndefined();
+      expect(store.get(ID(1))?.attendees).toHaveProperty(ALICE);
+      expect(calls).toEqual({ save: 1, saveBoth: 0 });
+      // A party for the one that is not active cannot be written.
+      await expect(
+        store.updateBoth([ID(1), ID(9)], () => ({
+          parties: [undefined, testRaid({ id: ID(9) })] as const,
+        })),
+      ).rejects.toThrow(`Party ${ID(9)} is not active`);
+    });
+
+    it('writes nothing for a change that changed nothing, and refuses what update refuses', async () => {
+      const [one, other] = two();
+      const { store, storage } = await partyStoreWith([one, other]);
+      await expect(
+        store.updateBoth([ID(1), ID(2)], (a, b) => ({ parties: [a, b] })),
+      ).resolves.toEqual({ parties: [one, other], written: false });
+      await expect(store.updateBoth([ID(1), ID(2)], () => ({}))).resolves.toEqual({
+        parties: [one, other],
+        written: false,
+      });
+      await expect(
+        store.updateBoth([ID(1), ID(2)], (a) => ({
+          parties: [a && { ...a, id: ID(3) }, undefined],
+        })),
+      ).rejects.toThrow('returned party');
+      const { timed, meetup } = testMeetup({ id: ID(2) });
+      await expect(
+        store.updateBoth([ID(1), ID(2)], (_a, b) => ({
+          parties: [
+            undefined,
+            b && { ...b, type: 'meetup', gymId: null, hatchTime: null, timed, meetup },
+          ] as [Party | undefined, Party | undefined],
+        })),
+      ).rejects.toThrow(`A change of raid ${ID(2)} returned a meetup`);
+      await expect(store.updateBoth([ID(1), ID(1)], () => ({}))).rejects.toThrow('two parties');
+      expect(storage.writes).toEqual([]);
+    });
+
+    it('takes both locks in one order: two pairs the other way round both finish', async () => {
+      const { store } = await partyStoreWith(two());
+      const pair = (ids: readonly [string, string], member: string) =>
+        store.updateBoth(ids, (a, b) => ({
+          parties: [a && join(member)(a).party, b && join(member)(b).party] as const,
+        }));
+      await Promise.all([pair([ID(1), ID(2)], ALICE), pair([ID(2), ID(1)], BOB)]);
+      for (const id of [ID(1), ID(2)]) {
+        expect(Object.keys(store.get(id)?.attendees ?? {})).toEqual([REPORTER, ALICE, BOB]);
+      }
+    });
+
+    it('makes a change of either party wait for the pair, and the pair for one before it', async () => {
+      const { store, storage } = await partyStoreWith(two());
+      let release: () => void = () => undefined;
+      const held = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      const saveBoth = storage.saveBoth.bind(storage);
+      storage.saveBoth = async (writes) => {
+        await held;
+        return saveBoth(writes);
+      };
+      const before = store.update(ID(2), join(CAROL));
+      const paired = store.updateBoth([ID(1), ID(2)], (a, b) => ({
+        parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
+      }));
+      const after = store.update(ID(1), join(BOB));
+      release();
+      await Promise.all([before, paired, after]);
+      expect(Object.keys(store.get(ID(1))?.attendees ?? {})).toEqual([REPORTER, ALICE, BOB]);
+      expect(Object.keys(store.get(ID(2))?.attendees ?? {})).toEqual([REPORTER, CAROL, ALICE]);
+      expect(storage.writes.map((party) => party.id)).toEqual([ID(2), ID(1), ID(2), ID(1)]);
+    });
+
+    it('tells the listeners once both are written and in memory', async () => {
+      const { store } = await partyStoreWith(two());
+      const seen: string[] = [];
+      store.onChange((before, after) => {
+        const other = store.get(after.id === ID(1) ? ID(2) : ID(1));
+        seen.push(
+          `${after.id.at(-1) ?? ''}: ${Object.keys(before?.attendees ?? {}).length} -> ` +
+            `${Object.keys(after.attendees).length}, other ${Object.keys(other?.attendees ?? {}).length}`,
+        );
+      });
+      await store.updateBoth([ID(1), ID(2)], (a, b) => ({
+        parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
+      }));
+      expect(seen).toEqual(['1: 1 -> 2, other 2', '2: 1 -> 2, other 2']);
+    });
+
+    it('notes each write for the history, and takes an ended party out of memory', async () => {
+      const notes: unknown[] = [];
+      const storage = new MemoryPartyStorage(two());
+      const { log } = createTestLogger();
+      const store = new PartyStore({
+        storage,
+        log,
+        history: {
+          noteOf: (write) => {
+            notes.push({ party: write.after.id, before: write.before?.status, ended: write.ended });
+            return undefined;
+          },
+        },
+      });
+      await store.load();
+      await store.updateBoth([ID(1), ID(2)], (a, b) => ({
+        parties: [a && join(ALICE)(a).party, b && endParty(b)] as const,
+        ended: [undefined, { how: 'cancelled' }] as const,
+      }));
+      expect(notes).toEqual([
+        { party: ID(1), before: 'active', ended: undefined },
+        { party: ID(2), before: 'active', ended: { how: 'cancelled' } },
+      ]);
+      expect(store.get(ID(2))).toBeUndefined();
+      expect(storage.rows.get(ID(2))).toMatchObject({ status: 'ended' });
+    });
+  });
+
   describe('addRaidUnlessTaken', () => {
     it('stores one raid when two reports of a gym come at the same moment', async () => {
       const { store, storage } = await partyStoreWith();
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index b091337a019c30d4726b0be4b33abcfc35133cc7..471f71a7a274488ea5cb11f84d55fc0e9d7b004f 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -1,4 +1,4 @@
-import type { PartyForum, PartyStorage } from '../db/repositories/party-repository.js';
+import type { PartyForum, PartySave, PartyStorage } from '../db/repositories/party-repository.js';
 import type { HistoryNote, PartyEnd, PartyWrite } from '../domain/history/party-history.js';
 import { isRaid, type Party, type RaidParty } from '../domain/party/party.js';
 import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
@@ -35,6 +35,16 @@ export interface PartyStoreOptions {
   history?: { noteOf(write: PartyWrite): HistoryNote | undefined };
 }
 
+/**
+ * What a change of two parties at once returns (`PartyStore.updateBoth`): the parties as
+ * changed, in the order of the ids, undefined (or the very party it was given) for one it
+ * leaves alone; and for one it ends, why (`ended`, as a change of `update` says it).
+ */
+export interface PairChange {
+  parties?: readonly [Party | undefined, Party | undefined];
+  ended?: readonly [PartyEnd | undefined, PartyEnd | undefined];
+}
+
 /** Why `add` refused a party: its region is being removed, or is gone (`closeRegion`). */
 export class RegionClosedError extends Error {
   constructor(readonly regionId: number) {
@@ -51,8 +61,9 @@ export type PartyListener = (before: Party | undefined, after: Party) => void;
 
 /**
  * The active parties in memory, with the database behind them. Every change goes through
- * `update`, which runs one change at a time per party, writes the row first and only then
- * replaces the party in memory: what handlers read is always what is stored.
+ * `update` (or `updateBoth`, for two parties at once), which runs one change at a time per
+ * party, writes the row first and only then replaces the party in memory: what handlers read
+ * is always what is stored.
  */
 export class PartyStore implements PartyProvider {
   private readonly parties = new Map<string, Party>();
@@ -281,6 +292,87 @@ export class PartyStore implements PartyProvider {
     });
   }
 
+  /**
+   * Applies one change to two active parties at once, written in one transaction: both or
+   * neither (`PartyStorage.saveBoth`; a train's split, `PartyService.splitTrain`). `change` gets
+   * both parties as they are now, in the order of `ids`, undefined for one that is not active
+   * (it decides what that means), and returns `parties` in the same order: undefined, or the
+   * very party it was given, for one it leaves alone. The rules of `update` hold for each: the
+   * same id and kind, stamped with the time, its note for the history (`ended` per party), an
+   * ended party out of memory. Memory is replaced only once the write has committed, both
+   * parties before the listeners are told of either. When the write fails, both stay in memory
+   * as they were and the error is the caller's; a party whose row is gone leaves memory, and
+   * neither is written. When only one party changes, it is written as `update` writes it.
+   * The result is what `change` returned, with `parties` as stored now (as given for one left
+   * alone) and `written`: whether anything was written.
+   *
+   * Both parties' locks are taken, always in the order of their ids, so two such changes never
+   * wait for each other the other way round, and a change of either party waits for this one,
+   * as this one waits for those before it. The lock is not re-entrant, and nothing inside takes
+   * either lock again: `change` is synchronous (it may read the store, which takes no lock),
+   * the storage does not call the store, and the listeners are synchronous too (what they start
+   * on the side queues behind and runs once both locks are free).
+   */
+  async updateBoth<R extends PairChange>(
+    ids: readonly [string, string],
+    change: (first: Party | undefined, second: Party | undefined) => R,
+  ): Promise<
+    Omit<R, 'parties'> & { parties: [Party | undefined, Party | undefined]; written: boolean }
+  > {
+    const parties = this.all;
+    const [one, two] = ids;
+    if (one === two) throw new Error(`A change of two parties was given party ${one} twice`);
+    const [low, high] = one < two ? [one, two] : [two, one];
+    return this.locks.run(low, () =>
+      this.locks.run(high, async () => {
+        const current: [Party | undefined, Party | undefined] = [
+          parties.get(one),
+          parties.get(two),
+        ];
+        const result = change(current[0], current[1]);
+        const writes: { index: 0 | 1; before: Party; after: Party; note?: HistoryNote }[] = [];
+        for (const index of [0, 1] as const) {
+          const id = ids[index];
+          const before = current[index];
+          const changed = result.parties?.[index];
+          if (changed === undefined || changed === before) continue;
+          if (before === undefined)
+            throw new Error(`Party ${id} is not active: nothing is written`);
+          if (changed.id !== id)
+            throw new Error(`A change of party ${id} returned party ${changed.id}`);
+          if (changed.type !== before.type)
+            throw new Error(`A change of ${before.type} ${id} returned a ${changed.type}`);
+          const after: Party = { ...changed, updatedAt: Math.max(this.now(), before.updatedAt) };
+          const ended = result.ended?.[index];
+          const note = this.noteOf({ before, after, ...(ended ? { ended } : {}) });
+          writes.push({ index, before, after, ...(note ? { note } : {}) });
+        }
+        const [first, second] = writes;
+        if (!first) return { ...result, parties: current, written: false };
+        const { storage } = this.options;
+        const saved = ({ after, note }: (typeof writes)[number]): PartySave => ({
+          party: after,
+          ...(note ? { note } : {}),
+        });
+        const found: readonly boolean[] = second
+          ? await storage.saveBoth([saved(first), saved(second)])
+          : [await storage.save(first.after, first.note)];
+        const gone = writes.filter((_write, n) => found[n] !== true).map((write) => write.after.id);
+        if (gone.length > 0) {
+          for (const id of gone) parties.delete(id);
+          throw new Error(`Party ${gone.join(', ')} is no longer in the database`);
+        }
+        for (const { index, after } of writes) {
+          if (after.status === 'active') parties.set(after.id, after);
+          else parties.delete(after.id);
+          current[index] = after;
+        }
+        for (const { before, after } of writes) this.announce(before, after);
+        return { ...result, parties: current, written: true };
+      }),
+    );
+  }
+
   /**
    * What a write adds to the party history; nothing when there is no history, or when making
    * the note fails (logged: the party's own write goes on).
diff --git a/test/support/parties.ts b/test/support/parties.ts
index 652fe11866442822bff43b6ce4360b46bd8b0d5f..c9a4b7d79275d8a18f643350d702338aaf0ffa3b 100644
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -4,6 +4,7 @@ import { loadSettings } from '../../src/config/settings.js';
 import type {
   PartyForum,
   PartyList,
+  PartySave,
   PartyStorage,
 } from '../../src/db/repositories/party-repository.js';
 import type { HistoryNote } from '../../src/domain/history/party-history.js';
@@ -188,14 +189,14 @@ function survivesStorage(party: Party): void {
  * `PartyRepository`, whose behaviour party-repository.db.test.ts pins down: a second row with
  * the same id or the same post is refused (by `save` too, not counting the row itself), and
  * `save` says whether the row exists. It keeps the objects themselves, but it does notice what
- * would not survive the real state document: every `insert` and `save` runs the party through
- * the writers and the reader and rejects when what comes back is not the party given. Set
- * `failing` to make every call reject.
+ * would not survive the real state document: every `insert`, `save` and `saveBoth` runs the
+ * party through the writers and the reader and rejects when what comes back is not the party
+ * given. Set `failing` to make every call reject.
  */
 export class MemoryPartyStorage implements PartyStorage {
   failing: Error | undefined;
   readonly rows = new Map<string, Party>();
-  /** Every party written, in order: `insert` and `save` calls. */
+  /** Every party written, in order: `insert`, `save` and `saveBoth` calls. */
   readonly writes: Party[] = [];
   /** Where the notes of the party history go, as `PartyRepository` writes them with the party. */
   history: MemoryHistory | undefined;
@@ -254,6 +255,38 @@ export class MemoryPartyStorage implements PartyStorage {
     });
   }
 
+  /**
+   * Both parties or neither, as the repository's transaction: a row that is gone, a party that
+   * would not survive storage or a post taken writes neither; the notes follow both writes.
+   */
+  saveBoth(writes: readonly [PartySave, PartySave]): Promise<[boolean, boolean]> {
+    return this.attempt((): [boolean, boolean] => {
+      const found: [boolean, boolean] = [
+        this.rows.has(writes[0].party.id),
+        this.rows.has(writes[1].party.id),
+      ];
+      if (!found[0] || !found[1]) return found;
+      for (const { party } of writes) {
+        survivesStorage(party);
+        if (this.postTaken(party)) throw new Error('Duplicate entry');
+      }
+      // The unique key holds between the two as well.
+      const [first, second] = writes;
+      if (
+        first.party.forumPostId !== null &&
+        first.party.forumPostId === second.party.forumPostId
+      ) {
+        throw new Error('Duplicate entry');
+      }
+      for (const { party } of writes) {
+        this.rows.set(party.id, party);
+        this.writes.push(party);
+      }
+      for (const { note } of writes) this.noted(note);
+      return found;
+    });
+  }
+
   /** Writes a note after its party, as the repository does behind a savepoint. */
   private noted(note: HistoryNote | undefined): void {
     if (note === undefined || this.history === undefined) return;
````

### Task 2: Plan 8T-F T2: Train split: both trains in one write, no window between them (8T-F-2)

Prototype commit: `3497f1061ebdee140c96e248e1460dfe770478c2`

splitNow changes both trains through PartyStore.updateBoth: the old
train loses the group and the new train, as it is then, is carried over
and settled in one transaction. A failed write takes the new train back;
the retry of the carry-over and the settling as the old train says are
gone. A train still pending means its write never committed: it is taken
back (one its old train lists, which only 8T's first build could leave,
is settled as it is and logged). splitSettled loses its old train and
the drop rule; trains.md, history.md, testing.md, the 8T staging
checklist and the comments say so.

**Files:**

```
 docs/architecture/history.md                            |   2 +-
 docs/architecture/testing.md                            |   2 +-
 docs/architecture/trains.md                             |   6 +-
 docs/superpowers/plans/2026-10-17-phase-8t-staging.md   |   4 +-
 docs/superpowers/specs/2026-10-17-train-split-design.md |   2 +-
 src/app.ts                                              |   6 +-
 src/domain/party/party.ts                               |   7 +-
 src/domain/party/train-split.test.ts                    |  33 -----
 src/domain/party/train.ts                               |  26 +---
 src/services/party-scheduler.ts                         |  16 ++-
 src/services/party-service.ts                           | 155 +++++++++-----------
 src/services/train-split.test.ts                        | 280 ++++++++++++++++++++++--------------
 12 files changed, 264 insertions(+), 275 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/party/train-split.test.ts src/services/train-split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3497f1061ebdee140c96e248e1460dfe770478c2 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-f-split-transaction.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T-F T2: Train split: both trains in one write, no window between them (8T-F-2)`, the body above and the trailer, staging exactly
  `docs/architecture/history.md docs/architecture/testing.md docs/architecture/trains.md docs/superpowers/plans/2026-10-17-phase-8t-staging.md docs/superpowers/specs/2026-10-17-train-split-design.md src/app.ts src/domain/party/party.ts src/domain/party/train-split.test.ts src/domain/party/train.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/train-split.test.ts`.

````diff
diff --git a/docs/architecture/history.md b/docs/architecture/history.md
index 80bac197f1384cf69057e2127403872c48fff539..1b8301ad33048805703627d9ce55841b1852d4e7 100644
--- a/docs/architecture/history.md
+++ b/docs/architecture/history.md
@@ -25,7 +25,7 @@ How a party ended (`ending`): `completed` whenever it took place (somebody compl
 - A record takes along only parties it went on from that have ended, locked first, and never walks past one that has not: a move that failed (the old raid stayed) leaves the old raid to its own record. Raids that moved before migration 018 have no `from` step: the old and the new party are each recorded, so such a raid counts twice.
 - A change that ends a party says why with `ended` in its result (`PartyEnd`): the scheduler `clock`; `PartyService.end` `cancelled` unless told otherwise; a deleted post `cancelled`; a raid that moved to another region `moved`; a party that never had its post `failed`, which is dropped. A change that says nothing is recorded as `unknown`. A raid that moved goes on as a new party whose first step (`from`) names the old one (and the old one's end writes it again): the new party's record takes the old one's steps and row along (one record, with the times from before the move; `createdAt` stays), and nothing records the old one by itself.
 - Members, the maker and the conductor are named as their opt-ins are when the record is written.
-- A train a group was split off (plan 8T) is recorded on its own, and so is the train the group became (`splitFromId` names the old one). A write that adds a split to `train.splitOff` notes who left in it as `split`, not `left` (`partySteps`): they are attendees of the old train up to the split (`leftAt` the split, `status` null, `splitOff` 1) and not `departed`. The new train is stored with its post before the old train loses the group, and is `pending` until the write that carries the group over (`train.splitFrom.pending`, `trains.md`): `partySteps` notes nothing of it while it is pending, and the write that settles it as if the train were new then. So its history starts at the split and holds nobody who never was on it (a member who left the group while the new post was made): its members sign up then (`joinedAt`, `hereAt` then for who is coming or here), its first stop is where it was split (reached at its start when split before it), and its record's `createdAt` is its first step, the split (the `Party` row's `createdAt` is when it was made, the time its post took before). A pending train that ends, or is taken back, is dropped (`drop`), as one that failed. A member who rode both counts in both.
+- A train a group was split off (plan 8T) is recorded on its own, and so is the train the group became (`splitFromId` names the old one). A write that adds a split to `train.splitOff` notes who left in it as `split`, not `left` (`partySteps`): they are attendees of the old train up to the split (`leftAt` the split, `status` null, `splitOff` 1) and not `departed`. The new train is stored with its post before the old train loses the group, and is `pending` until the one write of both trains (`PartyStore.updateBoth`: the old train's loss of the group and the new train's carry-over in one transaction, each with its note; `train.splitFrom.pending`, `trains.md`): `partySteps` notes nothing of it while it is pending, and the write that settles it as if the train were new then. So its history starts at the split and holds nobody who never was on it (a member who left the group while the new post was made): its members sign up then (`joinedAt`, `hereAt` then for who is coming or here), its first stop is where it was split (reached at its start when split before it), and its record's `createdAt` is its first step, the split (the `Party` row's `createdAt` is when it was made, the time its post took before). A pending train that ends, or is taken back, is dropped (`drop`), as one that failed. A member who rode both counts in both.
 - Tests: `partyServiceWith()` records into `MemoryHistory` (`history`: `records`, `steps`, `posts`, `optIn(guildRow, member)`, `failing`; it shares the memory storage's rows and deletes them as the repository does) through `recorder` (`flush()` runs the tries that wait; over the database its tries go to `kept.historyStorage`; `sweep()` reads the storage's rows, and those in `storage.unreadable` as unreadable; the scheduler's upkeep runs it; `historySweepProgressEvery` sets its progress lines); `history-recording.db.test.ts` pins the repository; a `PartyRepository` in a test that expects no failure takes `HISTORY_MUST_NOT_FAIL`.
 
 ## The opt-in
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 5ac956a3a344fdddf35ccbc6eb420a25150eb871..dc62039b32fb1d30c62dba6dc6c20de42ed27318 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -42,7 +42,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Trains
 
-- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`). Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`. A split (plan 8T) goes through `made.trains.split` (the service's `splits` is the party service); what happens while the new post is made is tested by holding `gateway.createPost` (`holdPost` in `train-split.test.ts`, as the relocate tests do; it moves the clock on as making a post takes time), what happens between the new post and the old train's change by holding a write of the old train (`holdOldTrain`), a failed write by `failingSaves`, and a stop in between by `restarted(made)` and `settlePendingSplits()`; a train's ids sort by `createdAt` and then id, so a test finds the new train by its id, not by its place in `store.active()`.
+- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`). Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`. A split (plan 8T) goes through `made.trains.split` (the service's `splits` is the party service); what happens while the new post is made is tested by holding `gateway.createPost` (`holdPost` in `train-split.test.ts`, as the relocate tests do; it moves the clock on as making a post takes time), what happens between the new post and the paired write of both trains by holding a write of the old train (`holdOldTrain`: the new train's id is made to sort after the old one's, or before it, which decides whose lock `updateBoth` takes first), a failed paired write by `failingPairs` (and a failed save by `failingSaves`), and a stop before the paired write by both, `restarted(made)` and `settlePendingSplits()`; a train's ids sort by `createdAt` and then id, so a test finds the new train by its id, not by its place in `store.active()`.
 
 ## Wayfarer
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index dd35197dff667f06c34a0972d1c091ee5b17b414..a8066365249a58dd8905834ac036761b4a950c49 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -25,9 +25,9 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 ## Splitting a group off
 
 - A group of a train can become a train of its own (plan 8T; spec `2026-10-17-train-split-design.md`; Matt, 2026-10-17: faster players go on at their own pace instead of per-group positions on one train). Who may is `mayNotSplit` in `train.ts`, beside `mayNotArrange`: never a train of one group (`one-group`), one without a post yet (`unposted`: the new train links to it), a group it does not have (`no-such-group`), an empty one (`empty-group`) or one that everybody on the train is in (`whole-train`, Matt, 2026-10-17: the old train would be left empty; the words name the group, `Everybody on this train is in group B (Fast): there is nothing to split it from.`, `splitRefusal`); staff and the conductor any other group; a member of the group (any status) their own (`not-in-group`, "Only a group's members, the conductor and the moderators can split a group off.") unless the conductor is in it (`conductor-in-group`). `splittableGroups` is what the menu and the autocomplete offer; `splitsPossible` (two groups or more with somebody in them) whether the post shows the button.
-- The pure parts (`train.ts`): `splitTrain(old, { id, by, anonymous, group, now })` is the new train: `<old name> (<label or letter>)` cut to `MAX_PARTY_NAME` (the group keeps at least half of the room), the same server and region, route, stop, `finishedFrom`, mode, boss, start and end (through `withTrain`), one group A with the group's label, the group's members as they are in A, made now by the presser (named unless their privacy is Anonymous; `makerName` is noted by the service), led by the old conductor who goes with the group, else the presser in it, else nobody, with `train.splitFrom` (the old party and post, `pending: true`). `splitOffGroup(old, member, staff, group, link, drawn?)` is the old train without the group and its members: the other groups keep their letters, the newest left takes new sign-ups when the newest went, its conductor stays unless they went, `train.splitOff` gains `{ partyId, postId, group, label? }` newest first (at most `MAX_SPLITS_KEPT`, 10); it answers the members who moved (`moved`), the group, who leads the new train and the old train as it was then (`was`: its train part, start and end). `drawn` is the group's mark as the confirmation showed it (`groupMark`, FNV-1a in base 36 of the label and the party id of the newest `splitOff`): refused `group-changed` when the label changed, the group went, or another group was split off since, so a letter given again (even with the same label) is never taken for the group that had it. `splitDrawn(train, group, mark)` is the split a stale mark was drawn for when that very group is the one split off last. `carriedSplit(target, start, moved, conductor, was?, now?)` brings the new train in line with the group as it was at the split, and with the old train's place and times then unless they were changed on the new train meanwhile (as for the conductor); the very same train when that changes nothing. `splitSettled(train, old?)` clears `pending`; with the old train it also drops who is still on it with the record the new train was made with (but for the group); when its conductor is one of them, the lead falls as at the split, to the presser while still on it, else to nobody. A group opened after a split takes a letter that no group has and no split named, the first after the last in use, else the first such; when every free letter was a split's, the first free one (`nextGroupId`, `attendance.ts`): a letter can come again only then, and the mark keeps a stale confirmation from taking the new group for the old.
-- `PartyService.splitTrain` (`ctx.trains.split`, `TrainService.split`, which adds the lines) does it as `relocate` does a raid's move, one split of a train at a time: refusals known at once are answered before anything is made (`no-forum` also when the region's forum is not the old train's); the new train is stored, pending, and gets its post in the same forum (`createTracked`: link line, summary, region copies follow; no new-train DMs); then the old train loses the group inside the store, which decides anew; a refusal there (the presser left, the label changed, a second split), an old train that ended, a new train that ended meanwhile (its post deleted: `no-post`), or a failure takes the new train back (`takeBack`: its post and link line deleted, dropped from the history as never having been a party). Who is in the group at the moment of that change goes: a Leave or a Join on the old post while the new post was made counts, and the carry-over write (`carriedSplit`, then `splitSettled`) drops from the new train who left the group, adds who joined it, keeps what members did on the new post meanwhile (who left the new train stays out), puts it where the old train was at the split (a Next or a route edit meanwhile) and settles it. Nobody is in both trains or in neither once it settles. The old post is never deleted or replaced: it is re-rendered without the group and with its small print (its region copies too), and gets its line.
-- The window, as `relocate` documents its own: a carry-over write that fails is tried once more; when that fails too, the new train is settled as the old train says (`settleSplit`, logged as an error), and stays pending when even that write fails. A stop of the process between the new post and the carry-over leaves the new train pending too (`train.splitFrom.pending`, in the state document). `settlePendingSplits` settles them, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any. A pending train whose old train lists it in `splitOff` is settled with its members as stored, without those still on the old train as the new one was made with them (`splitSettled(train, old)`: they changed group while the new post was made, and stayed); one whose old train is no longer active is settled as it is (the group is on no other train); one whose old train is active and does not list it (it never lost the group) is taken back. Then a member who left the train while the new post was made is on the new one (it was stored with them), and one who joined the group on neither (they went with the group, and the new train was stored before): the window is one database write wide.
+- The pure parts (`train.ts`): `splitTrain(old, { id, by, anonymous, group, now })` is the new train: `<old name> (<label or letter>)` cut to `MAX_PARTY_NAME` (the group keeps at least half of the room), the same server and region, route, stop, `finishedFrom`, mode, boss, start and end (through `withTrain`), one group A with the group's label, the group's members as they are in A, made now by the presser (named unless their privacy is Anonymous; `makerName` is noted by the service), led by the old conductor who goes with the group, else the presser in it, else nobody, with `train.splitFrom` (the old party and post, `pending: true`). `splitOffGroup(old, member, staff, group, link, drawn?)` is the old train without the group and its members: the other groups keep their letters, the newest left takes new sign-ups when the newest went, its conductor stays unless they went, `train.splitOff` gains `{ partyId, postId, group, label? }` newest first (at most `MAX_SPLITS_KEPT`, 10); it answers the members who moved (`moved`), the group, who leads the new train and the old train as it was then (`was`: its train part, start and end). `drawn` is the group's mark as the confirmation showed it (`groupMark`, FNV-1a in base 36 of the label and the party id of the newest `splitOff`): refused `group-changed` when the label changed, the group went, or another group was split off since, so a letter given again (even with the same label) is never taken for the group that had it. `splitDrawn(train, group, mark)` is the split a stale mark was drawn for when that very group is the one split off last. `carriedSplit(target, start, moved, conductor, was?, now?)` brings the new train in line with the group as it was at the split, and with the old train's place and times then unless they were changed on the new train meanwhile (as for the conductor); the very same train when that changes nothing. `splitSettled(train)` clears `pending`. A group opened after a split takes a letter that no group has and no split named, the first after the last in use, else the first such; when every free letter was a split's, the first free one (`nextGroupId`, `attendance.ts`): a letter can come again only then, and the mark keeps a stale confirmation from taking the new group for the old.
+- `PartyService.splitTrain` (`ctx.trains.split`, `TrainService.split`, which adds the lines) does it as `relocate` does a raid's move, one split of a train at a time: refusals known at once are answered before anything is made (`no-forum` also when the region's forum is not the old train's); the new train is stored, pending, and gets its post in the same forum (`createTracked`: link line, summary, region copies follow; no new-train DMs); then both trains change in one write (`PartyStore.updateBoth([old, new], …)`, one transaction: both or neither), which decides anew; a refusal there (the presser left, the label changed, a second split), an old train that ended, a new train that ended meanwhile (its post deleted: `no-post`), or a failed write takes the new train back (`takeBack`: its post and link line deleted, dropped from the history as never having been a party). In that write the old train loses the group (`splitOffGroup`, the presser noted first), and who is in the group at that moment goes: a Leave or a Join on the old post while the new post was made counts; the new train, as it is then, is brought in line (`carriedSplit`, then `splitSettled`): it drops who left the group, adds who joined it, keeps what members did on the new post meanwhile (who left the new train stays out), is put where the old train was at the split (a Next or a route edit meanwhile) and is settled. A press on the new post while that write waits for the old train's lock goes before it or after it, as the order of the two ids puts the locks (`updateBoth` takes them in that order); either way it counts. Nobody is in both trains or in neither once it settles. The old post is never deleted or replaced: it is re-rendered without the group and with its small print (its region copies too), and gets its line.
+- No window between the writes: the old train's loss of the group and the new train's carry-over commit together or not at all, so nobody can end on both trains or on neither. What is left is the new post of a split whose write never committed: a stop of the process after the new post and before the write, or a failed write whose take-back could not end the new train. It stays pending (`train.splitFrom.pending`, in the state document) while the old train still has the group, and `settlePendingSplits` takes it back, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any; one it could not end stays pending for the next try and is not counted. A pending train whose old train lists it in `splitOff` cannot come of this code (only 8T's first build, which wrote the two trains one after the other, could leave one); it is settled as it is stored and logged as an error, since the group is on no other train. A commit whose acknowledgement is lost (the connection drops after MySQL committed) is the same rare risk as for any `update`: the split's take-back then ends the new train although the old one lost the group, which leaves the group on neither train in the database (memory still has it on the old train) until the old train's next write stores it again; accepted.
 - Then the old post says `<doer> split group B (Fast) off into a train of its own.` (a line, no ping) and the new post `<doer> split this train off with group B (Fast).`, pinging the members who moved and allow `mentions`, never the presser (`doer`: a maker who asked not to be named is not; `This train was split off with …` then).
 - The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "✂️ Split group…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out) stands in the row of Move train… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 40 components with `postMessage`'s fold of four groups' details (44 unfolded).
 - The confirmation (`splitConfirmation`, `src/render/train-split.ts`; handlers `openSplit`, `pressSplit`, `cancelSplit`, `pickSplit` and `/group split` in `src/commands/trains/split.ts`): a private components-v2 message of `TRAIN_PANEL_COLOUR`, `### Split a group off the train`, what becomes of the group, the same route and stop, who moves (ten names and how many more), who leads which train, a menu of the groups when the member may split more than one (`party:<id>:splitpick`), "✂️ Split it off" (danger, `party:<id>:splitgo:<group>:<mark>`) and "Cancel" (`party:<id>:splitno`). "Split it off" first updates the confirmation to a note without controls (`Splitting group B (Fast) off…`, `splitNote`: nothing more can be pressed on it while the new post is made), then edits in the outcome: `Split off: <#post>`; a refusal draws the confirmation anew with the reason when the member may still split a group, else the reason alone; a train that ended meanwhile `This train is over.` A second press of the same confirmation waits for the first (one split of a train at a time) and is refused `group-changed`; `splitDrawn` sees that very group went, and it says `Split off: <#post>` too (`kind: 'already'`). The words are `splitGroupAs` (`train-changes.ts`), the code path the map can call later; `/group split letter:` answers with the same confirmation, its autocomplete only the groups the member may split.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8t-staging.md b/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
index d44510e01b1a7cfac183d53bb8e82766cf3b0cf2..c7fe30f130a2fa2f56d1ce1b98b5f50fc58e0bfc 100644
--- a/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
+++ b/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
@@ -6,7 +6,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 1. `/group` has a new subcommand `split`: register the commands again, only on Matt's go-ahead (`npm run deploy-commands -- --global`, or `./pine deploy-commands --global` in the stack; the dev application is registered globally only). A client may need a restart (Ctrl+R) to show it.
 2. Migration 020 runs when the bot starts (or `npm run migrate`). Stage this only on a branch that has 8S-1's 019 too (merged first, or merged before staging): Kysely refuses a migration that sorts before one already run, so a dev database that ran 020 without 019 refuses 019 later ("previously executed migration ... is missing" the other way round). If that happens: stop the bot; in the dev database, `delete from kysely_migration where name = '2026_10_17_020_train_split';`; start the bot again (or `npm run migrate`) on the branch with both, so that 019 runs and then 020 again. Running 020 again does nothing when its columns and its index exist (each is added only when missing). This is the way out `docs/architecture/trains.md` ("Saved routes") gives for 013 run before 012. Check `kysely_migration` lists 018, 019, 020; `describe PartyHistory` shows `splitFromId char(36)` after `routeStops`, `show index from PartyHistory` an index `partyhistory_splitfromid_index` on it, and `describe PartyHistoryAttendee` shows `splitOff tinyint(1) NOT NULL default 0` after `leftAt`.
-3. The party document is version 11 (a train's splits; the new train of a split carries `splitFrom.pending: true` until the group is carried over, a moment after its post is made). Once the bot has written a version 11 document, a bot from before this plan cannot read that party (any party it wrote, not only trains): do not go back to an older branch on the dev database while a party written by this one is active. Migration 020 is additive: older code runs on the database as before.
+3. The party document is version 11 (a train's splits; the new train of a split carries `splitFrom.pending: true` from its making until the one write of both trains commits (the old train loses the group, the new one is made to match), a moment after its post is made; one still pending at start is taken back). Once the bot has written a version 11 document, a bot from before this plan cannot read that party (any party it wrote, not only trains): do not go back to an older branch on the dev database while a party written by this one is active. Migration 020 is additive: older code runs on the database as before.
 
 ## A train before its start, split by a group member (no conductor)
 
@@ -46,7 +46,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 22. A train with a stop in another region, split: the new train has its copy in that region's channel, without Move train… and without Split group…; the old copy keeps its small print.
 23. The live map shows both trains, each at its stop, with its own members; joining the new one from the map works.
 24. Split the same train a second time (a new group, split): the old post lists two lines, newest first.
-25. Restart the bot: both posts are as before (version 11 read back), the buttons work; the log has no "settled the new trains of splits that were left pending" (nothing was pending). In the dev database no active train is left pending (`select id from Party where status = 'active' and json_extract(state, '$.train.splitFrom.pending') is not null` returns nothing).
+25. Restart the bot: both posts are as before (version 11 read back), the buttons work; the log has no "settled or took back the new trains of splits that were left pending" (nothing was pending; were there one, it would be taken back, `takenBack: 1`, its post deleted). In the dev database no active train is left pending (`select id from Party where status = 'active' and json_extract(state, '$.train.splitFrom.pending') is not null` returns nothing).
 26. End both trains of step 7 (`/delete`, or let the clock end them): in the dev database, the old train's `PartyHistory` row has `splitFromId` null and counts Dawn as an attendee but not `departed`; her `PartyHistoryAttendee` row there has `status` null, `leftAt` the split and `splitOff` 1 (every other row `splitOff` 0); the new train's row has `splitFromId` = the old train's `partyId`, its `createdAt` the split (a few seconds after the new post was asked for), and Dawn's `signedUpAt` the split too. No `PartyHistoryStep` row of either train is left.
 
 ## Help and phone
diff --git a/docs/superpowers/specs/2026-10-17-train-split-design.md b/docs/superpowers/specs/2026-10-17-train-split-design.md
index 319aa9a7d4e7d8cb19423e99352c9d85ce735a54..118b8feef78e371a14648e5df293529fdfb3da8e 100644
--- a/docs/superpowers/specs/2026-10-17-train-split-design.md
+++ b/docs/superpowers/specs/2026-10-17-train-split-design.md
@@ -84,7 +84,7 @@ One components-v2 message (`v2.ts`), like the Move train panel:
 
 ## Atomicity (constraint, approach left to the builder)
 
-Two parties change: the new one is created and gets its post, the old one loses a group. The store changes one party at a time. The builder chooses the order and the take-back, as `PartyService.relocate` does for a raid moving region (new party first, `takeBack` when the old change fails). What must hold: nobody is in both trains or in neither once it settles; the old train is never left without its post; a failure leaves the old train as it was and no stray new post.
+Two parties change: the new one is created and gets its post, the old one loses a group. The store changes one party at a time. The builder chooses the order and the take-back, as `PartyService.relocate` does for a raid moving region (new party first, `takeBack` when the old change fails). What must hold: nobody is in both trains or in neither once it settles; the old train is never left without its post; a failure leaves the old train as it was and no stray new post. Plan 8T-F writes both trains in one transaction (`PartyStore.updateBoth`): the old train's loss of the group and the new train's carry-over commit together, so the only recovery left is taking back a new post whose split never committed.
 
 ## Constraints
 
diff --git a/src/app.ts b/src/app.ts
index 187ab7117e4c79ef012682cc4b8305d7b0785e22..4fbb408a227ef80159d380f94d585846ebe574d7 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -801,9 +801,9 @@ export async function startApp(
     ),
   );
   log.info({ features }, 'optional features');
-  // The new trains of splits that a stop left pending (plan 8T): settled or taken back once
-  // Discord is there, for taking one back deletes its post (those that failed writes left pending
-  // in the process go with the clock's upkeep).
+  // The new trains of splits that a stop left pending (plan 8T: their post made, the split's
+  // write never committed): taken back once Discord is there, for taking one back deletes its
+  // post (one left pending in the process goes with the clock's upkeep).
   void connected.then(() =>
     partyService
       .settlePendingSplits()
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index b322172249498775bf36b74c555d004905ba3bf3..d44c8d76bab7dd39b526b5c58c411b90a3c3293f 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -288,9 +288,10 @@ export interface TrainLink {
 
 /**
  * The train a train was split off from (plan 8T). `pending` while the split is not settled: the
- * new train is stored and has its post, the old one may not have lost the group yet. The write
- * that carries the group over clears it (`splitSettled`); a train still pending at start is
- * settled or taken back by what the old train says (`PartyService.settlePendingSplits`).
+ * new train is stored and has its post, and the one write of both trains (the old one loses the
+ * group, this one is made to match) has not committed. That write clears it (`splitSettled`); a
+ * train still pending at start never had the group and is taken back
+ * (`PartyService.settlePendingSplits`).
  */
 export interface SplitFrom extends TrainLink {
   pending?: true;
diff --git a/src/domain/party/train-split.test.ts b/src/domain/party/train-split.test.ts
index 3220de34c93418ae399e75174517de52f39b27ff..2eccf20c32162c737d771de545ccde6e7fbbc907 100644
--- a/src/domain/party/train-split.test.ts
+++ b/src/domain/party/train-split.test.ts
@@ -541,37 +541,4 @@ describe('the new train of a split waits for the old one (pending)', () => {
     expect(splitSettled(settledNow)).toBe(settledNow);
     expect(splitSettled(fast())).toEqual(fast());
   });
-
-  it('settles against the old train: who is still on it as the new train was made with them stays there', () => {
-    const old = fast({ conductorId: BOB });
-    const made = split(old);
-    const bob = old.attendees[BOB] ?? attendee('B');
-    // While the new post was made Bob went to group A of the old train, which then lost group B
-    // (Alice): a stop before the carry-over left the new train with both of them.
-    const after: TrainParty = {
-      ...old,
-      attendees: {
-        [REPORTER]: attendee('A'),
-        [BOB]: { ...bob, group: 'A' },
-        [CAROL]: attendee('A'),
-      },
-    };
-    const settledNow = splitSettled(made, after);
-    expect(Object.keys(settledNow.attendees)).toEqual([ALICE]);
-    // Bob led it: the lead falls to Alice, who split the group off and is still on it, as at
-    // the carry-over; staff who split it off and are not on it lead nothing.
-    expect(settledNow.train.conductorId).toBe(ALICE);
-    expect(splitSettled(split(old, DAVE), after).train.conductorId).toBeNull();
-    expect(settledNow.train.splitFrom).toEqual({ partyId: old.id, postId: OLD_POST });
-    // Who acted on the new post meanwhile stays on it.
-    const acted: TrainParty = {
-      ...made,
-      attendees: {
-        ...made.attendees,
-        [BOB]: { ...bob, group: 'A', status: PartyStatus.Present },
-      },
-    };
-    expect(Object.keys(splitSettled(acted, after).attendees)).toEqual([ALICE, BOB]);
-    expect(splitSettled(acted, after).train.conductorId).toBe(BOB);
-  });
 });
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index a897c52fdb4588de2dc53afa543a5974683433ee..8785d22836d45ac4f129d0eb59b060871028fcc9 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -1334,31 +1334,9 @@ export function carriedSplit(
 /**
  * The new train of a split once the split is settled: `splitFrom` no longer `pending`. The very
  * same train when it is not pending.
- *
- * With `old`, the old train that lost the group to it (settled without the carry-over,
- * `carriedSplit`): a member who is still on the old train, there as the new train was made with
- * them (their record the same but for the group, so they never acted on the new post), changed
- * group while the new post was made and did not go: they leave the new train. When its
- * conductor leaves, the lead falls as at the split (`splitConductor`): to the member who split
- * it off when they are still on it, otherwise to nobody.
  */
-export function splitSettled(party: TrainParty, old?: TrainParty): TrainParty {
+export function splitSettled(party: TrainParty): TrainParty {
   const from = party.train.splitFrom;
   if (from?.pending !== true) return party;
-  const stayed = (memberId: string, attendee: Attendee): boolean => {
-    const there = old === undefined ? undefined : attendeeOf(old, memberId);
-    return there !== undefined && sameAttendee(attendee, { ...there, group: attendee.group });
-  };
-  const attendees = Object.fromEntries(
-    Object.entries(party.attendees).filter(([memberId, attendee]) => !stayed(memberId, attendee)),
-  );
-  const splitFrom = { partyId: from.partyId, postId: from.postId };
-  const { conductorId } = party.train;
-  if (Object.keys(attendees).length === Object.keys(party.attendees).length) {
-    return withTrain(party, { splitFrom });
-  }
-  const on = (memberId: string | null): memberId is string =>
-    memberId !== null && Object.hasOwn(attendees, memberId);
-  const leads = on(conductorId) ? conductorId : on(party.createdById) ? party.createdById : null;
-  return withTrain({ ...party, attendees }, { splitFrom, conductorId: leads });
+  return withTrain(party, { splitFrom: { partyId: from.partyId, postId: from.postId } });
 }
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index 18e785ae437781d50ca376e9992090ba967b0f90..ddb9b6c20fbfc01878731a17ef8a033ab01c6759 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -22,11 +22,12 @@ import type { RaidBossProvider } from './raid-boss-service.js';
 
 const HOUR_MS = 3_600_000;
 /**
- * How old the new train of a split must be for the upkeep to settle it while it is pending. The
- * old train's moves lock keeps a split under way apart from the upkeep, which settles a train
- * only once that split is done (and finds it settled then); the minute only spares the upkeep
- * waiting behind a split that takes a moment from its post to its carry-over. One older is left
- * by writes that failed.
+ * How old the new train of a split must be for the upkeep to take it back while it is pending
+ * (`PartyService.settlePendingSplits`). The old train's moves lock keeps a split under way apart
+ * from the upkeep, which looks at a train only once that split is done (and finds it settled, or
+ * gone, then); the minute only spares the upkeep waiting behind a split that takes a moment from
+ * its post to its one write of both trains. One older is a split whose write failed and whose
+ * take-back could not end the new train.
  */
 const PENDING_SPLIT_MS = 60_000;
 /** The warning is said again after this many messages of others in the post. */
@@ -62,8 +63,9 @@ export interface PartySchedulerOptions {
   /** The sessions of the web pages, of which those that expired go with the upkeep. */
   webSessions?: { sweep(): Promise<unknown> };
   /**
-   * The new trains of splits left pending in the process (plan 8T: writes that failed), settled
-   * with the upkeep once they are a minute old (`PartyService.settlePendingSplits`).
+   * The new trains of splits left pending in the process (plan 8T: a split whose write failed,
+   * and whose new train could not be ended then), taken back with the upkeep once they are a
+   * minute old (`PartyService.settlePendingSplits`).
    */
   splits?: Pick<PartyService, 'settlePendingSplits'>;
   /**
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index f800ce8d9af0bb189b041fcc541f96a484b0325a..9acdbab205f466fbb061577ef5e84deac24d00f5 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -100,7 +100,7 @@ import { KeyedLock } from './keyed-lock.js';
 import type { PartyNotifier } from './notify-service.js';
 import { PartyMirrors } from './party-mirrors.js';
 import { settingsOf } from './party-change.js';
-import { RegionClosedError, type PartyStore } from './party-store.js';
+import { RegionClosedError, type PairChange, type PartyStore } from './party-store.js';
 import type { Rehearsal } from './rehearsal.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
@@ -1127,29 +1127,23 @@ export class PartyService {
    * leaves the old train as it was and no new post behind.
    *
    * As a raid's move (`relocate`): the new train is stored (`pending`: `splitFrom.pending`) and
-   * gets its post first; then the old one loses the group inside the store, which decides anew
-   * (the group may be gone or called otherwise by now, `drawn`; the train may have ended; the
-   * member may no longer be allowed; the new train must still be there). When it refuses or has
-   * ended, the new train is taken back (`takeBack`: its post and link line deleted, nothing
-   * recorded) and that is the answer. A refusal that is known before anything is made is
-   * answered at once. Who is in the group at the moment of the old train's change goes: a member
-   * who left the group, or joined it, while the new post was made counts as they are then, and
-   * the new train is made to match (`carriedSplit`), keeping what members did on the new post
-   * meanwhile, and goes on from where the old one was then (its stop, route and times). That
-   * write settles the new train (no longer pending); its history starts there (`partySteps`). One
-   * split of a train at a time; a second finds the group gone.
+   * gets its post first; then both trains change in one write (`PartyStore.updateBoth`, one
+   * transaction), which decides anew (the group may be gone or called otherwise by now, `drawn`;
+   * the train may have ended; the member may no longer be allowed; the new train must still be
+   * there). When it refuses, has ended, or the write fails, the new train is taken back
+   * (`takeBack`: its post and link line deleted, nothing recorded) and that is the answer. A
+   * refusal that is known before anything is made is answered at once. In that write the old
+   * train loses the group, and who is in it at that moment goes: a member who left the group, or
+   * joined it, while the new post was made counts as they are then; the new train, as it is then,
+   * is made to match (`carriedSplit`), keeping what members did on the new post meanwhile, goes on
+   * from where the old one was then (its stop, route and times) and is settled (no longer
+   * pending); its history starts there (`partySteps`). One split of a train at a time; a second
+   * finds the group gone.
    *
-   * A carry-over write that fails is tried once more; when that fails too, the new train is
-   * settled as the old one says (`settleSplit`, logged as an error), and stays pending when that
-   * write fails too. A stop of the process after the new post exists and before the new train is
-   * settled leaves it pending as well; `settlePendingSplits` (at start, and with the clock's
-   * hourly upkeep for one a minute old) settles it when the old train lost the group to it, but
-   * for who is still on the old train as the new one was made with them (they changed group
-   * meanwhile), and when the old train is no longer active; it takes it back while the old train
-   * is active without having lost the group. Then a member who left the train while the new post
-   * was made is on the new one (it was stored with them), and one who joined the group on neither
-   * (they went with the group, and the new train was stored before): the window is a database
-   * write wide.
+   * There is nothing between the old train's write and the new one's: both commit or neither
+   * does. What a stop of the process can leave is a new train that is pending, with its post,
+   * whose write never committed (the old train still has the group); `settlePendingSplits` (at
+   * start, and with the clock's hourly upkeep for one a minute old) takes it back.
    *
    * No new-train DMs go out (its members know); its region copies, the access to its forum and
    * the summary follow as for any new party. Lines and the ping of who moved are the caller's
@@ -1160,7 +1154,7 @@ export class PartyService {
   }
 
   private async splitNow(request: SplitRequest): Promise<SplitOutcome> {
-    const { store, regions, log } = this.options;
+    const { store, regions } = this.options;
     const { by, staff, group, drawn } = request;
     const old = store.get(request.partyId);
     const oldPost = old?.forumPostId ?? null;
@@ -1200,88 +1194,69 @@ export class PartyService {
     }
     const link = { partyId: id, postId: created.party.forumPostId };
 
-    // The old train loses the group inside the store: who is in it now is who goes.
+    // One write of both trains: the old one loses the group (who is in it now is who goes),
+    // and the new one, as it is now, is made to match and settled.
     const seen: {
       split?: Extract<ReturnType<typeof splitOffGroup>, { ok: true }>;
       refusal?: PartyProblem;
       newGone?: true;
     } = {};
-    let changed;
+    let paired;
     try {
-      changed = await store.update(old.id, (party): { party?: Party } => {
+      paired = await store.updateBoth([old.id, id], (oldNow, newNow): PairChange => {
         // The new train ended meanwhile (its post was deleted): the group stays where it is.
-        if (!store.get(id)) {
+        if (!newNow) {
           seen.newGone = true;
           return {};
         }
+        if (!oldNow) return {};
         // The presser is noted before the split, so that their record moves with the name and
         // team they have now: the carry-over takes the moved records over the new train's.
-        const train = noteMember(asKindOf(old, party), by.id, by);
+        const train = noteMember(asKindOf(old, oldNow), by.id, by);
         const split = splitOffGroup(train, by.id, staff, group, link, drawn);
         if (!split.ok) {
           seen.refusal = split.reason;
-          return split;
+          return {};
         }
         seen.split = split;
-        return split;
+        const carried = carriedSplit(
+          asKindOf(fresh, newNow),
+          fresh,
+          split.moved,
+          split.conductor,
+          split.was,
+          this.now(),
+        );
+        return { parties: [split.party, splitSettled(carried)] };
       });
     } catch (err) {
       await this.takeBack(id);
       throw err;
     }
     const split = seen.split;
-    if (!changed?.written || !split || !changed.party) {
+    const [oldStored, newStored] = paired.parties;
+    if (!paired.written || !split || !oldStored || !newStored) {
       await this.takeBack(id);
       if (seen.newGone) return { kind: 'no-post' };
       return seen.refusal ? { kind: 'refused', reason: seen.refusal } : { kind: 'gone' };
     }
-    const from = asKindOf(old, changed.party);
-    const carry = (current: Party) => ({
-      party: splitSettled(
-        carriedSplit(
-          asKindOf(fresh, current),
-          fresh,
-          split.moved,
-          split.conductor,
-          split.was,
-          this.now(),
-        ),
-      ),
-    });
-    let party = created.party;
-    let carried;
-    try {
-      carried = await store.update(id, carry);
-    } catch (err) {
-      log.warn({ err, party: id }, 'could not carry a group over to its train; trying once more');
-      try {
-        carried = await store.update(id, carry);
-      } catch (again) {
-        log.error(
-          { err: again, party: id },
-          'could not carry a group over to its train: it is settled as the old train says',
-        );
-        await this.settleSplit(id);
-      }
-    }
-    if (carried?.party) party = asKindOf(fresh, carried.party);
-    else party = asKindOf(fresh, store.get(id) ?? party);
+    const from = asKindOf(old, oldStored);
+    const party = asKindOf(fresh, newStored);
     this.changed(from.id);
     this.changed(id);
     return { kind: 'split', party, from, group: split.group, moved: Object.keys(split.moved) };
   }
 
   /**
-   * Settles the new train of a split that is still pending (`splitFrom.pending`), as the old
-   * train says. While the old train is active and does not list the new one among its splits
-   * (`splitOff`), it never lost the group, and the new one is taken back (`takeBack`: its post
-   * and link line deleted, dropped from the history). When it lists it, the group went, and the
-   * new train is settled with its members as they are on it, but for those still on the old
-   * train as the new one was made with them (`splitSettled` with the old train: they changed
-   * group while the new post was made and stayed). When the old train is no longer active, the
-   * group is on no other train, and the new one is settled as it is. Says which it did; nothing
-   * for a train that is not pending. Never rejects: what fails is logged, and the train stays
-   * pending for the next try (`settlePendingSplits`).
+   * Takes back the new train of a split that is still pending (`splitFrom.pending`): its post
+   * exists and the write that would have settled it with the old train never committed
+   * (`updateBoth`), so the old train still has the group, or ended with it, and the new one goes
+   * (`takeBack`: its post and link line deleted, dropped from the history). One whose old train
+   * lists it among its splits (`splitOff`) cannot come of this code: only plan 8T's first build,
+   * which wrote the two trains one after the other, could leave one (stopped between the writes).
+   * The group is then on no other train, and it is settled as it is stored (logged as an error).
+   * Says which it did; nothing for a train that is not pending, or one that could not be ended
+   * or settled (logged: it stays pending for the next try, `settlePendingSplits`). Never rejects.
    */
   private async settleSplit(partyId: string): Promise<'settled' | 'taken-back' | undefined> {
     const { store, log } = this.options;
@@ -1289,20 +1264,17 @@ export class PartyService {
     const party = found && isTrain(found) ? found : undefined;
     const from = party?.train.splitFrom ?? null;
     if (!party || from?.pending !== true) return undefined;
-    const oldTrain = (): TrainParty | undefined => {
-      const old = store.get(from.partyId);
-      return old && isTrain(old) ? old : undefined;
-    };
-    const old = oldTrain();
-    if (old && !old.train.splitOff.some((split) => split.partyId === partyId)) {
+    const old = store.get(from.partyId);
+    if (!old || !isTrain(old) || !old.train.splitOff.some((split) => split.partyId === partyId)) {
       await this.takeBack(partyId);
-      return 'taken-back';
+      return store.get(partyId) ? undefined : 'taken-back';
     }
+    log.error(
+      { party: partyId, from: from.partyId },
+      'a pending new train of a split that its old train lists: settled as it is',
+    );
     try {
-      await store.update(partyId, (current) => ({
-        // The old train as it is when the new one is written.
-        party: splitSettled(asKindOf(party, current), oldTrain()),
-      }));
+      await store.update(partyId, (current) => ({ party: splitSettled(asKindOf(party, current)) }));
       this.changed(partyId);
       return 'settled';
     } catch (err) {
@@ -1312,12 +1284,13 @@ export class PartyService {
   }
 
   /**
-   * Settles the new trains of splits that were left pending (`settleSplit`), each under the lock
-   * of the moves of its old train: by a stop of the process (call once at start, once Discord is
-   * there: taking one back deletes its post), or by writes that failed in the process (the
-   * clock's hourly upkeep asks for those `olderThanMs` a minute: the lock keeps it apart from a
-   * split under way, and the minute only spares it waiting behind one). Logs how many it settled
-   * and took back, when it did any; says how many.
+   * Takes back (`settleSplit`) the new trains of splits that were left pending, each under the
+   * lock of the moves of its old train: by a stop of the process before the split's write (call
+   * once at start, once Discord is there: taking one back deletes its post), or in the process by
+   * a take-back that could not end the train (the clock's hourly upkeep asks for those
+   * `olderThanMs` a minute: the lock keeps it apart from a split under way, and the minute only
+   * spares it waiting behind one). Logs how many it settled and took back, when it did any; says
+   * how many.
    */
   async settlePendingSplits(olderThanMs = 0): Promise<number> {
     const before = this.now() - olderThanMs;
@@ -1339,7 +1312,7 @@ export class PartyService {
           settled: done.filter((one) => one.outcome === 'settled').length,
           takenBack: done.filter((one) => one.outcome === 'taken-back').length,
         },
-        'settled the new trains of splits that were left pending',
+        'settled or took back the new trains of splits that were left pending',
       );
     }
     return done.length;
diff --git a/src/services/train-split.test.ts b/src/services/train-split.test.ts
index 19c0c69a815b25593881124f31719815ef7f7174..7cbf0b50842a21278681407afb4bf116b8779dac 100644
--- a/src/services/train-split.test.ts
+++ b/src/services/train-split.test.ts
@@ -1,4 +1,4 @@
-import { describe, expect, it, vi } from 'vitest';
+import { afterEach, describe, expect, it, vi } from 'vitest';
 import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { leadOf, textOf } from '../../test/support/messages.js';
 import { ALICE, asTrain, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
@@ -66,12 +66,25 @@ function holdPost(made: Made): { release: () => void; reached: Promise<void> } {
   return { release, reached };
 }
 
+/**
+ * The id the next split gives its new train: after every other id, so that the paired write
+ * takes the old train's lock first and a press on the new post may go before it (the order of
+ * the locks is that of the ids, `PartyStore.updateBoth`).
+ */
+const LAST_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
+/** And one before every other id: the paired write holds the new train's lock while it waits. */
+const FIRST_ID = '00000000-0000-4000-8000-000000000000';
+
 /**
  * Holds the old train between the new post and its own change: a write of the old train is
  * held until `release`, and `reached` comes once the split asks to change the old train behind
- * it (the new train has its post by then). `fresh` gives the new train as it is then.
+ * it (the new train has its post by then). `fresh` gives the new train as it is then. The new
+ * train's id sorts after the old one's (`LAST_ID`) unless `newId` says otherwise.
  */
-function holdOldTrain(made: Made): {
+function holdOldTrain(
+  made: Made,
+  newId: `${string}-${string}-${string}-${string}-${string}` = LAST_ID,
+): {
   release: () => void;
   reached: Promise<void>;
   fresh: () => Party;
@@ -95,13 +108,12 @@ function holdOldTrain(made: Made): {
   });
   // The write that is held: one that changes nothing a member sees.
   void made.store.update(made.party.id, (party) => ({ party: { ...party } }));
-  const update = made.store.update.bind(made.store);
-  vi.spyOn(made.store, 'update').mockImplementation(
-    (id: string, change: (party: Party) => { party?: Party }) => {
-      if (id === made.party.id) arrive();
-      return update(id, change);
-    },
-  );
+  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(newId);
+  const updateBoth = made.store.updateBoth.bind(made.store);
+  vi.spyOn(made.store, 'updateBoth').mockImplementation((ids, change) => {
+    if (ids.includes(made.party.id)) arrive();
+    return updateBoth(ids, change);
+  });
   const fresh = () => {
     const party = made.store.active().find((one) => one.id !== made.party.id);
     if (!party) throw new Error('there is no new train');
@@ -118,9 +130,21 @@ function failingSaves(made: Made, when: (party: Party) => boolean): void {
   );
 }
 
-/** The write that settles the new train of a split: it is no longer pending. */
-const settling = (party: Party) =>
-  isTrain(party) && party.train.splitFrom !== null && party.train.splitFrom.pending !== true;
+/**
+ * The writes of two parties together fail (the split's: the old train without the group, the
+ * new one made to match), as the database's transaction would: neither is written.
+ */
+function failingPairs(made: Made): void {
+  vi.spyOn(made.storage, 'saveBoth').mockRejectedValue(new Error('the database is away'));
+}
+
+/** Ending the new train of a split fails: with a failing paired write, a stop as it were. */
+const endingTheNewOne = (made: Made) => (party: Party) =>
+  party.id !== made.party.id && party.status === 'ended';
+
+afterEach(() => {
+  vi.restoreAllMocks();
+});
 
 describe('TrainService.split', () => {
   it('makes the group a train of its own in the same forum, and the old train goes on without it', async () => {
@@ -464,6 +488,8 @@ describe('TrainService.split: what fails, and what happens meanwhile', () => {
     const outcome = await splitting;
     await settled(made);
     if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    // The press went before the paired write, which keeps it.
+    expect(outcome.party.attendees[BOB]).toMatchObject({ status: PartyStatus.Present });
     const train = asTrain(made.store.get(outcome.party.id));
     expect(train.attendees[BOB]).toMatchObject({ status: PartyStatus.Present, number: 2 });
     expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
@@ -504,149 +530,191 @@ describe('TrainService.split: what fails, and what happens meanwhile', () => {
     });
   });
 
-  it('tries the carry-over once more when its write fails, and settles the new train', async () => {
+  it('waits with a press on the new post for the paired write when it holds the new train first', async () => {
     const made = await fastTrain();
-    let failed = 0;
-    failingSaves(made, (party) => settling(party) && failed++ === 0);
-    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    // The new train's id sorts first: the paired write holds its lock while the old one's waits.
+    const { release, reached, fresh } = holdOldTrain(made, FIRST_ID);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    const pressing = made.attendance.signUp(fresh().id, bob, PartyStatus.Present);
+    release();
+    const outcome = await splitting;
+    await pressing;
     await settled(made);
     if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    // The split was written before the press: Bob went as he was, then said he is here.
+    expect(outcome.party.attendees[BOB]).toMatchObject({ status: PartyStatus.Coming });
     const train = asTrain(made.store.get(outcome.party.id));
-    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
     expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
-    expect(failed).toBe(2);
+    expect(train.attendees[BOB]).toMatchObject({ status: PartyStatus.Present, number: 2 });
+    expect(made.current().attendees[BOB]).toBeUndefined();
   });
 
-  it('settles at start a new train whose carry-over failed, when the old train lists it', async () => {
+  it('writes the old train without the group and the new train made to match in one write', async () => {
     const made = await fastTrain();
-    // Every write that would settle the new train fails: it is left pending.
-    failingSaves(made, settling);
+    const pairs: string[][] = [];
+    const saveBoth = made.storage.saveBoth.bind(made.storage);
+    vi.spyOn(made.storage, 'saveBoth').mockImplementation((writes) => {
+      pairs.push(
+        writes.map(({ party }) =>
+          !isTrain(party)
+            ? party.type
+            : party.id === made.party.id
+              ? `old: ${String(party.train.splitOff.length)} split off`
+              : `new: ${party.train.splitFrom?.pending === true ? 'pending' : 'settled'}`,
+        ),
+      );
+      return saveBoth(writes);
+    });
     const outcome = await made.trains.split(made.party.id, alice, false, 'B');
     await settled(made);
     if (outcome.kind !== 'split') throw new Error(outcome.kind);
-    expect(made.entries.some((entry) => entry.level === 50)).toBe(true);
-    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
-    vi.restoreAllMocks();
-
-    const again = await restarted(made);
-    expect(await again.service.settlePendingSplits()).toBe(1);
-    const train = asTrain(again.store.get(outcome.party.id));
-    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
-    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
-    expect(made.gateway.posts.get(train.forumPostId ?? '')).toBeDefined();
-    expect(await again.service.settlePendingSplits()).toBe(0);
+    expect(pairs).toEqual([['old: 1 split off', 'new: settled']]);
+    expect(outcome.party.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
   });
 
-  it('settles with the upkeep a new train left pending in the process, once it is a minute old', async () => {
+  it('takes the new train back, and leaves the old one as it was, when the paired write fails', async () => {
     const made = await fastTrain();
-    failingSaves(made, settling);
-    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    const before = made.current();
+    failingPairs(made);
+    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
+      'the database is away',
+    );
     await settled(made);
-    if (outcome.kind !== 'split') throw new Error(outcome.kind);
-    vi.restoreAllMocks();
-    const said = () =>
-      made.entries.filter(
-        (entry) => entry.msg === 'settled the new trains of splits that were left pending',
-      );
-    // Younger than a minute: a split may still be under way.
-    expect(await made.service.settlePendingSplits(MINUTE)).toBe(0);
-    expect(said()).toEqual([]);
-    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
-    // The clock's hourly upkeep settles it.
-    made.clock.now += HOUR;
-    await made.scheduler.tick();
-    await made.scheduler.whenIdle();
-    const train = asTrain(made.store.get(outcome.party.id));
-    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
-    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
-    expect(said()).toHaveLength(1);
-    expect(said()[0]).toMatchObject({ settled: 1, takenBack: 0 });
+    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
+    expect(made.current().attendees).toEqual(before.attendees);
+    expect(made.current().groups).toEqual(before.groups);
+    expect(made.current().train.splitOff).toEqual([]);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+    expect(made.history.records).toEqual([]);
   });
 
-  it('logs no settling when a pending train could not be settled', async () => {
+  it('loses nobody by a stop before the paired write: at start the new train is taken back, and the group is as it is on the old train', async () => {
     const made = await fastTrain();
-    failingSaves(made, settling);
-    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    const { release, reached } = holdPost(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    // While the new post is made, Bob leaves the train and Carol joins the group.
+    await made.attendance.leave(made.party.id, bob);
+    await made.attendance.joinGroup(made.party.id, carol, 'B');
+    // The paired write fails, and so does ending the new train: a stop in between, as it were.
+    failingPairs(made);
+    failingSaves(made, endingTheNewOne(made));
+    release();
+    await expect(splitting).rejects.toThrow('the database is away');
     await settled(made);
-    if (outcome.kind !== 'split') throw new Error(outcome.kind);
-    // The database is still away for it.
-    expect(await made.service.settlePendingSplits()).toBe(0);
-    expect(made.entries.map((entry) => entry.msg)).not.toContain(
-      'settled the new trains of splits that were left pending',
-    );
-    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
+    const pending = made.store.active().find((party) => party.id !== made.party.id);
+    expect(pending && isTrain(pending) && pending.train.splitFrom?.pending).toBe(true);
+    vi.restoreAllMocks();
+
+    const again = await restarted(made);
+    expect(await again.service.settlePendingSplits()).toBe(1);
+    await again.service.flush();
+    expect(again.store.active().map((party) => party.id)).toEqual([made.party.id]);
+    const old = asTrain(again.store.get(made.party.id));
+    expect(Object.keys(old.attendees)).toEqual([REPORTER, CAROL, ALICE]);
+    expect(old.attendees[CAROL]).toMatchObject({ group: 'B' });
+    expect(old.train.splitOff).toEqual([]);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+    expect(again.history.records.map((record) => record.partyId)).not.toContain(pending?.id);
   });
 
-  it('settles at start a pending train whose old train has ended without losing the group', async () => {
+  it('takes back at start a pending train whose old train has ended since', async () => {
     const made = await fastTrain();
-    failingSaves(
-      made,
-      (party) =>
-        (party.id === made.party.id && isTrain(party) && party.train.splitOff.length > 0) ||
-        (party.id !== made.party.id && party.status === 'ended'),
-    );
+    failingPairs(made);
+    failingSaves(made, endingTheNewOne(made));
     await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
       'the database is away',
     );
     await settled(made);
     const pending = made.store.active().find((party) => party.id !== made.party.id);
     vi.restoreAllMocks();
-    // The old train ends before the bot starts again: the group is on no train but the new one.
+    // The old train ends before the bot starts again, with the group on it.
     await made.service.end(made.party.id);
     await settled(made);
 
     const again = await restarted(made);
     expect(await again.service.settlePendingSplits()).toBe(1);
-    const train = asTrain(again.store.get(pending?.id ?? ''));
-    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
-    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
+    await again.service.flush();
+    expect(again.store.active()).toEqual([]);
+    expect(again.history.records.map((record) => record.partyId)).not.toContain(pending?.id);
   });
 
-  it('settles at start without who changed group on the old train while the new post was made', async () => {
+  it('settles at start, as it is stored, a pending train that its old train lists (only an earlier build left one)', async () => {
     const made = await fastTrain();
-    const { release, reached } = holdPost(made);
-    const splitting = made.trains.split(made.party.id, alice, false, 'B');
-    await reached;
-    // Bob goes to group A, then the process stops before the carry-over (every settling fails).
-    await made.attendance.joinGroup(made.party.id, bob, 'A');
-    failingSaves(made, settling);
-    release();
-    const outcome = await splitting;
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
     await settled(made);
     if (outcome.kind !== 'split') throw new Error(outcome.kind);
-    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
-    vi.restoreAllMocks();
+    // As the build of plan 8T could leave it: the old train lost the group, the new one is pending.
+    await made.store.update(outcome.party.id, (party) =>
+      isTrain(party) && party.train.splitFrom
+        ? {
+            party: {
+              ...party,
+              train: { ...party.train, splitFrom: { ...party.train.splitFrom, pending: true } },
+            },
+          }
+        : {},
+    );
 
     const again = await restarted(made);
     expect(await again.service.settlePendingSplits()).toBe(1);
-    expect(Object.keys(asTrain(again.store.get(outcome.party.id)).attendees)).toEqual([ALICE]);
-    expect(asTrain(again.store.get(made.party.id)).attendees[BOB]).toMatchObject({ group: 'A' });
+    const train = asTrain(again.store.get(outcome.party.id));
+    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
+    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
+    expect(made.gateway.posts.get(train.forumPostId ?? '')).toBeDefined();
+    expect(again.entries).toContainEqual(
+      expect.objectContaining({
+        level: 50,
+        party: outcome.party.id,
+        msg: 'a pending new train of a split that its old train lists: settled as it is',
+      }),
+    );
+    expect(await again.service.settlePendingSplits()).toBe(0);
   });
 
-  it('takes back at start a new train that the old one never lost the group to', async () => {
+  it('takes back with the upkeep a new train left pending in the process, once it is a minute old', async () => {
     const made = await fastTrain();
-    const before = made.current();
-    // The old train's change fails, and so does ending the new one: a stop in between, as it were.
-    failingSaves(
-      made,
-      (party) =>
-        (party.id === made.party.id && isTrain(party) && party.train.splitOff.length > 0) ||
-        (party.id !== made.party.id && party.status === 'ended'),
-    );
+    failingPairs(made);
+    failingSaves(made, endingTheNewOne(made));
     await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
       'the database is away',
     );
     await settled(made);
     const pending = made.store.active().find((party) => party.id !== made.party.id);
-    expect(pending && isTrain(pending) && pending.train.splitFrom?.pending).toBe(true);
     vi.restoreAllMocks();
+    const said = () =>
+      made.entries.filter(
+        (entry) =>
+          entry.msg === 'settled or took back the new trains of splits that were left pending',
+      );
+    // Younger than a minute: a split may still be under way.
+    expect(await made.service.settlePendingSplits(MINUTE)).toBe(0);
+    expect(said()).toEqual([]);
+    expect(made.store.get(pending?.id ?? '')).toBeDefined();
+    // The clock's hourly upkeep takes it back.
+    made.clock.now += HOUR;
+    await made.scheduler.tick();
+    await made.scheduler.whenIdle();
+    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
+    expect(said()).toHaveLength(1);
+    expect(said()[0]).toMatchObject({ settled: 0, takenBack: 1 });
+  });
 
-    const again = await restarted(made);
-    expect(await again.service.settlePendingSplits()).toBe(1);
-    await again.service.flush();
-    expect(again.store.active().map((party) => party.id)).toEqual([made.party.id]);
-    expect(asTrain(again.store.get(made.party.id)).attendees).toEqual(before.attendees);
-    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
-    expect(again.history.records.map((record) => record.partyId)).not.toContain(pending?.id);
+  it('logs nothing taken back when a pending train could not be ended', async () => {
+    const made = await fastTrain();
+    failingPairs(made);
+    failingSaves(made, endingTheNewOne(made));
+    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
+      'the database is away',
+    );
+    await settled(made);
+    const pending = made.store.active().find((party) => party.id !== made.party.id);
+    // The database is still away for it.
+    expect(await made.service.settlePendingSplits()).toBe(0);
+    expect(made.entries.map((entry) => entry.msg)).not.toContain(
+      'settled or took back the new trains of splits that were left pending',
+    );
+    expect(made.store.get(pending?.id ?? '')).toBeDefined();
   });
 });
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8tf HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-f-split-transaction.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other through the npm scripts.
2. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8T-F"), the Gantt chart and memory; tell the sessions of the web map (no migration) and of meetup safety and 8D that 8T-F is merged, and lift the staging hold.

## Staging checklist

`docs/superpowers/plans/2026-10-17-phase-8t-staging.md` (updated in task 2): on the dev application and the test server, each step with Matt's go-ahead, starting with registering the commands again (`npm run deploy-commands -- --global`) on a database that already has migration 019.
