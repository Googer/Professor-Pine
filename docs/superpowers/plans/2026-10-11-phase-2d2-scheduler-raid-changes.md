# Phase 2D-2: The Scheduler and the Raid Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Time passes for a raid: its post shows the hatch, a group is asked whether it is done after its meeting time, silence counts as done, the post is warned and then archived and locked, and all of it is caught up after a restart. Members correct a raid with `/hatch`, `/end`, `/duration`, `/boss`, `/moveset`, `/location`, `/meet`, `/cancel-meet` and a "Set time" button.

**Architecture:** The pure `partyTick` of plan 2B already decides everything the clock does; `PartyScheduler` runs it inside the store for every party at every `cleanupInterval` and carries out what it asks for, through the services of plans 2C and 2D-1. `PartyService.end` ends a party (the store first, then Discord) and `sweepPosts` archives what stayed open. `RaidChangeService` (`ctx.raids`) is what members change about a raid itself, decided inside the store under the gym's lock, so that two raids of one kind never block one gym. The commands and the "Set time" form are thin: they read what was typed, call a service and answer privately. Private answers to button clicks are gathered by `ClickAnswers`.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, zod 4, Luxon, Vitest. No new dependencies, no database migration (the party's state document gets a third version; one new query on the `Party` table).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: sections 4.2 (the rows `meet, cancel-meet` and `hatch … moveset`), 4.3 ("Set time"), 5.2 (end), 5.3 (scheduler), 5.5 (state). This is the second half of plan 2D of the five Phase 2 plans. Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, the "Plan 2D" lists in "From Phase 2B" and "From Phase 2C" and the section "From Phase 2D-1" with Matt's decisions.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (1,776 unit tests at the end, and 126 database tests). Two reviewers then went through that branch, and what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **A mis-tapped Done is taken back** (Matt, 2026-10-11). When the member who pressed Done is no longer done (Here, Join, Interested, Leave) and nobody their Done asked has completed the raid, the members who are still asked are Here again and the question's message is deleted. If one of those asked has completed the raid (by answering yes, by saying nothing in time, or by Done of their own), the raid was done and the question stands; when that member goes back as well, it is taken back then. To know this, an attendee records who asked them (`askedBy`), and a completion question records its message and the members it asked, so each question is deleted when its own members have answered. That is version 3 of the state document; versions 1 and 2 are still read. A question that cannot be sent puts its members back to Here.
2. **Private answers to clicks are gathered** (Matt, 2026-10-11), like the lines in the post: the first click of a member on a party is answered at once; clicks that follow within two seconds are only acknowledged, and when the member stops the first answer is replaced by the answer to the last click, which says how things stand after all of them. A refusal is shown at once. Slash commands are answered one by one, as before.
3. **Ending a party is: the store first, then Discord.** Once the party has left the store nothing renders or says anything in its post any more. Then the link line in the region's channel, open questions and the warning are deleted, the post is shown one last time without its controls, and it is archived and locked. What fails on Discord's side is logged; `sweepPosts` (at start and hourly) archives every open post of the party forums that the database says belongs to an ended party, and nothing else: not a post without a party, not the summary, not a member's post, not the post of a row that cannot be read.
4. **The scheduler ends a party only if it is still due when the ending is decided inside the store** (`end(id, onlyIf)`): a corrected time that was stored after the tick looked would otherwise be archived over.
5. **Effects are done at most once**, except the ending: the party is stored before anything is done about it, and a Discord call that fails afterwards is logged. A line is said when an egg hatches (`The egg has hatched: **Yveltal**.`), not when a raid ends (the warning follows five minutes later) and not when a tick catches up over both.
6. **The archive warning is one message, kept near the bottom** (Matt, 2026-10-11): after every fifth message of somebody else in the post it is said again and the earlier one deleted, because a busy post buries it and Discord has nothing that stays in view. The count is in memory. This uses the `MessageCreate` event (the `GuildMessages` intent, already required; the content is not read). A corrected time takes the warning away at the next tick.
7. **At start the clock waits for the connection to Discord**, however long that takes (a post that cannot be asked for yet would be taken for deleted), then up to fifteen seconds for the first read of the raid events. Its first tick shows every post anew. At shutdown it is stopped first.
8. **Anybody in the post may correct the raid**, as in the legacy bot: times, length, boss, moves, gym. Every change says in the post who made it, and each command allows ten uses a minute. A change that would make the raid block a gym that another raid of its kind already blocks (a later end, another kind of raid, another gym) is refused with a link to that raid's post.
9. **`/location gym`, not `/gym gym`**: `/gym` is the gym administration of Phase 5 (`/gym create`, …), and one slash command cannot be both a command and a group of subcommands. Matt (2026-10-11): fine for now. A gym of another region is refused; moving a post between forums is plan 2E.
10. **Times are typed as for `/raid`** (minutes from now, or a clock time) and checked against what this raid can have. A raid that was seen hatched and has no times cannot end later than its report plus a raid's length. A raid keeps its times once it has them (`cancel` is refused for `/hatch` and `/end`). An answer names the day when the time is not within half a day.
11. **A meeting time follows corrected raid times**: one that was the hatch time ("meet at hatch") moves with it, one that no longer lies between the hatch and the end is cancelled, each with a line. The clock never asks the group of an egg whether it is done. `/meet` and `/cancel-meet` allow three uses a minute, because each change is a message that pings the group.
12. **A boss with only one fast or one charged move has it set** (Matt, 2026-10-11: Kyogre has only Waterfall), wherever a raid gets its boss: when it is reported, with `/boss`, and when an egg hatches as the one boss of its tier. `/moveset` checks a move against the boss the raid has at that moment.
13. **"Set time"** is a button on a post without times (spec 4.3). It opens a form with one line; an egg is asked when it hatches, a hatched raid when it ends, and the form's custom id carries which. If somebody else sets the time while the form is open, theirs stands.
14. **Not in this plan:** mirrors, `/status`, `/where`, `/shout`, `/delete`, moving a raid to another region, `AccessService` (2E); `/admin save-party` (the clock already respects `saved`); DMs and notifications for a new boss or meeting time (Phase 4); the retention sweep of old archived posts.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). `src/render/` builds plain data: it may import `discord.js` for types and enums, and never calls Discord.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` and the fake interactions.
- A party is never mutated; it changes only through `PartyStore.update`, whose callback is synchronous and decides inside.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`. Text written by members or by a feed is shown through `plain()`.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path.

## Review Focus

1. A raid must never be archived while it is going on, and never stay open for good: a corrected time at the moment of archiving, a party a moderator keeps, a raid without times, a failed write, a failed archive, a post opened again by a late message. Tests: Task 2, "sees a change that was stored between the decision to end and the ending", "ends the party although Discord fails…", "archives the post of an ended party that is open again, and nothing else"; Task 3, "does not archive a raid whose time was corrected while the tick was deciding", "never archives a party a moderator keeps", "ends the party at the next tick when archiving was due but the write failed".
2. After downtime one tick must apply everything that was missed, once, and a restart must lose nothing: Task 3, "catches up after downtime…", "shows every post anew at start…"; Task 8, the lifecycle test over a restart in MySQL.
3. The completion question must never ask the wrong people or be left behind: a mis-tapped Done, a follower who goes back, somebody asked by another member or by the clock, a question on its way, an egg. Tests: Task 1, `withdrawQuestions` and "AttendanceService: taking a question back"; Task 3, "does not ask the group of an egg…", "puts the group back to here when the question cannot be sent".
4. Two raids of one kind must never block one gym, and no change may hang: Task 5, "refuses a gym that has such a raid already, naming it", "refuses an end time that would bring a finished raid back beside its successor", "gives a gym to one of two raids that move there at once", "lets two raids swap towards each other without waiting for ever", "looks again when the raid was moved while it waited for the gym".
5. A typed time must become the time the member meant, or an explanation: Task 6, "explains a time the raid cannot have, and one it cannot read", "gives a raid that was seen hatched no more time than a raid lasts", "names the day of a time that is not today", "sets the time that was typed into the form, as what the form asked for".

---

## File Structure

```
src/domain/party/
  party.ts              modify: Attendee.askedBy, CompletionQuestion, problems gym-taken / other-region / not-a-move
  attendance.ts         modify: askedBy, withdrawQuestions, releaseAsked, servedQuestions
  party-state.ts        modify: version 3, reader for version 2
  raid.ts               modify: certainMoves, fitMeetingTimes
  tick.ts               modify: certain moves at hatch; the group of an egg is not asked
src/db/repositories/party-repository.ts   modify: endedPosts
src/discord/
  party-gateway.ts      modify: archivePost, openPosts
  click-answers.ts      create: ClickAnswers
src/render/
  party-controls.ts     modify: the "Set time" button, timeForm
  activity.ts           modify: sentences for the new problems
src/services/
  coalescer.ts          modify: idle(key)
  party-store.ts        modify: endedPosts
  party-service.ts      modify: end, sweepPosts, checkSummaries; certain moves at report
  attendance-service.ts modify: questions per member, taking back, setMeetingTime
  party-scheduler.ts    create: PartyScheduler
  raid-change-service.ts create: RaidChangeService (ctx.raids)
src/components/party.ts modify: gathered answers; the "Set time" button and form
src/commands/
  parties/reply.ts      modify: outcomeText, answerClick
  parties/meet.ts       create: /meet, /cancel-meet
  raids/change.ts       create: /hatch, /end, /duration, answerRaidChange, changeTime
  raids/boss.ts         create: /boss, /moveset, /location
  raids/raid-input.ts   modify: typedPartyTime; gyms of the region only
  index.ts              modify
src/app-context.ts, src/app.ts   modify: ctx.raids, ctx.clickAnswers, the clock, message events
test/support/
  fake-gateway.ts       modify: archived, locked, reopened, foreign posts
  parties.ts            modify: endedPosts in the memory storage
  party-service.ts      modify: raids, scheduler, lines; restarted(); a database under the store
  test-context.ts       modify
```

---

### Task 1: The state document, version 3: a question knows whom it asked, and is taken back

**Files:**
- Modify: `src/commands/parties/reply.ts`, `src/db/repositories/party-repository.db.test.ts`, `src/domain/party/attendance.test.ts`, `src/domain/party/attendance.ts`, `src/domain/party/party-state.test.ts`, `src/domain/party/party-state.ts`, `src/domain/party/party.ts`, `src/services/attendance-service.test.ts`, `src/services/attendance-service.ts`

**Interfaces:**
- Consumes: Plan 2D-1's `Attendee`, `PartyPrompts`, `partyState`, `partyFromStored`, `completeRaid`, `answerCompletion`, `completeUnanswered`; `AttendanceService` (`apply`, `ask`, `removeQuestions`, `settleQuestions`), `AttendanceOutcome`, `answerOutcome`; test support `reportedRaid()`.
- Produces: `Attendee.askedBy?: string`; `CompletionQuestion { id: string; members: readonly string[] }`; `PartyPrompts.completion: readonly CompletionQuestion[]`; `withdrawQuestions(party): { party; released: string[] }`, `releaseAsked(party, members)`, `servedQuestions(party): CompletionQuestion[]` in `attendance.ts`; `PARTY_STATE_VERSION = 3`; `AttendanceOutcome` ok has `withdrawn: string[]`; `WITHDRAWN_LINE` (attendance service); `outcomeText(ok, words?)`, `WITHDRAWN_REPLY` and the exported type `Ok<Extra>` in `src/commands/parties/reply.ts`.

`askedBy` is set only by a member's Done (`askPresent` with `except`), kept when the attendee completes, and dropped on every other way out (`unasked`). `withdrawQuestions` looks at the whole party and runs after every change in `AttendanceService.apply`, so a follower who goes back releases the rest as well; the line in the post and the removal of served questions happen when the action did something or took a question back. `ask` records a question only while one of its own members is still asked, and deletes it otherwise; `pingable` is inside the `try` so that any failure before the send releases the members.

- [ ] **Step 1: Write the failing tests**

Apply to `src/db/repositories/party-repository.db.test.ts`:

```diff
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -198,17 +198,27 @@ describe('PartyRepository', () => {
     await expect(parties.findById(ID(2))).resolves.toMatchObject({ ok: false, id: ID(2) });
   });
 
-  it('keeps names, teams, emoji, group labels and prompts of version 2 exactly', async () => {
+  it('keeps names, teams, emoji, group labels, prompts and who asked whom exactly', async () => {
     const crowd = '😀'.repeat(32);
     const base = withAttendees(testRaid(), {
       [ALICE]: { name: crowd, team: 'mystic', group: 'A' },
-      '100000000000000009': { name: 'Bob', team: 'valor', group: 'B' },
+      '100000000000000009': {
+        name: 'Bob',
+        team: 'valor',
+        group: 'B',
+        status: PartyStatus.CompletePending,
+        pendingUntil: PARTY_NOW + 300_000,
+        askedBy: ALICE,
+      },
     });
     const raid: RaidParty = {
       ...base,
       groups: [{ id: 'A' }, { id: 'B', label: '🌳 park side 🌳' }],
       prompts: {
-        completion: ['1234567890123456701', '1234567890123456702'],
+        completion: [
+          { id: '1234567890123456701', members: ['100000000000000009', ALICE] },
+          { id: '1234567890123456702', members: [] },
+        ],
         warning: '1234567890123456703',
       },
     };
@@ -260,6 +270,31 @@ describe('PartyRepository', () => {
     });
   });
 
+  it('reads a version 2 document: its questions become records that asked nobody', async () => {
+    const raid = withAttendees(testRaid(), { [ALICE]: { number: 2, name: 'Alice' } });
+    await parties.insert(raid);
+    const [row] = await sql<{ state: unknown }>`select state from Party where id = ${raid.id}`
+      .execute(db)
+      .then((result) => result.rows);
+    const stored = (typeof row?.state === 'string' ? JSON.parse(row.state) : row?.state) as Record<
+      string,
+      unknown
+    >;
+    const old = {
+      ...stored,
+      v: 2,
+      prompts: { completion: ['1234567890123456701'], warning: '1234567890123456703' },
+    };
+    await sql`update Party set state = ${JSON.stringify(old)} where id = ${raid.id}`.execute(db);
+    const { parties: active, unreadable } = await parties.listActive();
+    expect(unreadable).toEqual([]);
+    expect(active[0]?.prompts).toEqual({
+      completion: [{ id: '1234567890123456701', members: [] }],
+      warning: '1234567890123456703',
+    });
+    expect(active[0]?.attendees[ALICE]?.name).toBe('Alice');
+  });
+
   it('lists ended parties older than a moment, for the sweep, and deletes one', async () => {
     const ended = (n: number, updatedAt: number): RaidParty => ({
       ...endParty(testRaid({ id: ID(n) })),
```

Apply to `src/domain/party/attendance.test.ts`:

```diff
--- a/src/domain/party/attendance.test.ts
+++ b/src/domain/party/attendance.test.ts
@@ -20,10 +20,13 @@ import {
   joinGroup,
   labelGroup,
   leaveParty,
+  releaseAsked,
+  servedQuestions,
   setAttendance,
   setMeetingTime,
   setNotHere,
   setRemote,
+  withdrawQuestions,
 } from './attendance.js';
 import { headCount, type Change, type RaidParty } from './party.js';
 import { PartyStatus } from './status.js';
@@ -240,7 +243,13 @@ describe('completing a raid', () => {
   it('takes yes and no as an answer, once', () => {
     const asked = done(completeRaid(party, ALICE, PARTY_NOW, 5));
     const yes = done(answerCompletion(asked, BOB, true));
-    expect(yes.attendees[BOB]).toEqual({ number: 2, status: Complete, group: 'A', remote: false });
+    expect(yes.attendees[BOB]).toEqual({
+      number: 2,
+      status: Complete,
+      group: 'A',
+      remote: false,
+      askedBy: ALICE,
+    });
     const no = done(answerCompletion(asked, BOB, false));
     expect(no.attendees[BOB]).toEqual({ number: 2, status: Present, group: 'A', remote: false });
     expect(answerCompletion(yes, BOB, false)).toEqual({ ok: false, reason: 'not-pending' });
@@ -264,6 +273,7 @@ describe('completing a raid', () => {
       status: Complete,
       group: 'A',
       remote: false,
+      askedBy: ALICE,
     });
   });
 
@@ -669,3 +679,155 @@ describe('a key that is present but undefined', () => {
     expect(change.ok && change.party.groups[0]).toEqual({ id: 'A', startTime: meet });
   });
 });
+
+describe('withdrawQuestions', () => {
+  const TIMEOUT = 5;
+  /** Alice, Bob and Carol are present in group A; Alice has completed the raid. */
+  function aliceDone(): RaidParty {
+    const raid = withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
+      [ALICE]: { status: Present },
+      [BOB]: { status: Present, number: 2 },
+      [CAROL]: { status: Present },
+    });
+    return done(completeRaid(raid, ALICE, PARTY_NOW, TIMEOUT));
+  }
+
+  it('records with everybody asked whose Done asked them', () => {
+    const raid = aliceDone();
+    expect(raid.attendees[BOB]).toEqual({
+      number: 2,
+      status: CompletePending,
+      group: 'A',
+      remote: false,
+      pendingUntil: PARTY_NOW + TIMEOUT * MINUTE,
+      askedBy: ALICE,
+    });
+    expect(raid.attendees[ALICE]?.askedBy).toBeUndefined();
+  });
+
+  it('does nothing while the member is done', () => {
+    const raid = aliceDone();
+    expect(withdrawQuestions(raid)).toEqual({ party: raid, released: [] });
+    expect(withdrawQuestions(raid).party).toBe(raid);
+  });
+
+  it('puts those asked back to present, without a trace of the question', () => {
+    const back = done(setAttendance(aliceDone(), ALICE, Present, {}, limits));
+    const withdrawn = withdrawQuestions(back);
+    expect(withdrawn.released).toEqual([BOB, CAROL]);
+    expect(withdrawn.party.attendees[BOB]).toEqual({
+      number: 2,
+      status: Present,
+      group: 'A',
+      remote: false,
+    });
+    expect(withdrawQuestions(withdrawn.party).party).toBe(withdrawn.party);
+  });
+
+  it('works when the member has left', () => {
+    const left = done(leaveParty(aliceDone(), ALICE));
+    expect(withdrawQuestions(left).released).toEqual([BOB, CAROL]);
+  });
+
+  it('lets the question stand when one of those asked completed: by yes, by silence or by Done', () => {
+    const ways: ((raid: RaidParty) => RaidParty)[] = [
+      (raid) => done(answerCompletion(raid, BOB, true)),
+      (raid) => completeUnanswered(raid, PARTY_NOW + TIMEOUT * MINUTE).party,
+      (raid) => done(completeRaid(raid, BOB, PARTY_NOW + MINUTE, TIMEOUT)),
+    ];
+    for (const way of ways) {
+      const followed = way(aliceDone());
+      expect(followed.attendees[BOB]).toMatchObject({ status: Complete, askedBy: ALICE });
+      const back = done(setAttendance(followed, ALICE, Present, {}, limits));
+      expect(withdrawQuestions(back)).toEqual({ party: back, released: [] });
+    }
+  });
+
+  it('releases only who is still asked: not who answered "not yet", moved or stepped back', () => {
+    let raid = done(answerCompletion(aliceDone(), BOB, false));
+    expect(raid.attendees[BOB]?.askedBy).toBeUndefined();
+    raid = done(setAttendance(raid, ALICE, Coming, {}, limits));
+    expect(withdrawQuestions(raid).released).toEqual([CAROL]);
+    const stepped = done(setNotHere(aliceDone(), CAROL));
+    expect(stepped.attendees[CAROL]).toEqual({
+      number: 1,
+      status: Interested,
+      group: 'A',
+      remote: false,
+    });
+  });
+
+  it('leaves alone who was asked by somebody else, or by the scheduler', () => {
+    const raid = withAttendees(aliceDone(), {
+      [REPORTER]: { status: CompletePending, pendingUntil: PARTY_NOW + MINUTE },
+    });
+    const back = done(setAttendance(raid, ALICE, Present, {}, limits));
+    const withdrawn = withdrawQuestions(back);
+    expect(withdrawn.released).toEqual([BOB, CAROL]);
+    expect(withdrawn.party.attendees[REPORTER]?.status).toBe(CompletePending);
+  });
+
+  it('releases the rest when the one who followed goes back too', () => {
+    const followed = done(answerCompletion(aliceDone(), BOB, true));
+    const aliceBack = done(setAttendance(followed, ALICE, Present, {}, limits));
+    expect(withdrawQuestions(aliceBack).released).toEqual([]);
+    const bobBack = done(setAttendance(aliceBack, BOB, Present, {}, limits));
+    const withdrawn = withdrawQuestions(bobBack);
+    expect(withdrawn.released).toEqual([CAROL]);
+    expect(withdrawn.party.attendees[CAROL]?.status).toBe(Present);
+  });
+
+  it('lets a question stand while its asker is done, whoever else goes back', () => {
+    const followed = done(answerCompletion(aliceDone(), BOB, true));
+    const bobBack = done(setAttendance(followed, BOB, Present, {}, limits));
+    expect(withdrawQuestions(bobBack)).toEqual({ party: bobBack, released: [] });
+  });
+
+  it('drops who asked when a member who had completed comes back', () => {
+    const followed = done(answerCompletion(aliceDone(), BOB, true));
+    const back = done(setAttendance(followed, BOB, Present, {}, limits));
+    expect(back.attendees[BOB]).toEqual({ number: 2, status: Present, group: 'A', remote: false });
+  });
+});
+
+describe('releaseAsked', () => {
+  it('makes those who are still asked present again and returns the same party otherwise', () => {
+    const raid = withAttendees(testRaid(), {
+      [ALICE]: { status: CompletePending, pendingUntil: PARTY_NOW + MINUTE, askedBy: BOB },
+      [BOB]: { status: Complete },
+      [CAROL]: { status: Coming },
+    });
+    const released = releaseAsked(raid, [ALICE, BOB, CAROL, '299999999999999999']);
+    expect(released.released).toEqual([ALICE]);
+    expect(released.party.attendees[ALICE]).toEqual({
+      number: 1,
+      status: Present,
+      group: 'A',
+      remote: false,
+    });
+    expect(released.party.attendees[BOB]).toBe(raid.attendees[BOB]);
+    expect(releaseAsked(released.party, [ALICE]).party).toBe(released.party);
+  });
+});
+
+describe('servedQuestions', () => {
+  const pending = { status: CompletePending, pendingUntil: PARTY_NOW + MINUTE };
+  const asked = (questions: { id: string; members: string[] }[], attendees = {}): RaidParty => ({
+    ...withAttendees(testRaid(), attendees),
+    prompts: { completion: questions, warning: null },
+  });
+
+  it('is every question none of whose members is still asked', () => {
+    const first = { id: '300000000000000001', members: [ALICE, BOB] };
+    const second = { id: '300000000000000002', members: [CAROL] };
+    const raid = asked([first, second], { [ALICE]: pending, [BOB]: { status: Complete } });
+    expect(servedQuestions(raid)).toEqual([second]);
+    expect(servedQuestions(asked([first, second]))).toEqual([first, second]);
+  });
+
+  it('takes a question without members as served only when nobody at all is asked', () => {
+    const old = { id: '300000000000000001', members: [] };
+    expect(servedQuestions(asked([old], { [CAROL]: pending }))).toEqual([]);
+    expect(servedQuestions(asked([old], { [CAROL]: { status: Present } }))).toEqual([old]);
+  });
+});
```

Apply to `src/domain/party/party-state.test.ts`:

```diff
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -37,7 +37,10 @@ function fullRaid(): RaidParty {
       { id: 'B' },
     ],
     defaultGroupId: 'B',
-    prompts: { completion: ['300000000000000003'], warning: '300000000000000004' },
+    prompts: {
+      completion: [{ id: '300000000000000003', members: [ALICE, BOB] }],
+      warning: '300000000000000004',
+    },
     mirrorMessages: [
       { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'remote' },
     ],
@@ -87,7 +90,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(2);
+    expect(state.v).toBe(3);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -124,7 +127,7 @@ describe('party state', () => {
       return result.ok ? 'read' : result.problem;
     };
     expect(problem(state, { ...columns, type: 'train' })).toBe('a party of type "train"');
-    expect(problem({ ...state, v: 3 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 4 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -187,6 +190,53 @@ describe('party state', () => {
     expect(failed.ok ? 'read' : failed.problem).toMatch(/default group/);
   });
 
+  it('reads a version 2 document: its questions asked nobody in particular', () => {
+    const raid = withAttendees(testRaid(), {
+      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: PARTY_NOW, name: 'Alice' },
+    });
+    const { prompts: _prompts, ...rest } = partyState(raid);
+    const old = stored({
+      ...rest,
+      v: 2,
+      prompts: { completion: ['300000000000000003'], warning: '300000000000000004' },
+    });
+    expect(partyFromStored(columnsOf(raid), old, [])).toEqual({
+      ok: true,
+      party: {
+        ...raid,
+        prompts: {
+          completion: [{ id: '300000000000000003', members: [] }],
+          warning: '300000000000000004',
+        },
+      },
+    });
+    // What version 2 did not have is not read from a version 2 document.
+    const asked = stored({
+      ...rest,
+      v: 2,
+      attendees: rest.attendees.map((attendee) => ({ ...attendee, askedBy: BOB })),
+      prompts: { completion: [], warning: null },
+    });
+    expect(partyFromStored(columnsOf(raid), asked, [])).toEqual({ ok: true, party: raid });
+    // A version 3 list of questions in a document that says 2 is not read as either.
+    const mixed = stored({ ...rest, v: 2, prompts: partyState(fullRaid()).prompts });
+    const failed = partyFromStored(columnsOf(raid), mixed, []);
+    expect(failed.ok ? 'read' : failed.problem).toMatch(/^state: /);
+  });
+
+  it('keeps who asked an attendee, and refuses an asker that is no snowflake', () => {
+    const raid = withAttendees(testRaid(), {
+      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: PARTY_NOW, askedBy: BOB },
+    });
+    const state = partyState(raid);
+    expect(partyFromStored(columnsOf(raid), stored(state), [])).toEqual({ ok: true, party: raid });
+    const broken = stored({
+      ...state,
+      attendees: state.attendees.map((attendee) => ({ ...attendee, askedBy: 'bob' })),
+    });
+    expect(partyFromStored(columnsOf(raid), broken, []).ok).toBe(false);
+  });
+
   it('refuses a team or a name it does not know how to show', () => {
     const raid = fullRaid();
     const state = partyState(raid);
```

Apply to `src/services/attendance-service.test.ts`:

```diff
--- a/src/services/attendance-service.test.ts
+++ b/src/services/attendance-service.test.ts
@@ -3,6 +3,7 @@ import { ALICE, BOB, CAROL, MINUTE, REPORTER, withAttendees } from '../../test/s
 import { reportedRaid } from '../../test/support/party-service.js';
 import { decodeCustomId } from '../discord/custom-id.js';
 import { completeRaid } from '../domain/party/attendance.js';
+import { WITHDRAWN_LINE } from './attendance-service.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { endParty } from '../domain/party/tick.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -185,7 +186,9 @@ describe('AttendanceService: completing a raid', () => {
       { kind: 'party', id, action: 'answer', args: ['yes'] },
       { kind: 'party', id, action: 'answer', args: ['no'] },
     ]);
-    expect(made.current().prompts.completion).toEqual([question?.id]);
+    expect(made.current().prompts.completion).toEqual([
+      { id: question?.id, members: [BOB, CAROL] },
+    ]);
     expect(attendeeOf(made.current(), BOB)).toMatchObject({
       status: PartyStatus.CompletePending,
       pendingUntil: made.clock.now + 5 * MINUTE,
@@ -211,7 +214,7 @@ describe('AttendanceService: completing a raid', () => {
     });
     await made.attendance.flush();
     expect(made.current().prompts.completion).toEqual([]);
-    expect(made.gateway.deleted).toEqual([{ channelId: made.postId, messageId: question }]);
+    expect(made.gateway.deleted).toEqual([{ channelId: made.postId, messageId: question?.id }]);
     expect(await made.attendance.answer(id, carol, true)).toEqual({
       kind: 'refused',
       reason: 'not-pending',
@@ -299,13 +302,14 @@ describe('AttendanceService: completing a raid', () => {
     // Alice is done: Bob is asked, and stays asked, so every question is recorded.
     await made.attendance.done(id, alice);
     await made.attendance.flush();
-    const sent = [...made.current().prompts.completion];
+    const ids = () => made.current().prompts.completion.map((question) => question.id);
+    const sent = ids();
     for (let round = 0; round < 11; round++) {
       await made.attendance.ask(made.current(), [BOB]);
-      sent.push(made.current().prompts.completion.at(-1) ?? '');
+      sent.push(ids().at(-1) ?? '');
     }
     expect(sent).toHaveLength(12);
-    expect(made.current().prompts.completion).toEqual(sent.slice(2));
+    expect(ids()).toEqual(sent.slice(2));
     expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual(sent.slice(0, 2));
   });
 
@@ -333,13 +337,14 @@ describe('AttendanceService: completing a raid', () => {
     await made.attendance.done(id, alice);
     await made.attendance.flush();
     await made.attendance.ask(made.current(), [BOB]);
-    const questions = [...made.current().prompts.completion];
+    const ids = () => made.current().prompts.completion.map((question) => question.id);
+    const questions = ids();
     expect(questions).toHaveLength(2);
 
     made.gateway.failing.set('deleteMessage', new Error('no'));
     await made.attendance.answer(id, bob, true);
     await made.attendance.flush();
-    expect(made.current().prompts.completion).toEqual(questions);
+    expect(ids()).toEqual(questions);
     expect(made.entries.filter((e) => e.msg === 'could not delete a message')).toHaveLength(2);
 
     made.gateway.failing.clear();
@@ -563,7 +568,7 @@ describe('AttendanceService: when Discord fails', () => {
     expect(made.entries.some((e) => e.msg === 'could not post a party line')).toBe(true);
   });
 
-  it('logs a warning when the question cannot be sent; the members stay asked', async () => {
+  it('keeps the members asked when taking a failed question back fails too', async () => {
     const made = await reportedRaid(yveltal);
     const id = made.party.id;
     await made.attendance.signUp(id, alice, PartyStatus.Present);
@@ -571,8 +576,163 @@ describe('AttendanceService: when Discord fails', () => {
     await made.attendance.flush();
     made.gateway.failing.set('sendMessage', new Error('no'));
     await made.attendance.done(id, alice);
+    made.storage.failing = new Error('database down');
     await made.attendance.flush();
-    expect(made.entries.some((e) => e.msg === 'could not ask who completed')).toBe(true);
+    made.storage.failing = undefined;
+    const messages = made.entries.map((e) => e.msg);
+    expect(messages).toContain('could not take back a question that was not sent');
+    expect(messages).toContain('could not ask who completed');
+    // The scheduler's timeout completes them, as before.
     expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
   });
 });
+
+describe('AttendanceService: taking a question back', () => {
+  /** Alice, Bob and Carol are here at a hatched raid; Alice has pressed Done. */
+  async function aliceDone() {
+    const made = await reportedRaid(yveltal);
+    const id = made.party.id;
+    for (const member of [alice, bob, carol]) {
+      await made.attendance.signUp(id, member, PartyStatus.Present);
+    }
+    await made.attendance.done(id, alice);
+    await made.attendance.flush();
+    const questions = () =>
+      made.gateway.messagesIn(made.postId).filter((message) => message.message.components?.length);
+    return { made, id, questions };
+  }
+
+  it('puts the others back to here and deletes the question when the member is here again', async () => {
+    const { made, id, questions } = await aliceDone();
+    expect(questions()).toHaveLength(1);
+    const outcome = await made.attendance.signUp(id, alice, PartyStatus.Present);
+    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [BOB, CAROL] });
+    await made.attendance.flush();
+    expect(attendeeOf(made.current(), BOB)).toEqual({
+      number: 1,
+      status: PartyStatus.Present,
+      group: 'A',
+      remote: false,
+      name: 'Bob',
+    });
+    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.Present);
+    expect(questions()).toEqual([]);
+    expect(made.current().prompts.completion).toEqual([]);
+    expect(made.said().join('\n').split('\n').slice(-2)).toEqual([
+      `<@${ALICE}> is here.`,
+      WITHDRAWN_LINE,
+    ]);
+  });
+
+  it('takes it back as well when the member joins, is interested or leaves', async () => {
+    for (const back of ['join', 'maybe', 'leave'] as const) {
+      const { made, id, questions } = await aliceDone();
+      const outcome =
+        back === 'leave'
+          ? await made.attendance.leave(id, alice)
+          : await made.attendance.signUp(
+              id,
+              alice,
+              back === 'join' ? PartyStatus.Coming : PartyStatus.Interested,
+            );
+      expect(outcome, back).toMatchObject({ kind: 'ok', withdrawn: [BOB, CAROL] });
+      await made.attendance.flush();
+      expect(questions(), back).toEqual([]);
+    }
+  });
+
+  it('lets the question stand once one of those asked has completed the raid', async () => {
+    const { made, id, questions } = await aliceDone();
+    await made.attendance.answer(id, bob, true);
+    const outcome = await made.attendance.signUp(id, alice, PartyStatus.Present);
+    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [] });
+    await made.attendance.flush();
+    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.CompletePending);
+    expect(questions()).toHaveLength(1);
+    expect(made.said().join('\n')).not.toContain(WITHDRAWN_LINE);
+  });
+
+  it('leaves alone who answered "not yet", and who was asked by somebody else', async () => {
+    const { made, id } = await aliceDone();
+    await made.attendance.answer(id, bob, false);
+    const outcome = await made.attendance.signUp(id, alice, PartyStatus.Present);
+    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [CAROL] });
+  });
+
+  it('takes nothing back for a member who was never done, or is done again', async () => {
+    const { made, id } = await aliceDone();
+    expect(await made.attendance.changeNumber(id, bob, 1)).toMatchObject({ withdrawn: [] });
+    expect(await made.attendance.done(id, alice)).toMatchObject({ withdrawn: [] });
+    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.CompletePending);
+  });
+
+  it('takes it back when a follower who had said yes goes back after the asker', async () => {
+    const { made, id, questions } = await aliceDone();
+    await made.attendance.answer(id, bob, true);
+    await made.attendance.signUp(id, alice, PartyStatus.Present);
+    const outcome = await made.attendance.signUp(id, bob, PartyStatus.Present);
+    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [CAROL] });
+    await made.attendance.flush();
+    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.Present);
+    expect(questions()).toEqual([]);
+    expect(made.current().prompts.completion).toEqual([]);
+  });
+
+  it('deletes a question that was withdrawn while it was on its way', async () => {
+    const made = await reportedRaid(yveltal);
+    const id = made.party.id;
+    await made.attendance.signUp(id, alice, PartyStatus.Present);
+    await made.attendance.signUp(id, bob, PartyStatus.Present);
+    const done = made.attendance.done(id, alice);
+    const back = made.attendance.signUp(id, alice, PartyStatus.Present);
+    await Promise.all([done, back]);
+    await made.attendance.flush();
+    expect(made.current().prompts.completion).toEqual([]);
+    expect(
+      made.gateway.messagesIn(made.postId).filter((m) => m.message.components?.length),
+    ).toEqual([]);
+    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
+  });
+});
+
+describe('AttendanceService: a question and the members it asked', () => {
+  it('removes each question when its own members have answered, whoever else is still asked', async () => {
+    const made = await reportedRaid(yveltal);
+    const id = made.party.id;
+    await made.attendance.signUp(id, alice, PartyStatus.Present);
+    await made.attendance.signUp(id, bob, PartyStatus.Present);
+    await made.attendance.newGroup(id, carol);
+    await made.attendance.signUp(id, carol, PartyStatus.Present);
+    await made.attendance.signUp(id, { id: REPORTER }, PartyStatus.Present, { group: 'B' });
+    await made.attendance.done(id, alice);
+    await made.attendance.done(id, carol);
+    await made.attendance.flush();
+    expect(made.current().prompts.completion.map((q) => q.members)).toEqual([[BOB], [REPORTER]]);
+    const [first, second] = made.current().prompts.completion;
+    await made.attendance.answer(id, bob, false);
+    await made.attendance.flush();
+    expect(made.current().prompts.completion).toEqual([second]);
+    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([first?.id]);
+  });
+
+  it('puts the members back to here when the question cannot be sent', async () => {
+    const made = await reportedRaid(yveltal);
+    const id = made.party.id;
+    await made.attendance.signUp(id, alice, PartyStatus.Present);
+    await made.attendance.signUp(id, bob, PartyStatus.Present);
+    await made.attendance.flush();
+    made.gateway.failing.set('sendMessage', new Error('no'));
+    const outcome = await made.attendance.done(id, alice);
+    expect(outcome).toMatchObject({ kind: 'ok', asked: [BOB] });
+    await made.attendance.flush();
+    expect(attendeeOf(made.current(), BOB)).toEqual({
+      number: 1,
+      status: PartyStatus.Present,
+      group: 'A',
+      remote: false,
+      name: 'Bob',
+    });
+    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Complete);
+    expect(made.entries.some((e) => e.msg === 'could not ask who completed')).toBe(true);
+  });
+});
```

