# Phase 2D-1: Controls on the Post and the Attendance Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member signs up for a raid with the buttons under its post, or with `/join`, `/maybe`, `/here`, `/not-here`, `/done`, `/leave`, `/remote`, `/local` and `/group`: the post shows who comes (by team, with team emoji), says in a line what happened, and asks the others of a group whether they are done when one of them is.

**Architecture:** The domain functions of plan 2B already decide everything; this plan puts them within reach of members. `AttendanceService` (`ctx.attendance`) runs one such function through the store, has the post rendered anew, and says what happened in the post through `PartyLines`, which gathers lines into few messages. The buttons (one `ComponentHandler` of kind `party`, which names the party in the custom id) and the slash commands are thin: they read who acts from the interaction, call the service, and answer privately. The controls themselves are part of what the renderer makes of a party. A member's display name and team are read from each interaction and stored with their attendee record, because the bot has no member list.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, zod 4, Vitest. No new dependencies, no database migration (the party's state document gets a second version).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: sections 4.1 (party post controls, the completion question), 4.2 (the rows `join … remote` and `group, new, label`), 5.5 (state). This is the first half of plan 2D of the five Phase 2 plans; the second half (2D-2) is the scheduler loop, archiving, catching up after a restart, and the commands that change a raid (`/hatch`, `/end`, `/boss`, `/gym`, `/duration`, `/moveset`, `/meet`). Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, the "Plan 2D" lists in "From Phase 2A", "From Phase 2B" and "From Phase 2C", and Matt's decision on team emoji there.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (1,617 unit tests at the end, and the database tests). Two reviewers then went through that branch, and what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **Plan 2D is split in two.** This half is everything a member does to their own attendance; nothing here needs the clock. Until 2D-2 runs the scheduler, a member who was asked whether they are done and does not answer stays "asked" (shown under Here), and a post is brought up to date only when something changes.
2. **Name and team come from the interaction** (Matt, 2026-10-11): every button click and command says who acts, with their display name and roles. `memberInfo(interaction)` reads the name and the team (a role named `instinct`, `mystic` or `valor`), and `noteMember` stores both with the attendee record. The post lists each status by team (none, Instinct, Mystic, Valor, as the legacy bot did), then by name, and writes a team's emoji (the server's own emoji named after the team, else a plain symbol) once, before the first of its members: a server's own emoji is some thirty characters, and one for every trainer would halve what fits into a field. An interaction that does not show the member (outside a server the bot is in) changes nothing that is recorded. A member the bot never saw act has neither and comes last among those without a team. No privileged intent is needed.
3. **The state document becomes version 2**: an attendee's `name` and `team`, and the party's `prompts` (the ids of the completion questions that still have somebody to answer, and of the archive warning, which plan 2D-2 uses). A version 1 document is read as one without them. Nothing has been deployed, but the rule of plan 2B stands: a new field is a new version with a reader for the old one.
4. **The controls are rendered with the post** (`partyControls(party)`, in `rendered.message.components`): row 1 Interested, Join, Here, Done, Leave; row 2 −1, +1, Remote / in person (not on an elite raid); row 3, when the raid has more than one group, a button per group (`Group A (3)`, `B: park side (4)`) to move there. Buttons and not a menu for the groups: a menu keeps showing each member their last choice, also one that was refused. No control depends on the time (this half has no clock to switch one back on): Done on an egg is refused when it is pressed. Their custom ids are `party:<party id>:<action>`: the party is named by the id, never by the channel, so the same controls will work on the mirror messages of plan 2E.
5. **Every action is answered privately with how the member stands now** (`You are coming with 2 more, in group B.`) and said in the post in one line that pings nobody (`<@id> is coming with 2 more, in group B.`). The first line after a quiet time goes out at once; lines that follow within two seconds are gathered into one message, in which a member has one line: how they stand at the end (five clicks on +1 are one line). A click that changes nothing (Join from somebody who is coming) says nothing in the post. Somebody who is done is just "done"; switching remote off says "in person"; the answer "Not yet" says "is not done yet". Lines for a post whose party has ended meanwhile are dropped.
6. **Join with several groups does not ask** (the legacy bot did, with a text prompt): the member lands in the newest group, the answer names it, and the group buttons on the post move them. `/join group:A` chooses directly.
7. **`count` is the whole head count, the member included** (`/join count:3` is the member and two more), from 1 to `1 + maximumAdditionalAttendees`. The legacy bot read `3` as three in all and `+3` as three more; one meaning is enough.
8. **The completion question** is a message in the post that names the members asked (pinging those whose settings allow mentions), with the buttons "Yes, done" and "Not yet". Its id is kept in `prompts.completion`, and the message is deleted as soon as nobody is left to answer; one that could not be deleted stays remembered and is tried again. At most ten are kept per party. The names are cut with a count when they would not fit a message.
9. **A new group is announced in the post**, pinging the attendees who have not completed the raid and whose settings allow it (`mentions` and `mentionsGroups`).
10. **Controls are throttled per member** (30 uses a minute over all controls of kind `party`): `ComponentHandler` gets `throttle`, as commands have; each of the new commands has the same limit by itself. The log line for a control without a handler now says why.
11. **An egg without a hatch time cannot be marked done** until plan 2D-2 brings `/hatch` and the clock; accepted for the interval.
12. **Not in this plan:** the scheduler loop, the answer that is assumed after the timeout, archiving and its warning, re-rendering at start, `/hatch`, `/end`, `/duration`, `/boss`, `/gym`, `/moveset`, `/meet`, `/cancel-meet`, the "Set time" buttons (all 2D-2); `/status`, `/where`, `/shout`, `/delete`, mirrors (2E); DMs (Phase 4).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). `src/render/` builds plain data: it may import `discord.js` for types, enums and `escapeMarkdown`, and never calls Discord.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` and the fake interactions.
- A party is never mutated; it changes only through `PartyStore.update`, whose callback is synchronous and decides inside.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`. Text written by members is shown through `plain()`.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path.

## Review Focus

1. A click or command that changes nothing, or that the party refuses, must leave no trace: no line in the post, no edit, no stored change except a new name or team. Tests: Task 4, "says nothing when the action changes nothing…", "answers a refusal with its reason and changes nothing", "says nothing in the post of a raid that has ended meanwhile"; Task 5, "+1 from somebody who is not signed up…", "Leave removes the member, and says so to one who was not signed up".
2. Controls used where or when they should not work: on a raid that has ended, by a member in a DM, with an action or a group that was never offered, Done on an egg, Remote on an elite raid whose old message still has the button. Tests: Task 5, "answers a control of a raid that has ended", "answers what it does not know as no longer active", "works only in a server", "Done is refused for an egg", "refuses remote on an elite raid…".
3. The completion question against a race and against being left behind: the last member asked answers, leaves or changes status while the question is on its way or after it. Tests: Task 4, "removes the question once everybody asked has answered", "removes the question also when the last one asked leaves…", "deletes a question that nobody is left to answer by the time it is sent", "keeps a question it could not delete in mind…", "deletes a question it could not record", "keeps at most ten questions…".
4. Text a member controls reaches a message: a group label in the menu, in an answer and in a line; a display name with white space, emoji or 40 characters in the stored state. Tests: Task 1, "tidies a name and cuts it to what is stored", "refuses a team or a name it does not know how to show"; Task 2, "offers a button per group once there are several…", "fits five groups with the longest labels into one row of buttons", "names a group with its label, made safe", "stays a message Discord takes however many are asked…".
5. A burst of clicks: one member leaning on +1, many members joining in the same seconds. The post must be edited and spoken to a few times, not once per click, a full lobby must still be listed, and no message may exceed 2,000 characters. Tests: Task 2, "shows a full lobby of twenty with the server's own team emoji…"; Task 3, "limits how often a member may use the controls of one kind…"; Task 4, `party-lines.test.ts` and "gathers the lines of a burst into one message, one line per member"; Task 5, "holds back a member who clicks more than thirty times a minute", "holds back a member who uses one command more than thirty times a minute".

---

## File Structure

```
src/domain/party/
  party.ts              modify: Team, TEAMS, teamOfRoles, Attendee.name/team, PartyPrompts, 'not-hatched'
  attendance.ts         modify: MemberInfo, noteMember; a sign-up keeps name and team
  party-state.ts        modify: version 2, reader for version 1
  raid.ts               modify: a new raid has no prompts
src/render/
  party-controls.ts     create: partyControls, completionQuestion, groupWords, PARTY_KIND, PARTY_ACTIONS
  activity.ts           create: standing, standingReply, standingLine, problemText
  raid-post.ts          modify: team emoji and order; the controls in the message
src/discord/
  command.ts, router.ts modify: ComponentHandler.throttle; why a control had no handler
  member-info.ts        create: memberInfo(interaction)
src/services/
  party-lines.ts        create: PartyLines (the lines the bot says in a post)
  attendance-service.ts create: AttendanceService (ctx.attendance)
  party-service.ts      modify: team emoji in the view; the reporter's name and team
src/components/
  party.ts              create: the controls of a post (kind `party`)
  index.ts              modify
src/commands/parties/
  reply.ts              create: actingMember, commandParty, answerOutcome, the answer texts, ACTION_THROTTLE
  attendance.ts         create: /join /maybe /here /not-here /done /leave /remote /local
  group.ts              create: /group join|new|label
src/commands/index.ts, src/commands/raids/raid.ts   modify
src/app-context.ts, src/app.ts                      modify: ctx.attendance; flushed at shutdown
test/support/
  party-service.ts      modify: attendance, userSettings, reportedRaid()
  fake-gateway.ts       modify: as strict as Discord about a message's length, pings and rows
  test-context.ts, fake-interactions.ts   modify
```

---

### Task 1: The state document, version 2: name, team and prompts

**Files:**
- Create: `src/domain/party/member-info.test.ts`
- Modify: `src/domain/party/attendance.ts`, `src/domain/party/party-state.test.ts`, `src/domain/party/party-state.ts`, `src/domain/party/party.ts`, `src/domain/party/raid.ts`

**Interfaces:**
- Consumes: Plan 2B's `Party`, `Attendee`, `PartyCore`, `partyState`, `partyFromStored`, `withAttendee` (private to `attendance.ts`), `createRaid`; test support `testRaid`, `withAttendees`.
- Produces: `TEAMS`, `Team`, `MAX_MEMBER_NAME` (32), `Attendee.name?: string`, `Attendee.team?: Team`, `PartyPrompts { completion: readonly string[]; warning: string | null }`, `NO_PROMPTS`, `MAX_COMPLETION_PROMPTS` (10), `PartyCore.prompts`, the problem `'not-hatched'` (all in `party.ts`); `MemberInfo { name?; team? }` and `noteMember(party, memberId, info)` in `attendance.ts`; `PARTY_STATE_VERSION = 2`; `PartyColumns` no longer has `prompts`.

`setAttendance` builds a fresh attendee record, so it must carry `name` and `team` over; the other functions spread the existing record and keep them by themselves (the last test file pins all of them). The schema checks between the parts of a document (default group, duplicates) are now one function used by both versions, and every failure is reported, as before. `noteMember` with an `info` that has no name changes nothing: such an interaction did not show the member.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/party/member-info.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALICE, BOB, testRaid, withAttendees } from '../../../test/support/parties.js';
import {
  attendanceLimits,
  changeNumber,
  completeRaid,
  joinGroup,
  noteMember,
  setAttendance,
  setNotHere,
  setRemote,
} from './attendance.js';
import { partyState } from './party-state.js';
import { attendeeOf, type Change, type RaidParty } from './party.js';
import { PartyStatus } from './status.js';

const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });

function done<Extra>(change: Change<RaidParty, Extra>): RaidParty {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  return change.party;
}

describe('noteMember', () => {
  it('records the name and the team of an attendee', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: {} });
    const noted = noteMember(raid, ALICE, { name: 'Alice', team: 'mystic' });
    expect(attendeeOf(noted, ALICE)).toMatchObject({ name: 'Alice', team: 'mystic' });
    expect(attendeeOf(raid, ALICE)).not.toHaveProperty('name');
  });

  it('does nothing for somebody who is not signed up', () => {
    const raid = testRaid();
    expect(noteMember(raid, BOB, { name: 'Bob', team: 'valor' })).toBe(raid);
  });

  it('returns the very same party when nothing differs', () => {
    const raid = noteMember(withAttendees(testRaid(), { [ALICE]: {} }), ALICE, {
      name: 'Alice',
      team: 'mystic',
    });
    expect(noteMember(raid, ALICE, { name: 'Alice', team: 'mystic' })).toBe(raid);
  });

  it('drops the team of a member who no longer has one, and keeps a name it is not told', () => {
    const raid = noteMember(withAttendees(testRaid(), { [ALICE]: {} }), ALICE, {
      name: 'Alice',
      team: 'mystic',
    });
    const later = noteMember(raid, ALICE, { name: 'Alice' });
    expect(attendeeOf(later, ALICE)).toMatchObject({ name: 'Alice' });
    expect(attendeeOf(later, ALICE)).not.toHaveProperty('team');
  });

  it('keeps what is recorded when the interaction did not show the member at all', () => {
    const raid = noteMember(withAttendees(testRaid(), { [ALICE]: {} }), ALICE, {
      name: 'Alice',
      team: 'mystic',
    });
    expect(noteMember(raid, ALICE, {})).toBe(raid);
  });

  it('tidies a name and cuts it to what is stored', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: {} });
    const spaced = noteMember(raid, ALICE, { name: '  Alice \n the   Great ' });
    expect(attendeeOf(spaced, ALICE)?.name).toBe('Alice the Great');
    const long = noteMember(raid, ALICE, { name: '😀'.repeat(40) });
    expect([...(attendeeOf(long, ALICE)?.name ?? '')]).toHaveLength(32);
    // The longest name that is kept can be stored: the cut and the schema count the same way.
    expect(() => partyState(long)).not.toThrow();
    expect(() => partyState(noteMember(raid, ALICE, { name: 'x'.repeat(40) }))).not.toThrow();
    const blank = noteMember(spaced, ALICE, { name: '   ', team: 'valor' });
    expect(attendeeOf(blank, ALICE)).toMatchObject({ name: 'Alice the Great', team: 'valor' });
  });
});

describe('what is known of a member stays through every change', () => {
  const known = noteMember(
    withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
      [ALICE]: { status: PartyStatus.Present },
    }),
    ALICE,
    { name: 'Alice', team: 'instinct' },
  );
  const changes: [string, (party: RaidParty) => RaidParty][] = [
    ['a new status', (p) => done(setAttendance(p, ALICE, PartyStatus.Coming, {}, limits))],
    ['remote', (p) => done(setRemote(p, ALICE, true, {}, limits))],
    ['one more', (p) => done(changeNumber(p, ALICE, 1, limits))],
    ['not here', (p) => done(setNotHere(p, ALICE))],
    ['done', (p) => done(completeRaid(p, ALICE, p.createdAt, 5))],
    [
      'another group',
      (p) =>
        done(joinGroup({ ...p, groups: [...p.groups, { id: 'B' as const }] }, ALICE, 'B', limits)),
    ],
  ];
  it.each(changes)('%s', (_name, change) => {
    const after = change(known);
    expect(after).not.toBe(known);
    expect(attendeeOf(after, ALICE)).toMatchObject({ name: 'Alice', team: 'instinct' });
  });
});
```

Apply to `src/domain/party/party-state.test.ts`:

```diff
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -22,7 +22,7 @@ function fullRaid(): RaidParty {
         number: 3,
         remote: true,
       },
-      [BOB]: { status: PartyStatus.Complete, group: 'B' },
+      [BOB]: { status: PartyStatus.Complete, group: 'B', name: 'Bob', team: 'valor' },
     },
   );
   return {
@@ -37,6 +37,7 @@ function fullRaid(): RaidParty {
       { id: 'B' },
     ],
     defaultGroupId: 'B',
+    prompts: { completion: ['300000000000000003'], warning: '300000000000000004' },
     mirrorMessages: [
       { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'remote' },
     ],
@@ -51,6 +52,7 @@ function columnsOf(party: RaidParty): PartyColumns {
     groups: _c,
     defaultGroupId: _d,
     raid: _e,
+    prompts: _f,
     ...columns
   } = party;
   return { ...columns, mirrorMessages: [] };
@@ -85,12 +87,13 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(1);
+    expect(state.v).toBe(2);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
       'defaultGroupId',
       'groups',
+      'prompts',
       'raid',
       'v',
     ]);
@@ -121,7 +124,11 @@ describe('party state', () => {
       return result.ok ? 'read' : result.problem;
     };
     expect(problem(state, { ...columns, type: 'train' })).toBe('a party of type "train"');
-    expect(problem({ ...state, v: 2 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 3 })).toMatch(/^state: /);
+    expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
+    expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
+      /^state: /,
+    );
     expect(problem('{}')).toMatch(/^state: /);
     expect(problem(null)).toMatch(/^state: /);
     expect(problem({ ...state, raid: undefined })).toBe('a raid without its raid details');
@@ -162,6 +169,39 @@ describe('party state', () => {
     expect(failed).toMatchObject({ ok: false, id: raid.id });
   });
 
