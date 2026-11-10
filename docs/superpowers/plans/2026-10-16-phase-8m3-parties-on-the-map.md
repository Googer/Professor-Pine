# Phase 8M-3: Parties on the Map, and Joining Them: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in member of a server sees its active raids, trains and meetups on Pine's live map (except in forums they are kept out of) and presses Interested, Join, Here, Leave or Done there as on the post; a forum they could not see opens to them as signing up on a copy does; nobody is named.

**Architecture:** A pure view (`src/domain/web/party-view.ts`) of `PartyStore`'s active parties for the member asking; `PartyViewers` decides who sees what (barred forums cached a minute, a read-only grace while Discord is away); `GET /s/<guild>/api/parties` with an ETag per member; `POST …/<id>/<action>` guarded before its body is read, checked against a fresh member and `memberAccess`, then counted in the post's own throttle bucket and carried out by the post buttons' own code path (`pressStatus`, `AttendanceService`, `AccessService`); the map page polls every 20 s while visible.

**Tech Stack:** TypeScript 6.0, Fastify, Leaflet (all from 8M-1). No new package, no migration, no command change.

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` 2.5, 2.6, 3.2–3.4, 5, 6, 7, approved by Matt 2026-10-15. Ledger: `.superpowers/sdd/2026-10-16-phase-8m3-parties-on-the-map/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m3` (worktree `var/proto-8m3`, rebased onto `wayfarer` 2bf753c7), one commit per task, each typechecked (root and page) with its area's tests green; on the tip the full check (6,932 tests), the build, the userscript build and the database suite were green. An Opus review went through the whole prototype; its findings are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-16/17; ledger), for Matt to look at:

1. **One behaviour for the post and the map:** the map's presses go through the post buttons' own code path and count in the same throttle bucket per member; a raid over by the clock but not yet ended accepts presses as its post does; an ended party answers as the post's button does ("This has ended."; "This raid is over." only for Done).
2. **A refused press never counts against the throttle**, and a non-member learns nothing of a party id (403 before 409).
3. **Done is not offered on an egg** (spec 3.3), though the post shows it and refuses it.
4. **The raid view names the boss** (as the post's headline does) and leaves group labels out (members write them).
5. **Trains and meetups also get counts, the member's status and the buttons** (the spec lists them for raids; the posts have them).
6. **Who is kept out is cached a minute per member and forum** (the map polls every 20 s); joining asks `memberAccess` afresh. While Discord is away, a member confirmed in the last 30 minutes gets a read-only list from what Discord last said; anybody else nothing.
7. **The post's link is `https://discord.com/channels/<guild>/<post>`** (as the DMs link a post), and 30 list requests a minute per address.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md`, `parties-and-posts.md` and `testing.md` ("How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network.** A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Nothing names a member on the map; nothing from data reaches the page as HTML; nothing reads an ended party by id from the database (8H deletes its row).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m3`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock).
- Never `npm install`/`npm ci`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **Nobody is named and nothing leaks:** no names, ids, reporters or makers in the view; parties of barred forums, other servers and posts not yet made never listed; a non-member or logged-out visitor gets nothing.
2. **A press is the post's button:** the same code path, words, throttle bucket and forum access, granted and taken back; refused presses cost nothing.
3. **Guard order:** nothing read of the body and nothing asked of Discord before the per-address limit and `postGuard`; a fresh member and `memberAccess` before the throttle.
4. **The page stays honest:** polling only while visible, stopping on 401/403; every party at a gym clickable; the read-only line never hides a press's answer.
5. **8H:** active parties from `PartyStore` only.

---

### Task 1: Live map: the party view, what a member sees of a server's parties

Prototype commit: `29217a1027b3caef1d2a2600e461058c50cd1195`

Pure `src/domain/web/party-view.ts` (types in `party-data.ts`): from the active parties of a server, the member asking and the clock, raids (gym, picture, boss and tier words, times, counts per group, the member's own status, the post's link, the buttons that apply), trains (route, current stop) and meetups, with no names, no member ids, no reporter or maker; parties of other servers, without a post, in barred forums or over by the clock left out. `raidLook` in `raid-post.ts` gives the post's picture and boss.

**Files:**