Run: `npx vitest run --project unit src/domain/party/attendance.test.ts src/domain/party/party-state.test.ts src/services/attendance-service.test.ts`
Expected: FAIL (`withdrawQuestions`, `releaseAsked` and `servedQuestions` do not exist; the state tests fail on the version and on the questions).

- [ ] **Step 2: The implementation**

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -37,7 +37,7 @@ export function commandParty(interaction: ChatInputCommandInteraction, ctx: AppC
   return party;
 }
 
-type Ok<Extra> = Extract<AttendanceOutcome<Extra>, { kind: 'ok' }>;
+export type Ok<Extra> = Extract<AttendanceOutcome<Extra>, { kind: 'ok' }>;
 
 /**
  * Tells the member, privately, what came of their action: how they stand now, or what `words`
@@ -54,13 +54,26 @@ export async function answerOutcome<Extra>(
   if (outcome.kind === 'refused') {
     throw new UserError(problemText(outcome.reason, ctx.attendance.limits()));
   }
-  const ok = outcome as Ok<Extra>;
-  const content =
+  await interaction.reply({
+    content: outcomeText(outcome as Ok<Extra>, words),
+    flags: MessageFlags.Ephemeral,
+  });
+}
+
+/** What a member is told after an action that worked. */
+export function outcomeText<Extra>(
+  ok: Ok<Extra>,
+  words?: (ok: Ok<Extra>) => string | undefined,
+): string {
+  const said =
     words?.(ok) ??
     (ok.attendee ? standingReply(ok.party, ok.attendee) : 'You are not signed up for this raid.');
-  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
+  return ok.withdrawn.length > 0 ? `${said} ${WITHDRAWN_REPLY}` : said;
 }
 