+  it('reads a version 1 document as a party without names, teams and prompts', () => {
+    const raid = withAttendees(testRaid(), { [ALICE]: { number: 2 } });
+    const { prompts: _prompts, ...rest } = partyState(raid);
+    const old = stored({ ...rest, v: 1 });
+    expect(partyFromStored(columnsOf(raid), old, [])).toEqual({ ok: true, party: raid });
+    // What version 1 did not have is not read from a version 1 document.
+    const named = stored({
+      ...rest,
+      v: 1,
+      attendees: rest.attendees.map((attendee) => ({ ...attendee, team: 'valor' })),
+      prompts: { completion: ['300000000000000003'], warning: null },
+    });
+    expect(partyFromStored(columnsOf(raid), named, [])).toEqual({ ok: true, party: raid });
+    const broken = stored({ ...rest, v: 1, defaultGroupId: 'C' });
+    const failed = partyFromStored(columnsOf(raid), broken, []);
+    expect(failed.ok ? 'read' : failed.problem).toMatch(/default group/);
+  });
+
+  it('refuses a team or a name it does not know how to show', () => {
+    const raid = fullRaid();
+    const state = partyState(raid);
+    const withFirst = (change: object): unknown =>
+      stored({
+        ...state,
+        attendees: state.attendees.map((a, i) => (i === 0 ? { ...a, ...change } : a)),
+      });
+    const read = (document: unknown) => partyFromStored(columnsOf(raid), document, []).ok;
+    expect(read(withFirst({ team: 'harmony' }))).toBe(false);
+    expect(read(withFirst({ name: '' }))).toBe(false);
+    expect(read(withFirst({ name: 'x'.repeat(33) }))).toBe(false);
+    expect(read(withFirst({ name: 'x'.repeat(32), team: 'mystic' }))).toBe(true);
+  });
+
   it('refuses a document with two groups of the same id, or an attendee in a group that is not there', () => {
     const raid = fullRaid();
     const state = stored(partyState(raid)) as Record<string, unknown>;
```

Run: `npx vitest run --project unit src/domain/party/member-info.test.ts src/domain/party/party-state.test.ts`
Expected: FAIL (`noteMember` does not exist; the state tests fail on the version and on `prompts`).

- [ ] **Step 2: The implementation**

Apply to `src/domain/party/attendance.ts`:

```diff
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -2,6 +2,7 @@ import {
   attendeeOf,
   GROUP_IDS,
   groupOf,
+  MAX_MEMBER_NAME,
   membersWhere,
   refused,
   remoteAllowed,
@@ -11,6 +12,7 @@ import {
   type GroupId,
   type Party,
   type PartyGroup,
+  type Team,
 } from './party.js';
 import { PartyStatus } from './status.js';
 
@@ -74,6 +76,35 @@ function withGroup<P extends Party>(party: P, group: PartyGroup): P {
   return { ...party, groups: party.groups.map((g) => (g.id === group.id ? group : g)) };
 }
 
+/** What an interaction tells about the member who made it. */
+export interface MemberInfo {
+  /** The display name in the server; undefined when the interaction did not say. */
+  name?: string;
+  /** Undefined for a member without a team role. */
+  team?: Team;
+}
+
+/**
+ * Records a member's name and team with their attendee record, so that the post can sort and
+ * mark them; for somebody who is not signed up, nothing. The team is replaced by what `info`
+ * says (a member who dropped the role has none); a name is replaced only by a name. An `info`
+ * without a name says nothing at all (the interaction did not show the member), and then what is
+ * recorded stays. The very same party comes back when nothing differs.
+ */
+export function noteMember<P extends Party>(party: P, memberId: string, info: MemberInfo): P {
+  const existing = attendeeOf(party, memberId);
+  if (!existing || info.name === undefined) return party;
+  const { name: oldName, team: _oldTeam, ...rest } = existing;
+  const typed = info.name?.replace(/\s+/g, ' ').trim();
+  const name = typed ? [...typed].slice(0, MAX_MEMBER_NAME).join('') : oldName;
+  const noted: Attendee = {
+    ...rest,
+    ...(name === undefined ? {} : { name }),
+    ...(info.team === undefined ? {} : { team: info.team }),
+  };
+  return withAttendee(party, memberId, noted);
+}
+
 /**
  * An attendee moved to another group: one who was asked whether they completed the raid has
  * answered "not yet" and is present again.
@@ -121,6 +152,8 @@ export function setAttendance<P extends Party>(
     status,
     group: options.group ?? existing?.group ?? party.defaultGroupId,
     remote: options.remote ?? existing?.remote ?? false,
+    ...(existing?.name === undefined ? {} : { name: existing.name }),
+    ...(existing?.team === undefined ? {} : { team: existing.team }),
   };
   return { ok: true, party: withAttendee(party, memberId, attendee), joined: !existing };
 }
```

Apply to `src/domain/party/party-state.ts`:

```diff
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -2,6 +2,9 @@ import { z } from 'zod';
 import { RAID_LEVELS, raidTier } from '../pogo/raid-tier.js';
 import {
   GROUP_IDS,
+  MAX_COMPLETION_PROMPTS,
+  MAX_MEMBER_NAME,
+  TEAMS,
   type Attendee,
   type MirrorMessage,
   type Party,
@@ -16,14 +19,17 @@ import { PartyStatus } from './status.js';
  * version together with a reader for the old one that upgrades it. Any new field is a new
  * version too: fields the schema does not know are dropped when a document is read. After a
  * rollback the old code cannot read rows the new code wrote.
+ *
+ * Version 2 (plan 2D) added an attendee's `name` and `team` and the party's `prompts`; a
+ * version 1 document is read as one without them.
  */
-export const PARTY_STATE_VERSION = 1;
+export const PARTY_STATE_VERSION = 2;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
 const groupId = z.enum(GROUP_IDS);
 
-const attendee = z.object({
+const attendeeV1 = z.object({
   number: z.number().int().min(1),
   status: z.union([
     z.literal(PartyStatus.Interested),
@@ -37,6 +43,16 @@ const attendee = z.object({
   pendingUntil: time.optional(),
 });
 
+const attendee = attendeeV1.extend({
+  name: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+  team: z.enum(TEAMS).optional(),
+});
+
+const prompts = z.object({
+  completion: z.array(snowflake).max(MAX_COMPLETION_PROMPTS),
+  warning: snowflake.nullable(),
+});
+
 const group = z.object({
   id: groupId,
   label: z.string().optional(),
@@ -62,32 +78,71 @@ const raid = z.object({
   stageSeen: z.enum(['egg', 'hatched', 'ended']),
 });
 
+/** What does not hold between the parts of a document, whatever its version. */
+function inconsistencies(value: {
+  groups: { id: string }[];
+  defaultGroupId: string;
+  attendees: { id: string; group: string }[];
+}): string[] {
+  const problems: string[] = [];
+  if (!value.groups.some((g) => g.id === value.defaultGroupId))
+    problems.push('the default group is not one of the groups');
+  if (new Set(value.attendees.map((a) => a.id)).size !== value.attendees.length)
+    problems.push('a member is listed twice');
+  if (new Set(value.groups.map((g) => g.id)).size !== value.groups.length)
+    problems.push('a group is listed twice');
+  if (!value.attendees.every((a) => value.groups.some((g) => g.id === a.group)))
+    problems.push('an attendee is in a group that is not one of the groups');
+  return problems;
+}
+
+const shared = {
+  anonymous: z.boolean(),
+  groups: z.array(group).min(1).max(GROUP_IDS.length),
+  defaultGroupId: groupId,
+  raid: raid.optional(),
+};
+
 const state = z
   .object({
     v: z.literal(PARTY_STATE_VERSION),
-    anonymous: z.boolean(),
+    ...shared,
     /**
      * A list, in the order the members signed up, and not an object by member: MySQL sorts the
      * keys of a JSON object, which would put the attendees in the order of their snowflakes.
      */
     attendees: z.array(attendee.extend({ id: snowflake })),
-    groups: z.array(group).min(1).max(GROUP_IDS.length),
-    defaultGroupId: groupId,
-    raid: raid.optional(),
-  })
-  .refine((value) => value.groups.some((g) => g.id === value.defaultGroupId), {
-    error: 'the default group is not one of the groups',
+    prompts,
   })
-  .refine((value) => new Set(value.attendees.map((a) => a.id)).size === value.attendees.length, {
-    error: 'a member is listed twice',
-  })
-  .refine((value) => new Set(value.groups.map((g) => g.id)).size === value.groups.length, {
-    error: 'a group is listed twice',
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
+/** Version 1, as plans 2B and 2C wrote it: read only, and upgraded when read. */
+const stateV1 = z
+  .object({
+    v: z.literal(1),
+    ...shared,
+    attendees: z.array(attendeeV1.extend({ id: snowflake })),
   })
-  .refine((value) => value.attendees.every((a) => value.groups.some((g) => g.id === a.group)), {
-    error: 'an attendee is in a group that is not one of the groups',
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Reads a stored document of any version this code knows, as the current version. */
+function readState(stored: unknown) {
+  const version =
+    typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
+  if (version !== 1) return state.safeParse(stored);
+  const old = stateV1.safeParse(stored);
+  if (!old.success) return old;
+  return state.safeParse({
+    ...old.data,
+    v: PARTY_STATE_VERSION,
+    prompts: { completion: [], warning: null },
+  });
+}
+
 const mirrors = z.array(
   z.object({ channelId: snowflake, messageId: snowflake, kind: z.enum(['ex', 'remote']) }),
 );
@@ -98,7 +153,7 @@ export type PartyState = z.output<typeof state>;
 /** What the `Party` table keeps in columns of its own. */
 export type PartyColumns = Omit<
   PartyCore,
-  'anonymous' | 'attendees' | 'groups' | 'defaultGroupId'
+  'anonymous' | 'attendees' | 'groups' | 'defaultGroupId' | 'prompts'
 > & {
   type: string;
 };
@@ -116,6 +171,7 @@ export function partyState(party: Party): PartyState {
     groups: [...party.groups],
     defaultGroupId: party.defaultGroupId,
     raid: raidDetails,
+    prompts: { completion: [...party.prompts.completion], warning: party.prompts.warning },
   };
   const checked = state.safeParse(document);
   if (!checked.success) {
@@ -150,7 +206,7 @@ export function partyFromStored(
 ): StoredParty {
   const fail = (problem: string): StoredParty => ({ ok: false, id: columns.id, problem });
   if (columns.type !== 'raid') return fail(`a party of type "${columns.type}"`);
-  const parsed = state.safeParse(storedState);
+  const parsed = readState(storedState);
   if (!parsed.success) return fail(`state: ${z.prettifyError(parsed.error)}`);
   const mirrorMessages = mirrors.safeParse(storedMirrors);
   if (!mirrorMessages.success)
@@ -171,6 +227,7 @@ export function partyFromStored(
       groups,
       defaultGroupId,
       raid: raidDetails,
+      prompts: parsed.data.prompts,
     },
   };
 }
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -9,6 +9,13 @@ export function isGroupId(value: string): value is GroupId {
   return (GROUP_IDS as readonly string[]).includes(value);
 }
 
+/** The teams of the game, as a member's role in the server names them. */
+export const TEAMS = ['instinct', 'mystic', 'valor'] as const;
+export type Team = (typeof TEAMS)[number];
+
+/** A display name is kept no longer than this (Discord allows 32 characters). */
+export const MAX_MEMBER_NAME = 32;
+
 /** A status an attendee can have. Not interested means: no attendee record. */
 export type AttendeeStatus = Exclude<PartyStatus, typeof PartyStatus.NotInterested>;
 
@@ -24,8 +31,28 @@ export interface Attendee {
    * "have you completed this raid?" counts as yes.
    */
   pendingUntil?: number;
+  /**
+   * The member's display name and team as they were when the member last acted on the party
+   * (see `noteMember`). The bot has no member list to look them up in, so the post is sorted
+   * by what it saw then. Absent for a member it never saw act.
+   */
+  name?: string;
+  team?: Team;
 }
 
+/** Messages of the bot in the post that it removes again when they have served. */
+export interface PartyPrompts {
+  /** The "have you completed this raid?" questions that still have somebody to answer. */
+  completion: readonly string[];
+  /** The warning that the post will be archived; null while there is none. */
+  warning: string | null;
+}
+
+/** A party remembers at most this many completion questions; older ones are deleted. */
+export const MAX_COMPLETION_PROMPTS = 10;
+
+export const NO_PROMPTS: PartyPrompts = { completion: [], warning: null };
+
 export interface PartyGroup {
   id: GroupId;
   label?: string;
@@ -84,6 +111,7 @@ export interface PartyCore {
   groups: readonly PartyGroup[];
   /** The group a new attendee lands in: the newest one. */
   defaultGroupId: GroupId;
+  prompts: PartyPrompts;
 }
 
 /**
@@ -140,6 +168,8 @@ export type PartyProblem =
   /** The member was not asked whether they completed the raid. */
   | 'not-pending'
   | 'label-too-long'
+  /** The raid is still an egg: nobody can have completed it. */
+  | 'not-hatched'
   | 'no-boss'
   | 'bad-duration';
 
```

Apply to `src/domain/party/raid.ts`:

```diff
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -8,6 +8,7 @@ import {
   type RaidDurationRules,
 } from '../time/raid-durations.js';
 import {
+  NO_PROMPTS,
   refused,
   sameBoss,
   type Attendee,
@@ -151,6 +152,7 @@ export function createRaid(input: NewRaid, rules: RaidDurationRules): RaidParty
     attendees,
     groups: [{ id: 'A' }],
     defaultGroupId: 'A',
+    prompts: NO_PROMPTS,
     raid: {
       tier: input.tier,
       boss,
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/party/member-info.test.ts src/domain/party/party-state.test.ts`
Expected: PASS (the files of `src/domain/party` named above).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/domain/party/attendance.ts src/domain/party/member-info.test.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/raid.ts
npm run check
git add src/domain/party/attendance.ts src/domain/party/member-info.test.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/raid.ts
git commit -m "Party state v2: an attendee's name and team, the party's prompts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,517 unit tests.

---

### Task 2: What the post shows: controls, team emoji and order, activity texts

**Files:**
- Create: `src/render/activity.test.ts`, `src/render/activity.ts`, `src/render/party-controls.test.ts`, `src/render/party-controls.ts`
- Modify: `src/render/raid-post.test.ts`, `src/render/raid-post.ts`, `src/services/party-service.test.ts`, `src/services/party-service.ts`

**Interfaces:**
- Consumes: Task 1 (`Team`, `Attendee.team`, `Attendee.name`); `encodeCustomId`; `headCount`, `remoteAllowed`, `groupOf`; `plain`, `truncate`; `renderRaidPost`, `RaidPostView`; `PartyService.view`.
- Produces: `src/render/party-controls.ts`: `PARTY_KIND = 'party'`, `PARTY_ACTIONS`, `PartyAction`, `isPartyAction(value)`, `partyControls(party)` (rows of raw components: buttons only), `completionQuestion(partyId, members, timeoutMinutes)` → `{ content, components }`, `groupWords(group)`. `src/render/activity.ts`: `StandingOptions { sayInPerson? }`, `standing(party, attendee, options?)`, `standingReply(party, attendee, options?)`, `standingLine(party, memberId, attendee, options?)`, `problemText(reason, limits)`. `RaidPostView.emoji.teams: Record<Team, string>`; `renderRaidPost(...).message.components` are the controls.

The two inline snapshots of `raid-post.test.ts` now include the controls: write them exactly as the diff shows (they were generated by the code below; `npx vitest run -u` on that file regenerates them, and the result must equal the diff). The label of the fewer button is a minus sign (U+2212), not a hyphen: copy it from the plan. A team's emoji is written once per run of a team in a list, not per trainer.

- [ ] **Step 1: Write the failing tests**

Create `src/render/activity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALICE, testRaid, withAttendees } from '../../test/support/parties.js';
import type { Attendee, PartyProblem, RaidParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { problemText, standing, standingLine, standingReply } from './activity.js';

const base: Attendee = { number: 1, status: PartyStatus.Coming, group: 'A', remote: false };
const one = testRaid();
const two: RaidParty = { ...one, groups: [{ id: 'A' }, { id: 'B', label: 'park side' }] };

describe('standing', () => {
  it('says the status in a word', () => {
    const word = (status: Attendee['status']) => standing(one, { ...base, status });
    expect(word(PartyStatus.Interested)).toBe('interested');
    expect(word(PartyStatus.Coming)).toBe('coming');
    expect(word(PartyStatus.Present)).toBe('here');
    expect(word(PartyStatus.CompletePending)).toBe('here');
    expect(word(PartyStatus.Complete)).toBe('done');
  });

  it('adds whom the member brings, the group when there are several, and remote', () => {
    expect(standing(one, { ...base, number: 3 })).toBe('coming with 2 more');
    expect(standing(one, { ...base, remote: true })).toBe('coming, remotely');
    expect(standing(two, { ...base, number: 2, group: 'B', remote: true })).toBe(
      'coming with 1 more, in group B (park side), remotely',
    );
    expect(standing(two, base)).toBe('coming, in group A');
  });

  it('says no more than "done" of somebody who is done', () => {
    const done = {
      ...base,
      status: PartyStatus.Complete,
      number: 3,
      group: 'B' as const,
      remote: true,
    };
    expect(standing(two, done)).toBe('done');
    expect(standing(two, done, { sayInPerson: true })).toBe('done');
  });

  it('says "in person" only when asked to, and never of a remote member', () => {
    expect(standing(one, base, { sayInPerson: true })).toBe('coming, in person');
    expect(standing(one, { ...base, remote: true }, { sayInPerson: true })).toBe(
      'coming, remotely',
    );
    expect(standingReply(one, base, { sayInPerson: true })).toBe('You are coming, in person.');
    expect(standingLine(one, ALICE, base, { sayInPerson: true })).toBe(
      `<@${ALICE}> is coming, in person.`,
    );
  });

  it('makes the private answer and the public line of it', () => {
    const party = withAttendees(one, { [ALICE]: { number: 2 } });
    const alice = party.attendees[ALICE];
    if (!alice) throw new Error('no Alice');
    expect(standingReply(party, alice)).toBe('You are coming with 1 more.');
    expect(standingLine(party, ALICE, alice)).toBe(`<@${ALICE}> is coming with 1 more.`);
  });
});

describe('problemText', () => {
  it('has a sentence for every reason', () => {
    const reasons: PartyProblem[] = [
      'not-attending',
      'no-such-group',
      'bad-count',
      'in-person-only',
      'too-many-groups',
      'not-pending',
      'label-too-long',
      'not-hatched',
      'no-boss',
      'bad-duration',
    ];
    const texts = reasons.map((reason) => problemText(reason, { maxNumber: 21 }));
    for (const text of texts) expect(text).toMatch(/^[A-Z].*\.$/);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(problemText('bad-count', { maxNumber: 21 })).toContain('from 1 to 21');
  });
});
```

Create `src/render/party-controls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALICE, BOB, testRaid, withAttendees } from '../../test/support/parties.js';
import { decodeCustomId, MAX_CUSTOM_ID_LENGTH } from '../discord/custom-id.js';
import type { RaidParty } from '../domain/party/party.js';
import {
  completionQuestion,
  groupWords,
  isPartyAction,
  PARTY_ACTIONS,
  PARTY_KIND,
  partyControls,
} from './party-controls.js';

/** Label and decoded custom id of every button, row by row. */
function controls(party: RaidParty) {
  return partyControls(party).map((row) =>
    row.components.map((component) => {
      if (!('custom_id' in component)) throw new Error('a control without a custom id');
      const id = decodeCustomId(component.custom_id);
      return {
        label: 'label' in component ? component.label : undefined,
        action: id?.action,
        args: id?.args,
        disabled: 'disabled' in component ? component.disabled : undefined,
      };
    }),
  );
}

const fiveGroups = (label?: string): RaidParty => ({
  ...testRaid(),
  groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
    id,
    ...(label === undefined ? {} : { label }),
  })),
});

describe('partyControls', () => {
  it('has the five statuses, then the head count and the remote switch', () => {
    const rows = controls(testRaid());
    expect(rows).toHaveLength(2);
    expect(rows[0]?.map((c) => [c.label, c.action])).toEqual([
      ['Interested', 'maybe'],
      ['Join', 'join'],
      ['Here', 'here'],
      ['Done', 'done'],
      ['Leave', 'leave'],
    ]);
    expect(rows[1]?.map((c) => [c.label, c.action])).toEqual([
      ['−1', 'less'],
      ['+1', 'more'],
      ['Remote / in person', 'remote'],
    ]);
  });

  it('names the party in every custom id, within the length Discord allows', () => {
    const party = fiveGroups();
    for (const row of partyControls(party)) {
      for (const component of row.components) {
        if (!('custom_id' in component)) throw new Error('a control without a custom id');
        expect(component.custom_id.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
        const id = decodeCustomId(component.custom_id);
        expect(id).toMatchObject({ kind: PARTY_KIND, id: party.id });
        expect(isPartyAction(id?.action ?? '')).toBe(true);
      }
    }
  });

  it('is the same whatever the time: no control is switched off', () => {
    const egg = testRaid();
    const hatched = testRaid({ boss: { key: 'yveltal' } });
    for (const party of [egg, hatched]) {
      expect(
        controls(party)
          .flat()
          .some((control) => control.disabled),
      ).toBe(false);
    }
    expect(controls(egg)).toEqual(controls(hatched));
  });

  it('has no remote switch for an elite raid', () => {
    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
    expect(controls(elite)[1]?.map((c) => c.action)).toEqual(['less', 'more']);
  });

  it('offers a button per group once there are several, with how many are expected', () => {
    const party: RaidParty = {
      ...withAttendees(testRaid(), { [ALICE]: { group: 'B', number: 3 }, [BOB]: { group: 'B' } }),
      groups: [{ id: 'A' }, { id: 'B', label: '  park\n side ' }],
      defaultGroupId: 'B',
    };
    const rows = controls(party);
    expect(rows).toHaveLength(3);
    expect(rows[2]?.map((c) => [c.label, c.action, c.args])).toEqual([
      ['Group A (1)', 'group', ['A']],
      ['B: park side (4)', 'group', ['B']],
    ]);
  });

  it('fits five groups with the longest labels into one row of buttons', () => {
    const rows = partyControls(fiveGroups('x'.repeat(100)));
    expect(rows).toHaveLength(3);
    expect(rows[2]?.components).toHaveLength(5);
    for (const component of rows[2]?.components ?? []) {
      const label = 'label' in component ? (component.label ?? '') : '';
      expect(label.length).toBeLessThanOrEqual(80);
      // The label gives way, the head count stays.
      expect(label).toMatch(/… \(\d\)$/);
    }
  });

  it('knows its own actions and no others', () => {
    for (const action of PARTY_ACTIONS) expect(isPartyAction(action)).toBe(true);
    expect(isPartyAction('gym')).toBe(false);
  });
});

describe('completionQuestion', () => {
  it('names the members and offers the two answers', () => {
    const party = testRaid();
    const question = completionQuestion(party.id, [ALICE, BOB], 5);
    expect(question.content).toBe(
      `<@${ALICE}>, <@${BOB}>: have you completed this raid? ` +
        'Without an answer within 5 minutes I will take it that you have.',
    );
    const buttons = question.components[0]?.components ?? [];
    expect(
      buttons.map((b) => ('custom_id' in b ? decodeCustomId(b.custom_id) : undefined)),
    ).toEqual([
      { kind: PARTY_KIND, id: party.id, action: 'answer', args: ['yes'] },
      { kind: PARTY_KIND, id: party.id, action: 'answer', args: ['no'] },
    ]);
  });

  it('says one minute as one minute', () => {
    expect(completionQuestion(testRaid().id, [ALICE], 1).content).toContain('within 1 minute I');
  });

  it('stays a message Discord takes however many are asked, and says how many it left out', () => {
    const members = Array.from(
      { length: 150 },
      (_, n) => `3000000000000000${String(n).padStart(3, '0')}`,
    );
    const { content } = completionQuestion(testRaid().id, members, 5);
    expect(content.length).toBeLessThanOrEqual(2000);
    const named = content.match(/<@\d+>/g)?.length ?? 0;
    expect(named).toBeGreaterThan(50);
    expect(content).toContain(`…and ${150 - named} more: have you completed`);
  });
});

describe('groupWords', () => {
  it('names a group with its label, made safe', () => {
    expect(groupWords({ id: 'B' })).toBe('group B');
    expect(groupWords({ id: 'B', label: '**park**' })).toBe('group B (\\*\\*park\\*\\*)');
  });
});
```

Apply to `src/render/raid-post.test.ts`:

```diff
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -1,5 +1,6 @@
 import type { APIEmbed } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { partyControls } from './party-controls.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
 import {
@@ -32,7 +33,8 @@ const bosses = raidBossesFixture().bosses();
 const rules = testRaidRules();
 const [library, fountain] = testGyms();
 const T5 = { level: 'T5', shadow: false } as const;
-const emoji = { shiny: '✨', remote: '🛰️' };
+const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
+const emoji = { shiny: '✨', remote: '🛰️', teams };
 
 function view(party: RaidParty, extra: Partial<RaidPostView> = {}): RaidPostView {
   return {
@@ -182,7 +184,66 @@ describe('renderRaidPost', () => {
           "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
         },
         "message": {
-          "components": [],
+          "components": [
+            {
+              "components": [
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:maybe",
+                  "label": "Interested",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:join",
+                  "label": "Join",
+                  "style": 1,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:here",
+                  "label": "Here",
+                  "style": 3,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:done",
+                  "label": "Done",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:leave",
+                  "label": "Leave",
+                  "style": 4,
+                  "type": 2,
+                },
+              ],
+              "type": 1,
+            },
+            {
+              "components": [
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:less",
+                  "label": "−1",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:more",
+                  "label": "+1",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:remote",
+                  "label": "Remote / in person",
+                  "style": 2,
+                  "type": 2,
+                },
+              ],
+              "type": 1,
+            },
+          ],
           "embeds": [
             {
               "color": 15844367,
@@ -259,7 +320,83 @@ describe('renderRaidPost', () => {
           "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
         },
         "message": {
-          "components": [],
+          "components": [
+            {
+              "components": [
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:maybe",
+                  "label": "Interested",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:join",
+                  "label": "Join",
+                  "style": 1,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:here",
+                  "label": "Here",
+                  "style": 3,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:done",
+                  "label": "Done",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:leave",
+                  "label": "Leave",
+                  "style": 4,
+                  "type": 2,
+                },
+              ],
+              "type": 1,
+            },
+            {
+              "components": [
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:less",
+                  "label": "−1",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:more",
+                  "label": "+1",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:remote",
+                  "label": "Remote / in person",
+                  "style": 2,
+                  "type": 2,
+                },
+              ],
+              "type": 1,
+            },
+            {
+              "components": [
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:group:A",
+                  "label": "A: park *side* (5)",
+                  "style": 2,
+                  "type": 2,
+                },
+                {
+                  "custom_id": "party:00000000-0000-4000-8000-000000000001:group:B",
+                  "label": "Group B (1)",
+                  "style": 2,
+                  "type": 2,
+                },
+              ],
+              "type": 1,
+            },
+          ],
           "embeds": [
             {
               "color": 3066993,
@@ -356,9 +493,80 @@ describe('renderRaidPost', () => {
     for (const field of post.embed.fields ?? []) expect(field.value).not.toBe('');
   });
 
-  it('holds the whole message in one place, with room for controls', () => {
+  it('holds the whole message in one place: the embed and the controls', () => {
     const post = renderRaidPost(view(egg));
-    expect(post.message).toEqual({ embeds: [post.embed], components: [] });
+    expect(post.message).toEqual({
+      embeds: [post.embed],
+      components: partyControls(egg),
+    });
+  });
+
+  it('marks a trainer with their team and lists by team, then by name', () => {
+    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), {
+      '300000000000000001': { name: 'zed', team: 'valor' },
+      '300000000000000002': { name: 'Yan', team: 'instinct' },
+      '300000000000000003': { name: 'bea' },
+      '300000000000000004': {},
+      '300000000000000005': { name: 'Abe', team: 'instinct', number: 2, remote: true },
+      '300000000000000006': { name: 'Al' },
+    });
+    const post = renderRaidPost(view(party));
+    const value = post.embed.fields?.find((f) => f.name.startsWith('Trainers'))?.value;
+    expect(value).toBe(
+      '**Coming** <@300000000000000006>, <@300000000000000003>, <@300000000000000004>, ' +
+        '⚡ <@300000000000000005> +1 🛰️, <@300000000000000002>, 🔥 <@300000000000000001>',
+    );
+  });
+
+  it('orders names as a reader would: accents and capitals do not send a name to the end', () => {
+    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), {
+      '300000000000000001': { name: 'zed' },
+      '300000000000000002': { name: 'Émile' },
+      '300000000000000003': { name: 'adam' },
+      '300000000000000004': { name: 'Émile' },
+    });
+    const value = renderRaidPost(view(party)).embed.fields?.find((f) =>
+      f.name.startsWith('Trainers'),
+    )?.value;
+    expect(value).toBe(
+      '**Coming** <@300000000000000003>, <@300000000000000002>, <@300000000000000004>, ' +
+        '<@300000000000000001>',
+    );
+  });
+
+  it("shows a full lobby of twenty with the server's own team emoji, every team among them", () => {
+    const custom = {
+      instinct: '<:instinct:1234567890123456789>',
+      mystic: '<:mystic:1234567890123456789>',
+      valor: '<:valor:1234567890123456789>',
+    };
+    const remote = '<:pineremote:1234567890123456789>';
+    const names = ['instinct', 'mystic', 'valor'] as const;
+    const many: Record<string, object> = {};
+    for (let n = 0; n < 20; n++) {
+      many[`3000000000000000${String(n).padStart(2, '0')}`] = {
+        name: `trainer ${n}`,
+        team: names[n % 3],
+        remote: n % 4 === 0,
+      };
+    }
+    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), many);
+    const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams: custom } }));
+    const value = post.embed.fields?.find((f) => f.name.startsWith('Trainers'))?.value ?? '';
+    expect(value.match(/<@3/g)).toHaveLength(20);
+    expect(value).not.toMatch(/…and \d+ more/);
+    expect(value.length).toBeLessThanOrEqual(1024);
+    // Each team's emoji stands once, before the first of its members.
+    for (const team of names) expect(value.split(custom[team])).toHaveLength(2);
+  });
+
+  it('lists those who are done by team and name as well', () => {
+    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), {
+      '300000000000000001': { name: 'zed', team: 'mystic', status: PartyStatus.Complete },
+      '300000000000000002': { name: 'amy', team: 'mystic', status: PartyStatus.Complete },
+    });
+    const done = renderRaidPost(view(party)).embed.fields?.find((f) => f.name.startsWith('Done'));
+    expect(done?.value).toBe('❄️ <@300000000000000002>, <@300000000000000001>');
   });
 
   it('warns a group of more than twenty and cuts a list that is too long for its field', () => {
@@ -384,7 +592,7 @@ describe('renderRaidPost', () => {
   it('shows as many trainers as fit, and counts the rest, when long emoji fill the field', () => {
     const remote = '<:pineremote:1234567890123456789>';
     const party = withAttendees(egg, trainers(30, { remote: true }));
-    const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote } }));
+    const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams } }));
     const value = post.embed.fields?.find((f) => f.name.startsWith('Trainers'))?.value ?? '';
     const shown = value.match(/<@3/g)?.length ?? 0;
     const left = Number(/…and (\d+) more/.exec(value)?.[1]);
```

Apply to `src/services/party-service.test.ts`:

```diff
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -1,4 +1,5 @@
 import { RateLimitError } from 'discord.js';
+import { partyControls } from '../render/party-controls.js';
 import { describe, expect, it, vi } from 'vitest';
 import type { FakePartyGateway } from '../../test/support/fake-gateway.js';
 import {
@@ -11,10 +12,15 @@ import {
 } from '../../test/support/gyms.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
-import { FORUM_TAGS } from '../render/raid-post.js';
+import { FORUM_TAGS, renderRaidPost } from '../render/raid-post.js';
 import { ALICE, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
-import { attendanceLimits, leaveParty, setAttendance } from '../domain/party/attendance.js';
+import {
+  attendanceLimits,
+  createGroup,
+  leaveParty,
+  setAttendance,
+} from '../domain/party/attendance.js';
 import { setBoss } from '../domain/party/raid.js';
 import { endParty } from '../domain/party/tick.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -1032,10 +1038,20 @@ describe('PartyService: rate limits and unchanged posts', () => {
 
   it('sends the one message the renderer made, with its components', async () => {
     const made = await raid();
-    expect(made.gateway.posts.get(made.postId)?.message.components).toEqual([]);
-    made.clock.now = at('2026-10-13T14:31');
-    await nameBoss(made, 'yveltal');
-    expect(made.gateway.posts.get(made.postId)?.message.components).toEqual([]);
+    const components = () => made.gateway.posts.get(made.postId)?.message.components;
+    const rendered = () => {
+      const party = made.store.get(made.party.id);
+      if (!party) throw new Error('the raid is gone');
+      return renderRaidPost(made.service.view(party)).message.components;
+    };
+    expect(components()).toEqual(partyControls(made.party));
+    expect(components()).toHaveLength(2);
+    // A second group changes the controls, and the edit carries them.
+    await made.store.update(made.party.id, (p) => createGroup(p, ALICE, limits));
+    made.service.changed(made.party.id);
+    await made.service.flush();
+    expect(components()).toEqual(rendered());
+    expect(components()).toHaveLength(3);
   });
 
   it('sends nothing for a render right after creation, and nothing for an unchanged party', async () => {
```

Run: `npx vitest run --project unit src/render/activity.test.ts src/render/party-controls.test.ts src/render/raid-post.test.ts src/services/party-service.test.ts`
Expected: FAIL (`./party-controls.js` and `./activity.js` cannot be found).

- [ ] **Step 2: The implementation**

Create `src/render/activity.ts`:

```ts
import { groupOf, type Attendee, type Party, type PartyProblem } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { groupWords } from './party-controls.js';

const STATUS_WORDS: Readonly<Record<Attendee['status'], string>> = {
  [PartyStatus.Interested]: 'interested',
  [PartyStatus.Coming]: 'coming',
  [PartyStatus.Present]: 'here',
  [PartyStatus.CompletePending]: 'here',
  [PartyStatus.Complete]: 'done',
};

export interface StandingOptions {
  /** Say "in person" for a member who is not remote: for the answer to switching it off. */
  sayInPerson?: boolean;
}

/**
 * How an attendee stands, as the end of a sentence: `coming with 2 more, in group B, remotely`.
 * The group is named only when the party has more than one. Somebody who is done is just that:
 * whom they brought and how they took part no longer matters.
 */
export function standing(party: Party, attendee: Attendee, options: StandingOptions = {}): string {
  if (attendee.status === PartyStatus.Complete) return STATUS_WORDS[attendee.status];
  const parts = [STATUS_WORDS[attendee.status]];
  if (attendee.number > 1) parts[0] += ` with ${attendee.number - 1} more`;
  if (party.groups.length > 1) {
    parts.push(`in ${groupWords(groupOf(party, attendee.group) ?? { id: attendee.group })}`);
  }
  if (attendee.remote) parts.push('remotely');
  else if (options.sayInPerson) parts.push('in person');
  return parts.join(', ');
}

/** What the member is told, privately, after a change: `You are coming with 2 more.` */
export function standingReply(
  party: Party,
  attendee: Attendee,
  options: StandingOptions = {},
): string {
  return `You are ${standing(party, attendee, options)}.`;
}

/** The line in the post for everybody: `<@id> is coming with 2 more.` It pings nobody. */
export function standingLine(
  party: Party,
  memberId: string,
  attendee: Attendee,
  options: StandingOptions = {},
): string {
  return `<@${memberId}> is ${standing(party, attendee, options)}.`;
}

/** Why a change was refused, as a sentence for the member. */
export function problemText(reason: PartyProblem, limits: { maxNumber: number }): string {
  switch (reason) {
    case 'not-attending':
      return 'You are not signed up for this raid.';
    case 'no-such-group':
      return 'This raid has no such group.';
    case 'bad-count':
      return `Give the number of trainers including yourself, from 1 to ${limits.maxNumber}.`;
    case 'in-person-only':
      return 'Elite raids can only be done in person.';
    case 'too-many-groups':
      return 'A raid cannot have more than five groups.';
    case 'not-pending':
      return 'You were not asked, or you have answered already.';
    case 'label-too-long':
      return 'That label is too long: keep it to 100 characters.';
    case 'not-hatched':
      return 'This raid has not hatched yet.';
    case 'no-boss':
      return 'This raid has no boss yet.';
    case 'bad-duration':
      return 'That is not a duration a raid can have.';
  }
}
```

Create `src/render/party-controls.ts`:

```ts
import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIComponentInMessageActionRow,
} from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import {
  headCount,
  remoteAllowed,
  type PartyGroup,
  type RaidParty,
} from '../domain/party/party.js';
import { fitItems, plain, truncate } from './text.js';

/** The custom-id kind of the controls of a party's post (and of its copies in other channels). */
export const PARTY_KIND = 'party';

/**
 * What a control of a post does: the action part of its custom id. `group` carries the group's
 * letter as its argument, `answer` carries `yes` or `no` (the completion question).
 */
export const PARTY_ACTIONS = [
  'maybe',
  'join',
  'here',
  'done',
  'leave',
  'less',
  'more',
  'remote',
  'group',
  'answer',
] as const;
export type PartyAction = (typeof PARTY_ACTIONS)[number];

export function isPartyAction(value: string): value is PartyAction {
  return (PARTY_ACTIONS as readonly string[]).includes(value);
}

/** Discord allows this many characters on a button. */
const BUTTON_LABEL = 80;
/** The names of a completion question are cut so that the whole message stays well under 2,000. */
const QUESTION_NAMES = 1_700;

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;

function button(
  partyId: string,
  action: PartyAction,
  label: string,
  style: APIButtonComponentWithCustomId['style'],
  args?: string[],
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    custom_id: encodeCustomId({ kind: PARTY_KIND, id: partyId, action, ...(args ? { args } : {}) }),
    label,
    style,
  };
}

/** `Group B (4)`, or `B: park side (4)` for a group with a label; the count is never cut off. */
function groupLabel(party: RaidParty, group: PartyGroup): string {
  const heads = ` (${headCount(party, group.id)})`;
  const label = group.label?.replace(/\s+/g, ' ').trim();
  const name = label ? `${group.id}: ${label}` : `Group ${group.id}`;
  return `${truncate(name, BUTTON_LABEL - heads.length)}${heads}`;
}

/**
 * The controls under a party's message (spec 4.1): the five statuses; the head count and the
 * remote switch (an elite raid has none); and, when there is more than one group, a button per
 * group to move there. Buttons and not a menu for the groups: a menu keeps showing each member
 * their last choice, also one that was refused. Nothing depends on the time, so the controls
 * never need an edit of their own: Done on an egg is refused when it is pressed.
 */
export function partyControls(party: RaidParty): Row[] {
  const { id } = party;
  const rows: Row[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        button(id, 'maybe', 'Interested', ButtonStyle.Secondary),
        button(id, 'join', 'Join', ButtonStyle.Primary),
        button(id, 'here', 'Here', ButtonStyle.Success),
        button(id, 'done', 'Done', ButtonStyle.Secondary),
        button(id, 'leave', 'Leave', ButtonStyle.Danger),
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        button(id, 'less', '−1', ButtonStyle.Secondary),
        button(id, 'more', '+1', ButtonStyle.Secondary),
        ...(remoteAllowed(party)
          ? [button(id, 'remote', 'Remote / in person', ButtonStyle.Secondary)]
          : []),
      ],
    },
  ];
  if (party.groups.length > 1) {
    rows.push({
      type: ComponentType.ActionRow,
      components: party.groups.map((group) =>
        button(id, 'group', groupLabel(party, group), ButtonStyle.Secondary, [group.id]),
      ),
    });
  }
  return rows;
}

/**
 * The question to members who were present when somebody of their group completed the raid, with
 * its two answers. The members are named as mentions, as many as fit; whom it may ping is the
 * caller's choice. Either button answers for whoever was asked, named or not.
 */
export function completionQuestion(
  partyId: string,
  members: readonly string[],
  timeoutMinutes: number,
): { content: string; components: Row[] } {
  const minutes = timeoutMinutes === 1 ? '1 minute' : `${timeoutMinutes} minutes`;
  const names = fitItems(
    members.map((id) => `<@${id}>`),
    QUESTION_NAMES,
  );
  return {
    content:
      `${names}: have you completed this raid? ` +
      `Without an answer within ${minutes} I will take it that you have.`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          button(partyId, 'answer', 'Yes, done', ButtonStyle.Success, ['yes']),
          button(partyId, 'answer', 'Not yet', ButtonStyle.Secondary, ['no']),
        ],
      },
    ],
  };
}

/** A group's label as text for a sentence: `group B` or `group B (park side)`. */
export function groupWords(group: { id: string; label?: string }): string {
  return group.label ? `group ${group.id} (${plain(group.label)})` : `group ${group.id}`;
}
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -7,6 +7,7 @@ import {
   type PartyGroup,
   type RaidParty,
   type RaidStage,
+  type Team,
 } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -14,6 +15,7 @@ import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import type { PokemonEntry } from '../domain/pogo/game-master.js';
 import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
 import { raidTierLabel, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
+import { partyControls } from './party-controls.js';
 import { count, fitItems, LIMITS, plain, timestamp, titleCase, truncate } from './text.js';
 
 /** The names of the forum tags a post can carry (spec 5.1). At most five are applied. */
@@ -77,7 +79,7 @@ export interface RaidPostView {
   /** Show the moves line also while no move is known (`settings.showUnknownMoves`). */
   showUnknownMoves: boolean;
   /** Emoji as message text (`<:pineshiny:123>`), or plain characters when the server has none. */
-  emoji: { shiny: string; remote: string };
+  emoji: { shiny: string; remote: string; teams: Readonly<Record<Team, string>> };
 }
 
 /** What a forum post of a party shows. */
@@ -225,9 +227,57 @@ function bossField(view: RaidPostView, boss: ShownBoss, title: string): APIEmbed
   return { name: title, value: truncate(lines.join('\n'), LIMITS.fieldValue) };
 }
 
-function attendeeText(memberId: string, attendee: Attendee, remote: string): string {
+function attendeeText(memberId: string, attendee: Attendee, emoji: RaidPostView['emoji']): string {
   const extra = attendee.number > 1 ? ` +${attendee.number - 1}` : '';
-  return `<@${memberId}>${extra}${attendee.remote ? ` ${remote}` : ''}`;
+  return `<@${memberId}>${extra}${attendee.remote ? ` ${emoji.remote}` : ''}`;
+}
+
+/**
+ * The texts of a list of members that is in shown order: each member, and the emoji of a team
+ * once, before the first of its members (a server's own emoji is some thirty characters, which
+ * for every trainer would halve what fits into a field).
+ */
+function attendeeTexts(
+  party: RaidParty,
+  memberIds: readonly string[],
+  emoji: RaidPostView['emoji'],
+): string[] {
+  let before: Team | undefined;
+  return memberIds.map((id) => {
+    const attendee = party.attendees[id];
+    if (!attendee) return `<@${id}>`;
+    const text = attendeeText(id, attendee, emoji);
+    const first = attendee.team !== undefined && attendee.team !== before;
+    before = attendee.team;
+    return first && attendee.team ? `${emoji.teams[attendee.team]} ${text}` : text;
+  });
+}
+
+const byName = new Intl.Collator('en', { sensitivity: 'base' });
+
+/** Members without a team first, then the teams in this order (as the legacy bot listed them). */
+const TEAM_ORDER: readonly (Team | undefined)[] = [undefined, 'instinct', 'mystic', 'valor'];
+
+/**
+ * The members of a list in the order they are shown: by team, then by the name the bot last saw
+ * (members it has no name for come last), and for the rest the order they signed up in.
+ */
+function inShownOrder(party: RaidParty, memberIds: readonly string[]): string[] {
+  const rank = (id: string): number => TEAM_ORDER.indexOf(party.attendees[id]?.team);
+  const name = (id: string): string | undefined => party.attendees[id]?.name;
+  return memberIds
+    .map((id, index) => ({ id, index }))
+    .sort((a, b) => {
+      const byTeam = rank(a.id) - rank(b.id);
+      if (byTeam !== 0) return byTeam;
+      const [left, right] = [name(a.id), name(b.id)];
+      if (left === undefined || right === undefined) {
+        if (left !== right) return left === undefined ? 1 : -1;
+        return a.index - b.index;
+      }
+      return byName.compare(left, right) || a.index - b.index;
+    })
+    .map(({ id }) => id);
 }
 
 /**
@@ -264,12 +314,12 @@ function groupField(
   ];
   const sections: { title: string; texts: string[]; shown: number }[] = [];
   for (const [title, belongs] of kinds) {
-    const members = membersWhere(party, (a) => a.group === group.id && belongs(a));
+    const members = inShownOrder(
+      party,
+      membersWhere(party, (a) => a.group === group.id && belongs(a)),
+    );
     if (members.length === 0) continue;
-    const texts = members.map((id) => {
-      const attendee = party.attendees[id];
-      return attendee ? attendeeText(id, attendee, emoji.remote) : `<@${id}>`;
-    });
+    const texts = attendeeTexts(party, members, emoji);
     sections.push({ title, texts, shown: texts.length });
   }
   const sectionLine = (section: (typeof sections)[number]): string => {
@@ -307,14 +357,13 @@ function doneField(
   limit: number = LIMITS.fieldValue,
 ): APIEmbedField | undefined {
   const { party, emoji } = view;
-  const members = membersWhere(party, (a) => a.status === PartyStatus.Complete);
+  const members = inShownOrder(
+    party,
+    membersWhere(party, (a) => a.status === PartyStatus.Complete),
+  );
   if (members.length === 0) return undefined;
-  let heads = 0;
-  const texts = members.map((id) => {
-    const attendee = party.attendees[id];
-    heads += attendee?.number ?? 1;
-    return attendee ? attendeeText(id, attendee, emoji.remote) : `<@${id}>`;
-  });
+  const heads = members.reduce((sum, id) => sum + (party.attendees[id]?.number ?? 1), 0);
+  const texts = attendeeTexts(party, members, emoji);
   return { name: `Done (${heads})`, value: fitItems(texts, limit) };
 }
 
@@ -358,7 +407,10 @@ function fitEmbed(title: string, description: string, fields: ShrinkableField[])
   }
 }
 
-/** The forum post of a raid: title, tags and the embed. Pure: the same view gives the same post. */
+/**
+ * The forum post of a raid: title, tags, the embed and the controls under it. Pure: the same view
+ * gives the same post.
+ */
 export function renderRaidPost(view: RaidPostView): RenderedPost {
   const { party, gym, boss, now, emoji } = view;
   const stage = raidStage(party, now);
@@ -431,7 +483,7 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
     title: raidTitle(view),
     tags: raidTags(party, now),
     embed,
-    message: { embeds: [embed], components: [] },
+    message: { embeds: [embed], components: partyControls(party) },
   };
 }
 
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -198,6 +198,12 @@ export class PartyService {
       emoji: {
         shiny: emoji(settings.emoji.shiny, '✨'),
         remote: emoji(settings.emoji.remote, '🛰️'),
+        // The server's own emoji of that name, as the legacy bot used them.
+        teams: {
+          instinct: emoji('instinct', '⚡'),
+          mystic: emoji('mystic', '❄️'),
+          valor: emoji('valor', '🔥'),
+        },
       },
     };
   }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/render/activity.test.ts src/render/party-controls.test.ts src/render/raid-post.test.ts src/services/party-service.test.ts`
Expected: PASS (the files of `src/render` and `src/services/party-service.test.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/render/activity.test.ts src/render/activity.ts src/render/party-controls.test.ts src/render/party-controls.ts src/render/raid-post.test.ts src/render/raid-post.ts src/services/party-service.test.ts src/services/party-service.ts
npm run check
git add src/render/activity.test.ts src/render/activity.ts src/render/party-controls.test.ts src/render/party-controls.ts src/render/raid-post.test.ts src/render/raid-post.ts src/services/party-service.test.ts src/services/party-service.ts
git commit -m "Party posts: buttons and group menu, team emoji and order, what an action says" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,538 unit tests.

---

### Task 3: A throttle for controls, and who acts

**Files:**
- Create: `src/discord/member-info.test.ts`, `src/discord/member-info.ts`
- Modify: `src/discord/command.ts`, `src/discord/router.test.ts`, `src/discord/router.ts`, `src/domain/party/party.ts`, `test/support/fake-interactions.ts`

**Interfaces:**
- Consumes: `Throttles`, `waitText`, `InteractionRouter`, `ComponentHandler`; Task 1 (`TEAMS`, `MemberInfo`); the fakes.
- Produces: `ComponentHandler.throttle?: Throttle` (per member, over all controls of the handler's kind; counted after the guards, under a key no command path can have; the refusal reads `That was a lot of clicks. Try again in <wait>.`); the log line `no handler for component` has `reason: 'undecodable' | 'unknown-kind' | 'no-such-control'`; `teamOfRoles(roleNames)` in `party.ts`; `memberInfo(interaction)` in `src/discord/member-info.ts`; `FakeOptions.displayName` (the fake member's `displayName`, default `Member`).

- [ ] **Step 1: Test support**

Apply to `test/support/fake-interactions.ts`:

```diff
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -37,6 +37,8 @@ export interface FakeOptions {
   isDm?: boolean;
   userId?: string;
   roleNames?: string[];
+  /** The member's name in the server: `interaction.member.displayName`. */
+  displayName?: string;
   /** Option values by name, for getString, getInteger, getNumber and getBoolean. */
   options?: Record<string, OptionValue>;
   /** Resolved options by name, for getUser, getMember, getRole, getChannel and getAttachment. */
@@ -144,6 +146,7 @@ function base(kind: Kind, o: FakeOptions) {
     member: o.isDm
       ? null
       : {
+          displayName: o.displayName ?? 'Member',
           roles: {
             cache: new Collection(
               (o.roleNames ?? []).map((name, i) => [String(i), { id: String(i), name }]),
```

- [ ] **Step 2: Write the failing tests**

Create `src/discord/member-info.test.ts`:

```ts
import type { ButtonInteraction } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeButton } from '../../test/support/fake-interactions.js';
import { teamOfRoles } from '../domain/party/party.js';
import { memberInfo } from './member-info.js';

const asButton = (fake: unknown) => fake as ButtonInteraction;

describe('teamOfRoles', () => {
  it('finds the team among the role names, however they are written', () => {
    expect(teamOfRoles(['Trainer', 'Mystic'])).toBe('mystic');
    expect(teamOfRoles([' VALOR '])).toBe('valor');
    expect(teamOfRoles(['instinct'])).toBe('instinct');
  });

  it('has no team for a member without such a role, or with a longer name', () => {
    expect(teamOfRoles([])).toBeUndefined();
    expect(teamOfRoles(['Team Mystic', 'moderator'])).toBeUndefined();
  });

  it('takes the first team in the fixed order when a member has several', () => {
    expect(teamOfRoles(['valor', 'instinct'])).toBe('instinct');
  });
});

describe('memberInfo', () => {
  it('reads the display name and the team from the interaction', () => {
    const click = fakeButton({ displayName: 'Alice', roleNames: ['Valor', 'Trainer'] });
    expect(memberInfo(asButton(click))).toEqual({ name: 'Alice', team: 'valor' });
  });

  it('has no team key for a member without a team', () => {
    const info = memberInfo(asButton(fakeButton({ displayName: 'Bob' })));
    expect(info).toEqual({ name: 'Bob' });
    expect(info).not.toHaveProperty('team');
  });

  it('says nothing outside a server', () => {
    expect(memberInfo(asButton(fakeButton({ isDm: true })))).toEqual({});
  });
});
```

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -11,6 +11,7 @@ import {
   fakeChatInput,
   fakeModal,
   fakeSelect,
+  sent,
 } from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { commandGroup, type SubcommandPart } from './command-group.js';
@@ -592,9 +593,112 @@ describe('InteractionRouter', () => {
     expect(entries.find((e) => e.msg === 'no handler for component')).toMatchObject({
       level: 40,
       interaction: { customId: 'p:abc:time' },
+      reason: 'no-such-control',
     });
   });
 
+  it('answers a select menu its handler does not have as no longer active', async () => {
+    const { ctx } = createTestContext();
+    const button = ran();
+    const router = new InteractionRouter(ctx, [], [{ kind: 'p', button }]);
+    const menu = fakeSelect({ customId: 'p:abc:group', values: ['B'] });
+    await router.handle(asInteraction(menu));
+    expect(sent(menu.reply).content).toBe(STALE_COMPONENT);
+    expect(button).not.toHaveBeenCalled();
+  });
+
+  it('says in the log why a control had no handler', async () => {
+    const { ctx, entries } = createTestContext();
+    const router = new InteractionRouter(ctx, [], [{ kind: 'p', button: ran() }]);
+    await router.handle(asInteraction(fakeButton({ customId: 'pinejoin' })));
+    await router.handle(asInteraction(fakeButton({ customId: 'q:abc:join' })));
+    const reasons = entries
+      .filter((e) => e.msg === 'no handler for component')
+      .map((e) => e.reason);
+    expect(reasons).toEqual(['undecodable', 'unknown-kind']);
+  });
+
+  it('limits how often a member may use the controls of one kind, all of them together', async () => {
+    const { ctx } = createTestContext();
+    let now = 1_800_000_000_000;
+    const button = ran();
+    const select = ran();
+    const other = ran();
+    const router = new InteractionRouter(
+      ctx,
+      [],
+      [
+        { kind: 'p', throttle: { uses: 2, perSeconds: 60 }, button, select },
+        { kind: 'q', button: other },
+      ],
+      { now: () => now },
+    );
+    const click = async (customId: string, userId?: string) => {
+      const i = fakeButton({ customId, ...(userId ? { userId } : {}) });
+      await router.handle(asInteraction(i));
+      return i;
+    };
+    await click('p:abc:join');
+    await router.handle(asInteraction(fakeSelect({ customId: 'p:abc:group', values: ['B'] })));
+    now += 20_000;
+    const third = await click('p:xyz:here');
+    expect(button).toHaveBeenCalledTimes(1);
+    expect(select).toHaveBeenCalledTimes(1);
+    expect(third.reply).toHaveBeenCalledWith({
+      content: 'That was a lot of clicks. Try again in 40 seconds.',
+      flags: MessageFlags.Ephemeral,
+    });
+    // Another member, and another kind of control, are not held back.
+    await click('p:abc:join', '700000000000000002');
+    expect(button).toHaveBeenCalledTimes(2);
+    await click('q:abc:go');
+    expect(other).toHaveBeenCalledTimes(1);
+    now += 40_000;
+    await click('p:abc:join');
+    expect(button).toHaveBeenCalledTimes(3);
+  });
+
+  it('keeps the budget of a kind of control apart from a command of a like name', async () => {
+    const { ctx } = createTestContext();
+    const execute = ran();
+    const button = ran();
+    // A command named like the throttle of a kind would be: `component` with subcommand `p`.
+    const cmd = commandGroup({
+      data: new SlashCommandBuilder().setName('component').setDescription('x'),
+      help: { category: 'util' },
+      parts: [part('p', { throttle: { uses: 1, perSeconds: 60 }, execute })],
+    });
+    const router = new InteractionRouter(
+      ctx,
+      [cmd],
+      [{ kind: 'p', throttle: { uses: 1, perSeconds: 60 }, button }],
+    );
+    await router.handle(
+      asInteraction(fakeChatInput({ commandName: 'component', subcommand: 'p' })),
+    );
+    await router.handle(asInteraction(fakeButton({ customId: 'p:abc:join' })));
+    expect(execute).toHaveBeenCalledTimes(1);
+    expect(button).toHaveBeenCalledTimes(1);
+  });
+
+  it('does not count a click that a guard of the handler refused', async () => {
+    const { ctx } = createTestContext();
+    let allowed = false;
+    const guard: Guard = () => {
+      if (!allowed) throw new UserError('Not yet.');
+    };
+    const button = ran();
+    const router = new InteractionRouter(
+      ctx,
+      [],
+      [{ kind: 'p', guards: [guard], throttle: { uses: 1, perSeconds: 60 }, button }],
+    );
+    await router.handle(asInteraction(fakeButton({ customId: 'p:abc:join' })));
+    allowed = true;
+    await router.handle(asInteraction(fakeButton({ customId: 'p:abc:join' })));
+    expect(button).toHaveBeenCalledTimes(1);
+  });
+
   it('runs the guards of a component handler before it', async () => {
     const { ctx } = createTestContext();
     const button = ran();
```

Run: `npx vitest run --project unit src/discord/member-info.test.ts src/discord/router.test.ts`
Expected: FAIL (`./member-info.js` cannot be found; the router tests fail on the missing throttle and `reason`).

- [ ] **Step 3: The implementation**

Apply to `src/discord/command.ts`:

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -124,6 +124,11 @@ export function declaredSubcommands(
 export interface ComponentHandler {
   kind: string;
   guards?: readonly Guard[];
+  /**
+   * How often one member may use the controls of this kind, all of them together. A use counts
+   * once the guards have let it through.
+   */
+  throttle?: Throttle;
   button?: (interaction: ButtonInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   select?: (interaction: AnySelectMenuInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   modal?: (interaction: ModalSubmitInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
```

Create `src/discord/member-info.ts`:

```ts
import type { MemberInfo } from '../domain/party/attendance.js';
import { teamOfRoles } from '../domain/party/party.js';
import type { LocatedInteraction } from './command.js';

/**
 * What an interaction says about the member who made it: their name in the server and their team
 * (a role named instinct, mystic or valor). The bot keeps no member list (that needs a privileged
 * intent), so this is the one moment it learns either; nothing for an interaction outside a
 * server the bot is in.
 */
export function memberInfo(interaction: LocatedInteraction): MemberInfo {
  if (!interaction.inCachedGuild()) return {};
  const { member } = interaction;
  const team = teamOfRoles(member.roles.cache.map((role) => role.name));
  return { name: member.displayName, ...(team ? { team } : {}) };
}
```

Apply to `src/discord/router.ts`:

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -166,10 +166,27 @@ export class InteractionRouter {
     await this.guarded(interaction, async () => {
       const run = id && handler ? runnerFor(handler, interaction, id, this.ctx) : undefined;
       if (!handler || !run) {
-        this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for component');
+        // Not a custom id of this bot (or of its legacy version), a kind nobody handles any more,
+        // or a kind that has no control of this type.
+        const reason = !id ? 'undecodable' : !handler ? 'unknown-kind' : 'no-such-control';
+        this.ctx.log.warn(
+          { interaction: describe(interaction), reason },
+          'no handler for component',
+        );
         throw new UserError(STALE_COMPONENT);
       }
       await runGuards(handler.guards ?? [], interaction, this.ctx);
+      if (handler.throttle) {
+        const wait = this.throttles.use(
+          `component:${handler.kind}`,
+          interaction.user.id,
+          handler.throttle,
+          this.now(),
+        );
+        if (wait !== undefined) {
+          throw new UserError(`That was a lot of clicks. Try again in ${waitText(wait)}.`);
+        }
+      }
       await run();
     });
   }
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -13,6 +13,12 @@ export function isGroupId(value: string): value is GroupId {
 export const TEAMS = ['instinct', 'mystic', 'valor'] as const;
 export type Team = (typeof TEAMS)[number];
 
+/** The team a member's roles name: the first of the teams that one of them is called. */
+export function teamOfRoles(roleNames: Iterable<string>): Team | undefined {
+  const names = new Set([...roleNames].map((name) => name.trim().toLowerCase()));
+  return TEAMS.find((team) => names.has(team));
+}
+
 /** A display name is kept no longer than this (Discord allows 32 characters). */
 export const MAX_MEMBER_NAME = 32;
 
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/discord/member-info.test.ts src/discord/router.test.ts`
Expected: PASS (`src/discord/router.test.ts` and `src/discord/member-info.test.ts`).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/discord/command.ts src/discord/member-info.test.ts src/discord/member-info.ts src/discord/router.test.ts src/discord/router.ts src/domain/party/party.ts test/support/fake-interactions.ts
npm run check
git add src/discord/command.ts src/discord/member-info.test.ts src/discord/member-info.ts src/discord/router.test.ts src/discord/router.ts src/domain/party/party.ts test/support/fake-interactions.ts
git commit -m "Controls: a throttle per member; who acts, with name and team" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,549 unit tests.

---

### Task 4: PartyLines and AttendanceService

**Files:**
- Create: `src/services/attendance-service.test.ts`, `src/services/attendance-service.ts`, `src/services/party-lines.test.ts`, `src/services/party-lines.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `test/support/fake-gateway.ts`, `test/support/party-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `PartyStore.update`, `PartyGateway.sendMessage` / `deleteMessage`, `Coalescer`, `PartyStore.byPost`, `PartyService.changed`, `UserSettings` (`mentions`, `mentionsGroups`), the attendance functions of plan 2B, `raidStage`.
- Produces: `src/services/party-lines.ts`: `PartyLines` with `say(postId, text, key?)` (of several unsent lines with one key only the newest is said), `flush()`, `pending`; constructed with `{ gateway, active(postId), log, delayMs? }`. `src/services/attendance-service.ts`: `Member` (`MemberInfo` with `id`), `AttendanceOutcome<Extra>` (`{ kind: 'gone' }`, `{ kind: 'refused'; reason }`, `{ kind: 'ok'; party; attendee; acted } & Extra`), `AttendanceService` (constructed with `{ store, gateway, posts, lines, users, settings, log, now? }`) with `limits()`, `signUp(partyId, member, status, options?)`, `setRemote(partyId, member, remote | 'toggle', options?)`, `changeNumber(partyId, member, delta)`, `notHere`, `leave`, `done` (extra `asked`, `wasComplete`), `answer(partyId, member, completed)`, `joinGroup(partyId, member, group)`, `newGroup` (extra `group`), `labelGroup(partyId, member, text)` (extra `group`), `ask(party, members)`, `removeQuestions(partyId)`, `flush()`. `AppContext.attendance`. Test support: `partyServiceWith()` also returns `attendance`, `users`, `userSettings`; `reportedRaid(report?, overrides?)` returns that plus `party`, `postId`, `current()`, `said()`.

`ask` and `removeQuestions` are public because the scheduler of plan 2D-2 calls them. Messages sent on the side (the question, the new-group notice) are not awaited by the action: a failure there is a warning in the log and the stored change stands; `flush()` waits for them.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -138,6 +138,14 @@ export class FakePartyGateway implements PartyGateway {
   }
 
   private static checkMessage(message: OutgoingMessage): void {
+    if ((message.content ?? '').length > 2000)
+      throw new Error('A message has at most 2000 characters');
+    if ((message.mention?.users?.length ?? 0) > 100)
+      throw new Error('A message pings at most 100 users');
+    if ((message.components?.length ?? 0) > 5) throw new Error('A message has at most 5 rows');
+    for (const row of message.components ?? []) {
+      if (row.components.length > 5) throw new Error('A row has at most 5 controls');
+    }
     if (!message.content && !message.embeds?.length) {
       throw new Error('Invalid Form Body: a message needs content or an embed');
     }
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -1,12 +1,23 @@
 import { loadSettings } from '../../src/config/settings.js';
 import type { Region } from '../../src/db/repositories/region-repository.js';
+import {
+  DEFAULT_USER_SETTINGS,
+  type UserSettings,
+} from '../../src/db/repositories/user-repository.js';
+import { PartyLines } from '../../src/services/party-lines.js';
+import { AttendanceService } from '../../src/services/attendance-service.js';
 import type { Party } from '../../src/domain/party/party.js';
 import { FORUM_TAGS } from '../../src/render/raid-post.js';
-import { PartyService, type PartyServiceOptions } from '../../src/services/party-service.js';
+import { PartyStatus } from '../../src/domain/party/status.js';
+import {
+  PartyService,
+  type PartyServiceOptions,
+  type RaidReport,
+} from '../../src/services/party-service.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { catalogueFixture } from './game-data.js';
 import { EAST_FORUM, testRegions, WEST_FORUM } from './gyms.js';
-import { MemoryPartyStorage, PARTY_NOW } from './parties.js';
+import { MemoryPartyStorage, PARTY_NOW, REPORTER } from './parties.js';
 import { gymsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
@@ -54,6 +65,9 @@ export class TestRegions {
  * A party service over fakes: the invented gyms and regions (West and East have forums, which
  * exist on the fake gateway with every tag), the fixture bosses and events, a store over memory
  * and a clock a test can move (`clock.now`). Posts are brought up to date only by `flush()`.
+ *
+ * `attendance` is the attendance service over the same store and gateway; its lines go out only
+ * by its own `flush()`. `userSettings` holds what differs from the defaults, by member.
  */
 export async function partyServiceWith(
   parties: readonly Party[] = [],
@@ -71,6 +85,12 @@ export async function partyServiceWith(
     [EAST_FORUM]: gateway.addForum(EAST_FORUM, FORUM_TAGS, 'east-raids'),
   };
   const regions = new TestRegions();
+  const settings = loadSettings(TEST_SETTINGS_PATH);
+  const userSettings = new Map<string, Partial<UserSettings>>();
+  const users = {
+    get: (snowflake: string): Promise<UserSettings> =>
+      Promise.resolve({ snowflake, ...DEFAULT_USER_SETTINGS, ...userSettings.get(snowflake) }),
+  };
   const service = new PartyService({
     store,
     gateway,
@@ -80,7 +100,7 @@ export async function partyServiceWith(
     raidBosses: raidBossesFixture(),
     gameData: { catalogue: catalogueFixture() },
     raidEvents: raidEventsFixture(),
-    settings: loadSettings(TEST_SETTINGS_PATH),
+    settings,
     log,
     // The fakes' server is the guild of row 1, which the invented regions belong to.
     guilds: {
@@ -91,5 +111,69 @@ export async function partyServiceWith(
     renderDelayMs: 3_600_000,
     ...overrides,
   });
-  return { service, store, storage, gateway, regions, tags, entries, clock };
+  const attendance = new AttendanceService({
+    store,
+    gateway,
+    posts: service,
+    lines: new PartyLines({
+      gateway,
+      active: (postId) => store.byPost(postId) !== undefined,
+      log,
+      delayMs: 3_600_000,
+    }),
+    users,
+    settings,
+    log,
+    now,
+  });
+  return {
+    service,
+    attendance,
+    users,
+    userSettings,
+    store,
+    storage,
+    gateway,
+    regions,
+    tags,
+    entries,
+    clock,
+  };
+}
+
+/**
+ * A raid reported through the service, with its post on the fake gateway: at the Library (gym 1,
+ * region West), by `REPORTER`, who is interested. An egg without times unless `report` says
+ * otherwise (`boss: { key: 'yveltal' }` makes it a raid that was seen hatched).
+ */
+export async function reportedRaid(
+  report: Partial<RaidReport> = {},
+  overrides: Partial<PartyServiceOptions> = {},
+) {
+  const made = await partyServiceWith([], overrides);
+  const gym = gymsFixture().get(1);
+  if (!gym) throw new Error('the invented gyms have no gym 1');
+  const outcome = await made.service.reportRaid({
+    gym,
+    reporterId: REPORTER,
+    anonymous: false,
+    autoStatus: PartyStatus.Interested,
+    tier: { level: 'T5', shadow: false },
+    boss: null,
+    ...report,
+  });
+  if (outcome.kind !== 'created') throw new Error(`the raid was not created: ${outcome.kind}`);
+  await made.service.flush();
+  const postId = outcome.party.forumPostId;
+  if (postId === null) throw new Error('the raid has no post');
+  /** The party as it is stored now. */
+  const current = (): Party => {
+    const party = made.store.get(outcome.party.id);
+    if (!party) throw new Error('the raid is no longer active');
+    return party;
+  };
+  /** The texts of the messages in the post that were not deleted, oldest first. */
+  const said = (): string[] =>
+    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
+  return { ...made, party: outcome.party, postId, current, said };
 }
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -4,6 +4,7 @@ import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
 import { DEFAULT_USER_SETTINGS } from '../../src/db/repositories/user-repository.js';
 import type { DB } from '../../src/db/types.js';
+import type { AttendanceService } from '../../src/services/attendance-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import { catalogueFixture } from './game-data.js';
 import { noParties } from './parties.js';
@@ -50,6 +51,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'partyService',
       'pass { partyService, parties, regions } from partyServiceWith()',
     ),
+    attendance: unavailable<AttendanceService>(
+      'attendance',
+      'pass { attendance, partyService, parties, regions } from partyServiceWith()',
+    ),
     // Searches the catalogue of the context's own game data, built when first used.
     pokemon: pokemonFixture(gameData),
     maps: mapsFixture(),
```

- [ ] **Step 2: Write the failing tests**

Create `src/services/attendance-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { completeRaid } from '../domain/party/attendance.js';
import { attendeeOf } from '../domain/party/party.js';
import { endParty } from '../domain/party/tick.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol', team: 'valor' };
const yveltal = { boss: { key: 'yveltal' } } as const;

describe('AttendanceService: signing up', () => {
  it('stores the sign-up with name and team, shows the post anew and says so in the post', async () => {
    const made = await reportedRaid();
    const edits = () => made.gateway.posts.get(made.postId)?.edits;
    const outcome = await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, {
      number: 3,
    });
    expect(outcome).toMatchObject({
      kind: 'ok',
      acted: true,
      attendee: { status: PartyStatus.Coming, number: 3, name: 'Alice', team: 'mystic' },
    });
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ number: 3, team: 'mystic' });
    await made.attendance.flush();
    await made.service.flush();
    expect(edits()).toBe(1);
    expect(made.said()).toEqual([`<@${ALICE}> is coming with 2 more.`]);
    // The line pings nobody.
    expect(made.gateway.messagesIn(made.postId)[0]?.message.mention).toBeUndefined();
  });

  it('says nothing when the action changes nothing, but still notes a new name', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.flush();
    const again = await made.attendance.signUp(
      made.party.id,
      { ...alice, name: 'Alice II' },
      PartyStatus.Coming,
    );
    expect(again).toMatchObject({ kind: 'ok', acted: false, attendee: { name: 'Alice II' } });
    await made.attendance.flush();
    expect(made.said()).toHaveLength(1);
  });

  it('gathers the lines of a burst into one message, one line per member', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Interested);
    for (let n = 0; n < 4; n++) await made.attendance.changeNumber(made.party.id, bob, 1);
    await made.attendance.signUp(made.party.id, carol, PartyStatus.Present);
    await made.attendance.changeNumber(made.party.id, bob, -1);
    await made.attendance.flush();
    // The first line goes out at once. Of what follows within the delay, a member has one line:
    // how they stand at the end, in the place of their first.
    expect(made.said()).toEqual([
      `<@${ALICE}> is coming.`,
      `<@${BOB}> is interested with 3 more.\n<@${CAROL}> is here.`,
    ]);
  });

  it('answers a refusal with its reason and changes nothing', async () => {
    const made = await reportedRaid();
    const before = made.current();
    expect(
      await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 99 }),
    ).toEqual({ kind: 'refused', reason: 'bad-count' });
    expect(await made.attendance.leave(made.party.id, alice)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(made.current()).toBe(before);
    await made.attendance.flush();
    expect(made.said()).toEqual([]);
  });

  it('answers gone for a party that is no longer active', async () => {
    const made = await reportedRaid();
    const outcome = await made.attendance.signUp(
      '00000000-0000-4000-8000-00000000ffff',
      alice,
      PartyStatus.Coming,
    );
    expect(outcome).toEqual({ kind: 'gone' });
  });

  it('switches remote and back, and one fewer never goes below one', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    expect(await made.attendance.setRemote(id, alice, 'toggle')).toMatchObject({
      attendee: { remote: true, status: PartyStatus.Interested },
    });
    expect(await made.attendance.setRemote(id, alice, 'toggle')).toMatchObject({
      attendee: { remote: false },
    });
    expect(await made.attendance.changeNumber(id, alice, -1)).toMatchObject({
      kind: 'ok',
      acted: false,
      attendee: { number: 1 },
    });
    expect(await made.attendance.changeNumber(id, bob, -1)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
  });

  it('says that a member has left, and that one is not here any more', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.flush();
    await made.attendance.notHere(id, alice);
    await made.attendance.flush();
    const left = await made.attendance.leave(id, alice);
    expect(left).toMatchObject({ kind: 'ok', acted: true, attendee: undefined });
    await made.attendance.flush();
    expect(made.said()).toEqual([
      `<@${ALICE}> is here.`,
      `<@${ALICE}> is interested.`,
      `<@${ALICE}> has left.`,
    ]);
  });

  it('says "in person" when a member switches remote off, and nothing of it otherwise', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming, { number: 2 });
    await made.attendance.flush();
    await made.attendance.setRemote(id, alice, true);
    await made.attendance.flush();
    await made.attendance.setRemote(id, alice, false);
    await made.attendance.flush();
    expect(made.said()).toEqual([
      `<@${ALICE}> is coming with 1 more.`,
      `<@${ALICE}> is coming with 1 more, remotely.`,
      `<@${ALICE}> is coming with 1 more, in person.`,
    ]);
  });

  it('says nothing in the post of a raid that has ended meanwhile', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.flush();
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.store.update(id, (party) => ({ party: endParty(party) }));
    await made.attendance.flush();
    expect(made.said()).toEqual([`<@${ALICE}> is coming.`]);
  });
});

describe('AttendanceService: completing a raid', () => {
  it('refuses Done while the raid is an egg', async () => {
    const made = await reportedRaid();
    expect(await made.attendance.done(made.party.id, { id: REPORTER })).toEqual({
      kind: 'refused',
      reason: 'not-hatched',
    });
  });

  it('asks the others of the group who are here, with buttons, and pings those who allow it', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    made.userSettings.set(BOB, { mentions: false });
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    const outcome = await made.attendance.done(id, alice);
    expect(outcome).toMatchObject({ kind: 'ok', asked: [BOB, CAROL], wasComplete: false });
    await made.attendance.flush();
    const question = made.gateway
      .messagesIn(made.postId)
      .find((message) => message.message.components?.length);
    expect(question?.message.content).toContain(`<@${BOB}>, <@${CAROL}>: have you completed`);
    expect(question?.message.mention).toEqual({ users: [CAROL] });
    const ids = question?.message.components?.[0]?.components.map((c) =>
      'custom_id' in c ? decodeCustomId(c.custom_id) : undefined,
    );
    expect(ids).toEqual([
      { kind: 'party', id, action: 'answer', args: ['yes'] },
      { kind: 'party', id, action: 'answer', args: ['no'] },
    ]);
    expect(made.current().prompts.completion).toEqual([question?.id]);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.CompletePending,
      pendingUntil: made.clock.now + 5 * MINUTE,
    });
  });

  it('removes the question once everybody asked has answered', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const [question] = made.current().prompts.completion;
    expect(await made.attendance.answer(id, bob, true)).toMatchObject({
      attendee: { status: PartyStatus.Complete },
    });
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([question]);
    expect(await made.attendance.answer(id, carol, false)).toMatchObject({
      attendee: { status: PartyStatus.Present },
    });
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    expect(made.gateway.deleted).toEqual([{ channelId: made.postId, messageId: question }]);
    expect(await made.attendance.answer(id, carol, true)).toEqual({
      kind: 'refused',
      reason: 'not-pending',
    });
  });

  it('removes the question also when the last one asked leaves or changes their status', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toHaveLength(1);
    await made.attendance.leave(id, bob);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    expect(made.gateway.deleted).toHaveLength(1);
  });

  it('deletes a question that nobody is left to answer by the time it is sent', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    // Both actions are on their way together: the answer is stored before the question is sent.
    const done = made.attendance.done(id, alice);
    const answered = made.attendance.answer(id, bob, true);
    await Promise.all([done, answered]);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    const questions = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.components?.length);
    expect(questions).toEqual([]);
  });

  it('asks nobody when a member who was only interested says done', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    const outcome = await made.attendance.done(id, { id: REPORTER });
    expect(outcome).toMatchObject({ kind: 'ok', asked: [] });
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('keeps at most ten questions, deleting the oldest', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    // Alice is done: Bob is asked, and stays asked, so every question is recorded.
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const sent = [...made.current().prompts.completion];
    for (let round = 0; round < 11; round++) {
      await made.attendance.ask(made.current(), [BOB]);
      sent.push(made.current().prompts.completion.at(-1) ?? '');
    }
    expect(sent).toHaveLength(12);
    expect(made.current().prompts.completion).toEqual(sent.slice(2));
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual(sent.slice(0, 2));
  });

  it('says "not done yet" for the answer no, and "done" for yes', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present, { number: 2 });
    }
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    await made.attendance.answer(id, bob, false);
    await made.attendance.flush();
    await made.attendance.answer(id, carol, true);
    await made.attendance.flush();
    // Somebody who is done is just that: no head count, no group, no remote.
    expect(made.said().slice(-2)).toEqual([`<@${BOB}> is not done yet.`, `<@${CAROL}> is done.`]);
  });

  it('keeps a question it could not delete in mind and deletes it the next time', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    await made.attendance.ask(made.current(), [BOB]);
    const questions = [...made.current().prompts.completion];
    expect(questions).toHaveLength(2);

    made.gateway.failing.set('deleteMessage', new Error('no'));
    await made.attendance.answer(id, bob, true);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual(questions);
    expect(made.entries.filter((e) => e.msg === 'could not delete a message')).toHaveLength(2);

    made.gateway.failing.clear();
    await made.attendance.removeQuestions(id);
    expect(made.current().prompts.completion).toEqual([]);
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual(questions);
  });

  it('deletes a question it could not record', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    const asked = await made.store.update(id, (party) =>
      completeRaid(party, ALICE, made.clock.now, 5),
    );
    made.storage.failing = new Error('the database is away');
    await expect(made.attendance.ask(asked?.party ?? made.current(), [BOB])).rejects.toThrow(
      'the database is away',
    );
    made.storage.failing = undefined;
    const questions = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.components?.length);
    expect(questions).toEqual([]);
    expect(made.gateway.deleted).toHaveLength(1);
  });

  it('asks without pinging anybody when the settings cannot be read', async () => {
    const made = await reportedRaid(yveltal, {});
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    made.users.get = () => Promise.reject(new Error('the database is away'));
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const question = made.gateway
      .messagesIn(made.postId)
      .find((message) => message.message.components?.length);
    expect(question?.message.content).toContain(`<@${BOB}>: have you completed`);
    expect(question?.message.mention).toEqual({ users: [] });
  });
});

describe('AttendanceService: groups', () => {
  it('opens a group, moves the member there and tells the others, pinging those who allow it', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    made.userSettings.set(BOB, { mentionsGroups: false });
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Coming);
    await made.attendance.flush();
    const outcome = await made.attendance.newGroup(id, alice);
    expect(outcome).toMatchObject({
      kind: 'ok',
      group: 'B',
      attendee: { group: 'B', status: PartyStatus.Coming },
    });
    await made.attendance.flush();
    const notice = made.gateway.messagesIn(made.postId).at(-1);
    expect(notice?.message.content).toBe(
      `<@${ALICE}> opened group B. To move to it, use its button on the post or \`/group join\`.` +
        `\n<@${REPORTER}> <@${CAROL}>`,
    );
    expect(notice?.message.mention).toEqual({ users: [REPORTER, CAROL] });
    expect(made.current().defaultGroupId).toBe('B');
  });

  it('refuses a sixth group', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    for (let n = 0; n < 4; n++) await made.attendance.newGroup(id, alice);
    expect(await made.attendance.newGroup(id, alice)).toEqual({
      kind: 'refused',
      reason: 'too-many-groups',
    });
  });

  it('moves a member to a group and says where they stand', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.newGroup(id, alice);
    await made.attendance.flush();
    const moved = await made.attendance.joinGroup(id, bob, 'B');
    expect(moved).toMatchObject({ kind: 'ok', attendee: { group: 'B' } });
    expect(await made.attendance.joinGroup(id, bob, 'D')).toEqual({
      kind: 'refused',
      reason: 'no-such-group',
    });
    await made.attendance.flush();
    expect(made.said().at(-1)).toBe(`<@${BOB}> is coming, in group B.`);
  });

  it('names a group and removes the name again', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    const named = await made.attendance.labelGroup(id, { id: REPORTER }, ' park *side* ');
    expect(named).toMatchObject({ kind: 'ok', group: 'A' });
    expect(made.current().groups[0]?.label).toBe('park *side*');
    await made.attendance.labelGroup(id, { id: REPORTER }, '');
    await made.attendance.flush();
    expect(made.said().join('\n').split('\n')).toEqual([
      `<@${REPORTER}> named group A (park \\*side\\*).`,
      `<@${REPORTER}> removed the name of group A.`,
    ]);
    expect(await made.attendance.labelGroup(id, alice, 'x')).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
  });
});