```
 src/domain/web/party-data.ts      | 105 +++++++++++++++++++++++++++++++
 src/domain/web/party-view.test.ts | 268 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/web/party-view.ts      | 211 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/raid-post.test.ts      |  17 +++++
 src/render/raid-post.ts           |  14 +++++
 5 files changed, 615 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/render/raid-post.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/render/raid-post.test.ts src/render/raid-post.ts` and `npx eslint src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/render/raid-post.test.ts src/render/raid-post.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 29217a1027b3caef1d2a2600e461058c50cd1195 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Live map: the party view, what a member sees of a server's parties`, the paragraph above as the body and the trailer, staging exactly
  `src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/render/raid-post.test.ts src/render/raid-post.ts`.

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7eb4f3193ae03d9ce232e67acec94f19bc425f05
--- /dev/null
+++ b/src/domain/web/party-data.ts
@@ -0,0 +1,105 @@
+/**
+ * What `GET /s/<guild>/api/parties` answers (`partyView`), as the page reads it (spec 3.2). Types
+ * alone, with no import: the page's bundle (`src/web/client/`) takes them without the server's
+ * code. Nobody is named here: no member's name or id, no reporter, no maker; attendees are counts.
+ */
+
+/** The buttons of a post a member may press on the map (spec 3.3): the statuses, Leave, Done. */
+export const MAP_ACTIONS = ['interested', 'join', 'here', 'leave', 'done'] as const;
+export type MapAction = (typeof MAP_ACTIONS)[number];
+
+/** A press of a button: `join` with a group is "Join B" of a party with several groups. */
+export interface MapPress {
+  action: MapAction;
+  group?: string;
+}
+
+/** Under which status a post lists a member; the member's own status on the map too. */
+export type MapStatus = 'interested' | 'coming' | 'present' | 'complete';
+
+/** The heads of a group by status, as the post counts them (a member's +1s counted). */
+export interface GroupCounts {
+  /** The group's letter. */
+  id: string;
+  interested: number;
+  coming: number;
+  present: number;
+}
+
+/** Who comes to a party, as counts, and what the member asking may press. */
+export interface MapAttendance {
+  /** Every group of the party, in order: one for a party without groups of its own. */
+  groups: GroupCounts[];
+  /** The member's own status and group; null when they are not signed up. */
+  mine: { status: MapStatus; group: string } | null;
+  /** The buttons that apply, in the post's order; none while the map is read-only. */
+  actions: MapPress[];
+}
+
+export interface MapRaid {
+  kind: 'raid';
+  id: string;
+  /** The gym, as `/api/geo` lists it; null once the gym was deleted. */
+  gymId: number | null;
+  /** The post's picture (the egg, or the boss), only from the hosts the page may load. */
+  picture: string | null;
+  /** The tier in the posts' words: `Level 5 raid`, `Shadow Level 3 raid`. */
+  tier: string;
+  /** The boss the post names: what it is against, or what the egg hatches as. */
+  boss: string | null;
+  /** Egg or hatched, by the clock when the view was made. */
+  stage: 'egg' | 'hatched';
+  /** Epoch milliseconds; null while nobody said. */
+  hatchTime: number | null;
+  endTime: number | null;
+  /** The post on Discord (`https://discord.com/channels/…`, which opens the app). */
+  link: string;
+  attendance: MapAttendance;
+}
+
+export interface MapTrain {
+  kind: 'train';
+  id: string;
+  name: string;
+  startTime: number | null;
+  /** The gyms of its route, by id, in order. */
+  route: number[];
+  /** The index in `route` of the stop the train is at; null without a route or once finished. */
+  stop: number | null;
+  link: string;
+  attendance: MapAttendance;
+}
+
+export interface MapMeetup {
+  kind: 'meetup';
+  id: string;
+  name: string;
+  startTime: number | null;
+  endTime: number | null;
+  link: string;
+  attendance: MapAttendance;
+}
+
+/** A party of any kind, as the map shows it. */
+export type MapParty = MapRaid | MapTrain | MapMeetup;
+
+/** The active parties of a server a member may see, in the order they were made. */
+export interface PartiesView {
+  /** The zone the posts give times in (`settings.timezone`). */
+  zone: string;
+  /** Discord cannot be reached: nothing can be pressed (spec 2.5). */
+  readOnly: boolean;
+  raids: MapRaid[];
+  trains: MapTrain[];
+  meetups: MapMeetup[];
+}
+
+/** What a press answers (`POST /s/<guild>/api/parties/<id>/<action>`). */
+export interface PressAnswer {
+  /** Whether it was done; when not, `text` says why (the post's words). */
+  ok: boolean;
+  /** What the post's button would answer, as plain text. */
+  text: string;
+  /** The party as the member sees it now; null when it is over or not theirs to see. */
+  party: MapParty | null;
+}
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6816d6624d24c3059155a24fcd0c29afa6e8919c
--- /dev/null
+++ b/src/domain/web/party-view.test.ts
@@ -0,0 +1,268 @@
+import { describe, expect, it } from 'vitest';
+import { EAST_FORUM, WEST_FORUM } from '../../../test/support/gyms.js';
+import {
+  ALICE,
+  at,
+  BOB,
+  CAROL,
+  PARTY_NOW,
+  PARTY_ZONE,
+  REPORTER,
+  testMeetup,
+  testRaid,
+  testRaidRules,
+  testTrain,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import type { Party, RaidParty } from '../party/party.js';
+import { setHatchTime } from '../party/raid.js';
+import { PartyStatus } from '../party/status.js';
+import { mapParty, partyView, type PartyViewInput } from './party-view.js';
+
+const GUILD = '412345678901234567';
+const EGG_PICTURE = 'https://raw.githubusercontent.com/PokeMiners/raid_egg_2_icon.png';
+const BOSS_PICTURE = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png';
+const ORIGINS = ['https://cdn.leekduck.com', 'https://raw.githubusercontent.com'];
+
+/** A party with its post in a forum. */
+function posted<P extends Party>(party: P, forum = WEST_FORUM, post = '700000000000000001'): P {
+  return { ...party, forumChannelId: forum, forumPostId: post };
+}
+
+/** An egg at gym 1, posted, that hatches at 14:30 and ends at 15:15. */
+const egg = posted(setHatchTime(testRaid(), at('2026-10-13T14:30'), testRaidRules(), PARTY_NOW));
+
+function input(parties: readonly Party[], more: Partial<PartyViewInput> = {}): PartyViewInput {
+  return {
+    guildId: GUILD,
+    guildRow: 1,
+    parties,
+    memberId: ALICE,
+    barred: new Set(),
+    now: PARTY_NOW,
+    zone: PARTY_ZONE,
+    readOnly: false,
+    // The renderer's (`raidLook`): the egg's picture until it hatches.
+    look: (raid: RaidParty) => ({
+      picture: raid.hatchTime !== null && PARTY_NOW < raid.hatchTime ? EGG_PICTURE : BOSS_PICTURE,
+      boss: 'Yveltal',
+    }),
+    pictureOrigins: ORIGINS,
+    ...more,
+  };
+}
+
+describe('partyView', () => {
+  it('shows a raid with its gym, picture, tier, boss, times and the link to its post', () => {
+    const view = partyView(input([egg]));
+    expect(view.zone).toBe(PARTY_ZONE);
+    expect(view.readOnly).toBe(false);
+    expect(view.raids).toEqual([
+      {
+        kind: 'raid',
+        id: egg.id,
+        gymId: 1,
+        picture: EGG_PICTURE,
+        tier: 'Level 5 raid',
+        boss: 'Yveltal',
+        stage: 'egg',
+        hatchTime: at('2026-10-13T14:30'),
+        endTime: egg.endTime,
+        link: `https://discord.com/channels/${GUILD}/700000000000000001`,
+        attendance: {
+          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          mine: null,
+          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+        },
+      },
+    ]);
+    expect(view.trains).toEqual([]);
+    expect(view.meetups).toEqual([]);
+  });
+
+  it('counts heads per status and group as the post does, a +1 counted and a member asked as present', () => {
+    const raid = withAttendees(egg, {
+      [ALICE]: { status: PartyStatus.Coming, number: 3 },
+      [BOB]: { status: PartyStatus.Present, group: 'A' },
+      [CAROL]: { status: PartyStatus.CompletePending, group: 'A' },
+      '200000000000000005': { status: PartyStatus.Complete },
+    });
+    const view = partyView(input([raid]));
+    expect(view.raids[0]?.attendance.groups).toEqual([
+      { id: 'A', interested: 1, coming: 3, present: 2 },
+    ]);
+    expect(view.raids[0]?.attendance.mine).toEqual({ status: 'coming', group: 'A' });
+  });
+
+  it('gives a raid of several groups a Join for each, with Interested, Here and Leave', () => {
+    const raid = withAttendees(
+      { ...egg, groups: [{ id: 'A' }, { id: 'B', label: 'park side' }], defaultGroupId: 'B' },
+      { [ALICE]: { group: 'B' }, [BOB]: { group: 'A', status: PartyStatus.Interested } },
+    );
+    const { attendance } = partyView(input([raid])).raids[0] ?? {};
+    expect(attendance?.groups).toEqual([
+      { id: 'A', interested: 2, coming: 0, present: 0 },
+      { id: 'B', interested: 0, coming: 1, present: 0 },
+    ]);
+    expect(attendance?.mine).toEqual({ status: 'coming', group: 'B' });
+    expect(attendance?.actions).toEqual([
+      { action: 'join', group: 'A' },
+      { action: 'join', group: 'B' },
+      { action: 'interested' },
+      { action: 'here' },
+      { action: 'leave' },
+    ]);
+  });
+
+  it('offers Done once the raid has hatched, and Leave to a member signed up', () => {
+    const hatched = at('2026-10-13T14:40');
+    const view = partyView(
+      input([withAttendees(egg, { [ALICE]: { status: PartyStatus.Present } })], { now: hatched }),
+    );
+    expect(view.raids[0]).toMatchObject({ stage: 'hatched' });
+    expect(view.raids[0]?.attendance.actions).toEqual([
+      { action: 'interested' },
+      { action: 'join' },
+      { action: 'here' },
+      { action: 'done' },
+      { action: 'leave' },
+    ]);
+  });
+
+  it('offers nothing to press while the map is read-only', () => {
+    const view = partyView(input([egg], { readOnly: true }));
+    expect(view.readOnly).toBe(true);
+    expect(view.raids[0]?.attendance.actions).toEqual([]);
+  });
+
+  it('leaves out a picture from a host the page may not load', () => {
+    const view = partyView(
+      input([egg], { look: () => ({ picture: 'https://evil.example/x.png', boss: 'Yveltal' }) }),
+    );
+    expect(view.raids[0]?.picture).toBeNull();
+    const none = partyView(input([egg], { look: () => ({}) }));
+    expect(none.raids[0]).toMatchObject({ picture: null, boss: null });
+  });
+
+  it('shows a train with its route, the stop it is at, and a meetup with its times', () => {
+    const train = posted(
+      {
+        ...testTrain(),
+        timed: { name: 'Saturday legendaries', startTime: at('2026-10-13T15:00') },
+        train: { ...testTrain().train, route: [1, 2, 3], stop: 1 },
+      },
+      EAST_FORUM,
+      '700000000000000002',
+    );
+    const meetup = posted(
+      {
+        ...testMeetup(),
+        timed: { name: 'Community Day picnic', startTime: at('2026-10-13T16:00') },
+        endTime: at('2026-10-13T18:00'),
+      },
+      WEST_FORUM,
+      '700000000000000003',
+    );
+    const view = partyView(input([train, meetup]));
+    expect(view.trains).toEqual([
+      {
+        kind: 'train',
+        id: train.id,
+        name: 'Saturday legendaries',
+        startTime: at('2026-10-13T15:00'),
+        route: [1, 2, 3],
+        stop: 1,
+        link: `https://discord.com/channels/${GUILD}/700000000000000002`,
+        attendance: {
+          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          mine: null,
+          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+        },
+      },
+    ]);
+    expect(view.meetups).toEqual([
+      {
+        kind: 'meetup',
+        id: meetup.id,
+        name: 'Community Day picnic',
+        startTime: at('2026-10-13T16:00'),
+        endTime: at('2026-10-13T18:00'),
+        link: `https://discord.com/channels/${GUILD}/700000000000000003`,
+        attendance: {
+          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          mine: null,
+          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+        },
+      },
+    ]);
+    const finished = { ...train, train: { ...train.train, stop: 3 } };
+    expect(partyView(input([finished])).trains[0]?.stop).toBeNull();
+  });
+
+  it('names nobody: no reporter, maker, attendee or their ids, whatever their privacy', () => {
+    const anonymous = withAttendees(
+      { ...egg, anonymous: true, makerName: 'Rita Reporter' },
+      {
+        [ALICE]: { name: 'Alice Allswell', team: 'mystic' },
+        [BOB]: { name: 'Bob <@1> **bold**', status: PartyStatus.Present, remote: true },
+      },
+    );
+    const train = posted(
+      { ...testTrain({ anonymous: true }), makerName: 'Rita Reporter' },
+      WEST_FORUM,
+      '700000000000000002',
+    );
+    const text = JSON.stringify(partyView(input([anonymous, train], { memberId: CAROL })));
+    for (const hidden of [
+      REPORTER,
+      ALICE,
+      BOB,
+      'Rita',
+      'Alice',
+      'Bob',
+      'mystic',
+      'remote',
+      'createdBy',
+      'maker',
+      'anonymous',
+    ]) {
+      expect(text).not.toContain(hidden);
+    }
+  });
+
+  it("leaves out other servers' parties, parties without a post, forums the member is barred from, and what is over", () => {
+    const other = { ...egg, id: '00000000-0000-4000-8000-000000000009', guildId: 2 };
+    const unposted = { ...testTrain(), id: '00000000-0000-4000-8000-000000000010' };
+    const barred = posted(
+      { ...testMeetup(), id: '00000000-0000-4000-8000-000000000011' },
+      EAST_FORUM,
+      '700000000000000004',
+    );
+    const ended = { ...egg, id: '00000000-0000-4000-8000-000000000012', status: 'ended' as const };
+    const over = posted(
+      {
+        ...testMeetup(),
+        id: '00000000-0000-4000-8000-000000000013',
+        endTime: at('2026-10-13T13:00'),
+      },
+      WEST_FORUM,
+      '700000000000000005',
+    );
+    const view = partyView(
+      input([egg, other, unposted, barred, ended, over], { barred: new Set([EAST_FORUM]) }),
+    );
+    expect([...view.raids, ...view.trains, ...view.meetups].map((party) => party.id)).toEqual([
+      egg.id,
+    ]);
+    // A raid is over at its end time, whatever the store says yet.
+    expect(partyView(input([egg], { now: at('2026-10-13T15:15') })).raids).toEqual([]);
+  });
+});
+
+describe('mapParty', () => {
+  it('is the one party as the view shows it, or nothing for what the member may not see', () => {
+    expect(mapParty(egg, input([]))).toEqual(partyView(input([egg])).raids[0]);
+    expect(mapParty(egg, input([], { barred: new Set([WEST_FORUM]) }))).toBeNull();
+    expect(mapParty({ ...egg, status: 'ended' }, input([]))).toBeNull();
+  });
+});
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ac4f169b1c77e7dafa37d6ac60b1938566d5d385
--- /dev/null
+++ b/src/domain/web/party-view.ts
@@ -0,0 +1,211 @@
+import {
+  attendeeOf,
+  isRaid,
+  type Attendee,
+  type MeetupParty,
+  type Party,
+  type RaidParty,
+  type TrainParty,
+} from '../party/party.js';
+import { raidStage } from '../party/raid.js';
+import { PartyStatus } from '../party/status.js';
+import { timedOver } from '../party/timed.js';
+import { raidWords } from '../pogo/raid-tier.js';
+import type {
+  GroupCounts,
+  MapAttendance,
+  MapMeetup,
+  MapParty,
+  MapPress,
+  MapRaid,
+  MapStatus,
+  MapTrain,
+  PartiesView,
+} from './party-data.js';
+
+export type * from './party-data.js';
+
+/**
+ * What a logged-in member sees of a server's parties on the live map (spec 3.2,
+ * `GET /s/<guild>/api/parties`). Pure: the caller gives the active parties, the forums the member
+ * is barred from, and how each raid looks in its post. Nobody is named: no reporter or maker,
+ * no attendee's name or id, whatever anybody's privacy; attendees are counts, as the post counts
+ * them. The post, one tap away, shows names to whoever may see them.
+ */
+
+/** How a raid's post looks: its picture and the boss it names (`raidLook` of the renderer). */
+export interface RaidLook {
+  picture?: string;
+  boss?: string;
+}
+
+export interface PartyViewInput {
+  /** The server's snowflake, for the links to the posts. */
+  guildId: string;
+  /** Its row (`Guild.id`), by which a party says whose it is. */
+  guildRow: number;
+  /** The active parties (`PartyStore.active`); those of other servers are left out here. */
+  parties: readonly Party[];
+  /** Who asks. */
+  memberId: string;
+  /** The forums somebody keeps the member out of (`memberAccess` said `barred`). */
+  barred: ReadonlySet<string>;
+  now: number;
+  /** `settings.timezone`, in which the page shows times. */
+  zone: string;
+  /** Discord cannot be reached: nothing may be pressed. */
+  readOnly: boolean;
+  look(raid: RaidParty): RaidLook;
+  /** The origins the page may load pictures from (`pictureOrigins`). */
+  pictureOrigins: readonly string[];
+}
+
+/** The address of a post on Discord, as the direct messages give it (`postLink`). */
+function postLink(guildId: string, postId: string): string {
+  return `https://discord.com/channels/${guildId}/${postId}`;
+}
+
+/** Under which status the post lists an attendee: one asked whether they completed is present. */
+function mapStatus(attendee: Attendee): MapStatus | undefined {
+  switch (attendee.status) {
+    case PartyStatus.Interested:
+      return 'interested';
+    case PartyStatus.Coming:
+      return 'coming';
+    case PartyStatus.Present:
+    case PartyStatus.CompletePending:
+      return 'present';
+    case PartyStatus.Complete:
+      return 'complete';
+    default:
+      return undefined;
+  }
+}
+
+/** A picture only from a host the page may load (the Content Security Policy's). */
+function allowedPicture(url: string | undefined, origins: readonly string[]): string | null {
+  if (url === undefined) return null;
+  try {
+    return origins.includes(new URL(url).origin) ? url : null;
+  } catch {
+    return null;
+  }
+}
+
+/**
+ * The counts per group, the member's own standing, and the post's buttons: with one group
+ * Interested, Join, Here; with several a Join for each group, then Interested and Here; Done for
+ * a raid that has hatched; Leave for a member who is signed up. None while read-only.
+ */
+function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): MapAttendance {
+  const groups: GroupCounts[] = party.groups.map((group) => ({
+    id: group.id,
+    interested: 0,
+    coming: 0,
+    present: 0,
+  }));
+  for (const attendee of Object.values(party.attendees)) {
+    const status = mapStatus(attendee);
+    const counts = groups.find((group) => group.id === attendee.group);
+    if (counts && (status === 'interested' || status === 'coming' || status === 'present')) {
+      counts[status] += attendee.number;
+    }
+  }
+  const own = attendeeOf(party, input.memberId);
+  const ownStatus = own && mapStatus(own);
+  const mine = own && ownStatus ? { status: ownStatus, group: own.group } : null;
+  const several = party.groups.length > 1;
+  const actions: MapPress[] = input.readOnly
+    ? []
+    : [
+        ...(several
+          ? party.groups.map((group) => ({ action: 'join' as const, group: group.id }))
+          : []),
+        { action: 'interested' },
+        ...(several ? [] : [{ action: 'join' as const }]),
+        { action: 'here' },
+        ...(hatched ? [{ action: 'done' as const }] : []),
+        ...(mine ? [{ action: 'leave' as const }] : []),
+      ];
+  return { groups, mine, actions };
+}
+
+function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid | null {
+  const stage = raidStage(party, input.now);
+  if (stage === 'ended') return null;
+  const look = input.look(party);
+  return {
+    kind: 'raid',
+    id: party.id,
+    gymId: party.gymId,
+    picture: allowedPicture(look.picture, input.pictureOrigins),
+    tier: raidWords(party.raid.tier),
+    boss: look.boss ?? null,
+    stage,
+    hatchTime: party.hatchTime,
+    endTime: party.endTime,
+    link,
+    attendance: attendanceOf(party, input, stage === 'hatched'),
+  };
+}
+
+function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTrain {
+  const { route, stop } = party.train;
+  return {
+    kind: 'train',
+    id: party.id,
+    name: party.timed.name,
+    startTime: party.timed.startTime,
+    route: [...route],
+    stop: stop < route.length ? stop : null,
+    link,
+    attendance: attendanceOf(party, input, false),
+  };
+}
+
+function meetupOf(party: MeetupParty, link: string, input: PartyViewInput): MapMeetup {
+  return {
+    kind: 'meetup',
+    id: party.id,
+    name: party.timed.name,
+    startTime: party.timed.startTime,
+    endTime: party.endTime,
+    link,
+    attendance: attendanceOf(party, input, false),
+  };
+}
+
+/**
+ * One party as the member sees it on the map, or null when it is not theirs to see: of another
+ * server, not active, without its post yet, in a forum they are barred from, or over by the
+ * clock (a raid at its end, a meetup or train past its end time) though the store has not ended
+ * it yet.
+ */
+export function mapParty(party: Party, input: PartyViewInput): MapParty | null {
+  const { forumChannelId, forumPostId } = party;
+  if (party.guildId !== input.guildRow || party.status !== 'active') return null;
+  if (forumChannelId === null || forumPostId === null) return null;
+  if (input.barred.has(forumChannelId)) return null;
+  const link = postLink(input.guildId, forumPostId);
+  if (isRaid(party)) return raidOf(party, link, input);
+  if (timedOver(party, input.now)) return null;
+  return party.type === 'train' ? trainOf(party, link, input) : meetupOf(party, link, input);
+}
+
+/** The server's active parties as the member sees them, by kind, in the order they were made. */
+export function partyView(input: PartyViewInput): PartiesView {
+  const view: PartiesView = {
+    zone: input.zone,
+    readOnly: input.readOnly,
+    raids: [],
+    trains: [],
+    meetups: [],
+  };
+  for (const party of input.parties) {
+    const shown = mapParty(party, input);
+    if (shown?.kind === 'raid') view.raids.push(shown);
+    else if (shown?.kind === 'train') view.trains.push(shown);
+    else if (shown?.kind === 'meetup') view.meetups.push(shown);
+  }
+  return view;
+}
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index e77a8dd749c8614253f460f470d4229763e3e1d9..5245118bbe8f220ae119a5e1cc56528a2f269368 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -43,6 +43,7 @@ import {
 } from './party-post.js';
 import {
   gymMapsUrl,
+  raidLook,
   raidTags,
   raidTitle,
   renderRaidPost,
@@ -391,6 +392,22 @@ describe('renderRaidPost', () => {
     expect(pictured(named, at('2026-10-13T14:40'))).not.toBe(picture);
   });
 
+  it('gives the live map the picture and the boss the post shows (raidLook)', () => {
+    const picture = 'https://example.test/raid_egg_2_icon.png';
+    const named = setBoss(egg, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW).party;
+    const looked = (party: RaidParty, now = PARTY_NOW) => {
+      const shown = view(party, { now, eggPicture: picture });
+      expect(raidLook(shown).picture).toBe(thumbnailOf(renderRaidPost(shown).message));
+      return raidLook(shown);
+    };
+    expect(looked(egg)).toEqual({ picture });
+    expect(looked(named)).toEqual({ picture, boss: 'Yveltal' });
+    expect(looked(named, at('2026-10-13T14:40'))).toEqual({
+      picture: expect.stringMatching(/pm717/) as unknown,
+      boss: 'Yveltal',
+    });
+  });
+
   it('shows a raid closed while it was an egg as that egg in its last showing', () => {
     // Seen in the staging of 8A: an egg moved to another region ended with its boss's picture.
     const picture = 'https://example.test/raid_egg_5_icon.png';
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index bf9f1f4665221a5f38044f984daae4bc76a8fd4f..699926bf8a2a6c874274439f3823fc28c965f74b 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -429,6 +429,20 @@ function pictureOf(view: RaidPostView): string | undefined {
   return (shownAsEgg(view) ? view.eggPicture : undefined) ?? (fought ?? expected)?.image;
 }
 
+/**
+ * How the live map shows a raid (plan 8M-3): the post's picture, and the boss the post names
+ * (what it is fought against, or what the egg hatches as), decided here as for the post.
+ */
+export function raidLook(view: RaidPostView): { picture?: string; boss?: string } {
+  const { fought, expected } = bosses(view);
+  const picture = pictureOf(view);
+  const boss = (fought ?? expected)?.name;
+  return {
+    ...(picture === undefined ? {} : { picture }),
+    ...(boss === undefined ? {} : { boss }),
+  };
+}
+
 /** `Hatches as Yveltal ✨`. */
 function hatchesAsLine(view: RaidPostView, boss: ShownBoss): string {
   return `**Hatches as ${plain(boss.name)}**${boss.shiny ? ` ${view.emoji.shiny}` : ''}`;
````

### Task 2: Live map: who sees which parties, and the read-only state

Prototype commit: `f98a3735638b3905690d9cae67cc6c6e95942a25`

`PartyViewers`: membership from the member directory, barred forums from `memberAccess` kept a minute per member and forum; while Discord cannot be reached, a member confirmed in the last 30 minutes gets the list read-only from what Discord last said (an unknown forum hidden), anybody else `unconfirmed`; once Discord failed within a request, nothing more is asked and one warning is logged.

**Files:**

```
 src/web/party-viewers.test.ts | 141 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-viewers.ts      | 113 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 254 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/party-viewers.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/web/party-viewers.test.ts src/web/party-viewers.ts` and `npx eslint src/web/party-viewers.test.ts src/web/party-viewers.ts`.
- [ ] **Step 4: Check the transcription:** `git diff f98a3735638b3905690d9cae67cc6c6e95942a25 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Live map: who sees which parties, and the read-only state`, the paragraph above as the body and the trailer, staging exactly
  `src/web/party-viewers.test.ts src/web/party-viewers.ts`.

````diff
diff --git a/src/web/party-viewers.test.ts b/src/web/party-viewers.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..10c6391f87c2a1df9a3f43a4b72d32b854a5e426
--- /dev/null
+++ b/src/web/party-viewers.test.ts
@@ -0,0 +1,141 @@
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { BARRED_FRESH_MS, MEMBER_SEEN_MS, PartyViewers } from './party-viewers.js';
+
+const FORUMS = [WEST_FORUM, EAST_FORUM];
+
+function viewersWith() {
+  const gateway = new FakePartyGateway();
+  gateway.addForum(WEST_FORUM);
+  gateway.addForum(EAST_FORUM);
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const asked: string[] = [];
+  const clock = { now: 1_000_000 };
+  const { log, entries } = createTestLogger();
+  const viewers = new PartyViewers({
+    members,
+    forums: {
+      memberAccess: (forumId, memberId) => {
+        asked.push(`${forumId}:${memberId}`);
+        return gateway.memberAccess(forumId, memberId);
+      },
+    },
+    log,
+    now: () => clock.now,
+  });
+  return { gateway, members, asked, clock, viewers, entries };
+}
+
+describe('PartyViewers', () => {
+  it('lets a member of the server see every forum but those somebody keeps them out of', async () => {
+    const { gateway, viewers } = viewersWith();
+    gateway.shutOut(EAST_FORUM, ALICE);
+    gateway.barred.set(WEST_FORUM, new Set([BOB]));
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({
+      kind: 'member',
+      readOnly: false,
+      barred: new Set(),
+    });
+    expect(await viewers.viewer(FAKE_GUILD_ID, BOB, FORUMS)).toEqual({
+      kind: 'member',
+      readOnly: false,
+      barred: new Set([WEST_FORUM]),
+    });
+  });
+
+  it('shows nothing to somebody who is not a member', async () => {
+    const { viewers, asked } = viewersWith();
+    expect(await viewers.viewer(FAKE_GUILD_ID, '200000000000000009', FORUMS)).toEqual({
+      kind: 'not-member',
+    });
+    expect(asked).toEqual([]);
+  });
+
+  it('asks Discord about a member and a forum once a minute, not at every request', async () => {
+    const { viewers, asked, clock, gateway } = viewersWith();
+    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
+    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
+    expect(asked).toEqual([`${WEST_FORUM}:${ALICE}`, `${EAST_FORUM}:${ALICE}`]);
+    gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+    clock.now += BARRED_FRESH_MS;
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toMatchObject({
+      barred: new Set([EAST_FORUM]),
+    });
+    expect(asked).toHaveLength(4);
+  });
+
+  it('is read-only while Discord cannot be reached, for a member seen lately, by what Discord said last', async () => {
+    const { viewers, members, gateway, clock, entries } = viewersWith();
+    gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
+    members.failing = new Error('Discord is away');
+    gateway.failing.set('memberAccess', new Error('Discord is away'));
+    clock.now += BARRED_FRESH_MS;
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({
+      kind: 'member',
+      readOnly: true,
+      barred: new Set([EAST_FORUM]),
+    });
+    expect(entries.some((entry) => entry.msg?.toString().includes('member'))).toBe(true);
+    // Nobody else learns anything; nor does she once it is long ago.
+    expect(await viewers.viewer(FAKE_GUILD_ID, BOB, FORUMS)).toEqual({ kind: 'unconfirmed' });
+    clock.now += MEMBER_SEEN_MS;
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({ kind: 'unconfirmed' });
+  });
+
+  it('hides a forum Discord could not be asked about and has said nothing of lately', async () => {
+    const { viewers, gateway } = viewersWith();
+    gateway.failing.set('memberAccess', new Error('Discord is away'));
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({
+      kind: 'member',
+      readOnly: true,
+      barred: new Set(FORUMS),
+    });
+  });
+
+  it('asks Discord nothing more in a request once it failed, and warns once', async () => {
+    const { viewers, gateway, asked, entries, clock, members } = viewersWith();
+    const THIRD_FORUM = '100000000000000013';
+    gateway.addForum(THIRD_FORUM);
+    const three = [...FORUMS, THIRD_FORUM];
+    gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+    await viewers.viewer(FAKE_GUILD_ID, ALICE, [EAST_FORUM]);
+    clock.now += BARRED_FRESH_MS;
+    asked.length = 0;
+    const warnings = () => entries.filter((entry) => entry.level === 40).length;
+    // The first forum fails: the others are not asked; what Discord said lately is used, and a
+    // forum it said nothing of counts as barred.
+    gateway.failing.set('memberAccess', new Error('Discord is away'));
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, three)).toEqual({
+      kind: 'member',
+      readOnly: true,
+      barred: new Set(three),
+    });
+    expect(asked).toEqual([`${WEST_FORUM}:${ALICE}`]);
+    expect(warnings()).toBe(1);
+    // Whether she is a member cannot be asked: no forum is asked about either.
+    members.failing = new Error('Discord is away');
+    asked.length = 0;
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, three)).toMatchObject({
+      kind: 'member',
+      readOnly: true,
+    });
+    expect(asked).toEqual([]);
+    expect(warnings()).toBe(2);
+  });
+
+  it('forgets a member who left the server', async () => {
+    const { viewers, members, clock } = viewersWith();
+    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
+    members.remove(ALICE);
+    clock.now += 60_000;
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({ kind: 'not-member' });
+    members.failing = new Error('Discord is away');
+    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({ kind: 'unconfirmed' });
+  });
+});
diff --git a/src/web/party-viewers.ts b/src/web/party-viewers.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f2c7dc30e1fe54469cf96d44b11d841f0d52c538
--- /dev/null
+++ b/src/web/party-viewers.ts
@@ -0,0 +1,113 @@
+import { BoundedMap } from '../bounded-map.js';
+import type { MemberDirectory } from '../discord/member-directory.js';
+import type { MemberAccess } from '../discord/party-gateway.js';
+import type { Logger } from '../log.js';
+
+/** How long what Discord said of a member and a forum is used before it is asked again. */
+export const BARRED_FRESH_MS = 60_000;
+/**
+ * How long after Discord last said somebody is a member of a server (or what they may see of a
+ * forum) that is still believed, read-only, while Discord cannot be asked.
+ */
+export const MEMBER_SEEN_MS = 30 * 60_000;
+/** How many answers are kept of each kind (oldest out). */
+const KEPT = 10_000;
+
+/**
+ * Who is asking for a server's parties on the live map (spec 2.5): not a member (nothing to
+ * see); a member, with the forums somebody keeps them out of (their parties are not listed) and
+ * whether the map is read-only (Discord could not be asked: what it said last is used); or
+ * `unconfirmed`, Discord could not be asked and has not said lately that they are a member.
+ */
+export type PartyViewer =
+  | { kind: 'not-member' }
+  | { kind: 'unconfirmed' }
+  | { kind: 'member'; readOnly: boolean; barred: Set<string> };
+
+export interface PartyViewersOptions {
+  /** Whether somebody is a member of a server (kept a minute by the directory). */
+  members: Pick<MemberDirectory, 'find'>;
+  /** How a member stands to a forum (`PartyGateway.memberAccess`). */
+  forums: { memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> };
+  log: Logger;
+  now: () => number;
+}
+
+/**
+ * Decides per request who sees which parties on the map, from what Discord says, never from the
+ * session (spec 2.5): a member of the server sees every active party of it except those in a
+ * forum they are barred from (`memberAccess` says `barred`: an overwrite somebody set to keep
+ * them out). What Discord said of a member and a forum is used for a minute
+ * (`BARRED_FRESH_MS`), so that a page that asks every 20 seconds does not have every forum
+ * looked at each time. While Discord cannot be asked, a member Discord said lately
+ * (`MEMBER_SEEN_MS`) is a member still, read-only, with what it said last of each forum; a forum
+ * it said nothing of lately is hidden, and anybody else is `unconfirmed`. Once Discord failed
+ * in a request, nothing more is asked of it in that request (one warning in the log).
+ */
+export class PartyViewers {
+  /** `<guild>:<user>`: when Discord last said they are a member. */
+  private readonly seen = new BoundedMap<string, number>(KEPT);
+  /** `<forum>:<user>`: what Discord said last, and when. */
+  private readonly forums = new BoundedMap<string, { barred: boolean; at: number }>(KEPT);
+
+  constructor(private readonly options: PartyViewersOptions) {}
+
+  async viewer(guildId: string, userId: string, forumIds: Iterable<string>): Promise<PartyViewer> {
+    const { members, log, now } = this.options;
+    const key = `${guildId}:${userId}`;
+    let readOnly = false;
+    try {
+      if ((await members.find(guildId, userId)) === undefined) {
+        this.seen.delete(key);
+        return { kind: 'not-member' };
+      }
+      this.seen.set(key, now());
+    } catch (err) {
+      log.warn(
+        { err, guild: guildId, user: userId },
+        'could not ask whether somebody on the web pages is a member',
+      );
+      const at = this.seen.get(key);
+      if (at === undefined || now() - at >= MEMBER_SEEN_MS) return { kind: 'unconfirmed' };
+      readOnly = true;
+    }
+    const barred = new Set<string>();
+    for (const forumId of new Set(forumIds)) {
+      // Once Discord failed in this request it is not asked again in it (one warning).
+      const answer = await this.barredFrom(forumId, userId, readOnly);
+      if (answer.unreachable) readOnly = true;
+      if (answer.barred) barred.add(forumId);
+    }
+    return { kind: 'member', readOnly, barred };
+  }
+
+  /**
+   * Whether the member is kept out of the forum: asked of Discord at most once a minute; when it
+   * cannot be asked, what it said within `MEMBER_SEEN_MS`, or else barred (hidden, to be safe).
+   * `unreachable`: Discord failed earlier in this request, so it is not asked again.
+   */
+  private async barredFrom(
+    forumId: string,
+    userId: string,
+    unreachable: boolean,
+  ): Promise<{ barred: boolean; unreachable: boolean }> {
+    const { forums, log, now } = this.options;
+    const key = `${forumId}:${userId}`;
+    const kept = this.forums.get(key);
+    if (kept && now() - kept.at < BARRED_FRESH_MS)
+      return { barred: kept.barred, unreachable: false };
+    const lately = kept !== undefined && now() - kept.at < MEMBER_SEEN_MS;
+    if (unreachable) return { barred: lately ? kept.barred : true, unreachable: true };
+    try {
+      const barred = (await forums.memberAccess(forumId, userId)) === 'barred';
+      this.forums.set(key, { barred, at: now() });
+      return { barred, unreachable: false };
+    } catch (err) {
+      log.warn(
+        { err, forum: forumId, user: userId },
+        'could not ask whether a member on the web pages is kept out of a forum',
+      );
+      return { barred: lately ? kept.barred : true, unreachable: true };
+    }
+  }
+}
````

### Task 3: Live map: the parties of a server, GET /s/<guild>/api/parties

Prototype commit: `e2270ff5612d88400402933b3c42a37a451f5ebd`

The parties from `PartyStore` only (never an ended party by id); 401, 403, 503 in words; `Cache-Control: private, no-cache`, an ETag of the member's view and 304 (weak tags and lists); 30 a minute per address; `etagOf` shared with the geo cache.

**Files:**