+/** Added to the answer of a member whose going back took their question to the others back. */
+export const WITHDRAWN_REPLY = 'I have taken back the question whether the others are done.';
+
 /** What the remote switch answers: "in person" is said, or switching it off would say nothing. */
 export function remoteWords(ok: {
   party: Party;
```

Apply to `src/domain/party/attendance.ts`:

```diff
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -7,8 +7,8 @@ import {
   refused,
   remoteAllowed,
   type Attendee,
-  type AttendeeStatus,
   type Change,
+  type CompletionQuestion,
   type GroupId,
   type Party,
   type PartyGroup,
@@ -105,6 +105,12 @@ export function noteMember<P extends Party>(party: P, memberId: string, info: Me
   return withAttendee(party, memberId, noted);
 }
 
+/** The record without what belongs to having been asked whether they completed the raid. */
+function unasked(attendee: Attendee): Omit<Attendee, 'pendingUntil' | 'askedBy'> {
+  const { pendingUntil: _pendingUntil, askedBy: _askedBy, ...rest } = attendee;
+  return rest;
+}
+
 /**
  * An attendee moved to another group: one who was asked whether they completed the raid has
  * answered "not yet" and is present again.
@@ -112,8 +118,7 @@ export function noteMember<P extends Party>(party: P, memberId: string, info: Me
 function movedTo(existing: Attendee, group: GroupId): Attendee {
   if (existing.group === group) return existing;
   if (existing.status !== PartyStatus.CompletePending) return { ...existing, group };
-  const { pendingUntil: _pendingUntil, ...rest } = existing;
-  return { ...rest, status: PartyStatus.Present, group };
+  return { ...unasked(existing), status: PartyStatus.Present, group };
 }
 
 function checked(
@@ -221,10 +226,12 @@ export function changeNumber<P extends Party>(
 export function setNotHere<P extends Party>(party: P, memberId: string): Change<P> {
   const existing = attendeeOf(party, memberId);
   if (!existing) return refused('not-attending');
-  const { pendingUntil: _pendingUntil, ...rest } = existing;
   return {
     ok: true,
-    party: withAttendee(party, memberId, { ...rest, status: PartyStatus.Interested }),
+    party: withAttendee(party, memberId, {
+      ...unasked(existing),
+      status: PartyStatus.Interested,
+    }),
   };
 }
 
@@ -237,7 +244,8 @@ export function leaveParty<P extends Party>(party: P, memberId: string): Change<
 
 /**
  * Members of a group who are present are asked whether they completed the raid: they become
- * `CompletePending` until `now + timeoutMinutes`, after which silence counts as yes.
+ * `CompletePending` until `now + timeoutMinutes`, after which silence counts as yes. `except` is
+ * the member whose Done asks them; it is recorded with each of them (`askedBy`).
  */
 function askPresent<P extends Party>(
   party: P,
@@ -260,6 +268,7 @@ function askPresent<P extends Party>(
       ...attendee,
       status: PartyStatus.CompletePending,
       pendingUntil: now + timeoutMinutes * MINUTE,
+      ...(except === undefined ? {} : { askedBy: except }),
     };
   }
   return { party: { ...party, attendees }, asked };
@@ -313,8 +322,68 @@ export function answerCompletion<P extends Party>(
   const existing = attendeeOf(party, memberId);
   if (existing?.status !== PartyStatus.CompletePending) return refused('not-pending');
   const { pendingUntil: _pendingUntil, ...rest } = existing;
-  const status: AttendeeStatus = completed ? PartyStatus.Complete : PartyStatus.Present;
-  return { ok: true, party: withAttendee(party, memberId, { ...rest, status }) };
+  const answered: Attendee = completed
+    ? { ...rest, status: PartyStatus.Complete }
+    : { ...unasked(existing), status: PartyStatus.Present };
+  return { ok: true, party: withAttendee(party, memberId, answered) };
+}
+
+/**
+ * Takes back the questions that no longer have a reason: a member who had pressed Done is not
+ * done after all (a mis-tap), and nobody their Done asked has completed the raid either. The
+ * members who are still asked by such a Done are present again (`released`). While the member
+ * who pressed Done is done, or one of those asked has completed the raid (the raid was done,
+ * then), the question stands. Questions of the scheduler (a meeting time) have no asker and
+ * always stand. It looks at the whole party, so it can follow every change a member makes.
+ */
+export function withdrawQuestions<P extends Party>(party: P): { party: P; released: string[] } {
+  const done = (id: string): boolean => attendeeOf(party, id)?.status === PartyStatus.Complete;
+  const followed = new Set(
+    Object.values(party.attendees)
+      .filter((attendee) => attendee.status === PartyStatus.Complete)
+      .map((attendee) => attendee.askedBy),
+  );
+  const orphaned = membersWhere(
+    party,
+    ({ status, askedBy }) =>
+      status === PartyStatus.CompletePending &&
+      askedBy !== undefined &&
+      !done(askedBy) &&
+      !followed.has(askedBy),
+  );
+  return releaseAsked(party, orphaned);
+}
+
+/**
+ * Those of `members` who are still asked whether they completed the raid are present again, as
+ * if they had not been asked: for a question that was withdrawn or could not be sent.
+ */
+export function releaseAsked<P extends Party>(
+  party: P,
+  members: readonly string[],
+): { party: P; released: string[] } {
+  const released = members.filter(
+    (id) => attendeeOf(party, id)?.status === PartyStatus.CompletePending,
+  );
+  if (released.length === 0) return { party, released };
+  const attendees = { ...party.attendees };
+  for (const memberId of released) {
+    const attendee = attendees[memberId];
+    if (attendee) attendees[memberId] = { ...unasked(attendee), status: PartyStatus.Present };
+  }
+  return { party: { ...party, attendees }, released };
+}
+
+/** The completion questions that have served: none of the members they asked is still asked. */
+export function servedQuestions(party: Party): CompletionQuestion[] {
+  const pending = new Set(
+    membersWhere(party, (attendee) => attendee.status === PartyStatus.CompletePending),
+  );
+  return party.prompts.completion.filter((question) =>
+    question.members.length === 0
+      ? pending.size === 0
+      : !question.members.some((id) => pending.has(id)),
+  );
 }
 
 /**
```

Apply to `src/domain/party/party-state.ts`:

```diff
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -20,10 +20,12 @@ import { PartyStatus } from './status.js';
  * version too: fields the schema does not know are dropped when a document is read. After a
  * rollback the old code cannot read rows the new code wrote.
  *
- * Version 2 (plan 2D) added an attendee's `name` and `team` and the party's `prompts`; a
- * version 1 document is read as one without them.
+ * Version 2 (plan 2D-1) added an attendee's `name` and `team` and the party's `prompts`; a
+ * version 1 document is read as one without them. Version 3 (plan 2D-2) added an attendee's
+ * `askedBy` and made a completion question a record of its message and the members it asked; a
+ * question of a version 2 document is read as one that asked nobody in particular.
  */
-export const PARTY_STATE_VERSION = 2;
+export const PARTY_STATE_VERSION = 3;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -43,16 +45,25 @@ const attendeeV1 = z.object({
   pendingUntil: time.optional(),
 });
 
-const attendee = attendeeV1.extend({
+const attendeeV2 = attendeeV1.extend({
   name: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
   team: z.enum(TEAMS).optional(),
 });
 
-const prompts = z.object({
+const attendee = attendeeV2.extend({ askedBy: snowflake.optional() });
+
+const promptsV2 = z.object({
   completion: z.array(snowflake).max(MAX_COMPLETION_PROMPTS),
   warning: snowflake.nullable(),
 });
 
+const prompts = z.object({
+  completion: z
+    .array(z.object({ id: snowflake, members: z.array(snowflake) }))
+    .max(MAX_COMPLETION_PROMPTS),
+  warning: snowflake.nullable(),
+});
+
 const group = z.object({
   id: groupId,
   label: z.string().optional(),
@@ -129,18 +140,44 @@ const stateV1 = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 2, as plan 2D-1 wrote it: read only, and upgraded when read. */
+const stateV2 = z
+  .object({
+    v: z.literal(2),
+    ...shared,
+    attendees: z.array(attendeeV2.extend({ id: snowflake })),
+    prompts: promptsV2,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Reads a stored document of any version this code knows, as the current version. */
 function readState(stored: unknown) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
-  if (version !== 1) return state.safeParse(stored);
-  const old = stateV1.safeParse(stored);
-  if (!old.success) return old;
-  return state.safeParse({
-    ...old.data,
-    v: PARTY_STATE_VERSION,
-    prompts: { completion: [], warning: null },
-  });
+  if (version === 1) {
+    const old = stateV1.safeParse(stored);
+    if (!old.success) return old;
+    return state.safeParse({
+      ...old.data,
+      v: PARTY_STATE_VERSION,
+      prompts: { completion: [], warning: null },
+    });
+  }
+  if (version === 2) {
+    const old = stateV2.safeParse(stored);
+    if (!old.success) return old;
+    return state.safeParse({
+      ...old.data,
+      v: PARTY_STATE_VERSION,
+      prompts: {
+        completion: old.data.prompts.completion.map((id) => ({ id, members: [] })),
+        warning: old.data.prompts.warning,
+      },
+    });
+  }
+  return state.safeParse(stored);
 }
 
 const mirrors = z.array(
@@ -171,7 +208,13 @@ export function partyState(party: Party): PartyState {
     groups: [...party.groups],
     defaultGroupId: party.defaultGroupId,
     raid: raidDetails,
-    prompts: { completion: [...party.prompts.completion], warning: party.prompts.warning },
+    prompts: {
+      completion: party.prompts.completion.map(({ id, members }) => ({
+        id,
+        members: [...members],
+      })),
+      warning: party.prompts.warning,
+    },
   };
   const checked = state.safeParse(document);
   if (!checked.success) {
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -44,12 +44,30 @@ export interface Attendee {
    */
   name?: string;
   team?: Team;
+  /**
+   * The member whose Done asked this attendee whether they completed the raid too. Set with
+   * `pendingUntil` and kept when the attendee completes (by answering yes, by saying nothing in
+   * time, or by Done of their own): it is how `withdrawQuestion` knows whether anybody followed
+   * that member. Any other status drops it. Absent when the scheduler asked (a meeting time).
+   */
+  askedBy?: string;
+}
+
+/** A "have you completed this raid?" message in the post, and the members it asked. */
+export interface CompletionQuestion {
+  /** The id of the message. */
+  id: string;
+  /**
+   * The members it asked. It has served once none of them is still asked. Empty for a question
+   * of a version 2 document, which has served once nobody at all is asked.
+   */
+  members: readonly string[];
 }
 
 /** Messages of the bot in the post that it removes again when they have served. */
 export interface PartyPrompts {
-  /** The "have you completed this raid?" questions that still have somebody to answer. */
-  completion: readonly string[];
+  /** The completion questions that still have somebody to answer. */
+  completion: readonly CompletionQuestion[];
   /** The warning that the post will be archived; null while there is none. */
   warning: string | null;
 }
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -11,18 +11,20 @@ import {
   labelGroup,
   leaveParty,
   noteMember,
+  releaseAsked,
+  servedQuestions,
   setAttendance,
   setNotHere,
   setRemote,
   type AttendanceLimits,
   type AttendanceOptions,
   type MemberInfo,
+  withdrawQuestions,
 } from '../domain/party/attendance.js';
 import {
   attendeeOf,
   groupOf,
   MAX_COMPLETION_PROMPTS,
-  membersWhere,
   refused,
   type Attendee,
   type Change,
@@ -47,16 +49,27 @@ export interface Member extends MemberInfo {
 /** Discord lets one message name this many users to ping. */
 const MAX_PINGS = 100;
 
+/** Said in the post when a question is taken back; the question itself is deleted. */
+export const WITHDRAWN_LINE = 'So the others who were asked whether they are done are here again.';
+
 /**
  * What came of a member's action. `gone`: there is no such active party (it ended meanwhile).
  * `refused`: the party stays as it was. `ok`: the party as it is stored now, with the member's
  * attendee record (undefined after leaving) and `acted`, false when the action changed nothing
- * (Join from somebody who was coming already).
+ * (Join from somebody who was coming already). `withdrawn` are the members who are no longer
+ * asked whether they completed the raid, because the member who had pressed Done is not done
+ * after all.
  */
 export type AttendanceOutcome<Extra = unknown> =
   | { kind: 'gone' }
   | { kind: 'refused'; reason: PartyProblem }
-  | ({ kind: 'ok'; party: Party; attendee: Attendee | undefined; acted: boolean } & Extra);
+  | ({
+      kind: 'ok';
+      party: Party;
+      attendee: Attendee | undefined;
+      acted: boolean;
+      withdrawn: string[];
+    } & Extra);
 
 export interface AttendanceServiceOptions {
   store: PartyStore;
@@ -71,8 +84,8 @@ export interface AttendanceServiceOptions {
   now?: () => number;
 }
 
-function anyoneAsked(party: Party): boolean {
-  return membersWhere(party, (a) => a.status === PartyStatus.CompletePending).length > 0;
+function stillAsked(party: Party, members: readonly string[]): boolean {
+  return members.some((id) => attendeeOf(party, id)?.status === PartyStatus.CompletePending);
 }
 
 function isDone(party: Party, memberId: string): boolean {
@@ -84,6 +97,10 @@ function isDone(party: Party, memberId: string): boolean {
  * buttons of a post and the slash commands both end here. Every method stores the change, has the
  * post shown anew, and says in the post what happened, in a line that pings nobody; the caller
  * tells the member privately (`standingReply`, `problemText`).
+ *
+ * A member who had pressed Done and then does anything that makes them not done takes the
+ * question back that their Done put to the others, unless one of those has completed the raid
+ * and still stands by it (`withdrawQuestions`, which runs with every change).
  */
 export class AttendanceService {
   private readonly now: () => number;
@@ -260,15 +277,17 @@ export class AttendanceService {
     const result = await store.update(partyId, (party) => {
       const changed = change(party);
       if (!changed.ok) return changed;
+      const withdrawn = withdrawQuestions(changed.party);
       return {
         ...changed,
-        party: noteMember(changed.party, member.id, member),
+        party: noteMember(withdrawn.party, member.id, member),
         acted: changed.party !== party,
+        withdrawn: withdrawn.released,
       };
     });
     if (!result) return { kind: 'gone' };
     if (!result.ok) return { kind: 'refused', reason: result.reason };
-    const { party, acted } = result;
+    const { party, acted, withdrawn } = result;
     const attendee = attendeeOf(party, member.id);
     if (result.written) posts.changed(partyId);
     if (acted) {
@@ -279,10 +298,13 @@ export class AttendanceService {
         if (typeof text === 'object') lines.say(party.forumPostId, text.text, text.key);
         else if (text) lines.say(party.forumPostId, text, `member:${member.id}`);
       }
-      this.settleQuestions(party);
     }
+    if (withdrawn.length > 0 && party.forumPostId !== null) {
+      lines.say(party.forumPostId, WITHDRAWN_LINE, `withdrawn:${member.id}`);
+    }
+    if (acted || withdrawn.length > 0) this.settleQuestions(party);
     const { ok: _ok, written: _written, ...rest } = result;
-    return { ...(rest as unknown as Extra), kind: 'ok', party, attendee, acted };
+    return { ...(rest as unknown as Extra), kind: 'ok', party, attendee, acted, withdrawn };
   }
 
   private inBackground(work: Promise<void>, partyId: string, what: string): void {
@@ -330,58 +352,76 @@ export class AttendanceService {
 
   /**
    * Asks these members in the post whether they completed the raid, with the two answer buttons,
-   * and remembers the message so that it can be removed once nobody is left to answer. For the
-   * Done button and command, and for the scheduler when a group's meeting time has passed.
+   * and remembers the message with the members it asked, so that it can be removed once none of
+   * them is left to answer. For the Done button and command, and for the scheduler when a
+   * group's meeting time has passed. When the question cannot be sent, the members are present
+   * again: nobody is left asked without a question.
    */
   async ask(party: Party, members: readonly string[]): Promise<void> {
     const { gateway, store, settings } = this.options;
     const postId = party.forumPostId;
     if (postId === null || members.length === 0) return;
     const question = completionQuestion(party.id, members, settings.raidCompleteTimeout);
-    const users = await this.pingable(members, () => true);
-    // A message into the post of a party that has ended would open an archived post again.
-    if (!store.get(party.id)) return;
-    const messageId = await gateway.sendMessage(postId, { ...question, mention: { users } });
+    let messageId: string | undefined;
+    try {
+      const users = await this.pingable(members, () => true);
+      // A message into the post of a party that has ended would open an archived post again.
+      if (!store.get(party.id)) return;
+      messageId = await gateway.sendMessage(postId, { ...question, mention: { users } });
+    } catch (err) {
+      await this.release(party.id, members);
+      throw err;
+    }
     if (messageId === undefined) return;
+    const sent = messageId;
     let dropped: string[] = [];
     let recorded = false;
     try {
       const result = await store.update(party.id, (current) => {
-        if (!anyoneAsked(current)) return {};
-        const all = [...current.prompts.completion, messageId];
-        dropped = all.slice(0, Math.max(0, all.length - MAX_COMPLETION_PROMPTS));
+        if (!stillAsked(current, members)) return {};
+        const all = [...current.prompts.completion, { id: sent, members: [...members] }];
+        dropped = all.slice(0, Math.max(0, all.length - MAX_COMPLETION_PROMPTS)).map((q) => q.id);
         const completion = all.slice(-MAX_COMPLETION_PROMPTS);
         return { party: { ...current, prompts: { ...current.prompts, completion } } };
       });
       recorded = result?.written ?? false;
     } finally {
-      // Not recorded: everybody answered while the question was on its way, the party ended, or
-      // the write failed. A question nobody remembers would stay in the post for good.
-      await this.deleteMessages(postId, recorded ? dropped : [messageId]);
+      // Not recorded: everybody answered while the question was on its way, it was withdrawn,
+      // the party ended, or the write failed. A question nobody remembers would stay for good.
+      await this.deleteMessages(postId, recorded ? dropped : [sent]);
     }
   }
 
-  /** Removes the completion questions of a party once nobody is left to answer them. */
+  /** Those of `members` who are still asked are present again; the post is shown anew. */
+  private async release(partyId: string, members: readonly string[]): Promise<void> {
+    const { store, posts, log } = this.options;
+    try {
+      const result = await store.update(partyId, (current) => releaseAsked(current, members));
+      if (result?.written) posts.changed(partyId);
+    } catch (err) {
+      log.warn({ err, party: partyId }, 'could not take back a question that was not sent');
+    }
+  }
+
+  /** Removes the completion questions of a party that have nobody left to answer them. */
   private settleQuestions(party: Party): void {
-    if (party.prompts.completion.length === 0 || anyoneAsked(party)) return;
+    if (servedQuestions(party).length === 0) return;
     this.inBackground(this.removeQuestions(party.id), party.id, 'remove a completion question');
   }
 
   /**
-   * Deletes the completion questions of a party when nobody is asked any more. A question that
-   * could not be deleted stays remembered and is tried again the next time. Also for the
-   * scheduler, after it has completed those who did not answer.
+   * Deletes the completion questions of a party that none of the members they asked has still
+   * to answer. A question that could not be deleted stays remembered and is tried again the next
+   * time. Also for the scheduler, after it has completed those who did not answer.
    */
   async removeQuestions(partyId: string): Promise<void> {
     const { store } = this.options;
-    let questions: readonly string[] = [];
+    let questions: string[] = [];
     let postId: string | null = null;
     // Decided inside the store, without a write.
     await store.update(partyId, (current) => {
-      if (!anyoneAsked(current)) {
-        questions = current.prompts.completion;
-        postId = current.forumPostId;
-      }
+      questions = servedQuestions(current).map((question) => question.id);
+      postId = current.forumPostId;
       return {};
     });
     if (postId === null || questions.length === 0) return;
@@ -392,7 +432,7 @@ export class AttendanceService {
         ...current,
         prompts: {
           ...current.prompts,
-          completion: current.prompts.completion.filter((id) => !gone.has(id)),
+          completion: current.prompts.completion.filter((question) => !gone.has(question.id)),
         },
       },
     }));
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/party/attendance.test.ts src/domain/party/party-state.test.ts src/services/attendance-service.test.ts`
Expected: PASS (the files of `src/domain/party` and `src/services/attendance-service.ts`).

Run: `npx vitest run --project db src/db/repositories/party-repository.db.test.ts` (Docker; allow ten minutes)
Expected: PASS.

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/parties/reply.ts src/db/repositories/party-repository.db.test.ts src/domain/party/attendance.test.ts src/domain/party/attendance.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/services/attendance-service.test.ts src/services/attendance-service.ts
npm run check
git add src/commands/parties/reply.ts src/db/repositories/party-repository.db.test.ts src/domain/party/attendance.test.ts src/domain/party/attendance.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/services/attendance-service.test.ts src/services/attendance-service.ts
git commit -m "Party state v3: a completion question knows whom it asked; a mis-tapped Done is taken back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,651 unit tests.

---

### Task 2: Ending a party: the post archived and locked, and the sweep

**Files:**
- Create: `src/services/party-service.end.test.ts`
- Modify: `src/db/repositories/party-repository.db.test.ts`, `src/db/repositories/party-repository.ts`, `src/discord/party-gateway.ts`, `src/services/coalescer.ts`, `src/services/party-service.ts`, `src/services/party-store.ts`, `test/support/fake-gateway.ts`, `test/support/parties.ts`

**Interfaces:**
- Consumes: `PartyGateway`, `FakePartyGateway`; `Coalescer`; `PartyService` (`ended`, `view`, `editPostOf`, the `posts` coalescer); `PartyStore.update`, `PartyStorage`; `endParty`; Task 1 (`prompts.completion` as records).
- Produces: `PartyGateway.archivePost(postId): Promise<boolean>` and `openPosts(forumId): Promise<string[] | undefined>`; `Coalescer.idle(key): Promise<void>`; `PartyStorage.endedPosts(forumPostIds): Promise<string[]>` (repository and memory storage) and `PartyStore.endedPosts`; `PartyService.end(partyId, onlyIf?: (party: RaidParty) => boolean): Promise<boolean>` and `PartyService.sweepPosts(): Promise<number>`; the fake gateway's `FakePost.archived`, `locked`, `reopened` and its `foreign` set.

The discord.js half of `archivePost` and `openPosts` has no unit test, like the rest of `DiscordPartyGateway`; the staging run is its test. `end` decides inside its own `store.update` (`onlyIf`), never before it. The fake gateway opens an archived post again for anything edited or sent in it and counts that in `reopened`: the tests assert `reopened: 0` and that `archivePost` is the last call on the post.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -13,6 +13,11 @@ export interface FakePost {
   message: OutgoingMessage;
   tagIds: string[];
   pinned: boolean;
+  /** Archived and locked by `archivePost`; anything sent or edited in the post opens it again. */
+  archived: boolean;
+  locked: boolean;
+  /** How often something opened the post again after it was archived. */
+  reopened: number;
   /** How often the first message was edited, the title changed, the tags set. */
   edits: number;
   renames: number;
@@ -34,7 +39,8 @@ type Method = keyof PartyGateway;
  *
  * It is as strict as Discord where tests rely on it: a message needs content or an embed, a title
  * is 1 to 100 characters, a post has at most five tags, all of the forum, a forum has one pinned
- * post, and nothing can be sent into a forum.
+ * post, and nothing can be sent into a forum. Like Discord, it opens an archived post again for
+ * anything that is edited or sent in it.
  *
  * Its answers come on `setImmediate`, so a test that needs a fixed time must fake only `Date`
  * (`vi.useFakeTimers({ toFake: ['Date'] })`), never all timers.
@@ -60,6 +66,8 @@ export class FakePartyGateway implements PartyGateway {
   readonly renameLater = new Map<string, number>();
   /** The ids of the posts deleted with `deletePost`, in order. */
   readonly deletedPosts: string[] = [];
+  /** Posts that somebody else made in a forum: `openPosts` leaves them out. */
+  readonly foreign = new Set<string>();
   /** The ids of the forums deleted with `deleteChannel`, in order. */
   readonly deletedChannels: string[] = [];
   readonly failing = new Map<Method, Error>();
@@ -181,6 +189,9 @@ export class FakePartyGateway implements PartyGateway {
         message: post.message,
         tagIds: [...post.tagIds],
         pinned: false,
+        archived: false,
+        locked: false,
+        reopened: 0,
         edits: 0,
         renames: 0,
         retags: 0,
@@ -189,13 +200,11 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
-  private onPost(method: Method, postId: string, change: (post: FakePost) => void) {
-    return this.attempt(method, postId, () => {
-      const post = this.posts.get(postId);
-      if (!post || this.gone.has(postId)) return false;
-      change(post);
-      return true;
-    });
+  /** What Discord does to an archived post when something is edited or sent in it. */
+  private static reopen(post: FakePost): void {
+    if (!post.archived) return;
+    post.archived = false;
+    post.reopened++;
   }
 
   postInfo(postId: string) {
@@ -211,6 +220,7 @@ export class FakePartyGateway implements PartyGateway {
       const post = this.posts.get(postId);
       if (!post || this.gone.has(postId) || this.messageGone.has(postId)) return false;
       this.checkPicture(message);
+      FakePartyGateway.reopen(post);
       post.message = message;
       post.edits++;
       return true;
@@ -224,6 +234,7 @@ export class FakePartyGateway implements PartyGateway {
       FakePartyGateway.checkTitle(title);
       const laterMs = this.renameLater.get(postId);
       if (laterMs !== undefined) return { laterMs };
+      FakePartyGateway.reopen(post);
       post.title = title;
       post.renames++;
       return 'renamed' as const;
@@ -236,6 +247,7 @@ export class FakePartyGateway implements PartyGateway {
       if (!post || this.gone.has(postId)) return false;
       const forum = this.forums.get(post.forumId);
       if (forum) FakePartyGateway.checkTags(forum, tagIds);
+      FakePartyGateway.reopen(post);
       post.tagIds = [...tagIds];
       post.retags++;
       return true;
@@ -253,11 +265,31 @@ export class FakePartyGateway implements PartyGateway {
       ) {
         throw new Error('Maximum number of pinned threads reached');
       }
+      FakePartyGateway.reopen(post);
       post.pinned = true;
       return true;
     });
   }
 
+  archivePost(postId: string) {
+    return this.attempt('archivePost', postId, () => {
+      const post = this.posts.get(postId);
+      if (!post || this.gone.has(postId)) return false;
+      post.archived = true;
+      post.locked = true;
+      return true;
+    });
+  }
+
+  openPosts(forumId: string) {
+    return this.attempt('openPosts', forumId, () => {
+      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
+      return this.postsIn(forumId)
+        .filter((post) => !post.archived && !this.gone.has(post.id) && !this.foreign.has(post.id))
+        .map((post) => post.id);
+    });
+  }
+
   deletePost(postId: string) {
     return this.attempt('deletePost', postId, () => {
       if (this.posts.delete(postId)) this.deletedPosts.push(postId);
@@ -274,6 +306,8 @@ export class FakePartyGateway implements PartyGateway {
     return this.attempt('sendMessage', channelId, () => {
       if (this.gone.has(channelId) || this.forums.has(channelId)) return undefined;
       FakePartyGateway.checkMessage(message);
+      const post = this.posts.get(channelId);
+      if (post) FakePartyGateway.reopen(post);
       const id = this.id();
       this.messages.push({ id, channelId, message });
       return id;
```

Apply to `test/support/parties.ts`:

```diff
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -172,6 +172,15 @@ export class MemoryPartyStorage implements PartyStorage {
     });
   }
 
+  endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
+    return this.attempt(() =>
+      [...this.rows.values()]
+        .filter((party) => party.status === 'ended' && party.forumPostId !== null)
+        .map((party) => party.forumPostId ?? '')
+        .filter((id) => forumPostIds.includes(id)),
+    );
+  }
+
   listActive(): Promise<PartyList> {
     return this.attempt(() => ({
       parties: [...this.rows.values()]
```

- [ ] **Step 2: Write the failing tests**

Apply to `src/db/repositories/party-repository.db.test.ts`:

```diff
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -295,6 +295,21 @@ describe('PartyRepository', () => {
     expect(active[0]?.attendees[ALICE]?.name).toBe('Alice');
   });
 
+  it('says which of some posts belong to an ended party', async () => {
+    const posted = (n: number, post: string): RaidParty => ({
+      ...testRaid({ id: ID(n) }),
+      forumChannelId: FORUM,
+      forumPostId: post,
+    });
+    await parties.insert(posted(1, '1234567890123456711'));
+    await parties.insert(endParty(posted(2, '1234567890123456712')));
+    await parties.insert(endParty(posted(3, '1234567890123456713')));
+    await parties.insert(endParty(testRaid({ id: ID(4) })));
+    const asked = ['1234567890123456711', '1234567890123456712', '1234567890123456799'];
+    await expect(parties.endedPosts(asked)).resolves.toEqual(['1234567890123456712']);
+    await expect(parties.endedPosts([])).resolves.toEqual([]);
+  });
+
   it('lists ended parties older than a moment, for the sweep, and deletes one', async () => {
     const ended = (n: number, updatedAt: number): RaidParty => ({
       ...endParty(testRaid({ id: ID(n) })),
```

Create `src/services/party-service.end.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { PartyStatus } from '../domain/party/status.js';
import { Coalescer } from './coalescer.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const yveltal = { boss: { key: 'yveltal' } } as const;

describe('PartyService.end', () => {
  it('ends the party, strips the controls, deletes the link line and archives the post', async () => {
    const made = await reportedRaid(yveltal);
    const { service, store, gateway, postId } = made;
    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
    expect(gateway.posts.get(postId)?.message.components?.length).toBeGreaterThan(0);

    expect(await service.end(made.party.id)).toBe(true);

    expect(store.get(made.party.id)).toBeUndefined();
    expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(post?.message.components).toEqual([]);
    expect(post?.message.embeds).toHaveLength(1);
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    // The archiving is the last thing that happens to the post.
    const calls = gateway.calls.filter((call) => call.endsWith(` ${postId}`));
    expect(calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('answers false for a party that is not active, and does nothing', async () => {
    const made = await reportedRaid();
    await made.service.end(made.party.id);
    const before = made.gateway.calls.length;
    expect(await made.service.end(made.party.id)).toBe(false);
    expect(await made.service.end('00000000-0000-4000-8000-00000000ffff')).toBe(false);
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('deletes the open questions and the warning, and nothing opens the post again', async () => {
    const made = await reportedRaid(yveltal);
    const { service, attendance, store, gateway, postId } = made;
    const id = made.party.id;
    await attendance.signUp(id, alice, PartyStatus.Present);
    await attendance.signUp(id, bob, PartyStatus.Present);
    await attendance.done(id, alice);
    await attendance.flush();
    const warning = await gateway.sendMessage(postId, { content: 'This post will be archived.' });
    await store.update(id, (party) => ({
      party: { ...party, prompts: { ...party.prompts, warning: warning ?? null } },
    }));
    const [question] = made.current().prompts.completion;
    expect(question).toBeDefined();

    // A change and a line are on their way when the party ends.
    await attendance.changeNumber(id, bob, 1);
    await service.end(id);
    await attendance.flush();
    await service.flush();

    const deleted = gateway.deleted.map((gone) => gone.messageId);
    expect(deleted).toContain(question?.id);
    expect(deleted).toContain(warning);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.calls.filter((call) => call.endsWith(` ${postId}`)).at(-1)).toBe(
      `archivePost ${postId}`,
    );
  });

  it('brings the summary of the region up to date', async () => {
    const made = await reportedRaid();
    const { service, gateway, regions } = made;
    const west = regions.byId(1);
    if (!west) throw new Error('no region');
    await service.ensureSummary(west);
    await service.flush();
    const summary = regions.byId(1)?.summaryMessageId ?? '';
    expect(gateway.posts.get(summary)?.message.content).toContain(made.postId);
    await service.end(made.party.id);
    await service.flush();
    expect(gateway.posts.get(summary)?.message.content).not.toContain(made.postId);
  });

  it('ends the party quietly when its post is gone', async () => {
    const made = await reportedRaid();
    made.gateway.gone.add(made.postId);
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.calls.some((call) => call.startsWith('archivePost'))).toBe(false);
    expect(made.entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
  });

  it('ends the party although Discord fails, with a warning for each step', async () => {
    const made = await reportedRaid();
    const { service, gateway, postId } = made;
    for (const method of ['deleteMessage', 'editPost', 'archivePost'] as const) {
      gateway.failing.set(method, new Error(`${method} failed`));
    }
    expect(await service.end(made.party.id)).toBe(true);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    expect(made.entries.filter((entry) => entry.level === 40).map((entry) => entry.msg)).toEqual([
      'could not delete the link to an ended party',
      'could not show an ended party one last time',
      'could not archive the post of an ended party',
    ]);

    // The sweep archives what stayed open.
    gateway.failing.clear();
    expect(await service.sweepPosts()).toBe(1);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
  });

  it('stays active when the write fails, so that the scheduler tries again', async () => {
    const made = await reportedRaid();
    made.storage.failing = new Error('database down');
    await expect(made.service.end(made.party.id)).rejects.toThrow('database down');
    made.storage.failing = undefined;
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(await made.service.end(made.party.id)).toBe(true);
  });

  it('lets a render that is under way finish before it archives', async () => {
    const made = await reportedRaid();
    const { service, attendance, gateway, postId } = made;
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    // The render starts (its edit is on its way) and the party ends in the same moment.
    const rendering = service.flush();
    const ending = service.end(made.party.id);
    await Promise.all([rendering, ending]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, reopened: 0 });
    expect(gateway.calls.filter((call) => call.endsWith(` ${postId}`)).at(-1)).toBe(
      `archivePost ${postId}`,
    );
  });
});

describe('PartyService.sweepPosts', () => {
  it('archives the post of an ended party that is open again, and nothing else', async () => {
    const made = await reportedRaid();
    const { service, gateway, regions } = made;
    const west = regions.byId(1);
    if (!west) throw new Error('no region');
    await service.ensureSummary(west);
    const summary = regions.byId(1)?.summaryMessageId ?? '';
    const post = { title: 'T5 egg · Lost', message: { content: 'x' }, tagIds: [] };
    // A post no party ever had, and one a member made.
    const orphan = (await gateway.createPost(WEST_FORUM, post)) ?? '';
    const byMember = (await gateway.createPost(WEST_FORUM, post)) ?? '';
    gateway.foreign.add(byMember);
    // A second raid that has ended, whose post a late message opened again.
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('no gym');
    const second = await service.reportRaid({
      gym,
      reporterId: ALICE,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T3', shadow: false },
      boss: null,
    });
    if (second.kind !== 'created') throw new Error(second.kind);
    const ended = second.party.forumPostId ?? '';
    await service.end(second.party.id);
    await gateway.sendMessage(ended, { content: 'late' });
    expect(gateway.posts.get(ended)).toMatchObject({ archived: false, reopened: 1 });

    expect(await service.sweepPosts()).toBe(1);
    expect(gateway.posts.get(ended)).toMatchObject({ archived: true, locked: true });
    for (const left of [orphan, byMember, summary, made.postId]) {
      expect(gateway.posts.get(left)?.archived, left).toBe(false);
    }
    expect(await service.sweepPosts()).toBe(0);
  });

  it('goes on with the other forums when one cannot be listed', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('openPosts', new Error('no'));
    expect(await made.service.sweepPosts()).toBe(0);
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'could not look for open posts of ended parties',
      ),
    ).toHaveLength(2);
  });
});

describe('PartyService.end with a condition', () => {
  it('ends only when the condition holds for the party as it is stored then', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    expect(await made.service.end(id, () => false)).toBe(false);
    expect(made.store.get(id)).toBeDefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(await made.service.end(id, (party) => party.id === id)).toBe(true);
    expect(made.store.get(id)).toBeUndefined();
  });

  it('sees a change that was stored between the decision to end and the ending', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    // Both are queued together: the change is written first, then the ending decides.
    const saved = made.store.update(id, (party) => ({ party: { ...party, saved: true } }));
    const ending = made.service.end(id, (party) => !party.saved);
    await saved;
    expect(await ending).toBe(false);
    expect(made.store.get(id)?.saved).toBe(true);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });
});

describe('Coalescer.idle', () => {
  it('waits for the run that is going on and the one that follows it at once', async () => {
    const started: number[] = [];
    let release: (() => void)[] = [];
    const coalescer = new Coalescer<string>({
      delayMs: 0,
      work: () =>
        new Promise<void>((resolve) => {
          started.push(started.length);
          release.push(resolve);
        }),
      onError: () => undefined,
    });
    await coalescer.idle('a');
    coalescer.request('a');
    coalescer.request('a');
    let idle = false;
    const waiting = coalescer.idle('a').then(() => {
      idle = true;
    });
    release[0]?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(idle).toBe(false);
    expect(started).toHaveLength(2);
    release[1]?.();
    await waiting;
    expect(idle).toBe(true);
    release = [];
  });
});
```

Run: `npx vitest run --project unit src/services/party-service.end.test.ts`
Expected: FAIL (`end`, `sweepPosts` and `Coalescer.idle` do not exist).

- [ ] **Step 3: The implementation**

Apply to `src/db/repositories/party-repository.ts`:

```diff
--- a/src/db/repositories/party-repository.ts
+++ b/src/db/repositories/party-repository.ts
@@ -32,6 +32,8 @@ export interface PartyStorage {
   save(party: Party): Promise<boolean>;
   /** Every party that has not ended, oldest first. */
   listActive(): Promise<PartyList>;
+  /** Those of these forum posts that are the post of a party that has ended. */
+  endedPosts(forumPostIds: readonly string[]): Promise<string[]>;
 }
 
 const epoch = (value: string | null): number | null => (value === null ? null : Number(value));
@@ -182,6 +184,17 @@ export class PartyRepository implements PartyStorage {
     return listOf(rows);
   }
 
+  async endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
+    if (forumPostIds.length === 0) return [];
+    const rows = await this.db
+      .selectFrom('Party')
+      .select('forumPostId')
+      .where('status', '=', 'ended')
+      .where('forumPostId', 'in', [...forumPostIds])
+      .execute();
+    return rows.map((row) => row.forumPostId).filter((id): id is string => id !== null);
+  }
+
   /** Removes a party for good. Returns false when there was none. */
   async delete(id: string): Promise<boolean> {
     const result = await this.db.deleteFrom('Party').where('id', '=', id).executeTakeFirst();
```

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -80,6 +80,17 @@ export interface PartyGateway {
    * Pins the post in its forum (a forum has one pinned post). Needs Manage Threads.
    */
   pinPost(postId: string): Promise<boolean>;
+  /**
+   * Archives and locks a post: it leaves the forum's list of active posts and members can no
+   * longer write in it. False when it is gone. Anything sent or edited in it afterwards would
+   * open it again, so this is the last thing done to a post.
+   */
+  archivePost(postId: string): Promise<boolean>;
+  /**
+   * The posts of a forum that are not archived and that this bot made (members can make posts
+   * in a forum too), oldest first. Undefined when the forum is gone.
+   */
+  openPosts(forumId: string): Promise<string[] | undefined>;
   /** Deletes a post (its thread); one that is already gone is fine. */
   deletePost(postId: string): Promise<void>;
   /** Deletes a channel, such as a forum made a moment ago; one that is already gone is fine. */
@@ -314,6 +325,29 @@ export class DiscordPartyGateway implements PartyGateway {
     });
   }
 
+  async archivePost(postId: string): Promise<boolean> {
+    const post = await this.post(postId);
+    if (!post) return false;
+    if (post.archived && post.locked) return true;
+    return this.done(async () => {
+      // Discord changes nothing but `archived` on an archived thread: open it to lock it.
+      await this.reopen(post);
+      await post.edit({ locked: true, archived: true });
+    });
+  }
+
+  async openPosts(forumId: string): Promise<string[] | undefined> {
+    const forum = await this.forum(forumId);
+    if (!forum) return undefined;
+    const active = await this.unlessGone(() => forum.threads.fetchActive());
+    if (!active) return undefined;
+    const me = this.client.user?.id;
+    return [...active.threads.values()]
+      .filter((thread) => thread.ownerId === me)
+      .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
+      .map((thread) => thread.id);
+  }
+
   async deletePost(postId: string): Promise<void> {
     const post = await this.post(postId);
     if (!post) return;
```

Apply to `src/services/coalescer.ts`:

```diff
--- a/src/services/coalescer.ts
+++ b/src/services/coalescer.ts
@@ -104,6 +104,14 @@ export class Coalescer<K> {
     }
   }
 
+  /**
+   * Resolves once no run for this key is going on, including one that follows it at once. A run
+   * that is waiting for its delay is not started.
+   */
+  async idle(key: K): Promise<void> {
+    for (let run = this.running.get(key); run; run = this.running.get(key)) await run;
+  }
+
   /** Refuses every later request, then flushes. */
   async stop(): Promise<void> {
     this.stopped = true;
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -537,6 +537,108 @@ export class PartyService {
     this.summaries.request(regionId);
   }
 
+  /**
+   * Ends a party: it leaves the store first, so nothing shows or says anything in its post any
+   * more; then the messages the bot would otherwise leave behind are deleted (open completion
+   * questions, the archive warning, the link line in the region's channel), the post is shown
+   * one last time, without its controls, and it is archived and locked. False when there is no
+   * such active party.
+   *
+   * `onlyIf` is asked inside the store, about the party as it is at that moment: the scheduler
+   * passes "still due", because a correction of the raid's times may have been stored since
+   * its tick decided. False when it says no.
+   *
+   * What fails on Discord's side after the party has ended is logged and not tried again here;
+   * a post that stayed open is archived by `sweepPosts`.
+   */
+  async end(partyId: string, onlyIf?: (party: RaidParty) => boolean): Promise<boolean> {
+    const result = await this.options.store.update(partyId, (party) =>
+      onlyIf && !onlyIf(party) ? {} : { party: endParty(party) },
+    );
+    if (!result?.written || !result.party) return false;
+    const party = result.party;
+    this.ended(party);
+    await this.closePost(party);
+    return true;
+  }
+
+  /** What `end` does on Discord for a party that has left the store. Never rejects. */
+  private async closePost(party: RaidParty): Promise<void> {
+    const { gateway, regions, log } = this.options;
+    const postId = party.forumPostId;
+    const attempt = async (what: string, work: () => Promise<unknown>): Promise<void> => {
+      try {
+        await work();
+      } catch (err) {
+        log.warn({ err, party: party.id, post: postId }, `could not ${what}`);
+      }
+    };
+    const regionChannel = party.regionId === null ? undefined : regions.byId(party.regionId);
+    const linkId = party.regionLinkMessageId;
+    if (regionChannel && linkId !== null) {
+      await attempt('delete the link to an ended party', () =>
+        gateway.deleteMessage(regionChannel.channelId, linkId),
+      );
+    }
+    if (postId === null) return;
+    // A render that was under way when the party ended would open the post again.
+    await this.posts.idle(party.id);
+    const leftovers = [
+      ...party.prompts.completion.map((question) => question.id),
+      ...(party.prompts.warning === null ? [] : [party.prompts.warning]),
+    ];
+    for (const messageId of leftovers) {
+      await attempt('delete a message of an ended party', () =>
+        gateway.deleteMessage(postId, messageId),
+      );
+    }
+    let there = true;
+    await attempt('show an ended party one last time', async () => {
+      const rendered = renderRaidPost(this.view(party));
+      const last = { ...rendered, message: { ...rendered.message, components: [] } };
+      there = await this.editPostOf(party.id, postId, last);
+    });
+    if (!there) {
+      log.info({ party: party.id, post: postId }, 'the post of an ended party is gone');
+      return;
+    }
+    await attempt('archive the post of an ended party', () => gateway.archivePost(postId));
+  }
+
+  /**
+   * Archives the open posts in the party forums that belong to a party that has ended: one whose
+   * archiving failed, or one that a late message opened again. Only a post that the database
+   * says is an ended party's is touched: an open post without any party (a report that was cut
+   * off, a post of another installation that uses the same bot account) is left alone, and so
+   * are the summary posts, posts of members, and the post of a party whose row cannot be read.
+   * Gives how many it archived. Never rejects.
+   */
+  async sweepPosts(): Promise<number> {
+    const { gateway, regions, store, log } = this.options;
+    let archived = 0;
+    for (const region of regions.all()) {
+      const forumId = region.forumChannelId;
+      if (forumId === null) continue;
+      try {
+        const open = (await gateway.openPosts(forumId)) ?? [];
+        for (const postId of await store.endedPosts(open)) {
+          // Not while it is somebody's again (a post id is never reused, so this cannot be).
+          if (store.byPost(postId)) continue;
+          if (await gateway.archivePost(postId)) {
+            archived++;
+            log.info(
+              { post: postId, region: region.id },
+              'archived the open post of an ended party',
+            );
+          }
+        }
+      } catch (err) {
+        log.warn({ err, region: region.id }, 'could not look for open posts of ended parties');
+      }
+    }
+    return archived;
+  }
+
   /**
    * Does everything that is waiting now, and cancels the timers of titles and tags that wait for
    * a rate limit, so what they wait for is not retried. For shutdown and for tests: stop whatever
```

Apply to `src/services/party-store.ts`:

```diff
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -188,6 +188,14 @@ export class PartyStore implements PartyProvider {
     return this.gymLocks.run(gymId, work);
   }
 
+  /**
+   * Those of these forum posts that are the post of a party that has ended, from the database:
+   * ended parties are not kept in memory.
+   */
+  endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
+    return this.options.storage.endedPosts(forumPostIds);
+  }
+
   /** Resolves once every change and add in flight or waiting has finished (for shutdown). */
   async whenIdle(): Promise<void> {
     await Promise.all([this.locks.whenIdle(), this.gymLocks.whenIdle()]);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/services/party-service.end.test.ts`
Expected: PASS (`src/services/party-service.ts`, `src/services/coalescer.ts`, the gateway and the storages).

Run: `npx vitest run --project db src/db/repositories/party-repository.db.test.ts` (Docker; allow ten minutes)
Expected: PASS.

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/db/repositories/party-repository.db.test.ts src/db/repositories/party-repository.ts src/discord/party-gateway.ts src/services/coalescer.ts src/services/party-service.end.test.ts src/services/party-service.ts src/services/party-store.ts test/support/fake-gateway.ts test/support/parties.ts
npm run check
git add src/db/repositories/party-repository.db.test.ts src/db/repositories/party-repository.ts src/discord/party-gateway.ts src/services/coalescer.ts src/services/party-service.end.test.ts src/services/party-service.ts src/services/party-store.ts test/support/fake-gateway.ts test/support/parties.ts
git commit -m "Parties end: the post is archived and locked, leftovers deleted; open posts of ended parties are swept" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,664 unit tests.

---

### Task 3: The party clock: PartyScheduler

**Files:**
- Create: `src/services/party-scheduler.test.ts`, `src/services/party-scheduler.ts`
- Modify: `src/domain/party/tick.ts`, `src/services/party-service.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: `partyTick`, `tickAutoset`, `TickEffect`, `TickInput` (plan 2B); Task 2 (`PartyService.end`, `sweepPosts`); `PartyService.changed`, `rules`, `view`, `ensureSummary`; `AttendanceService.ask`, `removeQuestions`; `PartyLines.say`; `PartyGateway.sendMessage`, `deleteMessage`.
- Produces: `PartyScheduler` (`src/services/party-scheduler.ts`): `start(ready?: Promise<unknown>): Promise<void>`, `stop(): Promise<void>`, `tick(): Promise<void>`; `PartySchedulerOptions`; `PartyService.checkSummaries(): Promise<void>`; `partyTick` no longer asks the group of an egg; test support: `partyServiceWith()` returns `scheduler`, `lines`, `log`, `settings` and takes a third argument `kept`, `restarted(made)`, the type `Outliving`.

The scheduler never runs by itself in tests: a test moves `clock.now` and calls `tick()`. `start` does not render every post itself: the first tick has `previous === null`, which makes `partyTick` ask for a render of every party. The upkeep (sweep and summaries) runs in `start` and then hourly from `tick`; `stop` waits for both.

- [ ] **Step 1: Test support**

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -5,6 +5,7 @@ import {
   type UserSettings,
 } from '../../src/db/repositories/user-repository.js';
 import { PartyLines } from '../../src/services/party-lines.js';
+import { PartyScheduler } from '../../src/services/party-scheduler.js';
 import { AttendanceService } from '../../src/services/attendance-service.js';
 import type { Party } from '../../src/domain/party/party.js';
 import { FORUM_TAGS } from '../../src/render/raid-post.js';
@@ -61,6 +62,24 @@ export class TestRegions {
   };
 }
 
+/** What a restart of the bot leaves as it was: the database, Discord, and the time. */
+export interface Outliving {
+  storage: MemoryPartyStorage;
+  gateway: FakePartyGateway;
+  regions: TestRegions;
+  clock: { now: number };
+  tags: Record<typeof WEST_FORUM | typeof EAST_FORUM, Readonly<Record<string, string>>>;
+  userSettings: Map<string, Partial<UserSettings>>;
+}
+
+/**
+ * The services as they are after a restart: new ones, which remember nothing, over the same
+ * storage, gateway, regions and clock.
+ */
+export function restarted(made: Outliving, overrides: Partial<PartyServiceOptions> = {}) {
+  return partyServiceWith([], overrides, made);
+}
+
 /**
  * A party service over fakes: the invented gyms and regions (West and East have forums, which
  * exist on the fake gateway with every tag), the fixture bosses and events, a store over memory
@@ -68,25 +87,29 @@ export class TestRegions {
  *
  * `attendance` is the attendance service over the same store and gateway; its lines go out only
  * by its own `flush()`. `userSettings` holds what differs from the defaults, by member.
+ * `scheduler` is the clock over all of it: it never runs by itself, a test calls `tick()`.
+ *
+ * `kept` is what outlives a restart (see `restarted`).
  */
 export async function partyServiceWith(
   parties: readonly Party[] = [],
   overrides: Partial<PartyServiceOptions> = {},
+  kept?: Outliving,
 ) {
-  const clock = { now: PARTY_NOW };
+  const clock = kept?.clock ?? { now: PARTY_NOW };
   const now = () => clock.now;
-  const storage = new MemoryPartyStorage(parties);
+  const storage = kept?.storage ?? new MemoryPartyStorage(parties);
   const { log, entries } = createTestLogger();
   const store = new PartyStore({ storage, log, now });
   await store.load();
-  const gateway = new FakePartyGateway();
-  const tags = {
+  const gateway = kept?.gateway ?? new FakePartyGateway();
+  const tags = kept?.tags ?? {
     [WEST_FORUM]: gateway.addForum(WEST_FORUM, FORUM_TAGS, 'west-raids'),
     [EAST_FORUM]: gateway.addForum(EAST_FORUM, FORUM_TAGS, 'east-raids'),
   };
-  const regions = new TestRegions();
+  const regions = kept?.regions ?? new TestRegions();
   const settings = loadSettings(TEST_SETTINGS_PATH);
-  const userSettings = new Map<string, Partial<UserSettings>>();
+  const userSettings = kept?.userSettings ?? new Map<string, Partial<UserSettings>>();
   const users = {
     get: (snowflake: string): Promise<UserSettings> =>
       Promise.resolve({ snowflake, ...DEFAULT_USER_SETTINGS, ...userSettings.get(snowflake) }),
@@ -111,24 +134,39 @@ export async function partyServiceWith(
     renderDelayMs: 3_600_000,
     ...overrides,
   });
+  const lines = new PartyLines({
+    gateway,
+    active: (postId) => store.byPost(postId) !== undefined,
+    log,
+    delayMs: 3_600_000,
+  });
   const attendance = new AttendanceService({
     store,
     gateway,
     posts: service,
-    lines: new PartyLines({
-      gateway,
-      active: (postId) => store.byPost(postId) !== undefined,
-      log,
-      delayMs: 3_600_000,
-    }),
+    lines,
     users,
     settings,
     log,
     now,
   });
+  const raidBosses = overrides.raidBosses ?? raidBossesFixture();
+  const scheduler = new PartyScheduler({
+    store,
+    posts: service,
+    attendance,
+    lines,
+    gateway,
+    raidBosses,
+    settings,
+    log,
+    now,
+  });
   return {
     service,
     attendance,
+    scheduler,
+    lines,
     users,
     userSettings,
     store,
@@ -137,6 +175,8 @@ export async function partyServiceWith(
     regions,
     tags,
     entries,
+    log,
+    settings,
     clock,
   };
 }
```

- [ ] **Step 2: Write the failing tests**

Create `src/services/party-scheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, at, BOB, CAROL, MINUTE } from '../../test/support/parties.js';
import { reportedRaid, restarted } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { setMeetingTime } from '../domain/party/attendance.js';
import { attendeeOf } from '../domain/party/party.js';
import { setEndTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** Runs the clock at a time and lets everything it started go out. */
async function tickAt(made: Made, time: number): Promise<void> {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.attendance.flush();
  await made.service.flush();
}

/** The names of the tags a post carries. */
function tagsOf(made: Made): string[] {
  const names = Object.entries(made.tags[WEST_FORUM]);
  const applied = made.gateway.posts.get(made.postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

/** The lines said in the post, one by one. */
const lines = (made: Made): string[] => made.said().join('\n').split('\n').filter(Boolean);

describe('PartyScheduler: hatch and end', () => {
  it('does nothing while nothing is due', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    // The first tick after a start looks at every post once.
    await tickAt(made, made.clock.now);
    const before = made.gateway.calls.length;
    const stored = made.current();
    await tickAt(made, made.clock.now + 5 * MINUTE);
    expect(made.current()).toBe(stored);
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('shows the hatch in the post (boss, tags, title) and says so once', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    expect(tagsOf(made)).toEqual(['Egg', 'T5']);
    await tickAt(made, HATCH);
    expect(made.current().raid).toMatchObject({ boss: { key: 'yveltal' }, stageSeen: 'hatched' });
    expect(tagsOf(made)).toEqual(['Hatched', 'T5']);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('Yveltal · The Stacks');
    expect(lines(made)).toEqual(['The egg has hatched: **Yveltal**.']);
    await tickAt(made, HATCH + MINUTE);
    expect(lines(made)).toHaveLength(1);
  });

  it('says only that the egg has hatched when nobody knows the boss', async () => {
    const made = await reportedRaid({
      tier: { level: 'T3', shadow: false },
      time: { hatch: HATCH },
    });
    await tickAt(made, HATCH);
    expect(made.current().raid.boss).toBeNull();
    expect(lines(made)).toEqual(['The egg has hatched.']);
  });

  it('warns after the grace time and archives the post when the warning time is over', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const { gateway, postId, store } = made;
    await tickAt(made, HATCH);
    await tickAt(made, END);
    expect(tagsOf(made)).toEqual(['Ended', 'T5']);
    expect(made.current().deletionTime).toBeNull();

    // Grace 5 minutes: not at 15:20 sharp, but after it.
    await tickAt(made, END + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = END + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const deletionTime = warnedAt + 10 * MINUTE;
    expect(made.current().deletionTime).toBe(deletionTime);
    const warning = gateway.messagesIn(postId).at(-1);
    expect(warning?.message.content).toBe(
      `This raid is over. I will archive this post <t:${deletionTime / 1000}:R>; it stays readable afterwards.`,
    );
    expect(made.current().prompts.warning).toBe(warning?.id);

    await tickAt(made, deletionTime - 1);
    expect(store.get(made.party.id)).toBeDefined();
    await tickAt(made, deletionTime);
    expect(store.get(made.party.id)).toBeUndefined();
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.deleted.map((gone) => gone.messageId)).toContain(warning?.id);
    // Nothing more happens to it.
    const calls = gateway.calls.length;
    await tickAt(made, deletionTime + MINUTE);
    expect(gateway.calls).toHaveLength(calls);
  });

  it('catches up after downtime: one tick shows the end without a hatch line, the next ones archive', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, END + 30 * MINUTE);
    expect(made.current().raid).toMatchObject({ boss: { key: 'yveltal' }, stageSeen: 'ended' });
    expect(tagsOf(made)).toEqual(['Ended', 'T5']);
    expect(lines(made)).toEqual([expect.stringContaining('I will archive this post')]);
    await tickAt(made, END + 40 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('archives a raid without times when it cannot be going on any more', async () => {
    const made = await reportedRaid();
    const last = made.current().lastPossibleTime ?? 0;
    expect(last).toBe(made.party.createdAt + 105 * MINUTE);
    await tickAt(made, last + 6 * MINUTE);
    expect(made.current().deletionTime).toBe(last + 16 * MINUTE);
    await tickAt(made, last + 16 * MINUTE);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('never archives a party a moderator keeps', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.store.update(made.party.id, (party) => ({ party: { ...party, saved: true } }));
    await tickAt(made, END + 60 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('takes the warning back when a corrected time says the raid is still going on', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    const warning = made.current().prompts.warning;
    expect(warning).not.toBeNull();
    const later = END + 20 * MINUTE;
    await made.store.update(id, (party) => ({
      party: setEndTime(party, later, made.service.rules(), made.clock.now),
    }));
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, END + 7 * MINUTE);
    expect(made.current().prompts.warning).toBeNull();
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([warning]);
    expect(made.current().raid.stageSeen).toBe('hatched');
    // And it is warned again when that end has passed.
    await tickAt(made, later + 6 * MINUTE);
    expect(made.current().prompts.warning).not.toBeNull();
    expect(made.current().prompts.warning).not.toBe(warning);
  });

  it('does not archive a raid whose time was corrected while the tick was deciding', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    made.clock.now = END + 16 * MINUTE;
    // The tick is queued, and right behind it a correction of the end time.
    const ticking = made.scheduler.tick();
    const corrected = made.store.update(id, (party) => ({
      party: setEndTime(party, END + 40 * MINUTE, made.service.rules(), made.clock.now),
    }));
    await Promise.all([ticking, corrected]);
    await made.attendance.flush();
    await made.service.flush();
    expect(made.store.get(id)).toBeDefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    // The next tick takes the warning away, and the raid runs on.
    await tickAt(made, END + 17 * MINUTE);
    expect(made.current().prompts.warning).toBeNull();
  });

  it('keeps one warning: a new one takes the place of one that was left behind', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    const first = made.current().prompts.warning;
    // The archiving is called off and due again without a tick in between (the bot was down).
    await made.store.update(id, (party) => ({ party: { ...party, deletionTime: null } }));
    await tickAt(made, END + 30 * MINUTE);
    const second = made.current().prompts.warning;
    expect(second).not.toBe(first);
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([first]);
    const warnings = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.content?.includes('I will archive this post'));
    expect(warnings.map((message) => message.id)).toEqual([second]);
  });

  it('ends the party at the next tick when archiving was due but the write failed', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, END + 6 * MINUTE);
    made.storage.failing = new Error('database down');
    await tickAt(made, END + 16 * MINUTE);
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.entries.some((e) => e.msg === 'could not do what the clock asked for')).toBe(true);
    made.storage.failing = undefined;
    await tickAt(made, END + 17 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('goes on with the other parties when one cannot be stored or shown', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('no gym');
    const second = await made.service.reportRaid({
      gym,
      reporterId: ALICE,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      time: { hatch: HATCH },
    });
    if (second.kind !== 'created') throw new Error(second.kind);
    await made.service.flush();
    // The first party's post cannot take a line; the second must still hatch.
    made.gateway.gone.add(made.postId);
    await tickAt(made, HATCH);
    expect(made.store.get(second.party.id)?.raid.stageSeen).toBe('hatched');
    expect(made.gateway.posts.get(second.party.forumPostId ?? '')?.title).toBe(
      'Yveltal · Old Stone Fountain',
    );
  });
});

describe('PartyScheduler: meeting times and the completion question', () => {
  /** A hatched raid where Alice, Bob and Carol are here and the group meets at 14:40. */
  async function meeting() {
    const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { end: END } });
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    await made.store.update(id, (party) => setMeetingTime(party, ALICE, at('2026-10-13T14:40')));
    await made.attendance.flush();
    await made.service.flush();
    const questions = () =>
      made.gateway.messagesIn(made.postId).filter((message) => message.message.components?.length);
    return { made, id, questions };
  }

  it('keeps the meeting time shown for the clear time, then asks who is here', async () => {
    const { made, questions } = await meeting();
    await tickAt(made, at('2026-10-13T14:41'));
    expect(made.current().groups[0]).toMatchObject({ startClearTime: at('2026-10-13T14:50') });
    expect(questions()).toEqual([]);
    await tickAt(made, at('2026-10-13T14:51'));
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect(questions()).toHaveLength(1);
    expect(questions()[0]?.message.content).toContain(`<@${ALICE}>, <@${BOB}>, <@${CAROL}>`);
    expect(made.current().prompts.completion).toEqual([
      { id: questions()[0]?.id, members: [ALICE, BOB, CAROL] },
    ]);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.CompletePending,
      pendingUntil: at('2026-10-13T14:56'),
    });
    expect(attendeeOf(made.current(), BOB)?.askedBy).toBeUndefined();
  });

  it('does not ask the group of an egg: its meeting time just goes', async () => {
    const made = await reportedRaid({ time: { hatch: at('2026-10-13T14:55') } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.store.update(id, (party) => setMeetingTime(party, ALICE, at('2026-10-13T14:30')));
    await tickAt(made, at('2026-10-13T14:31'));
    await tickAt(made, at('2026-10-13T14:42'));
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Present);
    expect(lines(made)).toEqual([`<@${ALICE}> is here.`]);
  });

  it('counts silence as done after the timeout, says so, and removes the question', async () => {
    const { made, id, questions } = await meeting();
    await tickAt(made, at('2026-10-13T14:41'));
    await tickAt(made, at('2026-10-13T14:51'));
    await made.attendance.answer(id, bob, false);
    await tickAt(made, at('2026-10-13T14:55'));
    expect(questions()).toHaveLength(1);
    await tickAt(made, at('2026-10-13T14:56'));
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Complete);
    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.Complete);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(lines(made).at(-1)).toBe(`<@${ALICE}>, <@${CAROL}> did not answer and count as done.`);
    expect(questions()).toEqual([]);
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('keeps the promise of the Done button: who says nothing counts as done', async () => {
    const made = await reportedRaid({
      boss: { key: 'yveltal' },
      time: { end: at('2026-10-13T14:40') },
    });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    await tickAt(made, made.clock.now + 5 * MINUTE);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.Complete,
      askedBy: ALICE,
    });
    expect(lines(made).at(-1)).toBe(`<@${BOB}> did not answer and counts as done.`);
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('puts the group back to here when the question cannot be sent', async () => {
    const { made } = await meeting();
    await tickAt(made, at('2026-10-13T14:41'));
    made.gateway.failing.set('sendMessage', new Error('no'));
    await tickAt(made, at('2026-10-13T14:51'));
    made.gateway.failing.clear();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(made.entries.some((e) => e.msg === 'could not do what the clock asked for')).toBe(true);
  });
});

describe('PartyScheduler: running', () => {
  it('runs one tick at a time: a second call while one runs is the same run', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    made.clock.now = HATCH;
    const first = made.scheduler.tick();
    const second = made.scheduler.tick();
    expect(second).toBe(first);
    await first;
    await made.attendance.flush();
    expect(lines(made)).toEqual(['The egg has hatched: **Yveltal**.']);
    expect(made.scheduler.tick()).not.toBe(first);
  });

  it('shows every post anew at start, catches up, looks after the forums, and stops', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const { gateway, scheduler, regions, postId } = made;
    // What a restart forgets: the post on Discord is older than the party.
    const post = gateway.posts.get(postId);
    if (!post) throw new Error('no post');
    post.message = { content: 'stale' };
    const open = await endedButOpen(made);
    const again = await restarted(made);
    again.clock.now = HATCH + MINUTE;

    let ready: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const started = again.scheduler.start(waiting);
    await new Promise((resolve) => setImmediate(resolve));
    // Nothing happens before what it waits for: not a tick, not a call to Discord.
    expect(again.store.get(made.party.id)?.raid.stageSeen).toBe('egg');
    expect(gateway.posts.get(postId)?.message).toEqual({ content: 'stale' });
    ready();
    await started;
    await again.attendance.flush();
    await again.service.flush();

    expect(again.store.get(made.party.id)?.raid.stageSeen).toBe('hatched');
    expect(gateway.posts.get(postId)?.message.embeds).toHaveLength(1);
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    expect(gateway.posts.get(open)?.archived).toBe(true);
    expect(regions.byId(1)?.summaryMessageId).not.toBeNull();
    await again.scheduler.stop();
    await scheduler.stop();
  });

  it('starts all the same when what it waits for fails', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    made.clock.now = HATCH;
    await made.scheduler.start(Promise.reject(new Error('no events')));
    expect(made.current().raid.stageSeen).toBe('hatched');
    await made.scheduler.stop();
  });

  it('does not start when it was stopped while waiting', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    made.clock.now = HATCH;
    let ready: () => void = () => undefined;
    const started = made.scheduler.start(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    await made.scheduler.stop();
    ready();
    await started;
    expect(made.current().raid.stageSeen).toBe('egg');
  });

  it('never rejects, also when the parties cannot be listed', async () => {
    const made = await reportedRaid();
    const broken = Object.assign(Object.create(made.store) as typeof made.store, {
      active: () => {
        throw new Error('not loaded');
      },
    });
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: broken,
      posts: made.service,
      attendance: made.attendance,
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
    });
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(made.entries.some((entry) => entry.msg === 'the party clock failed')).toBe(true);
  });

  it('looks after the forums again after an hour', async () => {
    const made = await reportedRaid();
    const open = await endedButOpen(made);
    await tickAt(made, made.clock.now + 59 * MINUTE);
    expect(made.gateway.posts.get(open)?.archived).toBe(false);
    await tickAt(made, made.clock.now + MINUTE);
    expect(made.gateway.posts.get(open)?.archived).toBe(true);
  });
});

/** A second raid that has ended and whose post a late message opened again; gives the post. */
async function endedButOpen(made: Made): Promise<string> {
  const gym = gymsFixture().get(3);
  if (!gym) throw new Error('no gym');
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: BOB,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T3', shadow: false },
    boss: null,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  const postId = outcome.party.forumPostId ?? '';
  await made.service.end(outcome.party.id);
  await made.gateway.sendMessage(postId, { content: 'late' });
  return postId;
}
```

Run: `npx vitest run --project unit src/services/party-scheduler.test.ts`
Expected: FAIL (`party-scheduler.ts` does not exist).

- [ ] **Step 3: The implementation**

Apply to `src/domain/party/tick.ts`:

```diff
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -116,12 +116,10 @@ export function partyTick(party: RaidParty, input: TickInput): TickResult {
     }
     if (group.startClearTime !== undefined && now > group.startClearTime) {
       const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
-      const asked = askGroupWhetherComplete(
-        withGroup(current, rest),
-        group.id,
-        now,
-        settings.raidCompleteTimeout,
-      );
+      current = withGroup(current, rest);
+      // Nobody can have completed an egg (a meeting time from before the hatch was corrected).
+      if (raidStage(current, now) === 'egg') continue;
+      const asked = askGroupWhetherComplete(current, group.id, now, settings.raidCompleteTimeout);
       current = asked.party;
       if (asked.asked.length > 0) {
         effects.push({ kind: 'ask-complete', group: group.id, members: asked.asked });
```

Create `src/services/party-scheduler.ts`:

```ts
import type { Settings } from '../config/settings.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import type { Party } from '../domain/party/party.js';
import { partyTick, tickAutoset, type TickEffect, type TickInput } from '../domain/party/tick.js';
import type { Logger } from '../log.js';
import { fitItems, plain, timestamp } from '../render/text.js';
import type { AttendanceService } from './attendance-service.js';
import type { PartyLines } from './party-lines.js';
import type { PartyService } from './party-service.js';
import type { PartyStore } from './party-store.js';
import type { RaidBossProvider } from './raid-boss-service.js';

const HOUR_MS = 3_600_000;
/** The names in a line of the scheduler are cut so that the line stays well within a message. */
const LINE_NAMES = 1_500;

export interface PartySchedulerOptions {
  store: PartyStore;
  posts: Pick<PartyService, 'changed' | 'end' | 'rules' | 'view' | 'sweepPosts' | 'checkSummaries'>;
  attendance: Pick<AttendanceService, 'ask' | 'removeQuestions'>;
  lines: Pick<PartyLines, 'say'>;
  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
  raidBosses: Pick<RaidBossProvider, 'autoset'>;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /** How often the clock runs. Default `settings.cleanupInterval`. */
  intervalMs?: number;
  /** How often the forums are looked through for open posts and missing summaries. Default hourly. */
  upkeepMs?: number;
}

/**
 * The clock of the parties (spec 5.3). Every `cleanupInterval` it runs `partyTick` for each
 * active party inside the store and does what the tick asks for: shows the post anew, says that
 * an egg has hatched, asks a group after its meeting time, counts silence as done, warns that
 * the post will be archived, and ends the party.
 *
 * A tick compares the time with what each party records, so the first tick after a start
 * applies everything that was missed while the bot was down. The party is stored before
 * anything is done about it: what fails on Discord's side afterwards is logged and not done
 * again, except the ending, which the tick asks for until the party has ended.
 */
export class PartyScheduler {
  private readonly now: () => number;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private upkeeping: Promise<void> | undefined;
  private previous: number | null = null;
  private lastUpkeep: number;
  private stopped = false;

  constructor(private readonly options: PartySchedulerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.lastUpkeep = this.now();
  }

  /**
   * Starts the clock once `ready` has settled: the first tick catches up and shows every post
   * anew (nothing else does that after a restart), the forums are looked through once (see
   * `upkeep`), and from then on a tick runs at every interval. `ready` is for what the clock
   * must not run without: the connection to Discord (a post that cannot be asked for yet would
   * be taken for deleted) and, with a limit of the caller's, the first read of the raid events.
   * Never rejects.
   */
  async start(ready: Promise<unknown> = Promise.resolve()): Promise<void> {
    const { store, log, settings } = this.options;
    await ready.catch(() => undefined);
    if (this.stopped) return;
    await this.tick();
    if (this.stopped) return;
    await this.upkeep();
    if (this.stopped) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.options.intervalMs ?? settings.cleanupInterval,
    );
    this.timer.unref();
    log.info({ parties: store.active().length }, 'the party clock is running');
  }

  /**
   * Stops the clock and waits for what is under way. Call before the services are flushed. A
   * `start` that is still waiting for `ready` does nothing once that settles.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
    await this.upkeeping;
  }

  /**
   * One run of the clock over every active party. A tick that is asked for while one is running
   * is that same run: ticks never overlap. Never rejects.
   */
  tick(): Promise<void> {
    this.running ??= this.run()
      .catch((err: unknown) => {
        this.options.log.error({ err }, 'the party clock failed');
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async run(): Promise<void> {
    const { store, posts, raidBosses, settings, log } = this.options;
    const now = this.now();
    const input: TickInput = {
      now,
      previous: this.previous,
      settings,
      rules: posts.rules(),
      autoset: tickAutoset(raidBosses),
    };
    for (const { id } of store.active()) {
      if (this.stopped) return;
      try {
        await this.tickParty(id, input);
      } catch (err) {
        log.error({ err, party: id }, 'could not run the clock for a party');
      }
    }
    this.previous = now;
    if (now - this.lastUpkeep >= (this.options.upkeepMs ?? HOUR_MS) && !this.stopped) {
      await this.upkeep();
    }
  }

  /** Archives open posts of ended parties and looks after the summaries: at start and hourly. */
  private upkeep(): Promise<void> {
    const { posts } = this.options;
    this.lastUpkeep = this.now();
    this.upkeeping ??= (async () => {
      await posts.sweepPosts();
      await posts.checkSummaries();
    })().finally(() => {
      this.upkeeping = undefined;
    });
    return this.upkeeping;
  }

  private async tickParty(id: string, input: TickInput): Promise<void> {
    const { store, posts, log } = this.options;
    const result = await store.update(id, (party) => partyTick(party, input));
    if (!result) return;
    if (result.render) posts.changed(id);
    for (const effect of result.effects) {
      try {
        await this.act(result.party, effect);
      } catch (err) {
        log.warn({ err, party: id, effect: effect.kind }, 'could not do what the clock asked for');
      }
    }
    if (!result.effects.some((effect) => effect.kind === 'end')) await this.settleWarning(id);
  }

  private async act(party: Party, effect: TickEffect): Promise<void> {
    const { posts, attendance, lines } = this.options;
    const postId = party.forumPostId;
    switch (effect.kind) {
      case 'stage': {
        // Catching up over hatch and end at once says nothing: the raid is over.
        if (effect.from !== 'egg' || effect.to !== 'hatched' || postId === null) return;
        const boss = posts.view(party).boss?.name;
        lines.say(
          postId,
          boss === undefined ? 'The egg has hatched.' : `The egg has hatched: **${plain(boss)}**.`,
          'stage',
        );
        return;
      }
      case 'ask-complete':
        await attendance.ask(party, effect.members);
        return;
      case 'completed': {
        if (postId !== null) {
          const names = fitItems(
            effect.members.map((id) => `<@${id}>`),
            LINE_NAMES,
          );
          const verb = effect.members.length === 1 ? 'counts' : 'count';
          lines.say(postId, `${names} did not answer and ${verb} as done.`);
        }
        await attendance.removeQuestions(party.id);
        return;
      }
      case 'warn':
        await this.warn(party.id);
        return;
      case 'end':
        // Decided again inside the store: a corrected time may have been stored since the tick.
        await posts.end(
          party.id,
          (current) =>
            !current.saved && current.deletionTime !== null && this.now() >= current.deletionTime,
        );
        return;
    }
  }

  /**
   * Says in the post when it will be archived, and remembers the message to remove it again. An
   * earlier warning that is still remembered is deleted: a post has one warning, the newest.
   */
  private async warn(partyId: string): Promise<void> {
    const { store, gateway } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId ?? null;
    if (!party || postId === null || party.deletionTime === null) return;
    const messageId = await gateway.sendMessage(postId, {
      content:
        `This raid is over. I will archive this post ${timestamp(party.deletionTime, 'R')}; ` +
        'it stays readable afterwards.',
    });
    if (messageId === undefined) return;
    const replaced: { id?: string } = {};
    let recorded = false;
    try {
      const result = await store.update(partyId, (current) => {
        if (current.deletionTime === null) return {};
        if (current.prompts.warning !== null) replaced.id = current.prompts.warning;
        return { party: { ...current, prompts: { ...current.prompts, warning: messageId } } };
      });
      recorded = result?.written ?? false;
    } finally {
      // Not recorded: a corrected time called the archiving off meanwhile, or the party ended.
      const stale = recorded ? replaced.id : messageId;
      if (stale !== undefined) await gateway.deleteMessage(postId, stale);
    }
  }

  /** Removes the warning of a party whose archiving was called off (a time was corrected). */
  private async settleWarning(id: string): Promise<void> {
    const { store, gateway } = this.options;
    const stale: { message?: { postId: string; messageId: string } } = {};
    await store.update(id, (party) => {
      const { warning } = party.prompts;
      if (party.deletionTime !== null || warning === null) return {};
      if (party.forumPostId !== null) {
        stale.message = { postId: party.forumPostId, messageId: warning };
      }
      return { party: { ...party, prompts: { ...party.prompts, warning: null } } };
    });
    if (stale.message) await gateway.deleteMessage(stale.message.postId, stale.message.messageId);
  }
}
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -639,6 +639,21 @@ export class PartyService {
     return archived;
   }
 
+  /**
+   * Makes sure every region that has a forum has its summary post (one deleted by hand is
+   * noticed here at the latest) and has each brought up to date. Never rejects.
+   */
+  async checkSummaries(): Promise<void> {
+    for (const region of this.options.regions.all()) {
+      if (region.forumChannelId === null) continue;
+      try {
+        await this.ensureSummary(region);
+      } catch (err) {
+        this.options.log.warn({ err, region: region.id }, 'could not check a summary post');
+      }
+    }
+  }
+
   /**
    * Does everything that is waiting now, and cancels the timers of titles and tags that wait for
    * a rate limit, so what they wait for is not retried. For shutdown and for tests: stop whatever
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/services/party-scheduler.test.ts`
Expected: PASS (`src/services/party-scheduler.ts`, `src/domain/party/tick.ts`).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/domain/party/tick.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/services/party-service.ts test/support/party-service.ts
npm run check
git add src/domain/party/tick.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/services/party-service.ts test/support/party-service.ts
git commit -m "The party clock: hatch, questions after a meeting time, silence counts as done, warning, archive" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,687 unit tests.

---

### Task 4: Private answers to clicks, gathered

**Files:**
- Create: `src/discord/click-answers.test.ts`, `src/discord/click-answers.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/parties/reply.ts`, `src/components/party.test.ts`, `src/components/party.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Task 1 (`outcomeText`); `answerOutcome`, `PARTY_OVER`, `problemText`; `src/components/party.ts`; `AppContext`, `createTestContext`, `src/app.ts`'s shutdown steps.
- Produces: `ClickAnswers` (`src/discord/click-answers.ts`): `answer(key, interaction, content): Promise<void>`, `flush(): Promise<void>`, options `{ log, windowMs? }`; `AppContext.clickAnswers`; `answerClick(interaction, ctx, partyId, outcome, words?)` in `reply.ts`; the test context has a `ClickAnswers` with a window of zero (every click answered by itself).

Only the first interaction of a burst is ever given `editReply`: it was answered with `reply`, so `editReply` edits its private answer. The later ones were acknowledged with `deferUpdate`, where `editReply` would edit the post's own message; they are only ever given `followUp`, and only when the first answer cannot be replaced.

- [ ] **Step 1: Test support**

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -3,6 +3,7 @@ import type { AppContext } from '../../src/app-context.js';
 import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
 import { DEFAULT_USER_SETTINGS } from '../../src/db/repositories/user-repository.js';
+import { ClickAnswers } from '../../src/discord/click-answers.js';
 import type { DB } from '../../src/db/types.js';
 import type { AttendanceService } from '../../src/services/attendance-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
@@ -55,6 +56,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'attendance',
       'pass { attendance, partyService, parties, regions } from partyServiceWith()',
     ),
+    // Every click is answered by itself; a test of bursts passes its own with a window.
+    clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
     pokemon: pokemonFixture(gameData),
     maps: mapsFixture(),
```

- [ ] **Step 2: Write the failing tests**

Apply to `src/components/party.test.ts`:

```diff
--- a/src/components/party.test.ts
+++ b/src/components/party.test.ts
@@ -10,6 +10,9 @@ import {
 import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { WITHDRAWN_REPLY } from '../commands/parties/reply.js';
+import { ClickAnswers } from '../discord/click-answers.js';
 import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -17,13 +20,14 @@ import { endParty } from '../domain/party/tick.js';
 import type { RaidReport } from '../services/party-service.js';
 import { partyButtons } from './party.js';
 
-async function setup(report: Partial<RaidReport> = {}) {
+async function setup(report: Partial<RaidReport> = {}, clickAnswers?: ClickAnswers) {
   const made = await reportedRaid(report);
   const { ctx } = createTestContext({
     partyService: made.service,
     attendance: made.attendance,
     parties: made.store,
     regions: made.regions,
+    ...(clickAnswers ? { clickAnswers } : {}),
   });
   const router = new InteractionRouter(ctx, [], [partyButtons]);
   const handle = async (interaction: FakeInteraction) => {
@@ -219,3 +223,64 @@ describe('the buttons of a party post', () => {
     expect(sent(other.reply).content).toBe('You are coming.');
   });
 });
+
+describe('a burst of clicks by one member', () => {
+  const gathering = () => new ClickAnswers({ log: createTestLogger().log, windowMs: 60_000 });
+
+  it('is answered once at the start and once at the end, with how things stand then', async () => {
+    const answers = gathering();
+    const made = await setup({}, answers);
+    const join = await made.click('join');
+    const more = [await made.click('more'), await made.click('more'), await made.click('less')];
+    expect(join.reply).toHaveBeenCalledWith(privately('You are coming.'));
+    for (const click of more) {
+      expect(click.deferUpdate).toHaveBeenCalledOnce();
+      expect(click.reply).not.toHaveBeenCalled();
+    }
+    expect(made.alice()?.number).toBe(2);
+    await answers.flush();
+    expect(join.editReply).toHaveBeenCalledExactlyOnceWith({
+      content: 'You are coming with 1 more.',
+    });
+  });
+
+  it('shows a refusal at once, and still the standing at the end', async () => {
+    const answers = gathering();
+    const made = await setup({ tier: { level: 'Elite', shadow: false } }, answers);
+    const join = await made.click('join');
+    const remote = await made.click('remote');
+    const more = await made.click('more');
+    expect(sent(remote.reply).content).toBe('Elite raids can only be done in person.');
+    await answers.flush();
+    expect(join.editReply).toHaveBeenCalledExactlyOnceWith({
+      content: 'You are coming with 1 more.',
+    });
+    expect(more.reply).not.toHaveBeenCalled();
+  });
+
+  it('answers each member, and each party, by itself', async () => {
+    const answers = gathering();
+    const made = await setup({}, answers);
+    const alice = await made.click('join');
+    const bob = await made.click('join', { userId: BOB, displayName: 'Bob' });
+    expect(alice.reply).toHaveBeenCalledOnce();
+    expect(bob.reply).toHaveBeenCalledOnce();
+    await answers.flush();
+  });
+});
+
+describe('going back after Done', () => {
+  it('tells the member that the question to the others was taken back', async () => {
+    const made = await setup({ boss: { key: 'yveltal' } });
+    await made.click('here');
+    await made.click('here', { userId: BOB, displayName: 'Bob' });
+    await made.click('done');
+    await made.attendance.flush();
+    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
+    const back = await made.click('here');
+    expect(sent(back.reply).content).toBe(`You are here. ${WITHDRAWN_REPLY}`);
+    await made.attendance.flush();
+    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
+    expect(made.current().prompts.completion).toEqual([]);
+  });
+});
```

Create `src/discord/click-answers.test.ts`:

```ts
import { MessageFlags, type MessageComponentInteraction } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeButton, type FakeInteraction } from '../../test/support/fake-interactions.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ClickAnswers } from './click-answers.js';

const privately = (content: string) => ({ content, flags: MessageFlags.Ephemeral });
const real = (fake: FakeInteraction) => fake as unknown as MessageComponentInteraction;

function setup(windowMs = 60_000) {
  const { log, entries } = createTestLogger();
  return { answers: new ClickAnswers({ log, windowMs }), entries };
}

describe('ClickAnswers', () => {
  it('answers the first click at once and privately', async () => {
    const { answers } = setup();
    const click = fakeButton();
    await answers.answer('p:a', real(click), 'You are coming.');
    expect(click.reply).toHaveBeenCalledWith(privately('You are coming.'));
    expect(click.deferUpdate).not.toHaveBeenCalled();
    await answers.flush();
    expect(click.editReply).not.toHaveBeenCalled();
  });

  it('only acknowledges the clicks that follow, and then replaces the first answer by the last', async () => {
    const { answers } = setup();
    const [first, second, third] = [fakeButton(), fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'You are coming.');
    await answers.answer('p:a', real(second), 'You are coming with 1 more.');
    await answers.answer('p:a', real(third), 'You are coming with 2 more.');
    for (const later of [second, third]) {
      expect(later.deferUpdate).toHaveBeenCalledOnce();
      expect(later.reply).not.toHaveBeenCalled();
    }
    expect(first.editReply).not.toHaveBeenCalled();
    await answers.flush();
    expect(first.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'You are coming with 2 more.',
    });
    expect(third.followUp).not.toHaveBeenCalled();
  });

  it('shows it by itself when the member stops clicking for the length of the window', async () => {
    const { answers } = setup(20);
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(first.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'two' });
    // The burst is over: the next click is answered at once again.
    const next = fakeButton();
    await answers.answer('p:a', real(next), 'three');
    expect(next.reply).toHaveBeenCalledWith(privately('three'));
    await answers.flush();
  });

  it('keeps the bursts of different members and parties apart', async () => {
    const { answers } = setup();
    const [alice, bob, other] = [fakeButton(), fakeButton(), fakeButton()];
    await answers.answer('p:a', real(alice), 'a');
    await answers.answer('p:b', real(bob), 'b');
    await answers.answer('q:a', real(other), 'c');
    for (const click of [alice, bob, other]) expect(click.reply).toHaveBeenCalledOnce();
    await answers.flush();
  });

  it('says it under the last click when the first answer cannot be replaced', async () => {
    const { answers, entries } = setup();
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    first.editReply.mockRejectedValueOnce(new Error('Unknown Message'));
    await answers.flush();
    expect(second.followUp).toHaveBeenCalledExactlyOnceWith(privately('two'));
    expect(entries).toEqual([]);
  });

  it('logs a warning when the answer can be shown in neither way', async () => {
    const { answers, entries } = setup();
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    first.editReply.mockRejectedValueOnce(new Error('Unknown Message'));
    second.followUp.mockRejectedValueOnce(new Error('Unknown Webhook'));
    await answers.flush();
    expect(entries.map((entry) => entry.msg)).toEqual([
      'could not show the answer to a burst of clicks',
    ]);
  });

  it('starts anew after a first answer that could not be sent', async () => {
    const { answers } = setup();
    const failed = fakeButton();
    failed.reply.mockRejectedValueOnce(new Error('Unknown interaction'));
    await expect(answers.answer('p:a', real(failed), 'one')).rejects.toThrow('Unknown interaction');
    const next = fakeButton();
    await answers.answer('p:a', real(next), 'two');
    expect(next.reply).toHaveBeenCalledWith(privately('two'));
    await answers.flush();
  });

  it('says the answer of a click that joined a burst whose first answer then failed', async () => {
    const { answers } = setup();
    const [first, second] = [fakeButton(), fakeButton()];
    let fail: (err: Error) => void = () => undefined;
    first.reply.mockReturnValueOnce(
      new Promise<never>((_resolve, reject) => {
        fail = reject;
      }),
    );
    const opening = answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    expect(second.deferUpdate).toHaveBeenCalledOnce();
    fail(new Error('Unknown interaction'));
    await expect(opening).rejects.toThrow('Unknown interaction');
    await answers.flush();
    expect(second.followUp).toHaveBeenCalledExactlyOnceWith(privately('two'));
    expect(first.editReply).not.toHaveBeenCalled();
  });

  it('answers every click by itself with a window of zero', async () => {
    const { answers } = setup(0);
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    expect(second.reply).toHaveBeenCalledWith(privately('two'));
    expect(second.deferUpdate).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run --project unit src/components/party.test.ts src/discord/click-answers.test.ts`
Expected: FAIL (`click-answers.ts` does not exist).

- [ ] **Step 3: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -2,6 +2,7 @@ import type { Kysely } from 'kysely';
 import type { Config } from './config/index.js';
 import type { UserSettings } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
+import type { ClickAnswers } from './discord/click-answers.js';
 import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
 import type { Logger } from './log.js';
@@ -38,6 +39,8 @@ export interface AppContext {
   readonly partyService: PartyService;
   /** What members do in a party: signing up, completing, groups. Buttons and commands use it. */
   readonly attendance: AttendanceService;
+  /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
+  readonly clickAnswers: ClickAnswers;
   /** A member's settings (the defaults for a member who never changed one). */
   readonly users: { get(snowflake: string): Promise<UserSettings> };
   /** Pokémon by what members type: names, nicknames, forms. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -14,6 +14,7 @@ import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
 import { UserRepository } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
+import { ClickAnswers } from './discord/click-answers.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { enabledCommands } from './discord/command.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
@@ -120,6 +121,7 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  const clickAnswers = new ClickAnswers({ log });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
   const maps = new StaticMaps(
     config.env.GOOGLE_API_KEY,
@@ -161,6 +163,7 @@ export async function startApp(
     parties,
     partyService,
     attendance,
+    clickAnswers,
     users,
     pokemon,
     maps,
@@ -226,7 +229,8 @@ export async function startApp(
           await raidEvents.whenIdle();
         },
       },
-      // Lines and edits that are still waiting go out while Discord is connected.
+      // Answers, lines and edits that are still waiting go out while Discord is connected.
+      { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -50,14 +50,38 @@ export async function answerOutcome<Extra>(
   outcome: AttendanceOutcome<Extra>,
   words?: (ok: Ok<Extra>) => string | undefined,
 ): Promise<void> {
+  await interaction.reply({
+    content: outcomeContent(ctx, outcome, words),
+    flags: MessageFlags.Ephemeral,
+  });
+}
+
+/**
+ * The same for a click on a control of a post: the answers to a burst of clicks by one member on
+ * one party are gathered into one (`ClickAnswers`); a refusal is still shown at once.
+ */
+export async function answerClick<Extra>(
+  interaction: MessageComponentInteraction,
+  ctx: AppContext,
+  partyId: string,
+  outcome: AttendanceOutcome<Extra>,
+  words?: (ok: Ok<Extra>) => string | undefined,
+): Promise<void> {
+  const content = outcomeContent(ctx, outcome, words);
+  await ctx.clickAnswers.answer(`${partyId}:${interaction.user.id}`, interaction, content);
+}
+
+/** What the member is told for an outcome; a refusal and a party that has ended are thrown. */
+function outcomeContent<Extra>(
+  ctx: AppContext,
+  outcome: AttendanceOutcome<Extra>,
+  words?: (ok: Ok<Extra>) => string | undefined,
+): string {
   if (outcome.kind === 'gone') throw new UserError(PARTY_OVER);
   if (outcome.kind === 'refused') {
     throw new UserError(problemText(outcome.reason, ctx.attendance.limits()));
   }
-  await interaction.reply({
-    content: outcomeText(outcome as Ok<Extra>, words),
-    flags: MessageFlags.Ephemeral,
-  });
+  return outcomeText(outcome as Ok<Extra>, words);
 }
 
 /** What a member is told after an action that worked. */
```

Apply to `src/components/party.ts`:

```diff
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -1,7 +1,7 @@
 import {
   ACTION_THROTTLE,
   actingMember,
-  answerOutcome,
+  answerClick,
   doneWords,
   moreWords,
   remoteWords,
@@ -17,8 +17,9 @@ import { isPartyAction, PARTY_KIND } from '../render/party-controls.js';
 /**
  * The controls of a party's post (spec 4.1): its buttons, and the two answers under a completion
  * question. The party is named by the custom id, not by the channel, so the same controls work
- * on a copy of the message in another channel. Every click is answered privately; what it
- * changed is said in the post by the attendance service.
+ * on a copy of the message in another channel. Every click is answered privately, a burst of
+ * clicks by one member with one answer (`answerClick`); what it changed is said in the post by
+ * the attendance service.
  *
  * The throttle is one budget for all of them: generous for somebody adjusting a head count,
  * tight for somebody leaning on a button. It also holds back an answer to the completion
@@ -36,59 +37,82 @@ export const partyButtons: ComponentHandler = {
     if (!isPartyAction(id.action)) throw new UserError(STALE_COMPONENT);
     switch (id.action) {
       case 'maybe':
-        return answerOutcome(
+        return answerClick(
           interaction,
           ctx,
+          partyId,
           await attendance.signUp(partyId, member, PartyStatus.Interested),
         );
       case 'join':
-        return answerOutcome(
+        return answerClick(
           interaction,
           ctx,
+          partyId,
           await attendance.signUp(partyId, member, PartyStatus.Coming),
         );
       case 'here':
-        return answerOutcome(
+        return answerClick(
           interaction,
           ctx,
+          partyId,
           await attendance.signUp(partyId, member, PartyStatus.Present),
         );
       case 'done':
-        return answerOutcome(interaction, ctx, await attendance.done(partyId, member), doneWords);
+        return answerClick(
+          interaction,
+          ctx,
+          partyId,
+          await attendance.done(partyId, member),
+          doneWords,
+        );
       case 'leave':
-        return answerOutcome(
+        return answerClick(
           interaction,
           ctx,
+          partyId,
           await attendance.leave(partyId, member),
           () => 'You have left this raid.',
         );
       case 'less':
-        return answerOutcome(interaction, ctx, await attendance.changeNumber(partyId, member, -1));
+        return answerClick(
+          interaction,
+          ctx,
+          partyId,
+          await attendance.changeNumber(partyId, member, -1),
+        );
       case 'more':
-        return answerOutcome(
+        return answerClick(
           interaction,
           ctx,
+          partyId,
           await attendance.changeNumber(partyId, member, 1),
           moreWords,
         );
       case 'remote':
-        return answerOutcome(
+        return answerClick(
           interaction,
           ctx,
+          partyId,
           await attendance.setRemote(partyId, member, 'toggle'),
           remoteWords,
         );
       case 'group': {
         const [group] = id.args;
         if (group === undefined || !isGroupId(group)) throw new UserError(STALE_COMPONENT);
-        return answerOutcome(interaction, ctx, await attendance.joinGroup(partyId, member, group));
+        return answerClick(
+          interaction,
+          ctx,
+          partyId,
+          await attendance.joinGroup(partyId, member, group),
+        );
       }
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
-        return answerOutcome(
+        return answerClick(
           interaction,
           ctx,
+          partyId,
           await attendance.answer(partyId, member, answer === 'yes'),
         );
       }
```

Create `src/discord/click-answers.ts`:

```ts
import { MessageFlags, type MessageComponentInteraction } from 'discord.js';
import type { Logger } from '../log.js';

export interface ClickAnswersOptions {
  log: Logger;
  /**
   * How long after a click a further click counts as part of the same burst. Default two
   * seconds; zero answers every click by itself.
   */
  windowMs?: number;
}

interface Burst {
  /** The click that was answered with a message; its answer is what a later one replaces. */
  first: MessageComponentInteraction;
  /** The answer to the latest click after the first, not shown yet. */
  pending?: { content: string; latest: MessageComponentInteraction };
  timer: NodeJS.Timeout;
}

/**
 * Private answers to clicks on controls, gathered like the lines in a post: the first click of a
 * member is answered at once; clicks that follow within the window are only acknowledged, and
 * when the member has stopped for the length of the window the first answer is replaced by the
 * answer to the last click, which says how things stand after all of them. A member who presses
 * +1 five times reads one answer, not five.
 *
 * A burst is known by a key (the party and the member). An error is never gathered: the caller
 * shows it at once.
 */
export class ClickAnswers {
  private readonly bursts = new Map<string, Burst>();
  private readonly closing = new Set<Promise<void>>();
  private readonly windowMs: number;

  constructor(private readonly options: ClickAnswersOptions) {
    this.windowMs = options.windowMs ?? 2_000;
  }

  /** Answers a click privately, at once or as part of the burst it belongs to. */
  async answer(
    key: string,
    interaction: MessageComponentInteraction,
    content: string,
  ): Promise<void> {
    const burst = this.windowMs > 0 ? this.bursts.get(key) : undefined;
    if (burst) {
      clearTimeout(burst.timer);
      burst.pending = { content, latest: interaction };
      burst.timer = this.timer(key);
      await interaction.deferUpdate();
      return;
    }
    if (this.windowMs > 0) {
      this.bursts.set(key, { first: interaction, timer: this.timer(key) });
    }
    try {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (err) {
      // Nothing to replace later: the next click starts anew. A click that joined the burst
      // meanwhile was only acknowledged, so its answer is said under it now.
      const failed = this.bursts.get(key);
      if (failed?.first === interaction) {
        clearTimeout(failed.timer);
        this.bursts.delete(key);
        if (failed.pending) this.track(this.show(undefined, failed.pending));
      }
      throw err;
    }
  }

  private timer(key: string): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.close(key);
    }, this.windowMs);
    timer.unref();
    return timer;
  }

  /** Ends a burst: what was gathered is shown. */
  private close(key: string): void {
    const burst = this.bursts.get(key);
    if (!burst) return;
    clearTimeout(burst.timer);
    this.bursts.delete(key);
    const { pending } = burst;
    if (pending) this.track(this.show(burst.first, pending));
  }

  private track(work: Promise<void>): void {
    const shown = work.finally(() => this.closing.delete(shown));
    this.closing.add(shown);
  }

  /**
   * Replaces the first answer; when there is none, or it cannot be replaced (it was dismissed),
   * says it under the last click.
   */
  private async show(
    first: MessageComponentInteraction | undefined,
    pending: { content: string; latest: MessageComponentInteraction },
  ): Promise<void> {
    try {
      if (!first) throw new Error('there is no first answer');
      await first.editReply({ content: pending.content });
    } catch {
      try {
        await pending.latest.followUp({ content: pending.content, flags: MessageFlags.Ephemeral });
      } catch (err) {
        this.options.log.warn({ err }, 'could not show the answer to a burst of clicks');
      }
    }
  }

  /** Shows what is gathered now and waits for it. For shutdown and for tests. */
  async flush(): Promise<void> {
    for (const key of [...this.bursts.keys()]) this.close(key);
    await Promise.all(this.closing);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/components/party.test.ts src/discord/click-answers.test.ts`
Expected: PASS (`src/discord/click-answers.ts`, `src/components/party.ts`, `src/commands/parties/reply.ts`).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app-context.ts src/app.ts src/commands/parties/reply.ts src/components/party.test.ts src/components/party.ts src/discord/click-answers.test.ts src/discord/click-answers.ts test/support/test-context.ts
npm run check
git add src/app-context.ts src/app.ts src/commands/parties/reply.ts src/components/party.test.ts src/components/party.ts src/discord/click-answers.test.ts src/discord/click-answers.ts test/support/test-context.ts
git commit -m "Party controls: a burst of clicks gets one answer at the start and one at the end" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,700 unit tests.

---

### Task 5: What members change about a raid: RaidChangeService, meeting times, certain moves

**Files:**
- Create: `src/services/raid-change-service.test.ts`, `src/services/raid-change-service.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/raids/raid-input.ts`, `src/domain/party/party.ts`, `src/domain/party/raid.ts`, `src/domain/party/tick.test.ts`, `src/domain/party/tick.ts`, `src/render/activity.test.ts`, `src/render/activity.ts`, `src/services/attendance-service.ts`, `src/services/party-service.ts`, `test/support/party-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: `setHatchTime`, `setEndTime`, `setHatchedDuration`, `setBoss`, `setMoveset`, `setGym`, `blocksNewRaid`, `raidKindOf` (plan 2B); `PartyStore.update`, `withGymLock`, `active`; `PartyLines.say`; `setMeetingTime` (domain); `AttendanceService.apply`, `pingable`; `tickAutoset`; `PartyService.report`; Task 3 (test support).
- Produces: `RaidChangeService` (`src/services/raid-change-service.ts`, `ctx.raids`): `setHatchTime(partyId, member, time)`, `setEndTime(partyId, member, time)`, `setDuration(partyId, member, minutes)`, `setBoss(partyId, member, { tier, boss, label })`, `setMoveset(partyId, member, { fastMove?, chargedMove? })`, `setGym(partyId, member, gymId)`, each `Promise<RaidChangeOutcome>`; `RaidChangeOutcome = { kind: 'gone' } | { kind: 'refused'; reason; other? } | { kind: 'ok'; party; changed }`; `AttendanceService.setMeetingTime(partyId, member, time | null)` with `{ group, others }` in its outcome; `certainMoves(entry)` and `fitMeetingTimes(before, after)` in `raid.ts`; the problems `'gym-taken'`, `'other-region'`, `'not-a-move'` with their sentences; `partyServiceWith()` returns `raids`.

The gyms a change concerns (where the raid is, and where it may go) are locked in ascending order, outermost first, and the decision is made inside `store.update` under them; the clock and the durations are read there too. `inTheWay` lets a raid be changed that already blocks the same gym as the same kind. `label` arrives already made plain (`reportedBoss`), so the service does not escape it again. `setMoveset` checks the moves against the boss the stored raid has.

- [ ] **Step 1: Test support**

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -25,6 +25,7 @@ import { raidEventsFixture } from './raid-events.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { PartyStore } from '../../src/services/party-store.js';
+import { RaidChangeService } from '../../src/services/raid-change-service.js';
 
 /** The invented regions as a directory whose rows a test can change; `load` does nothing. */
 export class TestRegions {
@@ -150,6 +151,17 @@ export async function partyServiceWith(
     log,
     now,
   });
+  const raids = new RaidChangeService({
+    store,
+    posts: service,
+    lines,
+    gyms: gymsFixture(),
+    regions,
+    gameData: { catalogue: catalogueFixture() },
+    settings,
+    log,
+    now,
+  });
   const raidBosses = overrides.raidBosses ?? raidBossesFixture();
   const scheduler = new PartyScheduler({
     store,
@@ -165,6 +177,7 @@ export async function partyServiceWith(
   return {
     service,
     attendance,
+    raids,
     scheduler,
     lines,
     users,
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -7,6 +7,7 @@ import { ClickAnswers } from '../../src/discord/click-answers.js';
 import type { DB } from '../../src/db/types.js';
 import type { AttendanceService } from '../../src/services/attendance-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
+import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import { catalogueFixture } from './game-data.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
@@ -56,6 +57,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'attendance',
       'pass { attendance, partyService, parties, regions } from partyServiceWith()',
     ),
+    raids: unavailable<RaidChangeService>(
+      'raids',
+      'pass { raids, partyService, parties, regions } from partyServiceWith()',
+    ),
     // Every click is answered by itself; a test of bursts passes its own with a window.
     clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
```

- [ ] **Step 2: Write the failing tests**

Apply to `src/domain/party/tick.test.ts`:

```diff
--- a/src/domain/party/tick.test.ts
+++ b/src/domain/party/tick.test.ts
@@ -10,6 +10,7 @@ import {
   testRaidRules,
   withAttendees,
 } from '../../../test/support/parties.js';
+import { catalogueFixture } from '../../../test/support/game-data.js';
 import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
 import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
 import { loadSettings } from '../../config/settings.js';
@@ -40,8 +41,34 @@ const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
 describe('tickAutoset', () => {
   const autoset = tickAutoset(raidBossesFixture());
 
-  it('names the reference of the boss that is certain for a tier, without moves', () => {
-    expect(autoset({ level: 'T5', shadow: false })).toEqual({ boss: { key: 'yveltal' } });
+  it('names the reference of the boss that is certain for a tier; no move where there is a choice', () => {
+    expect(autoset({ level: 'T5', shadow: false })).toEqual({
+      boss: { key: 'yveltal' },
+      fastMove: null,
+      chargedMove: null,
+    });
+  });
+
+  it('presets the one fast move of a boss that has no other', () => {
+    const kyogre = catalogueFixture().byKey('kyogre');
+    const only = tickAutoset({
+      autoset: () => ({
+        key: 'kyogre',
+        name: 'Kyogre',
+        tier: { level: 'T5', shadow: false },
+        shiny: false,
+        entry: kyogre,
+        source: 'feed',
+        autoset: false,
+        pokemonId: 'KYOGRE',
+        form: null,
+      }),
+    });
+    expect(only({ level: 'T5', shadow: false })).toEqual({
+      boss: { key: 'kyogre' },
+      fastMove: 'WATERFALL_FAST',
+      chargedMove: null,
+    });
   });
 
   it('gives undefined for a tier with several bosses and for one with none', () => {
```

Apply to `src/render/activity.test.ts`:

```diff
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -73,6 +73,9 @@ describe('problemText', () => {
       'no-boss',
       'bad-duration',
       'already-done',
+      'gym-taken',
+      'other-region',
+      'not-a-move',
     ];
     const texts = reasons.map((reason) => problemText(reason, { maxNumber: 21 }));
     for (const text of texts) expect(text).toMatch(/^[A-Z].*\.$/);
```

Create `src/services/raid-change-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { attendeeOf } from '../domain/party/party.js';
import { certainMoves } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import type { RaidReport } from './party-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const T5 = { level: 'T5', shadow: false } as const;
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** Everything said in the post, line by line, once all of it has gone out. */
async function lines(made: Made): Promise<string[]> {
  await made.attendance.flush();
  await made.service.flush();
  return made.said().join('\n').split('\n').filter(Boolean);
}

/** A second raid, reported through the same service at another gym. */
async function secondRaid(made: Made, gymId: number, report: Partial<RaidReport> = {}) {
  const gym = gymsFixture().get(gymId);
  if (!gym) throw new Error('no gym');
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: BOB,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: T5,
    boss: null,
    ...report,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  await made.service.flush();
  return outcome.party;
}

describe('RaidChangeService: times', () => {
  it('sets the hatch time, the end with it, shows the post anew and says who did it', async () => {
    const made = await reportedRaid();
    const edits = () => made.gateway.posts.get(made.postId)?.edits ?? 0;
    const before = edits();
    const outcome = await made.raids.setHatchTime(made.party.id, alice, HATCH + 30_000);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await lines(made)).toEqual([`<@${ALICE}> set the hatch time: <t:${HATCH / 1000}:t>.`]);
    expect(edits()).toBe(before + 1);
    expect(made.gateway.messagesIn(made.postId)[0]?.message.mention).toBeUndefined();
  });

  it('sets the end time and works the hatch time out', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const outcome = await made.raids.setEndTime(made.party.id, alice, END);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await lines(made)).toEqual([`<@${ALICE}> set the end time: <t:${END / 1000}:t>.`]);
  });

  it('says nothing and writes nothing for the time the raid already has', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const writes = made.storage.writes.length;
    const outcome = await made.raids.setHatchTime(made.party.id, alice, HATCH);
    expect(outcome).toMatchObject({ kind: 'ok', changed: false });
    expect(made.storage.writes).toHaveLength(writes);
    expect(await lines(made)).toEqual([]);
  });

  it('names the day for a time that is far off', async () => {
    const made = await reportedRaid({ tier: { level: 'EX', shadow: false } });
    const far = at('2026-10-20T12:00');
    await made.raids.setHatchTime(made.party.id, alice, far);
    expect(await lines(made)).toEqual([`<@${ALICE}> set the hatch time: <t:${far / 1000}:f>.`]);
  });

  it('sets how long the raid lasts and moves the end', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    expect(await made.raids.setDuration(id, alice, 90)).toMatchObject({ kind: 'ok' });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: HATCH + 90 * MINUTE });
    expect(made.current().raid.hatchedDuration).toBe(90);
    expect(await lines(made)).toEqual([`<@${ALICE}> set the length of this raid to 90 minutes.`]);
    for (const minutes of [0, 181, 2.5]) {
      expect(await made.raids.setDuration(id, alice, minutes)).toEqual({
        kind: 'refused',
        reason: 'bad-duration',
      });
    }
  });

  it('notes the name and team of an attendee who changes something', async () => {
    const made = await reportedRaid();
    await made.raids.setHatchTime(
      made.party.id,
      { id: REPORTER, name: 'Rhea', team: 'valor' },
      HATCH,
    );
    expect(attendeeOf(made.current(), REPORTER)).toMatchObject({ name: 'Rhea', team: 'valor' });
    // Somebody who is not signed up is not signed up by it.
    await made.raids.setHatchTime(made.party.id, alice, HATCH + MINUTE);
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
  });

  it('answers gone for a raid that has ended', async () => {
    const made = await reportedRaid();
    await made.service.end(made.party.id);
    expect(await made.raids.setHatchTime(made.party.id, alice, HATCH)).toEqual({ kind: 'gone' });
  });
});

describe('RaidChangeService: boss and moves', () => {
  it('sets the boss of an egg, with the title of the post', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const outcome = await made.raids.setBoss(made.party.id, alice, {
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current().raid).toMatchObject({ boss: { key: 'yveltal' }, fastMove: null });
    // Naming the boss does not hatch the egg.
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await lines(made)).toEqual([`<@${ALICE}> set the boss: **Yveltal (T5)**.`]);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('Yveltal · The Stacks');
  });

  it('sets the one move of a boss that has no other', async () => {
    const made = await reportedRaid();
    await made.raids.setBoss(made.party.id, alice, {
      tier: T5,
      boss: { key: 'kyogre' },
      label: 'Kyogre (T5)',
    });
    expect(made.current().raid).toMatchObject({
      boss: { key: 'kyogre' },
      fastMove: 'WATERFALL_FAST',
      chargedMove: null,
    });
  });

  it('turns the raid into an egg of another tier, in other words', async () => {
    const made = await reportedRaid();
    await made.raids.setBoss(made.party.id, alice, {
      tier: { level: 'T3', shadow: false },
      boss: null,
      label: 'T3 egg',
    });
    expect(made.current().raid).toMatchObject({ tier: { level: 'T3' }, boss: null });
    expect(await lines(made)).toEqual([`<@${ALICE}> changed this to: T3 egg.`]);
  });

  it('changes nothing for the boss the raid has', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const outcome = await made.raids.setBoss(made.party.id, alice, {
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    expect(outcome).toMatchObject({ kind: 'ok', changed: false });
    expect(await lines(made)).toEqual([]);
  });

  it('sets one move or both, and refuses a raid without a boss', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const id = made.party.id;
    await made.raids.setMoveset(id, alice, { fastMove: 'SNARL_FAST' });
    expect(made.current().raid).toMatchObject({ fastMove: 'SNARL_FAST', chargedMove: null });
    await made.raids.setMoveset(id, alice, { chargedMove: 'DARK_PULSE' });
    expect(made.current().raid).toMatchObject({
      fastMove: 'SNARL_FAST',
      chargedMove: 'DARK_PULSE',
    });
    expect(await lines(made)).toEqual([
      `<@${ALICE}> set the fast move: Snarl.`,
      `<@${ALICE}> set the charged move: Dark Pulse.`,
    ]);
    const egg = await reportedRaid();
    expect(await egg.raids.setMoveset(egg.party.id, alice, { fastMove: 'SNARL_FAST' })).toEqual({
      kind: 'refused',
      reason: 'no-boss',
    });
  });
});

describe('RaidChangeService: moves are checked against the boss the raid has', () => {
  it('refuses a move the boss of the raid does not have', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const id = made.party.id;
    for (const moves of [
      { fastMove: 'WATERFALL_FAST' },
      { chargedMove: 'SNARL_FAST' },
      { fastMove: 'SNARL_FAST', chargedMove: 'SURF' },
    ]) {
      expect(await made.raids.setMoveset(id, alice, moves)).toEqual({
        kind: 'refused',
        reason: 'not-a-move',
      });
    }
    expect(made.current().raid.fastMove).toBeNull();
  });

  it("refuses the old boss's move when the boss was changed meanwhile", async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const id = made.party.id;
    const [changed, moved] = await Promise.all([
      made.raids.setBoss(id, bob, { tier: T5, boss: { key: 'kyogre' }, label: 'Kyogre (T5)' }),
      made.raids.setMoveset(id, alice, { fastMove: 'SNARL_FAST' }),
    ]);
    expect(changed.kind).toBe('ok');
    expect(moved).toEqual({ kind: 'refused', reason: 'not-a-move' });
    expect(made.current().raid).toMatchObject({
      boss: { key: 'kyogre' },
      fastMove: 'WATERFALL_FAST',
    });
  });

  it('says both moves when both are set at once', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    await made.raids.setMoveset(made.party.id, alice, {
      fastMove: 'GUST_FAST',
      chargedMove: 'HURRICANE',
    });
    expect(await lines(made)).toEqual([`<@${ALICE}> set the moves: Gust / Hurricane.`]);
  });
});

describe('RaidChangeService: meeting times follow corrected raid times', () => {
  const stamp = (time: number) => `<t:${time / 1000}:t>`;

  /** An egg that hatches at 14:30; Alice is here and her group meets at `meet`. */
  async function meeting(meet: number) {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.setMeetingTime(id, alice, meet);
    await lines(made);
    return { made, id };
  }

  it('moves a meeting time that was the hatch time along with the hatch time', async () => {
    const { made, id } = await meeting(HATCH);
    const later = HATCH + 25 * MINUTE;
    await made.raids.setHatchTime(id, bob, later);
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: later });
    expect((await lines(made)).slice(-2)).toEqual([
      `<@${BOB}> set the hatch time: ${stamp(later)}.`,
      `The meeting time moves with it: ${stamp(later)}.`,
    ]);
  });

  it('cancels a meeting time that the corrected times leave outside the raid', async () => {
    const { made, id } = await meeting(HATCH + 10 * MINUTE);
    // The egg hatches later than the group wanted to meet.
    await made.raids.setHatchTime(id, bob, HATCH + 25 * MINUTE);
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect((await lines(made)).at(-1)).toBe(
      'The meeting time no longer fits the raid and is cancelled.',
    );

    // The raid ends before the group wanted to meet.
    const short = await meeting(HATCH + 40 * MINUTE);
    await short.made.raids.setDuration(short.id, bob, 30);
    expect(short.made.current().groups[0]).toEqual({ id: 'A' });
  });

  it('leaves a meeting time alone that still fits, and names the group when there are several', async () => {
    const { made, id } = await meeting(HATCH + 20 * MINUTE);
    await made.raids.setHatchTime(id, bob, HATCH + 5 * MINUTE);
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: HATCH + 20 * MINUTE });
    await made.attendance.newGroup(id, carol);
    await made.attendance.setMeetingTime(id, carol, HATCH + 6 * MINUTE);
    await made.raids.setHatchTime(id, bob, HATCH + 10 * MINUTE);
    expect(made.current().groups).toEqual([
      { id: 'A', startTime: HATCH + 20 * MINUTE },
      { id: 'B' },
    ]);
    expect((await lines(made)).at(-1)).toBe(
      'The meeting time of group B no longer fits the raid and is cancelled.',
    );
  });
});

describe('RaidChangeService: the gym, and one raid per gym', () => {
  it('moves the raid to another gym of its region', async () => {
    const made = await reportedRaid();
    const outcome = await made.raids.setGym(made.party.id, alice, 2);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ gymId: 2, regionId: 1 });
    expect(await lines(made)).toEqual([`<@${ALICE}> moved this raid to **Old Stone Fountain**.`]);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('T5 egg · Old Stone Fountain');
    // The gym it left is free again, the one it is at is taken.
    expect(made.store.raidAt(1, 'standard', made.clock.now)).toBeUndefined();
    expect(made.store.raidAt(2, 'standard', made.clock.now)?.id).toBe(made.party.id);
  });

  it('changes nothing for the gym the raid is at', async () => {
    const made = await reportedRaid();
    expect(await made.raids.setGym(made.party.id, alice, 1)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
  });

  it('refuses a gym of another region, and one that lies in none', async () => {
    const made = await reportedRaid();
    for (const gymId of [8, 10]) {
      expect(await made.raids.setGym(made.party.id, alice, gymId)).toEqual({
        kind: 'refused',
        reason: 'other-region',
      });
    }
    expect(made.current().gymId).toBe(1);
  });

  it('refuses a gym that has such a raid already, naming it', async () => {
    const made = await reportedRaid();
    const other = await secondRaid(made, 2);
    const outcome = await made.raids.setGym(made.party.id, alice, 2);
    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: 'gym-taken',
      other: { id: other.id },
    });
    expect(made.current().gymId).toBe(1);
    expect(await lines(made)).toEqual([]);
  });

  it('lets a raid of another kind share the gym', async () => {
    const made = await reportedRaid();
    await secondRaid(made, 2, { tier: { level: 'EX', shadow: false } });
    expect(await made.raids.setGym(made.party.id, alice, 2)).toMatchObject({ kind: 'ok' });
  });

  it('refuses an end time that would bring a finished raid back beside its successor', async () => {
    const made = await reportedRaid({
      boss: { key: 'yveltal' },
      time: { end: at('2026-10-13T14:10') },
    });
    made.clock.now = at('2026-10-13T14:12');
    // The first raid is over by the clock, so the gym takes a new report.
    const next = await secondRaid(made, 1);
    const outcome = await made.raids.setEndTime(made.party.id, alice, at('2026-10-13T14:40'));
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'gym-taken', other: { id: next.id } });
    expect(made.current().endTime).toBe(at('2026-10-13T14:10'));
    // A time that leaves it over is fine.
    expect(await made.raids.setEndTime(made.party.id, alice, at('2026-10-13T14:11'))).toMatchObject(
      { kind: 'ok', changed: true },
    );
  });

  it('refuses a boss that makes the raid the kind another raid at the gym is', async () => {
    const made = await reportedRaid({ tier: { level: 'EX', shadow: false } });
    const standard = await secondRaid(made, 1);
    const outcome = await made.raids.setBoss(made.party.id, alice, {
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: 'gym-taken',
      other: { id: standard.id },
    });
  });

  it('gives a gym to one of two raids that move there at once', async () => {
    const made = await reportedRaid();
    const other = await secondRaid(made, 2);
    const [first, second] = await Promise.all([
      made.raids.setGym(made.party.id, alice, 3),
      made.raids.setGym(other.id, bob, 3),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(['ok', 'refused']);
    expect(made.store.active().filter((party) => party.gymId === 3)).toHaveLength(1);
  });

  it('lets two raids swap towards each other without waiting for ever', async () => {
    const made = await reportedRaid();
    const other = await secondRaid(made, 2);
    const outcomes = await Promise.all([
      made.raids.setGym(made.party.id, alice, 2),
      made.raids.setGym(other.id, bob, 1),
    ]);
    // Each finds the other in its way: neither moves, and neither hangs.
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['refused', 'refused']);
  });

  it('looks again when the raid was moved while it waited for the gym', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    const outcomes = await Promise.all([
      made.raids.setGym(id, alice, 2),
      made.raids.setGym(id, bob, 3),
    ]);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['ok', 'ok']);
    expect(made.current().gymId).toBe(3);
    expect(made.store.raidAt(2, 'standard', made.clock.now)).toBeUndefined();
  });

  it('may still change a raid that shares its gym already', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    // Two raids at one gym, as only a fault could leave them.
    const twin = await secondRaid(made, 2, { time: { hatch: HATCH } });
    await made.store.update(twin.id, (party) => ({ party: { ...party, gymId: 1 } }));
    expect(await made.raids.setHatchTime(made.party.id, alice, HATCH + MINUTE)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
  });
});

describe('certain moves when a raid is reported', () => {
  it('gives a reported Kyogre its one fast move, and leaves a given move alone', async () => {
    const made = await reportedRaid({ boss: { key: 'kyogre' } });
    expect(made.party.raid).toMatchObject({ fastMove: 'WATERFALL_FAST', chargedMove: null });
    const given = await reportedRaid({ boss: { key: 'kyogre' }, chargedMove: 'SURF' });
    expect(given.party.raid).toMatchObject({ fastMove: 'WATERFALL_FAST', chargedMove: 'SURF' });
  });

  it('is nothing for a Pokémon with a choice, and for one that is not known', () => {
    expect(certainMoves({ fastMoves: ['A', 'B'], chargedMoves: ['C'] })).toEqual({
      fastMove: null,
      chargedMove: 'C',
    });
    expect(certainMoves({ fastMoves: [], chargedMoves: [] })).toEqual({
      fastMove: null,
      chargedMove: null,
    });
    expect(certainMoves(undefined)).toEqual({ fastMove: null, chargedMove: null });
  });
});

describe('AttendanceService.setMeetingTime', () => {
  const MEET = at('2026-10-13T14:45');

  it("sets the time of the member's group and tells the others, pinging who allows it", async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Coming);
    }
    made.userSettings.set(BOB, { mentionsGroups: false });
    await made.attendance.flush();
    const outcome = await made.attendance.setMeetingTime(id, alice, MEET + 20_000);
    expect(outcome).toMatchObject({ kind: 'ok', acted: true, group: 'A' });
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: MEET });
    await made.attendance.flush();
    const notice = made.gateway.messagesIn(made.postId).at(-1);
    expect(notice?.message.content).toBe(
      `<@${ALICE}> set the meeting time: <t:${MEET / 1000}:t> (<t:${MEET / 1000}:R>).\n` +
        `<@${REPORTER}> <@${CAROL}>`,
    );
    expect(notice?.message.mention).toEqual({ users: [REPORTER, CAROL] });
  });

  it('names the group when the raid has several, and tells only that group', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.newGroup(id, bob);
    await made.attendance.signUp(id, carol, PartyStatus.Coming);
    await made.attendance.flush();
    await made.attendance.setMeetingTime(id, bob, MEET);
    await made.attendance.flush();
    const notice = made.gateway.messagesIn(made.postId).at(-1);
    expect(notice?.message.content).toBe(
      `<@${BOB}> set the meeting time of group B: <t:${MEET / 1000}:t> (<t:${MEET / 1000}:R>).\n` +
        `<@${CAROL}>`,
    );
  });

  it('cancels it, says so, and says nothing when there was none', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.setMeetingTime(id, alice, MEET);
    await made.attendance.flush();
    const before = made.gateway.messagesIn(made.postId).length;
    expect(await made.attendance.setMeetingTime(id, alice, null)).toMatchObject({ acted: true });
    await made.attendance.flush();
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toBe(
      `<@${ALICE}> cancelled the meeting time.\n<@${REPORTER}>`,
    );
    expect(await made.attendance.setMeetingTime(id, alice, null)).toMatchObject({ acted: false });
    await made.attendance.flush();
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(before + 1);
  });

  it('is only for somebody who is signed up', async () => {
    const made = await reportedRaid();
    expect(await made.attendance.setMeetingTime(made.party.id, alice, MEET)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
  });
});
```

Run: `npx vitest run --project unit src/domain/party/tick.test.ts src/render/activity.test.ts src/services/raid-change-service.test.ts`
Expected: FAIL (`raid-change-service.ts`, `setMeetingTime` of the service and `certainMoves` do not exist).

- [ ] **Step 3: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -13,6 +13,7 @@ import type { PartyService } from './services/party-service.js';
 import type { PartyProvider } from './services/party-store.js';
 import type { PokemonFinder } from './services/pokemon-search-service.js';
 import type { RaidBossProvider } from './services/raid-boss-service.js';
+import type { RaidChangeService } from './services/raid-change-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionProvider } from './services/region-directory.js';
 import type { MapProvider } from './services/static-maps.js';
@@ -39,6 +40,8 @@ export interface AppContext {
   readonly partyService: PartyService;
   /** What members do in a party: signing up, completing, groups. Buttons and commands use it. */
   readonly attendance: AttendanceService;
+  /** What members change about a raid itself: times, length, boss, moves, gym. */
+  readonly raids: RaidChangeService;
   /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
   readonly clickAnswers: ClickAnswers;
   /** A member's settings (the defaults for a member who never changed one). */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -31,6 +31,7 @@ import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
+import { RaidChangeService } from './services/raid-change-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
 import { RegionDirectory } from './services/region-directory.js';
 import { StaticMaps } from './services/static-maps.js';
@@ -108,15 +109,26 @@ export async function startApp(
     log,
   });
   const users = new UserRepository(db);
+  const lines = new PartyLines({
+    gateway: partyGateway,
+    active: (postId) => parties.byPost(postId) !== undefined,
+    log,
+  });
+  const raids = new RaidChangeService({
+    store: parties,
+    posts: partyService,
+    lines,
+    gyms,
+    regions,
+    gameData,
+    settings: config.settings,
+    log,
+  });
   const attendance = new AttendanceService({
     store: parties,
     gateway: partyGateway,
     posts: partyService,
-    lines: new PartyLines({
-      gateway: partyGateway,
-      active: (postId) => parties.byPost(postId) !== undefined,
-      log,
-    }),
+    lines,
     users,
     settings: config.settings,
     log,
@@ -163,6 +175,7 @@ export async function startApp(
     parties,
     partyService,
     attendance,
+    raids,
     clickAnswers,
     users,
     pokemon,
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -274,7 +274,7 @@ function reportedWithTier(
   }
   // An unlisted mega of a legendary or mythical Pokémon would be a MegaLegendary raid, but nothing
   // here tells it from an ordinary mega: it stays a Mega.
-  return { tier, boss: { key: entry.key }, label: `${entry.name} (${raidTierLabel(tier)})` };
+  return { tier, boss: { key: entry.key }, label: `${plain(entry.name)} (${raidTierLabel(tier)})` };
 }
 
 /**
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -197,7 +197,13 @@ export type PartyProblem =
   | 'no-boss'
   | 'bad-duration'
   /** The member has completed the raid; how they come no longer matters. */
-  | 'already-done';
+  | 'already-done'
+  /** Another raid of this kind already holds the gym. */
+  | 'gym-taken'
+  /** The gym lies in another region than the raid. */
+  | 'other-region'
+  /** The boss of the raid does not have that move. */
+  | 'not-a-move';
 
 /** A change that was not made. It has no `party`, which is how `PartyStore.update` knows. */
 export interface Refusal {
```