describe('AttendanceService: when Discord fails', () => {
  it('keeps the change and logs a warning when the line cannot be sent', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('sendMessage', new Error('no'));
    const outcome = await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    expect(outcome.kind).toBe('ok');
    await made.attendance.flush();
    expect(attendeeOf(made.current(), ALICE)).toBeDefined();
    expect(made.entries.some((e) => e.msg === 'could not post a party line')).toBe(true);
  });

  it('logs a warning when the question cannot be sent; the members stay asked', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    made.gateway.failing.set('sendMessage', new Error('no'));
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    expect(made.entries.some((e) => e.msg === 'could not ask who completed')).toBe(true);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
  });
});
```

Create `src/services/party-lines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PartyLines } from './party-lines.js';

const POST = '500000000000000001';
const OTHER = '500000000000000002';

function setup(active: (postId: string) => boolean = () => true) {
  const gateway = new FakePartyGateway();
  const { log, entries } = createTestLogger();
  // Long enough that nothing after the first line goes out before `flush`.
  const lines = new PartyLines({ gateway, active, log, delayMs: 3_600_000 });
  const said = (postId = POST) =>
    gateway.messagesIn(postId).map((message) => message.message.content);
  return { gateway, lines, entries, said };
}

describe('PartyLines', () => {
  it('says the first line at once and gathers what follows into one message', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'one');
    lines.say(POST, 'two');
    lines.say(POST, 'three');
    await lines.flush();
    expect(said()).toEqual(['one', 'two\nthree']);
    expect(lines.pending).toBe(0);
  });

  it('keeps the lines of two posts apart', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'here');
    lines.say(OTHER, 'there');
    await lines.flush();
    expect(said(POST)).toEqual(['here']);
    expect(said(OTHER)).toEqual(['there']);
  });

  it('says only the newest of several unsent lines with one key, in the place of the first', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'first');
    lines.say(POST, 'a is coming', 'a');
    lines.say(POST, 'b is here', 'b');
    lines.say(POST, 'a is coming with 1 more', 'a');
    lines.say(POST, 'somebody named a group');
    lines.say(POST, 'a is coming with 2 more', 'a');
    await lines.flush();
    expect(said()).toEqual(['first', 'a is coming with 2 more\nb is here\nsomebody named a group']);
  });

  it('does not replace a line that was sent already', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'a is coming', 'a');
    await lines.flush();
    lines.say(POST, 'a is here', 'a');
    await lines.flush();
    expect(said()).toEqual(['a is coming', 'a is here']);
  });

  it('pings nobody', async () => {
    const { gateway, lines } = setup();
    lines.say(POST, '<@200000000000000002> is coming.');
    await lines.flush();
    expect(gateway.messagesIn(POST)[0]?.message.mention).toBeUndefined();
  });

  it('splits what does not fit into one message, never above 2,000 characters', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'first');
    for (let n = 0; n < 60; n++) lines.say(POST, `${String(n).padStart(2, '0')} ${'x'.repeat(57)}`);
    await lines.flush();
    const texts = said();
    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text?.length).toBeLessThanOrEqual(2000);
    expect(texts.join('\n').split('\n')).toHaveLength(61);
  });

  it('drops the lines for a post whose party is no longer active', async () => {
    let active = true;
    const { lines, said } = setup(() => active);
    lines.say(POST, 'one');
    lines.say(POST, 'two');
    active = false;
    await lines.flush();
    expect(said()).toEqual(['one']);
    active = true;
    lines.say(POST, 'three');
    await lines.flush();
    expect(said()).toEqual(['one', 'three']);
  });

  it('logs a warning when a message cannot be sent, and goes on', async () => {
    const { gateway, lines, entries, said } = setup();
    gateway.failing.set('sendMessage', new Error('no'));
    lines.say(POST, 'lost');
    await lines.flush();
    expect(entries.some((e) => e.level === 40 && e.msg === 'could not post a party line')).toBe(
      true,
    );
    gateway.failing.clear();
    lines.say(POST, 'kept');
    await lines.flush();
    expect(said()).toEqual(['kept']);
  });
});
```

Run: `npx vitest run --project unit src/services/attendance-service.test.ts src/services/party-lines.test.ts`
Expected: FAIL (`./party-lines.js` and `./attendance-service.js` cannot be found).

- [ ] **Step 3: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -5,6 +5,7 @@ import type { DB } from './db/types.js';
 import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
 import type { Logger } from './log.js';
+import type { AttendanceService } from './services/attendance-service.js';
 import type { GameDataProvider } from './services/game-data-service.js';
 import type { GymProvider } from './services/gym-directory.js';
 import type { PartyService } from './services/party-service.js';
@@ -35,6 +36,8 @@ export interface AppContext {
   readonly parties: PartyProvider;
   /** Parties on Discord: reporting a raid, keeping posts and summaries up to date. */
   readonly partyService: PartyService;
+  /** What members do in a party: signing up, completing, groups. Buttons and commands use it. */
+  readonly attendance: AttendanceService;
   /** A member's settings (the defaults for a member who never changed one). */
   readonly users: { get(snowflake: string): Promise<UserSettings> };
   /** Pokémon by what members type: names, nicknames, forms. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -21,9 +21,11 @@ import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
 import { createLogger, type Logger } from './log.js';
+import { AttendanceService } from './services/attendance-service.js';
 import { GameDataService } from './services/game-data-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { ImageCache } from './services/image-cache.js';
+import { PartyLines } from './services/party-lines.js';
 import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
@@ -104,6 +106,20 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  const users = new UserRepository(db);
+  const attendance = new AttendanceService({
+    store: parties,
+    gateway: partyGateway,
+    posts: partyService,
+    lines: new PartyLines({
+      gateway: partyGateway,
+      active: (postId) => parties.byPost(postId) !== undefined,
+      log,
+    }),
+    users,
+    settings: config.settings,
+    log,
+  });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
   const maps = new StaticMaps(
     config.env.GOOGLE_API_KEY,
@@ -144,7 +160,8 @@ export async function startApp(
     regions,
     parties,
     partyService,
-    users: new UserRepository(db),
+    attendance,
+    users,
     pokemon,
     maps,
     features: requested,
@@ -209,7 +226,8 @@ export async function startApp(
           await raidEvents.whenIdle();
         },
       },
-      // Edits that are still waiting go out while Discord is connected.
+      // Lines and edits that are still waiting go out while Discord is connected.
+      { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
       // A write in flight must finish before the pool closes.
```