```
 src/app.ts              |   9 +++++++
 src/web/geo-cache.ts    |   8 ++++--
 src/web/guild-routes.ts |   4 +++
 src/web/parties.test.ts | 121 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts | 108 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/server.ts       |   3 +++
 test/support/web.ts     |  32 ++++++++++++++++++++++++
 7 files changed, 283 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/parties.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/web/geo-cache.ts src/web/guild-routes.ts src/web/parties.test.ts src/web/party-routes.ts src/web/server.ts test/support/web.ts` and `npx eslint src/app.ts src/web/geo-cache.ts src/web/guild-routes.ts src/web/parties.test.ts src/web/party-routes.ts src/web/server.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff e2270ff5612d88400402933b3c42a37a451f5ebd -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Live map: the parties of a server, GET /s/<guild>/api/parties`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/web/geo-cache.ts src/web/guild-routes.ts src/web/parties.test.ts src/web/party-routes.ts src/web/server.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index 3420c0b853d98c9c4652765be95f2efb623c8f48..c86b0731c0d75fd55443a6f699aa76b9224e4baa 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -103,6 +103,7 @@ import { healthFiles } from './ops/health.js';
 import { gatewayConnected, Heartbeat } from './ops/heartbeat.js';
 import { startCheckpoint } from './ops/start-stop.js';
 import { createShutdown } from './shutdown.js';
+import { raidLook } from './render/raid-post.js';
 import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
 import { DiscordOAuth } from './web/discord-oauth.js';
@@ -817,6 +818,14 @@ export async function startApp(
         // The first step of the shutdown: from then on no save of the editor is started.
         closing: () => webClosed,
       },
+      // The live map's parties: the store, how a post shows a raid, who may see which forum.
+      parties: {
+        guilds,
+        store: parties,
+        look: (raid) => raidLook(partyService.view(raid)),
+        forums: partyGateway,
+        zone: config.settings.timezone,
+      },
       now: () => Date.now(),
       log,
     });
diff --git a/src/web/geo-cache.ts b/src/web/geo-cache.ts
index 1790a52a8eea46f045fd016a26390ed310f6ab8f..abe1f278f74d9f058ec8188a6971d8e7aea8f338 100644
--- a/src/web/geo-cache.ts
+++ b/src/web/geo-cache.ts
@@ -27,6 +27,11 @@ export interface SentView {
   etag: string;
 }
 