Apply to `src/domain/party/raid.ts`:

```diff
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -13,6 +13,7 @@ import {
   sameBoss,
   type Attendee,
   type Change,
+  type GroupId,
   type RaidBossRef,
   type RaidParty,
   type RaidStage,
@@ -62,6 +63,20 @@ function cleanBossRef(ref: RaidBossRef | null): RaidBossRef | null {
   return 'key' in ref ? { key: ref.key } : { name: ref.name };
 }
 
+/**
+ * The moves that are certain for a boss: the fast move of a Pokémon that has only one (Kyogre
+ * has only Waterfall), and the same for the charged move; null where there is a choice or the
+ * Pokémon is not known. Set whenever a raid gets its boss: when it is reported, when a member
+ * names the boss and when an egg hatches as the one boss of its tier.
+ */
+export function certainMoves(
+  entry: { fastMoves: readonly string[]; chargedMoves: readonly string[] } | undefined,
+): { fastMove: string | null; chargedMove: string | null } {
+  const only = (moves: readonly string[] | undefined): string | null =>
+    moves?.length === 1 ? (moves[0] ?? null) : null;
+  return { fastMove: only(entry?.fastMoves), chargedMove: only(entry?.chargedMoves) };
+}
+
 export function raidKindOf(party: RaidParty): RaidKind {
   return raidDurationKind(party.raid.tier);
 }
@@ -278,6 +293,38 @@ export function setBoss(
   return { party: settled(next, rules, now), changed: true, wasEgg };
 }
 
+/**
+ * Brings the meeting times of the groups in line with raid times that were corrected. A meeting
+ * time that was the hatch time ("meet at hatch") follows the new hatch time (`moved`); one that
+ * no longer lies between the hatch and the end is removed (`removed`): otherwise the group
+ * would be asked whether it is done with an egg, or meet after the raid. A raid without times
+ * keeps its meeting times. The very same party comes back when no meeting time is touched.
+ */
+export function fitMeetingTimes(
+  before: RaidParty,
+  after: RaidParty,
+): { party: RaidParty; moved: GroupId[]; removed: GroupId[] } {
+  const moved: GroupId[] = [];
+  const removed: GroupId[] = [];
+  const { hatchTime, endTime } = after;
+  if (hatchTime === null || endTime === null) return { party: after, moved, removed };
+  const groups = after.groups.map((group) => {
+    if (group.startTime === undefined) return group;
+    const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
+    if (group.startTime === before.hatchTime && hatchTime !== before.hatchTime) {
+      moved.push(group.id);
+      return { ...rest, startTime: hatchTime };
+    }
+    if (group.startTime < hatchTime || group.startTime > endTime) {
+      removed.push(group.id);
+      return rest;
+    }
+    return group;
+  });
+  if (moved.length === 0 && removed.length === 0) return { party: after, moved, removed };
+  return { party: { ...after, groups }, moved, removed };
+}
+
 /** Sets one or both moves of the boss. The caller has checked that the boss can have them. */
 export function setMoveset(
   party: RaidParty,
```