Create `src/services/attendance-service.ts`:

```ts
import type { Settings } from '../config/settings.js';
import type { UserSettings } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import {
  answerCompletion,
  attendanceLimits,
  changeNumber,
  completeRaid,
  createGroup,
  joinGroup,
  labelGroup,
  leaveParty,
  noteMember,
  setAttendance,
  setNotHere,
  setRemote,
  type AttendanceLimits,
  type AttendanceOptions,
  type MemberInfo,
} from '../domain/party/attendance.js';
import {
  attendeeOf,
  groupOf,
  MAX_COMPLETION_PROMPTS,
  membersWhere,
  refused,
  type Attendee,
  type Change,
  type GroupId,
  type Party,
  type PartyProblem,
} from '../domain/party/party.js';
import { raidStage } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Logger } from '../log.js';
import { standingLine } from '../render/activity.js';
import { completionQuestion, groupWords } from '../render/party-controls.js';
import { LIMITS } from '../render/text.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';

/** The member who acts: their snowflake and what the interaction said about them. */
export interface Member extends MemberInfo {
  id: string;
}

/** Discord lets one message name this many users to ping. */
const MAX_PINGS = 100;

/**
 * What came of a member's action. `gone`: there is no such active party (it ended meanwhile).
 * `refused`: the party stays as it was. `ok`: the party as it is stored now, with the member's
 * attendee record (undefined after leaving) and `acted`, false when the action changed nothing
 * (Join from somebody who was coming already).
 */
export type AttendanceOutcome<Extra = unknown> =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem }
  | ({ kind: 'ok'; party: Party; attendee: Attendee | undefined; acted: boolean } & Extra);

export interface AttendanceServiceOptions {
  store: PartyStore;
  gateway: PartyGateway;
  /** Told after every stored change, to bring the post and the summary up to date. */
  posts: { changed(partyId: string): void };
  /** Where the public lines go. */
  lines: PartyLines;
  users: { get(snowflake: string): Promise<UserSettings> };
  settings: Settings;
  log: Logger;
  now?: () => number;
}

function anyoneAsked(party: Party): boolean {
  return membersWhere(party, (a) => a.status === PartyStatus.CompletePending).length > 0;
}

/**
 * What members do in a party: sign up, change how they come, complete the raid, use groups. The
 * buttons of a post and the slash commands both end here. Every method stores the change, has the
 * post shown anew, and says in the post what happened, in a line that pings nobody; the caller
 * tells the member privately (`standingReply`, `problemText`).
 */
export class AttendanceService {
  private readonly now: () => number;
  /** Messages being sent or deleted on the side; `flush` waits for them. */
  private readonly background = new Set<Promise<void>>();

  constructor(private readonly options: AttendanceServiceOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** The largest head count a member may bring, from the settings. */
  limits(): AttendanceLimits {
    return attendanceLimits(this.options.settings);
  }

  /** Interested, coming or here; what `options` leaves out stays as it is. */
  signUp(
    partyId: string,
    member: Member,
    status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
    options: AttendanceOptions = {},
  ): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      setAttendance(party, member.id, status, options, this.limits()),
    );
  }

  /** Remote or in person; `'toggle'` is the other of what the member is now. */
  setRemote(
    partyId: string,
    member: Member,
    remote: boolean | 'toggle',
    options: Omit<AttendanceOptions, 'remote'> = {},
  ): Promise<AttendanceOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => {
        const wanted =
          remote === 'toggle' ? !(attendeeOf(party, member.id)?.remote ?? false) : remote;
        return setRemote(party, member.id, wanted, options, this.limits());
      },
      (party) => {
        const attendee = attendeeOf(party, member.id);
        // "In person" is said here: without it the line after switching remote off would read
        // like the one before switching it on.
        return attendee && standingLine(party, member.id, attendee, { sayInPerson: true });
      },
    );
  }

  /** One more or one fewer in the member's head count. */
  changeNumber(partyId: string, member: Member, delta: 1 | -1): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      changeNumber(party, member.id, delta, this.limits()),
    );
  }

  notHere(partyId: string, member: Member): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) => setNotHere(party, member.id));
  }

  leave(partyId: string, member: Member): Promise<AttendanceOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => leaveParty(party, member.id),
      () => `<@${member.id}> has left.`,
    );
  }

  /**
   * The member has completed the raid. The others of their group who are present are asked in
   * the post whether they have too (`asked`). Refused while the raid is an egg.
   */
  async done(
    partyId: string,
    member: Member,
  ): Promise<AttendanceOutcome<{ asked: string[]; wasComplete: boolean }>> {
    const now = this.now();
    const outcome = await this.apply(partyId, member, (party) =>
      raidStage(party, now) === 'egg'
        ? refused('not-hatched')
        : completeRaid(party, member.id, now, this.options.settings.raidCompleteTimeout),
    );
    if (outcome.kind === 'ok' && outcome.asked.length > 0) {
      this.inBackground(this.ask(outcome.party, outcome.asked), partyId, 'ask who completed');
    }
    return outcome;
  }

  /** A member's answer to the completion question. */
  answer(partyId: string, member: Member, completed: boolean): Promise<AttendanceOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => answerCompletion(party, member.id, completed),
      // "Is here" would read like an arrival; they were listed under Here all along.
      completed ? undefined : () => `<@${member.id}> is not done yet.`,
    );
  }

  joinGroup(partyId: string, member: Member, group: GroupId): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      joinGroup(party, member.id, group, this.limits()),
    );
  }

  /**
   * Opens the next group and moves the member into it. The attendees who have not completed the
   * raid are told in the post; those who allow it are pinged.
   */
  async newGroup(partyId: string, member: Member): Promise<AttendanceOutcome<{ group: GroupId }>> {
    const outcome = await this.apply(
      partyId,
      member,
      (party) => createGroup(party, member.id, this.limits()),
      'none',
    );
    if (outcome.kind === 'ok' && outcome.acted) {
      this.inBackground(
        this.announceGroup(outcome.party, member.id, outcome.group, outcome.others),
        partyId,
        'announce a new group',
      );
    }
    return outcome;
  }

  /** Labels the member's own group; an empty text removes the label. */
  labelGroup(
    partyId: string,
    member: Member,
    text: string,
  ): Promise<AttendanceOutcome<{ group: GroupId }>> {
    return this.apply(
      partyId,
      member,
      (party) => labelGroup(party, member.id, text),
      (party, result) => {
        const group = groupOf(party, result.group);
        return group?.label
          ? `<@${member.id}> named ${groupWords(group)}.`
          : `<@${member.id}> removed the name of group ${result.group}.`;
      },
    );
  }

  /**
   * Runs one change of a member in a party. The member's name and team are noted with it. When
   * the change did something, the post gets a line: what `line` gives, or by default how the
   * member stands now; `'none'` when the caller says it another way. A member has one line
   * waiting at a time: a newer one takes the place of one that was not sent yet.
   */
  private async apply<Extra>(
    partyId: string,
    member: Member,
    change: (party: Party) => Change<Party, Extra>,
    line?: 'none' | ((party: Party, result: Extra) => string | undefined),
  ): Promise<AttendanceOutcome<Extra>> {
    const { store, posts, lines } = this.options;
    const result = await store.update(partyId, (party) => {
      const changed = change(party);
      if (!changed.ok) return changed;
      return {
        ...changed,
        party: noteMember(changed.party, member.id, member),
        acted: changed.party !== party,
      };
    });
    if (!result) return { kind: 'gone' };
    if (!result.ok) return { kind: 'refused', reason: result.reason };
    const { party, acted } = result;
    const attendee = attendeeOf(party, member.id);
    if (result.written) posts.changed(partyId);
    if (acted) {
      if (line !== 'none' && party.forumPostId !== null) {
        const text = line
          ? line(party, result)
          : attendee && standingLine(party, member.id, attendee);
        if (text) lines.say(party.forumPostId, text, `member:${member.id}`);
      }
      this.settleQuestions(party);
    }
    const { ok: _ok, written: _written, ...rest } = result;
    return { ...(rest as unknown as Extra), kind: 'ok', party, attendee, acted };
  }

  private inBackground(work: Promise<void>, partyId: string, what: string): void {
    const run = work
      .catch((err: unknown) => {
        this.options.log.warn({ err, party: partyId }, `could not ${what}`);
      })
      .finally(() => this.background.delete(run));
    this.background.add(run);
  }

  /**
   * The members of `ids` who let the bot ping them, for this kind of message; at most as many as
   * one message may name. A member whose settings cannot be read is not pinged.
   */
  private async pingable(
    ids: readonly string[],
    allows: (settings: UserSettings) => boolean,
  ): Promise<string[]> {
    const settings = await Promise.all(
      ids.map((id) => this.options.users.get(id).catch(() => undefined)),
    );
    return ids
      .filter((_id, index) => {
        const found = settings[index];
        return found !== undefined && found.mentions && allows(found);
      })
      .slice(0, MAX_PINGS);
  }

  /** Deletes messages of a post, each by itself; gives the ids that are gone now. */
  private async deleteMessages(postId: string, ids: readonly string[]): Promise<string[]> {
    const { gateway, log } = this.options;
    const results = await Promise.allSettled(ids.map((id) => gateway.deleteMessage(postId, id)));
    return ids.filter((id, index) => {
      const result = results[index];
      if (result?.status === 'fulfilled') return true;
      log.warn(
        { err: result?.reason as unknown, post: postId, message: id },
        'could not delete a message',
      );
      return false;
    });
  }

  /**
   * Asks these members in the post whether they completed the raid, with the two answer buttons,
   * and remembers the message so that it can be removed once nobody is left to answer. For the
   * Done button and command, and for the scheduler when a group's meeting time has passed.
   */
  async ask(party: Party, members: readonly string[]): Promise<void> {
    const { gateway, store, settings } = this.options;
    const postId = party.forumPostId;
    if (postId === null || members.length === 0) return;
    const question = completionQuestion(party.id, members, settings.raidCompleteTimeout);
    const users = await this.pingable(members, () => true);
    const messageId = await gateway.sendMessage(postId, { ...question, mention: { users } });
    if (messageId === undefined) return;
    let dropped: string[] = [];
    let recorded = false;
    try {
      const result = await store.update(party.id, (current) => {
        if (!anyoneAsked(current)) return {};
        const all = [...current.prompts.completion, messageId];
        dropped = all.slice(0, Math.max(0, all.length - MAX_COMPLETION_PROMPTS));
        const completion = all.slice(-MAX_COMPLETION_PROMPTS);
        return { party: { ...current, prompts: { ...current.prompts, completion } } };
      });
      recorded = result?.written ?? false;
    } finally {
      // Not recorded: everybody answered while the question was on its way, the party ended, or
      // the write failed. A question nobody remembers would stay in the post for good.
      await this.deleteMessages(postId, recorded ? dropped : [messageId]);
    }
  }

  /** Removes the completion questions of a party once nobody is left to answer them. */
  private settleQuestions(party: Party): void {
    if (party.prompts.completion.length === 0 || anyoneAsked(party)) return;
    this.inBackground(this.removeQuestions(party.id), party.id, 'remove a completion question');
  }

  /**
   * Deletes the completion questions of a party when nobody is asked any more. A question that
   * could not be deleted stays remembered and is tried again the next time. Also for the
   * scheduler, after it has completed those who did not answer.
   */
  async removeQuestions(partyId: string): Promise<void> {
    const { store } = this.options;
    let questions: readonly string[] = [];
    let postId: string | null = null;
    // Decided inside the store, without a write.
    await store.update(partyId, (current) => {
      if (!anyoneAsked(current)) {
        questions = current.prompts.completion;
        postId = current.forumPostId;
      }
      return {};
    });
    if (postId === null || questions.length === 0) return;
    const gone = new Set(await this.deleteMessages(postId, questions));
    if (gone.size === 0) return;
    await store.update(partyId, (current) => ({
      party: {
        ...current,
        prompts: {
          ...current.prompts,
          completion: current.prompts.completion.filter((id) => !gone.has(id)),
        },
      },
    }));
  }

  private async announceGroup(
    party: Party,
    memberId: string,
    group: GroupId,
    others: readonly string[],
  ): Promise<void> {
    const postId = party.forumPostId;
    if (postId === null) return;
    const users = await this.pingable(others, (settings) => settings.mentionsGroups);
    const opened = `<@${memberId}> opened group ${group}.`;
    const told =
      others.length === 0
        ? opened
        : `${opened} To move to it, use its button on the post or \`/group join\`.` +
          (users.length === 0 ? '' : `\n${users.map((id) => `<@${id}>`).join(' ')}`);
    const fits = told.length <= LIMITS.content;
    await this.options.gateway.sendMessage(postId, {
      content: fits ? told : opened,
      mention: { users: fits ? users : [] },
    });
  }

  /** Sends what is waiting and waits for what is on its way. For shutdown and for tests. */
  async flush(): Promise<void> {
    const { lines } = this.options;
    do {
      await lines.flush();
      await Promise.all(this.background);
    } while (lines.pending > 0 || this.background.size > 0);
  }
}
```

Create `src/services/party-lines.ts`:

```ts
import type { PartyGateway } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import { LIMITS } from '../render/text.js';
import { Coalescer } from './coalescer.js';