+/** The strong ETag of a JSON body: its SHA-256, cut to 27 characters (160 bits). */
+export function etagOf(body: string): string {
+  return `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
+}
+
 /**
  * Whether an `If-None-Match` names this ETag (RFC 9110, 13.1.2): a list of tags, compared weakly
  * (`W/` ignored), or `*` for any.
@@ -74,8 +79,7 @@ export class GeoCache {
         regionsOf: (id) => gyms.regionsOf(id),
       }),
     );
-    const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
-    const view = { key, body, etag };
+    const view = { key, body, etag: etagOf(body) };
     this.views.set(guildId, view);
     return view;
   }
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 2805cbc1bb4fee4cc8961690c24a3c418993d21a..a8301e62917cf4971b5c497cc256f25604c1bc9b 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -4,6 +4,7 @@ import { sendFailure, shortPage } from './answers.js';
 import { editorRoutes } from './editor-routes.js';
 import { etagMatches } from './geo-cache.js';
 import { mapPage } from './page.js';
+import { partyRoutes } from './party-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -100,4 +101,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
 
   // The region editor (plan 8M-2): its data for the server's staff.
   editorRoutes(scope, deps);
+
+  // The parties on the live map, and joining them (plan 8M-3): for members of the server.
+  partyRoutes(scope, deps);
 }
diff --git a/src/web/parties.test.ts b/src/web/parties.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e42284bad6814401ba8261d5e2f3b1e6b03821ba
--- /dev/null
+++ b/src/web/parties.test.ts
@@ -0,0 +1,121 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { partyWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
+import type { PartiesView } from '../domain/web/party-data.js';
+import { PartyStatus } from '../domain/party/status.js';
+
+const PARTIES = `/s/${FAKE_GUILD_ID}/api/parties`;
+
+/** A raid at the Library in West's forum, a web server over it, Alice a member of the server. */
+async function raidOnTheMap() {
+  const made = await reportedRaid();
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
+  const web = webServerWith({ members, parties: partyWebWith(made) });
+  // The web server's clock is the parties' (the raid is reported at `PARTY_NOW`).
+  web.clock.now = PARTY_NOW;
+  return { ...made, members, web };
+}
+
+describe('the parties of a server on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('are for members who are logged in: 401 without a session, 403 for anybody else', async () => {
+    const made = await raidOnTheMap();
+    web = made.web;
+    const anonymous = await web.app.inject({ url: PARTIES });
+    expect(anonymous.statusCode).toBe(401);
+    expect(anonymous.json()).toEqual({ error: 'Log in first.' });
+    const cookie = await web.loggedIn(BOB, 'Bob');
+    const stranger = await web.app.inject({ url: PARTIES, headers: { cookie } });
+    expect(stranger.statusCode).toBe(403);
+    expect(stranger.json()).toEqual({ error: 'Not allowed.' });
+  });
+
+  it("are the member's view, private, with an ETag per view and 304 when unchanged", async () => {
+    const made = await raidOnTheMap();
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const answer = await web.app.inject({ url: PARTIES, headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toMatch(/^application\/json/);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    const view = answer.json<PartiesView>();
+    expect(view.readOnly).toBe(false);
+    expect(view.raids.map((raid) => [raid.id, raid.gymId, raid.tier])).toEqual([
+      [made.party.id, 1, 'Level 5 raid'],
+    ]);
+    expect(view.raids[0]?.link).toBe(
+      `https://discord.com/channels/${FAKE_GUILD_ID}/${made.postId}`,
+    );
+    expect(view.raids[0]?.attendance.mine).toBeNull();
+
+    const etag = String(answer.headers.etag);
+    expect(etag).toMatch(/^"[A-Za-z0-9_-]{20,}"$/);
+    const again = await web.app.inject({
+      url: PARTIES,
+      headers: { cookie, 'if-none-match': `W/${etag}` },
+    });
+    expect(again.statusCode).toBe(304);
+    expect(again.body).toBe('');
+
+    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+    const changed = await web.app.inject({
+      url: PARTIES,
+      headers: { cookie, 'if-none-match': etag },
+    });
+    expect(changed.statusCode).toBe(200);
+    expect(changed.json<PartiesView>().raids[0]?.attendance.mine).toEqual({
+      status: 'coming',
+      group: 'A',
+    });
+    expect(changed.headers.etag).not.toBe(etag);
+  });
+
+  it('leave out the parties of a forum the member is kept out of', async () => {
+    const made = await raidOnTheMap();
+    web = made.web;
+    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const answer = await web.app.inject({ url: PARTIES, headers: { cookie } });
+    expect(answer.json<PartiesView>().raids).toEqual([]);
+  });
+
+  it('are read-only while Discord cannot be reached, for a member it confirmed lately', async () => {
+    const made = await raidOnTheMap();
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    await web.app.inject({ url: PARTIES, headers: { cookie } });
+    made.members.failing = new Error('Discord is away');
+    const answer = await web.app.inject({ url: PARTIES, headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    const view = answer.json<PartiesView>();
+    expect(view.readOnly).toBe(true);
+    expect(view.raids[0]?.attendance.actions).toEqual([]);
+    const other = await web.loggedIn(BOB, 'Bob');
+    const unknown = await web.app.inject({ url: PARTIES, headers: { cookie: other } });
+    expect(unknown.statusCode).toBe(503);
+    expect(unknown.json()).toEqual({
+      error: 'Discord cannot be reached just now, so I cannot tell whether you are a member.',
+    });
+  });
+
+  it('may be asked 30 times a minute from one address', async () => {
+    const made = await raidOnTheMap();
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    for (let n = 0; n < 30; n++) {
+      expect((await web.app.inject({ url: PARTIES, headers: { cookie } })).statusCode).toBe(200);
+    }
+    const refused = await web.app.inject({ url: PARTIES, headers: { cookie } });
+    expect(refused.statusCode).toBe(429);
+    expect(refused.headers['retry-after']).toBe('60');
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c48c86468dbd5fd02ef7d6c8bb90317f8be77b68
--- /dev/null
+++ b/src/web/party-routes.ts
@@ -0,0 +1,108 @@
+import type { FastifyInstance } from 'fastify';
+import type { Party, RaidParty } from '../domain/party/party.js';
+import { partyView, type PartyViewInput, type RaidLook } from '../domain/web/party-view.js';
+import type { MemberAccess } from '../discord/party-gateway.js';
+import { sendFailure } from './answers.js';
+import { etagMatches, etagOf } from './geo-cache.js';
+import type { GuildRequest } from './guild-routes.js';
+import { PartyViewers } from './party-viewers.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+
+/**
+ * The requests for a server's parties one address may make in a minute: a page asks every 20
+ * seconds while it is visible and at once after a press, and a household or a few tabs share
+ * an address. Each may ask Discord, at most once a minute per member and forum.
+ */
+export const PARTIES_PER_MINUTE = 30;
+
+/** What the parties' addresses answer while Discord cannot say whether somebody is a member. */
+const UNCONFIRMED =
+  'Discord cannot be reached just now, so I cannot tell whether you are a member.';
+
+/** What the live map's parties need (plan 8M-3). */
+export interface PartyWebDeps {
+  /** The row of a server (`Guild.id`), by which a party says whose it is. */
+  guilds: { idFor(snowflake: string): Promise<number | undefined> };
+  /** The active parties (`PartyStore`): an ended party is never read from the database. */
+  store: { active(): Party[]; get(id: string): Party | undefined };
+  /** How a raid's post looks (`raidLook` of the party service's view of it). */
+  look(raid: RaidParty): RaidLook;
+  /** How a member stands to a forum (`PartyGateway.memberAccess`). */
+  forums: { memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> };
+  /** `settings.timezone`: the posts' times, which the page shows. */
+  zone: string;
+}
+
+/**
+ * The live map's parties (`/s/<guild>/api/parties`, spec 3.2 to 3.4): the active parties of the
+ * server as the member who asks sees them (`partyView`), for members only (`PartyViewers`: 401
+ * without a session, 403 for anybody who is not a member, 503 while Discord cannot say and has
+ * not said lately), read-only while Discord cannot be asked. The view is the member's own: an
+ * ETag of its JSON, `private, no-cache`, 304 when the page has it already.
+ */
+export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { parties, sessions } = deps;
+  const viewers = new PartyViewers({
+    members: deps.members,
+    forums: parties.forums,
+    log: deps.log,
+    now: deps.now,
+  });
+
+  /**
+   * The view input of a member: the server's active parties (`own`, of the server's row) and
+   * what the member may see of them.
+   */
+  const inputFor = (
+    guildId: string,
+    own: { row: number; parties: readonly Party[] },
+    memberId: string,
+    viewer: { readOnly: boolean; barred: Set<string> },
+  ): PartyViewInput => ({
+    guildId,
+    guildRow: own.row,
+    parties: own.parties,
+    memberId,
+    barred: viewer.barred,
+    now: deps.now(),
+    zone: parties.zone,
+    readOnly: viewer.readOnly,
+    look: (raid) => parties.look(raid),
+    pictureOrigins: deps.pictureOrigins,
+  });
+
+  /** The active parties of a server; none for a server without its row yet. */
+  const ownParties = async (guildId: string) => {
+    const row = await parties.guilds.idFor(guildId);
+    return {
+      row: row ?? 0,
+      parties:
+        row === undefined ? [] : parties.store.active().filter((party) => party.guildId === row),
+    };
+  };
+
+  const limiter = new RateLimiter({ uses: PARTIES_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/parties',
+    { onRequest: limitedPerAddress(limiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const { guild } = request.params;
+      const own = await ownParties(guild);
+      const forums = own.parties.flatMap((party) =>
+        party.forumChannelId === null ? [] : [party.forumChannelId],
+      );
+      const viewer = await viewers.viewer(guild, session.userId, forums);
+      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
+      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
+      const body = JSON.stringify(partyView(inputFor(guild, own, session.userId, viewer)));
+      const etag = etagOf(body);
+      void reply.header('etag', etag);
+      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
+      return reply.type('application/json; charset=utf-8').send(body);
+    },
+  );
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index 7dca32cc9d3827e76c109dc53d083d9429747549..153d3dd6854990268ec3e4fef79a960240788f4c 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -14,6 +14,7 @@ import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
 import type { LoginLinks } from './login-links.js';
 import { HASHED_NAME, type WebAssets } from './page.js';
+import type { PartyWebDeps } from './party-routes.js';
 import type { Sessions } from './sessions.js';
 
 /** `settings.web` once it is set. */
@@ -41,6 +42,8 @@ export interface WebDeps {
   assets: WebAssets;
   /** The region editor: who may edit, and its view of each server (plan 8M-2). */
   editor: EditorDeps;
+  /** The parties on the live map, and joining them (plan 8M-3). */
+  parties: PartyWebDeps;
   now: () => number;
   log: Logger;
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index 163f8d194ca8685e1d486a690ee1fbf6645de345..97e252dc4919d53012b2b004223dbd7c1a79c381 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -15,7 +15,9 @@ import { GeoCache, type GeoSources } from '../../src/web/geo-cache.js';
 import type { RegionStaffSource, StaffAnswer } from '../../src/web/region-staff.js';
 import { LoginLinks } from '../../src/web/login-links.js';
 import type { WebAssets } from '../../src/web/page.js';
+import type { PartyWebDeps } from '../../src/web/party-routes.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
+import { raidLook } from '../../src/render/raid-post.js';
 import { inThisThread } from '../../src/web/save-check.js';
 import type { RegionEditing } from '../../src/web/editor-save.js';
 import { Sessions, sessionHash } from '../../src/web/sessions.js';
@@ -27,6 +29,7 @@ import { regionAdminWith } from './region-admin.js';
 import { createTestLogger } from './test-logger.js';
 import { wayspotsWith } from './wayspots.js';
 import { MemoryWebSessions } from './web-sessions.js';
+import type { partyServiceWith } from './party-service.js';
 
 /**
  * Where the map's view is built from in tests: the invented gyms (`MemoryGyms` under a real
@@ -140,6 +143,32 @@ const NOTHING: GeoSources = {
   channels: { serverChannels: () => undefined },
 };
 
+/** No parties: the live map of a server without any. */
+const NO_PARTIES: PartyWebDeps = {
+  guilds: { idFor: () => Promise.resolve(undefined) },
+  store: { active: () => [], get: () => undefined },
+  look: () => ({}),
+  forums: { memberAccess: () => Promise.resolve(undefined) },
+  zone: 'America/New_York',
+};
+
+/**
+ * The live map's parties over the party services of a test (`partyServiceWith`, `reportedRaid`
+ * and the like), as the bot wires them: the store, the fake gateway's forums, how the party
+ * service shows a raid, the server of the fake interactions as row 1. Pass as `parties`.
+ */
+export function partyWebWith(made: Awaited<ReturnType<typeof partyServiceWith>>): PartyWebDeps {
+  return {
+    guilds: {
+      idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
+    },
+    store: made.store,
+    look: (raid) => raidLook(made.service.view(raid)),
+    forums: made.gateway,
+    zone: made.settings.timezone,
+  };
+}
+
 /** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
 export const TEST_WEB: WebSettings = {
   port: 0,
@@ -223,6 +252,8 @@ export interface WebTestOptions {
   editing?: RegionEditing;
   /** Whether the web server is closing (the bot shutting down); never by default. */
   closing?: () => boolean;
+  /** The live map's parties (`partyWebWith`); none by default. */
+  parties?: PartyWebDeps;
 }
 
 /**
@@ -345,6 +376,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
       editing: options.editing ?? NO_EDITING,
       closing: options.closing ?? (() => false),
     },
+    parties: options.parties ?? NO_PARTIES,
     now: () => clock.now,
     log,
   });
````

### Task 4: Live map: joining a party, POST /s/<guild>/api/parties/<id>/<action>

Prototype commit: `9d71852b4f03eeed8d173c92e4a9f5fa87a6f9c5`

In `onRequest` before the body: 60 a minute per address, `postGuard`, a known action. Then the session, a strict body, a fresh member (`DiscordWebMembers`, name and team from `guildMemberInfo`), the party in the store and of this server, `memberAccess` asked afresh, and only then `ACTION_THROTTLE` in the same bucket as the post's controls (the router's `RouterOptions.throttles`, one shared `Throttles`); `pressStatus` is the post's buttons' own code path; `AccessService` opens and closes an unseen forum; the answer in `answerOutcome`'s words through `unplain`, and the party's new view; each press logged without text.

**Files:**

```
 src/app.ts                      |  13 +++-
 src/commands/parties/reply.ts   |  73 +++++++++++++++++++--
 src/components/party.ts         |  48 ++------------
 src/discord/member-info.ts      |  10 ++-
 src/discord/router.test.ts      |  32 +++++++++-
 src/discord/router.ts           |  18 +++++-
 src/discord/web-members.test.ts |  58 +++++++++++++++++
 src/discord/web-members.ts      |  22 +++++++
 src/domain/web/party-data.ts    |   5 +-
 src/render/text.test.ts         |  28 ++++++++
 src/render/text.ts              |  15 +++++
 src/web/party-press.test.ts     | 279 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts         | 205 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 test/support/web.ts             |  62 ++++++++++++++++--
 14 files changed, 808 insertions(+), 60 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/discord/router.test.ts src/discord/web-members.test.ts src/render/text.test.ts src/web/party-press.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/commands/parties/reply.ts src/components/party.ts src/discord/member-info.ts src/discord/router.test.ts src/discord/router.ts src/discord/web-members.test.ts src/discord/web-members.ts src/domain/web/party-data.ts src/render/text.test.ts src/render/text.ts src/web/party-press.test.ts src/web/party-routes.ts test/support/web.ts` and `npx eslint src/app.ts src/commands/parties/reply.ts src/components/party.ts src/discord/member-info.ts src/discord/router.test.ts src/discord/router.ts src/discord/web-members.test.ts src/discord/web-members.ts src/domain/web/party-data.ts src/render/text.test.ts src/render/text.ts src/web/party-press.test.ts src/web/party-routes.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 9d71852b4f03eeed8d173c92e4a9f5fa87a6f9c5 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Live map: joining a party, POST /s/<guild>/api/parties/<id>/<action>`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/commands/parties/reply.ts src/components/party.ts src/discord/member-info.ts src/discord/router.test.ts src/discord/router.ts src/discord/web-members.test.ts src/discord/web-members.ts src/domain/web/party-data.ts src/render/text.test.ts src/render/text.ts src/web/party-press.test.ts src/web/party-routes.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index c86b0731c0d75fd55443a6f699aa76b9224e4baa..cdf5847a38c2fb304659d53d216fb7ec6aeb5251 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -39,6 +39,8 @@ import { DiscordDmGateway } from './discord/dm-gateway.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
 import { DiscordRegionStaff } from './discord/web-staff.js';
+import { DiscordWebMembers } from './discord/web-members.js';
+import { Throttles } from './discord/throttle.js';
 import { DiscordRoleGateway } from './discord/role-gateway.js';
 import { postedMessage } from './discord/screenshot-message.js';
 import { DiscordApplicationEmoji } from './discord/application-emoji.js';
@@ -662,7 +664,10 @@ export async function startApp(
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
   // said in the log of the start, and the help of `/wild` names the ones it does.
   wildExceptionsOf(ctx);
-  const router = new InteractionRouter(ctx, commands, components);
+  // The uses of commands and controls, counted by the router and by the live map, whose presses
+  // of a party's buttons count as clicks on the post (plan 8M-3).
+  const throttles = new Throttles();
+  const router = new InteractionRouter(ctx, commands, components, { throttles });
   // Screenshots posted in a region channel with a mention of the bot (or, passive, without).
   const screenshotTrigger = new ScreenshotTrigger({ ctx });
   // Resolved by the client that ends up connected (the login may try several).
@@ -818,13 +823,17 @@ export async function startApp(
         // The first step of the shutdown: from then on no save of the editor is started.
         closing: () => webClosed,
       },
-      // The live map's parties: the store, how a post shows a raid, who may see which forum.
+      // The live map's parties: the store, how a post shows a raid, who may see which forum; a
+      // press goes through the attendance service as the post's button does, in its throttle.
       parties: {
         guilds,
         store: parties,
         look: (raid) => raidLook(partyService.view(raid)),
         forums: partyGateway,
         zone: config.settings.timezone,
+        attendance,
+        acting: new DiscordWebMembers(client),
+        throttles,
       },
       now: () => Date.now(),
       log,
diff --git a/src/commands/parties/reply.ts b/src/commands/parties/reply.ts
index 83dd6a5c353de6a07033d388f06797fd3c1b8407..a67750149327709f8b0a5d6819d69d0cfe84dff0 100644
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -27,10 +27,16 @@ import {
   type TimedParty,
   type TrainParty,
 } from '../../domain/party/party.js';
+import type { AttendanceLimits } from '../../domain/party/attendance.js';
+import { PartyStatus } from '../../domain/party/status.js';
 import { problemText, standingReply } from '../../render/activity.js';
 import { isRaidAction } from '../../render/party-controls.js';
 import { truncate } from '../../render/text.js';
-import type { AttendanceOutcome, Member } from '../../services/attendance-service.js';
+import type {
+  AttendanceOutcome,
+  AttendanceService,
+  Member,
+} from '../../services/attendance-service.js';
 
 /**
  * What a member is told about a party that has ended. Pass the party when it is known. One that
@@ -211,13 +217,72 @@ function outcomeContent<Extra>(
   outcome: AttendanceOutcome<Extra>,
   words?: (ok: Ok<Extra>) => string | undefined,
 ): string {
-  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
+  const said = outcomeWords(ctx.attendance.limits(), party, outcome, words);
+  if (!said.ok) throw new UserError(said.text);
+  return said.text;
+}
+
+/**
+ * What the member is told for an outcome, and whether it worked: how they stand now (or what
+ * `words` makes of it), why it was refused, or that the party is over. `party` is the party the
+ * action was for, as far as it is known: a refusal and "it is over" name its kind. The answer of
+ * a post's control (thrown, when it did not work) and of a press on the live map alike.
+ */
+export function outcomeWords<Extra>(
+  limits: AttendanceLimits,
+  party: Pick<Party, 'type'> | undefined,
+  outcome: AttendanceOutcome<Extra>,
+  words?: (ok: Ok<Extra>) => string | undefined,
+): { ok: boolean; text: string } {
+  if (outcome.kind === 'gone') return { ok: false, text: partyOver(party) };
   if (outcome.kind === 'refused') {
     // A party that refused is in the store, so its kind is known; `party` is said otherwise.
     const word = party ? partyWord(party) : 'party';
-    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), word));
+    return { ok: false, text: problemText(outcome.reason, limits, word) };
+  }
+  return { ok: true, text: outcomeText(outcome as Ok<Extra>, words) };
+}
+
+/**
+ * A press of one of the attendance buttons of a post (spec 4.1): Interested (`maybe`), Join,
+ * Here, Done, Leave, and "Join B" of a party with several groups (`group`). The live map presses
+ * the same buttons (plan 8M-3).
+ */
+export type StatusPress =
+  { action: 'maybe' | 'join' | 'here' | 'done' | 'leave' } | { action: 'group'; group: GroupId };
+
+/** What a press is answered with: the outcome, and how its answer is worded. */
+export type PressAnswerer<R> = <Extra>(
+  outcome: AttendanceOutcome<Extra>,
+  words?: (ok: Ok<Extra>) => string | undefined,
+) => Promise<R>;
+
+/**
+ * Carries out a press of an attendance button through the attendance service, exactly as the
+ * post's button does, and has `answer` tell the member (the button: `answerClick`; the live map:
+ * its JSON). The one code path of the post's buttons and the map's.
+ */
+export async function pressStatus<R>(
+  attendance: Pick<AttendanceService, 'signUp' | 'joinInto' | 'done' | 'leave'>,
+  partyId: string,
+  member: Member,
+  press: StatusPress,
+  answer: PressAnswerer<R>,
+): Promise<R> {
+  switch (press.action) {
+    case 'maybe':
+      return answer(await attendance.signUp(partyId, member, PartyStatus.Interested));
+    case 'join':
+      return answer(await attendance.signUp(partyId, member, PartyStatus.Coming));
+    case 'here':
+      return answer(await attendance.signUp(partyId, member, PartyStatus.Present));
+    case 'done':
+      return answer(await attendance.done(partyId, member), doneWords);
+    case 'leave':
+      return answer(await attendance.leave(partyId, member), leftWords);
+    case 'group':
+      return answer(await attendance.joinInto(partyId, member, press.group));
   }
-  return outcomeText(outcome as Ok<Extra>, words);
 }
 
 /** What a member is told after an action that worked. */
diff --git a/src/components/party.ts b/src/components/party.ts
index ff6fd898513c280dd29cbd73a3d24c41c6ee8608..6c4415c317b6cfd2177d5a969a0afa396a0d6ba7 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -3,11 +3,11 @@ import {
   ACTION_THROTTLE,
   actingMember,
   answerClick,
-  doneWords,
-  leftWords,
   moreWords,
   partyOver,
+  pressStatus,
   remoteWords,
+  type PressAnswerer,
 } from '../commands/parties/reply.js';
 import { changeTime, timesAlready } from '../commands/raids/change.js';
 import { memberInfo } from '../discord/member-info.js';
@@ -24,7 +24,6 @@ import { UserError } from '../discord/errors.js';
 import { managementRoleIds, notARaid, partyOf, requireGuild } from '../discord/guards.js';
 import { STALE_COMPONENT } from '../discord/router.js';
 import { isGroupId, isRaid, partyWord } from '../domain/party/party.js';
-import { PartyStatus } from '../domain/party/status.js';
 import { raidStage } from '../domain/party/raid.js';
 import {
   DELETE_REASON_INPUT,
@@ -58,44 +57,16 @@ export const partyButtons: ComponentHandler = {
     const member = actingMember(interaction);
     const partyId = id.id;
     if (!isPartyAction(id.action)) throw new UserError(STALE_COMPONENT);
+    // The buttons the live map has too go one way for both (`pressStatus`).
+    const click: PressAnswerer<void> = (outcome, words) =>
+      answerClick(interaction, ctx, partyId, outcome, words);
     switch (id.action) {
       case 'maybe':
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.signUp(partyId, member, PartyStatus.Interested),
-        );
       case 'join':
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.signUp(partyId, member, PartyStatus.Coming),
-        );
       case 'here':
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.signUp(partyId, member, PartyStatus.Present),
-        );
       case 'done':
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.done(partyId, member),
-          doneWords,
-        );
       case 'leave':
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.leave(partyId, member),
-          leftWords,
-        );
+        return pressStatus(attendance, partyId, member, { action: id.action }, click);
       case 'less':
         return answerClick(
           interaction,
@@ -122,12 +93,7 @@ export const partyButtons: ComponentHandler = {
       case 'group': {
         const [group] = id.args;
         if (group === undefined || !isGroupId(group)) throw new UserError(STALE_COMPONENT);
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.joinInto(partyId, member, group),
-        );
+        return pressStatus(attendance, partyId, member, { action: 'group', group }, click);
       }
       case 'time': {
         const party = ctx.parties.get(partyId);
diff --git a/src/discord/member-info.ts b/src/discord/member-info.ts
index c50711902f79ba8cd1fa42cf31859799a43a2901..5f28d03a5898efc8b1f71747027c602f2ae3ccf9 100644
--- a/src/discord/member-info.ts
+++ b/src/discord/member-info.ts
@@ -1,3 +1,4 @@
+import type { GuildMember } from 'discord.js';
 import type { MemberInfo } from '../domain/party/attendance.js';
 import { teamOfRoles } from '../domain/party/party.js';
 import type { LocatedInteraction } from './command.js';
@@ -10,7 +11,14 @@ import type { LocatedInteraction } from './command.js';
  */
 export function memberInfo(interaction: LocatedInteraction): MemberInfo {
   if (!interaction.inCachedGuild()) return {};
-  const { member } = interaction;
+  return guildMemberInfo(interaction.member);
+}
+
+/**
+ * A member's name in the server and their team, as `memberInfo` reads them from an
+ * interaction: also for a member fetched from Discord (a press on the live map, plan 8M-3).
+ */
+export function guildMemberInfo(member: Pick<GuildMember, 'displayName' | 'roles'>): MemberInfo {
   const team = teamOfRoles(member.roles.cache.map((role) => role.name));
   return { name: member.displayName, ...(team ? { team } : {}) };
 }
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index 9ee069a43f76c7316a287d84d6f2c5fa4ec5eec7..6c65bc9b835583878a588324d998a50865eb4a5d 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -19,7 +19,8 @@ import { commandGroup, type SubcommandPart } from './command-group.js';
 import { alsoAs, type ComponentHandler, type Guard, type SimpleCommand } from './command.js';
 import { UserError } from './errors.js';
 import { answer } from './late-reply.js';
-import { InteractionRouter, STALE_COMPONENT } from './router.js';
+import { controlThrottleKey, InteractionRouter, STALE_COMPONENT } from './router.js';
+import { Throttles } from './throttle.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import type { ChatInputCommandInteraction } from 'discord.js';
 import { Rehearsal, REHEARSAL_REFUSAL } from '../services/rehearsal.js';
@@ -881,6 +882,35 @@ describe('InteractionRouter', () => {
     expect(button).toHaveBeenCalledTimes(3);
   });
 
+  it('counts the controls of a kind in the throttles it is given, which the live map shares', async () => {
+    const { ctx } = createTestContext();
+    const now = 1_800_000_000_000;
+    const throttles = new Throttles();
+    const button = ran();
+    const router = new InteractionRouter(
+      ctx,
+      [],
+      [{ kind: 'p', throttle: { uses: 2, perSeconds: 60 }, button }],
+      { now: () => now, throttles },
+    );
+    // Two uses elsewhere (the map's presses) leave none for the post.
+    for (let n = 0; n < 2; n++) {
+      throttles.use(
+        controlThrottleKey('p'),
+        '700000000000000001',
+        { uses: 2, perSeconds: 60 },
+        now,
+      );
+    }
+    const i = fakeButton({ customId: 'p:abc:join', userId: '700000000000000001' });
+    await router.handle(asInteraction(i));
+    expect(button).not.toHaveBeenCalled();
+    expect(i.reply).toHaveBeenCalledWith({
+      content: 'That was a lot of clicks. Try again in 1 minute.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
   it('asks a kind whose controls count differently which limit a control has', async () => {
     const { ctx } = createTestContext();
     const button = ran();
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 04c55694d0b04c0a0cbc4e0ef6d138fa98fb7b04..99a628b69dce2ae0a329eb18d9fd0d65fdb09aa1 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -93,12 +93,25 @@ export interface RouterOptions {
   lateDeferMs?: number;
   /** Starts the timer of a late acknowledgement and gives what cancels it. For tests. */
   setTimer?: (run: () => void, ms: number) => () => void;
+  /**
+   * Where the uses of commands and controls are counted; a router of its own by default. The
+   * bot shares it with the live map, whose presses count as the post's controls (plan 8M-3).
+   */
+  throttles?: Throttles;
+}
+
+/**
+ * The window in which the uses of a kind of control are counted (`Throttles`), unless its limit
+ * counts as a command's: the live map counts its presses of a party's buttons there too.
+ */
+export function controlThrottleKey(kind: string): string {
+  return `component:${kind}`;
 }
 
 export class InteractionRouter {
   private readonly commands = new Map<string, CommandModule>();
   private readonly components = new Map<string, ComponentHandler>();
-  private readonly throttles = new Throttles();
+  private readonly throttles: Throttles;
   /** The commands Discord shows to staff only (`default_member_permissions`), by name. */
   private readonly staffOnly = new Set<string>();
   private readonly now: () => number;
@@ -114,6 +127,7 @@ export class InteractionRouter {
     this.now = options.now ?? Date.now;
     this.lateDeferMs = options.lateDeferMs ?? LATE_DEFER_MS;
     this.setTimer = options.setTimer;
+    this.throttles = options.throttles ?? new Throttles();
     for (const command of commands) {
       if (this.commands.has(command.data.name))
         throw new Error(`Duplicate command /${command.data.name}`);
@@ -364,7 +378,7 @@ export class InteractionRouter {
       if (throttle) {
         // A limit shared with a command counts in that command's window, as the command's uses
         // are counted; the others in the kind's own, each limit by itself where they vary.
-        const key = `component:${handler.kind}`;
+        const key = controlThrottleKey(handler.kind);
         const counted =
           throttle.as ?? (varies ? `${key}\n${throttle.perSeconds}/${throttle.uses}` : key);
         const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
diff --git a/src/discord/web-members.test.ts b/src/discord/web-members.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9acfeb40bd1cbe33b15a387a7ac8355494096104
--- /dev/null
+++ b/src/discord/web-members.test.ts
@@ -0,0 +1,58 @@
+import { Collection, DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { DiscordWebMembers } from './web-members.js';
+
+const SERVER = '412345678901234567';
+const USER = '700000000000000001';
+
+function apiError(code: number, status: number): DiscordAPIError {
+  return new DiscordAPIError({ code, message: 'no' }, code, status, 'GET', '/x', {});
+}
+
+/**
+ * `DiscordWebMembers` over a client whose cache has the one server, whose `members.fetch`
+ * answers what `fetched` gives (or rejects with it); `asked` records each fetch's options.
+ */
+function setup(fetched: () => unknown) {
+  const asked: unknown[] = [];
+  const guild = {
+    members: {
+      fetch: (options: unknown) => {
+        asked.push(options);
+        const answer = fetched();
+        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
+      },
+    },
+  };
+  const client = { guilds: { cache: new Collection([[SERVER, guild]]) } } as unknown as Client;
+  return { members: new DiscordWebMembers(client), asked };
+}
+
+const member = (displayName: string, roles: string[]) => ({
+  id: USER,
+  displayName,
+  roles: { cache: new Collection(roles.map((name, i) => [String(i), { name }])) },
+});
+
+describe('the member who presses a button on the live map, asked of Discord', () => {
+  it('is fetched fresh, with the name and team a button of the post would carry', async () => {
+    const { members, asked } = setup(() => member('Alice', ['Trainer', 'Mystic']));
+    expect(await members.acting(SERVER, USER)).toEqual({
+      id: USER,
+      name: 'Alice',
+      team: 'mystic',
+    });
+    expect(asked).toEqual([{ user: USER, force: true }]);
+  });
+
+  it('is nobody when not in the server, or in a server the bot is not in', async () => {
+    const { members } = setup(() => apiError(RESTJSONErrorCodes.UnknownMember, 404));
+    expect(await members.acting(SERVER, USER)).toBeUndefined();
+    expect(await members.acting('412345678901234999', USER)).toBeUndefined();
+  });
+
+  it('rejects when Discord cannot be asked', async () => {
+    const { members } = setup(() => apiError(0, 503));
+    await expect(members.acting(SERVER, USER)).rejects.toThrow();
+  });
+});
diff --git a/src/discord/web-members.ts b/src/discord/web-members.ts
new file mode 100644
index 0000000000000000000000000000000000000000..83eed94791a262d7aac4eb356ba76634d4f91f71
--- /dev/null
+++ b/src/discord/web-members.ts
@@ -0,0 +1,22 @@
+import type { Client } from 'discord.js';
+import type { Member } from '../services/attendance-service.js';
+import { fetchGuildMember } from './member-directory.js';
+import { guildMemberInfo } from './member-info.js';
+
+/**
+ * Who presses a button of a party on the live map (plan 8M-3), as a button of the post would
+ * carry them (`actingMember`: their name in the server and their team), fetched fresh from
+ * Discord every time (`fetchGuildMember(…, true)`): a member who left a minute ago, or whose
+ * roles changed, is seen as they are now. Undefined for somebody who is not in the server;
+ * rejects when Discord cannot be asked (nothing is written then).
+ */
+export class DiscordWebMembers {
+  constructor(private readonly client: Client) {}
+
+  async acting(guildId: string, userId: string): Promise<Member | undefined> {
+    const guild = this.client.guilds.cache.get(guildId);
+    if (!guild) return undefined;
+    const member = await fetchGuildMember(guild, userId, true);
+    return member && { id: member.id, ...guildMemberInfo(member) };
+  }
+}
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 7eb4f3193ae03d9ce232e67acec94f19bc425f05..85303879b5ce02bd8a26ce1bb1ecf33292859afb 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -1,6 +1,7 @@
 /**
- * What `GET /s/<guild>/api/parties` answers (`partyView`), as the page reads it (spec 3.2). Types
- * alone, with no import: the page's bundle (`src/web/client/`) takes them without the server's
+ * What `GET /s/<guild>/api/parties` answers (`partyView`), and what a press of a button
+ * answers, as the page reads them (spec 3.2, 3.3). Types and the list of actions alone, with no
+ * import: the page's bundle (`src/web/client/`) takes them without the server's
  * code. Nobody is named here: no member's name or id, no reporter, no maker; attendees are counts.
  */
 
diff --git a/src/render/text.test.ts b/src/render/text.test.ts
index e31aa59cd9226b6d521fb5115b2fd5d9a21f2f19..23a9d705d0ef689af208c223ba043b727050b44b 100644
--- a/src/render/text.test.ts
+++ b/src/render/text.test.ts
@@ -15,6 +15,7 @@ import {
   timestamp,
   titleCase,
   truncate,
+  unplain,
 } from './text.js';
 
 describe('plain', () => {
@@ -77,6 +78,33 @@ describe('plain', () => {
   });
 });
 
+describe('unplain', () => {
+  it('gives back exactly the one-line text that plain was given', () => {
+    const labels = [
+      '1. north_hills',
+      'meet at the `gate`',
+      '<3 the park',
+      '@everyone come',
+      'a @here b',
+      'north_hills and __under__',
+      '**bold** *it* ~~gone~~ ||secret||',
+      'a back\\slash, \\* and \\\\',
+      '```code``` and ``two``',
+      '[link](https://example.com) [ [a](b)',
+      '> quoted',
+      '-# small',
+      '- item',
+      '# big',
+      '<:pine_cone:123> <@200000000000000002> <#1> <t:1:R>',
+    ];
+    for (const label of labels) expect(unplain(plain(label))).toBe(label);
+  });
+
+  it('leaves text without escapes as it is', () => {
+    expect(unplain('You are coming, in group B.')).toBe('You are coming, in group B.');
+  });
+});
+
 describe('plainNoLinks', () => {
   it('leaves no address a client would make a link of, with or without a scheme', () => {
     expect(plainNoLinks('free coins https://evil.example/a_b')).toBe(
diff --git a/src/render/text.ts b/src/render/text.ts
index 914476d30a0f1e62cac81ee32afb08aa2a9c953c..a056c7d13dc48302974e61340549d590b84e1fb9 100644
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -65,6 +65,21 @@ export function plain(text: string): string {
   );
 }
 
+/**
+ * The text `plain` was given, from what it made: for a page that sets a sentence of the bot as
+ * text (the live map), where an escape would show. Every backslash `plain` wrote escapes the
+ * character after it (it escapes a typed backslash too), and the zero-width spaces it put after
+ * `<` and after the `@` of a mass mention are taken out, one each. Only `plain`'s white space is
+ * lost (runs of it are one space); a zero-width space a member typed after such an `@` cannot be
+ * told from `plain`'s.
+ */
+export function unplain(text: string): string {
+  return text.replace(
+    /\\(.)|<\u200b|@\u200b(?=everyone|here)/gsu,
+    (match, escaped?: string) => escaped ?? match.charAt(0),
+  );
+}
+
 /**
  * What a client makes a link of without any Markdown: the colon of a scheme (`https://`, also
  * with a backslash a member typed before a slash, which the client takes away again), the dot
diff --git a/src/web/party-press.test.ts b/src/web/party-press.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9a05b97221ada30a7740aa08fc079ae3de789336
--- /dev/null
+++ b/src/web/party-press.test.ts
@@ -0,0 +1,279 @@
+import { MessageFlags } from 'discord.js';
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID, fakeButton } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { createdMeetup, partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { ACTION_THROTTLE } from '../commands/parties/reply.js';
+import { components } from '../components/index.js';
+import { controlThrottleKey, InteractionRouter } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { PressAnswer } from '../domain/web/party-data.js';
+import { PARTY_KIND } from '../render/party-controls.js';
+
+const press = (partyId: string, action: string) =>
+  `/s/${FAKE_GUILD_ID}/api/parties/${partyId}/${action}`;
+
+/**
+ * A party of the services of a test (`reportedRaid` by default) on the map: Alice a member of
+ * the server (in the directory and fetched fresh as `Alice`, team mystic), the web server's
+ * clock the parties' own.
+ */
+async function onTheMap<M extends Awaited<ReturnType<typeof partyServiceWith>>>(
+  made: M,
+  throttles = new Throttles(),
+) {
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'mystic').add(BOB, 'Bob');
+  const web = webServerWith({ members, parties: partyWebWith(made, { acting, throttles }) });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const post = async (url: string, body: unknown = {}, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<PressAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  return { made, web, acting, members, headers, post, throttles };
+}
+
+describe('pressing the buttons of a party on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("signs the member up as the post's Join does: the name and team fetched fresh, the line in the post, the answer in the post's words", async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const answer = await map.post(press(map.made.party.id, 'join'));
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({ ok: true, text: 'You are coming.' });
+    expect(answer.json.party).toMatchObject({
+      kind: 'raid',
+      id: map.made.party.id,
+      attendance: { mine: { status: 'coming', group: 'A' } },
+    });
+    expect(map.made.current().attendees[ALICE]).toMatchObject({
+      status: PartyStatus.Coming,
+      name: 'Alice',
+      team: 'mystic',
+    });
+    expect(map.acting.asked).toEqual([`${FAKE_GUILD_ID}:${ALICE}`]);
+    await map.made.attendance.flush();
+    expect(map.made.said()).toContain('**Alice** (<@200000000000000002>) is coming.');
+  });
+
+  it('takes Interested, Here, Leave and Join of a group, each as its button', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const id = map.made.party.id;
+    expect((await map.post(press(id, 'interested'))).json.text).toBe('You are interested.');
+    expect((await map.post(press(id, 'here'))).json.text).toBe('You are here.');
+    expect((await map.post(press(id, 'join'), { group: 'B' })).json).toMatchObject({
+      ok: false,
+      text: 'This raid has no such group.',
+    });
+    expect((await map.post(press(id, 'leave'))).json).toMatchObject({
+      ok: true,
+      text: 'You have left this raid.',
+      party: { attendance: { mine: null } },
+    });
+    expect(map.made.current().attendees[ALICE]).toBeUndefined();
+  });
+
+  it("answers Done on an egg with the post's refusal", async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const answer = await map.post(press(map.made.party.id, 'done'));
+    expect(answer.status).toBe(422);
+    expect(answer.json).toMatchObject({ ok: false, text: 'This raid has not hatched yet.' });
+  });
+
+  it('lets the member into a forum they cannot see, as signing up on a copy does, and out again', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    map.made.gateway.shutOut(WEST_FORUM, ALICE);
+    await map.post(press(map.made.party.id, 'join'));
+    await map.made.access.flush();
+    expect(map.made.gateway.admitted.get(WEST_FORUM)?.has(ALICE)).toBe(true);
+    await map.post(press(map.made.party.id, 'leave'));
+    await map.made.access.flush();
+    expect(map.made.gateway.admitted.get(WEST_FORUM)?.has(ALICE)).toBe(false);
+  });
+
+  it('refuses a member somebody keeps out of the forum, and changes nothing', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    const answer = await map.post(press(map.made.party.id, 'join'));
+    expect(answer.status).toBe(403);
+    expect(map.made.current().attendees[ALICE]).toBeUndefined();
+  });
+
+  it('answers a party that has ended as its button would, never reading it from the database', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    await map.made.service.end(map.made.party.id);
+    // The party has left the store: what kind it was is known only from what only a raid has.
+    const raid = await map.post(press(map.made.party.id, 'join'));
+    expect(raid.status).toBe(409);
+    expect(raid.json).toEqual({ ok: false, text: 'This has ended.', party: null });
+    expect((await map.post(press(map.made.party.id, 'done'))).json.text).toBe('This raid is over.');
+    expect((await map.post(press('00000000-0000-4000-8000-00000000ffff', 'here'))).json.text).toBe(
+      'This has ended.',
+    );
+  });
+
+  it("answers a party of the meetup's kind in its own words", async () => {
+    const map = await onTheMap(await createdMeetup());
+    web = map.web;
+    const id = map.made.party.id;
+    expect((await map.post(press(id, 'join'))).json.text).toBe('You are coming.');
+    expect((await map.post(press(id, 'leave'))).json.text).toBe('You have left this meetup.');
+  });
+
+  it('counts against the same limit as the buttons of the post', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const map = await onTheMap(await reportedRaid(), throttles);
+    web = map.web;
+    const answer = await map.post(press(map.made.party.id, 'join'));
+    expect(answer.status).toBe(429);
+    expect(answer.json.error).toBe('That was a lot of clicks. Try again in 1 minute.');
+    expect(answer.headers['retry-after']).toBe('60');
+    expect(map.made.current().attendees[ALICE]).toBeUndefined();
+  });
+
+  it('counts only the presses it carries out: one refused for who presses does not use the budget', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const map = await onTheMap(await reportedRaid(), throttles);
+    web = map.web;
+    const url = (action: string) => press(map.made.party.id, action);
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.post(url('join'))).status).toBe(403);
+    map.made.gateway.barred.delete(WEST_FORUM);
+    map.acting.remove(ALICE);
+    expect((await map.post(url('join'))).status).toBe(403);
+    map.acting.add(ALICE, 'Alice', 'mystic');
+    expect((await map.post(url('join'))).status).toBe(200);
+    expect((await map.post(url('here'))).status).toBe(429);
+  });
+
+  it('tells somebody who is not a member nothing of a party id: ended or unknown, 403', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    await map.made.service.end(map.made.party.id);
+    map.acting.remove(ALICE);
+    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(403);
+    expect((await map.post(press('00000000-0000-4000-8000-00000000ffff', 'join'))).status).toBe(
+      403,
+    );
+  });
+
+  it("uses up the budget of the post's buttons: the router refuses a click after 30 presses", async () => {
+    const throttles = new Throttles();
+    const map = await onTheMap(await reportedRaid(), throttles);
+    web = map.web;
+    const { ctx } = createTestContext();
+    const router = new InteractionRouter(ctx, [], components, { now: () => PARTY_NOW, throttles });
+    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
+      expect((await map.post(press(map.made.party.id, n % 2 ? 'join' : 'interested'))).status).toBe(
+        200,
+      );
+    }
+    const click = fakeButton({ customId: `party:${map.made.party.id}:join`, userId: ALICE });
+    await router.handle(click as never);
+    expect(click.reply).toHaveBeenCalledWith({
+      content: 'That was a lot of clicks. Try again in 1 minute.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it("gives the post's answer as plain text: what a member wrote reads as they wrote it", async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const id = map.made.party.id;
+    const bob = { id: BOB, name: 'Bob' };
+    const label = '1. north_hills `gate` <3 @everyone';
+    await map.made.attendance.signUp(id, bob, PartyStatus.Coming);
+    await map.made.attendance.newGroup(id, bob);
+    await map.made.attendance.labelGroup(id, bob, label);
+    const answer = await map.post(press(id, 'join'), { group: 'B' });
+    expect(answer.json).toMatchObject({ ok: true, text: `You are coming, in group B (${label}).` });
+  });
+
+  it('is refused without the session, its CSRF token or Pine as its origin, before anything is asked', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const url = press(map.made.party.id, 'join');
+    const { origin: _origin, ...noOrigin } = map.headers;
+    const { 'x-pine-csrf': _csrf, ...noToken } = map.headers;
+    expect((await map.post(url, {}, noOrigin)).status).toBe(403);
+    expect((await map.post(url, {}, noToken)).status).toBe(403);
+    expect(
+      (await map.post(url, {}, { ...map.headers, origin: 'https://evil.example' })).status,
+    ).toBe(403);
+    expect(map.acting.asked).toEqual([]);
+  });
+
+  it('refuses an action the post has not, a malformed body, and a member who left the server', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const id = map.made.party.id;
+    expect((await map.post(press(id, 'more'))).status).toBe(404);
+    expect((await map.post(press(id, 'join'), { group: 'Z' })).status).toBe(400);
+    expect((await map.post(press(id, 'join'), { group: 'A', more: 1 })).status).toBe(400);
+    map.acting.remove(ALICE);
+    expect((await map.post(press(id, 'join'))).status).toBe(403);
+  });
+
+  it('refuses while Discord cannot be reached: nothing is changed on roles nobody checked', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    map.acting.failing = new Error('Discord is away');
+    const answer = await map.post(press(map.made.party.id, 'join'));
+    expect(answer.status).toBe(503);
+    expect(answer.json.error).toBe(
+      'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.',
+    );
+    expect(map.made.current().attendees[ALICE]).toBeUndefined();
+  });
+
+  it('logs a press as a command is logged: who, where, which party, what; never a text', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    await map.post(press(map.made.party.id, 'join'));
+    const logged = map.web.entries.find((entry) => entry.msg === 'a party was pressed on the map');
+    expect(logged).toMatchObject({
+      user: ALICE,
+      guild: FAKE_GUILD_ID,
+      party: map.made.party.id,
+      action: 'join',
+      outcome: 'ok',
+    });
+    expect(JSON.stringify(logged)).not.toContain('Alice');
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index c48c86468dbd5fd02ef7d6c8bb90317f8be77b68..d4b10427c9ea54ea430cd16420f7ffb86419e99c 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -1,8 +1,32 @@
-import type { FastifyInstance } from 'fastify';
-import type { Party, RaidParty } from '../domain/party/party.js';
-import { partyView, type PartyViewInput, type RaidLook } from '../domain/web/party-view.js';
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
+import { z } from 'zod';
+import {
+  ACTION_THROTTLE,
+  outcomeWords,
+  partyOver,
+  pressStatus,
+  type StatusPress,
+} from '../commands/parties/reply.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
+import { controlThrottleKey } from '../discord/router.js';
+import { waitText, type Throttles } from '../discord/throttle.js';
+import { isGroupId, type GroupId, type Party, type RaidParty } from '../domain/party/party.js';
+import { MAP_ACTIONS, type MapAction, type PressAnswer } from '../domain/web/party-data.js';
+import {
+  mapParty,
+  partyView,
+  type PartyViewInput,
+  type RaidLook,
+} from '../domain/web/party-view.js';
+import { isRaidAction, PARTY_KIND } from '../render/party-controls.js';
+import { unplain } from '../render/text.js';
+import type {
+  AttendanceOutcome,
+  AttendanceService,
+  Member,
+} from '../services/attendance-service.js';
 import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
 import { PartyViewers } from './party-viewers.js';
@@ -32,8 +56,70 @@ export interface PartyWebDeps {
   forums: { memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> };
   /** `settings.timezone`: the posts' times, which the page shows. */
   zone: string;
+  /** What a press does: what the post's buttons call (`pressStatus`). */
+  attendance: Pick<AttendanceService, 'signUp' | 'joinInto' | 'done' | 'leave' | 'limits'>;
+  /** Who presses, fetched fresh from Discord as a button carries them (`DiscordWebMembers`). */
+  acting: ActingMembers;
+  /**
+   * Where the uses of the post's controls are counted (the router's): a press on the map counts
+   * in the same window as a click on the post (`ACTION_THROTTLE`).
+   */
+  throttles: Throttles;
+}
+
+/** The member who presses, as Discord has them now; undefined for somebody not in the server. */
+export interface ActingMembers {
+  /** Rejects when Discord cannot be asked. */
+  acting(guildId: string, userId: string): Promise<Member | undefined>;
+}
+
+/** The presses one address may send in a minute, whoever sends them. */
+export const PRESSES_PER_ADDRESS_MINUTE = 60;
+
+/** What a press answers while Discord cannot say who presses. */
+const UNREACHABLE =
+  'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.';
+
+/** The body of a press: the group of "Join B", only with `join`. Anything else is malformed. */
+const pressBodySchema = z
+  .object({
+    group: z
+      .string()
+      .regex(/^[A-E]$/u)
+      .optional(),
+  })
+  .strict();
+
+/** The status of each outcome of a press. */
+const PRESS_STATUS: Readonly<Record<AttendanceOutcome['kind'], number>> = {
+  ok: 200,
+  refused: 422,
+  gone: 409,
+};
+
+/** The post's button a press on the map is (`StatusPress`). */
+function statusPress(action: MapAction, group: GroupId | undefined): StatusPress {
+  switch (action) {
+    case 'interested':
+      return { action: 'maybe' };
+    case 'join':
+      return group === undefined ? { action: 'join' } : { action: 'group', group };
+    case 'here':
+    case 'leave':
+    case 'done':
+      return { action };
+  }
+}
+
+function isMapAction(value: string): value is MapAction {
+  return (MAP_ACTIONS as readonly string[]).includes(value);
 }
 
+/** A press's address: `/api/parties/<party id>/<action>`. */
+type PressRequest = FastifyRequest<{
+  Params: { guild: string; party: string; action: string };
+}>;
+
 /**
  * The live map's parties (`/s/<guild>/api/parties`, spec 3.2 to 3.4): the active parties of the
  * server as the member who asks sees them (`partyView`), for members only (`PartyViewers`: 401
@@ -105,4 +191,117 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return reply.type('application/json; charset=utf-8').send(body);
     },
   );
+
+  // A press of a party's button (spec 3.3): before the body is read (`onRequest`), at most
+  // `PRESSES_PER_ADDRESS_MINUTE` from one address, the guard of every POST (Origin, session,
+  // CSRF token) and an action the post has. Then, so that nobody but a member learns which party
+  // ids exist and a press refused for who presses is not counted: the member as Discord has them
+  // now, the party in the store and of this server, how they stand to its forum, and only then
+  // the member's `ACTION_THROTTLE` in the window of the post's controls; then the press as the
+  // post's button makes it (`pressStatus`).
+  const addressLimiter = new RateLimiter({ uses: PRESSES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const knownAction = async (request: PressRequest, reply: FastifyReply) => {
+    if (!isMapAction(request.params.action)) return sendFailure(request, reply, 404);
+  };
+  scope.post(
+    '/api/parties/:party/:action',
+    {
+      onRequest: [
+        limitedPerAddress(addressLimiter, { now: deps.now }),
+        postGuard(sessions, deps.settings.publicUrl),
+        knownAction,
+      ],
+    },
+    async (request: PressRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const { guild, party: partyId, action } = request.params;
+      const body = pressBodySchema.safeParse(request.body ?? {});
+      if (!isMapAction(action) || !body.success) return sendFailure(request, reply, 400);
+      const { group } = body.data;
+      if (group !== undefined && (action !== 'join' || !isGroupId(group))) {
+        return sendFailure(request, reply, 400);
+      }
+      const press = statusPress(action, group);
+      const { userId } = session;
+      const unreachable = (err: unknown) => {
+        deps.log.warn(
+          { err, guild, user: userId },
+          'could not ask Discord who pressed a button of a party on the web pages',
+        );
+        return reply.code(503).send({ error: UNREACHABLE });
+      };
+      let member: Member | undefined;
+      try {
+        member = await parties.acting.acting(guild, userId);
+      } catch (err) {
+        return unreachable(err);
+      }
+      // Not a member: whatever the party, nothing is said of it.
+      if (!member) return sendFailure(request, reply, 403);
+      // The party as the store has it: one that ended is not there (nor read from anywhere).
+      const own = await ownParties(guild);
+      const party = parties.store.get(partyId);
+      if (party?.guildId !== own.row || party.status !== 'active') {
+        const over = isRaidAction(press.action) ? ({ type: 'raid' } as const) : undefined;
+        return reply
+          .code(PRESS_STATUS.gone)
+          .send({ ok: false, text: partyOver(over), party: null });
+      }
+      let access: MemberAccess | undefined;
+      try {
+        access =
+          party.forumChannelId === null
+            ? undefined
+            : await parties.forums.memberAccess(party.forumChannelId, userId);
+      } catch (err) {
+        return unreachable(err);
+      }
+      // Kept out of the forum on purpose: `AccessService` would not let them in.
+      if (access === 'barred') return sendFailure(request, reply, 403);
+      const wait = parties.throttles.use(
+        controlThrottleKey(PARTY_KIND),
+        userId,
+        ACTION_THROTTLE,
+        deps.now(),
+      );
+      if (wait !== undefined) {
+        return reply
+          .code(429)
+          .header('retry-after', String(wait))
+          .send({ error: `That was a lot of clicks. Try again in ${waitText(wait)}.` });
+      }
+      const { kind, said } = await pressStatus(
+        parties.attendance,
+        partyId,
+        member,
+        press,
+        (outcome, words) => {
+          // As `answerClick` names the party: as the store has it now, or by the button.
+          const now = parties.store.get(partyId);
+          const named =
+            now ?? (isRaidAction(press.action) ? ({ type: 'raid' } as const) : undefined);
+          return Promise.resolve({
+            kind: outcome.kind,
+            said: outcomeWords(parties.attendance.limits(), named, outcome, words),
+          });
+        },
+      );
+      deps.log.info(
+        { user: userId, guild, party: partyId, action, outcome: kind },
+        'a party was pressed on the map',
+      );
+      const after = parties.store.get(partyId);
+      const shown =
+        after &&
+        mapParty(after, inputFor(guild, own, userId, { readOnly: false, barred: new Set() }));
+      const answer: PressAnswer = {
+        ok: said.ok,
+        text: unplain(said.text),
+        party: shown ?? null,
+      };
+      return reply.code(PRESS_STATUS[kind]).send(answer);
+    },
+  );
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index 97e252dc4919d53012b2b004223dbd7c1a79c381..7de698908082bb606bc6a08d2b1c5d2500cfe388 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -15,7 +15,10 @@ import { GeoCache, type GeoSources } from '../../src/web/geo-cache.js';
 import type { RegionStaffSource, StaffAnswer } from '../../src/web/region-staff.js';
 import { LoginLinks } from '../../src/web/login-links.js';
 import type { WebAssets } from '../../src/web/page.js';
-import type { PartyWebDeps } from '../../src/web/party-routes.js';
+import type { ActingMembers, PartyWebDeps } from '../../src/web/party-routes.js';
+import { Throttles } from '../../src/discord/throttle.js';
+import type { Team } from '../../src/domain/party/party.js';
+import type { Member } from '../../src/services/attendance-service.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
 import { raidLook } from '../../src/render/raid-post.js';
 import { inThisThread } from '../../src/web/save-check.js';
@@ -143,6 +146,38 @@ const NOTHING: GeoSources = {
   channels: { serverChannels: () => undefined },
 };
 
+/**
+ * Who presses a button on the live map, as Discord has them, for tests: nobody is a member of
+ * anything until `add` says so. `asked` records every question as `<guild>:<user>`; set
+ * `failing` to make every question fail, as Discord being away would.
+ */
+export class FakeActingMembers implements ActingMembers {
+  readonly asked: string[] = [];
+  failing: Error | undefined;
+  private readonly members = new Map<string, Member>();
+
+  /** Makes somebody a member of a server (default: the server of the fake interactions). */
+  add(userId: string, name: string, team?: Team, guildId = FAKE_GUILD_ID): this {
+    this.members.set(`${guildId}:${userId}`, { id: userId, name, ...(team ? { team } : {}) });
+    return this;
+  }
+
+  /** Somebody leaves a server. */
+  remove(userId: string, guildId = FAKE_GUILD_ID): void {
+    this.members.delete(`${guildId}:${userId}`);
+  }
+
+  acting(guildId: string, userId: string): Promise<Member | undefined> {
+    this.asked.push(`${guildId}:${userId}`);
+    if (this.failing) return Promise.reject(this.failing);
+    const member = this.members.get(`${guildId}:${userId}`);
+    return Promise.resolve(member && { ...member });
+  }
+}
+
+const noAttendance = (): Promise<never> =>
+  Promise.reject(new Error('no parties in this test: give partyWebWith'));
+
 /** No parties: the live map of a server without any. */
 const NO_PARTIES: PartyWebDeps = {
   guilds: { idFor: () => Promise.resolve(undefined) },
@@ -150,14 +185,30 @@ const NO_PARTIES: PartyWebDeps = {
   look: () => ({}),
   forums: { memberAccess: () => Promise.resolve(undefined) },
   zone: 'America/New_York',
+  attendance: {
+    signUp: noAttendance,
+    joinInto: noAttendance,
+    done: noAttendance,
+    leave: noAttendance,
+    limits: () => {
+      throw new Error('no parties in this test: give partyWebWith');
+    },
+  },
+  acting: new FakeActingMembers(),
+  throttles: new Throttles(),
 };
 
 /**
  * The live map's parties over the party services of a test (`partyServiceWith`, `reportedRaid`
- * and the like), as the bot wires them: the store, the fake gateway's forums, how the party
- * service shows a raid, the server of the fake interactions as row 1. Pass as `parties`.
+ * and the like), as the bot wires them: the store, the attendance service, the fake gateway's
+ * forums, how the party service shows a raid, the server of the fake interactions as row 1.
+ * Pass as `parties`. Who presses is `acting` (nobody by default); the window of the post's
+ * controls is `throttles` (one of the test's, to share with a router or fill beforehand).
  */
-export function partyWebWith(made: Awaited<ReturnType<typeof partyServiceWith>>): PartyWebDeps {
+export function partyWebWith(
+  made: Awaited<ReturnType<typeof partyServiceWith>>,
+  options: { acting?: ActingMembers; throttles?: Throttles } = {},
+): PartyWebDeps {
   return {
     guilds: {
       idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
@@ -166,6 +217,9 @@ export function partyWebWith(made: Awaited<ReturnType<typeof partyServiceWith>>)
     look: (raid) => raidLook(made.service.view(raid)),
     forums: made.gateway,
     zone: made.settings.timezone,
+    attendance: made.attendance,
+    acting: options.acting ?? new FakeActingMembers(),
+    throttles: options.throttles ?? new Throttles(),
   };
 }
````

### Task 5: Live map: the parties on the page, with their buttons

Prototype commit: `e1b45adbe3b5e503a6373d69a8ad35456aa38c51`

The map page polls `/api/parties` every 20 s while visible, at once when shown and after a press, stopping on 401/403; one marker per gym listing every raid there, trains as lines over their route with the current stop, meetups and raids at gyms off the map in a side panel; popups with the post's buttons and countdowns in the posts' zone, all as nodes; the read-only line in an element of its own; a fresh CSRF token after a restart.

**Files:**

```
 src/web/client/main.ts         |  19 +++-
 src/web/client/map.css         | 108 +++++++++++++++++++-
 src/web/client/parties.test.ts | 447 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/parties.ts      | 424 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.ts  | 218 ++++++++++++++++++++++++++++++++++++++++
 src/web/page.test.ts           |  10 ++
 src/web/page.ts                |  10 +-
 7 files changed, 1228 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/parties.test.ts src/web/page.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/web/client/main.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/page.test.ts src/web/page.ts` and `npx eslint src/web/client/main.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/page.test.ts src/web/page.ts`.
- [ ] **Step 4: Check the transcription:** `git diff e1b45adbe3b5e503a6373d69a8ad35456aa38c51 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Live map: the parties on the page, with their buttons`, the paragraph above as the body and the trailer, staging exactly
  `src/web/client/main.ts src/web/client/map.css src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/page.test.ts src/web/page.ts`.

````diff
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index c8b92e49ec42c1e8c3bf15f4a0f52476e3a1031b..66369b38fa5102cc4d2d7c5438761e5928e8ed6c 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -4,12 +4,14 @@ import { addTiles, byId, getJson, say, showAccount } from './common.js';
 import { gymFilter } from './filter.js';
 import { tileLayers } from './layers.js';
 import { loginNotice } from './notice.js';
+import { showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 
 /**
  * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
  * `layers.ts`, the server's regions labelled with their channels, its gyms as dots (elite raid
- * gyms in their own colour) with a popup each, a filter box, and the header with the login.
+ * gyms in their own colour) with a popup each, a filter box, and the header with the login;
+ * for a member, the server's parties (`party-layer.ts`, plan 8M-3).
  * Everything from data is set as text (`renderNode`, `textContent`): Leaflet sets string
  * content of tooltips, popups and attributions as HTML, so data goes to it as nodes.
  */
@@ -20,7 +22,8 @@ const GYM_COLOUR = '#2d7a3a';
 const ELITE_COLOUR = '#8e3ab0';
 const REGION_COLOUR = '#3060c0';
 
-async function showGeo(map: L.Map, guild: string): Promise<void> {
+/** Shows the regions and gyms; gives the gyms by id, where the parties are put. */
+async function showGeo(map: L.Map, guild: string): Promise<Map<number, MapGym>> {
   const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
   const names = new Map(view.regions.map((region) => [region.id, region.name]));
   const regions = L.featureGroup();
@@ -73,6 +76,7 @@ async function showGeo(map: L.Map, guild: string): Promise<void> {
     });
     if (matches.length === 1) matches[0]?.dot.openPopup();
   });
+  return new Map(view.gyms.map((gym) => [gym.id, gym]));
 }
 
 function start(): void {
@@ -89,8 +93,15 @@ function start(): void {
     say(notice.text);
     history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
   }
-  void showAccount(guild, data.login === 'discord' ? 'discord' : 'links');
-  showGeo(map, guild).catch(() => say('The map could not be loaded. Try again in a moment.'));
+  const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links');
+  showGeo(map, guild)
+    .then(async (gyms) => {
+      // The parties of the server for a member who is logged in (plan 8M-3); while Discord
+      // cannot be reached the server says whether it still knows them as a member.
+      const me = await account;
+      if (me.loggedIn && (me.member || me.readOnly)) showParties(map, guild, me, gyms);
+    })
+    .catch(() => say('The map could not be loaded. Try again in a moment.'));
 }
 
 start();
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 0961bbe266a7ccdd674b7a69ea0ef835cfb045ce..f61b0d1421c464a3c3bd766890e8c468b45ce2e3 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -66,18 +66,124 @@ body {
   opacity: 0.9;
 }
 
-#notice {
+#notice,
+#read-only {
   margin: 0;
   padding: 6px 12px;
   background: #fff4cc;
   border-bottom: 1px solid #e0c060;
 }
 
+#content {
+  flex: 1;
+  display: flex;
+  min-height: 300px;
+}
+
 #map {
   flex: 1;
   min-height: 300px;
 }
 
+#parties {
+  width: 300px;
+  overflow-y: auto;
+  padding: 8px 12px;
+  border-left: 1px solid #ccd;
+  background: #fafbfc;
+}
+
+#parties h2 {
+  margin: 0 0 8px;
+  font-size: 16px;
+}
+
+@media (max-width: 700px) {
+  #content {
+    flex-direction: column;
+  }
+
+  #parties {
+    width: auto;
+    max-height: 40vh;
+    border-left: 0;
+    border-top: 1px solid #ccd;
+  }
+}
+
+.party-list {
+  margin: 0;
+  padding: 0;
+  list-style: none;
+}
+
+.party-list > li {
+  padding: 8px 0;
+  border-bottom: 1px solid #e3e6ea;
+}
+
+.party-popup .name {
+  display: block;
+  font-size: 15px;
+}
+
+.party-popup .tier {
+  font-weight: 600;
+}
+
+.party-popup.raids > .raid + .raid {
+  margin-top: 8px;
+  padding-top: 8px;
+  border-top: 1px solid #e3e6ea;
+}
+
+.party-popup .countdown {
+  margin-left: 6px;
+  color: #555;
+}
+
+.party-popup .counts,
+.party-popup .stop {
+  color: #444;
+}
+
+.party-popup .mine {
+  margin-top: 4px;
+  font-weight: 600;
+}
+
+.party-popup .presses {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 4px;
+  margin-top: 6px;
+}
+
+.party-popup .press {
+  padding: 3px 10px;
+  border: 1px solid #8a94a6;
+  border-radius: 4px;
+  background: #fff;
+  font: inherit;
+  cursor: pointer;
+}
+
+.party-popup .press:disabled {
+  opacity: 0.5;
+  cursor: default;
+}
+
+.party-popup .post-link {
+  display: inline-block;
+  margin-top: 6px;
+}
+
+.raid-icon {
+  border-radius: 50%;
+  background: rgba(255, 255, 255, 0.85);
+  box-shadow: 0 0 0 2px #c0392b;
+}
+
 .region-label {
   background: rgba(255, 255, 255, 0.85);
   border: 0;
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..eaeab636443cac0cbd09d13b2e74ee693fa9d538
--- /dev/null
+++ b/src/web/client/parties.test.ts
@@ -0,0 +1,447 @@
+import { describe, expect, it } from 'vitest';
+import type { MapAttendance, MapMeetup, MapRaid, MapTrain } from '../../domain/web/party-data.js';
+import {
+  clockTime,
+  countdown,
+  gymPicture,
+  gymRaidsPopup,
+  meetupItem,
+  Poller,
+  PRESS_FAILED,
+  pressLabel,
+  pressParty,
+  raidPopup,
+  raidsAtGyms,
+  readOnlyLine,
+  trainPopup,
+  type PressSteps,
+  type ShowContext,
+} from './parties.js';
+import type { Me } from './notice.js';
+import type { PageNode } from './popup.js';
+
+const ZONE = 'America/New_York';
+/** Tuesday 13 October 2026, 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const MINUTE = 60_000;
+const LINK = 'https://discord.com/channels/412345678901234567/700000000000000001';
+
+const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
+  groups: [{ id: 'A', interested: 1, coming: 3, present: 2 }],
+  mine: null,
+  actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+  ...more,
+});
+
+const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
+  kind: 'raid',
+  id: 'r1',
+  gymId: 1,
+  picture: null,
+  tier: 'Level 5 raid',
+  boss: 'Yveltal',
+  stage: 'egg',
+  hatchTime: NOW + 30 * MINUTE,
+  endTime: NOW + 75 * MINUTE,
+  link: LINK,
+  attendance: attendance(),
+  ...more,
+});
+
+const context: ShowContext = {
+  now: NOW,
+  zone: ZONE,
+  gymName: (id) => (id === 1 ? 'Pinewood Public Library' : id === 2 ? 'Town Fountain' : undefined),
+};
+
+/** Every text of a tree, in order. */
+function texts(node: PageNode): string[] {
+  return [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];
+}
+
+/** The nodes of a tree with this tag. */
+function tagged(node: PageNode, tag: string): PageNode[] {
+  return [
+    ...(node.tag === tag ? [node] : []),
+    ...(node.children ?? []).flatMap((n) => tagged(n, tag)),
+  ];
+}
+
+describe('countdown and clockTime', () => {
+  it('count down in minutes, then hours and minutes', () => {
+    expect(countdown(NOW + 12 * MINUTE + 30_000, NOW)).toBe('in 13 min');
+    expect(countdown(NOW + 65 * MINUTE, NOW)).toBe('in 1 h 5 min');
+    expect(countdown(NOW + 120 * MINUTE, NOW)).toBe('in 2 h');
+    expect(countdown(NOW - MINUTE, NOW)).toBe('now');
+  });
+
+  it('give the time in the zone of the posts, with the day when it is not today', () => {
+    expect(clockTime(NOW + 30 * MINUTE, ZONE, NOW)).toBe('2:30 PM');
+    expect(clockTime(NOW + 24 * 60 * MINUTE, ZONE, NOW)).toBe('Wed, Oct 14, 2:00 PM');
+  });
+});
+
+describe('pressLabel', () => {
+  it("names the post's buttons", () => {
+    expect(
+      [
+        { action: 'interested' },
+        { action: 'join' },
+        { action: 'join', group: 'B' },
+        { action: 'here' },
+        { action: 'done' },
+        { action: 'leave' },
+      ].map((press) => pressLabel(press as never)),
+    ).toEqual(['Interested', 'Join', 'Join B', 'Here', 'Done', 'Leave']);
+  });
+});
+
+describe('raidPopup', () => {
+  it('shows the gym, the raid, its time with a countdown, the counts, and the buttons', () => {
+    const popup = raidPopup(raid(), context);
+    expect(texts(popup)).toEqual([
+      'Pinewood Public Library',
+      'Level 5 raid (egg)',
+      'Hatches as Yveltal',
+      'Hatches at 2:30 PM',
+      'in 30 min',
+      'Interested 1 · Coming 3 · Here 2',
+      'Interested',
+      'Join',
+      'Here',
+      'Open the post',
+    ]);
+    const [timer] = tagged(popup, 'span').filter((node) => node.className === 'countdown');
+    expect(timer?.attributes).toEqual({ 'data-until': String(NOW + 30 * MINUTE) });
+    expect(tagged(popup, 'button').map((button) => button.attributes)).toEqual([
+      { type: 'button', 'data-party': 'r1', 'data-action': 'interested' },
+      { type: 'button', 'data-party': 'r1', 'data-action': 'join' },
+      { type: 'button', 'data-party': 'r1', 'data-action': 'here' },
+    ]);
+    expect(tagged(popup, 'a')[0]?.attributes).toEqual({
+      href: LINK,
+      target: '_blank',
+      rel: 'noopener noreferrer',
+    });
+  });
+
+  it('shows a hatched raid against its boss, the end, the groups and how the member stands', () => {
+    const popup = raidPopup(
+      raid({
+        stage: 'hatched',
+        attendance: attendance({
+          groups: [
+            { id: 'A', interested: 0, coming: 2, present: 0 },
+            { id: 'B', interested: 1, coming: 0, present: 4 },
+          ],
+          mine: { status: 'present', group: 'B' },
+          actions: [
+            { action: 'join', group: 'A' },
+            { action: 'join', group: 'B' },
+            { action: 'done' },
+            { action: 'leave' },
+          ],
+        }),
+      }),
+      { ...context, now: NOW + 40 * MINUTE },
+    );
+    expect(texts(popup)).toEqual([
+      'Pinewood Public Library',
+      'Level 5 raid against Yveltal',
+      'Ends at 3:15 PM',
+      'in 35 min',
+      'Group A: Coming 2',
+      'Group B: Interested 1 · Here 4',
+      'You: Here, group B',
+      'Join A',
+      'Join B',
+      'Done',
+      'Leave',
+      'Open the post',
+    ]);
+    expect(tagged(popup, 'button')[1]?.attributes).toMatchObject({ 'data-group': 'B' });
+  });
+
+  it('says what is not known, and sets every text as text, never markup', () => {
+    const popup = raidPopup(
+      raid({
+        gymId: null,
+        boss: null,
+        hatchTime: null,
+        endTime: null,
+        link: 'javascript:alert(1)',
+      }),
+      context,
+    );
+    expect(texts(popup).slice(0, 3)).toEqual([
+      'Unknown gym',
+      'Level 5 raid (egg)',
+      'Hatch time not known',
+    ]);
+    // Only an address of Discord is a link.
+    expect(tagged(popup, 'a')).toEqual([]);
+  });
+});
+
+describe('the raids of a gym', () => {
+  const elite = raid({
+    id: 'r3',
+    tier: 'Elite raid',
+    boss: 'Mewtwo',
+    picture: 'https://example.test/mewtwo.png',
+    hatchTime: NOW + 120 * MINUTE,
+    endTime: NOW + 180 * MINUTE,
+    attendance: attendance({ groups: [{ id: 'A', interested: 2, coming: 0, present: 0 }] }),
+  });
+
+  it('puts every raid of a gym the map shows on that gym, in order, and the others aside', () => {
+    const atLibrary = raid();
+    const atFountain = raid({ id: 'r2', gymId: 2 });
+    const noGym = raid({ id: 'r4', gymId: null });
+    const unknownGym = raid({ id: 'r5', gymId: 9 });
+    const placed = raidsAtGyms([atLibrary, atFountain, elite, noGym, unknownGym], (id) => id < 3);
+    expect([...placed.atGyms]).toEqual([
+      [1, [atLibrary, elite]],
+      [2, [atFountain]],
+    ]);
+    expect(placed.elsewhere).toEqual([noGym, unknownGym]);
+  });
+
+  it('shows the gym once and each raid of it with its own time, counts, buttons and post', () => {
+    const popup = gymRaidsPopup(1, [raid(), elite], context);
+    expect(texts(popup)).toEqual([
+      'Pinewood Public Library',
+      'Level 5 raid (egg)',
+      'Hatches as Yveltal',
+      'Hatches at 2:30 PM',
+      'in 30 min',
+      'Interested 1 · Coming 3 · Here 2',
+      'Interested',
+      'Join',
+      'Here',
+      'Open the post',
+      'Elite raid (egg)',
+      'Hatches as Mewtwo',
+      'Hatches at 4:00 PM',
+      'in 2 h',
+      'Interested 2 · Coming 0 · Here 0',
+      'Interested',
+      'Join',
+      'Here',
+      'Open the post',
+    ]);
+    expect(tagged(popup, 'button').map((button) => button.attributes?.['data-party'])).toEqual([
+      'r1',
+      'r1',
+      'r1',
+      'r3',
+      'r3',
+      'r3',
+    ]);
+  });
+
+  it("takes the marker's picture from the first raid that has one", () => {
+    expect(gymPicture([raid(), elite])).toBe('https://example.test/mewtwo.png');
+    expect(gymPicture([raid()])).toBeNull();
+  });
+});
+
+describe('readOnlyLine', () => {
+  it('says the map is read-only only while it is', () => {
+    expect(readOnlyLine(true)).toBe('Discord cannot be reached just now, so the map is read-only.');
+    expect(readOnlyLine(false)).toBeUndefined();
+  });
+});
+
+describe('trainPopup and meetupItem', () => {
+  it('show where the train is on its route, and when a meetup is', () => {
+    const train: MapTrain = {
+      kind: 'train',
+      id: 't1',
+      name: 'Saturday <b>legendaries</b>',
+      startTime: NOW + 60 * MINUTE,
+      route: [1, 2, 3],
+      stop: 1,
+      link: LINK,
+      attendance: attendance({ actions: [] }),
+    };
+    expect(texts(trainPopup(train, context))).toEqual([
+      'Saturday <b>legendaries</b>',
+      'Starts at 3:00 PM',
+      'in 1 h',
+      'At stop 2 of 3: Town Fountain',
+      'Interested 1 · Coming 3 · Here 2',
+      'Open the post',
+    ]);
+    expect(texts(trainPopup({ ...train, stop: null }, context))[3]).toBe('Route finished');
+    expect(texts(trainPopup({ ...train, route: [], stop: null }, context))[3]).toBe('No route yet');
+    const meetup: MapMeetup = {
+      kind: 'meetup',
+      id: 'm1',
+      name: 'Community Day picnic',
+      startTime: NOW + 24 * 60 * MINUTE,
+      endTime: null,
+      link: LINK,
+      attendance: attendance({ mine: { status: 'interested', group: 'A' } }),
+    };
+    expect(texts(meetupItem(meetup, context))).toEqual([
+      'Community Day picnic',
+      'Starts Wed, Oct 14, 2:00 PM',
+      'Interested 1 · Coming 3 · Here 2',
+      'You: Interested',
+      'Interested',
+      'Join',
+      'Here',
+      'Open the post',
+    ]);
+  });
+});
+
+/** The page's side of a press: the answers the POSTs get, and what `/api/me` says. */
+function pressSteps(answers: Array<{ status: number; body: unknown } | Error>, me?: Me) {
+  const posted: string[] = [];
+  const steps: PressSteps = {
+    post(csrf) {
+      posted.push(csrf);
+      const next = answers.shift();
+      if (next === undefined) return Promise.reject(new Error('nothing more to answer'));
+      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
+    },
+    me: () => Promise.resolve(me ?? { loggedIn: false }),
+  };
+  return { steps, posted };
+}
+
+describe('pressParty', () => {
+  it("gives the server's answer and the party as it is now", async () => {
+    const party = raid();
+    const { steps, posted } = pressSteps([
+      { status: 200, body: { ok: true, text: 'You are coming.', party } },
+    ]);
+    expect(await pressParty('token', steps)).toEqual({
+      text: 'You are coming.',
+      party,
+      csrf: 'token',
+    });
+    expect(posted).toEqual(['token']);
+  });
+
+  it('says a refusal in its words, and a failure in a few', async () => {
+    const refused = pressSteps([
+      { status: 422, body: { ok: false, text: 'This raid has not hatched yet.', party: null } },
+    ]);
+    expect((await pressParty('token', refused.steps)).text).toBe('This raid has not hatched yet.');
+    const limited = pressSteps([
+      { status: 429, body: { error: 'That was a lot of clicks. Try again in 1 minute.' } },
+    ]);
+    expect((await pressParty('token', limited.steps)).text).toBe(
+      'That was a lot of clicks. Try again in 1 minute.',
+    );
+    const broken = pressSteps([new Error('offline')]);
+    expect(await pressParty('token', broken.steps)).toEqual({ text: PRESS_FAILED, csrf: 'token' });
+  });
+
+  it('asks for the token again once when the page has a stale one (after a restart)', async () => {
+    const me: Me = { loggedIn: true, name: 'Ash', csrf: 'new', member: true, readOnly: false };
+    const { steps, posted } = pressSteps(
+      [
+        { status: 403, body: { error: 'Not allowed.' } },
+        { status: 200, body: { ok: true, text: 'You are here.', party: null } },
+      ],
+      me,
+    );
+    expect(await pressParty('old', steps)).toEqual({
+      text: 'You are here.',
+      party: null,
+      csrf: 'new',
+    });
+    expect(posted).toEqual(['old', 'new']);
+    // A refusal with a token that is current is not tried again.
+    const same = pressSteps([{ status: 403, body: { error: 'Not allowed.' } }], {
+      ...me,
+      csrf: 'old',
+    });
+    expect((await pressParty('old', same.steps)).text).toBe('Not allowed.');
+    expect(same.posted).toEqual(['old']);
+  });
+});
+
+/** A poller over timers a test runs by hand, a page whose visibility it sets. */
+function pollerWith(answer: () => 'go' | 'stop' = () => 'go') {
+  const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
+  let visible = true;
+  let loads = 0;
+  const poller = new Poller({
+    everyMs: 20_000,
+    load: () => {
+      loads += 1;
+      return Promise.resolve(answer());
+    },
+    visible: () => visible,
+    setTimer: (run, ms) => {
+      const timer = { run, ms, cancelled: false };
+      timers.push(timer);
+      return () => {
+        timer.cancelled = true;
+      };
+    },
+  });
+  const pending = () => timers.filter((timer) => !timer.cancelled);
+  return {
+    poller,
+    pending,
+    loads: () => loads,
+    setVisible(to: boolean) {
+      visible = to;
+    },
+    async fire() {
+      const [next] = pending();
+      if (!next) throw new Error('no timer is waiting');
+      next.cancelled = true;
+      next.run();
+      await poller.idle();
+    },
+  };
+}
+
+describe('Poller', () => {
+  it('asks at once, then every 20 seconds while the page is visible', async () => {
+    const made = pollerWith();
+    await made.poller.start();
+    expect(made.loads()).toBe(1);
+    expect(made.pending().map((timer) => timer.ms)).toEqual([20_000]);
+    await made.fire();
+    expect(made.loads()).toBe(2);
+    expect(made.pending()).toHaveLength(1);
+  });
+
+  it('rests while the page is hidden, and asks at once when it is shown again', async () => {
+    const made = pollerWith();
+    await made.poller.start();
+    made.setVisible(false);
+    made.poller.visibilityChanged();
+    expect(made.pending()).toEqual([]);
+    made.setVisible(true);
+    made.poller.visibilityChanged();
+    await made.poller.idle();
+    expect(made.loads()).toBe(2);
+    expect(made.pending()).toHaveLength(1);
+  });
+
+  it('asks at once after a press, and waits its 20 seconds from then', async () => {
+    const made = pollerWith();
+    await made.poller.start();
+    await made.poller.now();
+    expect(made.loads()).toBe(2);
+    expect(made.pending()).toHaveLength(1);
+  });
+
+  it('stops for good when the answer says so (logged out, no member any more)', async () => {
+    const made = pollerWith(() => 'stop');
+    await made.poller.start();
+    expect(made.pending()).toEqual([]);
+    made.poller.visibilityChanged();
+    await made.poller.idle();
+    expect(made.loads()).toBe(1);
+  });
+});
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5137c27e318d4b3f8d082d62d3272e432007c857
--- /dev/null
+++ b/src/web/client/parties.ts
@@ -0,0 +1,424 @@
+import type {
+  MapAttendance,
+  MapMeetup,
+  MapParty,
+  MapPress,
+  MapRaid,
+  MapStatus,
+  MapTrain,
+} from '../../domain/web/party-data.js';
+import type { Me } from './notice.js';
+import type { PageNode } from './popup.js';
+
+/**
+ * The parties on the live map (plan 8M-3, spec 3.2 to 3.4), the parts the page shows and does
+ * that need no Leaflet: popups of raids and trains and the meetups' items as trees of nodes
+ * (`renderNode` sets every text as text), countdowns, times in the posts' zone, a press of a
+ * button with its CSRF token, and the poller that asks for the list every 20 seconds while
+ * the page is visible.
+ */
+
+/** What a popup needs besides its party: the time, the posts' zone, the gyms' names. */
+export interface ShowContext {
+  now: number;
+  zone: string;
+  /** A gym's name as `/api/geo` has it; undefined for a gym the map does not know. */
+  gymName(id: number | null): string | undefined;
+}
+
+const MINUTE = 60_000;
+
+/** How long until a moment: `in 13 min`, `in 1 h 5 min`, `now` once it has come. */
+export function countdown(until: number, now: number): string {
+  const minutes = Math.ceil((until - now) / MINUTE);
+  if (minutes <= 0) return 'now';
+  if (minutes < 60) return `in ${minutes} min`;
+  const hours = Math.floor(minutes / 60);
+  const rest = minutes % 60;
+  return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
+}
+
+/** Spaces the formatter writes as narrow or no-break ones (every space separator), as plain. */
+const plainSpaces = (text: string): string => text.replace(/\p{Zs}/gu, ' ');
+
+/** `2:30 PM` in the posts' zone, with the day (`Wed, Oct 14, 2:00 PM`) when it is not today. */
+export function clockTime(at: number, zone: string, now: number): string {
+  const day = (time: number) =>
+    new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(time);
+  const sameDay = day(at) === day(now);
+  return plainSpaces(
+    new Intl.DateTimeFormat('en-US', {
+      timeZone: zone,
+      ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
+      hour: 'numeric',
+      minute: '2-digit',
+    }).format(at),
+  );
+}
+
+const PRESS_LABELS: Readonly<Record<MapPress['action'], string>> = {
+  interested: 'Interested',
+  join: 'Join',
+  here: 'Here',
+  done: 'Done',
+  leave: 'Leave',
+};
+
+/** The label of a button, as the post has it: `Join B` for a group's. */
+export function pressLabel(press: MapPress): string {
+  const label = PRESS_LABELS[press.action];
+  return press.group === undefined ? label : `${label} ${press.group}`;
+}
+
+const STATUS_WORDS: Readonly<Record<MapStatus, string>> = {
+  interested: 'Interested',
+  coming: 'Coming',
+  present: 'Here',
+  complete: 'Done',
+};
+
+const div = (className: string, text: string): PageNode => ({ tag: 'div', className, text });
+
+/** A moment and the countdown to it, which the page keeps current (`data-until`). */
+function timeLine(className: string, words: string, at: number, context: ShowContext): PageNode {
+  return {
+    tag: 'div',
+    className,
+    children: [
+      { tag: 'span', text: `${words} ${clockTime(at, context.zone, context.now)}` },
+      {
+        tag: 'span',
+        className: 'countdown',
+        text: countdown(at, context.now),
+        attributes: { 'data-until': String(at) },
+      },
+    ],
+  };
+}
+
+/**
+ * Who comes, as counts (by group when there are several), how the member stands, and the
+ * buttons that apply, each naming its party and action in `data-` attributes.
+ */
+function attendanceNodes(partyId: string, attendance: MapAttendance): PageNode[] {
+  const several = attendance.groups.length > 1;
+  const counts = attendance.groups.flatMap((group) => {
+    const shown = (['interested', 'coming', 'present'] as const)
+      .filter((status) => group[status] > 0 || !several)
+      .map((status) => `${STATUS_WORDS[status]} ${group[status]}`)
+      .join(' · ');
+    return several ? (shown === '' ? [] : [`Group ${group.id}: ${shown}`]) : [shown];
+  });
+  const { mine } = attendance;
+  return [
+    ...counts.map((line) => div('counts', line)),
+    ...(mine
+      ? [
+          div(
+            'mine',
+            `You: ${STATUS_WORDS[mine.status]}${several && mine.status !== 'complete' ? `, group ${mine.group}` : ''}`,
+          ),
+        ]
+      : []),
+    ...(attendance.actions.length === 0
+      ? []
+      : [
+          {
+            tag: 'div',
+            className: 'presses',
+            children: attendance.actions.map((press): PageNode => ({
+              tag: 'button',
+              className: 'press',
+              text: pressLabel(press),
+              attributes: {
+                type: 'button',
+                'data-party': partyId,
+                'data-action': press.action,
+                ...(press.group === undefined ? {} : { 'data-group': press.group }),
+              },
+            })),
+          },
+        ]),
+  ];
+}
+
+/** "Open the post": only an address of Discord, in a new tab that does not learn the map's. */
+function postLink(link: string): PageNode[] {
+  return link.startsWith('https://discord.com/channels/')
+    ? [
+        {
+          tag: 'a',
+          className: 'post-link',
+          text: 'Open the post',
+          attributes: { href: link, target: '_blank', rel: 'noopener noreferrer' },
+        },
+      ]
+    : [];
+}
+
+/**
+ * A raid without its gym: the raid in the posts' words (`Level 5 raid against Yveltal`, an egg
+ * with what it hatches as), the hatch or end time with a countdown, who comes, the buttons, and
+ * the post.
+ */
+function raidNodes(raid: MapRaid, context: ShowContext): PageNode[] {
+  const egg = raid.stage === 'egg';
+  const heading =
+    !egg && raid.boss !== null
+      ? `${raid.tier} against ${raid.boss}`
+      : `${raid.tier}${egg ? ' (egg)' : ''}`;
+  const time = egg ? raid.hatchTime : raid.endTime;
+  return [
+    div('tier', heading),
+    ...(egg && raid.boss !== null ? [div('boss', `Hatches as ${raid.boss}`)] : []),
+    time === null
+      ? div('time', egg ? 'Hatch time not known' : 'End time not known')
+      : timeLine('time', egg ? 'Hatches at' : 'Ends at', time, context),
+    ...attendanceNodes(raid.id, raid.attendance),
+    ...postLink(raid.link),
+  ];
+}
+
+const gymHeading = (gymId: number | null, context: ShowContext): PageNode => ({
+  tag: 'strong',
+  className: 'name',
+  text: context.gymName(gymId) ?? 'Unknown gym',
+});
+
+/** A raid's popup (or its item in the side panel): its gym, then the raid (`raidNodes`). */
+export function raidPopup(raid: MapRaid, context: ShowContext): PageNode {
+  return {
+    tag: 'div',
+    className: 'party-popup raid',
+    children: [gymHeading(raid.gymId, context), ...raidNodes(raid, context)],
+  };
+}
+
+/**
+ * The popup of a gym's one marker: the gym once, then every raid there in the list's order (a
+ * standard raid and an elite raid can be at one gym at once), each in a section of its own
+ * with its time, counts, buttons and post.
+ */
+export function gymRaidsPopup(
+  gymId: number,
+  raids: readonly MapRaid[],
+  context: ShowContext,
+): PageNode {
+  return {
+    tag: 'div',
+    className: 'party-popup raids',
+    children: [
+      gymHeading(gymId, context),
+      ...raids.map((raid): PageNode => ({
+        tag: 'div',
+        className: 'raid',
+        children: raidNodes(raid, context),
+      })),
+    ],
+  };
+}
+
+/**
+ * The raids of the list by the gym they are at, for the gyms the map shows (`shown`), in the
+ * order of the list (a gym's place by its first raid); the others (no gym, or one the map does
+ * not show) apart, for the side panel.
+ */
+export function raidsAtGyms(
+  raids: readonly MapRaid[],
+  shown: (gymId: number) => boolean,
+): { atGyms: Map<number, MapRaid[]>; elsewhere: MapRaid[] } {
+  const atGyms = new Map<number, MapRaid[]>();
+  const elsewhere: MapRaid[] = [];
+  for (const raid of raids) {
+    if (raid.gymId === null || !shown(raid.gymId)) {
+      elsewhere.push(raid);
+      continue;
+    }
+    const there = atGyms.get(raid.gymId);
+    if (there) there.push(raid);
+    else atGyms.set(raid.gymId, [raid]);
+  }
+  return { atGyms, elsewhere };
+}
+
+/** The picture of a gym's marker: that of its first raid that has one; null for a dot. */
+export function gymPicture(raids: readonly MapRaid[]): string | null {
+  return raids.find((raid) => raid.picture !== null)?.picture ?? null;
+}
+
+/** What the parties' own line says (`#read-only`); undefined hides it. */
+export function readOnlyLine(readOnly: boolean): string | undefined {
+  return readOnly ? 'Discord cannot be reached just now, so the map is read-only.' : undefined;
+}
+
+/** Where a train is on its route: `At stop 2 of 5: Library`, finished, or without a route. */
+function stopLine(train: MapTrain, context: ShowContext): string {
+  if (train.route.length === 0) return 'No route yet';
+  if (train.stop === null) return 'Route finished';
+  const name = context.gymName(train.route[train.stop] ?? null) ?? 'a gym not on the map';
+  return `At stop ${train.stop + 1} of ${train.route.length}: ${name}`;
+}
+
+/** A train's popup: its name, start, where it is, who comes, the buttons, the post. */
+export function trainPopup(train: MapTrain, context: ShowContext): PageNode {
+  return {
+    tag: 'div',
+    className: 'party-popup train',
+    children: [
+      { tag: 'strong', className: 'name', text: train.name },
+      train.startTime === null
+        ? div('time', 'No start time yet')
+        : timeLine('time', 'Starts at', train.startTime, context),
+      div('stop', stopLine(train, context)),
+      ...attendanceNodes(train.id, train.attendance),
+      ...postLink(train.link),
+    ],
+  };
+}
+
+/** A meetup in the side panel: its name, start and end, who comes, the buttons, the post. */
+export function meetupItem(meetup: MapMeetup, context: ShowContext): PageNode {
+  const when = (words: string, at: number | null) =>
+    at === null ? [] : [div('time', `${words} ${clockTime(at, context.zone, context.now)}`)];
+  return {
+    tag: 'li',
+    className: 'party-popup meetup',
+    children: [
+      { tag: 'strong', className: 'name', text: meetup.name },
+      ...when('Starts', meetup.startTime),
+      ...when('Ends', meetup.endTime),
+      ...attendanceNodes(meetup.id, meetup.attendance),
+      ...postLink(meetup.link),
+    ],
+  };
+}
+
+/** What the page says when a press did not get through. */
+export const PRESS_FAILED = 'That did not get through; try again.';
+
+/** What a press needs of the page: the POST with a CSRF token, and `/api/me` again. */
+export interface PressSteps {
+  /** POSTs the press with this token: the status and the JSON of the answer. */
+  post(csrf: string): Promise<{ status: number; body: unknown }>;
+  /** Asks `/s/<guild>/api/me` again. */
+  me(): Promise<Me>;
+}
+
+/** What came of a press: what to tell the member, the party as it is now, the current token. */
+export interface Pressed {
+  text: string;
+  party?: MapParty | null;
+  csrf: string;
+}
+
+/** The words of an answer: the press's outcome, or the few words of a failure. */
+function answered(body: unknown): { text: string; party?: MapParty | null } | undefined {
+  if (typeof body !== 'object' || body === null) return undefined;
+  const { text, error, party } = body as { text?: unknown; error?: unknown; party?: unknown };
+  if (typeof text === 'string') return { text, party: (party ?? null) as MapParty | null };
+  return typeof error === 'string' ? { text: error } : undefined;
+}
+
+/**
+ * Presses a party's button with the page's CSRF token. A 403 may mean the token is stale (the
+ * bot restarted and made a new key since the page loaded): the token is asked for again and
+ * the press tried once more when it changed; a 403 with a current token is the refusal it says.
+ * A broken connection, or an answer that cannot be read, is `PRESS_FAILED`.
+ */
+export async function pressParty(csrf: string, steps: PressSteps): Promise<Pressed> {
+  try {
+    let token = csrf;
+    let answer = await steps.post(token);
+    if (answer.status === 403) {
+      const me = await steps.me();
+      if (me.loggedIn && me.csrf !== token) {
+        token = me.csrf;
+        answer = await steps.post(token);
+      }
+    }
+    return { ...(answered(answer.body) ?? { text: PRESS_FAILED }), csrf: token };
+  } catch {
+    return { text: PRESS_FAILED, csrf };
+  }
+}
+
+/** What the poller needs of the page. */
+export interface PollerDeps {
+  /** Asks for the list and shows it; `stop` when there is no point in asking again. */
+  load(): Promise<'go' | 'stop'>;
+  everyMs: number;
+  /** Whether the page is visible (`document.visibilityState`). */
+  visible(): boolean;
+  /** Starts a timer; gives what cancels it. */
+  setTimer(run: () => void, ms: number): () => void;
+}
+
+/**
+ * Asks for the party list (spec 3.4): at once, then every `everyMs` while the page is visible;
+ * nothing while it is hidden, and at once when it is shown again; at once after a press, the
+ * next one `everyMs` after that. One question at a time: one asked for meanwhile follows it.
+ * A `stop` ends it for good.
+ */
+export class Poller {
+  private cancel: (() => void) | undefined;
+  private running: Promise<void> | undefined;
+  private again = false;
+  private stopped = false;
+
+  constructor(private readonly deps: PollerDeps) {}
+
+  start(): Promise<void> {
+    return this.now();
+  }
+
+  /** Asks at once (after a press), and waits its interval from then. */
+  now(): Promise<void> {
+    this.cancel?.();
+    this.cancel = undefined;
+    if (this.stopped) return this.idle();
+    if (this.running) {
+      this.again = true;
+      return this.idle();
+    }
+    this.running = this.run();
+    return this.idle();
+  }
+
+  /** The page was hidden or shown. */
+  visibilityChanged(): void {
+    if (!this.deps.visible()) {
+      this.cancel?.();
+      this.cancel = undefined;
+      return;
+    }
+    if (!this.cancel && !this.running) void this.now();
+  }
+
+  /** Resolves once no question is under way. */
+  async idle(): Promise<void> {
+    while (this.running) await this.running;
+  }
+
+  private async run(): Promise<void> {
+    try {
+      do {
+        this.again = false;
+        if ((await this.deps.load()) === 'stop') {
+          this.stopped = true;
+          return;
+        }
+      } while (this.again);
+    } finally {
+      this.running = undefined;
+      this.schedule();
+    }
+  }
+
+  private schedule(): void {
+    if (this.stopped || !this.deps.visible() || this.cancel) return;
+    this.cancel = this.deps.setTimer(() => {
+      this.cancel = undefined;
+      void this.now();
+    }, this.deps.everyMs);
+  }
+}
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bdc4c4f1c4fac5d4a27dd4c981ce94fa70d245a0
--- /dev/null
+++ b/src/web/client/party-layer.ts
@@ -0,0 +1,218 @@
+import * as L from 'leaflet';
+import type { PartiesView } from '../../domain/web/party-data.js';
+import { byId, getJson, say } from './common.js';
+import type { Me } from './notice.js';
+import {
+  countdown,
+  gymPicture,
+  gymRaidsPopup,
+  meetupItem,
+  Poller,
+  pressParty,
+  raidPopup,
+  raidsAtGyms,
+  readOnlyLine,
+  trainPopup,
+  type ShowContext,
+} from './parties.js';
+import { renderNode, type MapGym, type PageNode } from './popup.js';
+
+/**
+ * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
+ * with raids (the picture of its first raid that has one, from the server only), whose popup
+ * lists every raid there; trains as lines over their routes with the current stop marked;
+ * meetups (and raids at gyms the map does not show) in the side panel; every popup and item a
+ * tree of nodes set as text (`renderNode`), with the buttons that apply. The list is asked for
+ * every 20 seconds while the page is visible and at once after a press (`Poller`); the browser
+ * revalidates it by its ETag (a 304 keeps what it has). A popup open when the list changes is
+ * opened again on its new layer. Countdowns run in the page. That the parties are read-only is
+ * said on a line of its own (`#read-only`), never in place of what a press answered (`say`).
+ */
+
+const EVERY_MS = 20_000;
+const COUNTDOWN_MS = 15_000;
+const RAID_COLOUR = '#c0392b';
+const TRAIN_COLOUR = '#d35400';
+const ICON_SIZE = 36;
+
+/** Makes the elements of a node; a click on a button in them presses it. */
+type Draw = (node: PageNode) => HTMLElement;
+
+export function showParties(
+  map: L.Map,
+  guild: string,
+  me: Extract<Me, { loggedIn: true }>,
+  gyms: ReadonlyMap<number, MapGym>,
+): void {
+  const layer = L.layerGroup().addTo(map);
+  const panel = byId('parties');
+  const readOnly = byId('read-only');
+  let csrf = me.csrf;
+  let shown = '';
+  let view: PartiesView | undefined;
+  /** The popup that is open (by its layer's key), to open it again after a redraw. */
+  let open: string | undefined;
+  const popups = new Map<string, L.Layer>();
+
+  const context = (): ShowContext => ({
+    now: Date.now(),
+    zone: view?.zone ?? 'UTC',
+    gymName: (id) => (id === null ? undefined : gyms.get(id)?.name),
+  });
+
+  const press = async (button: HTMLButtonElement): Promise<void> => {
+    const { party, action, group } = button.dataset;
+    if (party === undefined || action === undefined) return;
+    const buttons = button.parentElement?.querySelectorAll('button') ?? [];
+    for (const each of buttons) each.disabled = true;
+    const pressed = await pressParty(csrf, {
+      post: async (token) => {
+        const answer = await fetch(
+          `/s/${guild}/api/parties/${encodeURIComponent(party)}/${encodeURIComponent(action)}`,
+          {
+            method: 'POST',
+            credentials: 'same-origin',
+            headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+            body: JSON.stringify(group === undefined ? {} : { group }),
+          },
+        );
+        const body = (await answer.json().catch(() => undefined)) as unknown;
+        return { status: answer.status, body };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    csrf = pressed.csrf;
+    say(pressed.text);
+    for (const each of buttons) each.disabled = false;
+    await poller.now();
+  };
+
+  const draw: Draw = (node) => {
+    const element = renderNode(node, document);
+    element.addEventListener('click', (event) => {
+      const target = event.target;
+      if (target instanceof HTMLButtonElement && target.classList.contains('press')) {
+        void press(target);
+      }
+    });
+    return element;
+  };
+
+  /**
+   * Binds a popup to a layer under a key that names it across redraws (`gym:<id>`,
+   * `train:<id>`, `route:<id>`), remembering it while it is open.
+   */
+  const withPopup = <T extends L.Layer>(target: T, key: string, popup: () => PageNode): T => {
+    target.bindPopup(() => draw(popup()));
+    target.on('popupopen', () => {
+      open = key;
+    });
+    target.on('popupclose', () => {
+      if (open === key) open = undefined;
+    });
+    popups.set(key, target);
+    return target;
+  };
+
+  const redraw = (next: PartiesView): void => {
+    view = next;
+    const reopen = open;
+    layer.clearLayers();
+    popups.clear();
+    const { atGyms, elsewhere } = raidsAtGyms(next.raids, (id) => gyms.has(id));
+    for (const [gymId, raids] of atGyms) {
+      const gym = gyms.get(gymId);
+      if (!gym) continue;
+      const picture = gymPicture(raids);
+      const marker =
+        picture === null
+          ? L.circleMarker([gym.lat, gym.lon], { radius: 10, color: RAID_COLOUR, fillOpacity: 0.9 })
+          : L.marker([gym.lat, gym.lon], {
+              icon: L.icon({
+                iconUrl: picture,
+                iconSize: [ICON_SIZE, ICON_SIZE],
+                className: 'raid-icon',
+              }),
+              keyboard: true,
+            });
+      withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context())).addTo(layer);
+    }
+    for (const train of next.trains) {
+      const places = train.route.flatMap((id) => {
+        const gym = gyms.get(id);
+        return gym ? [L.latLng(gym.lat, gym.lon)] : [];
+      });
+      const popup = () => trainPopup(train, context());
+      if (places.length > 1) {
+        withPopup(
+          L.polyline(places, { color: TRAIN_COLOUR, weight: 4, opacity: 0.8 }),
+          `route:${train.id}`,
+          popup,
+        ).addTo(layer);
+      }
+      const at = train.stop === null ? undefined : gyms.get(train.route[train.stop] ?? -1);
+      const where = at ? L.latLng(at.lat, at.lon) : places[0];
+      if (where) {
+        withPopup(
+          L.circleMarker(where, { radius: 9, color: TRAIN_COLOUR, fillOpacity: at ? 1 : 0.3 }),
+          `train:${train.id}`,
+          popup,
+        ).addTo(layer);
+      }
+    }
+    const items = [
+      ...next.meetups.map((meetup) => meetupItem(meetup, context())),
+      ...elsewhere.map((raid): PageNode => ({ ...raidPopup(raid, context()), tag: 'li' })),
+    ];
+    panel.replaceChildren();
+    if (items.length > 0) {
+      const heading = document.createElement('h2');
+      heading.textContent = 'Meetups and other parties';
+      const list = draw({ tag: 'ul', className: 'party-list', children: items });
+      panel.append(heading, list);
+    }
+    panel.hidden = items.length === 0;
+    map.invalidateSize();
+    const line = readOnlyLine(next.readOnly);
+    readOnly.textContent = line ?? '';
+    readOnly.hidden = line === undefined;
+    if (reopen !== undefined) popups.get(reopen)?.openPopup();
+  };
+
+  const poller = new Poller({
+    everyMs: EVERY_MS,
+    visible: () => document.visibilityState === 'visible',
+    setTimer: (run, ms) => {
+      const timer = window.setTimeout(run, ms);
+      return () => {
+        window.clearTimeout(timer);
+      };
+    },
+    load: async () => {
+      try {
+        // The browser asks again with the ETag it has; a 304 gives the body it kept.
+        const answer = await fetch(`/s/${guild}/api/parties`, { credentials: 'same-origin' });
+        if (answer.status === 401 || answer.status === 403) return 'stop';
+        if (!answer.ok) return 'go';
+        const text = await answer.text();
+        if (text !== shown) {
+          shown = text;
+          redraw(JSON.parse(text) as PartiesView);
+        }
+      } catch {
+        // Offline for a moment: the next turn asks again.
+      }
+      return 'go';
+    },
+  });
+  document.addEventListener('visibilitychange', () => {
+    poller.visibilityChanged();
+  });
+  window.setInterval(() => {
+    const now = Date.now();
+    for (const element of document.querySelectorAll<HTMLElement>('[data-until]')) {
+      element.textContent = countdown(Number(element.dataset.until), now);
+    }
+  }, COUNTDOWN_MS);
+  void poller.start();
+}
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 2878726d0b34eb694f48dda221abea204e01f445..6b854a5bc37a900beaf9436d890ceac462ba353c 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -64,6 +64,16 @@ describe('the map page', () => {
       'data-tiles': 'osm',
       'data-login': 'discord',
     });
+    // The side panel of the meetups (plan 8M-3), hidden until a member's parties are shown.
+    expect(page.body).toContain(
+      '<div id="content"><main id="map" aria-label="Map"></main>' +
+        '<aside id="parties" aria-label="Meetups and other parties" hidden></aside></div>',
+    );
+    // The read-only line of the parties: a line of its own, so that it never takes the place
+    // of what a press answered (#notice).
+    expect(page.body).toContain(
+      '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
+    );
   });
 
   it("gives the page Google's tiles and the browser key only when both are set", async () => {
diff --git a/src/web/page.ts b/src/web/page.ts
index a10acc05a8d39538ec16054dd6303b23a64077aa..ed1c4bf04e7d8be38df73d4b059b20780802965a 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -104,7 +104,10 @@ function head(title: string, assets: PageAssets): string[] {
 /**
  * The map page (spec 3.1): a static template that loads the bundle's script and style, with
  * nothing inline (the CSP allows no inline script or style); what the page needs to know is in
- * `data-` attributes of `<body>`, escaped. The script builds everything else.
+ * `data-` attributes of `<body>`, escaped. The script builds everything else; the side panel
+ * (`#parties`: the meetups, and raids at gyms the map does not show) only for a member, and
+ * the line that the parties are read-only (`#read-only`), apart from the moment's news
+ * (`#notice`) so that neither takes the other's place.
  */
 export function mapPage(data: MapPageData, assets: AssetManifest): string {
   return [
@@ -113,8 +116,9 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     '<header id="header"><span class="title">Professor Pine</span>',
     '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
     '<span id="account"></span></header>',
-    '<p id="notice" hidden></p>',
-    '<main id="map" aria-label="Map"></main>',
+    '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
+    '<div id="content"><main id="map" aria-label="Map"></main>' +
+      '<aside id="parties" aria-label="Meetups and other parties" hidden></aside></div>',
     '<noscript><p>The map needs JavaScript.</p></noscript>',
     '</body>',
     '</html>',
````

### Task 6: Live map: the parties' docs and the staging checklist

Prototype commit: `110c898672b109a2f3824907305bbd02b7129174`

`web.md` ("The parties on the map", the press order, "Adding a route" with `postGuard` in `onRequest`), `parties-and-posts.md`, `discord-framework.md`, `members-and-roles.md`, `testing.md`; the staging checklist `docs/superpowers/plans/2026-10-16-phase-8m3-staging.md`.

**Files:**

```
 docs/architecture/discord-framework.md                 |  2 +-
 docs/architecture/members-and-roles.md                 |  2 +-
 docs/architecture/parties-and-posts.md                 |  4 ++--
 docs/architecture/testing.md                           |  3 ++-
 docs/architecture/web.md                               | 22 +++++++++++++++-------
 docs/superpowers/plans/2026-10-16-phase-8m3-staging.md | 55 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 76 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/discord-framework.md docs/architecture/members-and-roles.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m3-staging.md`.
- [ ] **Step 4: Check the transcription:** `git diff 110c898672b109a2f3824907305bbd02b7129174 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Live map: the parties' docs and the staging checklist`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/discord-framework.md docs/architecture/members-and-roles.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m3-staging.md`.

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 0d524b4b70c33697ce3b182fc34b332ae4b67c4b..fcac44eb1180c5ccfcffbf8939252d0c7a5e71c7 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -18,7 +18,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 ## Controls and how a press answers
 
-- Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`component:<kind>`), as `/rank`'s and `/help`'s do. What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
+- Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/members-and-roles.md b/docs/architecture/members-and-roles.md
index ac74a40a512f714c2133509edb70ddc487324437..22db6c36d38ee2553f65b8b89d539d7096c0bf12 100644
--- a/docs/architecture/members-and-roles.md
+++ b/docs/architecture/members-and-roles.md
@@ -10,7 +10,7 @@ What the bot knows of members without a member list: their settings and rows, on
 
 ## Looking members up
 
-- One member of a server is looked up with `ctx.members.find(guildId, userId)` (`MemberDirectory`, `src/discord/member-directory.ts`): a fresh question to Discord per member, the answer (also "not a member") kept for a minute; an id that is no snowflake is never asked about. `fetchGuildMember` is the one place a member is fetched (`DiscordPartyGateway.memberAccess` uses it). Tests use `FakeMemberDirectory` (`test/support/members.ts`). There is no member list and there will be none: production has no privileged intents.
+- One member of a server is looked up with `ctx.members.find(guildId, userId)` (`MemberDirectory`, `src/discord/member-directory.ts`): a fresh question to Discord per member, the answer (also "not a member") kept for a minute; an id that is no snowflake is never asked about. `fetchGuildMember` is the one place a member is fetched (`DiscordPartyGateway.memberAccess` uses it; so do the web pages' `DiscordRegionStaff` and `DiscordWebMembers`, fresh). A member's name and team are read by `memberInfo(interaction)` from an interaction and by `guildMemberInfo(member)` from a fetched member (a press on the live map), by the same rule. Tests use `FakeMemberDirectory` (`test/support/members.ts`). There is no member list and there will be none: production has no privileged intents.
 - Who of many members is in a server and can see a channel is `ctx.members.viewers(guildId, channelId, userIds)`: batches of 99 (and the bot itself, whose absence from an answer means the answer is no answer) through the gateway's request for members by user id, one request a second and thirty a minute at most (`MEMBER_REQUEST_BUDGET`), single REST look-ups when it fails and a rest that doubles up to six hours (`GatewayWithFallback`); "sees" is kept ten minutes, "does not" one (`src/discord/member-viewers.ts`). `FakeMemberDirectory` has `viewers`, `holding`, and members who are not there or cannot see.
 
 ## Self-assigned roles
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 6c5b945db81341f14a70b9cbe3ab062e71c0a02d..31c85a598b075ba90d5f251becf8b65bfe321895 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -27,7 +27,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 - What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`). It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
-- The post of an egg shows the game's egg (`raidEggPicture`, `src/domain/pogo/raid-eggs.ts`, served by address from `settings.raidEggPicturesUrl`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one.
+- The post of an egg shows the game's egg (`raidEggPicture`, `src/domain/pogo/raid-eggs.ts`, served by address from `settings.raidEggPicturesUrl`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture and the boss it names, decided as for the post.
 
 ## Meetups and timed parties
 
@@ -57,7 +57,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Attendance, lines and the completion question
 
-- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
+- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, "Join B") are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
 - The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 9 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; exactly the parts that fit the type must be present); versions 1 to 8 are still read (a train of them as `finish`).
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index d0b9722509107b31b46f3d673b9e3095fb2c2ced..2298cb463d7453988a06188b8ca6f2a9dac2023b 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -48,7 +48,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
 - The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
-- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw); Leaflet, Geoman, the worker in a browser and the real tiles are tried at staging.
+- The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `remove`, `asked`, `failing` for Discord away); who sees the list is the web server's `members` (`FakeMemberDirectory`), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is.
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 33b18b1caf641b307baa58d685163de09a0b8056..57fd4b67c4a9d0e5bcb354e033278e2da4b6a680 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,12 +1,12 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 and 8M-2; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the region editor, the Content Security Policy, and the rules for the routes of 8M-3 to 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-3; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, the region editor, the Content Security Policy, and the rules for the routes of 8M-4 and 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,20 +16,20 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 and 8M-2; spec `docs/superpow
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters) or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
 
 - A session (`Sessions`, `src/web/sessions.ts`) is 32 random bytes in the cookie `__Host-pine_session` (`sessionCookieName`, `sessions.cookieName`; `sessionCookie`: HttpOnly, Secure, SameSite=Lax, path `/`, no Domain, 30 days). The `__Host-` prefix keeps a sibling host of the domain from setting or shadowing it (cookie tossing); a cookie of the plain name is not read then. Where `publicUrl` is plain http (this machine only) the browser keeps no Secure cookie: the name is plain `pine_session`, without Secure. The session is stored as the hex SHA-256 of the cookie in `WebSession` (migration 015; `WebSessionRepository`, its twin `MemoryWebSessions`; what a stored session is, `WebSession`, `WebSessionStore` and `SESSION_MS`, is in `src/web/session-model.ts`, which imports no Fastify, so that the repository does not depend on the web server). It says who the member is (`userId`, the name for the header), never what they may do. `sessions.of(request, reply)` reads the cookie once per request; a session last used an hour ago or more is renewed (row and cookie: 30 days from now). A login (`sessions.start(request, reply, user)`) first deletes the row of the session the request's cookie stands for, if any: a browser has one session, and the old cookie leaves no row behind. Logging out deletes the row and the cookie; the hourly upkeep (`PartyScheduler`, `webSessions`) deletes expired rows.
 - What a member may do is asked per request, from fresh data (spec 2.5): `/api/me` asks `members.find(guild, user)` (kept a minute by the directory) and answers `{ loggedIn, name, member, csrf, readOnly }`; when Discord cannot say, `member: false, readOnly: true`, and the page says it is read-only. One login serves every server; membership is asked per server.
-- Every POST runs `postGuard(sessions, publicUrl)` (`src/web/csrf.ts`) as its `preHandler`: `Origin` must equal `publicUrl` and `X-Pine-CSRF` must be the session's token (`csrfToken`: an HMAC-SHA256 of the session id under a key made at start, compared in constant time); anything else is 403. The one exception is the POST of a login link's page, which has no session yet: it checks `Origin` alone. GETs (and HEADs) change nothing.
+- Every POST runs `postGuard(sessions, publicUrl)` (`src/web/csrf.ts`) as its `preHandler`, or in `onRequest` where the route has a body (the region editor's, a party's press), so that a refused request is never parsed: `Origin` must equal `publicUrl` and `X-Pine-CSRF` must be the session's token (`csrfToken`: an HMAC-SHA256 of the session id under a key made at start, compared in constant time); anything else is 403. The one exception is the POST of a login link's page, which has no session yet: it checks `Origin` alone. GETs (and HEADs) change nothing.
 
 ## Logging in
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget.
 
 ## The public map
 
@@ -38,6 +38,14 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 and 8M-2; spec `docs/superpow
 - The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
 - The page: Leaflet; OpenStreetMap's tiles with their attribution; with Google's tiles a layer switch (roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, elite raid gyms in their own colour; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; a second refusal, any other or a broken connection says "Log out failed; try again.") and why they see only the public map. `?login=failed|expired` is said once and taken out of the address.
 
+## The parties on the map (plan 8M-3)
+
+- **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post). A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (with one group Interested, Join, Here; with several a Join for each group, Interested, Here; Done for a raid that has hatched; Leave for a member signed up; none while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join` (body `{ group }` for "Join B"), `here`, `leave`, `done`; any other action 404, a body other than an optional group letter with `join` 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), and the party as the member sees it now (`mapParty`, null when it is over); 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
+- **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); trains a line over the gyms of their route with the current stop marked, meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
@@ -50,8 +58,8 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 and 8M-2; spec `docs/superpow
 - **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
 - **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
 
-## Adding a route (8M-3 to 8M-5)
+## Adding a route (8M-4 and 8M-5)
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
-- Every POST: `preHandler: postGuard(…)`, a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), with the command's own throttle per member; log a write as a command is logged (member, server, what), never the texts.
+- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), with the command's own throttle per member, counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`ActingMembers`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
 - Answer failures through `sendFailure` and refusals with the command's words. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