Apply to `src/domain/party/tick.ts`:

```diff
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -5,7 +5,7 @@ import type { RaidTier } from '../pogo/raid-tier.js';
 import type { RaidDurationRules } from '../time/raid-durations.js';
 import { askGroupWhetherComplete, completeUnanswered } from './attendance.js';
 import type { GroupId, PartyGroup, RaidBossRef, RaidParty, RaidStage } from './party.js';
-import { raidBossRef, raidStage, setBoss } from './raid.js';
+import { certainMoves, raidBossRef, raidStage, setBoss } from './raid.js';
 
 const MINUTE = 60_000;
 
@@ -58,14 +58,14 @@ export interface TickResult {
 
 /**
  * The `autoset` of a `TickInput` over `ctx.raidBosses`: the boss that tier's eggs hatch as, as
- * the reference to store. The moves are not preset.
+ * the reference to store, with the moves that are certain for it (`certainMoves`).
  */
 export function tickAutoset(bosses: {
   autoset(tier: RaidTier): RaidBoss | undefined;
 }): TickInput['autoset'] {
   return (tier) => {
     const found = bosses.autoset(tier);
-    return found ? { boss: raidBossRef(found) } : undefined;
+    return found ? { boss: raidBossRef(found), ...certainMoves(found.entry) } : undefined;
   };
 }
 
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -80,9 +80,18 @@ export function problemText(reason: PartyProblem, limits: { maxNumber: number })
     case 'no-boss':
       return 'This raid has no boss yet.';
     case 'bad-duration':
-      return 'That is not a duration a raid can have.';
+      return 'A raid lasts at least 1 minute and not longer than a few hours.';
     case 'already-done':
       return 'You are done with this raid. Use Join or Here if you are back.';
+    case 'gym-taken':
+      return 'That gym already has a raid like this one.';
+    case 'not-a-move':
+      return 'The boss of this raid does not have that move.';
+    case 'other-region':
+      return (
+        'That gym is in another region, and a raid cannot move between regions yet. ' +
+        'Report the raid there with `/raid` and let this one run out.'
+      );
   }
 }
 
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -14,6 +14,7 @@ import {
   releaseAsked,
   servedQuestions,
   setAttendance,
+  setMeetingTime,
   setNotHere,
   setRemote,
   type AttendanceLimits,
@@ -37,7 +38,7 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { Logger } from '../log.js';
 import { standingLine } from '../render/activity.js';
 import { completionQuestion, groupWords } from '../render/party-controls.js';
-import { LIMITS } from '../render/text.js';
+import { LIMITS, timestamp } from '../render/text.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -258,6 +259,60 @@ export class AttendanceService {
     );
   }
 
+  /**
+   * Sets the meeting time of the member's own group, or removes it with null. The others of the
+   * group who have not completed the raid are told in the post; those who allow it are pinged.
+   * `changed` is false when the group already had that time (or none).
+   */
+  async setMeetingTime(
+    partyId: string,
+    member: Member,
+    time: number | null,
+  ): Promise<AttendanceOutcome<{ group: GroupId; others: string[] }>> {
+    const outcome = await this.apply(
+      partyId,
+      member,
+      (party) => setMeetingTime(party, member.id, time),
+      'none',
+    );
+    if (outcome.kind === 'ok' && outcome.acted) {
+      this.inBackground(
+        this.announceMeeting(outcome.party, member.id, outcome.group, outcome.others),
+        partyId,
+        'announce a meeting time',
+      );
+    }
+    return outcome;
+  }
+
+  private async announceMeeting(
+    party: Party,
+    memberId: string,
+    groupId: GroupId,
+    others: readonly string[],
+  ): Promise<void> {
+    const postId = party.forumPostId;
+    if (postId === null) return;
+    const group = groupOf(party, groupId);
+    const whose = party.groups.length > 1 ? ` of ${groupWords(group ?? { id: groupId })}` : '';
+    const time = group?.startTime;
+    const said =
+      time === undefined
+        ? `<@${memberId}> cancelled the meeting time${whose}.`
+        : `<@${memberId}> set the meeting time${whose}: ${timestamp(time)} (${timestamp(time, 'R')}).`;
+    const pingable = await this.pingable(others, (settings) => settings.mentionsGroups);
+    if (!this.options.store.get(party.id)) return;
+    let content = said;
+    const users: string[] = [];
+    for (const id of pingable) {
+      const mention = `${users.length === 0 ? '\n' : ' '}<@${id}>`;
+      if (content.length + mention.length > LIMITS.content) break;
+      content += mention;
+      users.push(id);
+    }
+    await this.options.gateway.sendMessage(postId, { content, mention: { users } });
+  }
+
   /**
    * Runs one change of a member in a party. The member's name and team are noted with it. When
    * the change did something, the post gets a line: what `line` gives, or by default how the
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -11,7 +11,7 @@ import {
 } from '../discord/party-gateway.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import type { RaidBossRef, RaidParty } from '../domain/party/party.js';
-import { createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
+import { certainMoves, createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
 import type { PartyStatus } from '../domain/party/status.js';
 import { endParty } from '../domain/party/tick.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
@@ -56,6 +56,7 @@ export interface RaidReport {
   tier: RaidTier;
   /** Null for an egg; a boss means the raid was seen hatched. */
   boss: RaidBossRef | null;
+  /** Left out, a move is set when the boss has only that one (`certainMoves`). */
   fastMove?: string | null;
   chargedMove?: string | null;
   /** The region channel the report was made in; the raid goes to a region of that server. */
@@ -310,6 +311,11 @@ export class PartyService {
 
     const now = this.now();
     const rules = this.rules();
+    const certain = certainMoves(
+      report.boss && 'key' in report.boss
+        ? this.options.gameData.catalogue.byKey(report.boss.key)
+        : undefined,
+    );
     let raid = createRaid(
       {
         id: crypto.randomUUID(),
@@ -321,8 +327,8 @@ export class PartyService {
         autoStatus: report.autoStatus,
         tier: report.tier,
         boss: report.boss,
-        fastMove: report.fastMove ?? null,
-        chargedMove: report.chargedMove ?? null,
+        fastMove: report.fastMove ?? certain.fastMove,
+        chargedMove: report.chargedMove ?? certain.chargedMove,
         now,
       },
       rules,
```