export interface PartyLinesOptions {
  gateway: PartyGateway;
  /** Whether a post still belongs to an active party; lines for one that does not are dropped. */
  active: (postId: string) => boolean;
  log: Logger;
  /** How long the lines of one post are gathered into one message. Default two seconds. */
  delayMs?: number;
}

interface Line {
  text: string;
  /** A later line with the same key takes this one's place while it has not been sent. */
  key?: string;
}

/**
 * What the bot says in a party's post about what happened there ("<@id> is coming."), in lines
 * that ping nobody. The first line after a quiet time goes out at once; lines that follow within
 * the delay are gathered into one message. A line can have a key: of several unsent lines with
 * one key only the newest is said, in the place of the first, so a member who presses +1 five
 * times is one line with the final count.
 */
export class PartyLines {
  private readonly waiting = new Map<string, Line[]>();
  private readonly speaker: Coalescer<string>;

  constructor(private readonly options: PartyLinesOptions) {
    this.speaker = new Coalescer({
      delayMs: options.delayMs ?? 2_000,
      work: (postId) => this.speak(postId),
      onError: (err, post) => options.log.warn({ err, post }, 'could not post a party line'),
    });
  }

  /** Adds a line to what is said next in this post. Returns at once. */
  say(postId: string, text: string, key?: string): void {
    const lines = this.waiting.get(postId) ?? [];
    const earlier = key === undefined ? undefined : lines.find((line) => line.key === key);
    if (earlier) earlier.text = text;
    else lines.push({ text, ...(key === undefined ? {} : { key }) });
    this.waiting.set(postId, lines);
    this.speaker.request(postId);
  }