diff --git a/docs/superpowers/plans/2026-10-16-phase-8m3-staging.md b/docs/superpowers/plans/2026-10-16-phase-8m3-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..959bd7f0215f811a8b8f11d98d56ebf6aa5b1351
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-16-phase-8m3-staging.md
@@ -0,0 +1,55 @@
+# Phase 8M-3 staging checklist: parties on the live map, and joining them
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role).
+
+## Before
+
+1. No migration and no command change in this plan: no deploy. `npm run build` (it runs `npm run web:build`): `dist/web/assets/map-<hash>.js` is new.
+2. Two forums of the test server: West's, which Tester can see, and another region's forum that Tester cannot see by their roles (no role of theirs has View Channel there; nobody set an overwrite for Tester). Note which is which.
+3. In West: a raid reported with `/raid` at a gym of West (an egg with a hatch time some 20 minutes ahead), a train with a route of three gyms of West moved to its second stop, and a meetup with a start and end time. In the other forum: a raid at one of its gyms.
+
+## The list and its look
+
+4. Logged out, the map shows only regions and gyms; the network panel shows no `/api/parties` request.
+5. Googer logs in with `/maps`: within a moment the raids appear as markers on their gyms with the egg's picture (the boss's after it hatches), the train as a line over its three gyms with the second stop marked, the meetup in the side panel on the right (on a phone width, under the map). The console shows no CSP violation (the pictures load from `raw.githubusercontent.com` / `cdn.leekduck.com`).
+6. A raid's popup: the gym's name, "Level 5 raid (egg)" (and "Hatches as …" when the boss is known), "Hatches at 2:30 PM" with "in 18 min" counting down (it changes within 15 s of a minute passing, without a reload), the counts ("Interested 1 · Coming 0 · Here 0"), the buttons Interested, Join, Here, and "Open the post", which opens the post in the Discord app or web client. A second raid at the same gym (an elite raid, or another tier reported there): still one marker; its popup names the gym once and lists both raids, each with its own time, counts, buttons and post.
+7. The train's popup: its name, "Starts at …", "At stop 2 of 3: <gym>", the counts, the buttons, "Open the post"; the same popup from a click on the train's line, which stays open when the list changes (somebody joins the train on Discord meanwhile). The meetup's item: name, "Starts …", "Ends …", the counts, the buttons, the post.
+8. Nobody is named anywhere on the map: not the reporter (also one who reported anonymously: report a raid as a member with `/settings` privacy on), not the attendees; the response of `/s/<id>/api/parties` in the network panel holds no name or member id.
+
+## Joining from the map
+
+9. Googer presses Join on West's raid: the notice says "You are coming."; the popup now says "You: Coming" and the counts "Coming 1"; the post on Discord lists Googer under Coming and says "**Googer** (@Googer) is coming." in its line; the network panel shows `/api/parties` asked at once after the press.
+10. Here, Interested and Leave the same way, each as the post's button answers; Leave takes Googer off the post.
+11. A raid with two groups (`/group new` on Discord first): the popup counts each group and offers "Join A" and "Join B"; Join B puts Googer in group B on the post.
+12. After the raid has hatched (or one reported hatched): Done appears; pressing it answers as the post's Done ("You are done." or that the others were asked), and the completion question appears in the post as usual.
+13. Done on an egg cannot be pressed (no button); a press sent anyway (the network panel's "Edit and resend" with `done`) answers "This raid has not hatched yet."
+14. Press Join on the map and click Join on the post within the same minute 30 times between them (or with a scratch script against the dev server): the 31st is refused on whichever side: on the map "That was a lot of clicks. Try again in …", on Discord the same words privately.
+
+## A forum Tester cannot see
+
+15. Tester logs in with `/maps` (Matt's browser): they see the raid of the other forum on the map although they cannot see the forum on Discord.
+16. Tester presses Join on it: "You are coming."; within seconds the forum appears for Tester on Discord (an overwrite of their own on the forum, View Channel, Read Message History, Send Messages in Threads), the post lists Tester, the bot's log says "let a member into a forum".
+17. Tester presses Leave: the forum disappears for Tester again; the log says "took back the access of a member to a forum".
+18. A moderator keeps Tester out of that forum on purpose (an overwrite for Tester that denies View Channel): within a minute Tester's map no longer shows that forum's raid (the barred answer is kept a minute); a press sent anyway (resend from the network panel) is refused (403) and nothing changes on the post. Remove the overwrite afterwards.
+19. A member who is not in the test server (a third account, if one is at hand, or Tester after leaving the server): logged in through Discord, the map shows no parties; `/s/<id>/api/parties` answers 403.
+
+## Polling and 304s
+
+20. With the map open and visible: `/s/<id>/api/parties` every 20 seconds in the network panel, answered 304 while nothing changes (the browser sends `If-None-Match`); a change on Discord (somebody joins the raid on the post) shows on the map within 20 seconds, and that answer is a 200.
+21. Switch to another tab for a minute: no requests meanwhile; back on the map, one at once, then every 20 seconds again.
+22. Restart the bot with the map open (Matt): the next press first gets 403 (the CSRF key changed), the page asks `/api/me` for the new token and the press goes through once; the notice says the press's answer.
+23. The party ends while its popup is open (`/delete` on Discord, or the clock): the next refresh takes the marker away; a press sent before that answers "This has ended." (or "This raid is over." for Done).
+24. The bot's log: one info line "a party was pressed on the map" per press with user, guild, party, action, outcome; no name, no text; the debug lines of `/api/parties` by route pattern only.
+
+## Not staged
+
+- Read-only while Discord cannot be reached: the bot would have to lose Discord while the web server keeps serving, which cannot be arranged safely on this machine (pulling the network also cuts the browser's way to Discord's login and the tunnel). The unit and route tests cover it (`party-viewers.test.ts`, `parties.test.ts`, `party-press.test.ts`): a member confirmed within 30 minutes gets the list without buttons and "Discord cannot be reached just now, so the map is read-only." on a line of its own (`#read-only`, hidden again when Discord is back), anybody else 503; a press answers 503.
+
+## Afterwards
+
+25. End the raids, the train and the meetup made for the test; remove any overwrite set by hand in step 18.
+
+## Left open (to the follow-ups if not settled here)
+
+- How the markers look on a phone, and whether 36 px pictures are the right size; whether a raid at a gym in two regions shows once (it does: one marker per gym).
+- Whether 20 seconds is quick enough or a stream (SSE) should follow (spec 3.4).
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m3 HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other. The new and changed test files with timers or waits (the press routes', the poller's) ten times in a row.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `package.json` and `package-lock.json`), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and the cutover session is not committing (ask it). Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-3": the rulings and "Made while prototyping" above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-3.<n> <commit>` per task, then `review`), the ledger and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-16-phase-8m3-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: `npm run build`, Matt starts the bot; two accounts (Matt's and the test account) on the map with parties made on Discord.