Create `src/services/raid-change-service.ts`:

```ts
import type { Settings } from '../config/settings.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import { noteMember } from '../domain/party/attendance.js';
import {
  refused,
  type Change,
  type GroupId,
  type PartyProblem,
  type RaidBossRef,
  type RaidParty,
} from '../domain/party/party.js';
import {
  blocksNewRaid,
  certainMoves,
  fitMeetingTimes,
  raidKindOf,
  setBoss,
  setEndTime,
  setGym,
  setHatchedDuration,
  setHatchTime,
  setMoveset,
} from '../domain/party/raid.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import type { RaidDurationRules } from '../domain/time/raid-durations.js';
import type { Logger } from '../log.js';
import { plain, timestamp } from '../render/text.js';
import type { Member } from './attendance-service.js';
import type { GameDataProvider } from './game-data-service.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';
import type { RegionProvider } from './region-directory.js';

const HOUR = 3_600_000;

/**
 * What came of a change to a raid. `gone`: there is no such active raid. `refused`: the raid
 * stays as it was; for `gym-taken`, `other` is the raid that holds the gym. `ok`: the raid as it
 * is stored now; `changed` is false when it already was so.
 */
export type RaidChangeOutcome =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem; other?: RaidParty }
  | { kind: 'ok'; party: RaidParty; changed: boolean };

export interface RaidChangeServiceOptions {
  store: PartyStore;
  /** Told after every stored change; also knows the durations in effect. */
  posts: { changed(partyId: string): void; rules(): RaidDurationRules };
  lines: Pick<PartyLines, 'say'>;
  gyms: { get(id: number): Gym | undefined; regionsOf(gymId: number): string[] };
  regions: Pick<RegionProvider, 'byId'>;
  gameData: GameDataProvider;
  settings: Settings;
  log: Logger;
  now?: () => number;
}

/** The party as it was when setting a time or a length changed none of its times. */
function unlessSame(before: RaidParty, after: RaidParty): RaidParty {
  return before.hatchTime === after.hatchTime &&
    before.endTime === after.endTime &&
    before.lastPossibleTime === after.lastPossibleTime &&
    before.raid.hatchedDuration === after.raid.hatchedDuration &&
    before.deletionTime === after.deletionTime
    ? before
    : after;
}

/** What the post is told about meeting times that a correction of the raid's times touched. */
function meetingLines(fitted: ReturnType<typeof fitMeetingTimes>): string[] {
  const { party, moved, removed } = fitted;
  const whose = (id: GroupId): string => (party.groups.length > 1 ? ` of group ${id}` : '');
  return [
    ...moved.map((id) => {
      const time = party.groups.find((group) => group.id === id)?.startTime ?? 0;
      return `The meeting time${whose(id)} moves with it: ${timestamp(time)}.`;
    }),
    ...removed.map(
      (id) => `The meeting time${whose(id)} no longer fits the raid and is cancelled.`,
    ),
  ];
}

type Decision = Change<RaidParty> | (Change<RaidParty> & { other?: RaidParty });

/**
 * What members change about a raid itself: its times, how long it lasts, its boss, the boss's
 * moves and its gym. The commands and the "Set time" form end here. Every method decides inside
 * the store, has the post shown anew and says in the post who changed what, in a line that pings
 * nobody; the caller tells the member privately.
 *
 * A change that would make the raid stand in the way of a new report for a gym (a later end,
 * another kind of raid, another gym) is made under that gym's lock and refused with `gym-taken`
 * when another raid already does (spec 5.2).
 */
export class RaidChangeService {
  private readonly now: () => number;

  constructor(private readonly options: RaidChangeServiceOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** A time as a line names it: the clock time, with the date when it is far off. */
  private when(time: number): string {
    return timestamp(time, Math.abs(time - this.now()) > 12 * HOUR ? 'f' : 't');
  }

  /** When the egg hatches (or hatched); the end follows. The caller has checked the time. */
  setHatchTime(partyId: string, member: Member, time: number): Promise<RaidChangeOutcome> {
    return this.apply(
      partyId,
      member,
      (party, rules, now) => ({
        ok: true,
        party: unlessSame(party, setHatchTime(party, time, rules, now)),
      }),
      (party) =>
        party.hatchTime === null
          ? undefined
          : `<@${member.id}> set the hatch time: ${this.when(party.hatchTime)}.`,
    );
  }

  /** When the raid ends; the hatch time follows. The caller has checked the time. */
  setEndTime(partyId: string, member: Member, time: number): Promise<RaidChangeOutcome> {
    return this.apply(
      partyId,
      member,
      (party, rules, now) => ({
        ok: true,
        party: unlessSame(party, setEndTime(party, time, rules, now)),
      }),
      (party) =>
        party.endTime === null
          ? undefined
          : `<@${member.id}> set the end time: ${this.when(party.endTime)}.`,
    );
  }

  /** How long this raid lasts once hatched, for a raid that differs from the rule. */
  setDuration(partyId: string, member: Member, minutes: number): Promise<RaidChangeOutcome> {
    const { maxRaidHatchedDuration } = this.options.settings;
    return this.apply(
      partyId,
      member,
      (party, rules, now) => {
        const set = setHatchedDuration(party, minutes, maxRaidHatchedDuration, rules, now);
        return set.ok ? { ...set, party: unlessSame(party, set.party) } : set;
      },
      () => `<@${member.id}> set the length of this raid to ${minutes} minutes.`,
    );
  }

  /**
   * The boss, or the tier of an egg (`boss` null); `label` is how the line names it (`Yveltal
   * (T5)`, `T3 egg`), already made plain by the caller (`reportedBoss`). A boss with only one fast or one charged move has it set (`certainMoves`).
   */
  setBoss(
    partyId: string,
    member: Member,
    change: { tier: RaidTier; boss: RaidBossRef | null; label: string },
  ): Promise<RaidChangeOutcome> {
    const entry =
      change.boss && 'key' in change.boss
        ? this.options.gameData.catalogue.byKey(change.boss.key)
        : undefined;
    return this.apply(
      partyId,
      member,
      (party, rules, now) => ({
        ok: true,
        party: setBoss(
          party,
          { tier: change.tier, boss: change.boss, ...certainMoves(entry) },
          rules,
          now,
        ).party,
      }),
      () =>
        change.boss === null
          ? `<@${member.id}> changed this to: ${change.label}.`
          : `<@${member.id}> set the boss: **${change.label}**.`,
    );
  }

  /**
   * One or both moves of the boss, as move ids. Refused with `not-a-move` when the boss the raid
   * has by then (somebody may have changed it meanwhile) does not have them.
   */
  setMoveset(
    partyId: string,
    member: Member,
    moves: { fastMove?: string; chargedMove?: string },
  ): Promise<RaidChangeOutcome> {
    const { catalogue } = this.options.gameData;
    const name = (id: string | undefined): string =>
      plain((id && catalogue.move(id)?.name) || '????');
    const said =
      moves.fastMove !== undefined && moves.chargedMove !== undefined
        ? `the moves: ${name(moves.fastMove)} / ${name(moves.chargedMove)}`
        : moves.fastMove !== undefined
          ? `the fast move: ${name(moves.fastMove)}`
          : `the charged move: ${name(moves.chargedMove)}`;
    return this.apply(
      partyId,
      member,
      (party) => {
        const { boss } = party.raid;
        if (boss === null) return refused('no-boss');
        const entry = 'key' in boss ? catalogue.byKey(boss.key) : undefined;
        const has = (list: readonly string[] | undefined, move: string | undefined): boolean =>
          move === undefined || (list ?? []).includes(move);
        if (
          !has(entry?.fastMoves, moves.fastMove) ||
          !has(entry?.chargedMoves, moves.chargedMove)
        ) {
          return refused('not-a-move');
        }
        const set = setMoveset(party, moves);
        const same =
          set.ok &&
          set.party.raid.fastMove === party.raid.fastMove &&
          set.party.raid.chargedMove === party.raid.chargedMove;
        return same ? { ok: true, party } : set;
      },
      () => `<@${member.id}> set ${said}.`,
    );
  }

  /**
   * Moves the raid to another gym of its region. A gym of another region is refused
   * (`other-region`): its post would have to move to another forum.
   */
  setGym(partyId: string, member: Member, gymId: number): Promise<RaidChangeOutcome> {
    const { gyms, regions } = this.options;
    const gym = gyms.get(gymId);
    if (!gym) throw new Error(`There is no gym ${gymId}`);
    return this.apply(
      partyId,
      member,
      (party) => {
        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
        if (!region || !gyms.regionsOf(gymId).includes(region.channelId)) {
          return refused('other-region');
        }
        if (party.gymId === gymId) return { ok: true, party };
        return { ok: true, party: setGym(party, gymId, region.id).party };
      },
      () => `<@${member.id}> moved this raid to **${plain(gym.nickname || gym.name)}**.`,
      gymId,
    );
  }

  /**
   * Runs one change. The gyms the raid is at and may move to are locked for it, in one order,
   * so that the check for another raid there and the write are one step.
   */
  private async apply(
    partyId: string,
    member: Member,
    change: (party: RaidParty, rules: RaidDurationRules, now: number) => Change<RaidParty>,
    line: (party: RaidParty) => string | undefined,
    targetGym?: number,
  ): Promise<RaidChangeOutcome> {
    const { store, posts, lines, log } = this.options;
    // The raid can be moved to another gym between looking and locking: then look again.
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = store.get(partyId);
      if (!before) return { kind: 'gone' };
      const locked = [
        ...new Set([before.gymId, targetGym].filter((id): id is number => typeof id === 'number')),
      ].sort((a, b) => a - b);
      let moved = false;
      let meetings: string[] = [];
      const decide = (party: RaidParty): Decision => {
        if (party.gymId !== null && !locked.includes(party.gymId)) {
          moved = true;
          return { ok: true, party };
        }
        // Read here, under the locks: waiting for them may have taken a while.
        const now = this.now();
        const changed = change(party, posts.rules(), now);
        if (!changed.ok || changed.party === party) return changed;
        const other = this.inTheWay(party, changed.party, now);
        if (other) return { ...refused('gym-taken'), other };
        const fitted = fitMeetingTimes(party, changed.party);
        meetings = meetingLines(fitted);
        return { ...changed, party: noteMember(fitted.party, member.id, member) };
      };
      const update = (): ReturnType<typeof store.update<Decision>> => store.update(partyId, decide);
      const result = await locked.reduceRight<() => Promise<Awaited<ReturnType<typeof update>>>>(
        (inner, gymId) => () => store.withGymLock(gymId, inner),
        update,
      )();
      if (moved) continue;
      if (!result) return { kind: 'gone' };
      if (!result.ok) {
        return {
          kind: 'refused',
          reason: result.reason,
          ...('other' in result && result.other ? { other: result.other } : {}),
        };
      }
      if (result.written) {
        posts.changed(partyId);
        const postId = result.party.forumPostId;
        const text = line(result.party);
        for (const said of [...(text ? [text] : []), ...meetings]) {
          if (postId !== null) lines.say(postId, said);
        }
      }
      return { kind: 'ok', party: result.party, changed: result.written };
    }
    log.warn({ party: partyId }, 'a raid kept moving while it was to be changed');
    return { kind: 'gone' };
  }

  /**
   * The other raid that a changed raid would share its gym with, both standing in the way of a
   * new report there. Undefined when the change makes no difference to that: a raid that already
   * blocked the same gym as the same kind may be changed whatever else is there.
   */
  private inTheWay(before: RaidParty, after: RaidParty, now: number): RaidParty | undefined {
    const { gymId } = after;
    if (gymId === null || !blocksNewRaid(after, now)) return undefined;
    const kind = raidKindOf(after);
    if (blocksNewRaid(before, now) && before.gymId === gymId && raidKindOf(before) === kind) {
      return undefined;
    }
    return this.options.store
      .active()
      .find(
        (other) =>
          other.id !== after.id &&
          other.gymId === gymId &&
          raidKindOf(other) === kind &&
          blocksNewRaid(other, now),
      );
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/domain/party/tick.test.ts src/render/activity.test.ts src/services/raid-change-service.test.ts`
Expected: PASS (`src/services/raid-change-service.ts`, `src/services/attendance-service.ts`, `src/domain/party/raid.ts`).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app-context.ts src/app.ts src/commands/raids/raid-input.ts src/domain/party/party.ts src/domain/party/raid.ts src/domain/party/tick.test.ts src/domain/party/tick.ts src/render/activity.test.ts src/render/activity.ts src/services/attendance-service.ts src/services/party-service.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts test/support/party-service.ts test/support/test-context.ts
npm run check
git add src/app-context.ts src/app.ts src/commands/raids/raid-input.ts src/domain/party/party.ts src/domain/party/raid.ts src/domain/party/tick.test.ts src/domain/party/tick.ts src/render/activity.test.ts src/render/activity.ts src/services/attendance-service.ts src/services/party-service.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts test/support/party-service.ts test/support/test-context.ts
git commit -m "Raids can be corrected: times, length, boss, moves and gym, one raid per gym; meeting times" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,736 unit tests.

---

### Task 6: /hatch, /end, /duration, /meet, /cancel-meet and "Set time"

**Files:**
- Create: `src/commands/parties/meet.ts`, `src/commands/raids/change.test.ts`, `src/commands/raids/change.ts`
- Modify: `src/commands/index.ts`, `src/commands/raids/raid-input.ts`, `src/components/party.ts`, `src/render/party-controls.test.ts`, `src/render/party-controls.ts`

**Interfaces:**
- Consumes: Task 5 (`ctx.raids`, `RaidChangeOutcome`, `AttendanceService.setMeetingTime`); `resolvePartyTime`, `longestRaidDurations`, `raidDurationRules`; `commandParty`, `actingMember`, `answerOutcome`, `PARTY_OVER`; `partyControls`, `PARTY_ACTIONS`; `src/components/party.ts`.
- Produces: `typedPartyTime(ctx, party, parameter, text, now): { at: number } | 'unset'` in `raid-input.ts`; `src/commands/raids/change.ts`: the commands `hatch`, `end`, `duration`, and `CHANGE_THROTTLE` (10 a minute), `IN_A_RAID_POST`, `changingMember(interaction)`, `timesText(party, now?)`, `timesAlready(party)`, `answerRaidChange(interaction, ctx, outcome, said, same)`, `changeTime(interaction, ctx, party, parameter, text)`; `src/commands/parties/meet.ts`: `meet`, `cancelMeet`, `MEET_THROTTLE` (3 a minute); the party action `'time'`, `TIME_INPUT`, `timeForm(partyId, parameter)` in `party-controls.ts`; the handler's `modal`.

The handlers read `Date.now()` themselves, as `/raid` does; their tests fake only `Date` (`vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW })`), because the fake gateway needs the real timers. The "Set time" button calls `showModal` as its first and only response; it does not go through `ClickAnswers`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/raids/change.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, at, BOB, MINUTE, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { InteractionRouter } from '../../discord/router.js';
import { partyControls, timeForm } from '../../render/party-controls.js';
import type { RaidReport } from '../../services/party-service.js';
import { cancelMeet, meet } from '../parties/meet.js';
import { join } from '../parties/attendance.js';
import { duration, end, hatch } from './change.js';

const all: CommandModule[] = [hatch, end, duration, meet, cancelMeet, join];
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

beforeEach(() => {
  // The handlers read the clock themselves; the fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
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
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the raid's post, by Alice. */
  const run = (commandName: string, options: Record<string, string | number> = {}, extra = {}) =>
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
  const answer = async (commandName: string, options?: Record<string, string | number>) =>
    sent((await run(commandName, options)).reply).content;
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, lines, where };
}

describe('/hatch and /end', () => {
  it('/hatch sets the hatch time from minutes, privately, and the post says who did it', async () => {
    const made = await setup();
    const used = await made.run('hatch', { time: '30' });
    expect(used.reply).toHaveBeenCalledWith({
      content: `Done. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await made.lines()).toEqual([`<@${ALICE}> set the hatch time: ${stamp(HATCH)}.`]);
  });

  it('/hatch takes a clock time, and /end the time the raid ends', async () => {
    const made = await setup();
    await made.run('hatch', { time: '2:30pm' });
    expect(made.current().hatchTime).toBe(HATCH);
    expect(await made.answer('end', { time: '3:20' })).toBe(
      `Done. It hatches at ${stamp(HATCH + 5 * MINUTE)} and ends at ${stamp(END + 5 * MINUTE)}.`,
    );
  });

  it('says so when the raid already has that time', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    expect(await made.answer('hatch', { time: '2:30pm' })).toBe(
      `Nothing changed. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
    );
    expect(await made.lines()).toEqual([]);
  });

  it('explains a time the raid cannot have, and one it cannot read', async () => {
    const made = await setup();
    // An egg reported at 14:00 hatches by 15:00.
    expect(await made.answer('hatch', { time: '5pm' })).toMatch(
      /^"5pm" cannot be the time the egg hatches: it must be between <t:\d+:f> and <t:\d+:f>\.$/,
    );
    expect(await made.answer('end', { time: 'soon' })).toMatch(
      /^I could not read "soon" as the time the raid ends\./,
    );
    expect(await made.answer('hatch', { time: 'cancel' })).toBe(
      'A raid keeps its times once it has them. Give the right time instead.',
    );
    expect(made.current().hatchTime).toBeNull();
  });

  it('corrects a time that was set, later or earlier', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('hatch', { time: '2:40pm' });
    expect(made.current().hatchTime).toBe(HATCH + 10 * MINUTE);
    await made.run('hatch', { time: '2:20pm' });
    expect(made.current().hatchTime).toBe(HATCH - 10 * MINUTE);
  });

  it('works only in the post of a raid', async () => {
    const made = await setup();
    const elsewhere = await made.run('hatch', { time: '30' }, { channelId: '600000000000000009' });
    expect(sent(elsewhere.reply).content).toBe(
      'Use this in the post of a raid that is still active.',
    );
  });

  it('holds back a member who changes the raid more than ten times a minute', async () => {
    const made = await setup();
    for (let n = 0; n < 10; n++) await made.run('hatch', { time: String(20 + n) });
    expect(await made.answer('hatch', { time: '35' })).toMatch(/^You can use \/hatch again in /);
  });
});

describe('/duration', () => {
  it('sets how long the raid lasts and says the new times', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    expect(await made.answer('duration', { minutes: 30 })).toBe(
      `This raid now lasts 30 minutes. It hatches at ${stamp(HATCH)} and ends at ${stamp(HATCH + 30 * MINUTE)}.`,
    );
    expect(await made.answer('duration', { minutes: 30 })).toBe(
      'This raid already lasts 30 minutes.',
    );
    expect(await made.lines()).toEqual([`<@${ALICE}> set the length of this raid to 30 minutes.`]);
  });

  it('refuses a length no raid has, naming the longest', async () => {
    const made = await setup();
    expect(await made.answer('duration', { minutes: 181 })).toBe(
      'Give the length in minutes, from 1 to 180.',
    );
  });
});

describe('/meet and /cancel-meet', () => {
  const MEET = at('2026-10-13T14:45');

  it('sets the meeting time of the group, tells the member and the others', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      `The meeting time of your group is ${stamp(MEET)} (${stamp(MEET, 'R')}). I have told the others.`,
    );
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: MEET });
    expect((await made.lines()).slice(-2)).toEqual([
      `<@${ALICE}> set the meeting time: ${stamp(MEET)} (${stamp(MEET, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      `The meeting time of your group was ${stamp(MEET)} (${stamp(MEET, 'R')}) already.`,
    );
  });

  it('takes "hatch" for the hatch time, and "cancel" to remove it', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    await made.run('meet', { time: 'hatch' });
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: HATCH });
    expect(await made.answer('meet', { time: 'cancel' })).toBe(
      'The meeting time of your group is cancelled.',
    );
    expect(made.current().groups[0]).toEqual({ id: 'A' });
  });

  it('refuses a time outside the raid, and a member who is not signed up', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      'You are not signed up for this raid.',
    );
    await made.run('join');
    expect(await made.answer('meet', { time: '4pm' })).toMatch(
      /^"4pm" cannot be a meeting time: it must be between /,
    );
  });

  it('/cancel-meet removes the time, and says when there was none', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    expect(await made.answer('cancel-meet')).toBe('There was no meeting time.');
    await made.run('meet', { time: '2:45pm' });
    expect(await made.answer('cancel-meet')).toBe('The meeting time is cancelled.');
    expect(made.current().groups[0]).toEqual({ id: 'A' });
  });
});

describe('what the commands guard against', () => {
  it('holds back a member who keeps changing the meeting time', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    for (const time of ['2:40pm', '2:45pm', '2:50pm']) await made.run('meet', { time });
    expect(await made.answer('meet', { time: '2:55pm' })).toMatch(/^You can use \/meet again in /);
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: at('2026-10-13T14:50') });
  });

  it('gives a raid that was seen hatched no more time than a raid lasts', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    // Reported hatched at 14:00: it ends by 14:45 at the latest.
    expect(await made.answer('end', { time: '50' })).toMatch(
      /^"50" cannot be the time the raid ends: it must be between /,
    );
    expect(made.current().endTime).toBeNull();
    expect(await made.answer('end', { time: '40' })).toMatch(/^Done\./);
    const other = await setup({ boss: { key: 'yveltal' } });
    await other.run('join');
    expect(await other.answer('meet', { time: '3pm' })).toMatch(
      /^"3pm" cannot be a meeting time: it must be between /,
    );
  });

  it('names the day of a time that is not today', async () => {
    const made = await setup({ tier: { level: 'Elite', shadow: false } });
    const tomorrow = at('2026-10-14T13:00');
    expect(await made.answer('hatch', { time: '10/14 1:00pm' })).toBe(
      `Done. It hatches at ${stamp(tomorrow, 'f')} and ends at ${stamp(tomorrow + 30 * MINUTE, 'f')}.`,
    );
  });
});

describe('the "Set time" button and its form', () => {
  const actions = (made: Awaited<ReturnType<typeof setup>>) =>
    partyControls(made.current()).flatMap((row) =>
      row.components.map((c) => ('custom_id' in c ? decodeCustomId(c.custom_id)?.action : '')),
    );

  it('is on a post without times, and gone once the raid has them', async () => {
    const made = await setup();
    expect(actions(made)).toContain('time');
    await made.run('hatch', { time: '30' });
    expect(actions(made)).not.toContain('time');
    await made.service.flush();
    const shown = JSON.stringify(made.gateway.posts.get(made.postId)?.message.components);
    expect(shown).not.toContain(':time');
  });

  it('opens a form that asks an egg when it hatches, and a hatched raid when it ends', async () => {
    const egg = await setup();
    const click = await egg.handle(
      fakeButton({ customId: `party:${egg.party.id}:time`, ...egg.where, userId: ALICE }),
    );
    expect(click.showModal).toHaveBeenCalledExactlyOnceWith(timeForm(egg.party.id, 'hatch'));
    expect(click.reply).not.toHaveBeenCalled();

    const boss = await setup({ boss: { key: 'yveltal' } });
    const other = await boss.handle(
      fakeButton({ customId: `party:${boss.party.id}:time`, ...boss.where, userId: ALICE }),
    );
    expect(other.showModal).toHaveBeenCalledExactlyOnceWith(timeForm(boss.party.id, 'end'));
    const form = timeForm(boss.party.id, 'end');
    expect(decodeCustomId(form.custom_id)).toEqual({
      kind: 'party',
      id: boss.party.id,
      action: 'time',
      args: ['end'],
    });
    expect(form.title.length).toBeLessThanOrEqual(45);
  });

  it('sets the time that was typed into the form, as what the form asked for', async () => {
    const made = await setup();
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.where,
        userId: BOB,
        displayName: 'Bob',
        fields: { time: '30' },
      }),
    );
    expect(sent(form.reply)).toEqual({
      content: `Done. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
      flags: MessageFlags.Ephemeral,
    });
    expect(await made.lines()).toEqual([`<@${BOB}> set the hatch time: ${stamp(HATCH)}.`]);

    const hatched = await setup({ boss: { key: 'yveltal' } });
    await hatched.handle(
      fakeModal({
        customId: `party:${hatched.party.id}:time:end`,
        ...hatched.where,
        userId: BOB,
        fields: { time: '2:40pm' },
      }),
    );
    expect(hatched.current()).toMatchObject({
      hatchTime: at('2026-10-13T13:55'),
      endTime: at('2026-10-13T14:40'),
    });
  });

  it('explains what it cannot read, privately, and leaves the raid alone', async () => {
    const made = await setup();
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.where,
        fields: { time: 'whenever' },
      }),
    );
    expect(sent(form.reply).content).toMatch(
      /^I could not read "whenever" as the time the egg hatches\./,
    );
    expect(sent(form.reply).flags).toBe(MessageFlags.Ephemeral);
    expect(made.current().hatchTime).toBeNull();
  });

  it('says so when somebody set the time meanwhile, or the raid is over', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    const late = await made.handle(
      fakeButton({ customId: `party:${made.party.id}:time`, ...made.where }),
    );
    expect(late.showModal).not.toHaveBeenCalled();
    expect(sent(late.reply).content).toBe(
      `This raid has its times already. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}. ` +
        'Use `/hatch` or `/end` to correct them.',
    );
    // The form was open while somebody else set the time: theirs stands.
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.where,
        fields: { time: '2:50pm' },
      }),
    );
    expect(sent(form.reply).content).toMatch(/^This raid has its times already\./);
    expect(made.current().hatchTime).toBe(HATCH);
    await made.service.end(made.party.id);
    for (const interaction of [
      fakeButton({ customId: `party:${made.party.id}:time`, ...made.where }),
      fakeModal({ customId: `party:${made.party.id}:time:hatch`, fields: { time: '30' } }),
    ]) {
      await made.handle(interaction);
      expect(sent(interaction.reply).content).toBe('This raid is over.');
    }
  });

  it('answers a form it does not know as no longer active', async () => {
    const made = await setup();
    for (const customId of [`party:${made.party.id}:time`, `party:${made.party.id}:time:meet`]) {
      const form = await made.handle(fakeModal({ customId, fields: { time: '30' } }));
      expect(sent(form.reply).content).toBe('This control is no longer active.');
    }
  });
});
```

Apply to `src/render/party-controls.test.ts`:

```diff
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -1,7 +1,15 @@
 import { describe, expect, it } from 'vitest';