  /** Sends the lines gathered for a post as one message, or as few as they fit into. */
  private async speak(postId: string): Promise<void> {
    const lines = this.waiting.get(postId) ?? [];
    this.waiting.delete(postId);
    // A message into the post of a party that has ended would open an archived post again.
    if (!this.options.active(postId)) return;
    let content = '';
    for (const { text } of lines) {
      if (content !== '' && content.length + 1 + text.length > LIMITS.content) {
        await this.options.gateway.sendMessage(postId, { content });
        content = '';
      }
      content = content === '' ? text : `${content}\n${text}`;
    }
    if (content !== '') await this.options.gateway.sendMessage(postId, { content });
  }

  /** Sends what is waiting. For shutdown and for tests. */
  async flush(): Promise<void> {
    await this.speaker.flush();
  }

  /** Posts with a message waiting or on its way. */
  get pending(): number {
    return this.speaker.pending;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/services/attendance-service.test.ts src/services/party-lines.test.ts`
Expected: PASS (2 files).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app-context.ts src/app.ts src/services/attendance-service.test.ts src/services/attendance-service.ts src/services/party-lines.test.ts src/services/party-lines.ts test/support/fake-gateway.ts test/support/party-service.ts test/support/test-context.ts
npm run check
git add src/app-context.ts src/app.ts src/services/attendance-service.test.ts src/services/attendance-service.ts src/services/party-lines.test.ts src/services/party-lines.ts test/support/fake-gateway.ts test/support/party-service.ts test/support/test-context.ts
git commit -m "PartyLines and AttendanceService: sign-ups, completion and groups, said in the post" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,583 unit tests.

---

### Task 5: The buttons of a post, the attendance commands and /group

**Files:**
- Create: `src/commands/parties/attendance.test.ts`, `src/commands/parties/attendance.ts`, `src/commands/parties/group.ts`, `src/commands/parties/reply.ts`, `src/components/party.test.ts`, `src/components/party.ts`
- Modify: `src/commands/index.ts`, `src/components/index.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4; `requireGuild`, `requireParty`, `partyOf`, `commandGroup`, `STALE_COMPONENT`, `UserError`.
- Produces: `src/commands/parties/reply.ts`: `PARTY_OVER`, `actingMember(interaction)`, `commandParty(interaction, ctx)`, `answerOutcome(interaction, ctx, outcome, words?)`, `doneWords(ok)`, `remoteWords(ok)`, `moreWords(ok)`, `ACTION_THROTTLE` (30 a minute). `src/components/party.ts`: `partyButtons` (kind `party`, `guards: [requireGuild]`, `throttle: { uses: 30, perSeconds: 60 }`, `button`). `src/commands/parties/attendance.ts`: `join`, `maybe`, `here`, `notHere`, `done`, `leave`, `remote`, `local` (each with `guards: [requireParty]`, `throttle: ACTION_THROTTLE`, category `basic-raid`). `src/commands/parties/group.ts`: `group` (`join letter`, `new`, `label [text]`).

The handlers answer with `interaction.reply` themselves, right after the store's write (no deferral: the write is local and fast, and the messages in the post are sent on the side).

- [ ] **Step 1: Write the failing tests**

Create `src/commands/parties/attendance.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { endParty } from '../../domain/party/tick.js';
import { PartyStatus } from '../../domain/party/status.js';
import type { RaidReport } from '../../services/party-service.js';
import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
import { group } from './group.js';

const all: CommandModule[] = [join, maybe, here, notHere, done, leave, remote, local, group];

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, []);
  /** A command used in the raid's post, by Alice unless said otherwise. */
  const run = async (
    commandName: string,
    options: Record<string, string | number> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName,
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      displayName: 'Alice',
      roleNames: ['Valor'],
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const answer = async (
    commandName: string,
    options?: Record<string, string | number>,
    extra?: object,
  ) => sent((await run(commandName, options, extra)).reply).content;
  const alice = () => attendeeOf(made.current(), ALICE);
  return { ...made, ctx, run, answer, alice };
}

describe('the attendance commands', () => {
  it('/join signs the member up as coming, privately, and notes name and team', async () => {
    const made = await setup();
    const used = await made.run('join');
    expect(used.reply).toHaveBeenCalledWith({
      content: 'You are coming.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.alice()).toMatchObject({
      status: PartyStatus.Coming,
      name: 'Alice',
      team: 'valor',
    });
    await made.attendance.flush();
    expect(made.said()).toEqual([`<@${ALICE}> is coming.`]);
  });

  it('takes a head count that includes the member, and refuses one that is too large', async () => {
    const made = await setup();
    expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
    expect(await made.answer('here')).toBe('You are here with 2 more.');
    expect(await made.answer('maybe', { count: 1 })).toBe('You are interested.');
    expect(await made.answer('join', { count: 22 })).toBe(
      'Give the number of trainers including yourself, from 1 to 21.',
    );
    expect(made.alice()).toMatchObject({ status: PartyStatus.Interested, number: 1 });
  });

  it('takes a group, and refuses one the raid does not have', async () => {
    const made = await setup();
    expect(await made.answer('join', { group: 'B' })).toBe('This raid has no such group.');
    await made.run('group', {}, { subcommand: 'new', userId: BOB });
    expect(await made.answer('join', { group: 'A' })).toBe('You are coming, in group A.');
    // Without a group, a member stays where they are; a new member lands in the newest group.
    expect(await made.answer('here')).toBe('You are here, in group A.');
    expect(await made.answer('maybe', {}, { userId: CAROL })).toBe(
      'You are interested, in group B.',
    );
  });

  it('/remote and /local keep the status of an attendee and sign up anybody else as interested', async () => {
    const made = await setup();
    expect(await made.answer('remote')).toBe('You are interested, remotely.');
    await made.run('join');
    expect(await made.answer('local', { count: 2 })).toBe('You are coming with 1 more, in person.');
    expect(await made.answer('remote')).toBe('You are coming with 1 more, remotely.');
  });

  it('/remote is refused on an elite raid', async () => {
    const made = await setup({ tier: { level: 'Elite', shadow: false } });
    expect(await made.answer('remote')).toBe('Elite raids can only be done in person.');
  });

  it('/not-here and /leave are for attendees', async () => {
    const made = await setup();
    expect(await made.answer('not-here')).toBe('You are not signed up for this raid.');
    expect(await made.answer('leave')).toBe('You are not signed up for this raid.');
    await made.run('here');
    expect(await made.answer('not-here')).toBe('You are interested.');
    expect(await made.answer('leave')).toBe('You have left this raid.');
    expect(made.alice()).toBeUndefined();
  });

  it('/done is refused for an egg and for somebody who is not signed up', async () => {
    const egg = await setup();
    await egg.run('join');
    expect(await egg.answer('done')).toBe('This raid has not hatched yet.');
    const hatched = await setup({ boss: { key: 'yveltal' } });
    expect(await hatched.answer('done')).toBe('You are not signed up for this raid.');
  });

  it('/done completes the raid and says whether others were asked', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.run('here');
    expect(await made.answer('done')).toBe('You are done.');
    expect(await made.answer('done')).toBe('You were done already.');
    await made.run('here');
    await made.run('here', {}, { userId: BOB });
    expect(await made.answer('done')).toBe(
      'You are done. I have asked the others of your group who are here whether they are too.',
    );
  });

  it('works only in the post of an active raid', async () => {
    const made = await setup();
    const elsewhere = { channelId: WEST_CHANNEL, thread: undefined };
    for (const command of all) {
      const extra = command === group ? { ...elsewhere, subcommand: 'new' } : elsewhere;
      expect(await made.answer(command.data.name, {}, extra)).toBe(
        'Use this in the post of a raid that is still active.',
      );
    }
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    expect(await made.answer('join')).toBe('Use this in the post of a raid that is still active.');
  });

  it('holds back a member who uses one command more than thirty times a minute', async () => {
    const made = await setup();
    for (let n = 0; n < 30; n++) await made.run(n % 2 === 0 ? 'join' : 'maybe');
    expect(await made.answer('join')).toBe('You are coming.');
    for (let n = 0; n < 14; n++) await made.run('join');
    expect(await made.answer('join')).toMatch(/^You can use \/join again in /);
    expect(await made.answer('maybe')).toBe('You are interested.');
  });

  it('files every one of them under the raid basics, with a description of what it does', () => {
    for (const command of all) {
      expect(command.help.category).toBe('basic-raid');
      expect(command.help.details).toBeTruthy();
      expect(command.data.toJSON().description.length).toBeGreaterThan(10);
    }
  });
});

describe('/group', () => {
  it('new opens a group and moves the member into it', async () => {
    const made = await setup();
    expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
      'You opened group B and are in it.',
    );
    expect(made.alice()).toMatchObject({ group: 'B', status: PartyStatus.Coming });
    expect(made.current().groups.map((g) => g.id)).toEqual(['A', 'B']);
  });

  it('new is refused when there are five groups', async () => {
    const made = await setup();
    for (let n = 0; n < 4; n++) await made.run('group', {}, { subcommand: 'new' });
    expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
      'A raid cannot have more than five groups.',
    );
  });

  it('join moves the member, and signs up somebody new as coming', async () => {
    const made = await setup();
    await made.run('group', {}, { subcommand: 'new', userId: BOB });
    expect(await made.answer('group', { letter: 'A' }, { subcommand: 'join' })).toBe(
      'You are coming, in group A.',
    );
    expect(await made.answer('group', { letter: 'B' }, { subcommand: 'join' })).toBe(
      'You are coming, in group B.',
    );
    expect(await made.answer('group', { letter: 'E' }, { subcommand: 'join' })).toBe(
      'This raid has no such group.',
    );
  });

  it('label names the group of the member and removes the name without a text', async () => {
    const made = await setup();
    expect(await made.answer('group', { text: 'x' }, { subcommand: 'label' })).toBe(
      'You are not signed up for this raid.',
    );
    await made.run('join');
    expect(await made.answer('group', { text: 'by the *fountain*' }, { subcommand: 'label' })).toBe(
      'Your group is now group A (by the \\*fountain\\*).',
    );
    expect(made.current().groups[0]?.label).toBe('by the *fountain*');
    expect(await made.answer('group', {}, { subcommand: 'label' })).toBe(
      'Group A has no name any more.',
    );
    expect(made.current().groups[0]).toEqual({ id: 'A' });
  });
});
```

Create `src/components/party.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeButton,
  fakeModal,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { RaidReport } from '../services/party-service.js';
import { partyButtons } from './party.js';

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [], [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  /** A click on a button of the post, by Alice (of team Mystic) unless said otherwise. */
  const click = (action: string, extra: object = {}) =>
    handle(
      fakeButton({
        customId: `party:${made.party.id}:${action}`,
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
        roleNames: ['Mystic'],
        ...extra,
      }),
    );
  const alice = () => attendeeOf(made.current(), ALICE);
  return { ...made, ctx, router, handle, click, alice };
}

const privately = (content: string) => ({ content, flags: MessageFlags.Ephemeral });

describe('the buttons of a party post', () => {
  it('Join signs the member up as coming, with name and team, and answers privately', async () => {
    const made = await setup();
    const click = await made.click('join');
    expect(click.reply).toHaveBeenCalledWith(privately('You are coming.'));
    expect(made.alice()).toMatchObject({
      status: PartyStatus.Coming,
      number: 1,
      name: 'Alice',
      team: 'mystic',
    });
    await made.attendance.flush();
    expect(made.said()).toEqual([`<@${ALICE}> is coming.`]);
  });

  it('Interested and Here set those statuses', async () => {
    const made = await setup();
    expect(sent((await made.click('maybe')).reply).content).toBe('You are interested.');
    expect(sent((await made.click('here')).reply).content).toBe('You are here.');
    expect(made.alice()?.status).toBe(PartyStatus.Present);
  });

  it('+1 from somebody who is not signed up marks them interested; -1 never goes below one', async () => {
    const made = await setup();
    expect(sent((await made.click('more')).reply).content).toBe('You are interested.');
    expect(sent((await made.click('more')).reply).content).toBe('You are interested with 1 more.');
    await made.click('less');
    expect(sent((await made.click('less')).reply).content).toBe('You are interested.');
    expect(made.alice()?.number).toBe(1);
    const stranger = await made.click('less', { userId: BOB });
    expect(sent(stranger.reply).content).toBe('You are not signed up for this raid.');
  });

  it('the remote button switches between remote and in person', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('remote')).reply).content).toBe('You are coming, remotely.');
    expect(sent((await made.click('remote')).reply).content).toBe('You are coming, in person.');
  });

  it('+1 at the most a member may bring says so', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming, { number: 21 });
    const click = await made.click('more');
    expect(sent(click.reply).content).toBe(
      'You are coming with 20 more. That is the most one member may bring.',
    );
  });

  it('refuses remote on an elite raid, should the button be there from before', async () => {
    const made = await setup({ tier: { level: 'Elite', shadow: false } });
    const click = await made.click('remote');
    expect(click.reply).toHaveBeenCalledWith(privately('Elite raids can only be done in person.'));
    expect(made.alice()).toBeUndefined();
  });

  it('Leave removes the member, and says so to one who was not signed up', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('leave')).reply).content).toBe('You have left this raid.');
    expect(made.alice()).toBeUndefined();
    expect(sent((await made.click('leave')).reply).content).toBe(
      'You are not signed up for this raid.',
    );
  });

  it('Done is refused for an egg', async () => {
    const made = await setup();
    await made.click('join');
    const click = await made.click('done');
    expect(click.reply).toHaveBeenCalledWith(privately('This raid has not hatched yet.'));
    expect(made.alice()?.status).toBe(PartyStatus.Coming);
  });

  it('Done completes the raid for the member and asks the others who are here', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.click('here');
    await made.click('here', { userId: BOB, displayName: 'Bob', roleNames: [] });
    const done = await made.click('done');
    expect(sent(done.reply).content).toBe(
      'You are done. I have asked the others of your group who are here whether they are too.',
    );
    await made.attendance.flush();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
    expect(sent((await made.click('done')).reply).content).toBe('You were done already.');

    const yes = await made.click('answer:yes', { userId: BOB });
    expect(sent(yes.reply).content).toBe('You are done.');
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    const again = await made.click('answer:no', { userId: BOB });
    expect(sent(again.reply).content).toBe('You were not asked, or you have answered already.');
  });

  it('"Not yet" puts a member who was asked back to here', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.click('here');
    await made.click('here', { userId: BOB });
    await made.click('done');
    const no = await made.click('answer:no', { userId: BOB });
    expect(sent(no.reply).content).toBe('You are here.');
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
  });

  it('a group button moves the member and names the group in the answer', async () => {
    const made = await setup();
    await made.attendance.newGroup(made.party.id, { id: REPORTER });
    expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
    expect(sent((await made.click('group:B')).reply).content).toBe('You are coming, in group B.');
    expect(made.alice()?.group).toBe('B');
    // A button from before, for a group this raid does not have.
    expect(sent((await made.click('group:D')).reply).content).toBe('This raid has no such group.');
  });

  it('works from any channel: the party is the one the control names', async () => {
    const made = await setup();
    const click = await made.click('join', { channelId: '600000000000000099' });
    expect(sent(click.reply).content).toBe('You are coming.');
  });

  it('answers a control of a raid that has ended', async () => {
    const made = await setup();
    const click = await made.handle(
      fakeButton({ customId: 'party:00000000-0000-4000-8000-00000000ffff:join', userId: ALICE }),
    );
    expect(click.reply).toHaveBeenCalledWith(privately('This raid is over.'));
  });

  it('answers what it does not know as no longer active', async () => {
    const made = await setup();
    for (const action of ['explode', 'group', 'group:Z', 'answer', 'answer:perhaps']) {
      const click = await made.click(action);
      expect(sent(click.reply).content).toBe(STALE_COMPONENT);
    }
    const menu = await made.handle(
      fakeSelect({ customId: `party:${made.party.id}:group`, userId: ALICE, values: ['A'] }),
    );
    expect(sent(menu.reply).content).toBe(STALE_COMPONENT);
    const form = await made.handle(fakeModal({ customId: `party:${made.party.id}:join` }));
    expect(sent(form.reply).content).toBe(STALE_COMPONENT);
    expect(made.alice()).toBeUndefined();
  });

  it('works only in a server', async () => {
    const made = await setup();
    const click = await made.click('join', { isDm: true });
    expect(sent(click.reply).content).toBe('This only works in a server.');
    expect(made.alice()).toBeUndefined();
  });

  it('holds back a member who clicks more than thirty times a minute', async () => {
    const made = await setup();
    for (let n = 0; n < 30; n++) await made.click(n % 2 === 0 ? 'more' : 'less');
    const click = await made.click('more');
    expect(sent(click.reply).content).toMatch(/^That was a lot of clicks\. Try again in /);
    const other = await made.click('join', { userId: BOB });
    expect(sent(other.reply).content).toBe('You are coming.');
  });
});
```

Run: `npx vitest run --project unit src/commands/parties/attendance.test.ts src/components/party.test.ts`
Expected: FAIL (the modules of `src/commands/parties` and `src/components/party.js` cannot be found).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -1,7 +1,22 @@
 import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
+import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
+import { group } from './parties/group.js';
 import { raid } from './raids/raid.js';
 import { help } from './util/help.js';
 
 /** Every slash command. The router and the deploy script both read this list. */
-export const commands: readonly CommandModule[] = [help, raid, admin];
+export const commands: readonly CommandModule[] = [
+  help,
+  raid,
+  join,
+  maybe,
+  here,
+  notHere,
+  done,
+  leave,
+  remote,
+  local,
+  group,
+  admin,
+];
```

Create `src/commands/parties/attendance.ts`:

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { requireParty } from '../../discord/guards.js';
import type { AttendanceOptions } from '../../domain/party/attendance.js';
import { GROUP_IDS, isGroupId } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import {
  ACTION_THROTTLE,
  actingMember,
  answerOutcome,
  commandParty,
  doneWords,
  remoteWords,
} from './reply.js';

/** The commands of this file do what the buttons of a post do; these add a head count and a group. */
function withCountAndGroup(name: string, description: string): SlashCommandBuilder {
  const builder = new SlashCommandBuilder().setName(name).setDescription(description);
  builder
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('How many trainers you are, yourself included')
        .setMinValue(1),
    )
    .addStringOption((option) =>
      option
        .setName('group')
        .setDescription('The group to be in, when the raid has several')
        .addChoices(GROUP_IDS.map((id) => ({ name: `Group ${id}`, value: id }))),
    );
  return builder;
}

/** The head count and the group a member gave with a command; what was left out stays as it is. */
function countAndGroup(
  interaction: ChatInputCommandInteraction,
): Omit<AttendanceOptions, 'remote'> {
  const number = interaction.options.getInteger('count');
  const group = interaction.options.getString('group');
  return {
    ...(number === null ? {} : { number }),
    ...(group !== null && isGroupId(group) ? { group } : {}),
  };
}

const IN_A_POST = 'Use it in the post of the raid.';

function signUpCommand(
  name: string,
  description: string,
  status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
  details: string,
): SimpleCommand {
  return {
    data: withCountAndGroup(name, description),
    help: {
      category: 'basic-raid',
      details: `${details} ${IN_A_POST} The same as the button on the post, with a head count and a group if you like.`,
      examples: [`/${name}`, `/${name} count:3`],
    },
    guards: [requireParty],
    throttle: ACTION_THROTTLE,
    async execute(interaction: ChatInputCommandInteraction, ctx: AppContext) {
      const party = commandParty(interaction, ctx);
      const outcome = await ctx.attendance.signUp(
        party.id,
        actingMember(interaction),
        status,
        countAndGroup(interaction),
      );
      await answerOutcome(interaction, ctx, outcome);
    },
  };
}

function remoteCommand(name: string, description: string, remote: boolean): SimpleCommand {
  return {
    data: withCountAndGroup(name, description),
    help: {
      category: 'basic-raid',
      details:
        `${description}. Your status stays as it is; if you were not signed up, you are marked ` +
        `as interested. ${IN_A_POST}`,
      examples: [`/${name}`],
    },
    guards: [requireParty],
    throttle: ACTION_THROTTLE,
    async execute(interaction: ChatInputCommandInteraction, ctx: AppContext) {
      const party = commandParty(interaction, ctx);
      const outcome = await ctx.attendance.setRemote(
        party.id,
        actingMember(interaction),
        remote,
        countAndGroup(interaction),
      );
      await answerOutcome(interaction, ctx, outcome, remoteWords);
    },
  };
}

export const maybe = signUpCommand(
  'maybe',
  'Say that you are interested in this raid',
  PartyStatus.Interested,
  'Marks you as interested.',
);

export const join = signUpCommand(
  'join',
  'Say that you are coming to this raid',
  PartyStatus.Coming,
  'Marks you as coming.',
);

export const here = signUpCommand(
  'here',
  'Say that you have arrived at this raid',
  PartyStatus.Present,
  'Marks you as here.',
);

export const remote = remoteCommand(
  'remote',
  'Say that you take part with a remote raid pass',
  true,
);

export const local = remoteCommand('local', 'Say that you take part in person', false);

export const notHere: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('not-here')
    .setDescription('Say that you are not at this raid after all'),
  help: {
    category: 'basic-raid',
    details: `Marks you as interested again after you said you were here. ${IN_A_POST}`,
  },
  guards: [requireParty],
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.notHere(party.id, actingMember(interaction));
    await answerOutcome(interaction, ctx, outcome);
  },
};

export const leave: SimpleCommand = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Take yourself off this raid'),
  help: { category: 'basic-raid', details: `Removes you from the raid. ${IN_A_POST}` },
  guards: [requireParty],
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.leave(party.id, actingMember(interaction));
    await answerOutcome(interaction, ctx, outcome, () => 'You have left this raid.');
  },
};

export const done: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('done')
    .setDescription('Say that you have completed this raid'),
  help: {
    category: 'basic-raid',
    details:
      'Marks you as done. The others of your group who are here are asked whether they are done ' +
      `too; without an answer they count as done after a few minutes. ${IN_A_POST}`,
  },
  guards: [requireParty],
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.done(party.id, actingMember(interaction));
    await answerOutcome(interaction, ctx, outcome, doneWords);
  },
};
```

Create `src/commands/parties/group.ts`:

```ts
import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { requireParty } from '../../discord/guards.js';
import { MAX_GROUP_LABEL } from '../../domain/party/attendance.js';
import { GROUP_IDS, groupOf, isGroupId } from '../../domain/party/party.js';
import { groupWords } from '../../render/party-controls.js';
import { ACTION_THROTTLE, actingMember, answerOutcome, commandParty } from './reply.js';

const joinGroup: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('join')
    .setDescription('Move to another group of this raid')
    .addStringOption((option) =>
      option
        .setName('letter')
        .setDescription('The group')
        .setRequired(true)
        .addChoices(GROUP_IDS.map((id) => ({ name: `Group ${id}`, value: id }))),
    ),
  help: {
    details:
      'Moves you to that group; if you were not signed up, you are marked as coming. The same ' +
      'as the group buttons on the post.',
    examples: ['/group join letter:B'],
  },
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const letter = interaction.options.getString('letter', true);
    if (!isGroupId(letter)) throw new UserError('This raid has no such group.');
    const outcome = await ctx.attendance.joinGroup(party.id, actingMember(interaction), letter);
    await answerOutcome(interaction, ctx, outcome);
  },
};

const newGroup: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('new')
    .setDescription('Open another group for this raid and move to it'),
  help: {
    details:
      'For a raid with more trainers than one lobby holds, or for trainers who want another ' +
      'time. Later sign-ups land in the newest group. A raid has at most five groups.',
  },
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.newGroup(party.id, actingMember(interaction));
    await answerOutcome(
      interaction,
      ctx,
      outcome,
      (ok) => `You opened group ${ok.group} and are in it.`,
    );
  },
};

const labelGroup: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('label')
    .setDescription('Give your group a name, such as where it meets')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('The name; leave it out to remove the name')
        .setMaxLength(MAX_GROUP_LABEL),
    ),
  help: { examples: ['/group label text:by the fountain'] },
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const text = interaction.options.getString('text') ?? '';
    const outcome = await ctx.attendance.labelGroup(party.id, actingMember(interaction), text);
    await answerOutcome(interaction, ctx, outcome, (ok) => {
      const group = groupOf(ok.party, ok.group);
      return group?.label
        ? `Your group is now ${groupWords(group)}.`
        : `Group ${ok.group} has no name any more.`;
    });
  },
};

/** `/group`: the groups of a raid. */
export const group = commandGroup({
  data: new SlashCommandBuilder().setName('group').setDescription('The groups of this raid'),
  help: {
    category: 'basic-raid',
    details: 'Use it in the post of the raid.',
  },
  guards: [requireParty],
  parts: [joinGroup, newGroup, labelGroup],
});
```

Create `src/commands/parties/reply.ts`:

```ts
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import { partyOf } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import type { Attendee, Party } from '../../domain/party/party.js';
import { problemText, standingReply } from '../../render/activity.js';
import type { AttendanceOutcome, Member } from '../../services/attendance-service.js';

export const PARTY_OVER = 'This raid is over.';

/**
 * How often one member may act on parties: per minute, for the buttons of a post together and
 * for each command by itself. Every action writes to the database and says a line in the post.
 */
export const ACTION_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };

/** The member who made an interaction, as the attendance service wants them. */
export function actingMember(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
): Member {
  return { id: interaction.user.id, ...memberInfo(interaction) };
}

/**
 * The party of the post a command was used in. The guard `requireParty` has checked it, but the
 * party can end between the guard and the handler.
 */
export function commandParty(interaction: ChatInputCommandInteraction, ctx: AppContext): Party {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(PARTY_OVER);
  return party;
}

type Ok<Extra> = Extract<AttendanceOutcome<Extra>, { kind: 'ok' }>;

/**
 * Tells the member, privately, what came of their action: how they stand now, or what `words`
 * makes of the outcome. A refusal and a party that has ended are thrown as `UserError`s, which
 * the router shows the same way.
 */
export async function answerOutcome<Extra>(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  ctx: AppContext,
  outcome: AttendanceOutcome<Extra>,
  words?: (ok: Ok<Extra>) => string | undefined,
): Promise<void> {
  if (outcome.kind === 'gone') throw new UserError(PARTY_OVER);
  if (outcome.kind === 'refused') {
    throw new UserError(problemText(outcome.reason, ctx.attendance.limits()));
  }
  const ok = outcome as Ok<Extra>;
  const content =
    words?.(ok) ??
    (ok.attendee ? standingReply(ok.party, ok.attendee) : 'You are not signed up for this raid.');
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/** What the remote switch answers: "in person" is said, or switching it off would say nothing. */
export function remoteWords(ok: {
  party: Party;
  attendee: Attendee | undefined;
}): string | undefined {
  return ok.attendee && standingReply(ok.party, ok.attendee, { sayInPerson: true });
}

/** What +1 answers: a click that changed nothing has met the most one member may bring. */
export function moreWords(ok: {
  party: Party;
  attendee: Attendee | undefined;
  acted: boolean;
}): string | undefined {
  if (ok.acted || !ok.attendee) return undefined;
  return `${standingReply(ok.party, ok.attendee)} That is the most one member may bring.`;
}

/** What Done answers: whether the others were asked, or that nothing changed. */
export function doneWords(ok: { asked: string[]; wasComplete: boolean }): string {
  if (ok.wasComplete) return 'You were done already.';
  return ok.asked.length === 0
    ? 'You are done.'
    : 'You are done. I have asked the others of your group who are here whether they are too.';
}
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,5 +1,6 @@
 import { raidControls } from '../commands/raids/raid.js';
 import type { ComponentHandler } from '../discord/command.js';
+import { partyButtons } from './party.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
-export const components: readonly ComponentHandler[] = [raidControls];
+export const components: readonly ComponentHandler[] = [raidControls, partyButtons];
```

Create `src/components/party.ts`:

```ts
import {
  ACTION_THROTTLE,
  actingMember,
  answerOutcome,
  doneWords,
  moreWords,
  remoteWords,
} from '../commands/parties/reply.js';
import type { ComponentHandler } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { requireGuild } from '../discord/guards.js';
import { STALE_COMPONENT } from '../discord/router.js';
import { isGroupId } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { isPartyAction, PARTY_KIND } from '../render/party-controls.js';

/**
 * The controls of a party's post (spec 4.1): its buttons, and the two answers under a completion
 * question. The party is named by the custom id, not by the channel, so the same controls work
 * on a copy of the message in another channel. Every click is answered privately; what it
 * changed is said in the post by the attendance service.
 *
 * The throttle is one budget for all of them: generous for somebody adjusting a head count,
 * tight for somebody leaning on a button. It also holds back an answer to the completion
 * question from a member who has just used it up.
 */
export const partyButtons: ComponentHandler = {
  kind: PARTY_KIND,
  guards: [requireGuild],
  throttle: ACTION_THROTTLE,

  async button(interaction, id, ctx) {
    const { attendance } = ctx;
    const member = actingMember(interaction);
    const partyId = id.id;
    if (!isPartyAction(id.action)) throw new UserError(STALE_COMPONENT);
    switch (id.action) {
      case 'maybe':
        return answerOutcome(
          interaction,
          ctx,
          await attendance.signUp(partyId, member, PartyStatus.Interested),
        );
      case 'join':
        return answerOutcome(
          interaction,
          ctx,
          await attendance.signUp(partyId, member, PartyStatus.Coming),
        );
      case 'here':
        return answerOutcome(
          interaction,
          ctx,
          await attendance.signUp(partyId, member, PartyStatus.Present),
        );
      case 'done':
        return answerOutcome(interaction, ctx, await attendance.done(partyId, member), doneWords);
      case 'leave':
        return answerOutcome(
          interaction,
          ctx,
          await attendance.leave(partyId, member),
          () => 'You have left this raid.',
        );
      case 'less':
        return answerOutcome(interaction, ctx, await attendance.changeNumber(partyId, member, -1));
      case 'more':
        return answerOutcome(
          interaction,
          ctx,
          await attendance.changeNumber(partyId, member, 1),
          moreWords,
        );
      case 'remote':
        return answerOutcome(
          interaction,
          ctx,
          await attendance.setRemote(partyId, member, 'toggle'),
          remoteWords,
        );
      case 'group': {
        const [group] = id.args;
        if (group === undefined || !isGroupId(group)) throw new UserError(STALE_COMPONENT);
        return answerOutcome(interaction, ctx, await attendance.joinGroup(partyId, member, group));
      }
      case 'answer': {
        const [answer] = id.args;
        if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
        return answerOutcome(
          interaction,
          ctx,
          await attendance.answer(partyId, member, answer === 'yes'),
        );
      }
    }
  },
};
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/attendance.test.ts src/components/party.test.ts`
Expected: PASS (2 files).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/index.ts src/commands/parties/attendance.test.ts src/commands/parties/attendance.ts src/commands/parties/group.ts src/commands/parties/reply.ts src/components/index.ts src/components/party.test.ts src/components/party.ts
npm run check
git add src/commands/index.ts src/commands/parties/attendance.test.ts src/commands/parties/attendance.ts src/commands/parties/group.ts src/commands/parties/reply.ts src/components/index.ts src/components/party.test.ts src/components/party.ts
git commit -m "Party posts: the buttons work; /join /maybe /here /not-here /done /leave /remote /local /group" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,614 unit tests.

---

### Task 6: The reporter's name and team

**Files:**
- Modify: `src/commands/raids/raid.test.ts`, `src/commands/raids/raid.ts`, `src/services/party-service.test.ts`, `src/services/party-service.ts`

**Interfaces:**
- Consumes: Task 1 (`noteMember`), Task 3 (`memberInfo`), `PartyService.reportRaid`, `/raid`.
- Produces: `RaidReport.reporter?: MemberInfo`: stored with the reporter's attendee record when the report signs them up (a new raid, or an existing one they were not on).

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/raids/raid.test.ts`:

```diff
--- a/src/commands/raids/raid.test.ts
+++ b/src/commands/raids/raid.test.ts
@@ -68,6 +68,15 @@ describe('/raid', () => {
     vi.useRealTimers();
   });
 
+  it('notes the name and the team of the reporter with their sign-up', async () => {
+    const { run, store } = await setup();
+    await run({ boss: 'e:T5:0', gym: 'g:1' }, { displayName: 'Rhea', roleNames: ['Instinct'] });
+    const [party] = store.active();
+    expect(Object.values(party?.attendees ?? {})).toMatchObject([
+      { name: 'Rhea', team: 'instinct' },
+    ]);
+  });
+
   it('reports an egg picked from the lists, with its hatch time, and links the post', async () => {
     const { run, store, gateway } = await setup();
     const interaction = await run({ boss: 'e:T5:0', gym: 'g:1', time: '30' });
```

Apply to `src/services/party-service.test.ts`:

```diff
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -44,6 +44,36 @@ function report(extra: Partial<RaidReport> = {}): RaidReport {
 }
 
 describe('PartyService.reportRaid', () => {
+  it('notes the name and team of a reporter who is signed up, for a new raid and an existing one', async () => {
+    const { service, store } = await partyServiceWith();
+    const first = await service.reportRaid(report({ reporter: { name: 'Rhea', team: 'valor' } }));
+    if (first.kind !== 'created') throw new Error(first.kind);
+    expect(store.get(first.party.id)?.attendees[REPORTER]).toMatchObject({
+      name: 'Rhea',
+      team: 'valor',
+    });
+    const second = await service.reportRaid(
+      report({ reporterId: ALICE, reporter: { name: 'Alice' }, autoStatus: PartyStatus.Coming }),
+    );
+    expect(second).toMatchObject({ kind: 'exists', joined: true });
+    expect(store.get(first.party.id)?.attendees[ALICE]).toMatchObject({ name: 'Alice' });
+    // A second report by somebody who is signed up changes nothing of theirs.
+    await service.reportRaid(report({ reporter: { name: 'Other', team: 'mystic' } }));
+    expect(store.get(first.party.id)?.attendees[REPORTER]).toMatchObject({
+      name: 'Rhea',
+      team: 'valor',
+    });
+  });
+
+  it('notes nothing for a reporter whose automatic status signs nobody up', async () => {
+    const { service, store } = await partyServiceWith();
+    const outcome = await service.reportRaid(
+      report({ autoStatus: PartyStatus.NotInterested, reporter: { name: 'Rhea' } }),
+    );
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    expect(store.get(outcome.party.id)?.attendees).toEqual({});
+  });
+
   it('stores the raid, creates its post with tags, links it in the region channel and lists it', async () => {
     const { service, store, gateway, tags, regions } = await partyServiceWith();
     regions.rows[0]!.summaryMessageId = (await gateway.createPost(WEST_FORUM, {
```

Run: `npx vitest run --project unit src/commands/raids/raid.test.ts src/services/party-service.test.ts`
Expected: FAIL (the reporter's attendee record has no name).

- [ ] **Step 2: The implementation**

Apply to `src/commands/raids/raid.ts`:

```diff
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -14,6 +14,7 @@ import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { regionChannelOf, requireRegion } from '../../discord/guards.js';
+import { memberInfo } from '../../discord/member-info.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
@@ -66,6 +67,7 @@ async function finish(
   const outcome = await ctx.partyService.reportRaid({
     gym,
     reporterId: interaction.user.id,
+    reporter: memberInfo(interaction),
     anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
     autoStatus: settings.autoStatus,
     tier: request.reported.tier,
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -9,7 +9,7 @@ import {
   type PartyGateway,
   type TagIds,
 } from '../discord/party-gateway.js';
-import { applyAutoStatus } from '../domain/party/attendance.js';
+import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import type { RaidBossRef, RaidParty } from '../domain/party/party.js';
 import { createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
 import type { PartyStatus } from '../domain/party/status.js';
@@ -48,6 +48,8 @@ export interface RaidReport {
   gym: Gym;
   /** Snowflake of the reporter. */
   reporterId: string;
+  /** The reporter's name and team, as the interaction said them, for when they are signed up. */
+  reporter?: MemberInfo;
   anonymous: boolean;
   /** The reporter's automatic status (`User.status`). */
   autoStatus: PartyStatus;
@@ -323,6 +325,7 @@ export class PartyService {
     if (report.time && 'hatch' in report.time)
       raid = setHatchTime(raid, report.time.hatch, rules, now);
     else if (report.time) raid = setEndTime(raid, report.time.end, rules, now);
+    raid = noteMember(raid, report.reporterId, report.reporter ?? {});
     // The view does not depend on the stored row, so a renderer that fails stores nothing.
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
 
@@ -335,9 +338,16 @@ export class PartyService {
         // Its creation failed and the raid is gone: report again from the start, once.
         if (!store.get(existingId) && mayRepeat) return this.report(report, false);
       }
-      const signedUp = await store.update(existingId, (party) =>
-        applyAutoStatus(party, report.reporterId, report.autoStatus),
-      );
+      const signedUp = await store.update(existingId, (party) => {
+        const applied = applyAutoStatus(party, report.reporterId, report.autoStatus);
+        // Only somebody this report signed up: an attendee's record is theirs to change.
+        return applied.joined
+          ? {
+              ...applied,
+              party: noteMember(applied.party, report.reporterId, report.reporter ?? {}),
+            }
+          : applied;
+      });
       if (signedUp?.written) this.changed(existingId);
       return {
         kind: 'exists',
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/raids/raid.test.ts src/services/party-service.test.ts`
Expected: PASS (the two test files).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/services/party-service.test.ts src/services/party-service.ts
npm run check
git add src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/services/party-service.test.ts src/services/party-service.ts
git commit -m "Raid reports: the reporter's name and team" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,617 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `npm run test:db` once, complete (the state document's second version against real MySQL).
2. Whole-branch review (Opus, high effort) of the six commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `ctx.attendance` and `AttendanceOutcome`, `PartyLines`, `memberInfo` / `noteMember`, the controls (`partyControls`, kind `party`, the party named by the custom id), `ComponentHandler.throttle`, `answerOutcome`, `reportedRaid()`.
4. `docs/superpowers/plans/phase-0-follow-ups.md`: delete what this plan did from the "Plan 2D" lists; add a "From Phase 2D-1" section. The spec (section 4.1 "as built", 5.5 state version 2), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead. The scaffolding of plan 2C is still on the test server (the forum `test-region-raids`).

- [ ] `npm run deploy-commands -- --guild <test server id>` registers the nine new commands beside `/help`, `/raid` and `/admin`.
- [ ] Report a raid with `/raid`: its post has two rows of buttons. Done on an egg answers "This raid has not hatched yet."
- [ ] Join: a private answer "You are coming.", the post lists you under Coming with your team's emoji (give yourself a role named `mystic`, `valor` or `instinct` first), and a line "<you> is coming." appears in the post without a ping.
- [ ] +1 five times quickly: two lines in the post at most (the first click and the final count); the post shows `+5`. Each click leaves a private answer: say if that is too much.
- [ ] Remote / in person: the satellite emoji appears and disappears.
- [ ] The lines in the post and the lists in the embed name members by mention without pinging: check from a second account, and on a phone, that they show names and not raw ids.
- [ ] `/group new` in the post: a third row with a button per group appears; the others are pinged by the notice; the button of group A moves you back.
- [ ] `/group label text:by the fountain`: the group's field and its button show the name.
- [ ] With a second account both Here on a hatched raid (`/raid boss:<a current boss>`), one presses Done: the other is asked in the post with two buttons; "Not yet" answers privately and the question disappears.
- [ ] `/join count:3 group:A`, `/maybe`, `/here`, `/not-here`, `/remote`, `/local`, `/leave`, `/done` each answer privately; outside a raid post each says "Use this in the post of a raid that is still active."
- [ ] A button on an old post from before a restart of the bot still works (the post need not be in the cache), also after the post was archived by Discord.
- [ ] `/help` lists the new commands under "Raid Basics".

## As built (2026-10-11)

Commits `3b49b1c`, `c61baae`, `2a93081`, `b11adc1`, `75c95cf`, `c98e90b` (Tasks 1 to 6, each equal to the prototype commit it was generated from), then `24789f7` after the whole-branch review: a member who is done cannot change count, remote or group (`already-done`); a label line has its own key; the new-group notice names as many members as fit; nothing is sent into the post of a party that has ended; the summary post is edited only when its text changed; database tests for version 2 of the state and for loading a version 1 row. 1,627 unit tests, 123 database tests. Open items: "From Phase 2D-1" in `phase-0-follow-ups.md`.