-import { ALICE, BOB, testRaid, withAttendees } from '../../test/support/parties.js';
+import {
+  ALICE,
+  BOB,
+  PARTY_NOW,
+  testRaid,
+  testRaidRules,
+  withAttendees,
+} from '../../test/support/parties.js';
 import { decodeCustomId, MAX_CUSTOM_ID_LENGTH } from '../discord/custom-id.js';
 import type { RaidParty } from '../domain/party/party.js';
+import { setHatchTime } from '../domain/party/raid.js';
 import {
   completionQuestion,
   groupWords,
@@ -35,9 +43,12 @@ const fiveGroups = (label?: string): RaidParty => ({
   })),
 });
 
+/** A raid with times: it has no "Set time" button. */
+const timed = setHatchTime(testRaid(), PARTY_NOW + 30 * 60_000, testRaidRules(), PARTY_NOW);
+
 describe('partyControls', () => {
   it('has the five statuses, then the head count and the remote switch', () => {
-    const rows = controls(testRaid());
+    const rows = controls(timed);
     expect(rows).toHaveLength(2);
     expect(rows[0]?.map((c) => [c.label, c.action])).toEqual([
       ['Interested', 'maybe'],
@@ -81,7 +92,17 @@ describe('partyControls', () => {
 
   it('has no remote switch for an elite raid', () => {
     const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
-    expect(controls(elite)[1]?.map((c) => c.action)).toEqual(['less', 'more']);
+    expect(controls(elite)[1]?.map((c) => c.action)).toEqual(['less', 'more', 'time']);
+  });
+
+  it('offers "Set time" only while the raid has no times', () => {
+    expect(controls(testRaid())[1]?.map((c) => [c.label, c.action])).toEqual([
+      ['−1', 'less'],
+      ['+1', 'more'],
+      ['Remote / in person', 'remote'],
+      ['Set time', 'time'],
+    ]);
+    expect(controls(timed)[1]?.map((c) => c.action)).not.toContain('time');
   });
 
   it('offers a button per group once there are several, with how many are expected', () => {
```

Run: `npx vitest run --project unit src/commands/raids/change.test.ts src/render/party-controls.test.ts`
Expected: FAIL (`change.ts` and `meet.ts` do not exist; the controls have no "Set time" button).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -2,6 +2,8 @@ import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
 import { group } from './parties/group.js';
+import { cancelMeet, meet } from './parties/meet.js';
+import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
 import { help } from './util/help.js';
 
@@ -18,5 +20,10 @@ export const commands: readonly CommandModule[] = [
   remote,
   local,
   group,
+  meet,
+  cancelMeet,
+  hatch,
+  end,
+  duration,
   admin,
 ];
```

Create `src/commands/parties/meet.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { requireParty } from '../../discord/guards.js';
import { groupOf } from '../../domain/party/party.js';
import { groupWords } from '../../render/party-controls.js';
import { timestamp } from '../../render/text.js';
import { typedPartyTime } from '../raids/raid-input.js';
import type { Throttle } from '../../discord/throttle.js';
import { actingMember, answerOutcome, commandParty } from './reply.js';

const IN_A_POST = 'Use it in the post of the raid.';

/**
 * Tighter than the other attendance commands: every change of a meeting time is a message that
 * pings the group.
 */
export const MEET_THROTTLE: Throttle = { uses: 3, perSeconds: 60 };

export const meet: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('meet')
    .setDescription('Set when your group meets for this raid')
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription('Minutes from now (20), a clock time (6:15pm), or "hatch"')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    category: 'basic-raid',
    details:
      'Sets the meeting time of the group you are in and tells the others of the group. The ' +
      'time must lie between now (or the hatch) and the end of the raid; `hatch` means the ' +
      `hatch time, \`cancel\` removes the meeting time. A while after it, those who are here ` +
      `are asked whether they are done. ${IN_A_POST}`,
    examples: ['/meet time:6:15pm', '/meet time:hatch'],
  },
  guards: [requireParty],
  throttle: MEET_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const text = interaction.options.getString('time', true);
    const typed = typedPartyTime(ctx, party, 'meet', text, Date.now());
    const outcome = await ctx.attendance.setMeetingTime(
      party.id,
      actingMember(interaction),
      typed === 'unset' ? null : typed.at,
    );
    await answerOutcome(interaction, ctx, outcome, (ok) => {
      const group = groupOf(ok.party, ok.group);
      const whose =
        ok.party.groups.length > 1 ? groupWords(group ?? { id: ok.group }) : 'your group';
      if (group?.startTime === undefined) {
        return ok.acted
          ? `The meeting time of ${whose} is cancelled.`
          : 'There was no meeting time.';
      }
      const when = `${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`;
      return ok.acted
        ? `The meeting time of ${whose} is ${when}. I have told the others.`
        : `The meeting time of ${whose} was ${when} already.`;
    });
  },
};

export const cancelMeet: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('cancel-meet')
    .setDescription('Remove the meeting time of your group'),
  help: {
    category: 'basic-raid',
    details: `Removes the meeting time of the group you are in and tells the others. ${IN_A_POST}`,
  },
  guards: [requireParty],
  throttle: MEET_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.setMeetingTime(party.id, actingMember(interaction), null);
    await answerOutcome(interaction, ctx, outcome, (ok) =>
      ok.acted ? 'The meeting time is cancelled.' : 'There was no meeting time.',
    );
  },
};
```

Create `src/commands/raids/change.ts`:

```ts
import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requireParty } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import type { RaidParty } from '../../domain/party/party.js';
import { problemText } from '../../render/activity.js';
import { timestamp } from '../../render/text.js';
import type { Member } from '../../services/attendance-service.js';
import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
import { commandParty, PARTY_OVER } from '../parties/reply.js';
import { typedPartyTime } from './raid-input.js';

/** How often one member may change a raid: each change edits the post and says a line in it. */
export const CHANGE_THROTTLE: Throttle = { uses: 10, perSeconds: 60 };

export const IN_A_RAID_POST = 'Use it in the post of the raid.';

type Changing = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

/** The member who changes a raid, as the services want them. */
export function changingMember(interaction: Changing): Member {
  return { id: interaction.user.id, ...memberInfo(interaction) };
}

/**
 * `It hatches at <t> and ends at <t>.`: the times of a raid as an answer names them, with the
 * day when they are not within half a day of now (an EX or elite raid, or a clock time that was
 * read as another day than the member meant).
 */
export function timesText(party: RaidParty, now: number = Date.now()): string {
  const { hatchTime, endTime } = party;
  if (hatchTime === null || endTime === null) return 'It has no times yet.';
  const style = Math.abs(hatchTime - now) > 12 * 3_600_000 ? 'f' : 't';
  return `It hatches at ${timestamp(hatchTime, style)} and ends at ${timestamp(endTime, style)}.`;
}

/**
 * Tells the member, privately, what came of a change to the raid: `said` when it changed, `same`
 * when the raid already was so. A refusal and a raid that has ended are thrown as `UserError`s;
 * a gym that is taken names the post of the raid that holds it.
 */
export async function answerRaidChange(
  interaction: Changing,
  ctx: AppContext,
  outcome: RaidChangeOutcome,
  said: (party: RaidParty) => string,
  same: string,
): Promise<void> {
  if (outcome.kind === 'gone') throw new UserError(PARTY_OVER);
  if (outcome.kind === 'refused') {
    const post = outcome.other?.forumPostId;
    throw new UserError(
      problemText(outcome.reason, ctx.attendance.limits()) +
        (post ? ` Its post is <#${post}>.` : ''),
    );
  }
  await interaction.reply({
    content: outcome.changed ? said(outcome.party) : same,
    flags: MessageFlags.Ephemeral,
  });
}

/** What the "Set time" button and its form answer for a raid that has its times by now. */
export function timesAlready(party: RaidParty): string {
  return `This raid has its times already. ${timesText(party)} Use \`/hatch\` or \`/end\` to correct them.`;
}

/**
 * Sets the hatch or the end time of a raid from what a member typed, and answers. For `/hatch`,
 * `/end` and the "Set time" form of a post.
 */
export async function changeTime(
  interaction: Changing,
  ctx: AppContext,
  party: RaidParty,
  parameter: 'hatch' | 'end',
  text: string,
): Promise<void> {
  const typed = typedPartyTime(ctx, party, parameter, text, Date.now());
  if (typed === 'unset') {
    throw new UserError('A raid keeps its times once it has them. Give the right time instead.');
  }
  const member = changingMember(interaction);
  const outcome =
    parameter === 'hatch'
      ? await ctx.raids.setHatchTime(party.id, member, typed.at)
      : await ctx.raids.setEndTime(party.id, member, typed.at);
  await answerRaidChange(
    interaction,
    ctx,
    outcome,
    (changed) => `Done. ${timesText(changed)}`,
    `Nothing changed. ${timesText(party)}`,
  );
}

function timeCommand(
  name: 'hatch' | 'end',
  description: string,
  option: string,
  details: string,
): SimpleCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .addStringOption((o) =>
        o.setName('time').setDescription(option).setRequired(true).setMaxLength(40),
      ),
    help: {
      category: 'raid-crud',
      details: `${details} ${IN_A_RAID_POST}`,
      examples: [`/${name} time:20`, `/${name} time:6:15pm`],
    },
    guards: [requireParty],
    throttle: CHANGE_THROTTLE,
    async execute(interaction, ctx) {
      const party = commandParty(interaction, ctx);
      await changeTime(interaction, ctx, party, name, interaction.options.getString('time', true));
    },
  };
}

export const hatch = timeCommand(
  'hatch',
  'Set when the egg of this raid hatches',
  'Minutes from now (20) or a clock time (6:15pm)',
  'Sets the hatch time; the end follows from it. Give the minutes from now or a clock time.',
);

export const end = timeCommand(
  'end',
  'Set when this raid ends',
  'Minutes from now (20) or a clock time (6:15pm)',
  'Sets the end time; the hatch time follows from it. Give the minutes that are left or a ' +
    'clock time.',
);

export const duration: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('duration')
    .setDescription('Set how long this raid lasts once it has hatched')
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('How many minutes the boss stays')
        .setRequired(true)
        .setMinValue(1),
    ),
  help: {
    category: 'raid-crud',
    details:
      'For a raid that lasts longer or shorter than usual. The hatch time stays and the end ' +
      `moves. ${IN_A_RAID_POST}`,
    examples: ['/duration minutes:30'],
  },
  guards: [requireParty],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const minutes = interaction.options.getInteger('minutes', true);
    const longest = ctx.config.settings.maxRaidHatchedDuration;
    if (minutes < 1 || minutes > longest) {
      throw new UserError(`Give the length in minutes, from 1 to ${longest}.`);
    }
    const outcome = await ctx.raids.setDuration(party.id, changingMember(interaction), minutes);
    await answerRaidChange(
      interaction,
      ctx,
      outcome,
      (changed) => `This raid now lasts ${minutes} minutes. ${timesText(changed)}`,
      `This raid already lasts ${minutes} minutes.`,
    );
  },
};
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -1,7 +1,7 @@
 import type { AppContext } from '../../app-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
-import type { RaidBossRef } from '../../domain/party/party.js';
-import { raidBossRef } from '../../domain/party/raid.js';
+import type { RaidBossRef, RaidParty } from '../../domain/party/party.js';
+import { raidBossRef, raidKindOf } from '../../domain/party/raid.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import type { RaidBoss } from '../../domain/pogo/raid-bosses.js';
 import {
@@ -432,3 +432,72 @@ export function reportedTime(
     `I could not read "${plain(truncate(text, 80))}" as ${what}. Try \`20\` (minutes from now) or \`6:15pm\`.`,
   );
 }
+
+const TIME_WORDS = {
+  hatch: 'the time the egg hatches',
+  end: 'the time the raid ends',
+  meet: 'a meeting time',
+} as const;
+
+/**
+ * A time a member typed for a raid that exists: its hatch time, its end time, or the meeting
+ * time of a group. `'unset'` when the member asked to remove it (`cancel`, `none`). Throws a
+ * `UserError` for a text that is no time or lies outside what this raid can have.
+ */
+export function typedPartyTime(
+  ctx: AppContext,
+  party: RaidParty,
+  parameter: 'hatch' | 'end' | 'meet',
+  text: string,
+  now: number,
+): { at: number } | 'unset' {
+  const { settings } = ctx.config;
+  const kind = raidKindOf(party);
+  const rules = raidDurationRules(settings, ctx.raidEvents.events());
+  // Every moment the egg can hatch or have hatched: from a raid's length before the report (or
+  // before now) to the end of the egg time after it.
+  const usual = longestRaidDurations(kind, party.createdAt, party.createdAt, rules);
+  const durations = longestRaidDurations(
+    kind,
+    Math.min(now, party.createdAt) - usual.hatched * MINUTE,
+    party.createdAt + usual.incubation * MINUTE,
+    rules,
+  );
+  const result = resolvePartyTime({
+    text,
+    now,
+    zone: settings.timezone,
+    parameter,
+    partyType: 'raid',
+    raidKind: kind,
+    party: {
+      creationTime: party.createdAt,
+      hatchTime: party.hatchTime,
+      endTime: party.endTime,
+      hatchedDuration: party.raid.hatchedDuration,
+    },
+    settings,
+    durations,
+  });
+  if (result.kind === 'unset') return 'unset';
+  const what = TIME_WORDS[parameter];
+  const outOfRange = (first: number, last: number): UserError =>
+    new UserError(
+      `"${plain(truncate(text, 80))}" cannot be ${what}: it must be between ` +
+        `${timestamp(first, 'f')} and ${timestamp(last, 'f')}.`,
+    );
+  if (result.kind === 'time') {
+    // A raid that was seen hatched and has no times yet hatched before it was reported: it
+    // cannot go on longer than its length from then, whatever an egg of its kind could.
+    if (parameter !== 'hatch' && party.hatchTime === null && party.raid.reportedHatched) {
+      const length = party.raid.hatchedDuration ?? durations.hatched;
+      const last = party.createdAt + length * MINUTE;
+      if (result.at > last) throw outOfRange(now, last);
+    }
+    return { at: result.at };
+  }
+  if (result.kind === 'out-of-range') throw outOfRange(result.first, result.last);
+  throw new UserError(
+    `I could not read "${plain(truncate(text, 80))}" as ${what}. Try \`20\` (minutes from now) or \`6:15pm\`.`,
+  );
+}
```

Apply to `src/components/party.ts`:

```diff
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -4,19 +4,22 @@ import {
   answerClick,
   doneWords,
   moreWords,
+  PARTY_OVER,
   remoteWords,
 } from '../commands/parties/reply.js';
+import { changeTime, timesAlready } from '../commands/raids/change.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
 import { requireGuild } from '../discord/guards.js';
 import { STALE_COMPONENT } from '../discord/router.js';
 import { isGroupId } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { isPartyAction, PARTY_KIND } from '../render/party-controls.js';
+import { raidStage } from '../domain/party/raid.js';
+import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
 
 /**
- * The controls of a party's post (spec 4.1): its buttons, and the two answers under a completion
- * question. The party is named by the custom id, not by the channel, so the same controls work
+ * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
+ * question, and the "Set time" button of a raid without times with the form it opens. The party is named by the custom id, not by the channel, so the same controls work
  * on a copy of the message in another channel. Every click is answered privately, a burst of
  * clicks by one member with one answer (`answerClick`); what it changed is said in the post by
  * the attendance service.
@@ -106,6 +109,15 @@ export const partyButtons: ComponentHandler = {
           await attendance.joinGroup(partyId, member, group),
         );
       }
+      case 'time': {
+        const party = ctx.parties.get(partyId);
+        if (!party) throw new UserError(PARTY_OVER);
+        if (party.hatchTime !== null) throw new UserError(timesAlready(party));
+        await interaction.showModal(
+          timeForm(partyId, raidStage(party, Date.now()) === 'egg' ? 'hatch' : 'end'),
+        );
+        return;
+      }
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
@@ -118,4 +130,19 @@ export const partyButtons: ComponentHandler = {
       }
     }
   },
+
+  /** The "Set time" form: what was typed is the hatch or the end time, as the form asked. */
+  async modal(interaction, id, ctx) {
+    const [parameter] = id.args;
+    if (id.action !== 'time' || (parameter !== 'hatch' && parameter !== 'end')) {
+      throw new UserError(STALE_COMPONENT);
+    }
+    const party = ctx.parties.get(id.id);
+    if (!party) throw new UserError(PARTY_OVER);
+    // Somebody else set the time while the form was open: theirs stands, corrections are
+    // deliberate (`/hatch`, `/end`).
+    if (party.hatchTime !== null) throw new UserError(timesAlready(party));
+    const text = interaction.fields.getTextInputValue(TIME_INPUT);
+    await changeTime(interaction, ctx, party, parameter, text);
+  },
 };
```

Apply to `src/render/party-controls.ts`:

```diff
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -1,9 +1,11 @@
 import {
   ButtonStyle,
   ComponentType,
+  TextInputStyle,
   type APIActionRowComponent,
   type APIButtonComponentWithCustomId,
   type APIComponentInMessageActionRow,
+  type APIModalInteractionResponseCallbackData,
 } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import {
@@ -19,7 +21,8 @@ export const PARTY_KIND = 'party';
 
 /**
  * What a control of a post does: the action part of its custom id. `group` carries the group's
- * letter as its argument, `answer` carries `yes` or `no` (the completion question).
+ * letter as its argument, `answer` carries `yes` or `no` (the completion question). `time` is
+ * the "Set time" button, and the form it opens, which carries `hatch` or `end`.
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -32,6 +35,7 @@ export const PARTY_ACTIONS = [
   'remote',
   'group',
   'answer',
+  'time',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -70,9 +74,9 @@ function groupLabel(party: RaidParty, group: PartyGroup): string {
 }
 
 /**
- * The controls under a party's message (spec 4.1): the five statuses; the head count and the
- * remote switch (an elite raid has none); and, when there is more than one group, a button per
- * group to move there. Buttons and not a menu for the groups: a menu keeps showing each member
+ * The controls under a party's message (spec 4.1): the five statuses; the head count, the
+ * remote switch (an elite raid has none) and, for a raid without times, "Set time" (spec 4.3);
+ * and, when there is more than one group, a button per group to move there. Buttons and not a menu for the groups: a menu keeps showing each member
  * their last choice, also one that was refused. Nothing depends on the time, so the controls
  * never need an edit of their own: Done on an egg is refused when it is pressed.
  */
@@ -97,6 +101,8 @@ export function partyControls(party: RaidParty): Row[] {
         ...(remoteAllowed(party)
           ? [button(id, 'remote', 'Remote / in person', ButtonStyle.Secondary)]
           : []),
+        // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
+        ...(party.hatchTime === null ? [button(id, 'time', 'Set time', ButtonStyle.Primary)] : []),
       ],
     },
   ];
@@ -142,6 +148,40 @@ export function completionQuestion(
   };
 }
 
+/** The id of the one input of the "Set time" form. */
+export const TIME_INPUT = 'time';
+
+/**
+ * The form the "Set time" button opens: one line for the time. Which time it asks for is
+ * decided when it opens (an egg is asked when it hatches, a hatched raid when it ends) and
+ * travels in the form's custom id, so the answer is read as what was asked.
+ */
+export function timeForm(
+  partyId: string,
+  parameter: 'hatch' | 'end',
+): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: encodeCustomId({ kind: PARTY_KIND, id: partyId, action: 'time', args: [parameter] }),
+    title: parameter === 'hatch' ? 'When does the egg hatch?' : 'When does the raid end?',
+    components: [
+      {
+        type: ComponentType.ActionRow,
+        components: [
+          {
+            type: ComponentType.TextInput,
+            custom_id: TIME_INPUT,
+            label: parameter === 'hatch' ? 'Hatch time' : 'End time',
+            style: TextInputStyle.Short,
+            required: true,
+            max_length: 40,
+            placeholder: '20 (minutes from now) or 6:15pm',
+          },
+        ],
+      },
+    ],
+  };
+}
+
 /** A group's label as text for a sentence: `group B` or `group B (park side)`. */
 export function groupWords(group: { id: string; label?: string }): string {
   return group.label ? `group ${group.id} (${plain(group.label)})` : `group ${group.id}`;
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/raids/change.test.ts src/render/party-controls.test.ts`
Expected: PASS (`src/commands/raids/change.ts`, `src/commands/parties/meet.ts`, `src/commands/raids/raid-input.ts`, `src/render/party-controls.ts`, `src/components/party.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/index.ts src/commands/parties/meet.ts src/commands/raids/change.test.ts src/commands/raids/change.ts src/commands/raids/raid-input.ts src/components/party.ts src/render/party-controls.test.ts src/render/party-controls.ts
npm run check
git add src/commands/index.ts src/commands/parties/meet.ts src/commands/raids/change.test.ts src/commands/raids/change.ts src/commands/raids/raid-input.ts src/components/party.ts src/render/party-controls.test.ts src/render/party-controls.ts
git commit -m "Raid commands: /hatch /end /duration /meet /cancel-meet, and Set time on a post without times" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,759 unit tests.

---

### Task 7: /boss, /moveset and /location

**Files:**
- Create: `src/commands/raids/boss.test.ts`, `src/commands/raids/boss.ts`
- Modify: `src/commands/index.ts`, `src/commands/raids/raid-input.ts`

**Interfaces:**
- Consumes: Task 5 (`ctx.raids`); Task 6 (`answerRaidChange`, `CHANGE_THROTTLE`, `changingMember`, `IN_A_RAID_POST`); `reportedBoss`, `bossChoices`, `reportedGym`, `gymChoices`, `MAX_CHOICES`; `matchNamed`; `PartyService.view`; `partyOf`, `regionChannelOf`.
- Produces: `src/commands/raids/boss.ts`: the commands `boss`, `moveset`, `location`; `GymInputOptions { localOnly? }` as the last parameter of `gymChoices` and `reportedGym`.

The command is `/location`, not `/gym` (decision 9). Its autocomplete and its reading of typed text consider only gyms of the region itself; the service is still the authority and refuses a gym of another region that reaches it as a picked id.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/raids/boss.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import type { RaidReport } from '../../services/party-service.js';
import { commands } from '../index.js';
import { boss, location, moveset } from './boss.js';

const all: CommandModule[] = [boss, moveset, location];

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, []);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  const run = (commandName: string, options: Record<string, string> = {}, extra = {}) =>
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
  const answer = async (commandName: string, options?: Record<string, string>) =>
    sent((await run(commandName, options)).reply).content;
  /** The choices offered while typing into an option. */
  const offered = async (commandName: string, focusedName: string, focused: string, extra = {}) => {
    const interaction = await handle(
      fakeAutocomplete({ commandName, ...where, focusedName, focused, ...extra }),
    );
    return interaction.respond.mock.calls[0]?.[0];
  };
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, offered, lines };
}

describe('/boss', () => {
  it('sets the boss of an egg, privately, and the post says who did it', async () => {
    const made = await setup();
    const used = await made.run('boss', { pokemon: 'b:yveltal:T5:0' });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'The boss is now Yveltal (T5).',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().raid.boss).toEqual({ key: 'yveltal' });
    expect(await made.lines()).toEqual([`<@${ALICE}> set the boss: **Yveltal (T5)**.`]);
    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(
      'This raid already is: Yveltal (T5).',
    );
  });

  it('reads typed text as `/raid` does: a tier makes it an egg of that tier', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 't3' })).toBe('This is now: T3 egg.');
    expect(made.current().raid).toMatchObject({ tier: { level: 'T3', shadow: false }, boss: null });
    expect(await made.answer('boss', { pokemon: 'zzzz' })).toMatch(
      /^I do not know a raid boss or tier called "zzzz"\./,
    );
  });

  it('offers the bosses and the eggs while typing', async () => {
    const made = await setup();
    expect(await made.offered('boss', 'pokemon', 'yve')).toEqual([
      { name: 'Yveltal (T5)', value: 'b:yveltal:T5:0' },
    ]);
  });
});

describe('/moveset', () => {
  it('sets one move or both, by a choice of the list or by typed text', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.answer('moveset', { quick: 'SNARL_FAST' })).toBe(
      'The moves are now Snarl / ????.',
    );
    expect(await made.answer('moveset', { charge: 'dark pulse' })).toBe(
      'The moves are now Snarl / Dark Pulse.',
    );
    expect(made.current().raid).toMatchObject({
      fastMove: 'SNARL_FAST',
      chargedMove: 'DARK_PULSE',
    });
    expect(await made.answer('moveset', { quick: 'gust', charge: 'hurricane' })).toBe(
      'The moves are now Gust / Hurricane.',
    );
    expect(await made.answer('moveset', { quick: 'gust' })).toBe(
      'The raid already had those moves.',
    );
    expect((await made.lines()).at(-1)).toBe(`<@${ALICE}> set the moves: Gust / Hurricane.`);
  });

  it('refuses a move the boss does not have, listing those it has', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.answer('moveset', { quick: 'waterfall' })).toBe(
      '"waterfall" is not one fast move of Yveltal. Its fast moves are: Sucker Punch, Snarl, Gust.',
    );
    // A charged move is no fast move.
    expect(await made.answer('moveset', { quick: 'DARK_PULSE' })).toMatch(/is not one fast move/);
    // Nothing is set when one of two is wrong.
    expect(await made.answer('moveset', { quick: 'snarl', charge: 'nonsense' })).toMatch(
      /is not one charged move of Yveltal/,
    );
    expect(made.current().raid.fastMove).toBeNull();
  });

  it('needs a move, a boss, and a boss the game master knows', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.answer('moveset')).toBe('Give the fast move, the charged move, or both.');
    const egg = await setup();
    expect(await egg.answer('moveset', { quick: 'snarl' })).toBe('This raid has no boss yet.');
    const unknown = await setup({ boss: { name: 'Newmon' } });
    expect(await unknown.answer('moveset', { quick: 'snarl' })).toBe(
      'I do not know the moves of Newmon yet.',
    );
  });

  it('offers the moves of the boss while typing, and nothing without a boss', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.offered('moveset', 'quick', '')).toEqual([
      { name: 'Sucker Punch', value: 'SUCKER_PUNCH_FAST' },
      { name: 'Snarl', value: 'SNARL_FAST' },
      { name: 'Gust', value: 'GUST_FAST' },
    ]);
    expect(await made.offered('moveset', 'charge', 'pu')).toEqual([
      { name: 'Dark Pulse', value: 'DARK_PULSE' },
    ]);
    const egg = await setup();
    expect(await egg.offered('moveset', 'quick', '')).toEqual([]);
    expect(await made.offered('moveset', 'quick', '', { channelId: '600000000000000009' })).toEqual(
      [],
    );
  });
});

describe('/location', () => {
  it('moves the raid to another gym of the region', async () => {
    const made = await setup();
    expect(await made.answer('location', { gym: 'g:2' })).toBe(
      'This raid is now at Old Stone Fountain.',
    );
    expect(made.current().gymId).toBe(2);
    expect(await made.lines()).toEqual([`<@${ALICE}> moved this raid to **Old Stone Fountain**.`]);
    expect(await made.answer('location', { gym: 'fountain' })).toBe(
      'This raid is at Old Stone Fountain already.',
    );
  });

  it('refuses a gym of another region, and a gym that has such a raid, with its post', async () => {
    const made = await setup();
    expect(await made.answer('location', { gym: 'g:8' })).toMatch(
      /^That gym is in another region, and a raid cannot move between regions yet\./,
    );
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('no gym');
    const other = await made.service.reportRaid({
      gym,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    expect(await made.answer('location', { gym: 'g:2' })).toBe(
      `That gym already has a raid like this one. Its post is <#${other.party.forumPostId ?? ''}>.`,
    );
    expect(made.current().gymId).toBe(1);
  });

  it('asks for a pick when the text fits several gyms or none', async () => {
    const made = await setup();
    expect(await made.answer('location', { gym: 'starbucks maple' })).toMatch(
      /^(This raid is now at Starbucks\.|Several gyms fit "starbucks maple")/,
    );
    expect(await made.answer('location', { gym: 'qqqqqq' })).toBe(
      'I found no gym for "qqqqqq". Type part of its name and pick it from the list.',
    );
  });

  it('offers and reads only gyms of the region the raid is in', async () => {
    const made = await setup();
    // The lighthouse is just across the border: `/raid` would offer it, this does not.
    expect(await made.offered('location', 'gym', 'lighthouse')).toEqual([]);
    expect(await made.answer('location', { gym: 'lighthouse' })).toBe(
      'I found no gym for "lighthouse". Type part of its name and pick it from the list.',
    );
  });

  it('offers the gyms of the region while typing', async () => {
    const made = await setup();
    const choices = await made.offered('location', 'gym', 'fount');
    expect(choices?.[0]).toEqual({ name: 'Old Stone Fountain', value: 'g:2' });
  });
});

describe('the command list', () => {
  it('has every command of this plan once, each with help', () => {
    const names = commands.map((command) => command.data.name);
    for (const name of [
      'hatch',
      'end',
      'duration',
      'boss',
      'moveset',
      'location',
      'meet',
      'cancel-meet',
    ]) {
      expect(
        names.filter((n) => n === name),
        name,
      ).toHaveLength(1);
    }
    // `/gym` is kept for the gym administration (Phase 5).
    expect(names).not.toContain('gym');
  });
});
```

Run: `npx vitest run --project unit src/commands/raids/boss.test.ts`
Expected: FAIL (`boss.ts` does not exist).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -3,6 +3,7 @@ import { admin } from './admin/index.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
 import { group } from './parties/group.js';
 import { cancelMeet, meet } from './parties/meet.js';
+import { boss, location, moveset } from './raids/boss.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
 import { help } from './util/help.js';
@@ -25,5 +26,8 @@ export const commands: readonly CommandModule[] = [
   hatch,
   end,
   duration,
+  boss,
+  moveset,
+  location,
   admin,
 ];
```

Create `src/commands/raids/boss.ts`:

```ts
import { SlashCommandBuilder, type AutocompleteInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, regionChannelOf, requireParty } from '../../discord/guards.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { matchNamed } from '../../domain/search/word-match.js';
import { problemText } from '../../render/activity.js';
import { plain, truncate } from '../../render/text.js';
import { commandParty } from '../parties/reply.js';
import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
import { bossChoices, gymChoices, MAX_CHOICES, reportedBoss, reportedGym } from './raid-input.js';

export const boss: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('boss')
    .setDescription('Set the boss of this raid, or the tier of its egg')
    .addStringOption((option) =>
      option
        .setName('pokemon')
        .setDescription('The boss, or the tier of an egg: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'raid-crud',
    details:
      'For an egg whose boss is known now, or a raid that was reported wrongly. The times stay ' +
      'as they are: naming the boss does not hatch the egg. A boss that has only one fast or ' +
      `one charged move gets it set. ${IN_A_RAID_POST}`,
    examples: ['/boss pokemon:yveltal', '/boss pokemon:t3'],
  },
  guards: [requireParty],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const reported = reportedBoss(ctx, interaction.options.getString('pokemon', true));
    const outcome = await ctx.raids.setBoss(party.id, changingMember(interaction), reported);
    await answerRaidChange(
      interaction,
      ctx,
      outcome,
      () =>
        reported.boss === null
          ? `This is now: ${reported.label}.`
          : `The boss is now ${reported.label}.`,
      `This raid already is: ${reported.label}.`,
    );
  },
  async autocomplete(interaction, ctx) {
    await interaction.respond(bossChoices(ctx, interaction.options.getFocused()));
  },
};

type MoveKind = 'quick' | 'charge';

const KIND_WORDS: Readonly<Record<MoveKind, string>> = { quick: 'fast', charge: 'charged' };

/** The ids of the moves of one kind that a Pokémon can have as a raid boss. */
function movesOf(entry: PokemonEntry, kind: MoveKind): readonly string[] {
  return kind === 'quick' ? entry.fastMoves : entry.chargedMoves;
}

/** The boss of the raid an interaction is in, when the game master knows its moves. */
function bossEntry(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): PokemonEntry | undefined {
  const party = partyOf(interaction, ctx);
  return party ? ctx.partyService.view(party).boss?.entry : undefined;
}

/**
 * The move a text names among those the boss has: a choice of the list (a move id), or typed
 * text that fits exactly one of them. Throws a `UserError` that lists the moves otherwise.
 */
function typedMove(ctx: AppContext, entry: PokemonEntry, kind: MoveKind, text: string): string {
  const { catalogue } = ctx.gameData;
  const ids = movesOf(entry, kind);
  const picked = text.trim();
  if (ids.includes(picked)) return picked;
  const named = ids.map((id) => ({ value: id, names: [catalogue.move(id)?.name ?? id] }));
  const fits = matchNamed(named, picked);
  const [only] = fits;
  if (only !== undefined && fits.length === 1) return only;
  const names = named.map((move) => plain(move.names[0] ?? move.value)).join(', ');
  throw new UserError(
    `"${plain(truncate(picked, 80))}" is not one ${KIND_WORDS[kind]} move of ${plain(entry.name)}. ` +
      `Its ${KIND_WORDS[kind]} moves are: ${names}.`,
  );
}

export const moveset: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('moveset')
    .setDescription('Set the moves of the boss of this raid')
    .addStringOption((option) =>
      option
        .setName('quick')
        .setDescription('The fast move: pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('charge')
        .setDescription('The charged move: pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'raid-crud',
    details:
      'Give one move or both; what you leave out stays as it is. The lists show the moves the ' +
      `boss can have. ${IN_A_RAID_POST}`,
    examples: ['/moveset quick:snarl charge:dark pulse', '/moveset charge:hurricane'],
  },
  guards: [requireParty],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const quick = interaction.options.getString('quick');
    const charge = interaction.options.getString('charge');
    if (quick === null && charge === null) {
      throw new UserError('Give the fast move, the charged move, or both.');
    }
    const shown = ctx.partyService.view(party).boss;
    if (!shown) throw new UserError(problemText('no-boss', ctx.attendance.limits()));
    const { entry } = shown;
    if (!entry) throw new UserError(`I do not know the moves of ${plain(shown.name)} yet.`);
    const moves = {
      ...(quick === null ? {} : { fastMove: typedMove(ctx, entry, 'quick', quick) }),
      ...(charge === null ? {} : { chargedMove: typedMove(ctx, entry, 'charge', charge) }),
    };
    const outcome = await ctx.raids.setMoveset(party.id, changingMember(interaction), moves);
    const name = (id: string | null): string =>
      plain((id && ctx.gameData.catalogue.move(id)?.name) ?? '????');
    await answerRaidChange(
      interaction,
      ctx,
      outcome,
      (changed) =>
        `The moves are now ${name(changed.raid.fastMove)} / ${name(changed.raid.chargedMove)}.`,
      'The raid already had those moves.',
    );
  },
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    const entry = bossEntry(interaction, ctx);
    if (!entry || (focused.name !== 'quick' && focused.name !== 'charge')) {
      await interaction.respond([]);
      return;
    }
    const typed = focused.value.trim().toLowerCase();
    const choices = movesOf(entry, focused.name)
      .map((id) => ({ name: ctx.gameData.catalogue.move(id)?.name ?? id, value: id }))
      .filter((choice) => choice.name.toLowerCase().includes(typed) && choice.value.length <= 100)
      .slice(0, MAX_CHOICES)
      .map((choice) => ({ ...choice, name: truncate(choice.name, 100) }));
    await interaction.respond(choices);
  },
};

/**
 * `/location`: moves the raid to another gym. The legacy command was `!gym`; the name `/gym`
 * belongs to the gym administration (`/gym create`, …), and one command cannot be both.
 */
export const location: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('location')
    .setDescription('Move this raid to another gym, when it was reported at the wrong one')
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('The gym: type part of its name and pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'raid-crud',
    details:
      'The gym must be in the same region, and must not have such a raid already. ' +
      IN_A_RAID_POST,
    examples: ['/location gym:Big Fountain'],
  },
  guards: [requireParty],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const typed = interaction.options.getString('gym', true);
    const answer = reportedGym(ctx, regionChannelOf(interaction, ctx), typed, { localOnly: true });
    if (answer.kind === 'none') {
      throw new UserError(
        `I found no gym for "${plain(truncate(typed, 80))}". Type part of its name and pick it from the list.`,
      );
    }
    if (answer.kind === 'several') {
      const names = answer.gyms.slice(0, 3).map((gym) => plain(gym.name));
      throw new UserError(
        `Several gyms fit "${plain(truncate(typed, 80))}" (${names.join(', ')}…). Pick one from the list.`,
      );
    }
    const { gym } = answer;
    const name = plain(gym.nickname || gym.name);
    const outcome = await ctx.raids.setGym(party.id, changingMember(interaction), gym.id);
    await answerRaidChange(
      interaction,
      ctx,
      outcome,
      () => `This raid is now at ${name}.`,
      `This raid is at ${name} already.`,
    );
  },
  async autocomplete(interaction, ctx) {
    const regionName = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    await interaction.respond(
      gymChoices(
        ctx,
        regionChannelOf(interaction, ctx),
        interaction.options.getFocused(),
        regionName,
        { localOnly: true },
      ),
    );
  },
};
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -335,6 +335,11 @@ function gymLabel(gym: Gym, region: string | undefined): string {
   return truncate(parts.join(' · '), CHOICE_NAME);
 }
 
+export interface GymInputOptions {
+  /** Only gyms of the region itself: for a raid that cannot leave its region (`/location`). */
+  localOnly?: boolean;
+}
+
 /**
  * The choices for the `gym` option: the gyms matching what was typed, the region's own first.
  * `regionName` gives the name of a region channel, to say where a gym of another region lies.
@@ -344,10 +349,12 @@ export function gymChoices(
   regionChannelId: string | undefined,
   typed: string,
   regionName: (channelId: string) => string | undefined,
+  options: GymInputOptions = {},
 ): Choice[] {
   if (typed.trim() === '') return [];
   return ctx.gyms
     .search(regionChannelId ?? null, typed, { limit: MAX_CHOICES })
+    .filter((hit) => !options.localOnly || hit.place === 'local')
     .map(({ gym, place }) => {
       const elsewhere = place === 'local' ? undefined : ctx.gyms.regionsOf(gym.id)[0];
       const region = elsewhere === undefined ? undefined : regionName(elsewhere);
@@ -370,6 +377,7 @@ export function reportedGym(
   ctx: AppContext,
   regionChannelId: string | undefined,
   value: string,
+  options: GymInputOptions = {},
 ): GymAnswer {
   const text = value.trim();
   const picked = /^g:(\d{1,10})$/.exec(text);
@@ -377,7 +385,9 @@ export function reportedGym(
     const gym = ctx.gyms.get(Number(picked[1]));
     return gym ? { kind: 'gym', gym } : { kind: 'none' };
   }
-  const hits = ctx.gyms.search(regionChannelId ?? null, text, { limit: 5 });
+  const hits = ctx.gyms
+    .search(regionChannelId ?? null, text, { limit: 5 })
+    .filter((hit) => !options.localOnly || hit.place === 'local');
   if (hits.length === 0) return { kind: 'none' };
   const clear = hits.filter((hit) => hit.allWords && !hit.corrected);
   const [only] = clear;
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/raids/boss.test.ts`
Expected: PASS (`src/commands/raids/boss.ts`, `src/commands/raids/raid-input.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/index.ts src/commands/raids/boss.test.ts src/commands/raids/boss.ts src/commands/raids/raid-input.ts
npm run check
git add src/commands/index.ts src/commands/raids/boss.test.ts src/commands/raids/boss.ts src/commands/raids/raid-input.ts
git commit -m "Raid commands: /boss, /moveset and /location" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,772 unit tests.

---

### Task 8: The clock in the app, and a raid from report to archive in MySQL

**Files:**
- Create: `src/services/party-lifecycle.db.test.ts`
- Modify: `src/app.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: Task 3 (`PartyScheduler`, `restarted`); Task 5 (`raids`); `src/app.ts`; `PartyRepository`; `startMigratedDatabase`.
- Produces: `src/app.ts` builds the scheduler, starts it after the login and stops it first at shutdown; `partyServiceWith(parties, overrides, { database })` puts a real `PartyStorage` under the store; `src/services/party-lifecycle.db.test.ts`.

`startApp` itself still has no test (it needs a token and a database); the lifecycle test covers the same services wired by the test support. It needs Docker.

- [ ] **Step 1: Test support**

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -1,4 +1,5 @@
 import { loadSettings } from '../../src/config/settings.js';
+import type { PartyStorage } from '../../src/db/repositories/party-repository.js';
 import type { Region } from '../../src/db/repositories/region-repository.js';
 import {
   DEFAULT_USER_SETTINGS,
@@ -71,6 +72,8 @@ export interface Outliving {
   clock: { now: number };
   tags: Record<typeof WEST_FORUM | typeof EAST_FORUM, Readonly<Record<string, string>>>;
   userSettings: Map<string, Partial<UserSettings>>;
+  /** The storage the store really uses, when that is not the one in memory (a database test). */
+  database: PartyStorage | undefined;
 }
 
 /**
@@ -95,13 +98,14 @@ export function restarted(made: Outliving, overrides: Partial<PartyServiceOption
 export async function partyServiceWith(
   parties: readonly Party[] = [],
   overrides: Partial<PartyServiceOptions> = {},
-  kept?: Outliving,
+  kept?: Partial<Outliving>,
 ) {
   const clock = kept?.clock ?? { now: PARTY_NOW };
   const now = () => clock.now;
   const storage = kept?.storage ?? new MemoryPartyStorage(parties);
   const { log, entries } = createTestLogger();
-  const store = new PartyStore({ storage, log, now });
+  const database = kept?.database;
+  const store = new PartyStore({ storage: database ?? storage, log, now });
   await store.load();
   const gateway = kept?.gateway ?? new FakePartyGateway();
   const tags = kept?.tags ?? {
@@ -184,6 +188,7 @@ export async function partyServiceWith(
     userSettings,
     store,
     storage,
+    database,
     gateway,
     regions,
     tags,
```

- [ ] **Step 2: Write the failing tests**

Create `src/services/party-lifecycle.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { ALICE, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
import { partyServiceWith, restarted } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { PartyRepository } from '../db/repositories/party-repository.js';
import type { DB } from '../db/types.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob 🎉' };
const HATCH = at('2026-10-13T14:30');
/** The raid is given a length of 50 minutes on the way. */
const END = at('2026-10-13T15:20');

/**
 * A raid from the report to the archived post with the real `Party` table under the store, and
 * a restart in the middle: everything the services decide must survive the state document.
 */
describe('a raid from report to archive, in MySQL, over a restart', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    await sql`insert into Guild (id, snowflake) values (1, '412345678901234567')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Library'), (2, 'Fountain')`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Party').execute();
  });

  it('hatches, asks, catches up after the restart, warns and archives', async () => {
    const repository = new PartyRepository(db);
    const first = await partyServiceWith([], {}, { database: repository });
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym');
    const outcome = await first.service.reportRaid({
      gym,
      reporterId: REPORTER,
      reporter: { name: 'Rhea', team: 'valor' },
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      time: { hatch: HATCH },
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const id = outcome.party.id;
    const postId = outcome.party.forumPostId ?? '';
    await first.attendance.signUp(id, alice, PartyStatus.Present);
    await first.attendance.signUp(id, bob, PartyStatus.Present, { number: 2 });

    first.clock.now = HATCH;
    await first.scheduler.tick();
    await first.raids.setMoveset(id, alice, { fastMove: 'SNARL_FAST' });
    expect(await first.raids.setGym(id, alice, 2)).toMatchObject({ kind: 'ok', changed: true });
    expect(await first.raids.setDuration(id, alice, 50)).toMatchObject({ kind: 'ok' });
    const meet = HATCH + 40 * MINUTE;
    await first.attendance.setMeetingTime(id, bob, meet);
    first.clock.now = HATCH + 10 * MINUTE;
    expect(await first.attendance.done(id, alice)).toMatchObject({ kind: 'ok', asked: [BOB] });
    await first.attendance.flush();
    await first.service.flush();
    const question = first.store.get(id)?.prompts.completion[0];
    expect(question?.members).toEqual([BOB]);

    // The bot stops and starts again after the raid has ended.
    const second = await restarted(first);
    const loaded = second.store.get(id);
    expect(loaded).toEqual(first.store.get(id));
    expect(loaded?.raid).toMatchObject({
      boss: { key: 'yveltal' },
      fastMove: 'SNARL_FAST',
      hatchedDuration: 50,
      stageSeen: 'hatched',
    });
    expect(loaded).toMatchObject({
      gymId: 2,
      endTime: END,
      groups: [{ id: 'A', startTime: meet }],
    });
    expect(attendeeOf(loaded ?? outcome.party, BOB)).toMatchObject({
      status: PartyStatus.CompletePending,
      askedBy: ALICE,
      name: 'Bob 🎉',
      number: 2,
    });

    second.clock.now = END + 6 * MINUTE;
    await second.scheduler.start();
    await second.attendance.flush();
    await second.service.flush();
    const caughtUp = second.store.get(id);
    expect(caughtUp?.raid.stageSeen).toBe('ended');
    expect(attendeeOf(caughtUp ?? outcome.party, BOB)?.status).toBe(PartyStatus.Complete);
    expect(caughtUp?.prompts.completion).toEqual([]);
    expect(caughtUp?.prompts.warning).not.toBeNull();
    expect(caughtUp?.deletionTime).toBe(END + 16 * MINUTE);
    expect(second.gateway.deleted.map((gone) => gone.messageId)).toContain(question?.id);

    second.clock.now = END + 16 * MINUTE;
    await second.scheduler.tick();
    await second.scheduler.stop();
    expect(second.store.get(id)).toBeUndefined();
    expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
    const row = await repository.findById(id);
    expect(row).toMatchObject({ ok: true, party: { status: 'ended', forumPostId: postId } });

    // Nothing is left for a third start to do.
    const third = await restarted(second);
    expect(third.store.active()).toEqual([]);
  });
});
```

- [ ] **Step 3: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -27,6 +27,7 @@ import { GameDataService } from './services/game-data-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { ImageCache } from './services/image-cache.js';
 import { PartyLines } from './services/party-lines.js';
+import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
@@ -42,6 +43,8 @@ const GAME_DATA_CACHE = 'var/game-data-cache.json';
 /** Downloaded map pictures are kept here; deleting the folder only costs new downloads. */
 const IMAGE_CACHE = 'var/images';
 const MINUTE_MS = 60_000;
+/** How long the party clock waits at start for the first read of the raid events. */
+const EVENTS_WAIT_MS = 15_000;
 const HOUR_MS = 60 * MINUTE_MS;
 
 export interface StartOptions {
@@ -133,6 +136,16 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  const scheduler = new PartyScheduler({
+    store: parties,
+    posts: partyService,
+    attendance,
+    lines,
+    gateway: partyGateway,
+    raidBosses,
+    settings: config.settings,
+    log,
+  });
   const clickAnswers = new ClickAnswers({ log });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
   const maps = new StaticMaps(
@@ -183,6 +196,11 @@ export async function startApp(
     features: requested,
   };
   const router = new InteractionRouter(ctx, commands, components);
+  // Resolved by the client that ends up connected (the login may try several).
+  let markConnected: () => void = () => undefined;
+  const connected = new Promise<void>((resolve) => {
+    markConnected = resolve;
+  });
 
   const { client, features } = await loginWithFallback(requested, {
     token: config.env.DISCORD_TOKEN,
@@ -193,6 +211,7 @@ export async function startApp(
       client.once(Events.ClientReady, (ready) => {
         log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
         void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
+        markConnected();
       });
       client.on(Events.GuildCreate, (guild) => {
         guilds
@@ -213,10 +232,23 @@ export async function startApp(
   // Listeners for the raid boss list (Phase 5) must be attached before this call.
   raidBosses.startAutoSync();
   raidEvents.start();
+  // The clock waits for Discord, however long that takes: a post that cannot be asked for yet
+  // would be taken for deleted. Then for the first read of the raid events (a raid that hatched
+  // during a Raid Hour is otherwise given the usual length), but for that not for ever.
+  void scheduler.start(
+    connected.then(() =>
+      Promise.race([
+        raidEvents.refresh(),
+        new Promise((resolve) => setTimeout(resolve, EVENTS_WAIT_MS).unref()),
+      ]),
+    ),
+  );
   log.info({ features }, 'optional features');
 
   const shutdown = createShutdown(
     [
+      // First: nothing may start changing parties while the rest is being flushed.
+      { name: 'party clock', timeoutMs: 10_000, run: () => scheduler.stop() },
       {
         name: 'game data refresh',
         timeoutMs: 1_000,
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project db src/services/party-lifecycle.db.test.ts` (Docker; allow ten minutes)
Expected: PASS.

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app.ts src/services/party-lifecycle.db.test.ts test/support/party-service.ts
npm run check
git add src/app.ts src/services/party-lifecycle.db.test.ts test/support/party-service.ts
git commit -m "The party clock runs in the app and stops first at shutdown; a raid from report to archive over a restart" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,772 unit tests.

---

### Task 9: The archive warning again in a busy post

**Files:**
- Modify: `src/app.ts`, `src/services/party-scheduler.test.ts`, `src/services/party-scheduler.ts`

**Interfaces:**
- Consumes: Task 3 (`PartyScheduler`, its `warn`, `stop`); `PartyStore.byPost`; `src/app.ts`'s client events.
- Produces: `PartyScheduler.activity(channelId): void`, `whenIdle(): Promise<void>`, `WARN_AGAIN_AFTER` (5); `src/app.ts` listens to `MessageCreate` and passes on where somebody other than the bot wrote.

Only the channel id of a message is used. The count is by post, in memory, and forgotten whenever a message arrives for a post that has no warning.

- [ ] **Step 1: Write the failing tests**

Apply to `src/services/party-scheduler.test.ts`:

```diff
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -8,6 +8,7 @@ import { attendeeOf } from '../domain/party/party.js';
 import { setEndTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
+import { WARN_AGAIN_AFTER } from './party-scheduler.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -227,6 +228,83 @@ describe('PartyScheduler: hatch and end', () => {
   });
 });
 
+describe('PartyScheduler: the warning in a busy post', () => {
+  const warnings = (made: Made) =>
+    made.gateway
+      .messagesIn(made.postId)
+      .filter((message) => message.message.content?.includes('I will archive this post'));
+
+  /** Messages of others in the post, one by one, each given time to be dealt with. */
+  async function chatter(made: Made, count: number, channelId = made.postId): Promise<void> {
+    for (let n = 0; n < count; n++) made.scheduler.activity(channelId);
+    await made.scheduler.whenIdle();
+  }
+
+  it('says the warning again below every fifth message, and deletes the one before', async () => {
+    const made = await reportedRaid({ time: { hatch: HATCH } });
+    await tickAt(made, END + 6 * MINUTE);
+    const first = made.current().prompts.warning;
+    await chatter(made, WARN_AGAIN_AFTER - 1);
+    expect(made.current().prompts.warning).toBe(first);
+    expect(warnings(made)).toHaveLength(1);
+
+    await chatter(made, 1);
+    const second = made.current().prompts.warning;
+    expect(second).not.toBe(first);
+    expect(warnings(made).map((message) => message.id)).toEqual([second]);
+    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([first]);
+    // The same archiving time: the warning is repeated, not put off.
+    expect(warnings(made)[0]?.message.content).toContain(
+      `<t:${(made.current().deletionTime ?? 0) / 1000}:R>`,
+    );
+
+    await chatter(made, WARN_AGAIN_AFTER);
+    expect(made.current().prompts.warning).not.toBe(second);
+    expect(warnings(made)).toHaveLength(1);
+  });
+
+  it('counts nothing for a post that has no warning, for another channel, or after the end', async () => {
+    const made = await reportedRaid({ time: { hatch: HATCH } });
+    await chatter(made, 20);
+    expect(warnings(made)).toEqual([]);
+    await tickAt(made, END + 6 * MINUTE);
+    const warned = made.current().prompts.warning;
+    await chatter(made, 20, '600000000000000123');
+    expect(made.current().prompts.warning).toBe(warned);
+  });
+
+  it('starts counting anew when the archiving was called off and is due again', async () => {
+    const made = await reportedRaid({ time: { hatch: HATCH } });
+    const id = made.party.id;
+    await tickAt(made, END + 6 * MINUTE);
+    await chatter(made, WARN_AGAIN_AFTER - 1);
+    const later = END + 30 * MINUTE;
+    await made.store.update(id, (party) => ({
+      party: setEndTime(party, later, made.service.rules(), made.clock.now),
+    }));
+    // A message while the raid runs on forgets the count.
+    await chatter(made, 1);
+    await tickAt(made, later + 6 * MINUTE);
+    const warned = made.current().prompts.warning;
+    await chatter(made, WARN_AGAIN_AFTER - 1);
+    expect(made.current().prompts.warning).toBe(warned);
+  });
+
+  it('says it once when many messages come at once, and logs a failure', async () => {
+    const made = await reportedRaid({ time: { hatch: HATCH } });
+    await tickAt(made, END + 6 * MINUTE);
+    await chatter(made, 3 * WARN_AGAIN_AFTER);
+    expect(warnings(made)).toHaveLength(1);
+    expect(made.gateway.deleted).toHaveLength(1);
+
+    made.gateway.failing.set('sendMessage', new Error('no'));
+    await chatter(made, WARN_AGAIN_AFTER);
+    expect(
+      made.entries.some((entry) => entry.msg === 'could not say the archive warning again'),
+    ).toBe(true);
+  });
+});
+
 describe('PartyScheduler: meeting times and the completion question', () => {
   /** A hatched raid where Alice, Bob and Carol are here and the group meets at 14:40. */
   async function meeting() {
```

Run: `npx vitest run --project unit src/services/party-scheduler.test.ts`
Expected: FAIL (`activity` does not exist).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -224,6 +224,10 @@ export async function startApp(
           .catch((err: unknown) => log.error({ err, guild: guild.id }, 'could not remove guild'));
       });
       client.on(Events.InteractionCreate, (interaction) => void router.handle(interaction));
+      // Only that somebody wrote, and where: the archive warning of a busy post is said again.
+      client.on(Events.MessageCreate, (message) => {
+        if (message.author.id !== client.user?.id) scheduler.activity(message.channelId);
+      });
       client.on(Events.Error, (err) => log.error({ err }, 'discord client error'));
       client.on(Events.Warn, (message) => log.warn(message));
     },
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -11,6 +11,8 @@ import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 
 const HOUR_MS = 3_600_000;
+/** The warning is said again after this many messages of others in the post. */
+export const WARN_AGAIN_AFTER = 5;
 /** The names in a line of the scheduler are cut so that the line stays well within a message. */
 const LINE_NAMES = 1_500;
 
@@ -40,6 +42,10 @@ export interface PartySchedulerOptions {
  * applies everything that was missed while the bot was down. The party is stored before
  * anything is done about it: what fails on Discord's side afterwards is logged and not done
  * again, except the ending, which the tick asks for until the party has ended.
+ *
+ * The warning would be lost in a busy post, and Discord has nothing that stays in view there, so
+ * it is said again at the bottom after every few messages of others (`activity`), the earlier
+ * one deleted: a post has one warning, never far up.
  */
 export class PartyScheduler {
   private readonly now: () => number;
@@ -49,6 +55,10 @@ export class PartyScheduler {
   private previous: number | null = null;
   private lastUpkeep: number;
   private stopped = false;
+  /** Messages of others since the warning was last said, by post. Not stored: a restart starts anew. */
+  private readonly sinceWarning = new Map<string, number>();
+  /** Warnings being said again; `stop` waits for them. */
+  private readonly repeating = new Map<string, Promise<void>>();
 
   constructor(private readonly options: PartySchedulerOptions) {
     this.now = options.now ?? (() => Date.now());
@@ -87,8 +97,47 @@ export class PartyScheduler {
     this.stopped = true;
     if (this.timer) clearInterval(this.timer);
     this.timer = undefined;
+    await this.whenIdle();
+  }
+
+  /** Resolves once nothing the clock started is under way. For `stop` and for tests. */
+  async whenIdle(): Promise<void> {
     await this.running;
     await this.upkeeping;
+    await Promise.all(this.repeating.values());
+  }
+
+  /**
+   * Somebody other than the bot wrote in a channel. When that is the post of a party that has
+   * been warned, the message counts, and with every `WARN_AGAIN_AFTER`th the warning is said
+   * again below it. Returns at once; never throws.
+   */
+  activity(channelId: string): void {
+    const { store, log } = this.options;
+    if (this.stopped) return;
+    let party: Party | undefined;
+    try {
+      party = store.byPost(channelId);
+    } catch {
+      // The parties are not loaded yet.
+      return;
+    }
+    if (!party || party.deletionTime === null || party.prompts.warning === null) {
+      this.sinceWarning.delete(channelId);
+      return;
+    }
+    const count = (this.sinceWarning.get(channelId) ?? 0) + 1;
+    if (count < WARN_AGAIN_AFTER || this.repeating.has(channelId)) {
+      this.sinceWarning.set(channelId, count);
+      return;
+    }
+    this.sinceWarning.set(channelId, 0);
+    const again = this.warn(party.id)
+      .catch((err: unknown) => {
+        log.warn({ err, party: party.id }, 'could not say the archive warning again');
+      })
+      .finally(() => this.repeating.delete(channelId));
+    this.repeating.set(channelId, again);
   }
 
   /**
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/party-scheduler.test.ts`
Expected: PASS (`src/services/party-scheduler.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/app.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts
npm run check
git add src/app.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts
git commit -m "The archive warning is said again after every fifth message in the post" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,776 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `npm run test:db` once, complete (state version 3 and `endedPosts` against real MySQL, the lifecycle test).
2. Whole-branch review (Opus, high effort) of the nine commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `PartyScheduler`, `PartyService.end` / `sweepPosts`, `ctx.raids` and `RaidChangeOutcome`, `ctx.clickAnswers` / `answerClick`, state version 3 (`askedBy`, questions as records, `withdrawQuestions`), `certainMoves`, `typedPartyTime`, `/location`, the test support (`scheduler`, `raids`, `restarted()`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: delete what this plan did from the "Plan 2D" and "Plan 2D-2" lists; add a "From Phase 2D-2" section. The spec (sections 4.2, 4.3, 5.2, 5.3 "as built", 5.5 state version 3), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of plans 2D-1 and 2D-2 has touched Discord. Each step needs Matt's go-ahead. The scaffolding of plan 2C is still on the test server (the forum `test-region-raids`); do the checklist at the end of the 2D-1 plan first. For the clock, set `cleanupInterval` to 15 seconds and the grace and warning times to 1 minute in a local copy of the settings.

- [ ] `npm run deploy-commands -- --guild <test server id>` registers `/hatch`, `/end`, `/duration`, `/boss`, `/moveset`, `/location`, `/meet`, `/cancel-meet`.
- [ ] Start the bot with raids left from an earlier run: each post is shown anew (buttons appear on old posts), and the log says "the party clock is running" only after "connected to Discord".
- [ ] Report an egg without a time: the post has a "Set time" button; it opens a form "When does the egg hatch?"; `2` sets the time, the button disappears, and the post says who set it.
- [ ] At the hatch time the post turns green, its tag changes to Hatched, its title names the boss when the tier has one, and a line "The egg has hatched" appears.
- [ ] `/hatch`, `/end` and `/duration` correct the times; a time outside the raid is explained with the range. `/boss` and `/moveset` offer lists; `/moveset` on Kyogre shows Waterfall already set.
- [ ] `/location` moves the raid to another gym of the region (the title changes within the rename limit); a gym with a raid is refused with a link to that post.
- [ ] `/meet 5` with a second account in the group: the other is pinged with the time. A while after it both are asked whether they are done; one says nothing and is counted as done after the timeout, and the question disappears.
- [ ] Done by mistake, then Here: the question to the other disappears and they are Here again.
- [ ] +1 five times quickly: one private answer that ends up saying the final count. Dismiss the private answer in the middle of a burst: what happens to the final answer (an error in the log, a follow-up, nothing)?
- [ ] When the raid is over: a warning with a relative time; five messages in the post make it appear again at the bottom, and the old one is gone. Check on a phone that it is easy to see.
- [ ] At the archive time the post loses its buttons, is locked and leaves the forum's list; the link line in the region channel and the warning are gone; the summary no longer lists it. Does a click on an old copy of the buttons answer "This raid is over."?
- [ ] `/end 30` on a raid that has been warned: the warning disappears within a tick and the raid runs on.
- [ ] Stop the bot during a raid and start it after the raid's end: one tick shows it as ended and warns; the next archives it.
- [ ] What the fakes cannot show, to note down: whether `edit({ locked: true, archived: true })` works in one call and on an already archived post; whether deleting a message in an archived post works; whether a message sent into a locked, archived post opens it again; how long the start takes with fifty posts.

## As built (2026-10-11)

Commits `c24eba8`, `5fee3c7`, `127ec32`, `b13b4d4`, `d956c88`, `e93536e`, `48bc08d`, `dd6d9e5`, `a1d2091` (Tasks 1 to 9, each equal to the prototype commit it was generated from), then `bf8cdfe` after the whole-branch review (no Critical or Important finding): a correction that makes the raid an egg again puts those who are asked back to Here and removes the question; a raid without times that is over says so instead of naming an inverted range, and its "Set time" button refuses; the count behind the repeated warning starts anew with every warning and is forgotten when the party ends; the upkeep of the forums no longer holds the clock. 1,784 unit tests, 126 database tests. Open items: "From Phase 2D-2" in `phase-0-follow-ups.md`.
