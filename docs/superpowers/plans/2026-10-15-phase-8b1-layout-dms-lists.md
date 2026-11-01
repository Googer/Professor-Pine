# Phase 8B-1: Direct Messages, Member Lists, Spawn Reports and the Summary as Components-v2 Messages: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** What 8A did for the party posts, done for the rest of what members read most: the notifier's direct messages (a picture, the party's brief, "Go to post" and "Map" buttons, each reason with its own Stop), `/wants` and `/targets` (pages of ten with Remove beside each entry), spawn reports and Unown sightings, and the region's summary post with `/status` in a region channel, all as components-v2 messages.

**Architecture:** The first of the three plans of 8B (8B-1 these messages; 8B-2 `/counters` with its dialog, `/rank`, `/help`; 8B-3 the Move train panel, `/gym show`, `/read-screenshot`, headings over the `/iam` menus). It reuses 8A's pieces: `src/render/v2.ts`, `V2Message` / `OutgoingMessage` / `discordPayload`, the strict checks of the fake gateway (now shared by the fake DM gateway and the fake interactions), `TEXT_BUDGET`, `MAX_COMPONENTS`. A DM is built from the party's `brief` (accent, picture, lines, map address), made by the renderers that make the post, in the place of the embed `card`, which goes. A pressed Stop on a v2 DM stays as a disabled "Stopped"; a classic DM sent before keeps losing its button. The member lists are `src/render/member-list.ts` with the controls of the kinds `wantlist` and `targetlist`. The summary post is made through the party post's first-message path and edited as v2 (a classic one converted by the gateway).

**Tech Stack:** TypeScript 6.0, discord.js 14.27 (components v2), Vitest. No new dependency, no migration, no command definition changed (only the help texts of `/wants` and `/targets`): no registration before staging.

**Spec:** the design brief `.superpowers/sdd/2026-10-15-phase-8b1-layout-dms-lists/design.md` (git-ignored; R1–R5, from Matt's approved drafts https://claude.ai/artifact/Gb3dr68kx63cifg268RN7X and his answers in `docs/superpowers/plans/phase-0-follow-ups.md`, "From Phase 8A", the bullet "Matt, 2026-10-15 (morning), for the rest of Phase 8").

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8b1`), one commit per task, each commit typechecked with its own tests green, and the full check and build clean on the tip (5,105 unit tests). Two Opus reviewers went through that branch (the DMs; the lists, spawn reports, summary and docs), a third through the fixes, which are folded into the commits below.

## Decisions in this plan

Matt's (the drafts and his answers, 2026-10-15): the DM layout (the news with the party's picture, Go to post and Map, "You asked to be told about" with a Stop per reason); the meeting-time DM stays plain text; `/wants` and `/targets` with pages and Remove; the spawn report and the summary as drafted.

Made while prototyping, to look at in staging:

1. **A pressed Stop** becomes a disabled secondary "Stopped" with the same custom id (a section must keep its accessory; ids stay unique; a stale press answers "already removed").
2. **Stop buttons that fit:** `notifyDm` counts what it built and gives Stop buttons to as many reasons as fit 40 components (`stopButtonRoom`); the rest are named with the command that removes them.
3. **An egg's boss DM** says the boss in its sentence and again in the brief ("Hatches as Yveltal ✨"): kept, for the shiny mark.
4. **Remove** in a list carries what to remove as a DM's Stop spells it (`stopArgs`: `p:150`, `ps:487`, `g:3`), not the want token (whose shadow species has an empty part, which a custom id refuses).
5. **One throttle per list kind** (`MEMBER_WRITE_THROTTLE`; page turns and Removes share it, and "Remove all…" is the way for many).
6. **"Remove all…"** asks in a new private answer; the list stays underneath, and a later Remove of a gone entry is no error.
7. **Order of `/wants`:** Pokémon wanted for raids and spawns, then raids, then spawns, each by name; tiers; IVs. **Of `/targets`:** by region, then gym; gyms in no region of the server last.
8. **A spawn report without IVs** reads "Reported by …"; the Unown sighting has no "goes away" line (it stays).
9. **Summary tiers:** Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one (`TIER_RANK`, complete by type). The count line names only the kinds there are; "No raids right now" only when nothing is going on. Each tier is sure of its heading and an "…and N more" line.
10. **The summary post** is made like a party's post (`createPost`) and an unchanged edit is skipped by comparing the message as JSON; `summaryText` is `summaryMessage`.

Left open for the follow-ups (also at the end of the staging checklist): on a very busy day the summary's lower tiers may show only as counts; a spawn report whose picture Discord refuses is not sent again without it.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network.**
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8b1`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check` and the build after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Nothing Discord would refuse: every DM, list page, spawn report and summary within 40 components and the text budget in its worst case, with texts that need escapes; link buttons with addresses, other buttons with custom ids of at most 100 characters.
2. Stop on a v2 DM and on a classic DM sent before 8B-1, also two presses at once.
3. A list press reads the member's rows anew, removes only what it names, tolerates what is gone and shows a page that exists.
4. The summary: made and edited as v2, a classic one converted, no edit sent when nothing changed, no tier lost.
5. Nothing left that reads the removed embed card.

### Task 1: DMs may be components-v2 messages: the sender, the gateway and the strict fake

Prototype commit: `449d2bc10e6fc8d70592dc5271ffbf37864424a5`

DmJob.message and DmGateway.send take an OutgoingMessage; the discord.js
gateway sends it as discordPayload makes it. FakeDmGateway checks a v2
DM with FakePartyGateway.checkMessage, as the party gateway does.

**Files:**

```
 src/commands/notifications/wild.test.ts     |  7 ++++---
 src/discord/dm-gateway.ts                   |  6 +++---
 src/services/dm-sender.test.ts              | 25 +++++++++++++++++++++++++
 src/services/dm-sender.ts                   |  7 ++++---
 src/services/notify-service.parties.test.ts |  5 +++--
 src/services/notify-service.test.ts         | 14 +++++++-------
 test/support/dms.ts                         | 21 ++++++++++++---------
 7 files changed, 58 insertions(+), 27 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/notifications/wild.test.ts src/services/dm-sender.test.ts src/services/notify-service.parties.test.ts src/services/notify-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 449d2bc10e6fc8d70592dc5271ffbf37864424a5 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `DMs may be components-v2 messages: the sender, the gateway and the strict fake`, the body above and the trailer, staging exactly
  `src/commands/notifications/wild.test.ts src/discord/dm-gateway.ts src/services/dm-sender.test.ts src/services/dm-sender.ts src/services/notify-service.parties.test.ts src/services/notify-service.test.ts test/support/dms.ts`.

````diff
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index b1e67db61be4e619e046b09035b1b7eabffda1a3..9718feeff011fc49047194f52dea08d9c5e20c63 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -1,4 +1,5 @@
 import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
+import { classic } from '../../../test/support/messages.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
   fakeAutocomplete,
@@ -515,11 +516,11 @@ describe('/wild', () => {
     expect(made.dms.recipients).toEqual([BOB]);
     // After the messages for who is in a party, before the other news.
     expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.spawn);
-    const [message] = made.dms.to(BOB);
-    expect(message?.embeds).toEqual([
+    const message = classic(made.dms.to(BOB)[0]);
+    expect(message.embeds).toEqual([
       { color: 0x2ecc71, description: `by the fountain\n\n${SPAWN_WARNING}` },
     ]);
-    expect(message?.components?.[0]?.components).toMatchObject([
+    expect(message.components?.[0]?.components).toMatchObject([
       { custom_id: `dm:${made.gateway.guildId}:stop:p:147`, label: 'Stop: Dratini' },
     ]);
     expect(made.members.batches.at(-1)).toMatchObject({ channelId: WEST_CHANNEL });
diff --git a/src/discord/dm-gateway.ts b/src/discord/dm-gateway.ts
index 39bd88237daab0fe597aca26ecd3d657b1175839..41203117ab08c482c693b90347756a52381caa79 100644
--- a/src/discord/dm-gateway.ts
+++ b/src/discord/dm-gateway.ts
@@ -1,6 +1,6 @@
 import { ChannelType, DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
 import { BoundedMap } from '../bounded-map.js';
-import { discordPayload, type ClassicMessage } from './party-gateway.js';
+import { discordPayload, type OutgoingMessage } from './party-gateway.js';
 
 /**
  * What became of a direct message: `sent` when it went out; `closed` when Discord says this
@@ -16,7 +16,7 @@ export type DmOutcome = 'sent' | 'closed' | 'slow-down';
  * send this message to this user. Throws for any failure that `DmOutcome` does not name.
  */
 export interface DmGateway {
-  send(userId: string, message: ClassicMessage): Promise<DmOutcome>;
+  send(userId: string, message: OutgoingMessage): Promise<DmOutcome>;
 }
 
 /** Discord's answers that mean "nobody can write to this member", which no retry changes. */
@@ -70,7 +70,7 @@ export class DiscordDmGateway implements DmGateway {
     this.current = client;
   }
 
-  async send(userId: string, message: ClassicMessage): Promise<DmOutcome> {
+  async send(userId: string, message: OutgoingMessage): Promise<DmOutcome> {
     const client = this.current;
     if (!client) throw new Error('Discord is not connected yet');
     const known = this.channels.get(userId);
diff --git a/src/services/dm-sender.test.ts b/src/services/dm-sender.test.ts
index c703ef21c7fbd33902df6fcdda6dd285a9e59121..1b825992a1ec741596d2d07143b9ca5a0984df1a 100644
--- a/src/services/dm-sender.test.ts
+++ b/src/services/dm-sender.test.ts
@@ -1,4 +1,6 @@
+import { ComponentType } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
+import type { V2Message } from '../discord/party-gateway.js';
 import {
   FakeDmGateway,
   FakeLoopDelay,
@@ -616,6 +618,29 @@ describe('the fakes of direct messages', () => {
     expect(gateway.to(idOf(1))).toEqual([{ content: 'x' }]);
   });
 
+  it('FakeDmGateway takes a components-v2 message and refuses one Discord would refuse', async () => {
+    const gateway = new FakeDmGateway();
+    const text = (content: string) => ({ type: ComponentType.TextDisplay as const, content });
+    const box = (components: ReturnType<typeof text>[]) => ({
+      type: ComponentType.Container as const,
+      components,
+    });
+    const good: V2Message = { v2: true, components: [box([text('News.')])] };
+    expect(await gateway.send(idOf(1), good)).toBe('sent');
+    expect(gateway.to(idOf(1))).toEqual([good]);
+    // The checks of the party gateway: 40 components at most, no content beside the flag.
+    const many: V2Message = {
+      v2: true,
+      components: [box(Array.from({ length: 40 }, (_, n) => text(String(n))))],
+    };
+    await expect(gateway.send(idOf(1), many)).rejects.toThrow('at most 40 components');
+    const withContent = { ...good, content: 'x' } as unknown as V2Message;
+    await expect(gateway.send(idOf(1), withContent)).rejects.toThrow('no content or embeds');
+    await expect(gateway.send(idOf(1), { ...good, mention: { users: [idOf(1)] } })).rejects.toThrow(
+      'pings nobody',
+    );
+  });
+
   it('RecordingDms keeps what was put in line', () => {
     const dms = new RecordingDms();
     const job: DmJob = {
diff --git a/src/services/dm-sender.ts b/src/services/dm-sender.ts
index c1c9cde8b54bda5b9f158465412a59c307de8f0a..3474cd4bf2766a92cd8fbc21d9886d7346c9cce9 100644
--- a/src/services/dm-sender.ts
+++ b/src/services/dm-sender.ts
@@ -1,7 +1,7 @@
 import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
 import { BoundedMap } from '../bounded-map.js';
 import type { DmGateway, DmOutcome } from '../discord/dm-gateway.js';
-import type { ClassicMessage } from '../discord/party-gateway.js';
+import type { OutgoingMessage } from '../discord/party-gateway.js';
 import type { Logger } from '../log.js';
 
 /**
@@ -24,9 +24,10 @@ export interface DmJob {
   userId: string;
   /**
    * The message, built by the caller once per event: the sender renders nothing, and the jobs
-   * of one event may share the object.
+   * of one event may share the object. Classic (a meeting time, for a phone's notification) or
+   * components v2 (the notifier's news), sent as `discordPayload` makes it.
    */
-  message: ClassicMessage;
+  message: OutgoingMessage;
   priority: DmPriority;
   /** When what the message is about happened (epoch ms): delivery time is measured from it. */
   eventAt: number;
diff --git a/src/services/notify-service.parties.test.ts b/src/services/notify-service.parties.test.ts
index 3ee1cbd5d470f3a5b61bc9efe074c6a69d3b25fe..a6cc4e811aa63970f66e639df4aa455f8ddaa574 100644
--- a/src/services/notify-service.parties.test.ts
+++ b/src/services/notify-service.parties.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
+import { classic } from '../../test/support/messages.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { MemoryNewTrains } from '../../test/support/new-trains.js';
 import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
@@ -169,8 +170,8 @@ describe('NotifyService: an egg gets its boss', () => {
       ],
     ]);
     expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.urgent);
-    const [message] = made.dms.to(ALICE);
-    expect(message?.components?.[0]?.components).toMatchObject([
+    const message = classic(made.dms.to(ALICE)[0]);
+    expect(message.components?.[0]?.components).toMatchObject([
       { custom_id: `dm:${made.gateway.guildId}:stop:boss`, label: 'Stop: the boss of your eggs' },
     ]);
   });
diff --git a/src/services/notify-service.test.ts b/src/services/notify-service.test.ts
index 35e22d01e422bcc82b4146421bfa102e96c41cbb..316c217481a01bd962cb8ac0d1119899e9ce4a95 100644
--- a/src/services/notify-service.test.ts
+++ b/src/services/notify-service.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
+import { classic } from '../../test/support/messages.js';
 import { FakeDmGateway } from '../../test/support/dms.js';
 import { fakeButton } from '../../test/support/fake-interactions.js';
 import { gymsFixture } from '../../test/support/providers.js';
@@ -77,15 +78,15 @@ describe('NotifyService: a raid is reported', () => {
     expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
     expect(why(made, CAROL)).toEqual(['-# You asked to be told about: raids at The Stacks']);
     // The embed is the card of the post; a DM has none of the post's controls and pings nobody.
-    const [message] = made.dms.to(ALICE);
-    expect(message?.embeds).toHaveLength(1);
-    const [card] = message?.embeds ?? [];
+    const message = classic(made.dms.to(ALICE)[0]);
+    expect(message.embeds).toHaveLength(1);
+    const [card] = message.embeds ?? [];
     expect(card?.title).toBe('The Stacks');
     expect(card?.description?.split('\n')[0]).toBe('**Level 5 raid against Yveltal** ✨');
     expect(card?.description).toContain('Reported by Rhea.');
     expect(card?.fields?.map((field) => field.name)).toEqual(['Boss', 'Trainers (1)']);
-    expect(message?.components?.flatMap((row) => row.components).length).toBeLessThanOrEqual(5);
-    expect(message?.mention).toBeUndefined();
+    expect(message.components?.flatMap((row) => row.components).length).toBeLessThanOrEqual(5);
+    expect(message.mention).toBeUndefined();
     const [job] = made.dms.jobs;
     expect(job).toMatchObject({ priority: DM_PRIORITY.normal, eventAt: made.clock.now });
     // Without times a message is worth an hour.
@@ -311,8 +312,7 @@ describe('NotifyService: the buttons that stop a message', () => {
     const made = await reported(async ({ wants, gateway }) => {
       await wants.set(ALICE, gateway.guildId, T5, 'raid');
     });
-    const [message] = made.dms.to(ALICE);
-    if (!message) throw new Error('Alice was not told');
+    const message = classic(made.dms.to(ALICE)[0]);
     const dmGateway = new FakeDmGateway();
     expect(await dmGateway.send(ALICE, message)).toBe('sent');
     // The press, as the router handles it in a DM.
diff --git a/test/support/dms.ts b/test/support/dms.ts
index f1f899bf41c5f91c7ecf0175797f7a18aa10ed73..1d8f69f20a210b240171126e5ded2a0ed6738f93 100644
--- a/test/support/dms.ts
+++ b/test/support/dms.ts
@@ -1,5 +1,5 @@
 import type { DmGateway, DmOutcome } from '../../src/discord/dm-gateway.js';
-import type { ClassicMessage } from '../../src/discord/party-gateway.js';
+import type { OutgoingMessage } from '../../src/discord/party-gateway.js';
 import type {
   DmJob,
   DmSender,
@@ -10,17 +10,20 @@ import { FakePartyGateway } from './fake-gateway.js';
 
 /**
  * A `DmGateway` kept in memory. `sent` holds what went out, in order; a member of `closed`
- * takes no direct messages; a member of `slow` gets `slow-down`; `failing` makes every send reject. It is as strict as Discord about
- * what a message may hold (the rules of `FakePartyGateway`: content or an embed, the limits of
- * an embed, five rows of five controls), and a DM pings nobody: a message that names somebody
- * to ping is refused, because nothing that is sent as a DM should try.
+ * takes no direct messages; a member of `slow` gets `slow-down`; `failing` makes every send
+ * reject. It is as strict as Discord about what a message may hold, with the very checks of
+ * `FakePartyGateway.checkMessage`: for a classic message content or an embed, the limits of an
+ * embed, five rows of five controls; for a components-v2 message (the notifier's) no content or
+ * embeds beside the flag, 40 components, the text budget, sections with an accessory, unique
+ * custom ids. A DM pings nobody: a message that names somebody to ping is refused, because
+ * nothing that is sent as a DM should try.
  *
  * Like Discord it answers in a later turn of the event loop (`setImmediate`), so a test that
  * needs a fixed time fakes only `Date`. `most` is the largest number of sends that were on
  * their way at once.
  */
 export class FakeDmGateway implements DmGateway {
-  readonly sent: { userId: string; message: ClassicMessage }[] = [];
+  readonly sent: { userId: string; message: OutgoingMessage }[] = [];
   readonly closed = new Set<string>();
   /** A send to one of these is answered `slow-down`, as when Discord opens no more DM channels. */
   readonly slow = new Set<string>();
@@ -39,7 +42,7 @@ export class FakeDmGateway implements DmGateway {
     for (const answer of this.held.splice(0)) answer();
   }
 
-  send(userId: string, message: ClassicMessage): Promise<DmOutcome> {
+  send(userId: string, message: OutgoingMessage): Promise<DmOutcome> {
     this.asked.push(userId);
     this.running += 1;
     this.most = Math.max(this.most, this.running);
@@ -72,7 +75,7 @@ export class FakeDmGateway implements DmGateway {
   }
 
   /** The messages that went to one member, oldest first. */
-  to(userId: string): ClassicMessage[] {
+  to(userId: string): OutgoingMessage[] {
     return this.sent.filter((sent) => sent.userId === userId).map((sent) => sent.message);
   }
 }
@@ -86,7 +89,7 @@ export class RecordingDms implements DmSender {
   }
 
   /** The messages for one member, in the order they were put in line. */
-  to(userId: string): ClassicMessage[] {
+  to(userId: string): OutgoingMessage[] {
     return this.jobs.filter((job) => job.userId === userId).map((job) => job.message);
   }
````

### Task 2: Direct messages of the notifier as components-v2 messages

Prototype commit: `e1f1e9125d83c24cc490c15cfbf2b08105d50baa`

One container in the post's colour: the news (its sentence, without the
address of the post) with the party's brief and picture beside it, a row
of links (Go to post, a raid's Map; Go to report for a spawn), and under
"You asked to be told about" one section per reason with its Stop button.
A pressed Stop stays as a disabled Stopped; a classic DM sent before keeps
losing its button. The renderers make a brief (accent, picture, lines, map)
in the place of the card, whose embed code goes. The meeting-time DM stays
plain text.

**Files:**

```
 src/commands/notifications/wild.test.ts     |  42 ++++---
 src/components/dm.test.ts                   | 119 +++++++++++-------
 src/components/dm.ts                        |  38 ++++--
 src/render/meetup-post.test.ts              |  30 ++---
 src/render/meetup-post.ts                   |  48 +++-----
 src/render/notify-dm.test.ts                | 319 +++++++++++++++++++++++++++++++++++-------------
 src/render/notify-dm.ts                     | 230 +++++++++++++++++++++++-----------
 src/render/party-card.ts                    | 135 --------------------
 src/render/party-controls.ts                |  11 +-
 src/render/party-post.ts                    |  25 ++--
 src/render/raid-post.test.ts                |  85 ++++---------
 src/render/raid-post.ts                     | 125 ++++---------------
 src/render/spawn.ts                         |  48 ++++++--
 src/render/train-post.test.ts               |  75 +++---------
 src/render/train-post.ts                    | 115 ++++-------------
 src/render/v2.ts                            |  13 ++
 src/services/anonymous-maker.test.ts        |   7 +-
 src/services/notify-service.parties.test.ts |  81 +++++-------
 src/services/notify-service.test.ts         | 114 +++++++++--------
 src/services/notify-service.ts              | 100 ++++++++-------
 src/services/party-service.ts               |  13 +-
 src/services/spawn-service.test.ts          |  18 ++-
 test/support/dms.ts                         |  22 +++-
 test/support/fake-interactions.ts           |  59 ++++++++-
 test/support/messages.ts                    |  49 ++++++++
 test/support/post-limits.ts                 |  11 ++
 26 files changed, 1009 insertions(+), 923 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/notifications/wild.test.ts src/components/dm.test.ts src/render/meetup-post.test.ts src/render/notify-dm.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts src/services/anonymous-maker.test.ts src/services/notify-service.parties.test.ts src/services/notify-service.test.ts src/services/spawn-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff e1f1e9125d83c24cc490c15cfbf2b08105d50baa -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `Direct messages of the notifier as components-v2 messages`, the body above and the trailer, staging exactly
  `src/commands/notifications/wild.test.ts src/components/dm.test.ts src/components/dm.ts src/render/meetup-post.test.ts src/render/meetup-post.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/render/party-card.ts src/render/party-controls.ts src/render/party-post.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/spawn.ts src/render/train-post.test.ts src/render/train-post.ts src/render/v2.ts src/services/anonymous-maker.test.ts src/services/notify-service.parties.test.ts src/services/notify-service.test.ts src/services/notify-service.ts src/services/party-service.ts src/services/spawn-service.test.ts test/support/dms.ts test/support/fake-interactions.ts test/support/messages.ts test/support/post-limits.ts`.

````diff
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index 9718feeff011fc49047194f52dea08d9c5e20c63..1d3615083d0654a614f6fded23b993dd103ef858 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -1,5 +1,12 @@
 import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
-import { classic } from '../../../test/support/messages.js';
+import {
+  accentOf,
+  customIdsOf,
+  dmBrief,
+  dmSummary,
+  linksOf,
+  textDisplays,
+} from '../../../test/support/messages.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
   fakeAutocomplete,
@@ -69,7 +76,7 @@ async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
   };
   const told = async (userId: string): Promise<string[][]> => {
     await made.notify.flush();
-    return made.dms.to(userId).map((message) => (message.content ?? '').split('\n'));
+    return made.dms.to(userId).map((message) => dmSummary(message));
   };
   return { ...made, ctx, handle, run, offered, reports, want, told };
 }
@@ -175,10 +182,8 @@ describe('/wild', () => {
     await made.run({ pokemon: 'dratini', ...typed }, { ...named, channelId: EAST_CHANNEL });
     await made.notify.flush();
     expect(made.dms.to(BOB)).toHaveLength(3);
-    const own = (text: string | undefined) =>
-      (text ?? '').replace(/https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+/g, '');
     const texts = [
-      ...made.dms.to(BOB).flatMap((dm) => [own(dm.content), dm.embeds?.[0]?.description]),
+      ...made.dms.to(BOB).flatMap((dm) => textDisplays(dm)),
       ...[WEST_CHANNEL, EAST_CHANNEL, SIGHTINGS].flatMap((channel) =>
         made.gateway
           .messagesIn(channel)
@@ -507,22 +512,21 @@ describe('/wild', () => {
     made.members.hide(WEST_CHANNEL, CAROL);
     await made.run({ pokemon: 'dratini', details: 'by the fountain' });
     expect(await made.told(BOB)).toEqual([
-      [
-        `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**: ` +
-          postLink(made.gateway.guildId, WEST_CHANNEL, made.reports()[0]?.id ?? ''),
-        '-# You asked to be told about: Dratini',
-      ],
+      [`A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`, 'Dratini'],
     ]);
     expect(made.dms.recipients).toEqual([BOB]);
     // After the messages for who is in a party, before the other news.
     expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.spawn);
-    const message = classic(made.dms.to(BOB)[0]);
-    expect(message.embeds).toEqual([
-      { color: 0x2ecc71, description: `by the fountain\n\n${SPAWN_WARNING}` },
+    const message = made.dms.to(BOB)[0];
+    expect(dmBrief(message)).toEqual([
+      '**Where** by the fountain',
+      `The report goes away <t:${String((PARTY_NOW + 30 * 60_000) / 1000)}:R>.`,
     ]);
-    expect(message.components?.[0]?.components).toMatchObject([
-      { custom_id: `dm:${made.gateway.guildId}:stop:p:147`, label: 'Stop: Dratini' },
+    expect(accentOf(message)).toBe(0x2ecc71);
+    expect(linksOf(message)).toEqual([
+      `Go to report ${postLink(made.gateway.guildId, WEST_CHANNEL, made.reports()[0]?.id ?? '')}`,
     ]);
+    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:stop:p:147`]);
     expect(made.members.batches.at(-1)).toMatchObject({ channelId: WEST_CHANNEL });
     expect(made.dms.jobs[0]?.expiresAt).toBe(PARTY_NOW + 30 * 60_000);
     // A spawn is no party: another member's report of the same Pokémon is news again.
@@ -549,9 +553,9 @@ describe('/wild', () => {
     expect(await made.told(BOB)).toEqual([
       [
         expect.stringMatching(
-          /^A wild \*\*Dratini\*\* with 100% IVs has been reported in <#\d+> by \*\*Alice\*\*: https:/,
+          /^A wild \*\*Dratini\*\* with 100% IVs has been reported in <#\d+> by \*\*Alice\*\*\.$/,
         ),
-        '-# You asked to be told about: Perfect IV spawns · Dratini',
+        'Perfect IV spawns · Dratini',
       ],
     ]);
     expect(await made.told(CAROL)).toHaveLength(1);
@@ -643,9 +647,9 @@ describe('/wild: Unown', () => {
     expect(await made.told(BOB)).toEqual([
       [
         expect.stringMatching(
-          /^A wild \*\*Unown \(F\)\*\* has been reported in <#\d+> by \*\*Alice\*\*: https:/,
+          /^A wild \*\*Unown \(F\)\*\* has been reported in <#\d+> by \*\*Alice\*\*\.$/,
         ),
-        '-# You asked to be told about: Unown (every form)',
+        'Unown (every form)',
       ],
     ]);
   });
diff --git a/src/components/dm.test.ts b/src/components/dm.test.ts
index 1f2bfdaaa63c252273289b819277a44b9147788f..a1e9fcf67b4ae70c0a231b5b429f0dfbd793d3f9 100644
--- a/src/components/dm.test.ts
+++ b/src/components/dm.test.ts
@@ -1,11 +1,14 @@
-import { ButtonStyle, ComponentType } from 'discord.js';
+import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
   fakeButton,
   fakeMessage,
   sent,
   type FakeInteraction,
+  type FakeRow,
 } from '../../test/support/fake-interactions.js';
+import { buttonsOf, dmReasons, textDisplays } from '../../test/support/messages.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import { MemoryGymTargets } from '../../test/support/gym-targets.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { MemoryNewTrains } from '../../test/support/new-trains.js';
@@ -18,7 +21,7 @@ import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
 import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
 import { entryWant } from '../domain/pogo/wants.js';
-import { notifyDm, stopButtonId, type ControlRows } from '../render/notify-dm.js';
+import { notifyDm, stopButtonId } from '../render/notify-dm.js';
 import { dmControls } from './dm.js';
 import { components } from './index.js';
 
@@ -30,6 +33,13 @@ const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: fals
 const YVELTAL = pokemonTarget(717);
 const want = (target: NotificationTarget): NotifyReason => ({ kind: 'want', target });
 
+/** The custom ids of the Stop buttons of a message's components that were not pressed. */
+function activeStops(components: readonly unknown[]): string[] {
+  return buttonsOf({ v2: true, components: components as V2Message['components'] })
+    .filter((button) => button.label === 'Stop' && button.customId !== undefined)
+    .map((button) => button.customId ?? '');
+}
+
 function setup() {
   const wants = new MemoryWants();
   const gymTargets = new MemoryGymTargets();
@@ -37,16 +47,18 @@ function setup() {
   const newTrains = new MemoryNewTrains();
   const { ctx, entries } = createTestContext({ wants, gymTargets, users, newTrains });
   const router = new InteractionRouter(ctx, [], [dmControls]);
-  /** The rows of a message with a button for each of these reasons. */
-  const rows = (reasons: NotifyReason[], guildId = HOME): ControlRows =>
+  /**
+   * The components of a direct message with a button for each of these reasons, as the fake
+   * message of a press carries them (a container at the top, not rows).
+   */
+  const rows = (reasons: NotifyReason[], guildId = HOME): FakeRow[] =>
     notifyDm(
-      'A raid.',
+      { sentence: 'A raid.', links: [] },
       reasons.map((reason, index) => ({
         label: `reason ${String(index)}`,
         stop: stopButtonId(guildId, reason),
       })),
-      undefined,
-    ).components ?? [];
+    ).components as unknown as FakeRow[];
   /** A press, in a DM, of the button for `reason` under a message with buttons for `all`. */
   const press = async (
     userId: string,
@@ -64,16 +76,14 @@ function setup() {
     return interaction;
   };
   const said = (interaction: FakeInteraction) => sent(interaction.followUp).content;
-  /** The custom ids of the buttons a press left on the message. */
+  /** The custom ids of the Stop buttons a press left as they were (not Stopped). */
   const left = (interaction: FakeInteraction): string[] =>
-    (sent(interaction.editReply).components as ControlRows).flatMap((row) =>
-      row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
-    );
+    activeStops(sent(interaction.editReply).components ?? []);
   return { ctx, entries, router, wants, gymTargets, users, newTrains, press, said, left, rows };
 }
 
 describe('the "Stop" buttons under a direct message', () => {
-  it('removes the want in the server the button names, answers in the DM, and takes the button off', async () => {
+  it('removes the want in the server the button names, answers in the DM, and shows the button as Stopped', async () => {
     const made = setup();
     await made.wants.set(ALICE, HOME, T5, 'raid');
     await made.wants.set(ALICE, HOME, YVELTAL, 'both');
@@ -86,13 +96,24 @@ describe('the "Stop" buttons under a direct message', () => {
     // In a DM nothing is hidden from anybody: the answer is an ordinary message.
     expect(sent(pressed.followUp).flags).toBeUndefined();
     expect(made.left(pressed)).toEqual([stopButtonId(HOME, want(YVELTAL))]);
+    // The pressed button stays where it was, disabled, as Stopped; the message stays v2.
+    const edit = sent(pressed.editReply);
+    expect(edit.flags).toBe(MessageFlags.IsComponentsV2);
+    const shown = { v2: true as const, components: edit.components as V2Message['components'] };
+    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Stopped', 'Stop']);
+    expect(textDisplays(shown)).toEqual(
+      textDisplays({
+        v2: true,
+        components: made.rows([want(T5), want(YVELTAL)]) as unknown as V2Message['components'],
+      }),
+    );
     expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
       { target: YVELTAL, scope: 'both' },
     ]);
     expect(await made.wants.count(ALICE, AWAY)).toBe(1);
   });
 
-  it('is safe to repeat: what is gone already is said to be gone, and the button still goes', async () => {
+  it('is safe to repeat: what is gone already is said to be gone, and the button still shows as Stopped', async () => {
     const made = setup();
     await made.wants.set(ALICE, HOME, T5, 'raid');
     await made.press(ALICE, want(T5));
@@ -100,7 +121,7 @@ describe('the "Stop" buttons under a direct message', () => {
     expect(made.said(again)).toBe(
       '**T5 raids** was already removed from your list for that server.',
     );
-    expect(sent(again.editReply).components).toEqual([]);
+    expect(made.left(again)).toEqual([]);
   });
 
   it('says so when the want it removed was for raids and spawns', async () => {
@@ -135,12 +156,8 @@ describe('the "Stop" buttons under a direct message', () => {
     );
     await Promise.all(presses.map((pressed) => made.router.handle(pressed as never)));
     expect(await made.wants.count(ALICE, HOME)).toBe(0);
-    // Neither press put the other's button back: only the gym's is left.
-    expect(
-      message.rows.flatMap((row) =>
-        row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
-      ),
-    ).toEqual([stopButtonId(HOME, gym)]);
+    // Neither press undid the other's: only the gym's button is left as it was.
+    expect(activeStops(message.rows)).toEqual([stopButtonId(HOME, gym)]);
     for (const pressed of presses) expect(pressed.fetchReply).toHaveBeenCalledTimes(1);
   });
 
@@ -186,6 +203,36 @@ describe('the "Stop" buttons under a direct message', () => {
     expect(made.entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
   });
 
+  it('takes the button off a classic message sent before the DMs were v2', async () => {
+    const made = setup();
+    await made.wants.set(ALICE, HOME, T5, 'raid');
+    const button = (reason: NotifyReason, label: string) => ({
+      type: ComponentType.Button,
+      style: ButtonStyle.Secondary,
+      custom_id: stopButtonId(HOME, reason) ?? '',
+      label,
+    });
+    const legacy: FakeRow[] = [
+      {
+        type: ComponentType.ActionRow,
+        components: [button(want(T5), 'Stop: T5 raids'), button(want(YVELTAL), 'Stop: Yveltal')],
+      },
+    ];
+    const pressed = fakeButton({
+      customId: stopButtonId(HOME, want(T5)) ?? '',
+      isDm: true,
+      userId: ALICE,
+      messageRows: legacy,
+    });
+    await made.router.handle(pressed as never);
+    const edit = sent(pressed.editReply);
+    expect(edit.flags).toBeUndefined();
+    expect(edit.components).toEqual([
+      { type: ComponentType.ActionRow, components: [button(want(YVELTAL), 'Stop: Yveltal')] },
+    ]);
+    expect(await made.wants.count(ALICE, HOME)).toBe(0);
+  });
+
   it('removes one form, the shadow raids and an IV want each by itself', async () => {
     const made = setup();
     const origin = pokemonTarget(487, 'giratina_origin');
@@ -354,30 +401,16 @@ describe('the custom id of a stop button', () => {
   it('is knowingly left out for a form whose key does not fit, and the message names the command', () => {
     const long = pokemonTarget(999_999, 'x'.repeat(64), true);
     expect(stopButtonId(LONGEST_GUILD, want(long))).toBeUndefined();
-    const message = notifyDm(
-      'A raid.',
-      [
-        { label: 'Shadow Longname', stop: undefined, command: '/unwant' },
-        { label: 'T5 raids', stop: stopButtonId(HOME, want(T5)), command: '/unwant' },
-      ],
-      undefined,
-    );
-    expect(message.content).toBe(
-      'A raid.\n-# You asked to be told about: Shadow Longname · T5 raids\n' +
-        '-# To stop what has no button here, use `/unwant` in the server.',
+    const message = notifyDm({ sentence: 'A raid.', links: [] }, [
+      { label: 'Shadow Longname', stop: undefined, command: '/unwant' },
+      { label: 'T5 raids', stop: stopButtonId(HOME, want(T5)), command: '/unwant' },
+    ]);
+    expect(dmReasons(message)).toEqual(['T5 raids', 'Shadow Longname']);
+    expect(textDisplays(message).at(-1)).toBe(
+      'Shadow Longname\n-# To stop what has no button here, use `/unwant` in the server.',
     );
-    expect(message.components).toEqual([
-      {
-        type: ComponentType.ActionRow,
-        components: [
-          {
-            type: ComponentType.Button,
-            style: ButtonStyle.Secondary,
-            custom_id: `dm:${HOME}:stop:t:T5`,
-            label: 'Stop: T5 raids',
-          },
-        ],
-      },
+    expect(buttonsOf(message)).toMatchObject([
+      { label: 'Stop', style: ButtonStyle.Secondary, customId: `dm:${HOME}:stop:t:T5` },
     ]);
   });
 
diff --git a/src/components/dm.ts b/src/components/dm.ts
index 329b9f07fb2f071a837bf625bbe291cd6fb26243..dd24f7e2f4d0d7646a24e6909be0c443b64b6b2d 100644
--- a/src/components/dm.ts
+++ b/src/components/dm.ts
@@ -1,4 +1,4 @@
-import { ComponentType, type Message } from 'discord.js';
+import { ComponentType, MessageFlags, type Message } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import { SCOPE_WORDS } from '../commands/notifications/want-input.js';
 import type { ComponentHandler } from '../discord/command.js';
@@ -8,7 +8,13 @@ import { STALE_COMPONENT } from '../discord/router.js';
 import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
 import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { wantTargetLabel, wantToken } from '../domain/pogo/wants.js';
-import { DM_KIND, STOP_ACTION, withoutButton, type ControlRows } from '../render/notify-dm.js';
+import {
+  DM_KIND,
+  STOP_ACTION,
+  withoutButton,
+  withStopped,
+  type ControlRows,
+} from '../render/notify-dm.js';
 import { gymName } from '../render/raid-post.js';
 import { plain } from '../render/text.js';
 import { KeyedLock } from '../services/keyed-lock.js';
@@ -84,14 +90,16 @@ const messages = new KeyedLock<string>();
 
 /**
  * The buttons under a direct message of the notifier (custom-id kind `dm`; the id is the
- * server's snowflake, see `custom-id.ts`). "Stop: …" stops that one reason for whoever pressed
+ * server's snowflake, see `custom-id.ts`). "Stop" stops that one reason for whoever pressed
  * it: nothing is looked up about the message or its recipient, so a press works after a
  * restart and removes only what the presser has themself. The answer comes in the DM, and the
- * button goes from the message while the others stay: the message is read anew for that
- * (`fetchReply`: after `deferUpdate` the reply is the message the button is on), one press
- * after the other, so that a button another press took off meanwhile stays off. What was
+ * button becomes a disabled "Stopped" while the rest of the message stays (`withStopped`: a
+ * section must keep its accessory); under a classic message sent before the DMs were
+ * components v2 the button goes from its row (`withoutButton`). The message is read anew for
+ * that (`fetchReply`: after `deferUpdate` the reply is the message the button is on), one press
+ * after the other, so that a button another press changed meanwhile stays changed. What was
  * stopped is stopped by then, so the answer is given whatever becomes of the button: when the
- * message cannot be read anew its rows are those the press carries, and when it cannot be
+ * message cannot be read anew its components are those the press carries, and when it cannot be
  * changed the button stays (pressing it again says that it was removed already).
  *
  * It has no guards: a press comes from a DM, where there is no server and no member.
@@ -107,16 +115,24 @@ export const dmControls: ComponentHandler = {
     await interaction.deferUpdate();
     const said = await stop(ctx, interaction.user.id, id.id, reason);
     await messages.run(interaction.message.id, async () => {
-      let now: Pick<Message, 'components'> = interaction.message;
+      let now: Pick<Message, 'components' | 'flags'> = interaction.message;
       try {
         now = await interaction.fetchReply();
       } catch (err) {
         ctx.log.warn({ err }, 'could not read a direct message anew to take a button off');
       }
       try {
-        await interaction.editReply({
-          components: withoutButton(rowsOf(now), interaction.customId),
-        });
+        const components = now.components.map((component) => component.toJSON());
+        // A message of the notifier since 8B-1 is components v2: the button stays, as Stopped.
+        // One sent before is a classic one with a row of buttons, and the button goes.
+        await interaction.editReply(
+          now.flags.has(MessageFlags.IsComponentsV2)
+            ? {
+                components: withStopped(components, interaction.customId),
+                flags: MessageFlags.IsComponentsV2,
+              }
+            : { components: withoutButton(rowsOf(now), interaction.customId) },
+        );
       } catch (err) {
         ctx.log.warn({ err }, 'could not take a button off a direct message');
       }
diff --git a/src/render/meetup-post.test.ts b/src/render/meetup-post.test.ts
index fdd2e38cb6b3ca377cfe29d1b306c9aa2c5bdc5c..ffae2725eefa589850ee951a2c94b5b19624755a 100644
--- a/src/render/meetup-post.test.ts
+++ b/src/render/meetup-post.test.ts
@@ -120,20 +120,19 @@ describe('renderMeetupPost', () => {
     ]);
     expect(accentOf(rendered.message)).toBe(0x3498db);
     expect(rendered.message).toEqual(postMessage(rendered.layout));
-    // The card of a direct message.
-    expect(rendered.card).toEqual({
-      title: 'Community Day picnic',
-      description: `**Meetup**\n${NO_TIME}\nCreated by <@${REPORTER}>.`,
-      color: 0x3498db,
-      fields: [{ name: 'Trainers (1)', value: `**Interested** <@${REPORTER}>` }],
+    // The brief of a direct message.
+    expect(rendered.brief).toEqual({
+      accent: 0x3498db,
+      lines: ['**Meetup: Community Day picnic**', NO_TIME, '1 trainer'],
     });
   });
 
   it('is nothing like a raid: no gym link, no picture, another colour', () => {
-    const { message, card } = renderMeetupPost(view(testMeetup()));
+    const { message, brief } = renderMeetupPost(view(testMeetup()));
     expect(textOf(message)).not.toContain('google.com/maps');
     expect(thumbnailOf(message)).toBeUndefined();
-    expect(card.url).toBeUndefined();
+    expect(brief).not.toHaveProperty('map');
+    expect(brief).not.toHaveProperty('picture');
     const raid = renderRaidPost({
       party: testRaid(),
       now: PARTY_NOW,
@@ -151,7 +150,7 @@ describe('renderMeetupPost', () => {
     const rendered = renderMeetupPost(view(testMeetup({ name: '**Bold** @everyone <@1>' })));
     expect(rendered.title).toBe('Meetup · **Bold** @everyone <@1>');
     expect(header(rendered)[0]).toBe('### Meetup: \\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>');
-    expect(rendered.card.title).toBe('\\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>');
+    expect(rendered.brief.lines[0]).toBe('**Meetup: \\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>**');
   });
 
   it('always names who made it, as the first trainer in its list does anyway', () => {
@@ -305,7 +304,7 @@ describe('the information of a meetup post', () => {
   it('has no such heading while nobody wrote anything', () => {
     const rendered = renderMeetupPost(view(testMeetup()));
     expect(textOf(rendered.message)).not.toContain('Information');
-    expect(rendered.card.description).not.toContain('Information');
+    expect(rendered.brief.lines.join('\n')).not.toContain('Information');
   });
 
   it('shows what the members wrote under the head lines, line by line', () => {
@@ -314,12 +313,8 @@ describe('the information of a meetup post', () => {
       `### Meetup: Community Day picnic\n${NO_TIME}`,
       '**Meeting Information**\nBring snacks.\n\nWe meet at the fountain.',
     ]);
-    // In the card it stands in the description, under the lines about the meetup.
-    expect(rendered.card.description).toBe(
-      `**Meetup**\n${NO_TIME}\nCreated by <@${REPORTER}>.\n\n` +
-        '**Meeting Information**\nBring snacks.\n\nWe meet at the fountain.',
-    );
-    expect(rendered.card.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
+    // Not in the brief of a direct message: the post has it.
+    expect(rendered.brief.lines.join('\n')).not.toContain('snacks');
   });
 
   it('puts it under the line that the post is kept', () => {
@@ -376,9 +371,6 @@ describe('the information of a meetup post', () => {
       `${'<\u200b'.repeat(999)}<`,
     );
     expect(block(rendered, '**Coming')).toMatch(/…and \d+ more$/);
-    // The card stays an embed Discord takes.
-    expect((rendered.card.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
-    expect(rendered.card.description?.endsWith(`${'<\u200b'.repeat(999)}<`)).toBe(true);
   });
 });
 
diff --git a/src/render/meetup-post.ts b/src/render/meetup-post.ts
index b5bb4490993d89c0d37328a09406c8ed6da84894..0512640928aede5989cc714f5a176965d443e4ad 100644
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -1,7 +1,5 @@
-import type { APIEmbed } from 'discord.js';
 import { memberOf, type MeetupParty } from '../domain/party/party.js';
 import { nameOf } from '../domain/party/timed.js';
-import { fitEmbed, groupField, type ShrinkableField } from './party-card.js';
 import { bottomControls } from './party-controls.js';
 import {
   ENDED_COLOUR,
@@ -10,11 +8,13 @@ import {
   renderedPost,
   tidyTitle,
   trainerBlocks,
+  trainerCount,
   type ForumTag,
+  type PartyBrief,
   type PostLayout,
   type RenderedPost,
 } from './party-post.js';
-import { LIMITS, memberByName, memberName, plain, plainLines, truncate } from './text.js';
+import { LIMITS, memberByName, plain, plainLines, truncate } from './text.js';
 import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';
 
 /** What the post of a meetup is rendered from (see `TimedPostView`). */
@@ -77,43 +77,23 @@ function meetupLayout(view: MeetupPostView): PostLayout {
 }
 
 /**
- * The card of a meetup, for a direct message. What the members wrote stands in the description,
- * under a heading, and not in a field: a field holds 1024 characters, and a text of the 1000 a
- * form takes can be longer than that once it is made plain.
+ * The meetup in brief, for a direct message: its name, its times as the post says them and how
+ * many come, with the colour of its post.
  */
-function meetupCard(view: MeetupPostView): APIEmbed {
+function meetupBrief(view: MeetupPostView): PartyBrief {
   const { party } = view;
-  const about = information(party);
-  const description = [
-    '**Meetup**',
-    view.closed ?? describeTimes(view),
-    `Created by ${memberName(memberOf(party, party.createdById))}.`,
-    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
-    ...(about === '' ? [] : ['', '**Meeting Information**', about]),
-  ].join('\n');
-  const fields: ShrinkableField[] = [];
-  const single = party.groups.length === 1;
-  for (const group of party.groups) {
-    fields.push({
-      field: groupField(view, group, { single, lobby: false }),
-      shrink: (limit) => groupField(view, group, { single, lobby: false, limit }),
-      rank: 1,
-    });
-  }
-  // Embed titles render Markdown (a thread name does not, so the post's own title stays raw).
-  const embedTitle = truncate(plain(nameOf(party)), LIMITS.embedTitle);
-  const embedDescription = truncate(description, LIMITS.embedDescription);
-  fitEmbed(embedTitle, embedDescription, fields);
   return {
-    title: embedTitle,
-    description: embedDescription,
-    color: colour(view),
-    fields: fields.map((f) => f.field),
+    accent: colour(view),
+    lines: [
+      `**Meetup: ${plain(nameOf(party))}**`,
+      view.closed ?? describeTimes(view),
+      trainerCount(party),
+    ],
   };
 }
 
 /**
- * The forum post of a meetup: title, tags, the components-v2 message and the card of a direct
+ * The forum post of a meetup: title, tags, the components-v2 message and the brief of a direct
  * message. Pure: the same view gives the same post. It has what the post of a raid has without
  * what belongs to a gym or a boss.
  */
@@ -124,6 +104,6 @@ export function renderMeetupPost(view: MeetupPostView): RenderedPost {
     title: meetupTitle(party),
     tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
     layout: meetupLayout(view),
-    card: meetupCard(view),
+    brief: meetupBrief(view),
   });
 }
diff --git a/src/render/notify-dm.test.ts b/src/render/notify-dm.test.ts
index d14e16e6a73cc7fb9607ad5d38935baff588d228..907d50ab95ff7a43f6e912ee51444417abbd2d29 100644
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -1,16 +1,34 @@
 import { describe, expect, it } from 'vitest';
+import { ButtonStyle, ComponentType } from 'discord.js';
+import {
+  buttonsOf,
+  componentCount,
+  dmBrief,
+  dmReasons,
+  dmSentence,
+  linksOf,
+  textDisplays,
+  thumbnailOf,
+  accentOf,
+} from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
 import {
   bossSetSentence,
+  mapLink,
+  stopButtonRoom,
   meetingDmSentence,
+  NEWS_COLOUR,
   notifyDm,
+  postButton,
   postLink,
   raidDmSentence,
-  reasonLine,
+  reportButton,
   stopButtonId,
   stopHint,
-  stopRow,
   trainDmSentence,
   withoutButton,
+  withStopped,
+  type ControlRows,
   type RaidDmView,
   type ShownReason,
 } from './notify-dm.js';
@@ -27,7 +45,6 @@ const view = (more: Partial<RaidDmView> = {}): RaidDmView => ({
   gym: 'The Stacks',
   regionChannelId: REGION,
   reporter: { id: '200000000000000001', name: 'Rhea' },
-  link: LINK,
   ...more,
 });
 
@@ -41,13 +58,13 @@ describe('postLink', () => {
 describe('raidDmSentence', () => {
   it('says the legacy sentence for a reported raid, naming the reporter by name alone', () => {
     expect(raidDmSentence(view())).toBe(
-      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>) by **Rhea**: ${LINK}`,
+      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>) by **Rhea**.`,
     );
   });
 
   it('calls an egg by its tier, with the right article', () => {
     expect(raidDmSentence(view({ boss: undefined }))).toBe(
-      `A T5 egg has been reported at **The Stacks** (<#${REGION}>) by **Rhea**: ${LINK}`,
+      `A T5 egg has been reported at **The Stacks** (<#${REGION}>) by **Rhea**.`,
     );
     expect(
       raidDmSentence(view({ boss: undefined, tier: { level: 'Elite', shadow: false } })),
@@ -59,7 +76,7 @@ describe('raidDmSentence', () => {
 
   it('names nobody for an anonymous report, and falls back to the mention without a name', () => {
     expect(raidDmSentence(view({ reporter: undefined }))).toBe(
-      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>): ${LINK}`,
+      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>).`,
     );
     expect(raidDmSentence(view({ reporter: { id: '200000000000000001' } }))).toContain(
       'by **<@200000000000000001>**',
@@ -68,31 +85,31 @@ describe('raidDmSentence', () => {
 
   it('leaves the region out when it is gone', () => {
     expect(raidDmSentence(view({ regionChannelId: undefined, reporter: undefined }))).toBe(
-      `A raid for **Yveltal** has been reported at **The Stacks**: ${LINK}`,
+      `A raid for **Yveltal** has been reported at **The Stacks**.`,
     );
   });
 
   it('says that the raid has its boss, without naming who acted', () => {
     expect(raidDmSentence(view({ event: 'boss' }))).toBe(
-      `The raid at **The Stacks** (<#${REGION}>) now has its boss, **Yveltal**: ${LINK}`,
+      `The raid at **The Stacks** (<#${REGION}>) now has its boss, **Yveltal**.`,
     );
     // Another boss than it had: a correction.
     expect(raidDmSentence(view({ event: 'boss', corrected: true }))).toBe(
-      `The boss of the raid at **The Stacks** (<#${REGION}>) is now **Yveltal**: ${LINK}`,
+      `The boss of the raid at **The Stacks** (<#${REGION}>) is now **Yveltal**.`,
     );
     expect(
       raidDmSentence(
         view({ event: 'boss', boss: undefined, tier: { level: 'T3', shadow: false } }),
       ),
-    ).toBe(`The raid at **The Stacks** (<#${REGION}>) is a T3 egg now: ${LINK}`);
+    ).toBe(`The raid at **The Stacks** (<#${REGION}>) is a T3 egg now.`);
   });
 
   it('says where the raid is when its gym was corrected', () => {
     expect(raidDmSentence(view({ event: 'gym' }))).toBe(
-      `The raid for **Yveltal** is at **The Stacks** (<#${REGION}>), not where it was first reported: ${LINK}`,
+      `The raid for **Yveltal** is at **The Stacks** (<#${REGION}>), not where it was first reported.`,
     );
     expect(raidDmSentence(view({ event: 'gym', boss: undefined }))).toBe(
-      `The T5 egg is at **The Stacks** (<#${REGION}>), not where it was first reported: ${LINK}`,
+      `The T5 egg is at **The Stacks** (<#${REGION}>), not where it was first reported.`,
     );
   });
 
@@ -118,10 +135,10 @@ describe('a member named in a direct message', () => {
   it('never brings a working link with their name: raid, train and meeting time', () => {
     const raid = raidDmSentence(view({ reporter: linked }));
     expect(raid).toBe(
-      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>) by ${shown}: ${LINK}`,
+      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>) by ${shown}.`,
     );
-    const train = trainDmSentence({ regionChannelId: REGION, maker: linked, link: LINK });
-    expect(train).toBe(`A new train has been announced in <#${REGION}> by ${shown}: ${LINK}`);
+    const train = trainDmSentence({ regionChannelId: REGION, maker: linked });
+    expect(train).toBe(`A new train has been announced in <#${REGION}> by ${shown}.`);
     const meeting = meetingDmSentence({
       what: 'meeting',
       subject: 'the raid at The Stacks',
@@ -133,116 +150,248 @@ describe('a member named in a direct message', () => {
     expect(meeting).toBe(
       `No meeting time any more for the raid at The Stacks (cancelled by ${shown.replaceAll('**', '')}): ${LINK}`,
     );
-    // The one address in each is the post's own.
-    for (const sentence of [raid, train, meeting]) {
-      expect(sentence.match(/:\/\//g)).toHaveLength(1);
+    // No address in the sentences of the notifier; the meeting time's one is the post's own.
+    for (const sentence of [raid, train]) {
+      expect(sentence).not.toContain('://');
       expect(sentence).not.toContain('www.e');
     }
+    expect(meeting.match(/:\/\//g)).toHaveLength(1);
+    expect(meeting).not.toContain('www.e');
   });
 });
 
-describe('reasonLine and notifyDm', () => {
-  it('names the reasons in small print', () => {
-    expect(reasonLine([{ label: 'Yveltal' }, { label: 'T5 raids' }])).toBe(
-      '-# You asked to be told about: Yveltal · T5 raids',
-    );
-    expect(reasonLine([])).toBe('');
-  });
-
-  it('puts the sentence, the reasons and the embed of the post into one message that pings nobody', () => {
-    const embed = { title: 'Yveltal at The Stacks' };
-    const message = notifyDm('A raid.', [{ label: 'Yveltal' }], embed);
-    expect(message).toEqual({
-      content: 'A raid.\n-# You asked to be told about: Yveltal',
-      embeds: [embed],
-    });
-    expect(notifyDm('A raid.', [], undefined)).toEqual({ content: 'A raid.' });
-  });
-});
-
-describe('the stop buttons of a message', () => {
+describe('notifyDm', () => {
+  const PICTURE = 'https://cdn.example.test/pm717.icon.png';
+  const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';
+  const brief = {
+    accent: 0x2ecc71,
+    picture: PICTURE,
+    lines: ['**Level 5 raid against Yveltal** ✨', 'Ends <t:2:R>, at <t:2:t>.', '3 trainers'],
+  };
   const reason = (n: number, more: Partial<ShownReason> = {}): ShownReason => ({
     label: `reason ${String(n)}`,
     stop: `dm:${GUILD}:stop:g:${String(n)}`,
     command: '/untarget',
     ...more,
   });
-  const ids = (rows: ReturnType<typeof stopRow>): string[] =>
-    rows.flatMap((row) =>
-      row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
+
+  it('puts the news first, the brief under it with the picture beside it, then the links', () => {
+    const message = notifyDm(
+      { sentence: 'A raid.', brief, links: [postButton(LINK), mapLink(MAPS)] },
+      [reason(1)],
     );
+    expect(dmSentence(message)).toBe('A raid.');
+    expect(dmBrief(message)).toEqual(brief.lines);
+    expect(thumbnailOf(message)).toBe(PICTURE);
+    expect(accentOf(message)).toBe(0x2ecc71);
+    expect(linksOf(message)).toEqual([`Go to post ${LINK}`, `Map ${MAPS}`]);
+    expect(
+      buttonsOf(message)
+        .slice(0, 2)
+        .map((button) => button.emoji),
+    ).toEqual(['↗️', '🗺️']);
+    expect(message.mention).toBeUndefined();
+    expectV2Sendable(message);
+  });
 
-  it('spells the id of a button with the server as its id', () => {
-    expect(stopButtonId(GUILD, { kind: 'gym', gymId: 4 })).toBe(`dm:${GUILD}:stop:g:4`);
-    expect(stopButtonId(GUILD, { kind: 'boss-set' })).toBe(`dm:${GUILD}:stop:boss`);
+  it('names each reason in a section of its own with its Stop button beside it', () => {
+    const message = notifyDm({ sentence: 'A raid.', brief, links: [postButton(LINK)] }, [
+      reason(1, { label: 'Yveltal' }),
+      reason(2, { label: 'raids at The Stacks' }),
+    ]);
+    const texts = textDisplays(message);
+    expect(texts.slice(1)).toEqual([
+      '-# You asked to be told about',
+      'Yveltal',
+      'raids at The Stacks',
+    ]);
+    expect(dmReasons(message)).toEqual(['Yveltal', 'raids at The Stacks']);
+    expect(buttonsOf(message).slice(1)).toEqual([
+      {
+        label: 'Stop',
+        emoji: undefined,
+        style: ButtonStyle.Secondary,
+        customId: `dm:${GUILD}:stop:g:1`,
+        url: undefined,
+      },
+      {
+        label: 'Stop',
+        emoji: undefined,
+        style: ButtonStyle.Secondary,
+        customId: `dm:${GUILD}:stop:g:2`,
+        url: undefined,
+      },
+    ]);
   });
 
-  it('has one button per reason in one row, labelled with what it stops', () => {
-    const rows = stopRow([reason(1), reason(2, { label: 'Giratina \\(Origin Forme\\) \\_x\\_' })]);
-    expect(rows).toHaveLength(1);
-    expect(rows[0]?.components).toMatchObject([
-      { label: 'Stop: reason 1', custom_id: `dm:${GUILD}:stop:g:1` },
-      // A button shows no Markdown, so the label is the name without its escapes.
-      { label: 'Stop: Giratina (Origin Forme) _x_' },
+  it('shows the news as text alone without a picture, and in its own colour without a brief', () => {
+    const plainNews = notifyDm(
+      { sentence: 'A train.', brief: { accent: 0x3498db, lines: ['No route yet'] }, links: [] },
+      [],
+    );
+    expect(textDisplays(plainNews)).toEqual(['A train.\nNo route yet']);
+    expect(thumbnailOf(plainNews)).toBeUndefined();
+    expect(componentCount(plainNews)).toBe(2);
+    const bare = notifyDm({ sentence: 'A spawn.', links: [reportButton(LINK)] }, []);
+    expect(accentOf(bare)).toBe(NEWS_COLOUR);
+    expect(textDisplays(bare)).toEqual(['A spawn.']);
+    expect(linksOf(bare)).toEqual([`Go to report ${LINK}`]);
+    expectV2Sendable(bare);
+  });
+
+  it('lists the reasons without a button together, with the command that stops them', () => {
+    const message = notifyDm({ sentence: 'A raid.', links: [] }, [
+      reason(1, { label: 'Long form', stop: undefined, command: '/unwant' }),
+      reason(2),
+      { label: 'the boss of your eggs', stop: `dm:${GUILD}:stop:boss` },
+    ]);
+    expect(dmReasons(message)).toEqual(['reason 2', 'the boss of your eggs', 'Long form']);
+    expect(textDisplays(message).at(-1)).toBe(
+      'Long form\n-# To stop what has no button here, use `/unwant` in the server.',
+    );
+    expect(buttonsOf(message).map((button) => button.customId)).toEqual([
+      `dm:${GUILD}:stop:g:2`,
+      `dm:${GUILD}:stop:boss`,
     ]);
   });
 
-  it('has five buttons at most, and names the command for what has none', () => {
-    const many = [1, 2, 3, 4, 5, 6].map((n) => reason(n));
-    expect(ids(stopRow(many))).toHaveLength(5);
-    expect(stopHint(many)).toBe(
-      '-# To stop what has no button here, use `/untarget` in the server.',
-    );
-    expect(stopHint(many.slice(0, 5))).toBe('');
-    const mixed = [reason(1, { stop: undefined, command: '/unwant' }), reason(2)];
-    expect(ids(stopRow(mixed))).toEqual([`dm:${GUILD}:stop:g:2`]);
-    expect(stopHint(mixed)).toBe(
-      '-# To stop what has no button here, use `/unwant` in the server.',
+  it('keeps within what Discord takes with more reasons than get a button, and long texts', () => {
+    // Every text needs escapes, every label is longer than a message shows of it.
+    const long = (n: number) => `${'\\_'.repeat(150)}${String(n)}`;
+    // The container, the news with its picture, two links in their row, the line and heading.
+    const most = stopButtonRoom(1 + 3 + 3 + 2);
+    expect(most).toBe(10);
+    const reasons = Array.from({ length: most + 6 }, (_, n) => reason(n, { label: long(n) }));
+    const message = notifyDm(
+      {
+        sentence: `A raid for **${'\\*'.repeat(120)}** has been reported at **${'\\['.repeat(250)}**.`,
+        brief: { ...brief, lines: [...brief.lines, '\\_'.repeat(200)] },
+        links: [postButton(LINK), mapLink(MAPS)],
+      },
+      reasons,
+    );
+    expectV2Sendable(message);
+    expect(componentCount(message)).toBeLessThanOrEqual(40);
+    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toHaveLength(most);
+    // The rest are named, cut where a label is too long, never after a lone backslash.
+    expect(dmReasons(message)).toHaveLength(reasons.length);
+    for (const label of dmReasons(message)) {
+      expect(label.length).toBeLessThanOrEqual(150);
+      expect(label).not.toMatch(/(^|[^\\])(\\\\)*\\…$/);
+    }
+    expect(textDisplays(message).at(-1)).toContain('use `/untarget` in the server');
+  });
+
+  it('counts the links and the picture of the message, so any of them stays within 40', () => {
+    const reasons = Array.from({ length: 20 }, (_, n) => reason(n));
+    const stops = (message: ReturnType<typeof notifyDm>) =>
+      buttonsOf(message).filter((button) => button.customId !== undefined).length;
+    const bare = notifyDm({ sentence: 'News.', links: [] }, reasons);
+    const crowded = notifyDm(
+      { sentence: 'News.', brief, links: Array.from({ length: 5 }, () => postButton(LINK)) },
+      reasons,
+    );
+    // Without picture and links: the container, the news, the line and the heading.
+    expect(stops(bare)).toBe(stopButtonRoom(4));
+    expect(stops(bare)).toBe(11);
+    // With the picture and five links: three more for the picture, six for the row.
+    expect(stops(crowded)).toBe(stopButtonRoom(1 + 3 + 6 + 2));
+    expect(stops(crowded)).toBe(9);
+    for (const message of [bare, crowded]) {
+      expect(componentCount(message)).toBeLessThanOrEqual(40);
+      expectV2Sendable(message);
+    }
+  });
+});
+
+describe('stopHint', () => {
+  it('names each command once, and nothing for reasons no command stops', () => {
+    const hint = stopHint([
+      { label: 'a', command: '/unwant' },
+      { label: 'b', command: '/unwant' },
+      { label: 'c', command: '/untarget' },
+      { label: 'd' },
+    ]);
+    expect(hint).toBe(
+      '-# To stop what has no button here, use `/unwant` or `/untarget` in the server.',
     );
+    expect(stopHint([{ label: 'the boss of your eggs' }])).toBe('');
   });
+});
 
-  it('has no row and no hint for reasons that cannot be stopped', () => {
-    expect(stopRow([{ label: 'a meeting time' }])).toEqual([]);
-    expect(stopHint([{ label: 'a meeting time' }])).toBe('');
-    expect(notifyDm('News.', [], undefined).components).toBeUndefined();
+describe('the stop buttons of a message', () => {
+  it('spells the id of a button with the server as its id', () => {
+    expect(stopButtonId(GUILD, { kind: 'gym', gymId: 4 })).toBe(`dm:${GUILD}:stop:g:4`);
+    expect(stopButtonId(GUILD, { kind: 'boss-set' })).toBe(`dm:${GUILD}:stop:boss`);
   });
 
-  it('cuts a label to what a button holds', () => {
-    const [row] = stopRow([reason(1, { label: 'x'.repeat(200) })]);
-    const [button] = row?.components ?? [];
-    expect(button && 'label' in button ? button.label?.length : 0).toBe(80);
+  it('turns a pressed button into a disabled Stopped and leaves the rest as it was', () => {
+    const ids = [1, 2, 3].map((n) => `dm:${GUILD}:stop:g:${String(n)}`);
+    const message = notifyDm(
+      { sentence: 'A raid.', links: [postButton(LINK)] },
+      ids.map((stop, n) => ({ label: `reason ${String(n)}`, stop })),
+    );
+    const pressed = withStopped(message.components, ids[1] ?? '');
+    const after = { v2: true as const, components: pressed };
+    expect(buttonsOf(after).map((button) => [button.label, button.customId])).toEqual([
+      ['Go to post', undefined],
+      ['Stop', ids[0]],
+      ['Stopped', ids[1]],
+      ['Stop', ids[2]],
+    ]);
+    const disabled = JSON.stringify(pressed).match(/"disabled":true/g);
+    expect(disabled).toHaveLength(1);
+    expect(textDisplays(after)).toEqual(textDisplays(message));
+    expectV2Sendable(after);
+    // A press of a button the message does not have changes nothing.
+    expect(withStopped(message.components, 'dm:other')).toEqual(message.components);
   });
 
-  it('takes one button off a message and leaves the others; an empty row goes', () => {
-    const rows = stopRow([reason(1), reason(2), reason(3)]);
-    const left = withoutButton(rows, `dm:${GUILD}:stop:g:2`);
-    expect(ids(left)).toEqual([`dm:${GUILD}:stop:g:1`, `dm:${GUILD}:stop:g:3`]);
-    expect(withoutButton(stopRow([reason(1)]), `dm:${GUILD}:stop:g:1`)).toEqual([]);
+  it('takes a button off a classic message sent before the DMs were v2; an empty row goes', () => {
+    const button = (n: number) => ({
+      type: ComponentType.Button as const,
+      style: ButtonStyle.Secondary as const,
+      custom_id: `dm:${GUILD}:stop:g:${String(n)}`,
+      label: `Stop: reason ${String(n)}`,
+    });
+    const rows: ControlRows = [
+      { type: ComponentType.ActionRow, components: [button(1), button(2), button(3)] },
+    ];
+    const ids = (left: ControlRows): string[] =>
+      left.flatMap((row) =>
+        row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
+      );
+    expect(ids(withoutButton(rows, `dm:${GUILD}:stop:g:2`))).toEqual([
+      `dm:${GUILD}:stop:g:1`,
+      `dm:${GUILD}:stop:g:3`,
+    ]);
+    const one: ControlRows = [{ type: ComponentType.ActionRow, components: [button(1)] }];
+    expect(withoutButton(one, `dm:${GUILD}:stop:g:1`)).toEqual([]);
     expect(withoutButton(rows, 'dm:other')).toEqual(rows);
   });
 });
 
 describe('the sentences for members of a party and for a new train', () => {
   it('says what an egg hatched into, or what its boss is while it has not hatched', () => {
-    const view = { boss: 'Yveltal', gym: 'The Stacks', regionChannelId: REGION, link: LINK };
+    const view = { boss: 'Yveltal', gym: 'The Stacks', regionChannelId: REGION };
     expect(bossSetSentence({ ...view, hatched: true })).toBe(
-      `The egg at **The Stacks** (<#${REGION}>) hatched into **Yveltal**: ${LINK}`,
+      `The egg at **The Stacks** (<#${REGION}>) hatched into **Yveltal**.`,
     );
     expect(bossSetSentence({ ...view, hatched: false })).toBe(
-      `The boss of the egg at **The Stacks** (<#${REGION}>) is **Yveltal**: ${LINK}`,
+      `The boss of the egg at **The Stacks** (<#${REGION}>) is **Yveltal**.`,
     );
   });
 
   it('says the legacy sentence for a new train', () => {
-    expect(
-      trainDmSentence({ regionChannelId: REGION, maker: { id: '1', name: 'Rhea' }, link: LINK }),
-    ).toBe(`A new train has been announced in <#${REGION}> by **Rhea**: ${LINK}`);
-    expect(trainDmSentence({ regionChannelId: undefined, maker: { id: '1' }, link: LINK })).toBe(
-      `A new train has been announced by **<@1>**: ${LINK}`,
+    expect(trainDmSentence({ regionChannelId: REGION, maker: { id: '1', name: 'Rhea' } })).toBe(
+      `A new train has been announced in <#${REGION}> by **Rhea**.`,
+    );
+    expect(trainDmSentence({ regionChannelId: undefined, maker: { id: '1' } })).toBe(
+      `A new train has been announced by **<@1>**.`,
     );
     // A maker who chose not to be named is not named here either.
-    expect(trainDmSentence({ regionChannelId: REGION, link: LINK })).toBe(
-      `A new train has been announced in <#${REGION}>: ${LINK}`,
+    expect(trainDmSentence({ regionChannelId: REGION })).toBe(
+      `A new train has been announced in <#${REGION}>.`,
     );
   });
 
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index 757e6f08bf9adfa0558e10b892f02b8812736cd1..24333f830a057ac898ee1ba49fd284d66788a8ee 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -3,23 +3,48 @@ import {
   ComponentType,
   type APIActionRowComponent,
   type APIButtonComponentWithCustomId,
+  type APIComponentInContainer,
   type APIComponentInMessageActionRow,
-  type APIEmbed,
+  type APIMessageTopLevelComponent,
 } from 'discord.js';
 import { encodeCustomIdIfFits } from '../discord/custom-id.js';
-import type { ClassicMessage } from '../discord/party-gateway.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import { stopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
-import { memberName, plain, truncate, type NamedMember } from './text.js';
+import { cutText, MAX_COMPONENTS, type PartyBrief } from './party-post.js';
+import { memberName, plain, type NamedMember } from './text.js';
+import {
+  actionRow,
+  container,
+  linkButton,
+  section,
+  separator,
+  textDisplay,
+  thumbnail,
+} from './v2.js';
 
 /** The custom-id kind of the buttons under a direct message. */
 export const DM_KIND = 'dm';
 /** The action of a button that stops one reason a direct message came for. */
 export const STOP_ACTION = 'stop';
-/** A row holds five buttons: as many reasons of one message as get a button. */
-const MAX_STOP_BUTTONS = 5;
-/** Discord's limit for the label of a button. */
-const BUTTON_LABEL = 80;
+/** The label of a stop button, and of one that was pressed (it stays, disabled). */
+const STOP_LABEL = 'Stop';
+const STOPPED_LABEL = 'Stopped';
+/** The components a reason with a button takes: the section, its text and the button. */
+const STOP_SECTION = 3;
+
+/**
+ * As many reasons of one message as get a section with a button: a message holds
+ * `MAX_COMPONENTS`, and each such reason takes `STOP_SECTION`, beside what the rest of the
+ * message takes (`used`: the container, the news, its picture, the row of links and its
+ * buttons, the line and the heading of the reasons) and the one text that lists the reasons
+ * left without a button.
+ */
+export function stopButtonRoom(used: number): number {
+  return Math.max(0, Math.floor((MAX_COMPONENTS - used - 1) / STOP_SECTION));
+}
+/** As much of a reason's label as a message shows. */
+const LABEL_ROOM = 150;
 
 /**
  * The custom id of the button that stops a reason in a server; undefined when it would not fit
@@ -53,6 +78,31 @@ export function withoutButton(rows: ControlRows, customId: string): ControlRows
     .filter((row) => row.components.length > 0);
 }
 
+/**
+ * A components-v2 direct message with the stop button of this custom id pressed: it stays where
+ * it was (a section must keep its accessory), disabled and labelled `Stopped`, with the same
+ * custom id (a disabled button cannot be pressed, and the id still says what it stopped); the
+ * rest of the message is as it was.
+ */
+export function withStopped(
+  components: readonly APIMessageTopLevelComponent[],
+  customId: string,
+): APIMessageTopLevelComponent[] {
+  const visit = (component: object): object => {
+    const button = component as { type?: unknown; custom_id?: unknown };
+    if (button.type === ComponentType.Button && button.custom_id === customId) {
+      return { ...component, style: ButtonStyle.Secondary, label: STOPPED_LABEL, disabled: true };
+    }
+    const nested = component as { components?: object[]; accessory?: object };
+    return {
+      ...component,
+      ...(Array.isArray(nested.components) ? { components: nested.components.map(visit) } : {}),
+      ...(nested.accessory === undefined ? {} : { accessory: visit(nested.accessory) }),
+    };
+  };
+  return components.map((component) => visit(component) as APIMessageTopLevelComponent);
+}
+
 /**
  * A link to a post, or to a message in a channel, that works in a direct message. A mention
  * (`<#id>`) of a forum post reads "#unknown" in a client that has not opened the forum, and
@@ -91,12 +141,11 @@ export interface RaidDmView {
   regionChannelId: string | undefined;
   /** Who reported it, for a report that is not anonymous. Only a report names anybody. */
   reporter: NamedMember | undefined;
-  /** The address of the raid's post (`postLink`). */
-  link: string;
 }
 
 /**
- * The first line of a direct message about a raid: the legacy bot's sentence in today's terms.
+ * The first line of a direct message about a raid: the legacy bot's sentence in today's terms,
+ * without the address of the post, which is the message's "Go to post" button.
  * A member is named by their display name alone: a mention reads "@unknown-user" in a DM,
  * whose reader's client has rarely loaded that member. Nobody is named for a change of the
  * boss or the gym: the legacy bot said "by" whoever acted, as if they had reported the raid.
@@ -111,18 +160,18 @@ export function raidDmSentence(view: RaidDmView): string {
     case 'reported': {
       const subject = view.boss === undefined ? withArticle(egg) : `A ${what}`;
       const by = view.reporter ? ` by **${memberName(view.reporter)}**` : '';
-      const sentence = `${subject} has been reported at ${where}${by}: ${view.link}`;
+      const sentence = `${subject} has been reported at ${where}${by}.`;
       return sentence.charAt(0).toUpperCase() + sentence.slice(1);
     }
     case 'boss':
       if (view.boss === undefined) {
-        return `The raid at ${where} is ${withArticle(egg)} now: ${view.link}`;
+        return `The raid at ${where} is ${withArticle(egg)} now.`;
       }
       return view.corrected
-        ? `The boss of the raid at ${where} is now **${plain(view.boss)}**: ${view.link}`
-        : `The raid at ${where} now has its boss, **${plain(view.boss)}**: ${view.link}`;
+        ? `The boss of the raid at ${where} is now **${plain(view.boss)}**.`
+        : `The raid at ${where} now has its boss, **${plain(view.boss)}**.`;
     case 'gym':
-      return `The ${what} is at ${where}, not where it was first reported: ${view.link}`;
+      return `The ${what} is at ${where}, not where it was first reported.`;
   }
 }
 
@@ -140,14 +189,13 @@ export function bossSetSentence(view: {
   hatched: boolean;
   /** The raid had another boss before: this one corrects it. */
   corrected?: boolean;
-  link: string;
 }): string {
   const where = `**${plain(view.gym)}**${inRegion(view.regionChannelId)}`;
   const boss = `**${plain(view.boss)}**`;
-  if (view.corrected) return `The boss of the raid at ${where} is now ${boss}: ${view.link}`;
+  if (view.corrected) return `The boss of the raid at ${where} is now ${boss}.`;
   return view.hatched
-    ? `The egg at ${where} hatched into ${boss}: ${view.link}`
-    : `The boss of the egg at ${where} is ${boss}: ${view.link}`;
+    ? `The egg at ${where} hatched into ${boss}.`
+    : `The boss of the egg at ${where} is ${boss}.`;
 }
 
 /** The first line of a direct message about a new train: the legacy bot's sentence. */
@@ -155,11 +203,10 @@ export function trainDmSentence(view: {
   regionChannelId: string | undefined;
   /** Who made it; left out for a maker who chose not to be named. */
   maker?: NamedMember | undefined;
-  link: string;
 }): string {
   const where = view.regionChannelId === undefined ? '' : ` in <#${view.regionChannelId}>`;
   const by = view.maker ? ` by **${memberName(view.maker)}**` : '';
-  return `A new train has been announced${where}${by}: ${view.link}`;
+  return `A new train has been announced${where}${by}.`;
 }
 
 /** `3 trainers are attending`, `1 trainer is attending`. */
@@ -209,40 +256,70 @@ export interface ShownReason {
   command?: string;
 }
 
+/** A button under the news of a direct message: the post, the report, the gym's place. */
+export interface DmLink {
+  label: string;
+  emoji: string;
+  url: string;
+}
+
+/** The button to the post a direct message is about (`postLink`). */
+export function postButton(url: string): DmLink {
+  return { label: 'Go to post', emoji: '↗️', url };
+}
+
+/** The button to a spawn report in its region's channel (`postLink` with the message). */
+export function reportButton(url: string): DmLink {
+  return { label: 'Go to report', emoji: '↗️', url };
+}
+
+/** The button to a gym's place in Google Maps, as the post's own. */
+export function mapLink(url: string): DmLink {
+  return { label: 'Map', emoji: '🗺️', url };
+}
+
 /**
- * The buttons that stop the reasons of a message, one row, five at most: "Stop: T5 raids". A
- * label says what it stops, in the words of the reasons line, without Markdown (a button shows
- * none). No row when no reason has a button.
+ * What a direct message of the notifier says: its sentence (the news), what it is about in brief
+ * (a party's `brief`, a spawn's), and the buttons that lead there.
  */
-export function stopRow(reasons: readonly ShownReason[]): ControlRows {
-  const buttons = reasons
-    .flatMap((reason) => (reason.stop === undefined ? [] : [{ ...reason, stop: reason.stop }]))
-    .slice(0, MAX_STOP_BUTTONS)
-    .map((reason): APIButtonComponentWithCustomId => ({
-      type: ComponentType.Button,
-      style: ButtonStyle.Secondary,
-      custom_id: reason.stop,
-      label: truncate(`Stop: ${reason.label.replace(/\\(.)/g, '$1')}`, BUTTON_LABEL),
-    }));
-  return buttons.length === 0 ? [] : [{ type: ComponentType.ActionRow, components: buttons }];
+export interface DmNews {
+  sentence: string;
+  /** Undefined when the party could not be shown: the sentence stands alone then. */
+  brief?: Pick<PartyBrief, 'accent' | 'picture' | 'lines'> | undefined;
+  links: readonly DmLink[];
+}
+
+/** The colour of a direct message whose party could not be shown. */
+export const NEWS_COLOUR = 0x3498db;
+
+/** How many components these are, every nested one counted, as Discord counts them. */
+function countComponents(components: readonly object[]): number {
+  return components.reduce((sum: number, component) => {
+    const nested = component as { components?: object[]; accessory?: object };
+    return (
+      sum + 1 + countComponents(nested.components ?? []) + (nested.accessory === undefined ? 0 : 1)
+    );
+  }, 0);
+}
+
+/** The button of a reason, as a section shows it beside the reason's label. */
+function stopButton(customId: string): APIButtonComponentWithCustomId {
+  return {
+    type: ComponentType.Button,
+    style: ButtonStyle.Secondary,
+    custom_id: customId,
+    label: STOP_LABEL,
+  };
 }
 
 /**
  * The sentence for the reasons that could be stopped but got no button (their id does not fit,
- * or there are more than five): which command stops them. Empty when every one has its button.
+ * or there are more than `stopButtonRoom` allows): which command stops them. Empty when there is none.
  */
 export function stopHint(reasons: readonly ShownReason[]): string {
-  const withButton = new Set(
-    reasons
-      .filter((reason) => reason.stop !== undefined)
-      .slice(0, MAX_STOP_BUTTONS)
-      .map((reason) => reason.label),
-  );
   const commands = [
     ...new Set(
-      reasons
-        .filter((reason) => reason.command !== undefined && !withButton.has(reason.label))
-        .map((reason) => `\`${reason.command ?? ''}\``),
+      reasons.flatMap((reason) => (reason.command === undefined ? [] : [`\`${reason.command}\``])),
     ),
   ];
   return commands.length === 0
@@ -251,30 +328,43 @@ export function stopHint(reasons: readonly ShownReason[]): string {
 }
 
 /**
- * The line that says why a direct message came: what the member asked to be told about, in the
- * names their own lists use. In small print (Discord's subtext), below the news itself.
+ * A direct message of the notifier, a components-v2 message in one container of the post's
+ * colour: the sentence first (a phone's notification, if it reads anything, reads the news),
+ * the brief's lines under it with the picture beside them; a row of links (the post, the gym's
+ * place); and under a line `-# You asked to be told about` one section per reason with its Stop
+ * button beside it. The reasons that get no button (their custom id does not fit, or more than
+ * the message has room for beside its links and picture: `stopButtonRoom`) are listed together in one text with the command that stops them. Nothing
+ * else of the post: who comes and the boss's facts stay there. It pings nobody.
  */
-export function reasonLine(reasons: readonly ShownReason[]): string {
-  const labels = reasons.map((reason) => reason.label);
-  return labels.length === 0 ? '' : `-# You asked to be told about: ${labels.join(' · ')}`;
-}
-
-/**
- * A direct message of the notifier: the sentence, the line of reasons, and the embed of the
- * post as it is at that moment, without the post's controls (a DM is not the place to sign up:
- * the sentence links to the post). Below it one button per reason that stops that reason. It
- * pings nobody.
- */
-export function notifyDm(
-  sentence: string,
-  reasons: readonly ShownReason[],
-  embed: APIEmbed | undefined,
-): ClassicMessage {
-  const lines = [sentence, reasonLine(reasons), stopHint(reasons)].filter((line) => line !== '');
-  const rows = stopRow(reasons);
-  return {
-    content: lines.join('\n'),
-    ...(embed ? { embeds: [embed] } : {}),
-    ...(rows.length === 0 ? {} : { components: rows }),
-  };
+export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Message {
+  const { brief } = news;
+  const parts: APIComponentInContainer[] = [];
+  const first = [news.sentence, ...(brief?.lines ?? [])].join('\n');
+  parts.push(
+    brief?.picture === undefined ? textDisplay(first) : section(first, thumbnail(brief.picture)),
+  );
+  if (news.links.length > 0) {
+    parts.push(actionRow(news.links.map((link) => linkButton(link.label, link.emoji, link.url))));
+  }
+  if (reasons.length > 0) {
+    parts.push(separator(), textDisplay('-# You asked to be told about'));
+    const label = (reason: ShownReason): string => cutText(reason.label, LABEL_ROOM);
+    // The container and everything in it so far.
+    const most = stopButtonRoom(1 + countComponents(parts));
+    let buttons = 0;
+    const rest: ShownReason[] = [];
+    for (const reason of reasons) {
+      if (reason.stop !== undefined && buttons < most) {
+        buttons += 1;
+        parts.push(section(label(reason), stopButton(reason.stop)));
+      } else {
+        rest.push(reason);
+      }
+    }
+    if (rest.length > 0) {
+      const hint = stopHint(rest);
+      parts.push(textDisplay([...rest.map(label), ...(hint === '' ? [] : [hint])].join('\n')));
+    }
+  }
+  return { v2: true, components: [container(brief?.accent ?? NEWS_COLOUR, parts)] };
 }
diff --git a/src/render/party-card.ts b/src/render/party-card.ts
deleted file mode 100644
index 34c4fdbc97d2a0063c0e007a131aa5bbc3286ba9..0000000000000000000000000000000000000000
--- a/src/render/party-card.ts
+++ /dev/null
@@ -1,135 +0,0 @@
-import type { APIEmbedField } from 'discord.js';
-import { headCount, membersWhere, type Attendee, type PartyGroup } from '../domain/party/party.js';
-import { PartyStatus } from '../domain/party/status.js';
-import { attendeeTexts, inShownOrder, LOBBY_SIZE, type TrainersView } from './party-post.js';
-import { LIMITS, plain, timestamp, truncate } from './text.js';
-
-/**
- * The card of a party: the embed a direct message shows of it (a components-v2 message cannot
- * carry the DM's sentence beside it, so the DM keeps an embed). Each renderer makes its kind's
- * (`raidCard`, `meetupCard`, `trainCard`) from these fields.
- */
-
-export interface GroupFieldOptions {
-  /** The party has only this group: the field is called "Trainers" unless the group has a label. */
-  single: boolean;
-  /** Tell a group that is bigger than a lobby to split up: for a raid. */
-  lobby: boolean;
-  /** The room the value may take; at most, and by default, what a field holds. */
-  limit?: number;
-}
-
-/**
- * The field of one group: the trainers of a party, or of one of the groups of a raid. The lists
- * of Present, Coming and Interested share the room that is left (`limit`, at most 1024) after the
- * meeting line and the lobby note: when they do not all fit, the longest list is shortened
- * first, one trainer at a time from its end, and says how many it left out. Even with every list
- * cut down to that count the value can exceed a very small `limit`; it is then as short as it
- * can be.
- */
-export function groupField(
-  view: TrainersView,
-  group: PartyGroup,
-  options: GroupFieldOptions,
-): APIEmbedField {
-  const { party, emoji } = view;
-  const { single, lobby, limit = LIMITS.fieldValue } = options;
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
-  if (lobby && heads > LOBBY_SIZE) {
-    lines.push(`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`);
-  }
-  const kinds: [string, (attendee: Attendee) => boolean][] = [
-    [
-      'Present',
-      (a) => a.status === PartyStatus.Present || a.status === PartyStatus.CompletePending,
-    ],
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
-/** A field whose attendee list can be made shorter: `shrink(limit)` is the field for that room. */
-export interface ShrinkableField {
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
-export function fitEmbed(title: string, description: string, fields: ShrinkableField[]): void {
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
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index cda72df755c37e839953a52616177533ad4278d1..b8b61ded187f535811e63143c3feedff6fa7448b 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -4,7 +4,6 @@ import {
   TextInputStyle,
   type APIActionRowComponent,
   type APIButtonComponentWithCustomId,
-  type APIButtonComponentWithURL,
   type APIComponentInMessageActionRow,
   type APIModalInteractionResponseCallbackData,
 } from 'discord.js';
@@ -17,6 +16,7 @@ import {
   type PartyGroup,
 } from '../domain/party/party.js';
 import type { PostButton } from './party-post.js';
+import { linkButton } from './v2.js';
 import { fitItems, plain } from './text.js';
 
 /** The custom-id kind of the controls of a party's post (and of its copies in other channels). */
@@ -136,14 +136,7 @@ export function moveTrainButton(party: Pick<Party, 'id'>): PostButton {
 
 /** A link to a gym's place in Google Maps. */
 function mapButton(url: string): PostButton {
-  const button: APIButtonComponentWithURL = {
-    type: ComponentType.Button,
-    style: ButtonStyle.Link,
-    label: 'Map',
-    emoji: { name: '🗺️' },
-    url,
-  };
-  return { button };
+  return { button: linkButton('Map', '🗺️', url) };
 }
 
 export interface BottomOptions {
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 733a25cd2f61b376a4a7a70810a533a3562a7bee..451c003e3804c29bc6ef3674f88a8bad493b519b 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -1,9 +1,4 @@
-import {
-  ComponentType,
-  type APIButtonComponent,
-  type APIComponentInContainer,
-  type APIEmbed,
-} from 'discord.js';
+import { ComponentType, type APIButtonComponent, type APIComponentInContainer } from 'discord.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import {
   headCount,
@@ -83,10 +78,22 @@ export interface RenderedPost {
    */
   message: V2Message;
   /**
-   * The party as a direct message shows it below its sentence: an embed (a v2 message cannot
-   * carry the sentence), with what the post says but no controls.
+   * The party as a direct message shows it under its sentence (`notifyDm`): what is needed to
+   * decide whether to go, in lines the post itself shows, without its lists of trainers.
    */
-  card: APIEmbed;
+  brief: PartyBrief;
+}
+
+/**
+ * A party in brief, for a direct message: the colour and the picture of its post, a few of its
+ * lines (what it is, when, how many come), and for a raid at a known gym the gym's address in
+ * Google Maps (the DM's Map button).
+ */
+export interface PartyBrief {
+  accent: number;
+  picture?: string;
+  lines: string[];
+  map?: string;
 }
 
 /** The post of a party, its message made of its layout. */
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index 5be5febb6c86160ebcba48091fc4d2a58bab4ddd..3eb97ad7e60c6b87480959ba1b1e552782f8213b 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -1,4 +1,3 @@
-import type { APIEmbed } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { expectSendable } from '../../test/support/post-limits.js';
 import { catalogueFixture, iconsFixture } from '../../test/support/game-data.js';
@@ -83,15 +82,6 @@ function trainers(count: number, extra: Partial<Attendee> = {}): Record<string,
   return result;
 }
 
-/** The characters Discord counts towards the 6000 of one embed. */
-function embedSize(embed: APIEmbed): number {
-  return (
-    (embed.title?.length ?? 0) +
-    (embed.description?.length ?? 0) +
-    (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0)
-  );
-}
-
 /** An egg reported at 14:00 that hatches at 14:30 and ends at 15:15. */
 const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
 const yveltal = setBoss(egg, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW).party;
@@ -348,42 +338,18 @@ describe('renderRaidPost', () => {
         "title": "Yveltal · The Stacks",
       }
     `);
-    // The card of a direct message says the same as an embed, without controls.
-    expect(post.card).toMatchInlineSnapshot(`
-      {
-        "color": 3066993,
-        "description": "**Level 5 raid against Yveltal** ✨
-      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.
-      Reported by <@200000000000000001>.",
-        "fields": [
-          {
-            "name": "Boss",
-            "value": "**Weaknesses** Rock, Electric, Ice, Fairy
-      **Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)
-      **Moveset** Snarl / ????",
-          },
-          {
-            "name": "Group A: park \\*side\\* (5)",
-            "value": "Meeting at <t:1791917100:t> (<t:1791917100:R>)
-      **Present** <@200000000000000002> +2, <@200000000000000009>
-      **Interested** <@200000000000000001>",
-          },
-          {
-            "name": "Group B (1)",
-            "value": "**Coming** <@200000000000000003> 🛰️",
-          },
-          {
-            "name": "Complete (1)",
-            "value": "<@200000000000000004>",
-          },
-        ],
-        "thumbnail": {
-          "url": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
-        },
-        "title": "The Stacks",
-        "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
-      }
-    `);
+    // The brief of a direct message: what it is, when, how many come; the post's colour and
+    // picture, and the gym's place for the Map button. Who comes stays in the post.
+    expect(post.brief).toEqual({
+      accent: 0x2ecc71,
+      picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png',
+      lines: [
+        '**Level 5 raid against Yveltal** ✨',
+        'Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.',
+        '6 trainers',
+      ],
+      map: 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
+    });
   });
 
   it('shows an ended raid without times as over, and an anonymous report without the reporter', () => {
@@ -430,7 +396,9 @@ describe('renderRaidPost', () => {
     expect(header(post)[1]).toBe('**Level 5 raid** (egg)');
     expect(header(post)[2]).toBe(closed);
     expect(accentOf(post.message)).toBe(ENDED_COLOUR);
-    expect(post.card.thumbnail?.url).toBe(picture);
+    expect(post.brief.picture).toBe(picture);
+    expect(post.brief.lines[0]).toBe('**Level 5 raid** (egg)');
+    expect(post.brief.lines.slice(1, 3)).toEqual(['**Hatches as Yveltal** ✨', closed]);
     // One that had hatched is shown as its boss.
     const hatched = renderRaidPost(
       view(named, { eggPicture: picture, closed, now: at('2026-10-13T14:40') }),
@@ -468,9 +436,8 @@ describe('renderRaidPost', () => {
       { [REPORTER]: { name: 'Rae' } },
     );
     expect(reported(listed)).toBe(`-# Reported by **Rae**`);
-    // The card names members by name alone.
-    expect(renderRaidPost(view(listed)).card.description).toContain('Reported by Rae.');
-    expect(JSON.stringify(renderRaidPost(view(listed)).card)).not.toContain(REPORTER);
+    // The brief names nobody: a DM's sentence names the reporter.
+    expect(JSON.stringify(renderRaidPost(view(listed)).brief)).not.toContain(REPORTER);
   });
 
   it('says what an egg will hatch as when that is certain, with that boss its picture', () => {
@@ -483,16 +450,17 @@ describe('renderRaidPost', () => {
     expect(about).toContain('**Weaknesses**');
     // The moves of a boss that is not there yet are not shown.
     expect(about).not.toContain('Moveset');
-    expect(post.card.fields?.[0]?.name).toBe('Hatches as Yveltal');
+    // The brief calls it an egg and says what it hatches as.
+    expect(post.brief.lines.slice(0, 2)).toEqual([
+      '**Level 5 raid** (egg)',
+      '**Hatches as Yveltal** ✨',
+    ]);
   });
 
   it('says what an egg hatches as also when nothing more is known of that boss', () => {
     const post = renderRaidPost(view(egg, { hatchesAs: { name: 'New*mon', shiny: false } }));
     expect(header(post)[1]).toBe('**Level 5 raid** (egg)');
     expect(block(post, '**Hatches as')).toBe('**Hatches as New\\*mon**');
-    // The card has no field to head, and says it under the first line.
-    expect(post.card.description?.split('\n')[1]).toBe('**Hatches as New\\*mon**');
-    expect(post.card.fields?.map((field) => field.name)).toEqual(['Trainers (1)']);
   });
 
   it('shows an egg whose boss was named as an egg until it hatches', () => {
@@ -508,7 +476,7 @@ describe('renderRaidPost', () => {
     const hatched = renderRaidPost(view(yveltal, { now: at('2026-10-13T14:31') }));
     expect(header(hatched)[1]).toBe('**Level 5 raid against Yveltal** ✨');
     expect(block(hatched, '**Weaknesses**')).toContain('**Moveset** ???? / ????');
-    expect(hatched.card.fields?.[0]?.name).toBe('Boss');
+    expect(hatched.brief.lines[0]).toBe('**Level 5 raid against Yveltal** ✨');
   });
 
   it('hides the moves line while no move is known when the setting says so', () => {
@@ -758,8 +726,6 @@ describe('renderRaidPost', () => {
       'Screenshot feedback',
     ]);
     expect(thumbnailOf(post.message)).toMatch(/pm717/);
-    // The card keeps within what Discord takes of an embed.
-    expect(embedSize(post.card)).toBeLessThanOrEqual(6000);
     // And the fake gateway, as strict as Discord, takes it, and every copy of it.
     expectSendable(post);
   });
@@ -834,7 +800,6 @@ describe('renderRaidPost', () => {
     const gym: PostGym = { ...library!, nickname: null, name: 'M*A*S*H [Memorial]' };
     const post = renderRaidPost(view(egg, { gym }));
     expect(header(post)[0]).toBe(`### [M\\*A\\*S\\*H \\[Memorial\\]](${gymMapsUrl(gym)})`);
-    expect(post.card.title).toBe('M\\*A\\*S\\*H [Memorial]');
     expect(post.title).toBe('T5 egg · M*A*S*H [Memorial]');
   });
 
@@ -844,7 +809,6 @@ describe('renderRaidPost', () => {
     expect(header(renderRaidPost(view(egg, { gym })))[0]).toMatch(
       /^### \[Pinewood Public Library\]/,
     );
-    expect(renderRaidPost(view(egg, { gym })).card.title).toBe('Pinewood Public Library');
   });
 
   it('gives the date when the clock time alone would not say which day an egg hatches', () => {
@@ -920,8 +884,7 @@ describe('renderRaidPost', () => {
     const post = renderRaidPost(view(egg, { gym: undefined }));
     expect(header(post)[0]).toBe('### Unknown gym');
     expect(buttonLabels(post.message)).not.toContain('Map');
-    expect(post.card.title).toBe('Unknown gym');
-    expect(post.card).not.toHaveProperty('url');
+    expect(post.brief).not.toHaveProperty('map');
   });
 
   it('has the same result for the same view', () => {
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 94840a2a953133a0418b9ffcc1fc53816968c326..3542dfa6c765e3d3b1ce320b43537f9d463861c1 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -1,16 +1,13 @@
-import type { APIEmbed, APIEmbedField } from 'discord.js';
 import { DateTime } from 'luxon';
 import {
   bossOf,
   isRaid,
   memberOf,
-  membersWhere,
   type Party,
   type RaidParty,
   type RaidStage,
 } from '../domain/party/party.js';
 import { isEliteGym, raidStage } from '../domain/party/raid.js';
-import { PartyStatus } from '../domain/party/status.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { typeWord, WEATHER_ICON, weatherWord } from '../domain/pogo/game-icons.js';
 import {
@@ -21,36 +18,25 @@ import {
 import type { PokemonEntry } from '../domain/pogo/game-master.js';
 import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
 import { raidTierLabel, raidWords, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
-import { fitEmbed, groupField, type ShrinkableField } from './party-card.js';
 import { bottomControls } from './party-controls.js';
 import {
-  attendeeTexts,
   cutText,
   ENDED_COLOUR,
   fittedLayout,
-  inShownOrder,
   KEPT_OPEN,
   renderedPost,
   tidyTitle,
   trainerBlocks,
+  trainerCount,
   type Fit,
+  type PartyBrief,
   type ForumTag,
   type PostBlock,
   type PostEmoji,
   type PostLayout,
   type RenderedPost,
 } from './party-post.js';
-import {
-  fitItems,
-  LIMITS,
-  memberName,
-  memberByName,
-  plain,
-  plainLines,
-  timestamp,
-  titleCase,
-  truncate,
-} from './text.js';
+import { LIMITS, memberByName, plain, plainLines, timestamp, titleCase, truncate } from './text.js';
 
 const HOUR = 3_600_000;
 
@@ -258,7 +244,7 @@ function timesOf(view: RaidPostView, stage: RaidStage): string {
  * (`×2` after a double weakness), and the CP it is caught with, plain and boosted, and in what
  * weather (`shadow`: as a shadow raid boss). Types and weather are the game's icons where the
  * emoji exist, and words where they do not. The post of a raid and that of a train both show
- * it, and so does the card of a direct message.
+ * it.
  */
 export function bossFacts(
   catalogue: PokemonCatalogue,
@@ -367,7 +353,7 @@ function movesLine(view: RaidPostView, unknown: boolean): string[] {
   return [`**Moveset** ${name(fastMove)} / ${name(chargedMove)}`];
 }
 
-/** What a post or a card says about the boss of a raid (see `bossInfo`). */
+/** What a post says about the boss of a raid (see `bossInfo`). */
 interface BossInfo {
   /** For an egg: what it hatches as. */
   hatchesAs?: ShownBoss;
@@ -472,92 +458,31 @@ function raidLayout(view: RaidPostView): PostLayout {
   }));
 }
 
-/** The members who completed the raid, as many as fit into `limit`. */
-function completeField(
-  view: RaidPostView,
-  limit: number = LIMITS.fieldValue,
-): APIEmbedField | undefined {
-  const { party, emoji } = view;
-  const members = inShownOrder(
-    party,
-    membersWhere(party, (a) => a.status === PartyStatus.Complete),
-  );
-  if (members.length === 0) return undefined;
-  const heads = members.reduce((sum, id) => sum + (party.attendees[id]?.number ?? 1), 0);
-  const texts = attendeeTexts(party, members, emoji);
-  return { name: `Complete (${heads})`, value: fitItems(texts, limit) };
-}
-
-/** The card of a raid, for a direct message: what the post says, as an embed. */
-function raidCard(view: RaidPostView): APIEmbed {
+/**
+ * The raid in brief, for a direct message: the line of what it is (`Level 5 raid against
+ * Yveltal`, `Level 5 raid (egg)`), its times as the post says them (with the note of a guessed
+ * time), how many come, the post's colour and picture, and the gym's place for the Map button.
+ */
+function raidBrief(view: RaidPostView): PartyBrief {
   const { party, gym } = view;
-  const stage = stageOf(view);
-  const info = bossInfo(view);
-  const description = [
-    headline(view),
-    // A boss without stats has no field to head.
-    ...(info?.hatchesAs && info.lines.length === 0 ? [hatchesAsLine(view, info.hatchesAs)] : []),
-    view.closed ?? describeTimes(view, stage),
-    ...(party.anonymous ? [] : [`Reported by ${memberName(memberOf(party, party.createdById))}.`]),
-    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
-  ].join('\n');
-
-  const fields: ShrinkableField[] = [];
-  if (info && info.lines.length > 0) {
-    const name = info.hatchesAs ? `Hatches as ${plain(info.hatchesAs.name)}` : 'Boss';
-    fields.push({
-      field: {
-        name: truncate(name, LIMITS.fieldName),
-        value: truncate(info.lines.join('\n'), LIMITS.fieldValue),
-      },
-      rank: 0,
-    });
-  }
-  const single = party.groups.length === 1;
-  for (const group of party.groups) {
-    fields.push({
-      field: groupField(view, group, { single, lobby: true }),
-      shrink: (limit) => groupField(view, group, { single, lobby: true, limit }),
-      rank: 1,
-    });
-  }
-  const complete = completeField(view);
-  if (complete) {
-    fields.push({
-      field: complete,
-      shrink: (limit) => completeField(view, limit) ?? complete,
-      rank: 2,
-    });
-  }
-  const location = gymNotes(gym);
-  if (location.length > 0) {
-    fields.push({
-      field: {
-        name: 'Location Information',
-        value: truncate(location.join('\n'), LIMITS.fieldValue),
-      },
-      rank: 0,
-    });
-  }
-
-  // Embed titles render Markdown (a thread name does not, so the post's own title stays raw).
-  const embedTitle = truncate(plain(gymName(gym)), LIMITS.embedTitle);
-  const embedDescription = truncate(description, LIMITS.embedDescription);
-  const kept = fields.slice(0, LIMITS.fields);
-  fitEmbed(embedTitle, embedDescription, kept);
-  const thumbnail = pictureOf(view);
+  const picture = pictureOf(view);
+  const { expected } = bosses(view);
   return {
-    title: embedTitle,
-    ...(gym ? { url: gymMapsUrl(gym) } : {}),
-    description: embedDescription,
-    color: STAGE_COLOURS[stage],
-    ...(thumbnail === undefined ? {} : { thumbnail: { url: thumbnail } }),
-    fields: kept.map((f) => f.field),
+    accent: STAGE_COLOURS[stageOf(view)],
+    ...(picture === undefined ? {} : { picture }),
+    lines: [
+      headline(view),
+      // An egg whose boss is known says what it hatches as, as the heading of the post's block.
+      ...(expected ? [hatchesAsLine(view, expected)] : []),
+      view.closed ?? describeTimes(view, stageOf(view)),
+      trainerCount(party),
+    ],
+    ...(gym ? { map: gymMapsUrl(gym) } : {}),
   };
 }
 
 /**
- * The forum post of a raid: title, tags, the components-v2 message (`raidLayout`) and the card
+ * The forum post of a raid: title, tags, the components-v2 message (`raidLayout`) and the brief
  * of a direct message. Pure: the same view gives the same post.
  */
 export function renderRaidPost(view: RaidPostView): RenderedPost {
@@ -569,6 +494,6 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
         ? raidTags(party, now)
         : ['Ended', ...raidTags(party, now).slice(1)],
     layout: raidLayout(view),
-    card: raidCard(view),
+    brief: raidBrief(view),
   });
 }
diff --git a/src/render/spawn.ts b/src/render/spawn.ts
index ac76d8735e791fa216afaeea0652788a3aacb29a..98b47ab0256d0d8d4f77dfe32a44689e01c536ce 100644
--- a/src/render/spawn.ts
+++ b/src/render/spawn.ts
@@ -1,6 +1,13 @@
 import type { APIEmbed } from 'discord.js';
 import type { ClassicMessage } from '../discord/party-gateway.js';
-import { memberName, memberText, plain, plainNoLinks, type NamedMember } from './text.js';
+import {
+  memberName,
+  memberText,
+  plain,
+  plainNoLinks,
+  timestamp,
+  type NamedMember,
+} from './text.js';
 
 /** The colour of a spawn report, as the legacy bot's. */
 export const SPAWN_COLOUR = 0x2ecc71;
@@ -85,18 +92,45 @@ export function spawnTextMessage(view: SpawnView, footer: string): ClassicMessag
 
 /**
  * The sentence where the region has to be named: in a direct message, and in the channel for
- * Unown sightings. The reporter is named by name alone, as in every direct message. With
- * `link` (the address of the report in the region's channel, for a direct message) it ends
- * with that; without, with the colon the embed follows.
+ * Unown sightings. The reporter is named by name alone, as in every direct message. A direct
+ * message leads to the report by its "Go to report" button; the sighting is followed by the
+ * report itself.
  */
-export function spawnSentence(view: SpawnView, regionChannelId: string, link?: string): string {
+export function spawnSentence(view: SpawnView, regionChannelId: string): string {
   return (
     `A wild ${spawnName(view)} has been reported in <#${regionChannelId}> ` +
-    `by **${memberName(view.reporter)}**:${link === undefined ? '' : ` ${link}`}`
+    `by **${memberName(view.reporter)}**.`
   );
 }
 
+/** Where a spawn is, in the reporter's words made plain without links; empty when they said nothing. */
+function whereText(view: SpawnView): string {
+  return view.details === null ? '' : plainNoLinks(view.details);
+}
+
+/**
+ * A spawn in brief, for a direct message (`notifyDm`): where it is and when the report goes away,
+ * with the Pokémon's picture and the colour of a report.
+ */
+export function spawnBrief(
+  view: SpawnView,
+  goneAt: number,
+): { accent: number; picture?: string; lines: string[] } {
+  const where = whereText(view);
+  return {
+    accent: SPAWN_COLOUR,
+    ...(view.image === undefined ? {} : { picture: view.image }),
+    lines: [
+      ...(where === '' ? [] : [`**Where** ${where}`]),
+      `The report goes away ${timestamp(goneAt, 'R')}.`,
+    ],
+  };
+}
+
 /** The message in the server's channel for Unown sightings, which stays. */
 export function sightingMessage(view: SpawnView, regionChannelId: string): ClassicMessage {
-  return { content: spawnSentence(view, regionChannelId), embeds: [spawnEmbed(view)] };
+  return {
+    content: spawnSentence(view, regionChannelId).replace(/\.$/, ':'),
+    embeds: [spawnEmbed(view)],
+  };
 }
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index fe9a217aeb61593755beb266d43aecea6172dd2c..1acad93b6a4ec1ba1978e6f7cc158b1e9b182630 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -46,7 +46,6 @@ import { shownBoss, type PostGym } from './raid-post.js';
 import { LIMITS } from './text.js';
 import { movementText, trainPanel, whereText } from './train-panel.js';
 import {
-  fitRoute,
   renderTrainPost,
   routeLines,
   stopLink,
@@ -140,16 +139,12 @@ describe('renderTrainPost', () => {
       `-# Created by <@${REPORTER}>`,
     ]);
     expect(post.message).toEqual(postMessage(post.layout));
-    // The card of a direct message.
-    expect(post.card.title).toBe('Saturday legendaries');
-    expect(post.card.description?.split('\n')).toEqual([
-      '**Raid train**',
-      NO_TIME,
-      `Created by <@${REPORTER}>.`,
-      '',
-      'No route yet: `/route add` adds a stop.',
-    ]);
-    expect(post.card.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
+    // The brief of a direct message: its name (the sentence of a new train does not say it),
+    // where it is, its times, how many come.
+    expect(post.brief).toEqual({
+      accent: 0x3498db,
+      lines: ['**Raid Train: Saturday legendaries**', 'No route yet', NO_TIME, '1 trainer'],
+    });
   });
 
   it('names no maker of a train whose maker chose not to be named, and still its conductor', () => {
@@ -161,7 +156,7 @@ describe('renderTrainPost', () => {
     const empty = testTrain({ anonymous: true, autoStatus: PartyStatus.NotInterested });
     const post = renderTrainPost(view(empty));
     expect(textOf(post.message)).not.toContain(REPORTER);
-    expect(JSON.stringify(post.card)).not.toContain(REPORTER);
+    expect(JSON.stringify(post.brief)).not.toContain(REPORTER);
   });
 
   it('says its times as a meetup does, in the second line', () => {
@@ -222,16 +217,10 @@ describe('renderTrainPost', () => {
           `4. [Old Stone Fountain](${maps(2)})`,
         ].join(' · '),
     );
-    // The card keeps its list of a line a stop.
-    expect(post.card.fields?.find((f) => f.name.startsWith('Route'))).toEqual({
-      name: 'Route: stop 2 of 4',
-      value: [
-        '~~1\\. Veterans Memorial Bridge~~',
-        '**2\\. The Stacks** (the train is here)',
-        '3\\. Harbor Lighthouse Mural · elite',
-        '4\\. Old Stone Fountain',
-      ].join('\n'),
-    });
+    // The brief says where it is, in a word.
+    expect(post.brief.lines[1]).toBe(`At [The Stacks](${maps(1)})`);
+    const finished = renderTrainPost(view(onRoute([4, 1], 2)));
+    expect(finished.brief.lines[1]).toBe('Route finished');
   });
 
   it('names a gym that no longer exists as unknown, without a link', () => {
@@ -255,18 +244,19 @@ describe('renderTrainPost', () => {
       .bosses()
       .find((b) => b.entry?.key === 'yveltal');
     expect(thumbnailOf(post.message)).toBe(listed?.image);
-    expect(post.card.fields?.[0]?.name).toBe('Boss');
-    // The card names it as the post does, in its own words.
-    expect(post.card.description?.split('\n')[0]).toBe('**Raid train** after **Yveltal** ✨');
+    // The brief names it as the post does, with its picture.
+    expect(post.brief.lines.slice(0, 2)).toEqual([
+      '**Raid Train: Saturday legendaries**',
+      '**After Yveltal** ✨',
+    ]);
+    expect(post.brief.picture).toBe(listed?.image);
   });
 
   it('names a boss the game master does not know, without a block about it', () => {
     const train = onRoute([4], 0, { boss: { name: 'New*mon' } });
     expect(lines(train)[1]).toBe('**After New\\*mon**');
     expect(block(renderTrainPost(view(train)), '**Weaknesses**')).toBeUndefined();
-    expect(renderTrainPost(view(train)).card.description?.split('\n')[0]).toBe(
-      '**Raid train** after **New\\*mon**',
-    );
+    expect(renderTrainPost(view(train)).brief.lines[1]).toBe('**After New\\*mon**');
   });
 
   it('says what there is to say about the gym the train is at', () => {
@@ -337,7 +327,7 @@ describe('renderTrainPost', () => {
     expect(textDisplays(post.message)[0]?.split('\n')[0]).toBe(
       '### Raid Train: \\*\\*Bold\\*\\* train',
     );
-    expect(post.card.title).toBe('\\*\\*Bold\\*\\* train');
+    expect(post.brief.lines[0]).toBe('**Raid Train: \\*\\*Bold\\*\\* train**');
   });
 
   it('stays a message Discord takes with the longest route and a crowd in five groups', () => {
@@ -382,17 +372,6 @@ describe('renderTrainPost', () => {
     expect(route).toMatch(/^-# Route, stop 31 of \d+: …29 earlier stops · 30\. \[/);
     expect(route).toMatch(/ · \*\*31\. \[.*\)\*\* · /);
     expect(route).toMatch(/…and \d+ more$/);
-    // The card stays an embed Discord takes.
-    const { card } = post;
-    const total =
-      (card.title?.length ?? 0) +
-      (card.description?.length ?? 0) +
-      (card.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
-    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
-    for (const f of card.fields ?? []) {
-      expect(f.value.length).toBeGreaterThan(0);
-      expect(f.value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
-    }
   });
 });
 
@@ -439,7 +418,7 @@ describe('the longest train that can be', () => {
   });
 });
 
-describe('routeLines and fitRoute', () => {
+describe('routeLines', () => {
   it('links every stop when asked to: with the address in brackets for a message', () => {
     const train = onRoute([4, 1], 1);
     expect(routeLines({ party: train, gym }, { links: true })).toEqual([
@@ -477,20 +456,6 @@ describe('routeLines and fitRoute', () => {
       expect(slashed(name)).toMatch(/^(?:[^\\\]]|\\.)*$/);
     }
   });
-
-  it('gives a whole route when it fits, and otherwise the stops around the current one', () => {
-    const all = Array.from({ length: 10 }, (_, index) => `${index + 1}. ${'x'.repeat(20)}`);
-    expect(fitRoute(all, 3, 1000)).toBe(all.join('\n'));
-    const cut = fitRoute(all, 5, 100).split('\n');
-    expect(cut[0]).toBe('…4 earlier stops');
-    expect(cut[1]).toBe(all[4]);
-    expect(cut[2]).toBe(all[5]);
-    expect(cut.at(-1)).toMatch(/^…and \d more$/);
-    expect(cut.join('\n').length).toBeLessThanOrEqual(100);
-    // At the start nothing is left out before it; once finished the last stops are shown.
-    expect(fitRoute(all, 0, 100).split('\n')[0]).toBe(all[0]);
-    expect(fitRoute(all, 10, 100).split('\n').slice(0, 2)).toEqual(['…8 earlier stops', all[8]]);
-  });
 });
 
 describe('the controls of a train post', () => {
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index 486d0404ddcc6d681bc0b0d54350b3aaf3908801..29098fd96bc8a224f428256efe3bb39c8d1c334f 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -1,10 +1,8 @@
-import type { APIEmbed } from 'discord.js';
 import { memberOf, type TrainParty } from '../domain/party/party.js';
 import { isEliteGym } from '../domain/party/raid.js';
 import { nameOf } from '../domain/party/timed.js';
 import { currentStop, nextStop, routeFinished } from '../domain/party/train.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
-import { fitEmbed, groupField, type ShrinkableField } from './party-card.js';
 import { bottomControls, moveTrainButton } from './party-controls.js';
 import {
   cutText,
@@ -14,8 +12,10 @@ import {
   renderedPost,
   tidyTitle,
   trainerBlocks,
+  trainerCount,
   type Fit,
   type ForumTag,
+  type PartyBrief,
   type PostBlock,
   type PostLayout,
   type RenderedPost,
@@ -24,7 +24,6 @@ import {
   bossFacts,
   gymMapsUrl,
   gymName,
-  gymNotes,
   linkText,
   locationBlock,
   type PostGym,
@@ -93,29 +92,13 @@ export function routeLines(
   });
 }
 
-/**
- * The lines of a route as one text of at most `limit` characters. A route that does not fit
- * keeps the stops around the current one: the stops before the one the train just left are
- * counted in a first line, and what does not fit after them in a last one.
- */
-export function fitRoute(lines: readonly string[], stop: number, limit: number): string {
-  const all = lines.join('\n');
-  if (all.length <= limit) return all;
-  const start = Math.max(0, Math.min(stop, lines.length - 1) - 1);
-  const head = start > 0 ? `…${count(start, 'earlier stop')}\n` : '';
-  return head + fitItems(lines.slice(start), limit - head.length, '\n');
-}
-
-/** Where the train is and where it goes next, as the card of a direct message says it. */
-function whereLines(view: TrainPostView): string[] {
+/** Where the train is, in a word, for a direct message: `At The Stacks`, `No route yet`. */
+function placeLine(view: TrainPostView): string {
   const { party } = view;
-  if (party.train.route.length === 0) return ['No route yet: `/route add` adds a stop.'];
-  if (routeFinished(party)) return ['The route is finished.'];
-  const [at, next] = [currentStop(party), nextStop(party)];
-  return [
-    ...(at === undefined ? [] : [`**Now at** ${stopLink(view.gym(at), true)}`]),
-    ...(next === undefined ? [] : [`**Next** ${stopLink(view.gym(next), true)}`]),
-  ];
+  if (party.train.route.length === 0) return 'No route yet';
+  if (routeFinished(party)) return 'Route finished';
+  const at = currentStop(party);
+  return at === undefined ? 'No route yet' : `At ${stopLink(view.gym(at), true)}`;
 }
 
 /** Where the train is and where it goes next, as the post says it beside "Move train…". */
@@ -236,77 +219,29 @@ function trainLayout(view: TrainPostView): PostLayout {
   }));
 }
 
-/** The card of a train, for a direct message: what the post says, as an embed. */
-function trainCard(view: TrainPostView): APIEmbed {
+/**
+ * The train in brief, for a direct message: its name (the sentence of a new train does not say
+ * it), what it is after, where it is, its times as the post says them and how many come, with
+ * the colour of its post and the boss's picture.
+ */
+function trainBrief(view: TrainPostView): PartyBrief {
   const { party, boss } = view;
-  const { route, stop, conductorId } = party.train;
-  const description = [
-    `**Raid train**${boss ? ` after **${plain(boss.name)}**${boss.shiny ? ` ${view.emoji.shiny}` : ''}` : ''}`,
-    view.closed ?? describeTimes(view),
-    ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}.`]),
-    ...(party.anonymous ? [] : [`Created by ${memberName(memberOf(party, party.createdById))}.`]),
-    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
-    '',
-    ...whereLines(view),
-  ].join('\n');
-
-  const fields: ShrinkableField[] = [];
-  if (boss?.entry) {
-    fields.push({
-      field: {
-        name: 'Boss',
-        value: truncate(
-          bossFacts(view.catalogue, boss.entry, false, view.emoji).join('\n'),
-          LIMITS.fieldValue,
-        ),
-      },
-      rank: 0,
-    });
-  }
-  if (route.length > 0) {
-    fields.push({
-      field: {
-        name: routeFinished(party)
-          ? `Route: ${count(route.length, 'stop')}, finished`
-          : `Route: stop ${stop + 1} of ${route.length}`,
-        value: fitRoute(routeLines(view), stop, LIMITS.fieldValue),
-      },
-      rank: 0,
-    });
-  }
-  const single = party.groups.length === 1;
-  for (const group of party.groups) {
-    fields.push({
-      field: groupField(view, group, { single, lobby: true }),
-      shrink: (limit) => groupField(view, group, { single, lobby: true, limit }),
-      rank: 1,
-    });
-  }
-  const at = currentStop(party);
-  const notes = at === undefined ? [] : gymNotes(view.gym(at));
-  if (notes.length > 0) {
-    fields.push({
-      field: { name: 'Location Information', value: truncate(notes.join('\n'), LIMITS.fieldValue) },
-      rank: 0,
-    });
-  }
-
-  // Embed titles render Markdown (a thread name does not, so the post's own title stays raw).
-  const embedTitle = truncate(plain(nameOf(party)), LIMITS.embedTitle);
-  const embedDescription = truncate(description, LIMITS.embedDescription);
-  fitEmbed(embedTitle, embedDescription, fields);
   return {
-    title: embedTitle,
-    description: embedDescription,
-    color: colour(view),
-    ...(boss?.image === undefined ? {} : { thumbnail: { url: boss.image } }),
-    fields: fields.map((f) => f.field),
+    accent: colour(view),
+    ...(boss?.image === undefined ? {} : { picture: boss.image }),
+    lines: [
+      `**Raid Train: ${plain(nameOf(party))}**`,
+      ...afterLine(view),
+      placeLine(view),
+      view.closed ?? describeTimes(view),
+      trainerCount(party),
+    ],
   };
 }
 
 /**
  * The forum post of a raid train: title, tags, the components-v2 message (`trainLayout`) and the
- * card of a direct message. Pure: the same view gives the same post. It has what the post of a
+ * brief of a direct message. Pure: the same view gives the same post. It has what the post of a
  * meetup has and what a train has: its conductor, where it is and where it goes next, its route,
  * the Pokémon it is after, what there is to say about the gym it is at, and its groups, as in a
  * raid. There is no map: `/where` gives it.
@@ -318,6 +253,6 @@ export function renderTrainPost(view: TrainPostView): RenderedPost {
     title: trainTitle(party),
     tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
     layout: trainLayout(view),
-    card: trainCard(view),
+    brief: trainBrief(view),
   });
 }
diff --git a/src/render/v2.ts b/src/render/v2.ts
index 9d1c3e85379b4493be7719829c22469b4f531992..0672d784befb999fbd6d9e9c37d52f0f48396a64 100644
--- a/src/render/v2.ts
+++ b/src/render/v2.ts
@@ -1,8 +1,10 @@
 import {
+  ButtonStyle,
   ComponentType,
   SeparatorSpacingSize,
   type APIActionRowComponent,
   type APIButtonComponent,
+  type APIButtonComponentWithURL,
   type APIComponentInContainer,
   type APIContainerComponent,
   type APISectionAccessoryComponent,
@@ -41,6 +43,17 @@ export function actionRow(
   return { type: ComponentType.ActionRow, components: buttons };
 }
 
+/** A button that opens an address: a post, a message, a place in Google Maps. */
+export function linkButton(label: string, emoji: string, url: string): APIButtonComponentWithURL {
+  return {
+    type: ComponentType.Button,
+    style: ButtonStyle.Link,
+    label,
+    emoji: { name: emoji },
+    url,
+  };
+}
+
 /** The box a post is drawn in, with the colour of its edge. */
 export function container(
   accent: number,
diff --git a/src/services/anonymous-maker.test.ts b/src/services/anonymous-maker.test.ts
index 3f860be9e75554bb1c1df898fcfcb0e4ea6bd9d1..9cce684eeb5e193acd34684742a0dc3ebba560d2 100644
--- a/src/services/anonymous-maker.test.ts
+++ b/src/services/anonymous-maker.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
+import { classic } from '../../test/support/messages.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { BOB, REPORTER } from '../../test/support/parties.js';
 import { createdTrain, reportedRaid } from '../../test/support/party-service.js';
@@ -116,11 +117,11 @@ describe('the lines of a train whose maker asked not to be named', () => {
     await made.timed.setStartTime(made.party.id, maker, made.clock.now + 2 * 60 * 60_000);
     await made.timed.flush();
     await made.notify.flush();
-    const [dm] = made.dms.to(BOB);
-    expect(dm?.content).toMatch(
+    const dm = classic(made.dms.to(BOB)[0]);
+    expect(dm.content).toMatch(
       /^Start at <t:\d+:\w> for the train [^(]*\. \d+ trainers? (is|are) attending: https:/,
     );
-    expect(dm?.content).not.toMatch(/Rhea/);
+    expect(dm.content).not.toMatch(/Rhea/);
     expect((await lines(made)).join(' ')).not.toMatch(/Rhea/);
   });
 
diff --git a/src/services/notify-service.parties.test.ts b/src/services/notify-service.parties.test.ts
index a6cc4e811aa63970f66e639df4aa455f8ddaa574..e150f44027f74dd8b365ebde965a78db363163be 100644
--- a/src/services/notify-service.parties.test.ts
+++ b/src/services/notify-service.parties.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { classic } from '../../test/support/messages.js';
+import { classic, customIdsOf, dmBrief, dmSummary, linksOf } from '../../test/support/messages.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { MemoryNewTrains } from '../../test/support/new-trains.js';
 import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
@@ -25,9 +25,9 @@ const YVELTAL = pokemonTarget(717);
 const member = (id: string, name: string) => ({ id, name });
 
 type Made = Awaited<ReturnType<typeof partyServiceWith>>;
-/** The content of each message for a member, line by line. */
+/** Each message for a member: its news and its reasons (`dmSummary`), or a meeting time's lines. */
 const told = (made: Made, userId: string): string[][] =>
-  made.dms.to(userId).map((message) => (message.content ?? '').split('\n'));
+  made.dms.to(userId).map((message) => dmSummary(message));
 const stamp = (time: number, style = 't') => `<t:${String(time / 1000)}:${style}>`;
 
 function off() {
@@ -59,26 +59,13 @@ describe('NotifyService: a train is made', () => {
     expect(made.dms.recipients).toEqual([ALICE, CAROL]);
     const link = postLink(made.gateway.guildId, made.postId);
     expect(told(made, ALICE)).toEqual([
-      [
-        `A new train has been announced in <#${WEST_CHANNEL}> by **Rhea**: ${link}`,
-        '-# You asked to be told about: new trains',
-      ],
+      [`A new train has been announced in <#${WEST_CHANNEL}> by **Rhea**.`, 'new trains'],
     ]);
     const [message] = made.dms.to(ALICE);
-    expect(JSON.stringify(message?.embeds)).toContain('Saturday legendaries');
-    expect(message?.components).toEqual([
-      {
-        type: 1,
-        components: [
-          {
-            type: 2,
-            style: 2,
-            custom_id: `dm:${made.gateway.guildId}:stop:train`,
-            label: 'Stop: new trains',
-          },
-        ],
-      },
-    ]);
+    // The brief names the train, which the sentence does not.
+    expect(dmBrief(message)[0]).toBe('**Raid Train: Saturday legendaries**');
+    expect(linksOf(message)).toEqual([`Go to post ${link}`]);
+    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:stop:train`]);
     expect(made.dms.jobs[0]).toMatchObject({
       priority: DM_PRIORITY.normal,
       expiresAt: made.clock.now + 60 * MINUTE,
@@ -96,9 +83,8 @@ describe('NotifyService: a train is made', () => {
     await made.notify.flush();
     expect(made.dms.recipients).toEqual([ALICE]);
     const link = postLink(made.gateway.guildId, made.postId);
-    expect(told(made, ALICE)[0]?.[0]).toBe(
-      `A new train has been announced in <#${WEST_CHANNEL}>: ${link}`,
-    );
+    expect(told(made, ALICE)[0]?.[0]).toBe(`A new train has been announced in <#${WEST_CHANNEL}>.`);
+    expect(linksOf(made.dms.to(ALICE)[0])).toEqual([`Go to post ${link}`]);
     const [message] = made.dms.to(ALICE);
     expect(JSON.stringify(message)).not.toContain('Rhea');
     expect(JSON.stringify(message)).not.toContain(REPORTER);
@@ -152,9 +138,9 @@ describe('NotifyService: an egg gets its boss', () => {
     });
     await made.notify.flush();
   };
-  /** The first line of every message for a member, without the link. */
+  /** The news of every message for a member. */
   const heard = (made: Awaited<ReturnType<typeof egg>>, userId: string): string[] =>
-    told(made, userId).map((lines) => (lines[0] ?? '').replace(/: https:\S+$/, ''));
+    told(made, userId).map((lines) => lines[0] ?? '');
   const STACKS = `**The Stacks** (<#${WEST_CHANNEL}>)`;
 
   it('tells who is signed up and asked to hear it, whether or not they want the boss', async () => {
@@ -165,15 +151,13 @@ describe('NotifyService: an egg gets its boss', () => {
     const link = postLink(made.gateway.guildId, made.postId);
     expect(told(made, ALICE)).toEqual([
       [
-        `The boss of the egg at **The Stacks** (<#${WEST_CHANNEL}>) is **Yveltal**: ${link}`,
-        '-# You asked to be told about: the boss of your eggs',
+        `The boss of the egg at **The Stacks** (<#${WEST_CHANNEL}>) is **Yveltal**.`,
+        'the boss of your eggs',
       ],
     ]);
     expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.urgent);
-    const message = classic(made.dms.to(ALICE)[0]);
-    expect(message.components?.[0]?.components).toMatchObject([
-      { custom_id: `dm:${made.gateway.guildId}:stop:boss`, label: 'Stop: the boss of your eggs' },
-    ]);
+    expect(customIdsOf(made.dms.to(ALICE)[0])).toEqual([`dm:${made.gateway.guildId}:stop:boss`]);
+    expect(linksOf(made.dms.to(ALICE)[0])[0]).toBe(`Go to post ${link}`);
   });
 
   it('says what it hatched into when the clock sets the only possible boss', async () => {
@@ -183,7 +167,7 @@ describe('NotifyService: an egg gets its boss', () => {
     await made.notify.flush();
     expect(made.dms.recipients.sort()).toEqual([ALICE, REPORTER].sort());
     expect(told(made, ALICE)[0]?.[0]).toBe(
-      `The egg at **The Stacks** (<#${WEST_CHANNEL}>) hatched into **Yveltal**: ${postLink(made.gateway.guildId, made.postId)}`,
+      `The egg at **The Stacks** (<#${WEST_CHANNEL}>) hatched into **Yveltal**.`,
     );
   });
 
@@ -195,7 +179,7 @@ describe('NotifyService: an egg gets its boss', () => {
     expect(made.dms.to(ALICE)).toHaveLength(1);
     expect(told(made, ALICE)[0]).toEqual([
       expect.stringMatching(/^The boss of the egg at/),
-      '-# You asked to be told about: the boss of your eggs · Yveltal',
+      'the boss of your eggs · Yveltal',
     ]);
     // Dora is not signed up: for her it is news of a raid she wants.
     expect(told(made, DORA)[0]?.[0]).toMatch(/^The raid at \*\*The Stacks\*\* .* now has its boss/);
@@ -215,10 +199,10 @@ describe('NotifyService: an egg gets its boss', () => {
     await setBoss(made, BOB, 'yveltal');
     await setBoss(made, BOB, 'giratina_origin');
     expect(heard(made, ALICE)).toEqual([
-      `The boss of the egg at ${STACKS} is **Yveltal**`,
-      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**`,
+      `The boss of the egg at ${STACKS} is **Yveltal**.`,
+      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**.`,
     ]);
-    expect(told(made, ALICE)[1]?.[1]).toBe('-# You asked to be told about: the boss of your eggs');
+    expect(told(made, ALICE)[1]?.[1]).toBe('the boss of your eggs');
     expect(made.dms.jobs.map((job) => job.priority)).toEqual([
       DM_PRIORITY.urgent,
       DM_PRIORITY.urgent,
@@ -232,8 +216,8 @@ describe('NotifyService: an egg gets its boss', () => {
     expect(made.dms.to(ALICE)).toHaveLength(1);
     await setBoss(made, BOB, 'giratina_origin');
     expect(heard(made, ALICE)).toEqual([
-      `The boss of the egg at ${STACKS} is **Yveltal**`,
-      `The boss of the egg at ${STACKS} is **Giratina (Origin Forme)**`,
+      `The boss of the egg at ${STACKS} is **Yveltal**.`,
+      `The boss of the egg at ${STACKS} is **Giratina (Origin Forme)**.`,
     ]);
   });
 
@@ -243,9 +227,9 @@ describe('NotifyService: an egg gets its boss', () => {
     await setBoss(made, BOB, 'giratina_origin');
     await setBoss(made, BOB, 'yveltal');
     expect(heard(made, ALICE)).toEqual([
-      `The boss of the egg at ${STACKS} is **Yveltal**`,
-      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**`,
-      `The boss of the raid at ${STACKS} is now **Yveltal**`,
+      `The boss of the egg at ${STACKS} is **Yveltal**.`,
+      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**.`,
+      `The boss of the raid at ${STACKS} is now **Yveltal**.`,
     ]);
     // A boss a member set themself is the last one they know of.
     const other = await egg();
@@ -253,8 +237,8 @@ describe('NotifyService: an egg gets its boss', () => {
     await setBoss(other, BOB, 'giratina_origin');
     await setBoss(other, BOB, 'yveltal');
     expect(heard(other, ALICE)).toEqual([
-      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**`,
-      `The boss of the raid at ${STACKS} is now **Yveltal**`,
+      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**.`,
+      `The boss of the raid at ${STACKS} is now **Yveltal**.`,
     ]);
   });
 
@@ -263,7 +247,7 @@ describe('NotifyService: an egg gets its boss', () => {
     await setBoss(made, BOB, 'yveltal');
     await setBoss(made, BOB, null);
     await setBoss(made, BOB, 'yveltal');
-    expect(heard(made, ALICE)).toEqual([`The boss of the egg at ${STACKS} is **Yveltal**`]);
+    expect(heard(made, ALICE)).toEqual([`The boss of the egg at ${STACKS} is **Yveltal**.`]);
     // Set by themself, taken back, set by another: they know it.
     const other = await egg();
     await setBoss(other, ALICE, 'yveltal');
@@ -320,9 +304,10 @@ describe('NotifyService: a meeting time', () => {
         `Meet at ${stamp(MEET)} for the raid at ${GYM} (set by Alice). 3 trainers are attending: ${link}`,
       ],
     ]);
-    const [message] = made.dms.to(BOB);
-    expect(message?.components).toBeUndefined();
-    expect(message?.embeds).toBeUndefined();
+    // Plain text for a phone's notification: no components, no embed.
+    const message = classic(made.dms.to(BOB)[0]);
+    expect(message.components).toBeUndefined();
+    expect(message.embeds).toBeUndefined();
     expect(made.dms.jobs[0]).toMatchObject({ priority: DM_PRIORITY.urgent, expiresAt: MEET });
   });
 
diff --git a/src/services/notify-service.test.ts b/src/services/notify-service.test.ts
index 316c217481a01bd962cb8ac0d1119899e9ce4a95..4c083740bfc1b4b33b78ed5176085d362f3fdfd8 100644
--- a/src/services/notify-service.test.ts
+++ b/src/services/notify-service.test.ts
@@ -1,7 +1,16 @@
 import { describe, expect, it } from 'vitest';
-import { classic } from '../../test/support/messages.js';
+import {
+  buttonsOf,
+  customIdsOf,
+  dmBrief,
+  dmReasons,
+  dmSentence,
+  linksOf,
+  thumbnailOf,
+  v2,
+} from '../../test/support/messages.js';
 import { FakeDmGateway } from '../../test/support/dms.js';
-import { fakeButton } from '../../test/support/fake-interactions.js';
+import { fakeButton, type FakeRow } from '../../test/support/fake-interactions.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { components } from '../components/index.js';
@@ -27,12 +36,12 @@ type Made = Awaited<ReturnType<typeof reportedRaid>>;
 
 /** A member who acts, with their name. */
 const member = (id: string, name: string) => ({ id, name });
-/** The first line of each message for a member. */
+/** The news of each message for a member. */
 const told = (made: Made, userId: string): string[] =>
-  made.dms.to(userId).map((message) => (message.content ?? '').split('\n')[0] ?? '');
-/** The reasons line of each message for a member. */
+  made.dms.to(userId).map((message) => dmSentence(message));
+/** The reasons of each message for a member, joined by ` · `. */
 const why = (made: Made, userId: string): string[] =>
-  made.dms.to(userId).map((message) => (message.content ?? '').split('\n')[1] ?? '');
+  made.dms.to(userId).map((message) => dmReasons(message).join(' · '));
 
 /**
  * A raid that is reported after `before` has filled the wants and targets: the first event
@@ -71,21 +80,26 @@ describe('NotifyService: a raid is reported', () => {
       { boss: { key: 'yveltal' }, reporter: { name: 'Rhea' } },
     );
     const link = postLink(made.gateway.guildId, made.postId);
-    const sentence = `A raid for **Yveltal** has been reported at **The Stacks** (<#${WEST_CHANNEL}>) by **Rhea**: ${link}`;
+    const sentence = `A raid for **Yveltal** has been reported at **The Stacks** (<#${WEST_CHANNEL}>) by **Rhea**.`;
     expect(made.dms.recipients).toEqual([ALICE, BOB, CAROL]);
     expect(told(made, ALICE)).toEqual([sentence]);
-    expect(why(made, ALICE)).toEqual(['-# You asked to be told about: Yveltal']);
-    expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
-    expect(why(made, CAROL)).toEqual(['-# You asked to be told about: raids at The Stacks']);
-    // The embed is the card of the post; a DM has none of the post's controls and pings nobody.
-    const message = classic(made.dms.to(ALICE)[0]);
-    expect(message.embeds).toHaveLength(1);
-    const [card] = message.embeds ?? [];
-    expect(card?.title).toBe('The Stacks');
-    expect(card?.description?.split('\n')[0]).toBe('**Level 5 raid against Yveltal** ✨');
-    expect(card?.description).toContain('Reported by Rhea.');
-    expect(card?.fields?.map((field) => field.name)).toEqual(['Boss', 'Trainers (1)']);
-    expect(message.components?.flatMap((row) => row.components).length).toBeLessThanOrEqual(5);
+    expect(why(made, ALICE)).toEqual(['Yveltal']);
+    expect(why(made, BOB)).toEqual(['T5 raids']);
+    expect(why(made, CAROL)).toEqual(['raids at The Stacks']);
+    // Under the news the post in brief, the buttons to the post and the gym; none of the post's
+    // controls, and it pings nobody.
+    const message = v2(made.dms.to(ALICE)[0]);
+    expect(dmBrief(message)).toEqual([
+      '**Level 5 raid against Yveltal** ✨',
+      'No time has been set yet.',
+      '1 trainer',
+    ]);
+    expect(thumbnailOf(message)).toMatch(/pm717/);
+    expect(linksOf(message)).toEqual([
+      `Go to post ${link}`,
+      'Map https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
+    ]);
+    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:stop:p:717`]);
     expect(message.mention).toBeUndefined();
     const [job] = made.dms.jobs;
     expect(job).toMatchObject({ priority: DM_PRIORITY.normal, eventAt: made.clock.now });
@@ -105,7 +119,7 @@ describe('NotifyService: a raid is reported', () => {
     );
     expect(made.dms.jobs).toHaveLength(1);
     expect(why(made, ALICE)).toEqual([
-      '-# You asked to be told about: Giratina (Origin Forme) · T5 raids · Giratina (every form) · raids at The Stacks',
+      'Giratina (Origin Forme) · T5 raids · Giratina (every form) · raids at The Stacks',
     ]);
   });
 
@@ -127,7 +141,7 @@ describe('NotifyService: a raid is reported', () => {
     );
     expect(made.dms.recipients).toEqual([BOB, CAROL]);
     expect(told(made, BOB)[0]).toMatch(/^A T5 egg has been reported at \*\*The Stacks\*\*/);
-    expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
+    expect(why(made, BOB)).toEqual(['T5 raids']);
     expect(made.dms.jobs[0]?.expiresAt).toBe(made.party.endTime);
   });
 
@@ -141,7 +155,7 @@ describe('NotifyService: a raid is reported', () => {
     );
     expect(made.dms.recipients).toEqual([ALICE]);
     expect(told(made, ALICE)[0]).toBe(
-      `A T5 egg has been reported at **The Stacks** (<#${WEST_CHANNEL}>): ${postLink(made.gateway.guildId, made.postId)}`,
+      `A T5 egg has been reported at **The Stacks** (<#${WEST_CHANNEL}>).`,
     );
   });
 
@@ -291,40 +305,30 @@ describe('NotifyService: the buttons that stop a message', () => {
       { boss: { key: 'yveltal' } },
     );
     const guild = made.gateway.guildId;
-    expect(made.dms.to(ALICE)[0]?.components).toEqual([
-      {
-        type: 1,
-        components: [
-          { type: 2, style: 2, custom_id: `dm:${guild}:stop:t:T5`, label: 'Stop: T5 raids' },
-          { type: 2, style: 2, custom_id: `dm:${guild}:stop:p:717`, label: 'Stop: Yveltal' },
-          {
-            type: 2,
-            style: 2,
-            custom_id: `dm:${guild}:stop:g:1`,
-            label: 'Stop: raids at The Stacks',
-          },
-        ],
-      },
-    ]);
+    const message = made.dms.to(ALICE)[0];
+    expect(dmReasons(message)).toEqual(['T5 raids', 'Yveltal', 'raids at The Stacks']);
+    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toEqual(
+      [`dm:${guild}:stop:t:T5`, `dm:${guild}:stop:p:717`, `dm:${guild}:stop:g:1`].map(
+        (customId) => ({ label: 'Stop', emoji: undefined, style: 2, customId, url: undefined }),
+      ),
+    );
   });
 
   it('is a message Discord takes, and a pressed button ends the messages for that reason', async () => {
     const made = await reported(async ({ wants, gateway }) => {
       await wants.set(ALICE, gateway.guildId, T5, 'raid');
     });
-    const message = classic(made.dms.to(ALICE)[0]);
+    const message = v2(made.dms.to(ALICE)[0]);
     const dmGateway = new FakeDmGateway();
     expect(await dmGateway.send(ALICE, message)).toBe('sent');
     // The press, as the router handles it in a DM.
     const { ctx } = createTestContext({ wants: made.wants, gymTargets: made.gymTargets });
-    const row = message.components?.[0];
-    const button = row?.components[0];
-    const customId = button && 'custom_id' in button ? button.custom_id : '';
+    const [customId = ''] = customIdsOf(message);
     const pressed = fakeButton({
       customId,
       isDm: true,
       userId: ALICE,
-      messageRows: [row ?? { type: 1, components: [] }],
+      messageRows: message.components as unknown as FakeRow[],
     });
     await new InteractionRouter(ctx, [], components).handle(pressed as never);
     expect(await made.wants.count(ALICE, made.gateway.guildId)).toBe(0);
@@ -375,13 +379,13 @@ describe('NotifyService: a raid changes', () => {
     // Alice and Carol were told for their only reason; Dora's tier was told, her Yveltal not.
     expect(made.dms.recipients).toEqual([ALICE, DORA, CAROL, BOB]);
     expect(told(made, BOB)).toEqual([
-      `The raid at **The Stacks** (<#${WEST_CHANNEL}>) now has its boss, **Yveltal**: ${postLink(made.gateway.guildId, made.postId)}`,
+      `The raid at **The Stacks** (<#${WEST_CHANNEL}>) now has its boss, **Yveltal**.`,
     ]);
-    expect(why(made, DORA)).toEqual([
-      '-# You asked to be told about: T5 raids',
-      '-# You asked to be told about: Yveltal',
+    expect(why(made, DORA)).toEqual(['T5 raids', 'Yveltal']);
+    expect(dmBrief(made.dms.to(BOB)[0]).slice(0, 2)).toEqual([
+      '**Level 5 raid** (egg)',
+      '**Hatches as Yveltal** ✨',
     ]);
-    expect(JSON.stringify(made.dms.to(BOB)[0]?.embeds)).toContain('Yveltal');
     // The same boss again changes nothing; nobody is told again.
     await setBoss(made, ALICE, 'yveltal', 'Yveltal (T5)');
     expect(made.dms.jobs).toHaveLength(5);
@@ -405,9 +409,9 @@ describe('NotifyService: a raid changes', () => {
     await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
     expect(made.dms.to(EVE)).toEqual([]);
     await setBoss(made, CAROL, 'giratina_origin', 'Giratina (Origin Forme) (T5)');
-    expect(why(made, EVE)).toEqual(['-# You asked to be told about: Giratina (every form)']);
+    expect(why(made, EVE)).toEqual(['Giratina (every form)']);
     expect(told(made, EVE)).toEqual([
-      `The boss of the raid at **The Stacks** (<#${WEST_CHANNEL}>) is now **Giratina (Origin Forme)**: ${postLink(made.gateway.guildId, made.postId)}`,
+      `The boss of the raid at **The Stacks** (<#${WEST_CHANNEL}>) is now **Giratina (Origin Forme)**.`,
     ]);
   });
 
@@ -460,9 +464,9 @@ describe('NotifyService: a raid changes', () => {
     expect(made.current().gymId).toBe(2);
     expect(made.dms.jobs.slice(before).map((job) => job.userId)).toEqual([EVE]);
     expect(told(made, EVE)).toEqual([
-      `The T5 egg is at **Old Stone Fountain** (<#${WEST_CHANNEL}>), not where it was first reported: ${postLink(made.gateway.guildId, made.postId)}`,
+      `The T5 egg is at **Old Stone Fountain** (<#${WEST_CHANNEL}>), not where it was first reported.`,
     ]);
-    expect(why(made, EVE)).toEqual(['-# You asked to be told about: raids at Old Stone Fountain']);
+    expect(why(made, EVE)).toEqual(['raids at Old Stone Fountain']);
     // Back to the first gym: Carol was told about that one.
     await made.raids.setGym(made.party.id, member(BOB, 'Bob'), 1);
     await made.notify.flush();
@@ -495,11 +499,13 @@ describe('NotifyService: a raid changes', () => {
     // the new gym; Carol moved it; Fred cannot see East.
     expect(after.map((job) => job.userId).sort()).toEqual([BOB, DORA].sort());
     const link = postLink(made.gateway.guildId, moved.forumPostId ?? '');
+    // The post in the new region, as the button leads there.
+    expect(linksOf(made.dms.to(BOB).at(-1))[0]).toBe(`Go to post ${link}`);
     expect(told(made, BOB)).toEqual([
-      `The T5 egg is at **Café Élan Fresco** (<#${EAST_CHANNEL}>), not where it was first reported: ${link}`,
+      `The T5 egg is at **Café Élan Fresco** (<#${EAST_CHANNEL}>), not where it was first reported.`,
     ]);
-    expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
-    expect(why(made, DORA)).toEqual(['-# You asked to be told about: raids at Café Élan Fresco']);
+    expect(why(made, BOB)).toEqual(['T5 raids']);
+    expect(why(made, DORA)).toEqual(['raids at Café Élan Fresco']);
     expect(made.members.batches.at(-1)?.channelId).toBe(EAST_FORUM);
     // The old party has ended: what is remembered is about the new one alone.
     expect(made.notify.remembered).toBe(1);
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index bd6b69bf8af52a73fce659bbeb1654a7af44720a..c3e36369ec175623df8530bcf00d14d6b3fc5091 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -1,4 +1,3 @@
-import type { APIEmbed } from 'discord.js';
 import type { Settings } from '../config/settings.js';
 import type { GymTargetStorage } from '../db/repositories/gym-notification-repository.js';
 import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
@@ -6,7 +5,7 @@ import type { NewTrainStorage } from '../db/repositories/new-train-repository.js
 import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { MemberDirectory } from '../discord/member-directory.js';
 import { MEMBERS_PER_LOOKUP } from '../discord/member-viewers.js';
-import type { ClassicMessage } from '../discord/party-gateway.js';
+import type { OutgoingMessage } from '../discord/party-gateway.js';
 import {
   bossId,
   raidNumbers,
@@ -39,17 +38,21 @@ import { wantTargetLabel } from '../domain/pogo/wants.js';
 import type { Logger } from '../log.js';
 import {
   bossSetSentence,
+  mapLink,
   meetingDmSentence,
   notifyDm,
+  postButton,
   postLink,
   raidDmSentence,
+  reportButton,
   stopButtonId,
   trainDmSentence,
   type RaidDmView,
   type ShownReason,
 } from '../render/notify-dm.js';
+import type { PartyBrief } from '../render/party-post.js';
 import { gymName, shownBoss, type PostGym } from '../render/raid-post.js';
-import { SPAWN_MINUTES, spawnEmbed, spawnSentence } from '../render/spawn.js';
+import { SPAWN_MINUTES, spawnBrief, spawnSentence } from '../render/spawn.js';
 import { clockOrDate, clockOrDay, plain, plainNoLinks, type NamedMember } from '../render/text.js';
 import { DM_PRIORITY, type DmPriority, type DmSender } from './dm-sender.js';
 import type { GameDataProvider } from './game-data-service.js';
@@ -106,8 +109,8 @@ export interface PartyNotifier {
 export interface NotifyServiceOptions {
   /** The parties: an ended one is not announced, and what was told about it is forgotten. */
   store: Pick<PartyStore, 'get' | 'onChange'>;
-  /** The embed of a party's post as it is now (`PartyService.embedOf`). */
-  posts: { embedOf(party: Party): APIEmbed };
+  /** A party's post in brief as it is now (`PartyService.briefOf`). */
+  posts: { briefOf(party: Party): PartyBrief };
   wants: Pick<WantStorage, 'wanting'>;
   gymTargets: Pick<GymTargetStorage, 'targeting'>;
   /** Who asked to hear of new trains, per server. */
@@ -185,7 +188,7 @@ interface Announcement {
   expiresAt: number;
   gather(guildId: string): Promise<Candidates>;
   /** The message for a member these reasons fired for; built once per set of reasons. */
-  message(guildId: string, reasons: readonly NotifyReason[]): ClassicMessage;
+  message(guildId: string, reasons: readonly NotifyReason[]): OutgoingMessage;
   priority(reasons: readonly NotifyReason[]): DmPriority;
 }
 
@@ -361,7 +364,7 @@ export class NotifyService implements PartyNotifier {
     const { newTrains, regions, posts } = this.options;
     const eventAt = this.now();
     const reason: NotifyReason = { kind: 'new-train' };
-    let embed: { made?: APIEmbed | undefined } | undefined;
+    let brief: { made?: PartyBrief | undefined } | undefined;
     this.announce({
       key: party.id,
       partyId: party.id,
@@ -376,17 +379,19 @@ export class NotifyService implements PartyNotifier {
         reasonsOf: () => [reason],
       }),
       message: (guildId, reasons) => {
-        embed ??= { made: this.embedOf(posts, party) };
+        brief ??= { made: this.briefOf(posts, party) };
         const region = party.regionId === null ? undefined : regions.byId(party.regionId);
         return notifyDm(
-          trainDmSentence({
-            regionChannelId: region?.channelId,
-            // As for a raid: an anonymous maker is not named to those who are told of it.
-            maker: party.anonymous ? undefined : memberOf(party, party.createdById),
-            link: postLink(guildId, forumPostId),
-          }),
+          {
+            sentence: trainDmSentence({
+              regionChannelId: region?.channelId,
+              // As for a raid: an anonymous maker is not named to those who are told of it.
+              maker: party.anonymous ? undefined : memberOf(party, party.createdById),
+            }),
+            brief: brief.made,
+            links: [postButton(postLink(guildId, forumPostId))],
+          },
           reasons.map((one) => this.shown(guildId, one)),
-          embed.made,
         );
       },
       priority: () => DM_PRIORITY.normal,
@@ -483,7 +488,7 @@ export class NotifyService implements PartyNotifier {
     if (!this.enabled) return;
     const { wants, gameData } = this.options;
     const spawn = { pokemon: news.pokemon, iv: news.iv };
-    const embed = spawnEmbed(news.view);
+    const brief = spawnBrief(news.view, news.eventAt + SPAWN_MINUTES * 60_000);
     this.spawns += 1;
     this.announce({
       key: `spawn:${String(this.spawns)}`,
@@ -509,14 +514,13 @@ export class NotifyService implements PartyNotifier {
       },
       message: (guildId, reasons) =>
         notifyDm(
-          // It ends with the address of the report: the place to look, and to answer.
-          spawnSentence(
-            news.view,
-            news.regionChannelId,
-            postLink(guildId, news.regionChannelId, news.messageId),
-          ),
+          {
+            sentence: spawnSentence(news.view, news.regionChannelId),
+            brief,
+            // The report itself: the place to look, and to answer.
+            links: [reportButton(postLink(guildId, news.regionChannelId, news.messageId))],
+          },
           reasons.map((reason) => this.shown(guildId, reason)),
-          embed,
         ),
       priority: () => DM_PRIORITY.spawn,
     });
@@ -548,20 +552,18 @@ export class NotifyService implements PartyNotifier {
       // A time that has passed by the time the message would go is not worth a message.
       expiresAt: Math.max(news.expiresAt, eventAt + 60_000),
       gather: () => Promise.resolve({ ids: [...memberIds], reasonsOf: () => [] }),
-      message: (guildId) =>
-        notifyDm(
-          meetingDmSentence({
-            what: news.what,
-            subject: this.meetingSubject(party),
-            // The maker of a train who asked not to be named is not named here either.
-            by: party.anonymous && party.createdById === by.id ? null : by,
-            time: news.time,
-            heads: news.heads,
-            link: postLink(guildId, forumPostId),
-          }),
-          [],
-          undefined,
-        ),
+      // Plain text: it exists for its notification, which a phone shows raw (Matt, 2026-10-15).
+      message: (guildId) => ({
+        content: meetingDmSentence({
+          what: news.what,
+          subject: this.meetingSubject(party),
+          // The maker of a train who asked not to be named is not named here either.
+          by: party.anonymous && party.createdById === by.id ? null : by,
+          time: news.time,
+          heads: news.heads,
+          link: postLink(guildId, forumPostId),
+        }),
+      }),
       priority: () => DM_PRIORITY.urgent,
     });
   }
@@ -603,7 +605,7 @@ export class NotifyService implements PartyNotifier {
     const sighting = this.sighting(party);
     const eventAt = this.now();
     const bossNow = party.raid.boss;
-    let embed: { made?: APIEmbed | undefined } | undefined;
+    let brief: { made?: PartyBrief | undefined } | undefined;
     this.announce({
       key: party.id,
       partyId: party.id,
@@ -660,11 +662,11 @@ export class NotifyService implements PartyNotifier {
       },
       message: (guildId, reasons) => {
         // The post as it is when the first message is made, for all of them.
-        embed ??= { made: this.embedOf(posts, party) };
+        brief ??= { made: this.briefOf(posts, party) };
         const region = party.regionId === null ? undefined : regions.byId(party.regionId);
         const boss = shownBoss(party, gameData.catalogue, raidBosses.bosses())?.name;
         const gym = gymName(gymId === null ? undefined : gyms.get(gymId));
-        const link = postLink(guildId, forumPostId);
+        const map = brief.made?.map;
         // Who is signed up is told what became of their egg, whatever else fires for them.
         const theirs = boss !== undefined && reasons.some((reason) => reason.kind === 'boss-set');
         const sentence = theirs
@@ -674,7 +676,6 @@ export class NotifyService implements PartyNotifier {
               regionChannelId: region?.channelId,
               hatched: raidStage(party, eventAt) !== 'egg',
               corrected: include.corrected,
-              link,
             })
           : raidDmSentence({
               event,
@@ -684,12 +685,17 @@ export class NotifyService implements PartyNotifier {
               gym,
               regionChannelId: region?.channelId,
               reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
-              link,
             });
         return notifyDm(
-          sentence,
+          {
+            sentence,
+            brief: brief.made,
+            links: [
+              postButton(postLink(guildId, forumPostId)),
+              ...(map === undefined ? [] : [mapLink(map)]),
+            ],
+          },
           reasons.map((reason) => this.shown(guildId, reason)),
-          embed.made,
         );
       },
       priority: (reasons) =>
@@ -699,9 +705,9 @@ export class NotifyService implements PartyNotifier {
     });
   }
 
-  private embedOf(posts: NotifyServiceOptions['posts'], party: Party): APIEmbed | undefined {
+  private briefOf(posts: NotifyServiceOptions['posts'], party: Party): PartyBrief | undefined {
     try {
-      return posts.embedOf(party);
+      return posts.briefOf(party);
     } catch (err) {
       this.options.log.warn({ err, party: party.id }, 'could not show a party in a direct message');
       return undefined;
@@ -813,7 +819,7 @@ export class NotifyService implements PartyNotifier {
     if (guildId === undefined) return;
     const { ids, reasonsOf } = await event.gather(guildId);
     /** The message per set of reasons; null for a set whose message could not be made. */
-    const messages = new Map<string, ClassicMessage | null>();
+    const messages = new Map<string, OutgoingMessage | null>();
     let told = 0;
     for (let start = 0; start < ids.length; start += BATCH) {
       // The party ended meanwhile: nobody else is told, and nothing more is remembered.
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index d0a05fe5b637a33e1181ef057fc706d7426a1367..89e938aeadf3ae6a931b56db1c496c12a72ecf24 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -1,4 +1,4 @@
-import { DiscordAPIError, type APIEmbed } from 'discord.js';
+import { DiscordAPIError } from 'discord.js';
 import type { Settings } from '../config/settings.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -47,6 +47,7 @@ import {
   FORUM_TAGS,
   postMessage,
   tidyTitle,
+  type PartyBrief,
   type PostEmoji,
   type PostVariant,
   type RenderedPost,
@@ -361,18 +362,18 @@ export class PartyService {
 
   /**
    * Has `notifier` told of what members may want a direct message about. Set once, at start:
-   * the notifier shows a party as this service does (`embedOf`), so it is made after it.
+   * the notifier shows a party as this service does (`briefOf`), so it is made after it.
    */
   announceTo(notifier: PartyNotifier): void {
     this.notifier = notifier;
   }
 
   /**
-   * The party as a direct message shows it (the card of its post, an embed), as it is now, for
-   * whoever shows the party elsewhere.
+   * The party as a direct message shows it (the brief of its post: a few of its lines, its
+   * colour and picture), as it is now, for whoever shows the party elsewhere.
    */
-  embedOf(party: Party): APIEmbed {
-    return this.rendered(party).card;
+  briefOf(party: Party): PartyBrief {
+    return this.rendered(party).brief;
   }
 
   /** The durations in effect, with the events known at this moment. */
diff --git a/src/services/spawn-service.test.ts b/src/services/spawn-service.test.ts
index 5c76f1fa061bd83b4dc21449955593f05cadac15..0aaba0b2348bcdd2fac8a80cb6ae7297b3baf3d9 100644
--- a/src/services/spawn-service.test.ts
+++ b/src/services/spawn-service.test.ts
@@ -5,12 +5,12 @@ import { WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
-import { postLink } from '../render/notify-dm.js';
 import {
   sightingMessage,
   SPAWN_FOOTER,
   SPAWN_MINUTES,
   SPAWN_WARNING,
+  spawnBrief,
   spawnEmbed,
   spawnFooter,
   spawnMessage,
@@ -368,13 +368,9 @@ describe('the messages of a spawn report', () => {
       `A wild **Dratini** has been reported by **Alice** (<@${ALICE}>):`,
     );
     expect(spawnMessage(view, SPAWN_FOOTER).embeds?.[0]?.footer).toEqual({ text: SPAWN_FOOTER });
+    // A direct message leads to the report by its button: the sentence has no address.
     expect(spawnSentence({ ...view, iv: 'zero' }, WEST_CHANNEL)).toBe(
-      `A wild **Dratini** with 0% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**:`,
-    );
-    // A direct message ends with the address of the report instead.
-    const link = postLink('412345678901234567', WEST_CHANNEL, '900000000000000001');
-    expect(spawnSentence({ ...view, iv: 'perfect' }, WEST_CHANNEL, link)).toBe(
-      `A wild **Dratini** with 100% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**: ${link}`,
+      `A wild **Dratini** with 0% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
     );
     expect(sightingMessage(view, WEST_CHANNEL).embeds?.[0]?.footer).toBeUndefined();
   });
@@ -387,7 +383,6 @@ describe('the messages of a spawn report', () => {
     };
     const details =
       'free coins https:\u200B//evil.\u200Bexample/a\\_b www.\u200Bevil.example discord.\u200Bgg/abc';
-    const link = postLink('412345678901234567', WEST_CHANNEL, '900000000000000001');
     const texts = [
       spawnEmbed(typed).description,
       spawnMessage(typed, SPAWN_FOOTER).content,
@@ -395,8 +390,9 @@ describe('the messages of a spawn report', () => {
       spawnTextMessage(typed, SPAWN_FOOTER).content,
       sightingMessage(typed, WEST_CHANNEL).content,
       sightingMessage(typed, WEST_CHANNEL).embeds?.[0]?.description,
-      // The direct message: its one address is that of the report.
-      spawnSentence(typed, WEST_CHANNEL, link).replace(link, ''),
+      // The direct message: the sentence and the brief.
+      spawnSentence(typed, WEST_CHANNEL),
+      ...spawnBrief(typed, 0).lines,
     ];
     for (const text of texts) {
       expect(text).not.toContain('://');
@@ -409,7 +405,7 @@ describe('the messages of a spawn report', () => {
       `A wild **Dratini** has been reported by **discord.\u200Bgg/xyz** (<@${ALICE}>):`,
     );
     expect(spawnSentence(typed, WEST_CHANNEL)).toBe(
-      `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **discord.\u200Bgg/xyz**:`,
+      `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **discord.\u200Bgg/xyz**.`,
     );
   });
 
diff --git a/test/support/dms.ts b/test/support/dms.ts
index 1d8f69f20a210b240171126e5ded2a0ed6738f93..813ec2e83a0139e24b28027a0b3a85e3c9078c2c 100644
--- a/test/support/dms.ts
+++ b/test/support/dms.ts
@@ -8,6 +8,17 @@ import type {
 } from '../../src/services/dm-sender.js';
 import { FakePartyGateway } from './fake-gateway.js';
 
+/**
+ * Throws for a direct message Discord would refuse (`FakePartyGateway.checkMessage`) and for one
+ * that names somebody to ping: nothing sent as a DM should try.
+ */
+export function checkDm(message: OutgoingMessage): void {
+  FakePartyGateway.checkMessage(message);
+  if (message.mention?.users?.length || message.mention?.roles?.length) {
+    throw new Error('A direct message pings nobody');
+  }
+}
+
 /**
  * A `DmGateway` kept in memory. `sent` holds what went out, in order; a member of `closed`
  * takes no direct messages; a member of `slow` gets `slow-down`; `failing` makes every send
@@ -51,10 +62,7 @@ export class FakeDmGateway implements DmGateway {
         this.running -= 1;
         try {
           if (this.failing) throw this.failing;
-          FakePartyGateway.checkMessage(message);
-          if (message.mention?.users?.length || message.mention?.roles?.length) {
-            throw new Error('A direct message pings nobody');
-          }
+          checkDm(message);
           if (this.slow.has(userId)) {
             resolve('slow-down');
             return;
@@ -80,11 +88,15 @@ export class FakeDmGateway implements DmGateway {
   }
 }
 
-/** A `DmSender` that only keeps what was put in line, for tests of what puts it there. */
+/**
+ * A `DmSender` that only keeps what was put in line, for tests of what puts it there. Every
+ * message is held to what Discord takes of a DM (`checkDm`) as it is put in line.
+ */
 export class RecordingDms implements DmSender {
   readonly jobs: DmJob[] = [];
 
   send(job: DmJob): void {
+    checkDm(job.message);
     this.jobs.push(job);
   }
 
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index df793f3b857c88ca5aa101d5962b1839b2594bc3..8f09288c81f350f35b5aad44f28e6616526c3065 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -1,5 +1,13 @@
-import { Collection, MessageFlags, PermissionsBitField, type APIEmbed } from 'discord.js';
+import {
+  Collection,
+  MessageFlags,
+  MessageFlagsBitField,
+  PermissionsBitField,
+  type APIEmbed,
+} from 'discord.js';
 import { vi } from 'vitest';
+import type { V2Message } from '../../src/discord/party-gateway.js';
+import { FakePartyGateway } from './fake-gateway.js';
 
 /** What a test may want to read back from a reply, follow-up or edit. */
 export interface SentPayload {
@@ -192,6 +200,41 @@ function fakeChannel(o: FakeOptions, id: string) {
   };
 }
 
+/**
+ * Refuses a payload Discord would refuse for its components v2: one with the flag is checked as
+ * the fake gateway checks a v2 message (no content or embeds beside it, 40 components, the text,
+ * sections with an accessory, unique custom ids), and components that are no rows of controls
+ * (a container) without the flag are refused.
+ */
+function checkComponents(payload: SentPayload | undefined): void {
+  if (!payload) return;
+  if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) !== 0) {
+    const message = {
+      v2: true,
+      components: payload.components ?? [],
+      ...('content' in payload ? { content: payload.content } : {}),
+      ...('embeds' in payload ? { embeds: payload.embeds } : {}),
+    } as unknown as V2Message;
+    FakePartyGateway.checkMessage(message);
+    return;
+  }
+  const v2Only = (payload.components ?? []).some((component) => {
+    const type = (component as { type?: unknown }).type;
+    return typeof type === 'number' && type !== 1;
+  });
+  if (v2Only) throw new Error('Components other than rows need the IsComponentsV2 flag');
+}
+
+/** `checkComponents` as discord.js answers: a rejection. */
+function refuseInvalid(payload: SentPayload | undefined): Promise<never> | undefined {
+  try {
+    checkComponents(payload);
+    return undefined;
+  } catch (err) {
+    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
+  }
+}
+
 /**
  * Just enough of a discord.js interaction for router, guard, command and component tests.
  * It keeps `deferred`, `replied` and `ephemeral` the way discord.js does. Cast to the concrete
@@ -239,6 +282,10 @@ function base(kind: Kind, o: FakeOptions) {
     content: shown.content,
     attachments: shown.files ?? [],
     components: shown.rows.map((row) => ({ type: row.type, toJSON: () => row })),
+    // As Discord sets it: a message whose components are more than rows is components v2.
+    flags: new MessageFlagsBitField(
+      shown.rows.some((row) => row.type !== 1) ? MessageFlags.IsComponentsV2 : 0,
+    ).freeze(),
   });
   /** Whether the interaction was acknowledged with `deferUpdate`. */
   let updating = false;
@@ -350,6 +397,8 @@ function base(kind: Kind, o: FakeOptions) {
     reply: vi.fn((payload: SentPayload) => {
       const refused = refuseIfAcknowledged();
       if (refused) return refused;
+      const invalid = refuseInvalid(payload);
+      if (invalid) return invalid;
       interaction.replied = true;
       interaction.ephemeral = isEphemeral(payload);
       return Promise.resolve();
@@ -364,6 +413,8 @@ function base(kind: Kind, o: FakeOptions) {
     editReply: vi.fn((payload: SentPayload) => {
       const refused = refuseIfFresh();
       if (refused) return refused;
+      const invalid = refuseInvalid(payload);
+      if (invalid) return invalid;
       interaction.replied = true;
       // After `deferUpdate` the reply is the message the control is on.
       if (updating && payload.content !== undefined) shown.content = payload.content;
@@ -388,9 +439,11 @@ function base(kind: Kind, o: FakeOptions) {
       if (refused) return refused;
       return Promise.resolve();
     }),
-    followUp: vi.fn((_payload: SentPayload) => {
+    followUp: vi.fn((payload: SentPayload) => {
       const refused = refuseIfFresh();
       if (refused) return refused;
+      const invalid = refuseInvalid(payload);
+      if (invalid) return invalid;
       interaction.replied = true;
       return Promise.resolve();
     }),
@@ -405,6 +458,8 @@ function base(kind: Kind, o: FakeOptions) {
     update: vi.fn((payload: SentPayload) => {
       const refused = refuseIfAcknowledged();
       if (refused) return refused;
+      const invalid = refuseInvalid(payload);
+      if (invalid) return invalid;
       interaction.replied = true;
       editFiles(payload);
       return Promise.resolve();
diff --git a/test/support/messages.ts b/test/support/messages.ts
index 2740829be1f3613fda5b2cbfeb46f6349d7a91f3..5c9e44c84ccd419b5e06a16b08d0f86382a435eb 100644
--- a/test/support/messages.ts
+++ b/test/support/messages.ts
@@ -148,3 +148,52 @@ export function copiedPost(message: OutgoingMessage | undefined): string[] {
 export function header(message: OutgoingMessage | undefined): string[] {
   return textDisplays(message)[0]?.split('\n') ?? [];
 }
+
+/** The line under which a direct message of the notifier lists its reasons. */
+const REASONS_HEADING = '-# You asked to be told about';
+
+/**
+ * The news of a direct message: the first line of its first text (a v2 message of the notifier),
+ * or of its content (a classic one: the meeting-time DM).
+ */
+export function dmSentence(message: OutgoingMessage | undefined): string {
+  if (message?.v2) return textDisplays(message)[0]?.split('\n')[0] ?? '';
+  return (classic(message).content ?? '').split('\n')[0] ?? '';
+}
+
+/** The lines under the news of a v2 direct message: the brief of its party or spawn. */
+export function dmBrief(message: OutgoingMessage | undefined): string[] {
+  return textDisplays(message)[0]?.split('\n').slice(1) ?? [];
+}
+
+/**
+ * The reasons a v2 direct message names under `-# You asked to be told about`, each by its label,
+ * in order: those with a button, then those listed without (the hint line left out).
+ */
+export function dmReasons(message: OutgoingMessage | undefined): string[] {
+  const texts = textDisplays(message);
+  const at = texts.indexOf(REASONS_HEADING);
+  if (at < 0) return [];
+  return texts
+    .slice(at + 1)
+    .flatMap((text) => text.split('\n'))
+    .filter((line) => !line.startsWith('-# '));
+}
+
+/** The link buttons of a message, as `label url`. */
+export function linksOf(message: OutgoingMessage | undefined): string[] {
+  return buttonsOf(message).flatMap((button) =>
+    button.url === undefined ? [] : [`${button.label ?? ''} ${button.url}`],
+  );
+}
+
+/**
+ * A direct message as tests compare it, one line each: a classic one (the meeting time) by the
+ * lines of its content; one of the notifier by its news and, when it has any, its reasons joined
+ * by ` · `.
+ */
+export function dmSummary(message: OutgoingMessage | undefined): string[] {
+  if (!message?.v2) return (classic(message).content ?? '').split('\n');
+  const reasons = dmReasons(message);
+  return [dmSentence(message), ...(reasons.length === 0 ? [] : [reasons.join(' · ')])];
+}
diff --git a/test/support/post-limits.ts b/test/support/post-limits.ts
index 765e85a4a16f10a30154a5238f25a23f31feaf22..3b2e1ee920f05550bdca38b231920380553779dc 100644
--- a/test/support/post-limits.ts
+++ b/test/support/post-limits.ts
@@ -1,4 +1,5 @@
 import { expect } from 'vitest';
+import type { V2Message } from '../../src/discord/party-gateway.js';
 import type { MirrorKind } from '../../src/domain/party/party.js';
 import { renderMirror } from '../../src/render/mirrors.js';
 import {
@@ -32,3 +33,13 @@ export function expectSendable(rendered: RenderedPost): void {
     FakePartyGateway.checkMessage(message);
   }
 }
+
+/**
+ * Asserts that Discord would take a components-v2 message that is no post (a direct message, a
+ * private list, a summary): the fake gateway's checks (the text displays within `TEXT_BUDGET`)
+ * and at most 40 components.
+ */
+export function expectV2Sendable(message: V2Message): void {
+  expect(componentCount(message)).toBeLessThanOrEqual(MAX_COMPONENTS);
+  FakePartyGateway.checkMessage(message, TEXT_BUDGET);
+}
````

### Task 3: Lists of wants and gyms as components-v2 messages with pages and Remove

Prototype commit: `72bc4fb307ed43c13e4a5f13c1f14fc29c2634b4`

/wants and /targets answer with one container: a heading and a count, ten
entries to a page, each a section with a red Remove beside it, Previous and
Next, "Remove all..." (the question of /unwant-all or /untarget-all, in a
new private answer) and a line on how to add one. The controls are the
kinds wantlist and targetlist with the page as id; Remove carries what to
remove as the stop buttons of a DM spell it. A press reads the list anew,
removes, and shows the page again with update. answer() takes a v2 payload
(v2Answer), and the fake interactions refuse a v2 payload Discord would.

**Files:**

```
 src/commands/notifications/list-controls.ts |  75 ++++++++++++++
 src/commands/notifications/remove-all.ts    |   6 +-
 src/commands/notifications/targets.test.ts  | 254 +++++++++++++++++++++++++++++++---------------
 src/commands/notifications/targets.ts       | 179 ++++++++++++++++++++-------------
 src/commands/notifications/wants.test.ts    | 260 ++++++++++++++++++++++++++++++------------------
 src/commands/notifications/wants.ts         | 167 ++++++++++++++++++++-----------
 src/components/index.ts                     |  10 +-
 src/discord/custom-id.ts                    |   8 ++
 src/discord/late-reply.test.ts              |  27 ++++-
 src/discord/late-reply.ts                   |  20 +++-
 src/render/member-list.test.ts              | 135 +++++++++++++++++++++++++
 src/render/member-list.ts                   | 161 ++++++++++++++++++++++++++++++
 src/render/v2.ts                            |   3 +
 test/support/fake-interactions.ts           |  11 ++
 14 files changed, 1002 insertions(+), 314 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/notifications/targets.test.ts src/commands/notifications/wants.test.ts src/discord/late-reply.test.ts src/render/member-list.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 72bc4fb307ed43c13e4a5f13c1f14fc29c2634b4 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `Lists of wants and gyms as components-v2 messages with pages and Remove`, the body above and the trailer, staging exactly
  `src/commands/notifications/list-controls.ts src/commands/notifications/remove-all.ts src/commands/notifications/targets.test.ts src/commands/notifications/targets.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/components/index.ts src/discord/custom-id.ts src/discord/late-reply.test.ts src/discord/late-reply.ts src/render/member-list.test.ts src/render/member-list.ts src/render/v2.ts test/support/fake-interactions.ts`.

````diff
diff --git a/src/commands/notifications/list-controls.ts b/src/commands/notifications/list-controls.ts
new file mode 100644
index 0000000000000000000000000000000000000000..16d0017428571c42a926e7d2f5ad426bda051c99
--- /dev/null
+++ b/src/commands/notifications/list-controls.ts
@@ -0,0 +1,75 @@
+import type { ButtonInteraction } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { requireGuild } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
+import { parseStopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
+import { LIST_ACTIONS } from '../../render/member-list.js';
+
+/** What the controls of a member's list (`renderMemberList`) need of the list they are under. */
+export interface MemberListSource {
+  /** The custom-id kind of the list's controls (`wantlist`, `targetlist`). */
+  kind: string;
+  /** The command that shows the list, as a member types it: `/wants`. */
+  command: string;
+  /** The member's list as it is now, at a page (from 0; one past the end shows the last). */
+  render(interaction: ButtonInteraction, ctx: AppContext, page: number): Promise<V2Message>;
+  /**
+   * Removes what a Remove button names, when it is the kind of thing this list holds; answers
+   * false for anything else (then nothing was removed). What is gone already is no error.
+   */
+  remove(interaction: ButtonInteraction, ctx: AppContext, reason: NotifyReason): Promise<boolean>;
+  /** "Remove all…": asks the question of `/unwant-all` (`/untarget-all`) in a new answer. */
+  askAll(interaction: ButtonInteraction, ctx: AppContext): Promise<void>;
+}
+
+/** The highest page a custom id may name: a list of a hundred thousand entries. */
+const MAX_PAGE = 9_999;
+
+/**
+ * The handler of a member's list: Previous and Next show the page before or after the one the
+ * message shows, Remove takes one entry off and shows the page again, "Remove all…" asks. The
+ * list is read anew for every press (the message is never trusted), and shown with `update`.
+ * The list is a private answer, so only its member can press its buttons; the server is the
+ * interaction's. One throttle for all of them: the router throttles a kind as one, and the
+ * throttles of reading and of writing a member's rows allow the same (30 a minute).
+ */
+export function memberListControls(source: MemberListSource): ComponentHandler {
+  const stale = `That list is out of date. Use \`${source.command}\` again.`;
+  return {
+    kind: source.kind,
+    guards: [requireGuild],
+    // Page turns and Removes share one window of 30 a minute: a member who wants many entries
+    // gone has "Remove all…" (or the `/unwant` and `/untarget` commands), not thirty presses.
+    throttle: MEMBER_WRITE_THROTTLE,
+    async button(interaction, id, ctx) {
+      const shown = /^\d{1,4}$/.test(id.id) ? Number(id.id) : undefined;
+      if (shown === undefined || shown > MAX_PAGE) throw new UserError(stale);
+      let page = shown;
+      switch (id.action) {
+        case LIST_ACTIONS.prev:
+          page = Math.max(0, shown - 1);
+          break;
+        case LIST_ACTIONS.next:
+          page = shown + 1;
+          break;
+        case LIST_ACTIONS.all:
+          await source.askAll(interaction, ctx);
+          return;
+        case LIST_ACTIONS.remove: {
+          const reason = parseStopArgs(id.args);
+          if (!reason || !(await source.remove(interaction, ctx, reason))) {
+            throw new UserError(stale);
+          }
+          break;
+        }
+        default:
+          throw new UserError(stale);
+      }
+      await interaction.update(v2Answer(await source.render(interaction, ctx, page)));
+    },
+  };
+}
diff --git a/src/commands/notifications/remove-all.ts b/src/commands/notifications/remove-all.ts
index 038c60eb25c182ab04ac898566d812763ac79f70..81deb1dd6b4a18279c5c358d51d0c008f38c097f 100644
--- a/src/commands/notifications/remove-all.ts
+++ b/src/commands/notifications/remove-all.ts
@@ -2,6 +2,7 @@ import {
   ActionRowBuilder,
   ButtonBuilder,
   ButtonStyle,
+  type ButtonInteraction,
   type ChatInputCommandInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
@@ -37,10 +38,11 @@ export interface RemoveAllOptions {
  * buttons, Remove all N and Keep them (Remove it and Keep it for one). The question is kept in a `PendingRequests` store as `/raid`
  * keeps its own (the token is the id of the custom id): only the member who asked can answer,
  * once, within ten minutes. Gives the command's `execute` (the interaction is deferred) and the
- * handler of the buttons.
+ * handler of the buttons. `ask` also answers "Remove all…" under a member's list (`/wants`,
+ * `/targets`): the question then comes as a new private answer, and the list stays as it was.
  */
 export function removeAllQuestion(options: RemoveAllOptions): {
-  ask(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
+  ask(interaction: ChatInputCommandInteraction | ButtonInteraction, ctx: AppContext): Promise<void>;
   controls: ComponentHandler;
 } {
   const pending = new PendingRequests<{ guildId: string }>();
diff --git a/src/commands/notifications/targets.test.ts b/src/commands/notifications/targets.test.ts
index 3cc5d9e728ef2373277beee12189f6bbfdab5205..c8e99dbfec5a66786b3c2e9b5ef9152c6eb7ef5f 100644
--- a/src/commands/notifications/targets.test.ts
+++ b/src/commands/notifications/targets.test.ts
@@ -7,23 +7,33 @@ import {
   fakeChatInput,
   fakeSelect,
   answered,
+  asV2,
   sent,
   type FakeInteraction,
+  type SentPayload,
 } from '../../../test/support/fake-interactions.js';
+import {
+  buttonsOf,
+  componentCount,
+  customIdsOf,
+  textDisplays,
+} from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { ALICE, BOB } from '../../../test/support/parties.js';
 import { createdMeetup, createdTrain, reportedRaid } from '../../../test/support/party-service.js';
 import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { InteractionRouter } from '../../discord/router.js';
-import { LIMITS } from '../../render/text.js';
+import { gymMapsUrl } from '../../render/raid-post.js';
 import {
   ownTargetChoices,
   target,
   targetControls,
+  targetListControls,
   targetRemovalControls,
   targets,
-  targetsEmbed,
+  targetsList,
   untarget,
   untargetAll,
 } from './targets.js';
@@ -40,7 +50,7 @@ function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
   const router = new InteractionRouter(
     ctx,
     [target, untarget, targets, untargetAll],
-    [targetControls, targetRemovalControls],
+    [targetControls, targetRemovalControls, targetListControls],
   );
   const run = async (
     commandName: string,
@@ -245,8 +255,8 @@ describe('/target', () => {
       [{ name: 'Pinewood Public Library · The Stacks', value: 'g:1' }],
     );
     const listed = await made.run('targets', {}, { guildChannelNames: {} });
-    expect(answered(listed).embeds?.[0]?.toJSON().description).toContain(
-      `<#${WEST_CHANNEL}> (1)\nThe Stacks`,
+    expect(textDisplays(asV2(answered(listed)))[1]).toBe(
+      `[The Stacks](<${gymMapsUrl({ lat: 40.05, lon: -80.05 })}>) · <#${WEST_CHANNEL}>`,
     );
   });
 
@@ -454,62 +464,166 @@ describe('/untarget', () => {
 });
 
 describe('/targets', () => {
-  it('points to /target when the member has none', async () => {
+  /** What `/targets` answered (or a press of its buttons showed), as a v2 message. */
+  const shown = (payload: SentPayload) => asV2(payload);
+  const link = (
+    ctx: { gyms: { get(id: number): { lat: number; lon: number } | undefined } },
+    id: number,
+    name: string,
+  ) => {
+    const gym = ctx.gyms.get(id);
+    if (!gym) throw new Error(`no gym ${String(id)}`);
+    return `[${name}](<${gymMapsUrl(gym)}>)`;
+  };
+
+  it('says how to add one when the member has none, without buttons', async () => {
     const made = setup();
-    expect(await made.answer('targets')).toBe(
-      'You have no gyms in this server. `/target` makes a gym one of yours, and I send you a ' +
-        'DM when a raid is reported there.',
-    );
+    const message = shown(answered(await made.run('targets')));
+    expect(textDisplays(message)).toEqual([
+      '### Gyms you want raids of\nYou want raids of no gym yet. `/target` adds one.',
+    ]);
+    expect(buttonsOf(message)).toEqual([]);
+    expectV2Sendable(message);
   });
 
-  it('lists the gyms by region, the regions and the gyms by name', async () => {
+  it('lists the gyms by region, the regions and the gyms by name, each with Remove', async () => {
     const made = setup();
     for (const gym of ['2', '8', '1', '7', '3']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
     made.store.addRow(ALICE, OTHER_GUILD, '4');
     const used = await made.run('targets');
-    const embed = answered(used).embeds?.[0]?.toJSON();
-    expect(embed?.title).toBe('Your gyms in this server');
-    expect(embed?.description).toBe(
-      [
-        `<#${EAST_CHANNEL}> (2)\nCafé Élan Fresco, Harbor Lighthouse Mural`,
-        `<#${WEST_CHANNEL}> (3)\nOld Stone Fountain, St. Mary's Church, The Stacks`,
-        '`/target` adds a gym, `/untarget` takes one off.',
-      ].join('\n\n'),
-    );
+    expect(answered(used).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    const message = shown(answered(used));
+    expect(textDisplays(message)).toEqual([
+      '### Gyms you want raids of\n5 gyms',
+      `${link(made.ctx, 8, 'Café Élan Fresco')} · <#${EAST_CHANNEL}>`,
+      `${link(made.ctx, 7, 'Harbor Lighthouse Mural')} · <#${EAST_CHANNEL}>`,
+      `${link(made.ctx, 2, 'Old Stone Fountain')} · <#${WEST_CHANNEL}>`,
+      `${link(made.ctx, 3, "St. Mary's Church")} · <#${WEST_CHANNEL}>`,
+      `${link(made.ctx, 1, 'The Stacks')} · <#${WEST_CHANNEL}>`,
+      '-# `/target` adds one.',
+    ]);
+    expect(customIdsOf(message)).toEqual([
+      'targetlist:0:remove:g:8',
+      'targetlist:0:remove:g:7',
+      'targetlist:0:remove:g:2',
+      'targetlist:0:remove:g:3',
+      'targetlist:0:remove:g:1',
+      'targetlist:0:all',
+    ]);
   });
 
-  it('puts a gym outside the regions of this server under Elsewhere, and counts what it cannot read', async () => {
+  it('puts a gym outside the regions of this server last, marks an elite raid gym, and counts what it cannot read', () => {
     const made = setup();
-    for (const gym of ['1', '10', '999', 'nowhere', null]) {
-      made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
-    }
-    const used = await made.run('targets');
-    expect(answered(used).embeds?.[0]?.toJSON().description).toBe(
-      [
-        `<#${WEST_CHANNEL}> (1)\nThe Stacks`,
-        'Elsewhere (1)\nLakeview Trailhead',
-        '`/target` adds a gym, `/untarget` takes one off.',
+    const base = made.ctx.gyms.get(3);
+    if (!base) throw new Error('no gym 3');
+    const elite = { ...base, confirmedEx: true };
+    const ctx = {
+      ...made.ctx,
+      gyms: Object.assign(Object.create(made.ctx.gyms) as typeof made.ctx.gyms, {
+        get: (id: number) => (id === 3 ? elite : made.ctx.gyms.get(id)),
+      }),
+    };
+    const message = targetsList(
+      ctx,
+      { gymIds: [1, 10, 3, 999], unreadable: 2 },
+      { guildRow: 1, nameOf: (id) => SERVER[id as keyof typeof SERVER] },
+      0,
+    );
+    expect(textDisplays(message)).toEqual([
+      '### Gyms you want raids of\n3 gyms\n' +
         '…and 3 entries this version cannot read (a gym that no longer exists, say); ' +
-          '`/untarget-all` removes those too.',
-      ].join('\n\n'),
+        '`/untarget-all` removes those too.',
+      `${link(made.ctx, 3, "St. Mary's Church")} · <#${WEST_CHANNEL}> · elite raid gym`,
+      `${link(made.ctx, 1, 'The Stacks')} · <#${WEST_CHANNEL}>`,
+      `${link(made.ctx, 10, 'Lakeview Trailhead')} · in no region of this server`,
+      '-# `/target` adds one.',
+    ]);
+  });
+
+  it('removes a gym on Remove and shows the list again, also when it was gone already', async () => {
+    const made = setup();
+    for (const gym of ['1', '2', '3']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
+    const listed = shown(answered(await made.run('targets')));
+    const remove = customIdsOf(listed)[1] ?? '';
+    expect(remove).toBe('targetlist:0:remove:g:3');
+    const press = () =>
+      made.handle(fakeButton({ customId: remove, userId: ALICE, guildChannelNames: SERVER }));
+    const pressed = await press();
+    expect(made.gymsOf()).toEqual(['1', '2']);
+    const after = shown(sent(pressed.update));
+    expect(textDisplays(after)[0]).toBe('### Gyms you want raids of\n2 gyms');
+    expect(customIdsOf(after)).not.toContain(remove);
+    // A second press of the same button (an old message) removes nothing and is no error.
+    const again = await press();
+    expect(textDisplays(shown(sent(again.update)))[0]).toBe('### Gyms you want raids of\n2 gyms');
+    expect(made.gymsOf()).toEqual(['1', '2']);
+  });
+
+  it('turns the pages, and shows the last page when the one shown is past the end', async () => {
+    const made = setup();
+    for (let n = 0; n < 12; n++) made.store.addRow(ALICE, FAKE_GUILD_ID, String((n % 12) + 1));
+    const first = shown(answered(await made.run('targets')));
+    expect(textDisplays(first)[0]).toBe('### Gyms you want raids of\n12 gyms · page 1 of 2');
+    const next = await made.handle(
+      fakeButton({ customId: 'targetlist:0:next', userId: ALICE, guildChannelNames: SERVER }),
+    );
+    const second = shown(sent(next.update));
+    expect(textDisplays(second)[0]).toBe('### Gyms you want raids of\n12 gyms · page 2 of 2');
+    expect(textDisplays(second)).toHaveLength(1 + 2 + 1);
+    // Remove on the second page of a list that then fits one page shows that page.
+    const remove = customIdsOf(second).find((id) => id.includes(':remove:')) ?? '';
+    made.store.rows.splice(0, 1);
+    const removed = await made.handle(
+      fakeButton({ customId: remove, userId: ALICE, guildChannelNames: SERVER }),
+    );
+    expect(textDisplays(shown(sent(removed.update)))[0]).toBe(
+      '### Gyms you want raids of\n10 gyms',
+    );
+    const back = await made.handle(
+      fakeButton({ customId: 'targetlist:1:prev', userId: ALICE, guildChannelNames: SERVER }),
+    );
+    expect(customIdsOf(shown(sent(back.update)))[0]).toMatch(/^targetlist:0:remove:/);
+  });
+
+  it('asks the question of /untarget-all on Remove all…, in a new private answer', async () => {
+    const made = setup();
+    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
+    const pressed = await made.handle(
+      fakeButton({ customId: 'targetlist:0:all', userId: ALICE, guildChannelNames: SERVER }),
     );
+    expect(pressed.update).not.toHaveBeenCalled();
+    expect(answered(pressed).content).toMatch(/^Remove your one gym in this server\?/);
+    expect(answered(pressed).flags).toBe(MessageFlags.Ephemeral);
+    expect(made.gymsOf()).toEqual(['1']);
   });
 
-  it('stays within the limits of an embed whatever the number of rows', () => {
+  it('refuses a button it cannot read', async () => {
+    const made = setup();
+    for (const customId of [
+      'targetlist:0:remove:p:150',
+      'targetlist:x:next',
+      'targetlist:0:what',
+    ]) {
+      const pressed = await made.handle(
+        fakeButton({ customId, userId: ALICE, guildChannelNames: SERVER }),
+      );
+      expect(sent(pressed.reply).content).toBe('That list is out of date. Use `/targets` again.');
+    }
+  });
+
+  it('keeps a full page of long names within the components and the text Discord takes', () => {
     const { ctx } = createTestContext();
     const base = ctx.gyms.get(1);
     if (!base) throw new Error('no gym 1');
-    const regions = Array.from({ length: 40 }, (_unused, index) =>
-      String(900000000000000000n + BigInt(index)),
-    );
     const gyms = new Map(
-      Array.from({ length: 2_000 }, (_unused, index) => [
+      Array.from({ length: 25 }, (_unused, index) => [
         index + 1,
         {
           ...base,
           id: index + 1,
           nickname: null,
-          name: `A gym with quite a long name ${String(index)}`,
+          confirmedEx: true,
+          name: '[*_~`|>'.repeat(35) + String(index),
         },
       ]),
     );
@@ -517,56 +631,34 @@ describe('/targets', () => {
     if (!west) throw new Error('no region');
     const wide = {
       ...ctx,
-      gyms: {
-        ...ctx.gyms,
-        get: (id: number) => gyms.get(id),
-        regionsOf: (id: number) => [regions[id % regions.length] ?? ''],
-      },
+      gyms: { ...ctx.gyms, get: (id: number) => gyms.get(id), regionsOf: () => [WEST_CHANNEL] },
       regions: {
         ...ctx.regions,
         byChannel: (channelId: string) => ({ ...west, channelId, guildId: 1 }),
       },
     };
-    const embed = targetsEmbed(
-      wide,
-      { gymIds: [...gyms.keys()], unreadable: 2 },
-      { guildRow: 1, nameOf: (id) => `region-${id.slice(-2)}` },
-    ).toJSON();
-    const description = embed.description ?? '';
-    expect(description.length).toBeLessThanOrEqual(LIMITS.embedDescription);
-    expect(description).toContain('(50)\n');
-    expect(description).toMatch(/…and \d+ more/);
-    // Forty regions do not fit: the cut says that regions were left out, and how many.
-    expect(description).toMatch(/\n\n…and \d+ more regions\n\n/);
-    expect(description).toContain('…and 2 entries this version cannot read');
-    const few = targetsEmbed(
-      wide,
-      { gymIds: [...gyms.keys()].slice(0, 40), unreadable: 0 },
-      { guildRow: 1, nameOf: (id) => id },
-    ).toJSON();
-    expect((few.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
-    // A server the regions do not belong to has all of them elsewhere.
-    const foreign = targetsEmbed(
+    for (const page of [0, 1, 2]) {
+      const message = targetsList(
+        wide,
+        { gymIds: [...gyms.keys()], unreadable: 12_345 },
+        { guildRow: 1, nameOf: () => 'west' },
+        page,
+      );
+      expect(componentCount(message)).toBeLessThanOrEqual(40);
+      expectV2Sendable(message);
+    }
+    const full = targetsList(
       wide,
-      { gymIds: [1, 2], unreadable: 0 },
-      { guildRow: 2, nameOf: () => undefined },
-    ).toJSON();
-    expect(foreign.description).toMatch(/^Elsewhere \(2\)\n/);
-  });
-
-  it('cuts a long gym name in the list', () => {
-    const { ctx } = createTestContext();
-    const base = ctx.gyms.get(1);
-    if (!base) throw new Error('no gym 1');
-    const long = { ...base, nickname: null, name: 'Mural '.repeat(40).trim() };
-    const embed = targetsEmbed(
-      { ...ctx, gyms: { ...ctx.gyms, get: () => long, regionsOf: () => [WEST_CHANNEL] } },
-      { gymIds: [1], unreadable: 0 },
+      { gymIds: [...gyms.keys()], unreadable: 0 },
       { guildRow: 1, nameOf: () => 'west' },
-    ).toJSON();
-    const [, name = ''] = (embed.description ?? '').split('\n');
-    expect(name.length).toBeLessThanOrEqual(60);
-    expect(name.endsWith('…')).toBe(true);
+      0,
+    );
+    expect(
+      textDisplays(full)
+        .slice(1, -1)
+        .every((line) => line.includes('…](<')),
+    ).toBe(true);
+    expect(buttonsOf(full)).toHaveLength(10 + 3);
   });
 });
 
diff --git a/src/commands/notifications/targets.ts b/src/commands/notifications/targets.ts
index d741b9e0f80aaa9d392eaea7aa9b0c442b1c618d..6766e07fe94ed64140cbf6c94723cbe6bb3cddf6 100644
--- a/src/commands/notifications/targets.ts
+++ b/src/commands/notifications/targets.ts
@@ -1,8 +1,8 @@
 import {
   ActionRowBuilder,
-  EmbedBuilder,
   SlashCommandBuilder,
   StringSelectMenuBuilder,
+  type ButtonInteraction,
   type ChatInputCommandInteraction,
   type StringSelectMenuInteraction,
 } from 'discord.js';
@@ -15,15 +15,21 @@ import { UserError } from '../../discord/errors.js';
 import { guildIdOf, partyOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { isRaid, isTrain, partyWord } from '../../domain/party/party.js';
 import { currentStop } from '../../domain/party/train.js';
-import { gymMapsUrl } from '../../render/raid-post.js';
-import { count, fitItems, LIMITS, plain, truncate } from '../../render/text.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { stopArgs } from '../../domain/notify/reasons.js';
+import { isEliteGym } from '../../domain/party/raid.js';
+import { renderMemberList } from '../../render/member-list.js';
+import { gymMapsUrl, gymName } from '../../render/raid-post.js';
+import { stopLink } from '../../render/train-post.js';
+import { count, plain, truncate } from '../../render/text.js';
+import { memberListControls } from './list-controls.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import { gymInGuild, gymRegionsInGuild } from '../../services/region-directory.js';
 import { beginningFirst, byName, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 import { gymChoices, reportedGym } from '../raids/raid-input.js';
 import { removeAllQuestion } from './remove-all.js';
 import { NOTIFICATION_THROTTLE, notificationsEnabled } from './shared.js';
-import { answer } from '../../discord/late-reply.js';
+import { answer, v2Answer } from '../../discord/late-reply.js';
 
 /** The custom-id kind of the gym menu of `/target` and `/untarget`. */
 const MENU_KIND = 'target';
@@ -371,31 +377,42 @@ export const targetControls: ComponentHandler = {
   },
 };
 
-/** Room for the regions of the list in the embed's description, below the notes. */
-const LIST_ROOM = LIMITS.embedDescription - 400;
-/** As much of a gym's name as the list shows. */
-const LISTED_NAME = 60;
-
-/** As many of the regions' blocks as fit into `limit`; when some do not, how many were left out. */
-function fitRegions(blocks: readonly string[], limit: number): string {
-  const all = blocks.join('\n\n');
-  if (all.length <= limit) return all;
-  for (let kept = blocks.length - 1; kept >= 0; kept--) {
-    const left = `…and ${count(blocks.length - kept, 'more region')}`;
-    const text = [...blocks.slice(0, kept), left].join('\n\n');
-    if (text.length <= limit) return text;
+/** The custom-id kind of the controls of `/targets` (`targets` is the question of `/untarget-all`). */
+export const TARGET_LIST_KIND = 'targetlist';
+
+/** What a gym's line shows beside its name: where it lies, and whether it is an elite raid gym. */
+interface ListedGym {
+  gym: Gym;
+  /** The channel of the region of this server it lies in (the first by name), if any. */
+  region: string | undefined;
+}
+
+/**
+ * A gym's line in the list: its name as a link to its place, the region it lies in, and
+ * `· elite raid gym`: `[The Stacks](<maps>) · <#region>`. Only the name is cut, before it is
+ * escaped, when the line would be longer than `room`.
+ */
+export function targetLine({ gym, region }: ListedGym, room: number): string {
+  const rest = [
+    ...(region === undefined ? ['in no region of this server'] : [`<#${region}>`]),
+    ...(isEliteGym(gym) ? ['elite raid gym'] : []),
+  ].join(' · ');
+  const line = (name: string) => `${stopLink({ ...gym, name, nickname: null })} · ${rest}`;
+  const name = gymName(gym);
+  let shown = line(name);
+  for (let keep = name.length - 1; shown.length > room && keep > 1; keep--) {
+    shown = line(truncate(name, keep));
   }
-  return '';
+  return shown;
 }
 
 /**
- * The member's gyms as an embed: by region of this server (the region's channel as a link,
- * the regions by name), the gyms of each by name; gyms that lie in no region of this server
- * any more under "Elsewhere". A region's gyms that do not fit are cut with a count, and so are
- * the regions, so the embed stays within Discord's limits whatever the number of rows; rows that
- * are no gym id or name no gym are counted.
+ * The member's gyms in a server as a components-v2 message (`renderMemberList`), at a page: by
+ * region of this server (the regions by the names of their channels), the gyms of each by name,
+ * and those that lie in no region of this server last; each with its Remove. Rows that are no
+ * gym id, or name a gym that no longer exists, are counted under the count.
  */
-export function targetsEmbed(
+export function targetsList(
   ctx: AppContext,
   list: GymTargetList,
   server: {
@@ -404,13 +421,12 @@ export function targetsEmbed(
     /** The name of a channel, for the order of the regions. */
     nameOf(channelId: string): string | undefined;
   },
-): EmbedBuilder {
+  page: number,
+): V2Message {
   const gyms = knownGyms(ctx, list.gymIds);
   const unreadable = list.unreadable + (list.gymIds.length - gyms.length);
-  const byRegion = new Map<string, string[]>();
-  const elsewhere: string[] = [];
-  for (const gym of gyms) {
-    const name = plain(truncate(gym.nickname || gym.name, LISTED_NAME));
+  const regionName = (channelId: string) => server.nameOf(channelId) ?? channelId;
+  const listed = gyms.map((gym): ListedGym => {
     // A gym on the border of two regions is listed under the first of them by name.
     const lying =
       server.guildRow === undefined
@@ -418,33 +434,52 @@ export function targetsEmbed(
         : gymRegionsInGuild(ctx.gyms, ctx.regions, gym.id, server.guildRow);
     const [region] = lying
       .map(({ channelId }) => channelId)
-      .sort((a, b) => byName(server.nameOf(a) ?? a, server.nameOf(b) ?? b));
-    if (region === undefined) elsewhere.push(name);
-    else byRegion.set(region, [...(byRegion.get(region) ?? []), name]);
-  }
-  const regions = [...byRegion.keys()].sort((a, b) =>
-    byName(server.nameOf(a) ?? a, server.nameOf(b) ?? b),
-  );
-  const blocks = regions.length + (elsewhere.length > 0 ? 1 : 0);
-  const room = Math.max(
-    100,
-    Math.min(LIMITS.fieldValue, Math.floor(LIST_ROOM / (blocks || 1)) - 60),
-  );
-  const block = (heading: string, names: string[]): string =>
-    `${heading} (${String(names.length)})\n${fitItems(names.sort(byName), room)}`;
-  const listed = [
-    ...regions.map((region) => block(`<#${region}>`, byRegion.get(region) ?? [])),
-    ...(elsewhere.length > 0 ? [block('Elsewhere', elsewhere)] : []),
-  ];
-  const notes = ['`/target` adds a gym, `/untarget` takes one off.'];
-  if (unreadable > 0) {
-    notes.push(
-      `…and ${count(unreadable, 'entry', 'entries')} this version cannot read (a gym that no ` +
-        'longer exists, say); `/untarget-all` removes those too.',
-    );
-  }
-  const parts = listed.length === 0 ? notes : [fitRegions(listed, LIST_ROOM), ...notes];
-  return new EmbedBuilder().setTitle('Your gyms in this server').setDescription(parts.join('\n\n'));
+      .sort((a, b) => byName(regionName(a), regionName(b)));
+    return { gym, region };
+  });
+  listed.sort((a, b) => {
+    if ((a.region === undefined) !== (b.region === undefined)) return a.region ? -1 : 1;
+    const byRegion =
+      a.region === undefined || b.region === undefined
+        ? 0
+        : byName(regionName(a.region), regionName(b.region));
+    return byRegion || byName(gymName(a.gym), gymName(b.gym));
+  });
+  return renderMemberList({
+    kind: TARGET_LIST_KIND,
+    heading: '### Gyms you want raids of',
+    noun: ['gym', 'gyms'],
+    items: listed.map((entry) => ({
+      line: (room: number) => targetLine(entry, room),
+      removeArgs: stopArgs({ kind: 'gym', gymId: entry.gym.id }),
+    })),
+    page,
+    notes:
+      unreadable > 0
+        ? [
+            `…and ${count(unreadable, 'entry', 'entries')} this version cannot read (a gym ` +
+              'that no longer exists, say); `/untarget-all` removes those too.',
+          ]
+        : [],
+    footer: '`/target` adds one.',
+    empty: 'You want raids of no gym yet. `/target` adds one.',
+    removeCommand: '/untarget',
+    removable: list.gymIds.length > 0 || list.unreadable > 0,
+  });
+}
+
+/** The gyms of the member of an interaction in its server, at a page. */
+async function memberTargets(
+  interaction: ChatInputCommandInteraction | ButtonInteraction,
+  ctx: AppContext,
+  page: number,
+): Promise<V2Message> {
+  const list = await ctx.gymTargets.list(interaction.user.id, guildIdOf(interaction));
+  const guildRow = await serverOf(interaction, ctx);
+  // The cache is asked for names only: which regions are this server's is said by their rows.
+  const nameOf = (channelId: string): string | undefined =>
+    interaction.guild?.channels.cache.get(channelId)?.name;
+  return targetsList(ctx, list, { guildRow, nameOf }, page);
 }
 
 /** `/targets` (spec 4.2): the member's gyms in this server, for the member alone. */
@@ -454,7 +489,9 @@ export const targets: SimpleCommand = {
     .setDescription('Show the gyms you get DMs for'),
   help: {
     category: 'notifications',
-    details: 'Shows your gyms in this server, by region.',
+    details:
+      'Shows your gyms in this server by region, ten to a page, each with a Remove button; ' +
+      '"Remove all…" asks before it removes them all.',
     examples: ['/targets'],
   },
   enabled: notificationsEnabled,
@@ -462,20 +499,7 @@ export const targets: SimpleCommand = {
   defer: 'late',
 
   async execute(interaction, ctx) {
-    const list = await ctx.gymTargets.list(interaction.user.id, guildIdOf(interaction));
-    if (list.gymIds.length === 0 && list.unreadable === 0) {
-      await answer(interaction, {
-        content:
-          'You have no gyms in this server. `/target` makes a gym one of yours, and I send ' +
-          'you a DM when a raid is reported there.',
-      });
-      return;
-    }
-    const guildRow = await serverOf(interaction, ctx);
-    // The cache is asked for names only: which regions are this server's is said by their rows.
-    const nameOf = (channelId: string): string | undefined =>
-      interaction.guild?.channels.cache.get(channelId)?.name;
-    await answer(interaction, { embeds: [targetsEmbed(ctx, list, { guildRow, nameOf })] });
+    await answer(interaction, v2Answer(await memberTargets(interaction, ctx, 0)));
   },
 };
 
@@ -513,3 +537,16 @@ export const untargetAll: SimpleCommand = {
 
 /** The two buttons of `/untarget-all`. */
 export const targetRemovalControls = allTargets.controls;
+
+/** The buttons of `/targets`: the pages, Remove, and "Remove all…". */
+export const targetListControls = memberListControls({
+  kind: TARGET_LIST_KIND,
+  command: '/targets',
+  render: (interaction, ctx, page) => memberTargets(interaction, ctx, page),
+  async remove(interaction, ctx, reason) {
+    if (reason.kind !== 'gym') return false;
+    await ctx.gymTargets.remove(interaction.user.id, guildIdOf(interaction), reason.gymId);
+    return true;
+  },
+  askAll: (interaction, ctx) => allTargets.ask(interaction, ctx),
+});
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index 3e8579c829849acf86e42a741176779241f72516..56ed7ec128b84484a92b91e00a3010af8821df24 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -8,7 +8,16 @@ import {
   sent,
   type FakeInteraction,
   answered,
+  asV2,
+  type SentPayload,
 } from '../../../test/support/fake-interactions.js';
+import {
+  buttonsOf,
+  componentCount,
+  customIdsOf,
+  textDisplays,
+} from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { ALICE, BOB } from '../../../test/support/parties.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryWants } from '../../../test/support/wants.js';
@@ -18,19 +27,31 @@ import {
   pokemonTarget,
   type Want,
 } from '../../domain/pogo/notification-target.js';
-import { LIMITS } from '../../render/text.js';
 import { bossIdsOf, type RaidBoss } from '../../domain/pogo/raid-bosses.js';
+import type { WantList } from '../../domain/pogo/wants.js';
 import { catalogueFixture } from '../../../test/support/game-data.js';
 import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
 import { wantChoices } from './want-input.js';
-import { unwant, unwantAll, want, wantControls, wants, wantsEmbed } from './wants.js';
+import {
+  unwant,
+  unwantAll,
+  want,
+  wantControls,
+  wantListControls,
+  wants,
+  wantsList,
+} from './wants.js';
 
 const OTHER_GUILD = '499999999999999999';
 
 function setup() {
   const store = new MemoryWants();
   const { ctx } = createTestContext({ wants: store });
-  const router = new InteractionRouter(ctx, [want, unwant, wants, unwantAll], [wantControls]);
+  const router = new InteractionRouter(
+    ctx,
+    [want, unwant, wants, unwantAll],
+    [wantControls, wantListControls],
+  );
   const run = async (
     commandName: string,
     options: Record<string, string> = {},
@@ -1203,18 +1224,20 @@ describe('/unwant', () => {
 });
 
 describe('/wants', () => {
-  const fieldsOf = (interaction: FakeInteraction) =>
-    answered(interaction).embeds?.[0]?.toJSON().fields ?? [];
+  /** The lines of the wants a `/wants` answer (or a press of its buttons) shows. */
+  const lines = (payload: SentPayload) => textDisplays(asV2(payload)).slice(1, -1);
 
-  it('points to /want when the list is empty', async () => {
+  it('says how to add one when the list is empty, without buttons', async () => {
     const made = setup();
-    expect(await made.answer('wants')).toBe(
-      'Your list for this server is empty. `/want` puts a Pokémon or a raid tier on it, ' +
-        'and I send you a DM when one is reported.',
-    );
+    const message = asV2(answered(await made.run('wants')));
+    expect(textDisplays(message)).toEqual([
+      '### Your wants in Test Server\nYou want nothing yet. `/want` adds one.',
+    ]);
+    expect(buttonsOf(message)).toEqual([]);
+    expectV2Sendable(message);
   });
 
-  it('groups the list by what is wanted, each group by name', async () => {
+  it('lists the Pokémon by what they are wanted for, each group by name, then tiers and IVs', async () => {
     const made = setup();
     for (const [pokemon, type] of [
       [150, 'both'],
@@ -1231,16 +1254,33 @@ describe('/wants', () => {
     }
     made.store.add(ALICE, OTHER_GUILD, 1, 'both');
     const used = await made.run('wants');
-    const embed = answered(used).embeds?.[0]?.toJSON();
-    expect(embed?.title).toBe('Your notifications in this server');
-    expect(embed?.description).toBe('`/want` adds to the list, `/unwant` takes one off.');
-    expect(fieldsOf(used)).toEqual([
-      { name: 'Raids and spawns (2)', value: 'Mewtwo (every form), Venusaur (every form)' },
-      { name: 'Raids (1)', value: 'Dratini' },
-      { name: 'Spawns (1)', value: 'Giratina (every form)' },
-      { name: 'Raid tiers (3)', value: 'T1, T5, Shadow T5' },
-      { name: 'Spawn IVs (2)', value: 'Perfect, Zero' },
+    expect(answered(used).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    const message = asV2(answered(used));
+    expect(textDisplays(message)[0]).toBe('### Your wants in Test Server\n9 wants');
+    expect(lines(answered(used))).toEqual([
+      '**Mewtwo** (every form) · raids and spawns',
+      '**Venusaur** (every form) · raids and spawns',
+      '**Dratini** · raids',
+      '**Giratina** (every form) · spawns',
+      '**T1 raids**',
+      '**T5 raids**',
+      '**Shadow T5 raids**',
+      '**Perfect IV spawns**',
+      '**Zero IV spawns**',
+    ]);
+    expect(customIdsOf(message)).toEqual([
+      'wantlist:0:remove:p:150',
+      'wantlist:0:remove:p:3',
+      'wantlist:0:remove:p:147',
+      'wantlist:0:remove:p:487',
+      'wantlist:0:remove:t:T1',
+      'wantlist:0:remove:t:T5',
+      'wantlist:0:remove:ts:T5',
+      'wantlist:0:remove:iv:perfect',
+      'wantlist:0:remove:iv:zero',
+      'wantlist:0:all',
     ]);
+    expect(textDisplays(message).at(-1)).toBe('-# `/want` adds one.');
   });
 
   it('lists a form by its name, and shadow raids as Shadow among the raids', async () => {
@@ -1256,55 +1296,106 @@ describe('/wants', () => {
     made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { form: 'giratina_sky' });
     made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { form: 'Origin Forme' });
     const used = await made.run('wants');
-    expect(fieldsOf(used)).toEqual([
-      {
-        name: 'Raids and spawns (3)',
-        value: 'Charizard (base form), Charizard (every form), Giratina (giratina\\_sky)',
-      },
-      {
-        // A mega is about raids whatever its row says.
-        name: 'Raids (5)',
-        value:
-          'Giratina (every form), Giratina (Origin Forme), Mega Charizard Y, Shadow Giratina, ' +
-          'Shadow Landorus (Therian Forme)',
-      },
-      { name: 'Spawns (1)', value: 'Alolan Rattata' },
+    expect(textDisplays(asV2(answered(used)))[0]).toBe(
+      '### Your wants in Test Server\n9 wants\n' +
+        '…and 1 entry this version cannot read; `/unwant-all` removes those too.',
+    );
+    expect(lines(answered(used))).toEqual([
+      '**Charizard** (base form) · raids and spawns',
+      '**Charizard** (every form) · raids and spawns',
+      '**Giratina** (giratina\\_sky) · raids and spawns',
+      // A mega is about raids whatever its row says.
+      '**Giratina** (every form) · raids',
+      '**Giratina** (Origin Forme) · raids',
+      '**Mega Charizard Y** · raids',
+      '**Shadow Giratina** · raids',
+      '**Shadow Landorus** (Therian Forme) · raids',
+      '**Alolan Rattata** · spawns',
     ]);
-    expect(answered(used).embeds?.[0]?.toJSON().description).toContain(
-      '…and 1 entry this version cannot read',
-    );
   });
 
-  it('says how many rows this version cannot read, and names an unknown species by its number', async () => {
+  it('shows what it cannot read, with Remove all, also when nothing else is left', async () => {
     const made = setup();
-    made.store.add(ALICE, FAKE_GUILD_ID, 99999, 'both');
     made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
-    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'sometimes');
-    const used = await made.run('wants');
-    expect(fieldsOf(used)).toEqual([{ name: 'Raids and spawns (1)', value: 'Pokémon #99999' }]);
-    expect(answered(used).embeds?.[0]?.toJSON().description).toBe(
-      '`/want` adds to the list, `/unwant` takes one off.\n' +
-        '…and 2 entries this version cannot read; `/unwant-all` removes those too.',
-    );
+    const message = asV2(answered(await made.run('wants')));
+    expect(textDisplays(message)).toEqual([
+      '### Your wants in Test Server\n0 wants\n' +
+        '…and 1 entry this version cannot read; `/unwant-all` removes those too.',
+      '-# `/want` adds one.',
+    ]);
+    expect(customIdsOf(message)).toEqual(['wantlist:0:all']);
   });
 
-  it('shows the list also when all of it is unreadable', async () => {
+  it('names an unknown species by its number', async () => {
     const made = setup();
-    made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
-    const used = await made.run('wants');
-    expect(fieldsOf(used)).toEqual([]);
-    expect(answered(used).embeds?.[0]?.toJSON().description).toContain(
-      '…and 1 entry this version cannot read',
+    made.store.add(ALICE, FAKE_GUILD_ID, 99999, 'both');
+    expect(lines(answered(await made.run('wants')))).toEqual([
+      '**Pokémon #99999** · raids and spawns',
+    ]);
+  });
+
+  it('removes a want on Remove and shows the list again at the same page', async () => {
+    const made = setup();
+    for (let dex = 1; dex <= 12; dex++) made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { shadow: true });
+    const first = asV2(answered(await made.run('wants')));
+    expect(textDisplays(first)[0]).toBe('### Your wants in Test Server\n13 wants · page 1 of 2');
+    const next = await made.handle(fakeButton({ customId: 'wantlist:0:next', userId: ALICE }));
+    const second = asV2(sent(next.update));
+    const remove = customIdsOf(second).find((id) => id.endsWith(':ps:487'));
+    expect(remove).toBe('wantlist:1:remove:ps:487');
+    const pressed = await made.handle(fakeButton({ customId: remove ?? '', userId: ALICE }));
+    expect(made.formRows().some(([, , , shadow]) => shadow === true)).toBe(false);
+    expect(textDisplays(asV2(sent(pressed.update)))[0]).toBe(
+      '### Your wants in Test Server\n12 wants · page 2 of 2',
+    );
+    // Somebody else's rows and other servers are untouched by a press.
+    made.store.add(BOB, FAKE_GUILD_ID, 1, 'both');
+    await made.handle(fakeButton({ customId: 'wantlist:0:remove:p:1', userId: ALICE }));
+    expect(made.rows(BOB)).toEqual([[1, 'both']]);
+    expect(made.rows()).toHaveLength(11);
+  });
+
+  it('shows the list again without error when Remove is pressed twice or the want is gone', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
+    made.store.add(ALICE, FAKE_GUILD_ID, 3, 'both');
+    const press = () =>
+      made.handle(fakeButton({ customId: 'wantlist:0:remove:p:150', userId: ALICE }));
+    const first = await press();
+    const second = await press();
+    for (const pressed of [first, second]) {
+      expect(pressed.reply).not.toHaveBeenCalled();
+      expect(textDisplays(asV2(sent(pressed.update)))[0]).toBe(
+        '### Your wants in Test Server\n1 want',
+      );
+    }
+    expect(made.rows()).toEqual([[3, 'both']]);
+  });
+
+  it('asks the question of /unwant-all on Remove all…, in a new private answer', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
+    const pressed = await made.handle(fakeButton({ customId: 'wantlist:0:all', userId: ALICE }));
+    expect(answered(pressed).content).toMatch(/^Remove the one entry of your list/);
+    expect(made.rows()).toHaveLength(1);
+  });
+
+  it('refuses a Remove that names no want', async () => {
+    const made = setup();
+    const pressed = await made.handle(
+      fakeButton({ customId: 'wantlist:0:remove:g:1', userId: ALICE }),
     );
+    expect(sent(pressed.reply).content).toBe('That list is out of date. Use `/wants` again.');
   });
 
-  it('stays within 6,000 characters with all five groups full', () => {
+  it('keeps every page of the longest list within the components and the text Discord takes', () => {
     const { ctx } = createTestContext();
     const dexes = ctx.gameData.catalogue.all
       .filter((entry) => entry.kind === 'species')
       .map((entry) => entry.dex);
     const scopes = ['both', 'raid', 'spawn'] as const;
-    const embed = wantsEmbed(ctx, {
+    const list: WantList = {
       wants: [
         ...dexes.map((dex, index): Want => ({
           target: { kind: 'pokemon', dex },
@@ -1327,49 +1418,28 @@ describe('/wants', () => {
         { target: { kind: 'iv', iv: 'zero' }, scope: 'spawn' },
       ],
       unreadable: 12_345,
-    }).toJSON();
-    const fields = embed.fields ?? [];
-    expect(fields.map((field) => field.name.replace(/ \(\d+\)$/, ''))).toEqual([
-      'Raids and spawns',
-      'Raids',
-      'Spawns',
-      'Raid tiers',
-      'Spawn IVs',
-    ]);
-    const total =
-      (embed.title?.length ?? 0) +
-      (embed.description?.length ?? 0) +
-      fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
-    expect(total).toBeGreaterThan(3_000);
-    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
-    expect(embed.description?.length).toBeLessThanOrEqual(LIMITS.embedDescription);
-  });
-
-  it('stays within the limits of an embed whatever the number of rows', () => {
-    const { ctx } = createTestContext();
-    const dexes = ctx.gameData.catalogue.all
-      .filter((entry) => entry.kind === 'species')
-      .map((entry) => entry.dex);
-    const scopes = ['both', 'raid', 'spawn'] as const;
-    const embed = wantsEmbed(ctx, {
-      wants: dexes.map((dex, index) => ({
-        target: { kind: 'pokemon', dex },
-        scope: scopes[index % 3] ?? 'both',
-      })),
-      unreadable: 4,
-    }).toJSON();
-    const fields = embed.fields ?? [];
-    expect(fields).toHaveLength(3);
-    for (const field of fields) {
-      expect(field.value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
-      expect(field.value).toMatch(/…and \d+ more$/);
+    };
+    const pages = Math.ceil(list.wants.length / 10);
+    expect(pages).toBeGreaterThan(100);
+    const server = '*_~`|>['.repeat(14);
+    for (let page = 0; page < pages; page++) {
+      const message = wantsList(ctx, list, server, page);
+      expect(componentCount(message)).toBeLessThanOrEqual(40);
+      expectV2Sendable(message);
     }
-    const total =
-      (embed.title?.length ?? 0) +
-      (embed.description?.length ?? 0) +
-      fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
-    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
-    expect(dexes.length).toBeGreaterThan(900);
+    // The longest form key (64 characters) still leaves Remove room in its custom id.
+    const long = wantsList(
+      ctx,
+      {
+        wants: [{ target: pokemonTarget(150, `mewtwo_${'x'.repeat(57)}`), scope: 'raid' }],
+        unreadable: 0,
+      },
+      server,
+      0,
+    );
+    const [remove] = customIdsOf(long);
+    expect(remove).toMatch(/^wantlist:0:remove:p:150:mewtwo_x+$/);
+    expect(remove?.length).toBeLessThanOrEqual(100);
   });
 });
 
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 6950a2a62b551fe59271d0e0c6b2fdb4f4b32497..2df3c51bbb3c8210052a59f3a52d3060609c5984 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -1,4 +1,4 @@
-import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
+import { SlashCommandBuilder } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { guildIdOf, requireGuild } from '../../discord/guards.js';
@@ -16,7 +16,11 @@ import {
   type SetWantOutcome,
   type WantList,
 } from '../../domain/pogo/wants.js';
-import { count, fitItems, LIMITS, plain } from '../../render/text.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { stopArgs } from '../../domain/notify/reasons.js';
+import { renderMemberList } from '../../render/member-list.js';
+import { count, plain, truncate } from '../../render/text.js';
+import { memberListControls } from './list-controls.js';
 import { byName } from '../choices.js';
 import { removeAllQuestion } from './remove-all.js';
 import { NOTIFICATION_THROTTLE, notificationsEnabled } from './shared.js';
@@ -30,7 +34,7 @@ import {
   wantLabel,
   wantName,
 } from './want-input.js';
-import { answer } from '../../discord/late-reply.js';
+import { answer, v2Answer } from '../../discord/late-reply.js';
 
 const SCOPE_CHOICES: ReadonlyArray<{ name: string; value: NotificationScope }> = [
   { name: 'Raids and spawns', value: 'both' },
@@ -249,55 +253,95 @@ export const unwant: SimpleCommand = {
   },
 };
 
+/** The custom-id kind of the controls of `/wants` (`wants` is the question of `/unwant-all`). */
+export const WANT_LIST_KIND = 'wantlist';
+
 /**
- * The member's list as an embed: the Pokémon by what they are wanted for (a species, one form
- * of it, and among "Raids" its shadow raids as `Shadow X`), then the raid tiers and the IV
- * targets. A group that does not fit its field is cut with a count, so the embed
- * stays within Discord's limits whatever the number of rows; the description says how many rows
- * this version cannot read.
+ * A want's line in the list, in at most `room` characters: `**Yveltal** (every form) · raids`,
+ * `**T5 raids**`. Only the label is cut, before it is made plain, should the line be too long.
  */
-export function wantsEmbed(ctx: AppContext, list: WantList): EmbedBuilder {
-  const species = (scope: NotificationScope): string[] =>
+function wantLine(ctx: AppContext, entry: Want, room: number): string {
+  const scope = entry.target.kind === 'pokemon' ? ` · ${SCOPE_WORDS[entry.scope]}` : '';
+  const line = (label: string): string => {
+    // The name stands out, what tells its entries apart (`(every form)`) does not.
+    const cut = label.indexOf(' (');
+    const name = cut > 0 ? label.slice(0, cut) : label;
+    const rest = cut > 0 ? label.slice(cut).trim() : '';
+    return `**${plain(name)}**${rest === '' ? '' : ` ${plain(rest)}`}${scope}`;
+  };
+  const label = wantLabel(ctx, entry.target);
+  let shown = line(label);
+  for (let keep = label.length - 1; shown.length > room && keep > 1; keep--) {
+    shown = line(truncate(label, keep));
+  }
+  return shown;
+}
+
+/**
+ * The member's wants in the order the list shows them: the Pokémon wanted for raids and spawns,
+ * for raids (their shadow raids among them, as `Shadow X`), for spawns, each group by name; then
+ * the raid tiers in the order of the tiers (the shadow tiers last), then perfect and zero IVs.
+ */
+export function wantsInOrder(ctx: AppContext, list: WantList): Want[] {
+  const species = (scope: NotificationScope): Want[] =>
     list.wants
       .filter((entry) => entry.target.kind === 'pokemon' && entry.scope === scope)
-      .map((entry) => plain(wantLabel(ctx, entry.target)))
-      .sort(byName);
-  // The tiers in the order of the tiers: T1 before T5, the shadow tiers last.
-  const tiers = notificationTiers()
-    .filter((tier) =>
-      list.wants.some(
-        (entry) => entry.target.kind === 'tier' && sameRaidTier(entry.target.tier, tier),
-      ),
-    )
-    .map(raidTierLabel);
-  const ivs = (['perfect', 'zero'] as const)
-    .filter((iv) =>
-      list.wants.some((entry) => entry.target.kind === 'iv' && entry.target.iv === iv),
-    )
-    .map((iv) => (iv === 'perfect' ? 'Perfect' : 'Zero'));
-  const groups: Array<[string, string[]]> = [
-    ['Raids and spawns', species('both')],
-    ['Raids', species('raid')],
-    ['Spawns', species('spawn')],
-    ['Raid tiers', tiers],
-    ['Spawn IVs', ivs],
-  ];
-  const embed = new EmbedBuilder().setTitle('Your notifications in this server').addFields(
-    groups
-      .filter(([, names]) => names.length > 0)
-      .map(([name, names]) => ({
-        name: `${name} (${String(names.length)})`,
-        value: fitItems(names, LIMITS.fieldValue),
-      })),
+      .map((entry) => ({ entry, label: wantLabel(ctx, entry.target) }))
+      .sort((a, b) => byName(a.label, b.label))
+      .map(({ entry }) => entry);
+  const tiers = notificationTiers().flatMap((tier) =>
+    list.wants.filter(
+      (entry) => entry.target.kind === 'tier' && sameRaidTier(entry.target.tier, tier),
+    ),
   );
-  const notes = ['`/want` adds to the list, `/unwant` takes one off.'];
-  if (list.unreadable > 0) {
-    notes.push(
-      `…and ${count(list.unreadable, 'entry', 'entries')} this version cannot read; ` +
-        '`/unwant-all` removes those too.',
-    );
-  }
-  return embed.setDescription(notes.join('\n'));
+  const ivs = (['perfect', 'zero'] as const).flatMap((iv) =>
+    list.wants.filter((entry) => entry.target.kind === 'iv' && entry.target.iv === iv),
+  );
+  return [...species('both'), ...species('raid'), ...species('spawn'), ...tiers, ...ivs];
+}
+
+/**
+ * The member's list in a server as a components-v2 message (`renderMemberList`), at a page: a
+ * want per line with its Remove (the button's arguments are the stop button's, `stopArgs`), and
+ * how many rows this version cannot read under the count.
+ */
+export function wantsList(
+  ctx: AppContext,
+  list: WantList,
+  serverName: string,
+  page: number,
+): V2Message {
+  return renderMemberList({
+    kind: WANT_LIST_KIND,
+    heading: `### Your wants in ${plain(serverName)}`,
+    noun: ['want', 'wants'],
+    items: wantsInOrder(ctx, list).map((entry) => ({
+      line: (room: number) => wantLine(ctx, entry, room),
+      removeArgs: stopArgs({ kind: 'want', target: entry.target }),
+    })),
+    page,
+    notes:
+      list.unreadable > 0
+        ? [
+            `…and ${count(list.unreadable, 'entry', 'entries')} this version cannot read; ` +
+              '`/unwant-all` removes those too.',
+          ]
+        : [],
+    footer: '`/want` adds one.',
+    empty: 'You want nothing yet. `/want` adds one.',
+    removeCommand: '/unwant',
+    removable: list.wants.length > 0 || list.unreadable > 0,
+  });
+}
+
+/** The list of the member of an interaction in its server, at a page. */
+async function memberWants(
+  interaction: { user: { id: string }; guildId: string | null; guild: { name: string } | null },
+  ctx: AppContext,
+  page: number,
+): Promise<V2Message> {
+  const list = await ctx.wants.list(interaction.user.id, guildIdOf(interaction));
+  return wantsList(ctx, list, interaction.guild?.name ?? 'this server', page);
 }
 
 /** `/wants` (spec 4.2): the member's list in this server, for the member alone. */
@@ -308,8 +352,9 @@ export const wants: SimpleCommand = {
   help: {
     category: 'notifications',
     details:
-      'Shows your list for this server: the Pokémon by whether you want their raids, their ' +
-      'spawns or both, the raid tiers, and perfect or zero IVs.',
+      'Shows your list for this server, ten to a page: the Pokémon with whether you want their ' +
+      'raids, their spawns or both, the raid tiers, and perfect or zero IVs. Each has a Remove ' +
+      'button; "Remove all…" asks before it empties the list.',
     examples: ['/wants'],
   },
   enabled: notificationsEnabled,
@@ -317,16 +362,7 @@ export const wants: SimpleCommand = {
   defer: 'late',
 
   async execute(interaction, ctx) {
-    const list = await ctx.wants.list(interaction.user.id, guildIdOf(interaction));
-    if (list.wants.length === 0 && list.unreadable === 0) {
-      await answer(interaction, {
-        content:
-          'Your list for this server is empty. `/want` puts a Pokémon or a raid tier on it, ' +
-          'and I send you a DM when one is reported.',
-      });
-      return;
-    }
-    await answer(interaction, { embeds: [wantsEmbed(ctx, list)] });
+    await answer(interaction, v2Answer(await memberWants(interaction, ctx, 0)));
   },
 };
 
@@ -364,3 +400,16 @@ export const unwantAll: SimpleCommand = {
 
 /** The two buttons of `/unwant-all`. */
 export const wantControls = allWants.controls;
+
+/** The buttons of `/wants`: the pages, Remove, and "Remove all…". */
+export const wantListControls = memberListControls({
+  kind: WANT_LIST_KIND,
+  command: '/wants',
+  render: (interaction, ctx, page) => memberWants(interaction, ctx, page),
+  async remove(interaction, ctx, reason) {
+    if (reason.kind !== 'want') return false;
+    await ctx.wants.remove(interaction.user.id, guildIdOf(interaction), reason.target);
+    return true;
+  },
+  askAll: (interaction, ctx) => allWants.ask(interaction, ctx),
+});
diff --git a/src/components/index.ts b/src/components/index.ts
index 06571189cb53dd2560cca61edc92a5be4c53fc1f..9048c99d94ebaa42c4cfda5f5b369778f3dde29b 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,8 +1,12 @@
 import { gymControls } from '../commands/gyms/controls.js';
 import { regionControls } from '../commands/regions/controls.js';
 import { infoControls } from '../commands/meetups/info.js';
-import { targetControls, targetRemovalControls } from '../commands/notifications/targets.js';
-import { wantControls } from '../commands/notifications/wants.js';
+import {
+  targetControls,
+  targetListControls,
+  targetRemovalControls,
+} from '../commands/notifications/targets.js';
+import { wantControls, wantListControls } from '../commands/notifications/wants.js';
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import { roleControls } from '../commands/roles/menus.js';
@@ -17,8 +21,10 @@ export const components: readonly ComponentHandler[] = [
   locationControls,
   infoControls,
   wantControls,
+  wantListControls,
   targetControls,
   targetRemovalControls,
+  targetListControls,
   partyButtons,
   dmControls,
   roleControls,
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 9ee31fb5930898c64164c5c281daabec6fc2835f..f66a6f7bdd4b1040ad8fcf6c2cef69d8922907c7 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -38,6 +38,14 @@
  * of a pending question about the gym of a screenshot posted with a mention of the bot:
  * `shot:<token>:gym` (the menu) and `shot:<token>:cancel`. The button "Screenshot feedback" of a
  * raid's post is the party's own, `party:<party id>:shot`.
+ *
+ * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
+ * (`/targets`; the kinds `wants` and `targets` are the questions of `/unwant-all` and
+ * `/untarget-all`), and their id is the page the list shows, from 0: `wantlist:<page>:prev`,
+ * `wantlist:<page>:next`, `wantlist:<page>:all` ("Remove all…") and
+ * `wantlist:<page>:remove:<what>`, where `<what>` is spelled as for the stop buttons of a DM
+ * (`stopArgs`: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`, `ts:<level>`, `iv:…`, `g:<gym id>`).
+ * Nothing about a list is kept anywhere: a press reads the member's list anew.
  */
 export const MAX_CUSTOM_ID_LENGTH = 100;
 const SEPARATOR = ':';
diff --git a/src/discord/late-reply.test.ts b/src/discord/late-reply.test.ts
index 81bc9e190bae00a9043f96f785ac259be219f935..988475dc6fecd388645b0f57592dc517fb9eb33c 100644
--- a/src/discord/late-reply.test.ts
+++ b/src/discord/late-reply.test.ts
@@ -4,7 +4,9 @@ import { fakeChatInput } from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { SimpleCommand } from './command.js';
 import { UserError } from './errors.js';
-import { answer, LATE_DEFER_MS } from './late-reply.js';
+import { container, textDisplay } from '../render/v2.js';
+import { answer, LATE_DEFER_MS, v2Answer } from './late-reply.js';
+import type { V2Message } from './party-gateway.js';
 import { InteractionRouter } from './router.js';
 
 const asInteraction = (fake: unknown) => fake as Interaction;
@@ -209,4 +211,27 @@ describe('answer', () => {
     expect(i.reply).toHaveBeenCalledExactlyOnceWith({ content: 'Done.', ...EPHEMERAL });
     expect(i.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'Done again.' });
   });
+
+  it('edits an acknowledgement into a components-v2 message with its flag and components', async () => {
+    const i = fakeChatInput({ deferred: true });
+    const message: V2Message = {
+      v2: true,
+      components: [container(0x5865f2, [textDisplay('### A list')])],
+    };
+    await answer(i as unknown as ChatInputCommandInteraction, v2Answer(message));
+    expect(i.editReply).toHaveBeenCalledExactlyOnceWith({
+      components: message.components,
+      flags: MessageFlags.IsComponentsV2,
+    });
+  });
+
+  it('sends a components-v2 first answer for the member alone, with both flags', async () => {
+    const i = fakeChatInput();
+    const message: V2Message = { v2: true, components: [container(0x5865f2, [textDisplay('x')])] };
+    await answer(i as unknown as ChatInputCommandInteraction, v2Answer(message));
+    expect(i.reply).toHaveBeenCalledExactlyOnceWith({
+      components: message.components,
+      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+    });
+  });
 });
diff --git a/src/discord/late-reply.ts b/src/discord/late-reply.ts
index 992479acbbd0baf276a9c39d7b9eea30ecaa6766..ab1a7ee0161f882624f2cf2de420289b547067a6 100644
--- a/src/discord/late-reply.ts
+++ b/src/discord/late-reply.ts
@@ -5,6 +5,7 @@ import {
   type MessageComponentInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
+import type { V2Message } from './party-gateway.js';
 
 /**
  * Late deferral (Matt, 2026-10-13). A request to Discord takes a quarter of a second from where
@@ -17,11 +18,23 @@ import {
  */
 export const LATE_DEFER_MS = 1_000;
 
-/** What `answer` sends: what a first answer and an edited acknowledgement both take. */
+/**
+ * What `answer` sends: what a first answer and an edited acknowledgement both take. A
+ * components-v2 answer (`v2Answer`) carries its flag; the answer is for the member alone either
+ * way.
+ */
 export type AnswerPayload = Pick<
   InteractionReplyOptions,
   'content' | 'embeds' | 'components' | 'files' | 'allowedMentions'
->;
+> & { flags?: MessageFlags.IsComponentsV2 };
+
+/** A components-v2 message as an answer (`answer`) or an `update`: its components and its flag. */
+export function v2Answer(message: V2Message): {
+  components: V2Message['components'];
+  flags: MessageFlags.IsComponentsV2;
+} {
+  return { components: message.components, flags: MessageFlags.IsComponentsV2 };
+}
 
 type Answerable =
   ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;
@@ -104,5 +117,6 @@ export async function answer(interaction: Answerable, payload: AnswerPayload): P
   state?.cancel();
   await state?.deferral;
   if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
-  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
+  else
+    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral | (payload.flags ?? 0) });
 }
diff --git a/src/render/member-list.test.ts b/src/render/member-list.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f729c2b8c47ccbcde32c969e1b88f41acc69d8b4
--- /dev/null
+++ b/src/render/member-list.test.ts
@@ -0,0 +1,135 @@
+import { ButtonStyle } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { accentOf, buttonsOf, componentCount, textDisplays } from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import { LIST_COLOUR } from './v2.js';
+import { LIST_PAGE, pageCount, renderMemberList, shownPage, type ListView } from './member-list.js';
+
+const item = (n: number, text = `Item ${String(n)}`) => ({
+  line: (room: number) => text.slice(0, room),
+  removeArgs: ['g', String(n)],
+});
+
+const view = (n: number, more: Partial<ListView> = {}): ListView => ({
+  kind: 'targetlist',
+  heading: '### Gyms you want raids of',
+  noun: ['gym', 'gyms'],
+  items: Array.from({ length: n }, (_, i) => item(i + 1)),
+  page: 0,
+  footer: '`/target` adds one.',
+  empty: 'You want raids of no gym yet. `/target` adds one.',
+  removeCommand: '/untarget',
+  removable: n > 0,
+  ...more,
+});
+
+describe('renderMemberList', () => {
+  it('shows a list of one page: heading, count, an entry a section with Remove, Remove all…', () => {
+    const message = renderMemberList(view(3));
+    expect(accentOf(message)).toBe(LIST_COLOUR);
+    expect(textDisplays(message)).toEqual([
+      '### Gyms you want raids of\n3 gyms',
+      'Item 1',
+      'Item 2',
+      'Item 3',
+      '-# `/target` adds one.',
+    ]);
+    expect(
+      buttonsOf(message).map((button) => [button.label, button.customId, button.style]),
+    ).toEqual([
+      ['Remove', 'targetlist:0:remove:g:1', ButtonStyle.Danger],
+      ['Remove', 'targetlist:0:remove:g:2', ButtonStyle.Danger],
+      ['Remove', 'targetlist:0:remove:g:3', ButtonStyle.Danger],
+      ['Remove all…', 'targetlist:0:all', ButtonStyle.Danger],
+    ]);
+    expectV2Sendable(message);
+  });
+
+  it('shows pages of ten with Previous and Next, disabled at the ends', () => {
+    expect(pageCount(0)).toBe(1);
+    expect(pageCount(LIST_PAGE)).toBe(1);
+    expect(pageCount(LIST_PAGE + 1)).toBe(2);
+    const first = renderMemberList(view(14));
+    expect(textDisplays(first)[0]).toBe('### Gyms you want raids of\n14 gyms · page 1 of 2');
+    expect(textDisplays(first)).toHaveLength(1 + LIST_PAGE + 1);
+    const controls = (message: ReturnType<typeof renderMemberList>) =>
+      JSON.parse(JSON.stringify(buttonsOf(message).slice(-3))) as unknown;
+    expect(controls(first)).toEqual([
+      { label: '◀ Previous', style: ButtonStyle.Secondary, customId: 'targetlist:0:prev' },
+      { label: 'Next ▶', style: ButtonStyle.Secondary, customId: 'targetlist:0:next' },
+      { label: 'Remove all…', style: ButtonStyle.Danger, customId: 'targetlist:0:all' },
+    ]);
+    const disabled = (message: ReturnType<typeof renderMemberList>) =>
+      (JSON.stringify(message).match(/"disabled":true/g) ?? []).length;
+    expect(disabled(first)).toBe(1);
+    expect(JSON.stringify(first)).toMatch(
+      /"custom_id":"targetlist:0:prev","label":"◀ Previous","disabled":true/,
+    );
+    const second = renderMemberList(view(14, { page: 1 }));
+    expect(textDisplays(second).slice(1, -1)).toEqual(['Item 11', 'Item 12', 'Item 13', 'Item 14']);
+    expect(JSON.stringify(second)).toMatch(
+      /"custom_id":"targetlist:1:next","label":"Next ▶","disabled":true/,
+    );
+    expect(customIds(second)).toContain('targetlist:1:remove:g:11');
+    // A page past the end shows the last.
+    expect(shownPage(5, 14)).toBe(1);
+    expect(textDisplays(renderMemberList(view(14, { page: 5 })))[0]).toContain('page 2 of 2');
+  });
+
+  it('says only the heading and how to add one for an empty list, without buttons', () => {
+    const message = renderMemberList(view(0));
+    expect(textDisplays(message)).toEqual([
+      '### Gyms you want raids of\nYou want raids of no gym yet. `/target` adds one.',
+    ]);
+    expect(buttonsOf(message)).toEqual([]);
+  });
+
+  it('keeps the notes about the whole list under the count, and Remove all for what it cannot read', () => {
+    const message = renderMemberList(
+      view(0, { removable: true, notes: ['…and 2 entries this version cannot read.'] }),
+    );
+    expect(textDisplays(message)[0]).toBe(
+      '### Gyms you want raids of\n0 gyms\n…and 2 entries this version cannot read.',
+    );
+    expect(customIds(message)).toEqual(['targetlist:0:all']);
+    expectV2Sendable(message);
+  });
+
+  it('names the command for an entry whose Remove would not fit into a custom id', () => {
+    const long = { line: () => 'Shadow Longname', removeArgs: ['pokemon', '9', 'x'.repeat(90)] };
+    const message = renderMemberList(view(1, { items: [long], removeCommand: '/unwant' }));
+    expect(textDisplays(message)[1]).toBe('Shadow Longname · `/unwant` removes it');
+    expect(customIds(message)).toEqual(['targetlist:0:all']);
+  });
+
+  it('keeps a full page of the longest entries within what Discord takes', () => {
+    // As an entry does it: the name is cut before it is escaped, so no backslash is left alone.
+    const long = (n: number) => ({
+      line: (room: number) => {
+        const raw = `${'['.repeat(600)}${String(n)}`;
+        const escaped = (keep: number) => raw.slice(0, keep).replace(/\[/g, '\\[');
+        let keep = raw.length;
+        while (escaped(keep).length > room) keep -= 1;
+        return escaped(keep);
+      },
+      removeArgs: ['g', String(n)],
+    });
+    const message = renderMemberList(
+      view(25, {
+        items: Array.from({ length: 25 }, (_, n) => long(n)),
+        page: 1,
+        notes: ['…and 3 entries this version cannot read; `/untarget-all` removes those too.'],
+      }),
+    );
+    expect(componentCount(message)).toBeLessThanOrEqual(40);
+    expectV2Sendable(message);
+    expect(buttonsOf(message)).toHaveLength(LIST_PAGE + 3);
+    for (const line of textDisplays(message).slice(1, -1)) {
+      expect(line).not.toMatch(/(^|[^\\])(\\\\)*\\$/);
+    }
+  });
+});
+
+function customIds(message: ReturnType<typeof renderMemberList>): string[] {
+  return buttonsOf(message).flatMap((button) => (button.customId ? [button.customId] : []));
+}
diff --git a/src/render/member-list.ts b/src/render/member-list.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3b711da72e3110edb11ef09877e2549f1bdad7d6
--- /dev/null
+++ b/src/render/member-list.ts
@@ -0,0 +1,161 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIButtonComponentWithCustomId,
+  type APIComponentInContainer,
+} from 'discord.js';
+import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import { cutText, TEXT_BUDGET } from './party-post.js';
+import { count } from './text.js';
+import { actionRow, container, LIST_COLOUR, section, separator, textDisplay } from './v2.js';
+
+/**
+ * A list a member manages by themself, shown to them alone (`/wants`, `/targets`): one
+ * components-v2 message of a page of items, each with a Remove button beside it, the buttons
+ * that turn the pages and the one that asks to remove them all.
+ */
+
+/** As many items as a page shows: ten sections of three components and the rest stay within 40. */
+export const LIST_PAGE = 10;
+
+/** The actions of the controls of a list (the custom id's id is the page shown, from 0). */
+export const LIST_ACTIONS = { prev: 'prev', next: 'next', remove: 'remove', all: 'all' } as const;
+
+/** One entry of a list. */
+export interface ListItem {
+  /**
+   * The line of the entry (Markdown) in at most `room` characters: the entry keeps within it
+   * itself, cutting what can be long (a name) before it is escaped, so no cut leaves a markup or
+   * an escape half done. The list cuts only a line that breaks this (`cutText`, a backstop).
+   */
+  line(room: number): string;
+  /** The custom id's arguments that name what Remove takes off (a want token's parts, a gym id). */
+  removeArgs: string[];
+}
+
+/** What a list shows, besides its entries. */
+export interface ListView {
+  /** The custom-id kind of its controls (`wantlist`, `targetlist`). */
+  kind: string;
+  /** `### Your wants in Pine Test`. */
+  heading: string;
+  /** What an entry is called, one and several: `['want', 'wants']`, `['gym', 'gyms']`. */
+  noun: readonly [string, string];
+  items: readonly ListItem[];
+  /** The page asked for, from 0; one past the end shows the last. */
+  page: number;
+  /** Lines under the count that are about the whole list (entries this version cannot read). */
+  notes?: readonly string[];
+  /** The small print at the end: `` `/want` adds one. `` */
+  footer: string;
+  /** What an empty list says, under its heading: `` You want nothing yet. `/want` adds one. `` */
+  empty: string;
+  /** What an entry whose Remove would not fit into a custom id says at its end. */
+  removeCommand: string;
+  /** Whether "Remove all…" is offered (there is something to remove, readable or not). */
+  removable: boolean;
+}
+
+/** The number of pages of a list of `n` entries: one at least. */
+export function pageCount(n: number): number {
+  return Math.max(1, Math.ceil(n / LIST_PAGE));
+}
+
+/** The page a list shows for `page`: within its pages. */
+export function shownPage(page: number, n: number): number {
+  return Math.min(Math.max(0, Math.floor(page)), pageCount(n) - 1);
+}
+
+function button(
+  customId: string,
+  label: string,
+  style: APIButtonComponentWithCustomId['style'],
+  disabled = false,
+): APIButtonComponentWithCustomId {
+  return {
+    type: ComponentType.Button,
+    style,
+    custom_id: customId,
+    label,
+    ...(disabled ? { disabled: true } : {}),
+  };
+}
+
+/**
+ * The list as a components-v2 message: its heading and the count (`14 wants · page 1 of 2`, no
+ * page words with one page), a line, one section per entry of the page with a red Remove beside
+ * it (an entry whose Remove would not fit into a custom id says which command removes it), a
+ * line, the row of Previous / Next (with more than one page; disabled at the ends) and "Remove
+ * all…", and the footer. An empty list is its heading and `empty` alone. The entries share what
+ * is left of `TEXT_BUDGET` after the rest.
+ */
+export function renderMemberList(view: ListView): V2Message {
+  const { items, kind } = view;
+  if (items.length === 0 && !view.removable) {
+    return {
+      v2: true,
+      components: [container(LIST_COLOUR, [textDisplay(`${view.heading}\n${view.empty}`)])],
+    };
+  }
+  const pages = pageCount(items.length);
+  const page = shownPage(view.page, items.length);
+  const id = String(page);
+  const counted = count(items.length, view.noun[0], view.noun[1]);
+  const head = [
+    view.heading,
+    pages > 1 ? `${counted} · page ${page + 1} of ${pages}` : counted,
+    ...(view.notes ?? []),
+  ].join('\n');
+  const footer = `-# ${view.footer}`;
+  const shown = items.slice(page * LIST_PAGE, (page + 1) * LIST_PAGE);
+  const room = Math.floor((TEXT_BUDGET - head.length - footer.length) / Math.max(1, shown.length));
+  const parts: APIComponentInContainer[] = [textDisplay(head), separator()];
+  for (const item of shown) {
+    const removeId = encodeCustomIdIfFits({
+      kind,
+      id,
+      action: LIST_ACTIONS.remove,
+      args: item.removeArgs,
+    });
+    if (removeId === undefined) {
+      const hint = ` · \`${view.removeCommand}\` removes it`;
+      parts.push(textDisplay(cutText(item.line(room - hint.length), room - hint.length) + hint));
+    } else {
+      parts.push(
+        section(cutText(item.line(room), room), button(removeId, 'Remove', ButtonStyle.Danger)),
+      );
+    }
+  }
+  if (shown.length > 0) parts.push(separator());
+  const controls = [
+    ...(pages > 1
+      ? [
+          button(
+            encodeCustomId({ kind, id, action: LIST_ACTIONS.prev }),
+            '◀ Previous',
+            ButtonStyle.Secondary,
+            page === 0,
+          ),
+          button(
+            encodeCustomId({ kind, id, action: LIST_ACTIONS.next }),
+            'Next ▶',
+            ButtonStyle.Secondary,
+            page === pages - 1,
+          ),
+        ]
+      : []),
+    ...(view.removable
+      ? [
+          button(
+            encodeCustomId({ kind, id, action: LIST_ACTIONS.all }),
+            'Remove all…',
+            ButtonStyle.Danger,
+          ),
+        ]
+      : []),
+  ];
+  if (controls.length > 0) parts.push(actionRow(controls));
+  parts.push(textDisplay(footer));
+  return { v2: true, components: [container(LIST_COLOUR, parts)] };
+}
diff --git a/src/render/v2.ts b/src/render/v2.ts
index 0672d784befb999fbd6d9e9c37d52f0f48396a64..6e18b458cc3e1b66d9c3fd36b8e7d0348803a805 100644
--- a/src/render/v2.ts
+++ b/src/render/v2.ts
@@ -54,6 +54,9 @@ export function linkButton(label: string, emoji: string, url: string): APIButton
   };
 }
 
+/** The colour of the edge of a list: a member's own (`/wants`, `/targets`) and a region's summary. */
+export const LIST_COLOUR = 0x5865f2;
+
 /** The box a post is drawn in, with the colour of its edge. */
 export function container(
   accent: number,
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 8f09288c81f350f35b5aad44f28e6616526c3065..fe4ed9bb9c8c33d086cac8e8994d61ac209dc360 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -531,3 +531,14 @@ export function sent(
   if (!payload) throw new Error(`nothing was sent in call ${call}`);
   return payload;
 }
+
+/**
+ * A payload sent with the components-v2 flag (`v2Answer`) as the message it is, for the readers
+ * of `test/support/messages.ts`; fails the test for a payload without the flag.
+ */
+export function asV2(payload: SentPayload): V2Message {
+  if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0) {
+    throw new Error('The payload has no IsComponentsV2 flag');
+  }
+  return { v2: true, components: (payload.components ?? []) as V2Message['components'] };
+}
````

### Task 4: Spawn reports and Unown sightings as components-v2 messages

Prototype commit: `d22530ac9938df02a99ffe1787896c7591931fad`

A report in the region channel is one container in the spawn colour: the
head (Wild Dratini, the IVs and who reported it, when it goes away) with
the picture beside it, where it is, and the caution with the footer in
small print. The Unown sighting is the same container with the sentence
that names the region as its head. Where the bot may not post embeds the
report stays classic text, warning and all.

**Files:**

```
 src/commands/notifications/wild.test.ts |  78 ++++++++++++++++--------------------
 src/render/spawn.ts                     |  94 ++++++++++++++++++++++++++++---------------
 src/services/spawn-service.test.ts      | 112 +++++++++++++++++++++++++++++++++++++++-------------
 src/services/spawn-service.ts           |   2 +-
 4 files changed, 183 insertions(+), 103 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/notifications/wild.test.ts src/services/spawn-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff d22530ac9938df02a99ffe1787896c7591931fad -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `Spawn reports and Unown sightings as components-v2 messages`, the body above and the trailer, staging exactly
  `src/commands/notifications/wild.test.ts src/render/spawn.ts src/services/spawn-service.test.ts src/services/spawn-service.ts`.

````diff
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index 1d3615083d0654a614f6fded23b993dd103ef858..61fe3a3bf0f9eec8847276cec6b0bc5259f794ed 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -6,6 +6,8 @@ import {
   dmSummary,
   linksOf,
   textDisplays,
+  textOf,
+  thumbnailOf,
 } from '../../../test/support/messages.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
@@ -24,7 +26,7 @@ import { InteractionRouter } from '../../discord/router.js';
 import { pokemonTarget, type NotificationTarget } from '../../domain/pogo/notification-target.js';
 import { postLink } from '../../render/notify-dm.js';
 import { DM_PRIORITY } from '../../services/dm-sender.js';
-import { SPAWN_FOOTER, SPAWN_WARNING } from '../../render/spawn.js';
+import { SPAWN_CAUTION, SPAWN_FOOTER, SPAWN_WARNING } from '../../render/spawn.js';
 import { commands } from '../index.js';
 import { renderCommandHelp } from '../util/help-render.js';
 import { MAX_DETAILS, WILD_THROTTLE, wildCommand, wildExceptionsOf } from './wild.js';
@@ -71,6 +73,8 @@ async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
   };
   /** The reports that stand in a channel. */
   const reports = (channelId = WEST_CHANNEL) => made.gateway.messagesIn(channelId);
+  /** The Pokémon of each report in the region's channel, by its head (`### Wild Dratini`). */
+  const named = () => reports().map(({ message }) => /^### Wild (.+)$/m.exec(textOf(message))?.[1]);
   const want = async (target: NotificationTarget, ...ids: string[]) => {
     for (const id of ids) await made.wants.set(id, made.gateway.guildId, target, 'both');
   };
@@ -78,7 +82,7 @@ async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
     await made.notify.flush();
     return made.dms.to(userId).map((message) => dmSummary(message));
   };
-  return { ...made, ctx, handle, run, offered, reports, want, told };
+  return { ...made, ctx, handle, run, offered, reports, named, want, told };
 }
 
 describe('/wild', () => {
@@ -94,16 +98,14 @@ describe('/wild', () => {
     const used = await made.run({ pokemon: 'dratini', details: 'by the fountain' });
     expect(sent(used.reply).flags).toBe(MessageFlags.Ephemeral);
     const [report] = made.reports();
-    expect(report?.message).toEqual({
-      content: `A wild **Dratini** has been reported by **Alice** (<@${ALICE}>):`,
-      embeds: [
-        {
-          color: 0x2ecc71,
-          description: `by the fountain\n\n${SPAWN_WARNING}`,
-          footer: { text: SPAWN_FOOTER },
-        },
-      ],
-    });
+    expect(report?.message.v2).toBe(true);
+    expect(accentOf(report?.message)).toBe(0x2ecc71);
+    expect(textDisplays(report?.message)).toEqual([
+      `### Wild Dratini\nReported by **Alice** (<@${ALICE}>)\n` +
+        `This report goes away <t:${String(PARTY_NOW / 1000 + 30 * 60)}:R>.`,
+      '**Where**\nby the fountain',
+      `-# ${SPAWN_CAUTION} · ${SPAWN_FOOTER}`,
+    ]);
     expect(sent(used.reply).content).toBe(
       'Reported: a wild Dratini. ' +
         `${postLink(made.gateway.guildId, WEST_CHANNEL, report?.id ?? '')}\n` +
@@ -120,7 +122,7 @@ describe('/wild', () => {
       { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
     );
     // The link line of the raid is the third message there.
-    expect(made.reports().filter((message) => message.message.embeds?.length)).toHaveLength(2);
+    expect(made.reports().filter((message) => message.message.v2)).toHaveLength(2);
     expect(made.gateway.messagesIn(raid.postId)).toEqual([]);
   });
 
@@ -138,16 +140,16 @@ describe('/wild', () => {
     const made = await setup();
     await made.run({ pokemon: 'gastly', iv: 'perfect' });
     const [report] = made.reports();
-    expect(report?.message.content).toBe(
-      `A wild **Gastly** with 100% IVs has been reported by **Alice** (<@${ALICE}>):`,
+    expect(textDisplays(report?.message)[0]).toMatch(
+      new RegExp(
+        `^### Wild Gastly\\nwith 100% IVs · reported by \\*\\*Alice\\*\\* \\(<@${ALICE}>\\)\\n`,
+      ),
     );
     // The private answer says the IVs again: the member sees what was reported.
     const used = await made.run({ pokemon: 'dratini', iv: 'zero' });
     expect(sent(used.reply).content).toMatch(/^Reported: a wild Dratini with 0% IVs\. https:/);
-    expect(report?.message.embeds?.[0]).toMatchObject({
-      description: `by the fountain\n\n${SPAWN_WARNING}`,
-      thumbnail: { url: expect.stringContaining('pm92.icon.png') as string },
-    });
+    expect(textDisplays(report?.message)[1]).toBe('**Where**\nby the fountain');
+    expect(thumbnailOf(report?.message)).toContain('pm92.icon.png');
   });
 
   it('shows the details as plain text: nothing in them pings or links', async () => {
@@ -156,7 +158,7 @@ describe('/wild', () => {
       pokemon: 'dratini',
       details: '@everyone <@&5> [here](https://example.com) **now** https://evil.example/a_b',
     });
-    const description = made.reports()[0]?.message.embeds?.[0]?.description ?? '';
+    const description = textOf(made.reports()[0]?.message);
     expect(description).not.toContain('@everyone');
     expect(description).not.toContain('<@&');
     expect(description).not.toContain('](');
@@ -187,7 +189,7 @@ describe('/wild', () => {
       ...[WEST_CHANNEL, EAST_CHANNEL, SIGHTINGS].flatMap((channel) =>
         made.gateway
           .messagesIn(channel)
-          .flatMap(({ message }) => [message.content, message.embeds?.[0]?.description]),
+          .flatMap(({ message }) => (message.v2 ? textDisplays(message) : [message.content])),
       ),
     ].filter((text) => text !== undefined);
     expect(texts.length).toBeGreaterThanOrEqual(9);
@@ -206,9 +208,9 @@ describe('/wild', () => {
     made.gateway.noEmbeds.add(WEST_CHANNEL);
     await made.run({ pokemon: 'dratini' });
     const [embedded, text] = made.reports();
-    expect(embedded?.message.embeds?.[0]?.footer).toEqual({
-      text: '/wild reports a spawn like this one',
-    });
+    expect(textDisplays(embedded?.message).at(-1)).toBe(
+      `-# ${SPAWN_CAUTION} · /wild reports a spawn like this one`,
+    );
     expect(text?.message.content).toMatch(/\n-# \/wild reports a spawn like this one$/);
     const help = (of: typeof settings) =>
       renderCommandHelp(wildCommand, of).toJSON().description ?? '';
@@ -248,9 +250,7 @@ describe('/wild', () => {
     }
     expect(made.reports()).toEqual([]);
     await made.run({ pokemon: 'dratini', details: '  Riverside Park ' });
-    expect(made.reports()[0]?.message.embeds?.[0]?.description).toBe(
-      `Riverside Park\n\n${SPAWN_WARNING}`,
-    );
+    expect(textDisplays(made.reports()[0]?.message)[1]).toBe('**Where**\nRiverside Park');
   });
 
   it('refuses what never appears in the wild with a sentence, picked or typed', async () => {
@@ -276,11 +276,7 @@ describe('/wild', () => {
     expect(made.reports()).toEqual([]);
     // None of them counted against the limit, and the lake trio does spawn.
     for (const pokemon of ['uxie', 'Mesprit', 'azelf']) await made.run({ pokemon });
-    expect(made.reports().map((report) => report.message.content?.split(' has ')[0])).toEqual([
-      'A wild **Uxie**',
-      'A wild **Mesprit**',
-      'A wild **Azelf**',
-    ]);
+    expect(made.named()).toEqual(['Uxie', 'Mesprit', 'Azelf']);
   });
 
   it('answers a use without details with the sentence, as an old definition may send it', async () => {
@@ -434,12 +430,7 @@ describe('/wild', () => {
     await made.run({ pokemon: 'Alolan Rattata' });
     await made.run({ pokemon: 'Unown' });
     await made.run({ pokemon: 'unown_f' });
-    expect(made.reports().map((report) => report.message.content?.split(' has ')[0])).toEqual([
-      'A wild **Alolan Rattata**',
-      'A wild **Alolan Rattata**',
-      'A wild **Unown**',
-      'A wild **Unown (F)**',
-    ]);
+    expect(made.named()).toEqual(['Alolan Rattata', 'Alolan Rattata', 'Unown', 'Unown (F)']);
     const mega = await made.run({ pokemon: 'charizard_mega_y' });
     expect(sent(mega.reply).content).toBe(
       '**Mega Charizard Y** is a mega: those are met in raids, not in the wild.',
@@ -658,11 +649,12 @@ describe('/wild: Unown', () => {
     const made = await setup();
     made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
     await made.run({ pokemon: 'unown_f', details: 'at the library' });
-    expect(made.gateway.messagesIn(SIGHTINGS).map((message) => message.message)).toEqual([
-      {
-        content: `A wild **Unown (F)** has been reported in <#${WEST_CHANNEL}> by **Alice**:`,
-        embeds: [{ color: 0x2ecc71, description: `at the library\n\n${SPAWN_WARNING}` }],
-      },
+    const sightings = made.gateway.messagesIn(SIGHTINGS);
+    expect(sightings).toHaveLength(1);
+    expect(textDisplays(sightings[0]?.message)).toEqual([
+      `A wild **Unown (F)** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
+      '**Where**\nat the library',
+      `-# ${SPAWN_CAUTION}`,
     ]);
     // Nobody is pinged and no role is named.
     expect(JSON.stringify(made.gateway.messagesIn(SIGHTINGS))).not.toContain('<@&');
diff --git a/src/render/spawn.ts b/src/render/spawn.ts
index 98b47ab0256d0d8d4f77dfe32a44689e01c536ce..3eb5c5b913783382327ed51425fcd7232cc9d59a 100644
--- a/src/render/spawn.ts
+++ b/src/render/spawn.ts
@@ -1,5 +1,5 @@
-import type { APIEmbed } from 'discord.js';
-import type { ClassicMessage } from '../discord/party-gateway.js';
+import type { APIComponentInContainer } from 'discord.js';
+import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
 import {
   memberName,
   memberText,
@@ -8,6 +8,7 @@ import {
   timestamp,
   type NamedMember,
 } from './text.js';
+import { container, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /** The colour of a spawn report, as the legacy bot's. */
 export const SPAWN_COLOUR = 0x2ecc71;
@@ -53,48 +54,68 @@ function spawnName(view: Pick<SpawnView, 'pokemon' | 'iv'>): string {
   return `**${plain(view.pokemon)}**${ivs}`;
 }
 
-/**
- * The embed of a spawn report: where it is, in the member's words made plain (the legacy bot
- * posted them raw, and they could ping) and without a working link (they go to everybody who
- * wants the Pokémon), the warning, and the Pokémon's picture.
- */
-export function spawnEmbed(view: SpawnView, footer?: string): APIEmbed {
-  const details = view.details === null ? '' : plainNoLinks(view.details);
-  return {
-    color: SPAWN_COLOUR,
-    description: details === '' ? SPAWN_WARNING : `${details}\n\n${SPAWN_WARNING}`,
-    ...(view.image === undefined ? {} : { thumbnail: { url: view.image } }),
-    ...(footer === undefined ? {} : { footer: { text: footer } }),
-  };
+/** What a report says of a spawn's worth in its small print (the legacy bot's warning, shorter). */
+export const SPAWN_CAUTION = 'Spawns can be gone before you get there.';
+
+/** The blocks under the head of a report: where the spawn is, then the small print. */
+function spawnBody(view: SpawnView, smallPrint: string): APIComponentInContainer[] {
+  const where = whereText(view);
+  return [
+    ...(where === '' ? [] : [separator(), textDisplay(`**Where**\n${where}`)]),
+    textDisplay(`-# ${smallPrint}`),
+  ];
+}
+
+/** The head of a report with the Pokémon's picture beside it, or alone without one. */
+function spawnHead(view: SpawnView, text: string): APIComponentInContainer {
+  return view.image === undefined ? textDisplay(text) : section(text, thumbnail(view.image));
 }
 
 /**
- * The public message in the region's text channel: who reported what, in a sentence that pings
- * nobody, with the embed and its footer (`spawnFooter`). It is deleted after `SPAWN_MINUTES`.
+ * The public message in the region's text channel, a components-v2 message (the draft "In the
+ * channels"): `### Wild Dratini`, the IVs and who reported it (in a sentence that pings
+ * nobody), when the report goes away, the picture beside them; where it is, in the member's
+ * words made plain without a working link (the legacy bot posted them raw, and they could
+ * ping); and in small print the caution and `spawnFooter`. It is deleted after `SPAWN_MINUTES`.
  */
-export function spawnMessage(view: SpawnView, footer: string): ClassicMessage {
+export function spawnMessage(view: SpawnView, footer: string, goneAt: number): V2Message {
+  const by = (word: 'Reported' | 'reported') => `${word} by ${memberText(view.reporter)}`;
+  const head = [
+    `### Wild ${plain(view.pokemon)}`,
+    view.iv === undefined ? by('Reported') : `with ${IV_WORDS[view.iv]} · ${by('reported')}`,
+    `This report goes away ${timestamp(goneAt, 'R')}.`,
+  ].join('\n');
   return {
-    content: `A wild ${spawnName(view)} has been reported by ${memberText(view.reporter)}:`,
-    embeds: [spawnEmbed(view, footer)],
+    v2: true,
+    components: [
+      container(SPAWN_COLOUR, [
+        spawnHead(view, head),
+        ...spawnBody(view, `${SPAWN_CAUTION} · ${footer}`),
+      ]),
+    ],
   };
 }
 
 /**
- * The public message for a channel in which the bot may not post embeds (Discord would show
- * the message without its embed, and the report without where it is): everything as text, the
- * footer in small print, no picture.
+ * The public message for a channel in which the bot may not post embeds: classic text, as
+ * before components v2 (whether Discord shows a v2 message there is not known; staging), with
+ * the legacy bot's warning, the footer in small print, and no picture.
  */
 export function spawnTextMessage(view: SpawnView, footer: string): ClassicMessage {
-  const { content = '' } = spawnMessage(view, footer);
-  const { description = '' } = spawnEmbed(view);
-  return { content: `${content}\n${description}\n-# ${footer}` };
+  const details = whereText(view);
+  const description = details === '' ? SPAWN_WARNING : `${details}\n\n${SPAWN_WARNING}`;
+  return {
+    content:
+      `A wild ${spawnName(view)} has been reported by ${memberText(view.reporter)}:\n` +
+      `${description}\n-# ${footer}`,
+  };
 }
 
 /**
  * The sentence where the region has to be named: in a direct message, and in the channel for
  * Unown sightings. The reporter is named by name alone, as in every direct message. A direct
- * message leads to the report by its "Go to report" button; the sighting is followed by the
- * report itself.
+ * message leads to the report by its "Go to report" button; the sighting is the head of its
+ * own container (`sightingMessage`).
  */
 export function spawnSentence(view: SpawnView, regionChannelId: string): string {
   return (
@@ -127,10 +148,19 @@ export function spawnBrief(
   };
 }
 
-/** The message in the server's channel for Unown sightings, which stays. */
-export function sightingMessage(view: SpawnView, regionChannelId: string): ClassicMessage {
+/**
+ * The message in the server's channel for Unown sightings, which stays: the report's container
+ * with the sentence that names the region as its head, and the caution in small print (no
+ * "goes away": the sighting stays, and no footer, as before).
+ */
+export function sightingMessage(view: SpawnView, regionChannelId: string): V2Message {
   return {
-    content: spawnSentence(view, regionChannelId).replace(/\.$/, ':'),
-    embeds: [spawnEmbed(view)],
+    v2: true,
+    components: [
+      container(SPAWN_COLOUR, [
+        spawnHead(view, spawnSentence(view, regionChannelId)),
+        ...spawnBody(view, SPAWN_CAUTION),
+      ]),
+    ],
   };
 }
diff --git a/src/services/spawn-service.test.ts b/src/services/spawn-service.test.ts
index 0aaba0b2348bcdd2fac8a80cb6ae7297b3baf3d9..aca1dc0732cb018d9f8adcfb2fad632e97290869 100644
--- a/src/services/spawn-service.test.ts
+++ b/src/services/spawn-service.test.ts
@@ -4,14 +4,23 @@ import { catalogueFixture, iconsFixture } from '../../test/support/game-data.js'
 import { WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
+import {
+  accentOf,
+  componentCount,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
+import { MAX_DETAILS } from '../commands/notifications/wild.js';
 import {
   sightingMessage,
   SPAWN_FOOTER,
   SPAWN_MINUTES,
+  SPAWN_CAUTION,
   SPAWN_WARNING,
   spawnBrief,
-  spawnEmbed,
   spawnFooter,
   spawnMessage,
   spawnSentence,
@@ -297,7 +306,7 @@ describe('SpawnService', () => {
     );
     const pictures = made.gateway
       .messagesIn(WEST_CHANNEL)
-      .map((posted) => posted.message.embeds?.[0]?.thumbnail?.url);
+      .map((posted) => thumbnailOf(posted.message));
     expect(pictures).toEqual([
       boss?.image,
       'https://cdn.leekduck.com/assets/img/pokemon_icons/pm147.icon.png',
@@ -358,21 +367,77 @@ describe('the messages of a spawn report', () => {
     reporter: { id: ALICE, name: 'Alice' },
   };
 
-  it('has the warning alone when nothing was said about where', () => {
-    expect(spawnEmbed(view)).toEqual({ color: 0x2ecc71, description: SPAWN_WARNING });
-    expect(spawnEmbed({ ...view, details: '   ' }).description).toBe(SPAWN_WARNING);
+  const GONE = Date.UTC(2026, 9, 15, 16, 30);
+
+  it('is one container: the head with the picture, where it is, and the small print', () => {
+    const message = spawnMessage(
+      {
+        ...view,
+        iv: 'perfect',
+        details: 'by the fountain',
+        image: 'https://example.com/pm147.png',
+      },
+      SPAWN_FOOTER,
+      GONE,
+    );
+    expect(textDisplays(message)).toEqual([
+      `### Wild Dratini\nwith 100% IVs · reported by **Alice** (<@${ALICE}>)\n` +
+        `This report goes away <t:${String(GONE / 1000)}:R>.`,
+      '**Where**\nby the fountain',
+      `-# Spawns can be gone before you get there. · ${SPAWN_FOOTER}`,
+    ]);
+    expect(SPAWN_CAUTION).toBe('Spawns can be gone before you get there.');
+    expect(accentOf(message)).toBe(0x2ecc71);
+    expect(thumbnailOf(message)).toBe('https://example.com/pm147.png');
+    expectV2Sendable(message);
+  });
+
+  it('has no Where when nothing was said about where, and no picture without one', () => {
+    for (const details of [null, '   ']) {
+      const message = spawnMessage({ ...view, details }, SPAWN_FOOTER, GONE);
+      expect(textDisplays(message)).toEqual([
+        `### Wild Dratini\nReported by **Alice** (<@${ALICE}>)\n` +
+          `This report goes away <t:${String(GONE / 1000)}:R>.`,
+        `-# ${SPAWN_CAUTION} · ${SPAWN_FOOTER}`,
+      ]);
+      expect(thumbnailOf(message)).toBeUndefined();
+      expectV2Sendable(message);
+    }
+  });
+
+  it('keeps the longest report within what Discord takes', () => {
+    const typed: SpawnView = {
+      pokemon: '*_~`|>['.repeat(20),
+      iv: 'zero',
+      details: '*_~`|>[<@1>'.repeat(Math.ceil(MAX_DETAILS / 11)).slice(0, MAX_DETAILS),
+      reporter: { id: ALICE, name: '*_~`|>['.repeat(5) },
+      image: 'https://example.com/pm147.png',
+    };
+    for (const message of [
+      spawnMessage(typed, SPAWN_FOOTER, GONE),
+      sightingMessage(typed, WEST_CHANNEL),
+    ]) {
+      expect(componentCount(message)).toBeLessThanOrEqual(40);
+      expectV2Sendable(message);
+    }
   });
 
   it('names the reporter with the mention in the server and by name alone elsewhere', () => {
-    expect(spawnMessage(view, SPAWN_FOOTER).content).toBe(
-      `A wild **Dratini** has been reported by **Alice** (<@${ALICE}>):`,
+    expect(textDisplays(spawnMessage(view, SPAWN_FOOTER, GONE))[0]).toContain(
+      `Reported by **Alice** (<@${ALICE}>)`,
     );
-    expect(spawnMessage(view, SPAWN_FOOTER).embeds?.[0]?.footer).toEqual({ text: SPAWN_FOOTER });
     // A direct message leads to the report by its button: the sentence has no address.
     expect(spawnSentence({ ...view, iv: 'zero' }, WEST_CHANNEL)).toBe(
       `A wild **Dratini** with 0% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
     );
-    expect(sightingMessage(view, WEST_CHANNEL).embeds?.[0]?.footer).toBeUndefined();
+    // The sighting stays: its head is the sentence that names the region, and no footer.
+    expect(
+      textDisplays(sightingMessage({ ...view, details: 'at the library' }, WEST_CHANNEL)),
+    ).toEqual([
+      `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
+      '**Where**\nat the library',
+      `-# ${SPAWN_CAUTION}`,
+    ]);
   });
 
   it('shows no working link a member typed, in the details or in their name, in any message', () => {
@@ -384,12 +449,9 @@ describe('the messages of a spawn report', () => {
     const details =
       'free coins https:\u200B//evil.\u200Bexample/a\\_b www.\u200Bevil.example discord.\u200Bgg/abc';
     const texts = [
-      spawnEmbed(typed).description,
-      spawnMessage(typed, SPAWN_FOOTER).content,
-      spawnMessage(typed, SPAWN_FOOTER).embeds?.[0]?.description,
+      textOf(spawnMessage(typed, SPAWN_FOOTER, GONE)),
       spawnTextMessage(typed, SPAWN_FOOTER).content,
-      sightingMessage(typed, WEST_CHANNEL).content,
-      sightingMessage(typed, WEST_CHANNEL).embeds?.[0]?.description,
+      textOf(sightingMessage(typed, WEST_CHANNEL)),
       // The direct message: the sentence and the brief.
       spawnSentence(typed, WEST_CHANNEL),
       ...spawnBrief(typed, 0).lines,
@@ -399,10 +461,12 @@ describe('the messages of a spawn report', () => {
       expect(text).not.toContain('www.e');
       expect(text).not.toMatch(/discord\.gg/);
     }
-    expect(spawnEmbed(typed).description).toBe(`${details}\n\n${SPAWN_WARNING}`);
-    expect(spawnTextMessage(typed, SPAWN_FOOTER).content).toContain(details);
-    expect(spawnMessage(typed, SPAWN_FOOTER).content).toBe(
-      `A wild **Dratini** has been reported by **discord.\u200Bgg/xyz** (<@${ALICE}>):`,
+    expect(spawnTextMessage(typed, SPAWN_FOOTER).content).toContain(
+      `${details}\n\n${SPAWN_WARNING}`,
+    );
+    expect(textDisplays(spawnMessage(typed, SPAWN_FOOTER, GONE))[1]).toBe(`**Where**\n${details}`);
+    expect(textDisplays(spawnMessage(typed, SPAWN_FOOTER, GONE))[0]).toContain(
+      `Reported by **discord.\u200Bgg/xyz** (<@${ALICE}>)`,
     );
     expect(spawnSentence(typed, WEST_CHANNEL)).toBe(
       `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **discord.\u200Bgg/xyz**.`,
@@ -413,17 +477,11 @@ describe('the messages of a spawn report', () => {
     expect(spawnFooter(true)).toBe(SPAWN_FOOTER);
     expect(SPAWN_FOOTER).toBe('/want tells you of spawns like this one · /wild reports one');
     expect(spawnFooter(false)).toBe('/wild reports a spawn like this one');
-    expect(spawnMessage(view, spawnFooter(false)).embeds?.[0]?.footer).toEqual({
-      text: '/wild reports a spawn like this one',
-    });
+    expect(textDisplays(spawnMessage(view, spawnFooter(false), GONE)).at(-1)).toBe(
+      `-# ${SPAWN_CAUTION} · /wild reports a spawn like this one`,
+    );
     expect(spawnTextMessage(view, spawnFooter(false)).content).toMatch(
       /\n-# \/wild reports a spawn like this one$/,
     );
   });
-
-  it('shows the picture when there is one', () => {
-    expect(spawnEmbed({ ...view, image: 'https://example.com/pm147.png' }).thumbnail).toEqual({
-      url: 'https://example.com/pm147.png',
-    });
-  });
 });
diff --git a/src/services/spawn-service.ts b/src/services/spawn-service.ts
index 977f649385805eb7c5c846c7a741ffc82a621bdf..a2597bfff6cac5102e036818072e0a452750484b 100644
--- a/src/services/spawn-service.ts
+++ b/src/services/spawn-service.ts
@@ -188,7 +188,7 @@ export class SpawnService {
     // Without the permission to embed Discord would show the sentence alone: as text then.
     const footer = spawnFooter(settings.features.notifications);
     const message = gateway.mayPost(report.regionChannelId)
-      ? spawnMessage(view, footer)
+      ? spawnMessage(view, footer, eventAt + this.deleteAfterMs)
       : spawnTextMessage(view, footer);
     let messageId: string | undefined;
     try {
````

### Task 5: The region summary and region-channel status as components-v2 messages

Prototype commit: `4fdbfdddad130a184cc3b6c34ea5f9d96749db2e`

One container in blue: "Active raids" with a count of what is going on
(only the kinds there are, or the line for nothing), then the raids under a
bold heading per tier (Elite, Level 5, Mega Legendary, Super Mega, Mega,
Level 3, Level 1, each shadow tier after its plain one), then the trains
and the meetups. One text display per tier and section; all of it within
TEXT_BUDGET, the trains and meetups sure of their room and each tier of
its heading, what does not fit counted. The summary post is made like a
party's post and edited as v2 (a classic one is converted by the gateway);
an edit that would change nothing is still skipped. /status in a region
channel answers with the same message.

**Files:**

```
 src/commands/parties/in-meetup.test.ts      |  12 +-
 src/commands/parties/in-train.test.ts       |  11 +-
 src/commands/parties/status.test.ts         |  24 +++-
 src/commands/parties/status.ts              |   3 +-
 src/render/summary.test.ts                  | 359 ++++++++++++++++++++++++++++++------------------
 src/render/summary.ts                       | 134 +++++++++++++-----
 src/services/party-service.end.test.ts      |   6 +-
 src/services/party-service.meetup.test.ts   |  27 ++--
 src/services/party-service.relocate.test.ts |   3 +-
 src/services/party-service.test.ts          |  31 ++++-
 src/services/party-service.train.test.ts    |  21 ++-
 src/services/party-service.ts               |  27 ++--
 src/services/timed-party-service.test.ts    |   4 +-
 13 files changed, 426 insertions(+), 236 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/parties/status.test.ts src/render/summary.test.ts src/services/party-service.end.test.ts src/services/party-service.meetup.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-service.train.test.ts src/services/timed-party-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 4fdbfdddad130a184cc3b6c34ea5f9d96749db2e -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `The region summary and region-channel status as components-v2 messages`, the body above and the trailer, staging exactly
  `src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/parties/status.test.ts src/commands/parties/status.ts src/render/summary.test.ts src/render/summary.ts src/services/party-service.end.test.ts src/services/party-service.meetup.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-service.train.test.ts src/services/party-service.ts src/services/timed-party-service.test.ts`.

````diff
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index 55f373f5dd613838d137b154dfaa30ddff307b31..4af8df14ec9f0ebcb46fb7ab072eda891bbe20fd 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -1,5 +1,6 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
+  asV2,
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
@@ -36,7 +37,7 @@ import { cancelMeet, meet } from './meet.js';
 import { name } from './name.js';
 import { shout } from './shout.js';
 import { status, where } from './status.js';
-import { buttonsOf, header, textOf } from '../../../test/support/messages.js';
+import { buttonsOf, header, textDisplays, textOf } from '../../../test/support/messages.js';
 
 const all: CommandModule[] = [
   join,
@@ -633,10 +634,11 @@ describe('the other commands in the post of a meetup', () => {
 
   it('/status in the channel of the region lists the meetup under the raids', async () => {
     const made = await setup();
-    expect(await made.answer('status', {}, { channelId: WEST_CHANNEL, thread: undefined })).toBe(
-      'No raids right now. Report one with `/raid`.\n\n**Meetups**\n' +
-        `<#${made.postId}> · no time set · 1 trainer`,
-    );
+    const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
+    expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
+      '### Active raids\n1 meetup',
+      `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
+    ]);
   });
 
   it('/delete from staff closes the meetup: the post says who did it and is archived', async () => {
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index 463ebb66e0301b96a7c2239710decbec4e7ea9f6..c20aeb2ab5aa391cff2ee0d7b31c10f9dcc0898a 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -1,5 +1,6 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
+  asV2,
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
@@ -38,6 +39,7 @@ import {
   buttonLabels,
   buttonsOf,
   header,
+  textDisplays,
   textOf,
   thumbnailOf,
 } from '../../../test/support/messages.js';
@@ -601,10 +603,11 @@ describe('the other commands in the post of a train', () => {
 
   it('/status in the channel of the region lists the train under the raids', async () => {
     const made = await setup();
-    expect(await made.answer('status', {}, { channelId: WEST_CHANNEL, thread: undefined })).toBe(
-      'No raids right now. Report one with `/raid`.\n\n**Trains**\n' +
-        `<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
-    );
+    const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
+    expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
+      '### Active raids\n1 train',
+      `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
+    ]);
   });
 
   it('/delete from staff closes the train: the post says who did it and is archived', async () => {
diff --git a/src/commands/parties/status.test.ts b/src/commands/parties/status.test.ts
index 9cf3c7ebc15031b83daf8616e71deb0ed50dba49..b6c45b1eb3a14bfd4e0072ab674b6440522f00c6 100644
--- a/src/commands/parties/status.test.ts
+++ b/src/commands/parties/status.test.ts
@@ -1,6 +1,7 @@
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
+import { asV2, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
+import { textDisplays } from '../../../test/support/messages.js';
 import {
   EAST_CHANNEL,
   UNBOUNDED_CHANNEL,
@@ -59,24 +60,35 @@ describe('/status', () => {
 
   it('lists the raids of the region in its channel and in its forum, for the member alone', async () => {
     const made = await setup(yveltal);
-    const listed = `<#${made.postId}> · no time set · 1 trainer`;
+    const listed = [
+      '### Active raids\n1 raid',
+      `**Level 5**\n<#${made.postId}> · no time set · 1 trainer`,
+    ];
+    const shown = (used: { editReply: Parameters<typeof sent>[0] }) =>
+      textDisplays(asV2(sent(used.editReply)));
     const inChannel = await made.run('status', { channelId: WEST_CHANNEL });
     expect(inChannel.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
-    expect(sent(inChannel.editReply).content).toBe(listed);
+    // The list of the summary post, as a components-v2 message.
+    expect(sent(inChannel.editReply).flags).toBe(MessageFlags.IsComponentsV2);
+    expect(shown(inChannel)).toEqual(listed);
     expect(made.gateway.messagesIn(made.postId)).toEqual([]);
 
     const inForum = await made.run('status', { channelId: WEST_FORUM });
-    expect(sent(inForum.editReply).content).toBe(listed);
+    expect(shown(inForum)).toEqual(listed);
 
     const elsewhere = await made.run('status', { channelId: EAST_CHANNEL });
-    expect(sent(elsewhere.editReply).content).toBe('No raids right now. Report one with `/raid`.');
+    expect(shown(elsewhere)).toEqual([
+      '### Active raids\nNo raids right now. Report one with `/raid`.',
+    ]);
   });
 
   it('lists the region in the post of a raid that has ended', async () => {
     const made = await setup(yveltal);
     await made.service.end(made.party.id);
     const used = await made.run('status');
-    expect(sent(used.editReply).content).toBe('No raids right now. Report one with `/raid`.');
+    expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
+      '### Active raids\nNo raids right now. Report one with `/raid`.',
+    ]);
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
   });
 
diff --git a/src/commands/parties/status.ts b/src/commands/parties/status.ts
index 4ca676b1234aec22eb3d1f54acd7f1ea23a6766a..25bd792de2ee739e0a25e8020ac49b1926daaefc 100644
--- a/src/commands/parties/status.ts
+++ b/src/commands/parties/status.ts
@@ -1,6 +1,7 @@
 import { SlashCommandBuilder } from 'discord.js';
 import type { Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
+import { v2Answer } from '../../discord/late-reply.js';
 import {
   partyOf,
   regionChannelOf,
@@ -58,7 +59,7 @@ export const status: SimpleCommand = {
         'Use this in the channel of a region, or in the post of a raid, train or meetup.',
       );
     }
-    await interaction.editReply({ content: ctx.partyService.summaryText(region.id) });
+    await interaction.editReply(v2Answer(ctx.partyService.summaryMessage(region.id)));
   },
 };
 
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index 0497f266606df1f3d5e04d4465004358553a54e5..e290498c96718268e6c56a6132caeefdce8b67cf 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
+import { accentOf, componentCount, textDisplays } from '../../test/support/messages.js';
 import {
   ALICE,
   at,
@@ -10,27 +11,52 @@ import {
   testTrain,
   withAttendees,
 } from '../../test/support/parties.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import type { MeetupParty, RaidParty, TrainParty } from '../domain/party/party.js';
 import { setEndTime, setHatchTime } from '../domain/party/raid.js';
 import { endParty } from '../domain/party/party.js';
+import { TEXT_BUDGET } from './party-post.js';
+import { LIST_COLOUR } from './v2.js';
+import { RAID_LEVELS, SHADOW_RAID_LEVELS } from '../domain/pogo/raid-tier.js';
 import {
+  NOTHING_GOING,
   renderRegionLink,
   renderSummary,
+  SUMMARY_TIERS,
+  tierHeading,
   type ListedMeetup,
   type ListedRaid,
   type ListedTrain,
 } from './summary.js';
 
 const rules = testRaidRules();
-const ID = (n: number): string => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
+const ID = (n: number): string => `00000000-0000-4000-8000-0000${String(n).padStart(8, '0')}`;
 
 function listed(party: RaidParty, title: string, post: string | null): ListedRaid {
   return { party: { ...party, forumPostId: post }, title };
 }
 
+/** The whole text of a summary, as Discord counts it against the text a message may have. */
+const textLength = (message: V2Message): number =>
+  textDisplays(message).reduce((sum, text) => sum + text.length, 0);
+
+/** The lines of the text display that begins with `heading`, without the heading. */
+function linesUnder(message: V2Message, heading: string): string[] {
+  const block = textDisplays(message).find((text) => text.startsWith(`${heading}\n`));
+  if (block === undefined) throw new Error(`no block ${heading}`);
+  return block.split('\n').slice(1);
+}
+
+const NOTHING = `### Active raids\n${NOTHING_GOING}`;
+
 describe('renderSummary', () => {
-  it('says so when there is no raid', () => {
-    expect(renderSummary([], PARTY_NOW)).toBe('No raids right now. Report one with `/raid`.');
+  it('says so when there is nothing, in one container', () => {
+    const message = renderSummary([], PARTY_NOW);
+    expect(textDisplays(message)).toEqual([NOTHING]);
+    expect(NOTHING_GOING).toBe('No raids right now. Report one with `/raid`.');
+    expect(accentOf(message)).toBe(LIST_COLOUR);
+    expect(message.components).toHaveLength(1);
   });
 
   it('lists the raids by when they end, with a link, the time that matters and the head count', () => {
@@ -40,7 +66,7 @@ describe('renderSummary', () => {
       { [ALICE]: { number: 3 } },
     );
     const timeless = testRaid({ id: ID(3) });
-    const text = renderSummary(
+    const message = renderSummary(
       [
         listed(egg, 'T5 egg · The Stacks', '300000000000000001'),
         listed(timeless, 'T5 egg · Old Stone Fountain', '300000000000000003'),
@@ -48,61 +74,137 @@ describe('renderSummary', () => {
       ],
       PARTY_NOW,
     );
-    expect(text.split('\n')).toEqual([
-      `<#300000000000000002> · ends <t:${at('2026-10-13T14:20') / 1000}:R> · 4 trainers`,
-      `<#300000000000000001> · hatches <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
-      '<#300000000000000003> · no time set · 1 trainer',
+    expect(textDisplays(message)).toEqual([
+      '### Active raids\n3 raids',
+      [
+        '**Level 5**',
+        `<#300000000000000002> · ends <t:${at('2026-10-13T14:20') / 1000}:R> · 4 trainers`,
+        `<#300000000000000001> · hatches <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
+        '<#300000000000000003> · no time set · 1 trainer',
+      ].join('\n'),
+    ]);
+  });
+
+  it('groups the raids by tier, the rarest first and each shadow tier after its plain one', () => {
+    const raids = [...SUMMARY_TIERS]
+      .reverse()
+      .map((tier, n) =>
+        listed(
+          testRaid({ id: ID(n), tier }),
+          'raid',
+          `30000000000000${String(n).padStart(4, '0')}`,
+        ),
+      );
+    const message = renderSummary(raids, PARTY_NOW);
+    expect(textDisplays(message).map((text) => text.split('\n')[0])).toEqual([
+      '### Active raids',
+      '**Elite**',
+      '**Level 5**',
+      '**Shadow Level 5**',
+      '**Mega Legendary**',
+      '**Super Mega**',
+      '**Mega**',
+      '**Level 3**',
+      '**Shadow Level 3**',
+      '**Level 1**',
+      '**Shadow Level 1**',
     ]);
+    expect(tierHeading({ level: 'T3', shadow: true })).toBe('**Shadow Level 3**');
+    // Every tier there is, once.
+    expect(SUMMARY_TIERS).toHaveLength(RAID_LEVELS.length + SHADOW_RAID_LEVELS.length);
+    expect(new Set(SUMMARY_TIERS.map((tier) => `${tier.level}:${String(tier.shadow)}`)).size).toBe(
+      SUMMARY_TIERS.length,
+    );
   });
 
   it('leaves out raids that have ended, by the clock or for good', () => {
     const over = setEndTime(testRaid({ id: ID(1) }), PARTY_NOW - MINUTE, rules, PARTY_NOW);
     const archived = endParty(testRaid({ id: ID(2) }));
-    const text = renderSummary(
+    const message = renderSummary(
       [listed(over, 'a', '300000000000000001'), listed(archived, 'b', '300000000000000002')],
       PARTY_NOW,
     );
-    expect(text).toBe('No raids right now. Report one with `/raid`.');
+    expect(textDisplays(message)).toEqual([NOTHING]);
   });
 
-  it('names a raid whose post does not exist yet by its title', () => {
-    expect(renderSummary([listed(testRaid(), 'T5 egg · The Stacks', null)], PARTY_NOW)).toBe(
-      '**T5 egg · The Stacks** · no time set · 1 trainer',
-    );
-  });
-
-  it('makes the title of a raid without a post plain text', () => {
-    expect(renderSummary([listed(testRaid(), 'M*A*S*H Memorial', null)], PARTY_NOW)).toBe(
-      '**M\\*A\\*S\\*H Memorial** · no time set · 1 trainer',
-    );
+  it('names a raid whose post does not exist yet by its title, made plain', () => {
+    expect(
+      linesUnder(
+        renderSummary([listed(testRaid(), 'T5 egg · The Stacks', null)], PARTY_NOW),
+        '**Level 5**',
+      ),
+    ).toEqual(['**T5 egg · The Stacks** · no time set · 1 trainer']);
+    expect(
+      linesUnder(
+        renderSummary([listed(testRaid(), 'M*A*S*H Memorial', null)], PARTY_NOW),
+        '**Level 5**',
+      ),
+    ).toEqual(['**M\\*A\\*S\\*H Memorial** · no time set · 1 trainer']);
   });
 
   it('keeps the last raid when its line fits, and says "and 1 more" only when it does not', () => {
     const one = (title: string, n: number) => listed(testRaid({ id: ID(n) }), title, null);
-    const lineLength = (title: string) => renderSummary([one(title, 0)], PARTY_NOW).length;
-    // 24 lines of 80 characters and a last one that brings the text to exactly 2000.
-    const title = 'x'.repeat(80 - lineLength(''));
-    const filler = Array.from({ length: 24 }, (_, n) => one(title, n));
-    const lastTitle = 'y'.repeat(2000 - 24 * 81 - lineLength(''));
+    const filler = Array.from({ length: 24 }, (_, n) => one('x'.repeat(130), n));
+    const base = textLength(renderSummary([...filler, one('', 30)], PARTY_NOW));
+    const lastTitle = 'y'.repeat(TEXT_BUDGET - base);
     const fits = renderSummary([...filler, one(lastTitle, 30)], PARTY_NOW);
-    expect(fits).toHaveLength(2000);
-    expect(fits.split('\n')).toHaveLength(25);
-    expect(fits).not.toContain('more');
+    expect(textLength(fits)).toBe(TEXT_BUDGET);
+    expect(linesUnder(fits, '**Level 5**')).toHaveLength(25);
+    expect(textDisplays(fits).join('\n')).not.toContain('more');
     const tooLong = renderSummary([...filler, one(`${lastTitle}y`, 30)], PARTY_NOW);
-    expect(tooLong.split('\n').at(-1)).toBe('…and 1 more');
-    expect(tooLong.length).toBeLessThanOrEqual(2000);
+    expect(linesUnder(tooLong, '**Level 5**').at(-1)).toBe('…and 1 more');
+    expect(textLength(tooLong)).toBeLessThanOrEqual(TEXT_BUDGET);
   });
 
   it('fits into one message however many raids there are, and counts the rest', () => {
-    const many = Array.from({ length: 80 }, (_, n) =>
-      listed(testRaid({ id: ID(n) }), `raid ${n}`, `3000000000000000${String(n).padStart(2, '0')}`),
+    const many = Array.from({ length: 200 }, (_, n) =>
+      listed(testRaid({ id: ID(n) }), `raid ${n}`, `3000000000000${String(n).padStart(5, '0')}`),
     );
-    const text = renderSummary(many, PARTY_NOW);
-    expect(text.length).toBeLessThanOrEqual(2000);
-    const lines = text.split('\n');
+    const message = renderSummary(many, PARTY_NOW);
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 100);
+    expect(textDisplays(message)[0]).toBe('### Active raids\n200 raids');
+    const lines = linesUnder(message, '**Level 5**');
     const last = lines.at(-1);
     expect(last).toMatch(/^…and \d+ more$/);
-    expect(lines.length - 1 + Number(/\d+/.exec(last ?? '')?.[0])).toBe(80);
+    expect(lines.length - 1 + Number(/\d+/.exec(last ?? '')?.[0])).toBe(200);
+    expectV2Sendable(message);
+  });
+
+  it('keeps every tier and kind at once, with texts that need escapes, within what Discord takes', () => {
+    const escapes = '*_~`|>[]<@1>'.repeat(20);
+    const raids = SUMMARY_TIERS.flatMap((tier, t) =>
+      Array.from({ length: 30 }, (_, n) =>
+        listed(testRaid({ id: ID(t * 100 + n), tier }), escapes, null),
+      ),
+    );
+    const trains = Array.from({ length: 30 }, (_, n) => ({
+      party: testTrain({ id: ID(5000 + n) }),
+      title: escapes,
+      at: escapes,
+    }));
+    const meetups = Array.from({ length: 30 }, (_, n) => ({
+      party: testMeetup({ id: ID(6000 + n) }),
+      title: escapes,
+    }));
+    const message = renderSummary(raids, PARTY_NOW, meetups, trains);
+    expect(componentCount(message)).toBeLessThanOrEqual(40);
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    expectV2Sendable(message);
+    // Every tier is there, if only to say how many it has, and so are the trains and meetups.
+    const headings = textDisplays(message).map((text) => text.split('\n')[0]);
+    expect(headings).toEqual([
+      '### Active raids',
+      ...SUMMARY_TIERS.map(tierHeading),
+      '**Trains**',
+      '**Meetups**',
+    ]);
+    expect(textDisplays(message)[0]).toBe(
+      `### Active raids\n${String(raids.length)} raids · 30 trains · 30 meetups`,
+    );
+    for (const heading of ['**Trains**', '**Meetups**']) {
+      expect(linesUnder(message, heading).length).toBeGreaterThan(1);
+    }
   });
 });
 
@@ -123,7 +225,7 @@ describe('renderSummary with meetups', () => {
     times: { start?: number; end?: number } = {},
     change: (party: MeetupParty) => MeetupParty = (party) => party,
   ): ListedMeetup {
-    const made = testMeetup({ id: ID(50 + order), now: PARTY_NOW + order * MINUTE });
+    const made = testMeetup({ id: ID(500 + order), now: PARTY_NOW + order * MINUTE });
     const party: MeetupParty = change({
       ...made,
       forumPostId: `3000000000000001${String(posts++).padStart(2, '0')}`,
@@ -134,31 +236,34 @@ describe('renderSummary with meetups', () => {
   }
   const link = (listed: ListedMeetup) => `<#${listed.party.forumPostId ?? ''}>`;
 
-  it('lists them under the raids, under a heading of their own', () => {
+  it('lists them under the raids, under a heading of their own, after a line', () => {
     const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
     const picnic = meetup(1, { start: PARTY_NOW + 2 * HOUR });
-    expect(renderSummary([raid], PARTY_NOW, [picnic]).split('\n')).toEqual([
-      '<#300000000000000001> · no time set · 1 trainer',
-      '',
-      '**Meetups**',
-      `${link(picnic)} · starts ${stamp(PARTY_NOW + 2 * HOUR)} · 1 trainer`,
+    const message = renderSummary([raid], PARTY_NOW, [picnic]);
+    expect(textDisplays(message)).toEqual([
+      '### Active raids\n1 raid · 1 meetup',
+      '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
+      `**Meetups**\n${link(picnic)} · starts ${stamp(PARTY_NOW + 2 * HOUR)} · 1 trainer`,
     ]);
+    // A line under the count, and one between the raids and the meetups.
+    const kinds = (message.components[0] as { components: { type: number }[] }).components.map(
+      (component) => component.type,
+    );
+    expect(kinds).toEqual([10, 14, 10, 14, 10]);
   });
 
-  it('still says that there is no raid when there are only meetups', () => {
+  it('counts only the meetups when there are only meetups', () => {
     const picnic = meetup(1);
-    expect(renderSummary([], PARTY_NOW, [picnic]).split('\n')).toEqual([
-      'No raids right now. Report one with `/raid`.',
-      '',
-      '**Meetups**',
-      `${link(picnic)} · no time set · 1 trainer`,
+    expect(textDisplays(renderSummary([], PARTY_NOW, [picnic]))).toEqual([
+      '### Active raids\n1 meetup',
+      `**Meetups**\n${link(picnic)} · no time set · 1 trainer`,
     ]);
   });
 
   it('is the list it always was for a region without meetups', () => {
     const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
-    expect(renderSummary([raid], PARTY_NOW, [])).toBe(renderSummary([raid], PARTY_NOW));
-    expect(renderSummary([], PARTY_NOW, [])).toBe('No raids right now. Report one with `/raid`.');
+    expect(renderSummary([raid], PARTY_NOW, [])).toEqual(renderSummary([raid], PARTY_NOW));
+    expect(textDisplays(renderSummary([], PARTY_NOW, []))).toEqual([NOTHING]);
   });
 
   it('says the time that matters: the start, then the end, or since when it goes on', () => {
@@ -167,8 +272,8 @@ describe('renderSummary with meetups', () => {
     const open = meetup(3, { start: PARTY_NOW - 2 * HOUR });
     const endOnly = meetup(4, { end: PARTY_NOW + 5 * HOUR });
     const crowd = meetup(5, {}, (party) => withAttendees(party, { [ALICE]: { number: 4 } }));
-    const lines = renderSummary([], PARTY_NOW, [ahead, going, open, endOnly, crowd]).split('\n');
-    expect(lines.slice(3)).toEqual([
+    const message = renderSummary([], PARTY_NOW, [ahead, going, open, endOnly, crowd]);
+    expect(linesUnder(message, '**Meetups**')).toEqual([
       `${link(open)} · started ${stamp(PARTY_NOW - 2 * HOUR)} · 1 trainer`,
       `${link(going)} · ends ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
       `${link(ahead)} · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
@@ -182,67 +287,65 @@ describe('renderSummary with meetups', () => {
     const second = meetup(3);
     const first = meetup(2);
     const soon = meetup(4, { start: PARTY_NOW + HOUR });
-    const lines = renderSummary([], PARTY_NOW, [late, second, first, soon]).split('\n');
-    expect(lines.slice(3).map((text) => text.split(' ')[0])).toEqual(
-      [soon, late, first, second].map(link),
+    const lines = linesUnder(
+      renderSummary([], PARTY_NOW, [late, second, first, soon]),
+      '**Meetups**',
     );
+    expect(lines.map((text) => text.split(' ')[0])).toEqual([soon, late, first, second].map(link));
   });
 
   it('leaves out meetups that are over, by the clock or for good', () => {
     const over = meetup(1, { start: PARTY_NOW - 2 * HOUR, end: PARTY_NOW });
     const ended = meetup(2, {}, (party) => endParty(party));
     const going = meetup(3);
-    expect(renderSummary([], PARTY_NOW, [over, ended, going]).split('\n').slice(2)).toEqual([
-      '**Meetups**',
+    expect(linesUnder(renderSummary([], PARTY_NOW, [over, ended, going]), '**Meetups**')).toEqual([
       `${link(going)} · no time set · 1 trainer`,
     ]);
     // With none left there is no heading either.
-    expect(renderSummary([], PARTY_NOW, [over, ended])).toBe(
-      'No raids right now. Report one with `/raid`.',
-    );
+    expect(textDisplays(renderSummary([], PARTY_NOW, [over, ended]))).toEqual([NOTHING]);
   });
 
   it('names a meetup without a post by its title, made plain', () => {
     const made = testMeetup({ name: '**Picnic**' });
-    const text = renderSummary([], PARTY_NOW, [{ party: made, title: 'Meetup · **Picnic**' }]);
-    expect(text.split('\n')[3]).toBe('**Meetup · \\*\\*Picnic\\*\\*** · no time set · 1 trainer');
+    const message = renderSummary([], PARTY_NOW, [{ party: made, title: 'Meetup · **Picnic**' }]);
+    expect(linesUnder(message, '**Meetups**')).toEqual([
+      '**Meetup · \\*\\*Picnic\\*\\*** · no time set · 1 trainer',
+    ]);
   });
 
   it('gives the meetups the room that few raids leave', () => {
     const raid = listed(testRaid({ id: ID(1) }), 'T5 egg', '300000000000000001');
-    const meetups = Array.from({ length: 30 }, (_unused, n) => meetup(n));
-    const text = renderSummary([raid], PARTY_NOW, meetups);
-    expect(text.length).toBeLessThanOrEqual(2000);
-    const lines = text.split('\n');
-    // Every one of the thirty is listed: far more than their 600 characters alone would hold.
-    expect(lines.slice(3)).toHaveLength(30);
+    const meetups = Array.from({ length: 50 }, (_unused, n) => meetup(n));
+    const message = renderSummary([raid], PARTY_NOW, meetups);
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    // Every one of the fifty is listed: far more than their 600 characters alone would hold.
+    const lines = linesUnder(message, '**Meetups**');
+    expect(lines).toHaveLength(50);
     expect(lines.at(-1)).not.toMatch(/more$/);
-    expect(text.length).toBeGreaterThan(1200);
   });
 
   it('fills the message when there are more meetups than fit, and counts the rest', () => {
-    const meetups = Array.from({ length: 60 }, (_unused, n) => meetup(n));
-    const text = renderSummary([], PARTY_NOW, meetups);
-    expect(text.length).toBeLessThanOrEqual(2000);
-    expect(text.length).toBeGreaterThan(1900);
-    expect(text.split('\n').at(-1)).toMatch(/^…and \d+ more$/);
+    const meetups = Array.from({ length: 120 }, (_unused, n) => meetup(n));
+    const message = renderSummary([], PARTY_NOW, meetups);
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 100);
+    expect(linesUnder(message, '**Meetups**').at(-1)).toMatch(/^…and \d+ more$/);
   });
 
   it('stays one message with many of both, and counts what it left out of each', () => {
-    const raids = Array.from({ length: 60 }, (_unused, n) =>
-      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000002${String(n).padStart(2, '0')}`),
+    const raids = Array.from({ length: 120 }, (_unused, n) =>
+      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
     );
-    const meetups = Array.from({ length: 30 }, (_unused, n) => meetup(n));
-    const text = renderSummary(raids, PARTY_NOW, meetups);
-    expect(text.length).toBeLessThanOrEqual(2000);
-    const lines = text.split('\n');
-    const heading = lines.indexOf('**Meetups**');
-    expect(lines[heading - 1]).toBe('');
+    const meetups = Array.from({ length: 60 }, (_unused, n) => meetup(n));
+    const message = renderSummary(raids, PARTY_NOW, meetups);
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
     // The raids give way to the meetups, which have their own room, and both say what is missing.
-    expect(lines[heading - 2]).toMatch(/^…and \d+ more$/);
-    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
-    expect(lines.slice(heading + 1, -1).length).toBeGreaterThan(5);
-    expect(lines.slice(0, heading - 2).length).toBeGreaterThan(15);
+    const raidLines = linesUnder(message, '**Level 5**');
+    const meetupLines = linesUnder(message, '**Meetups**');
+    expect(raidLines.at(-1)).toMatch(/^…and \d+ more$/);
+    expect(meetupLines.at(-1)).toMatch(/^…and \d+ more$/);
+    expect(meetupLines.length).toBeGreaterThan(5);
+    expect(raidLines.length).toBeGreaterThan(30);
   });
 });
 
@@ -269,7 +372,7 @@ describe('renderSummary with trains', () => {
     times: { start?: number; end?: number } = {},
     at?: string,
   ): ListedTrain {
-    const made = testTrain({ id: ID(70 + order), now: PARTY_NOW + order * MINUTE });
+    const made = testTrain({ id: ID(700 + order), now: PARTY_NOW + order * MINUTE });
     const party: TrainParty = {
       ...made,
       forumPostId: `3000000000000003${String(posts++).padStart(2, '0')}`,
@@ -285,31 +388,15 @@ describe('renderSummary with trains', () => {
     const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
     const rolling = train(1, { route: [4, 1], stop: 1 }, { start: PARTY_NOW + HOUR }, 'The Stacks');
     const picnic = { party: testMeetup(), title: 'Meetup · Community Day picnic' };
-    expect(renderSummary([raid], PARTY_NOW, [picnic], [rolling]).split('\n')).toEqual([
-      '<#300000000000000001> · no time set · 1 trainer',
-      '',
-      '**Trains**',
-      `${link(rolling)} · at The Stacks · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
-      '',
-      '**Meetups**',
-      '**Meetup · Community Day picnic** · no time set · 1 trainer',
-    ]);
-    expect(renderSummary([], PARTY_NOW, [], [rolling]).split('\n').slice(0, 3)).toEqual([
-      'No raids right now. Report one with `/raid`.',
-      '',
-      '**Trains**',
-    ]);
-  });
-
-  it('is the list it always was for a region without trains', () => {
-    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg', '300000000000000001');
-    const picnic = { party: testMeetup(), title: 'Meetup · Community Day picnic' };
-    expect(renderSummary([raid], PARTY_NOW, [picnic], []).split('\n')).toEqual([
-      '<#300000000000000001> · no time set · 1 trainer',
-      '',
-      '**Meetups**',
-      '**Meetup · Community Day picnic** · no time set · 1 trainer',
+    expect(textDisplays(renderSummary([raid], PARTY_NOW, [picnic], [rolling]))).toEqual([
+      '### Active raids\n1 raid · 1 train · 1 meetup',
+      '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
+      `**Trains**\n${link(rolling)} · at The Stacks · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
+      '**Meetups**\n**Meetup · Community Day picnic** · no time set · 1 trainer',
     ]);
+    expect(textDisplays(renderSummary([], PARTY_NOW, [], [rolling]))[0]).toBe(
+      '### Active raids\n1 train',
+    );
   });
 
   it('says where each train is: at a gym, without a route yet, or through with it', () => {
@@ -317,8 +404,8 @@ describe('renderSummary with trains', () => {
     const going = train(2, { route: [4, 1], stop: 0 }, { end: PARTY_NOW + HOUR }, '**Bridge**');
     const finished = train(3, { route: [4, 1], stop: 2 }, { start: PARTY_NOW - HOUR });
     const gone = train(4, { route: [999], stop: 0 });
-    const lines = renderSummary([], PARTY_NOW, [], [none, going, finished, gone]).split('\n');
-    expect(lines.slice(3)).toEqual([
+    const message = renderSummary([], PARTY_NOW, [], [none, going, finished, gone]);
+    expect(linesUnder(message, '**Trains**')).toEqual([
       // By their start, then those without one as they were made.
       `${link(finished)} · route finished · started ${stamp(PARTY_NOW - HOUR)} · 1 trainer`,
       `${link(none)} · no route yet · no time set · 1 trainer`,
@@ -331,38 +418,36 @@ describe('renderSummary with trains', () => {
   it('leaves out a train whose end has passed or that has ended, and names one without a post', () => {
     const over = train(1, {}, { end: PARTY_NOW - MINUTE });
     const ended = { ...train(2), party: endParty(train(2).party) };
-    expect(renderSummary([], PARTY_NOW, [], [over, ended])).toBe(
-      'No raids right now. Report one with `/raid`.',
-    );
+    expect(textDisplays(renderSummary([], PARTY_NOW, [], [over, ended]))).toEqual([NOTHING]);
     const fresh = { party: testTrain({ name: '_Night_ train' }), title: 'Train · _Night_ train' };
-    expect(renderSummary([], PARTY_NOW, [], [fresh]).split('\n')[3]).toBe(
+    expect(linesUnder(renderSummary([], PARTY_NOW, [], [fresh]), '**Trains**')).toEqual([
       '**Train · \\_Night\\_ train** · no route yet · no time set · 1 trainer',
-    );
+    ]);
   });
 
   it('stays one message with many raids, trains and meetups, and counts what it left out of each', () => {
-    const raids = Array.from({ length: 60 }, (_unused, n) =>
-      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000002${String(n).padStart(2, '0')}`),
+    const raids = Array.from({ length: 120 }, (_unused, n) =>
+      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
     );
-    const trains = Array.from({ length: 40 }, (_unused, n) => train(n, { route: [4] }, {}, 'Gym'));
-    const meetups = Array.from({ length: 40 }, (_unused, n) => ({
+    const trains = Array.from({ length: 60 }, (_unused, n) => train(n, { route: [4] }, {}, 'Gym'));
+    const meetups = Array.from({ length: 60 }, (_unused, n) => ({
       party: {
-        ...testMeetup({ id: ID(n), now: PARTY_NOW + n }),
-        forumPostId: `3000000000000004${String(n).padStart(2, '0')}`,
+        ...testMeetup({ id: ID(900 + n), now: PARTY_NOW + n }),
+        forumPostId: `3000000000000${String(400 + n).padStart(5, '0')}`,
       },
       title: 'Meetup',
     }));
-    const text = renderSummary(raids, PARTY_NOW, meetups, trains);
-    expect(text.length).toBeLessThanOrEqual(2000);
-    expect(text.length).toBeGreaterThan(1850);
-    const lines = text.split('\n');
-    const [trainsAt, meetupsAt] = [lines.indexOf('**Trains**'), lines.indexOf('**Meetups**')];
-    expect(lines[trainsAt - 2]).toMatch(/^…and \d+ more$/);
-    expect(lines[meetupsAt - 2]).toMatch(/^…and \d+ more$/);
-    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
-    // Each of the three has a fair part of the message.
-    expect(trainsAt - 2).toBeGreaterThan(8);
-    expect(meetupsAt - trainsAt - 3).toBeGreaterThan(5);
-    expect(lines.length - meetupsAt - 2).toBeGreaterThan(5);
+    const message = renderSummary(raids, PARTY_NOW, meetups, trains);
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 150);
+    const [raidLines, trainLines, meetupLines] = ['**Level 5**', '**Trains**', '**Meetups**'].map(
+      (heading) => linesUnder(message, heading),
+    );
+    for (const lines of [raidLines, trainLines, meetupLines]) {
+      expect(lines?.at(-1)).toMatch(/^…and \d+ more$/);
+      // Each of the three has a fair part of the message.
+      expect(lines?.length).toBeGreaterThan(5);
+    }
+    expect(raidLines?.length).toBeGreaterThan(20);
   });
 });
diff --git a/src/render/summary.ts b/src/render/summary.ts
index b9640a64d89eebc1bc3ce0f67028ea02180b8e9a..0c6f56b88f359a1d0a2733522ca7e3ddd05bd932 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -7,10 +7,21 @@ import {
   type TrainParty,
 } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
+import {
+  RAID_LEVELS,
+  raidTier,
+  raidWords,
+  sameRaidTier,
+  type RaidLevel,
+  type RaidTier,
+} from '../domain/pogo/raid-tier.js';
+import type { APIComponentInContainer } from 'discord.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import { startTimeOf, timedOver } from '../domain/party/timed.js';
 import { routeFinished } from '../domain/party/train.js';
-import { trainerCount } from './party-post.js';
-import { LIMITS, plain, timestamp } from './text.js';
+import { TEXT_BUDGET, trainerCount } from './party-post.js';
+import { count, plain, timestamp } from './text.js';
+import { container, LIST_COLOUR, separator, textDisplay } from './v2.js';
 
 /** The title of the pinned post that lists a region's raids (spec 5.1). */
 export const SUMMARY_TITLE = 'Active raids';
@@ -108,8 +119,8 @@ function planned<L extends { party: TimedParty }>(listed: readonly L[], now: num
 }
 
 /**
- * As many of `texts`, one per line, as fit into `limit` characters; what does not fit is counted
- * in a last line.
+ * As many of `texts`, one per line, as fit into `limit` characters (each with its line break);
+ * what does not fit is counted in a last line.
  */
 function fitLines(texts: readonly string[], limit: number): string[] {
   const lines: string[] = [];
@@ -130,54 +141,109 @@ function fitLines(texts: readonly string[], limit: number): string[] {
   return lines;
 }
 
+/** What the list says when the region has nothing going on. */
+export const NOTHING_GOING = 'No raids right now. Report one with `/raid`.';
+
+/**
+ * The place of each level in a region's list: the rarest and largest first (an elite raid is
+ * rare, but where there is one it is the news). A record, so that a level the game adds cannot
+ * be left out of the list without the compiler saying so.
+ */
+const TIER_RANK: Readonly<Record<RaidLevel, number>> = {
+  Elite: 0,
+  T5: 1,
+  MegaLegendary: 2,
+  SuperMega: 3,
+  Mega: 4,
+  T3: 5,
+  T1: 6,
+};
+
+/** Every tier there is, in the order of the list: each shadow tier right after its plain one. */
+export const SUMMARY_TIERS: readonly RaidTier[] = [...RAID_LEVELS]
+  .sort((a, b) => TIER_RANK[a] - TIER_RANK[b])
+  .flatMap((level) => [false, true].flatMap((shadow) => raidTier(level, shadow) ?? []));
+
+/** A tier's heading in the list: the post's words without " raid" (`**Shadow Level 3**`). */
+export function tierHeading(tier: RaidTier): string {
+  return `**${raidWords(tier).replace(/ raid$/, '')}**`;
+}
+
+/**
+ * The room a heading of `heading` is sure of below the sections before it: the heading, its
+ * line break, and the line that says how many were left out.
+ */
+const sureRoom = (heading: string): number => heading.length + 1 + 20;
+
 /**
- * The text of the summary post: the region's raids that have not ended by the clock, soonest
- * end first. A raid that has ended but whose post is still open is left out. What does not fit
- * into one message is counted in a last line.
+ * The summary of a region as a components-v2 message (the draft "In the channels"): one
+ * container, `### Active raids` with a count of what is going on (`5 raids · 2 trains · 1
+ * meetup`, only the kinds there are; `NOTHING_GOING` when there is nothing), then the raids that
+ * have not ended by the clock under a bold heading per tier (`SUMMARY_TIERS`, the soonest end
+ * first in each; a raid that has ended but whose post is still open is left out), then the
+ * trains and the meetups, each under its heading: those that are not over, by their start, then
+ * those without one in the order they were made. One text display per tier and section, so the
+ * component count stays small whatever is listed.
  *
- * The region's trains and then its meetups follow, each under a heading of their own, when
- * there are any: those that are not over, by their start, then those without one in the order
- * they were made. A region without either has the list it always had. Each of the two is sure
- * of some room whatever stands above it (`SECTION_ROOM`), and has all that is left.
+ * All of it keeps within `TEXT_BUDGET`: the trains and the meetups are each sure of some room
+ * (`SECTION_ROOM`), every tier below another of its heading and a line, and each has all that is
+ * left over what the ones after it are sure of; what does not fit is counted (`…and N more`).
  */
 export function renderSummary(
   raids: readonly ListedRaid[],
   now: number,
   meetups: readonly ListedMeetup[] = [],
   trains: readonly ListedTrain[] = [],
-): string {
+): V2Message {
   const going = raids
     .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
     .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
+  const plannedTrains = planned(trains, now);
+  const plannedMeetups = planned(meetups, now);
+  const counts = [
+    ...(going.length > 0 ? [count(going.length, 'raid')] : []),
+    ...(plannedTrains.length > 0 ? [count(plannedTrains.length, 'train')] : []),
+    ...(plannedMeetups.length > 0 ? [count(plannedMeetups.length, 'meetup')] : []),
+  ];
+  const head = `### ${SUMMARY_TITLE}\n${counts.length === 0 ? NOTHING_GOING : counts.join(' · ')}`;
+  if (counts.length === 0) {
+    return { v2: true, components: [container(LIST_COLOUR, [textDisplay(head)])] };
+  }
   const size = (texts: readonly string[]): number =>
     texts.reduce((sum, text) => sum + text.length + 1, 0);
-  const sections = [
-    { heading: TRAINS_HEADING, lines: planned(trains, now).map((train) => trainLine(train, now)) },
-    {
-      heading: MEETUPS_HEADING,
-      lines: planned(meetups, now).map((meetup) => meetupLine(meetup, now)),
-    },
-  ]
+  const tiers = SUMMARY_TIERS.map((tier) => ({
+    heading: tierHeading(tier),
+    lines: going
+      .filter(({ party }) => sameRaidTier(party.raid.tier, tier))
+      .map((raid) => raidLine(raid, now)),
+    raid: true,
+    // A tier is sure of its heading and the line that counts what does not fit.
+    sure: (heading: string) => sureRoom(heading),
+  }));
+  const timed = [
+    { heading: TRAINS_HEADING, lines: plannedTrains.map((train) => trainLine(train, now)) },
+    { heading: MEETUPS_HEADING, lines: plannedMeetups.map((meetup) => meetupLine(meetup, now)) },
+  ].map((section) => ({
+    ...section,
+    raid: false,
+    sure: (heading: string) => Math.min(heading.length + 1 + size(section.lines), SECTION_ROOM),
+  }));
+  const sections = [...tiers, ...timed]
     .filter((section) => section.lines.length > 0)
-    .map((section) => {
-      // The empty line and the heading above the section, each with its line break.
-      const head = section.heading.length + 2;
-      return { ...section, head, room: Math.min(head + size(section.lines), SECTION_ROOM) };
-    });
+    .map(({ heading, lines, raid, sure }) => ({ heading, lines, raid, room: sure(heading) }));
   const reserved = (from: number): number =>
     sections.slice(from).reduce((sum, section) => sum + section.room, 0);
-  const text =
-    going.length === 0
-      ? ['No raids right now. Report one with `/raid`.']
-      : fitLines(
-          going.map((raid) => raidLine(raid, now)),
-          LIMITS.content - reserved(0),
-        );
+  let used = head.length;
+  const parts: APIComponentInContainer[] = [textDisplay(head)];
   for (const [index, section] of sections.entries()) {
-    const room = LIMITS.content - size(text) - section.head - reserved(index + 1);
-    text.push('', section.heading, ...fitLines(section.lines, room));
+    // A line under the count, and one between the raids and what follows them.
+    if (index === 0 || section.raid !== sections[index - 1]?.raid) parts.push(separator());
+    const room = TEXT_BUDGET - used - reserved(index + 1) - section.heading.length - 1;
+    const text = [section.heading, ...fitLines(section.lines, room)].join('\n');
+    used += text.length;
+    parts.push(textDisplay(text));
   }
-  return text.join('\n');
+  return { v2: true, components: [container(LIST_COLOUR, parts)] };
 }
 
 /**
diff --git a/src/services/party-service.end.test.ts b/src/services/party-service.end.test.ts
index 24bb139ea161518209f5174ecf7dad8d258f6da2..261ce6a63903ce97aa0a1d83392a402821d1178a 100644
--- a/src/services/party-service.end.test.ts
+++ b/src/services/party-service.end.test.ts
@@ -6,7 +6,7 @@ import { gymsFixture } from '../../test/support/providers.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { Coalescer } from './coalescer.js';
 import type { Member } from './attendance-service.js';
-import { buttonsOf, header } from '../../test/support/messages.js';
+import { buttonsOf, header, textOf } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -82,10 +82,10 @@ describe('PartyService.end', () => {
     await service.ensureSummary(west);
     await service.flush();
     const summary = regions.byId(1)?.summaryMessageId ?? '';
-    expect(gateway.posts.get(summary)?.message.content).toContain(made.postId);
+    expect(textOf(gateway.posts.get(summary)?.message)).toContain(made.postId);
     await service.end(made.party.id);
     await service.flush();
-    expect(gateway.posts.get(summary)?.message.content).not.toContain(made.postId);
+    expect(textOf(gateway.posts.get(summary)?.message)).not.toContain(made.postId);
   });
 
   it('ends the party quietly when its post is gone', async () => {
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 17abb7014a0b9bd6d65c2f8073f2e90190e47fca..3a7fc566204d39b04de6046486597220f955c8ea 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -292,13 +292,13 @@ describe('PartyService: the post of a meetup', () => {
 
   it('lists the meetup in the summary of its region, under the raids', async () => {
     const made = await createdMeetup();
-    expect(made.service.summaryText(1).split('\n')).toEqual([
-      'No raids right now. Report one with `/raid`.',
-      '',
-      '**Meetups**',
-      `<#${made.postId}> · no time set · 1 trainer`,
+    expect(textDisplays(made.service.summaryMessage(1))).toEqual([
+      '### Active raids\n1 meetup',
+      `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
+    ]);
+    expect(textDisplays(made.service.summaryMessage(2))).toEqual([
+      '### Active raids\nNo raids right now. Report one with `/raid`.',
     ]);
-    expect(made.service.summaryText(2)).toBe('No raids right now. Report one with `/raid`.');
     const gym = gymsFixture().get(1);
     if (!gym) throw new Error('no gym');
     const raid = await made.service.reportRaid({
@@ -310,11 +310,10 @@ describe('PartyService: the post of a meetup', () => {
       boss: null,
     });
     if (raid.kind !== 'created') throw new Error(raid.kind);
-    expect(made.service.summaryText(1).split('\n')).toEqual([
-      `<#${raid.party.forumPostId ?? ''}> · no time set · 1 trainer`,
-      '',
-      '**Meetups**',
-      `<#${made.postId}> · no time set · 1 trainer`,
+    expect(textDisplays(made.service.summaryMessage(1))).toEqual([
+      '### Active raids\n1 raid · 1 meetup',
+      `**Level 5**\n<#${raid.party.forumPostId ?? ''}> · no time set · 1 trainer`,
+      `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
     ]);
   });
 
@@ -324,8 +323,8 @@ describe('PartyService: the post of a meetup', () => {
     if (!west) throw new Error('no region');
     await before.service.ensureSummary(west);
     const summaryId = before.regions.byId(1)?.summaryMessageId ?? '';
-    const text = () => before.gateway.posts.get(summaryId)?.message.content;
-    expect(text()).toBe('No raids right now. Report one with `/raid`.');
+    const text = () => textOf(before.gateway.posts.get(summaryId)?.message);
+    expect(text()).toBe('### Active raids\nNo raids right now. Report one with `/raid`.');
 
     const outcome = await before.service.createMeetup({
       name: 'Picnic',
@@ -342,7 +341,7 @@ describe('PartyService: the post of a meetup', () => {
 
     await before.service.end(outcome.party.id);
     await before.service.flush();
-    expect(text()).toBe('No raids right now. Report one with `/raid`.');
+    expect(text()).toBe('### Active raids\nNo raids right now. Report one with `/raid`.');
   });
 });
 
diff --git a/src/services/party-service.relocate.test.ts b/src/services/party-service.relocate.test.ts
index d898bc3dacf073768607a16422216d15a8bc9eaa..7a5c385a0f3627d48ad2fed2b9e4fc6dd308b6d2 100644
--- a/src/services/party-service.relocate.test.ts
+++ b/src/services/party-service.relocate.test.ts
@@ -297,8 +297,7 @@ describe('PartyService.relocate', () => {
     await made.service.checkSummaries();
     await settled(made);
     const summary = (regionId: number): string =>
-      made.gateway.posts.get(made.regions.byId(regionId)?.summaryMessageId ?? '')?.message
-        .content ?? '';
+      textOf(made.gateway.posts.get(made.regions.byId(regionId)?.summaryMessageId ?? '')?.message);
     expect(summary(1)).toContain(made.postId);
     const party = await moved(made);
     expect(summary(1)).not.toContain(made.postId);
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index b2a443e5faf4f97d7335292857e8069469cc1913..e5189b5282a522f1eabea99299b4704c1dae6a93 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -124,7 +124,7 @@ describe('PartyService.reportRaid', () => {
     expect(store.get(party.id)).toBe(party);
 
     await service.flush();
-    expect(gateway.posts.get(regions.rows[0]!.summaryMessageId)?.message.content).toContain(
+    expect(textOf(gateway.posts.get(regions.rows[0]!.summaryMessageId)?.message)).toContain(
       `<#${party.forumPostId}> · hatches`,
     );
   });
@@ -362,7 +362,9 @@ describe('PartyService: the summary and tidying up', () => {
     await expect(service.ensureSummary(west)).resolves.toBe(true);
     const [summary] = gateway.postsIn(WEST_FORUM);
     expect(summary).toMatchObject({ title: 'Active raids', pinned: true, tagIds: [] });
-    expect(summary?.message.content).toBe('No raids right now. Report one with `/raid`.');
+    expect(textOf(summary?.message)).toBe(
+      '### Active raids\nNo raids right now. Report one with `/raid`.',
+    );
     expect(regions.summaries).toEqual([
       { id: 1, forumChannelId: WEST_FORUM, messageId: summary?.id },
     ]);
@@ -772,12 +774,12 @@ describe('PartyService: renders, tags and the summary', () => {
     const west = made.regions.rows[0]!;
     await made.service.ensureSummary(west);
     await made.service.flush();
-    const summary = () => made.gateway.posts.get(west.summaryMessageId ?? '')?.message.content;
+    const summary = () => textOf(made.gateway.posts.get(west.summaryMessageId ?? '')?.message);
     expect(summary()).toContain(`<#${made.postId}>`);
     const ended = await made.store.update(made.party.id, (p) => ({ party: endParty(p) }));
     made.service.ended(ended?.party ?? made.party);
     await made.service.flush();
-    expect(summary()).toBe('No raids right now. Report one with `/raid`.');
+    expect(summary()).toBe('### Active raids\nNo raids right now. Report one with `/raid`.');
   });
 
   it('does not edit the summary when its text did not change, and does when it did', async () => {
@@ -798,12 +800,31 @@ describe('PartyService: renders, tags and the summary', () => {
     await made.service.reportRaid(report({ gym: fountain! }));
     await made.service.flush();
     expect(edits(summaryId)).toBe(1);
-    expect(made.gateway.posts.get(summaryId ?? '')?.message.content).toContain('<#');
+    expect(textOf(made.gateway.posts.get(summaryId ?? '')?.message)).toContain('<#');
     made.service.summaryChanged(west.id);
     await made.service.flush();
     expect(edits(summaryId)).toBe(1);
   });
 
+  it('makes a summary post of the classic kind a components-v2 message by its next edit', async () => {
+    const made = await raidWith();
+    const west = made.regions.rows[0]!;
+    await made.service.ensureSummary(west);
+    await made.service.flush();
+    const summaryId = west.summaryMessageId ?? '';
+    const post = made.gateway.posts.get(summaryId);
+    if (!post) throw new Error('no summary post');
+    expect(post.message.v2).toBe(true);
+    // As one made before the summary was a v2 message.
+    post.message = { content: 'No raids right now. Report one with `/raid`.' };
+    await made.service.reportRaid(report({ gym: fountain! }));
+    await made.service.flush();
+    expect(made.gateway.converted).toEqual([{ id: summaryId, direct: false }]);
+    expect(textOf(made.gateway.posts.get(summaryId)?.message)).toMatch(
+      /^### Active raids\n2 raids/,
+    );
+  });
+
   it('edits the new summary post after the old one was deleted by hand and replaced', async () => {
     const made = await raidWith();
     const west = made.regions.rows[0]!;
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index 5f8dae74cd70a54a26f594b9df211871040d0015..a5c391502c0628cd6d5f0ed80162c4d4e202e1ad 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -193,22 +193,19 @@ describe('PartyService: the post of a train', () => {
 
   it('lists the train in the summary of its region, with the gym it is at', async () => {
     const made = await createdTrain({ route: [4, 1] });
-    expect(made.service.summaryText(1).split('\n')).toEqual([
-      'No raids right now. Report one with `/raid`.',
-      '',
-      '**Trains**',
-      `<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
+    const trainLine = () => textDisplays(made.service.summaryMessage(1))[1]?.split('\n')[1];
+    expect(textDisplays(made.service.summaryMessage(1))).toEqual([
+      '### Active raids\n1 train',
+      `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
     ]);
     await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
     // A gym is called by its nickname when it has one.
-    expect(made.service.summaryText(1).split('\n')[3]).toBe(
-      `<#${made.postId}> · at The Stacks · no time set · 1 trainer`,
-    );
+    expect(trainLine()).toBe(`<#${made.postId}> · at The Stacks · no time set · 1 trainer`);
     await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
-    expect(made.service.summaryText(1).split('\n')[3]).toBe(
-      `<#${made.postId}> · route finished · no time set · 1 trainer`,
-    );
-    expect(made.service.summaryText(2)).toBe('No raids right now. Report one with `/raid`.');
+    expect(trainLine()).toBe(`<#${made.postId}> · route finished · no time set · 1 trainer`);
+    expect(textDisplays(made.service.summaryMessage(2))).toEqual([
+      '### Active raids\nNo raids right now. Report one with `/raid`.',
+    ]);
   });
 });
 
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 89e938aeadf3ae6a931b56db1c496c12a72ecf24..7ad9b9fc3ed672d3ab92970469b47775c753bc3a 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -12,6 +12,7 @@ import {
   type OutgoingMessage,
   type PartyGateway,
   type TagIds,
+  type V2Message,
 } from '../discord/party-gateway.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import { createMeetup } from '../domain/party/meetup.js';
@@ -301,8 +302,8 @@ export class PartyService {
    */
   private starter: 'direct' | 'edited' | undefined;
   /**
-   * The text last sent to each region's summary post, and the post it went to. A summary whose
-   * text would be the same is not edited again.
+   * The message last sent to each region's summary post (as JSON), and the post it went to. A
+   * summary that would be the same is not edited again.
    */
   private readonly summarySent = new Map<number, { postId: string; text: string }>();
   /** The parties whose posts wait to be shown with other emoji, and the timer of the next. */
@@ -1068,7 +1069,8 @@ export class PartyService {
    * given up: the picture may be what Discord refused, and a line posted for nothing would flash
    * by. What worked is kept for the rest of the process and logged once. A refusal of the edit
    * without the picture takes the post back and is thrown; a refusal once direct posts have
-   * worked is the message's own, and is thrown.
+   * worked is the message's own, and is thrown. `partyId` names what the post is for in the log
+   * (`summary-<region>` for a region's summary post).
    */
   private async createPost(
     partyId: string,
@@ -1836,9 +1838,9 @@ export class PartyService {
 
   /**
    * The list of a region's raids, and under them its trains and its meetups, as its summary
-   * post shows it (also for `/status`).
+   * post shows it (also for `/status` in the region's channel): a components-v2 message.
    */
-  summaryText(regionId: number): string {
+  summaryMessage(regionId: number): V2Message {
     const { store, gyms } = this.options;
     const now = this.now();
     const parties = store.inRegion(regionId);
@@ -1859,14 +1861,16 @@ export class PartyService {
     if (!region?.forumChannelId || !region.summaryMessageId) return;
     const failed = region.summaryMessageId;
     const { gateway, log } = this.options;
-    const text = this.summaryText(regionId);
+    const message = this.summaryMessage(regionId);
+    const text = JSON.stringify(message);
     const last = this.summarySent.get(regionId);
     if (last?.postId === failed && last.text === text) return;
     // Forgotten before anything is tried: a failure must not hide an edit that is still needed.
     this.summarySent.delete(regionId);
     let edited: boolean;
     try {
-      edited = await gateway.editPost(failed, { content: text });
+      // A summary made before it was a v2 message is converted by the gateway (`editAs`).
+      edited = await gateway.editPost(failed, message);
     } catch (err) {
       const wait = rateLimitWaitMs(err);
       if (wait === undefined) throw err;
@@ -1953,11 +1957,12 @@ export class PartyService {
     const { gateway, regionStore, regions, log } = this.options;
     const forumId = region.forumChannelId;
     if (forumId === null) throw new Error(`Region ${region.id} has no forum`);
-    const text = this.summaryText(region.id);
+    const message = this.summaryMessage(region.id);
     this.summarySent.delete(region.id);
-    const postId = await gateway.createPost(forumId, {
+    // As a party's post: v2 as the first message where Discord takes it, edited in otherwise.
+    const postId = await this.createPost(`summary-${String(region.id)}`, forumId, {
       title: SUMMARY_TITLE,
-      message: { content: text },
+      message,
       tagIds: [],
     });
     if (postId === undefined) throw new Error(`The forum of region ${region.id} is gone`);
@@ -1972,7 +1977,7 @@ export class PartyService {
       }
       return false;
     }
-    this.summarySent.set(region.id, { postId, text });
+    this.summarySent.set(region.id, { postId, text: JSON.stringify(message) });
     await regions.load();
     return true;
   }
diff --git a/src/services/timed-party-service.test.ts b/src/services/timed-party-service.test.ts
index 6187f702f71efeff4d327a0cb1237dc617104075..38fda34e9f29944657be621708f2fabac3aacc6f 100644
--- a/src/services/timed-party-service.test.ts
+++ b/src/services/timed-party-service.test.ts
@@ -4,7 +4,7 @@ import { createdMeetup, reportedRaid } from '../../test/support/party-service.js
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
-import { textDisplays } from '../../test/support/messages.js';
+import { textDisplays, textOf } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -258,7 +258,7 @@ describe('TimedPartyService.setName', () => {
       title: 'Meetup · Raid hour meet',
       renames: 1,
     });
-    expect(made.service.summaryText(1)).toContain(`<#${made.postId}>`);
+    expect(textOf(made.service.summaryMessage(1))).toContain(`<#${made.postId}>`);
   });
 
   it('refuses a text that is no name, and does nothing for the name it has', async () => {
````

### Task 6: CLAUDE.md conventions for plan 8B-1, and its staging checklist

Prototype commit: `3946fa740d38cd89a08e2493ff80812436d796cb`

The conventions that changed: DMs as v2 with the party's brief (the card
is gone), the Stopped button, the member lists and their custom-id kinds,
v2 answers through v2Answer, spawn reports and the region summary as v2,
and the test helpers that read and check v2 messages. The staging
checklist covers every DM kind with its Stop, a v2 DM's phone preview,
/wants and /targets, /wild with and without Embed Links, the summary post
converting, and /status in a region channel.

**Files:**

```
 CLAUDE.md                                              | 14 +++++++-------
 docs/superpowers/plans/2026-10-15-phase-8b1-staging.md | 25 +++++++++++++++++++++++++
 2 files changed, 32 insertions(+), 7 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  no test files of its own); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 3946fa740d38cd89a08e2493ff80812436d796cb -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `CLAUDE.md conventions for plan 8B-1, and its staging checklist`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/superpowers/plans/2026-10-15-phase-8b1-staging.md`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 2ff5ec680531e9447440110f201dd789ec6928d9..7a103cebb6932deb53d0583c9820d35acd1ce7eb 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -100,7 +100,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - The forum of a region holds its raids, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched).
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
-- What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`). A party's post is a components-v2 message (Matt, 2026-10-15): the renderer lays it out (`PostLayout`: an accent colour, a picture, blocks of text, sections with the picture or a button beside them, rows of buttons) and `postMessage(layout, variant)` (`src/render/party-post.ts`) makes it one container; `rendered.message` is `postMessage(layout)`, the whole message and the only place its parts are put together, and its other forms are variants of the layout (`picture: false` when Discord refuses the picture, `controls: false` for the last showing of an ended party, `move: false` and `lead` for a copy), never edits of the component tree. `rendered.card` is the embed a direct message shows of the party (a v2 message cannot carry a DM's sentence; the embed fields are in `party-card.ts`). Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as is the heading of the boss block ("Hatches as Yveltal"), said once. A raid is called as the legacy bot called it (`raidWords`: "Level 5 raid", "Shadow Level 3 raid"; the titles of posts and their tags keep `T5`), and the statuses are Interested, Coming, Present and Complete. A message holds at most `MAX_COMPONENTS` (40, every nested component counted) and its text displays at most `TEXT_BUDGET` (4,000, assumed: Discord documents no total) less the room of a copy's line (`LEAD_ROOM`): `fittedLayout(build)` gives `build` a `Fit`: every list of members goes through `fit.list` and is cut down with the others when the post is too long (`fitLists`, "…and N more"), and as a last resort the other texts that can be long (a group's label, a gym's notes, where a train is, its route) go through `fit.part(room => …)` and are cut (`cutText`, "…"). A copy's line (`lead`) opens the post's first text, never a component of its own. The worst case of each kind, with every text needing escapes, is tested with every copy (`expectSendable`, `test/support/post-limits.ts`).
+- What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`). A party's post is a components-v2 message (Matt, 2026-10-15): the renderer lays it out (`PostLayout`: an accent colour, a picture, blocks of text, sections with the picture or a button beside them, rows of buttons) and `postMessage(layout, variant)` (`src/render/party-post.ts`) makes it one container; `rendered.message` is `postMessage(layout)`, the whole message and the only place its parts are put together, and its other forms are variants of the layout (`picture: false` when Discord refuses the picture, `controls: false` for the last showing of an ended party, `move: false` and `lead` for a copy), never edits of the component tree. `rendered.brief` (`PartyBrief`: the post's accent and picture, a few of its lines, a raid's map address) is what a direct message shows of the party, made by the renderer that makes the post, so a line the post shows is worded once (`PartyService.briefOf`; plan 8B-1: the embed card and `party-card.ts` are gone). Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as is the heading of the boss block ("Hatches as Yveltal"), said once. A raid is called as the legacy bot called it (`raidWords`: "Level 5 raid", "Shadow Level 3 raid"; the titles of posts and their tags keep `T5`), and the statuses are Interested, Coming, Present and Complete. A message holds at most `MAX_COMPONENTS` (40, every nested component counted) and its text displays at most `TEXT_BUDGET` (4,000, assumed: Discord documents no total) less the room of a copy's line (`LEAD_ROOM`): `fittedLayout(build)` gives `build` a `Fit`: every list of members goes through `fit.list` and is cut down with the others when the post is too long (`fitLists`, "…and N more"), and as a last resort the other texts that can be long (a group's label, a gym's notes, where a train is, its route) go through `fit.part(room => …)` and are cut (`cutText`, "…"). A copy's line (`lead`) opens the post's first text, never a component of its own. The worst case of each kind, with every text needing escapes, is tested with every copy (`expectSendable`, `test/support/post-limits.ts`).
 - Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, https thumbnails; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `customIdsOf`, `accentOf`, `thumbnailOf`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
@@ -115,13 +115,13 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - The raid command for another gym is `/location`, not `/gym`: `/gym` is the gym administration of Phase 5, and one slash command cannot be both a command and a group of subcommands. A gym of another region of the same server moves the raid there: `/location` asks first (its own file, `src/commands/raids/location.ts`, with the question's buttons under the custom-id kind `location`), with no limit of its own (the `CHANGE_THROTTLE` of every change of a raid applies; Matt, 2026-10-11).
 - Private answers to clicks on a post's controls go through `answerClick` (`ctx.clickAnswers`, `ClickAnswers`): the first click of a member on a party is answered with `reply`, later ones within two seconds are only acknowledged (`deferUpdate`), and the first answer is then edited to the answer of the last click. Only the first interaction of a burst may be given `editReply` (on a `deferUpdate`d click it would edit the post's own message). A refusal is thrown and shown at once. The test context answers every click by itself (window zero).
 - A raid's message stands, with the post's own buttons, also in the server's channels for remote raids and for raids at elite raid gyms (`channels['elite-gym-raids']`; found by the names in `settings.channels`, only where the bot may post embeds; `raidMirrors` says which a raid wants, none once it is over by the clock), and at the bottom of its post after `/status` (kind `status`). `PartyMirrors` (`src/services/party-mirrors.ts`, owned by `PartyService`) keeps them: the party's `mirrorMessages` is the list of what exists (a copy is recorded when sent and taken off only once it is deleted; the newest of a kind counts and the render deletes the others), the copy in the post is synced in the post's own render, the copies in the shared channels in a slower queue of their own, so a post never waits for them. The link line of the region channel is `New raid: <#post>` and is never edited: Discord shows the post's current title in the link. A channel that refuses the bot for lack of a permission is left alone for ten minutes (edits and sends; deletions are always tried). Whoever ends a party waits for `mirrors.idle(partyId)` before deleting the copies and archiving.
-- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryText(regionId)` is the region's list (the summary post and `/status` in a region channel). `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving). `requestDeletion` puts a member's reason into the post (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
+- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for trains and meetups, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving). `requestDeletion` puts a member's reason into the post (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
 - Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - Access for members of other regions is `AccessService` (`src/services/access-service.ts`), which listens to the store: a member who is signed up (in any status, also done: Matt, 2026-10-11) for an active party whose post is in a forum they cannot see gets a permission overwrite of their own on that forum, and loses it when they are signed up for no party of that forum any more (they left, or the party ended or moved). The record (`PartyAccessGrant`, `AccessGrantRepository`) is written before the overwrite is made and removed after it; only an overwrite that is still exactly what the bot made is ever deleted (`PartyGateway.dismissMember` answers false otherwise), and a member somebody keeps out (an overwrite of their own that denies something, or one that denies the view to a role of theirs: `memberAccess` says `barred`) is left alone; an overwrite of their own that is empty (Discord's "reset to default" leaves one behind) or only allows (a member added to a private channel keeps "Connect") counts as none and is replaced by the bot's. The sweep (at start and hourly, with the forums' upkeep) takes back what nothing calls for and lets a member in again whose record has no overwrite; it never lets in anybody without a record. Nothing awaits it: tests call `access.flush()`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit.
-- A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post and of a DM's card, "Conductor", the card's "Reported by"); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), the address last.
+- A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), the address last.
 - A `group` option is free text with autocomplete of the groups the raid has (`respondWithGroups`), read by `typedGroup` (`src/commands/parties/reply.ts`); text that is no group is refused, never ignored.
 - `ctx.regions` (`RegionDirectory`) has the regions by id, channel and forum; `GymDirectory` holds its own copy, so after a region changes load both. `regionChannelOf` also answers for a region's forum and a post in it. `ctx.users.get(snowflake)` gives a member's settings.
 - `/admin` is a `commandGroup` whose parts are listed in `src/commands/admin/index.ts`: a new subcommand is a file there, appended to that list. `/raid` reads what a member picked or typed through `src/commands/raids/raid-input.ts` (`reportedBoss`, `reportedGym`, `reportedTime`); a question to the member (a menu, a confirmation) keeps its values in a `PendingRequests` store under a token that is the id of the controls' custom id. The custom-id kind `raid` belongs to `/raid`'s own controls.
@@ -133,7 +133,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`), otherwise "This has ended."
 - A command's `throttle` may be a function of the interaction (`/meet`: 3 per 180 seconds in a timed party); a use that a guard refused does not count, so what can be known before the work (a bad name, no region, an unreadable time) is refused by a guard that reads the options (`/meetup`, `/meet`), and `execute` keeps its own checks.
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS`, `inShownOrder`), the components in `src/render/v2.ts`; `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut; what a post says about a gym under "Location Information" (`locationBlock`).
-- Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all); a DM's card goes through the DM sender, not the gateway, and the render tests hold it to the same 6,000.
+- Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary` (`test/support/messages.ts`).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - The maker of a train is signed up as their auto-status says (None: not at all; Here counts as Coming), and with privacy Anonymous neither the post nor the new-train DM names them (`NewTrain.anonymous`, `autoStatus`). A maker who is not signed up may still arrange the route and the times as far as the train does not move (`mayArrange`, `party.ts`); moving it and being its conductor need a sign-up. Meetups know neither setting.
 - A raid train is the third kind (`TrainParty`: `timed` like a meetup, and `train: { route, stop, conductorId, boss, finishedFrom }`). `isTrain`, the guards `requireTrain` (with `commandTrain`, `trainOf`) and `requireRaidOrTrain` (what has a boss or a gym: `/boss`, `/where`); `bossOf(party)` is the boss of any party that has one. `route` is gym ids, none twice, at most `MAX_ROUTE_STOPS`; `stop === route.length` on a route that is not empty means finished; `party.gymId` is null (the gym of a train is `currentStop(party)`). It has groups like a raid and one start like a meetup; Done means leave, and whoever leaves as the conductor stops being it.
@@ -155,15 +155,15 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - A repository method that changes one member's rows of a server runs inside `withMemberLocked` (`src/db/repositories/member-rows.ts`): the member's `User` row is locked first, by snowflake, and the rows are read after the lock. The row ids of servers and members are remembered per process in `RowIds` (`row-ids.ts`; one made in `src/app.ts` and given to the repositories of guilds, users, wants and gym targets; `RowIds.none` remembers nothing): a row made inside a transaction is remembered only after its commit, never inside a caller's transaction, and a remembered row that is gone is forgotten and the change run once more (the legacy bot deletes `Guild` rows). `src/commands/round-trips.db.test.ts` pins how many round trips the common commands make.
 - Whether a gym belongs to a server is decided by the row of its region, never by the channel cache: `gymRegionsInGuild` / `gymInGuild` (`src/services/region-directory.ts`). A region without a `guildId` belongs to no server.
 - One member of a server is looked up with `ctx.members.find(guildId, userId)` (`MemberDirectory`, `src/discord/member-directory.ts`): a fresh question to Discord per member, the answer (also "not a member") kept for a minute; an id that is no snowflake is never asked about. `fetchGuildMember` is the one place a member is fetched (`DiscordPartyGateway.memberAccess` uses it). Tests use `FakeMemberDirectory` (`test/support/members.ts`). There is no member list and there will be none: production has no privileged intents.
-- Commands that answer one member privately about their own settings (`/settings`, the wants, the gym targets, `/friend-code`, `/nickname`) are tied to no bot channel; what writes is throttled with `MEMBER_WRITE_THROTTLE` (`src/discord/throttle.ts`), what asks Discord about members with a tighter one. The server of an interaction is `guildIdOf(interaction)` (`guards.ts`). What autocomplete handlers share (`Choice`, `MAX_CHOICES`, `byName`, `beginningFirst`) is in `src/commands/choices.ts`. A question with "Remove all" / "Keep" is `removeAllQuestion` (`src/commands/notifications/remove-all.ts`).
+- Commands that answer one member privately about their own settings (`/settings`, the wants, the gym targets, `/friend-code`, `/nickname`) are tied to no bot channel; what writes is throttled with `MEMBER_WRITE_THROTTLE` (`src/discord/throttle.ts`), what asks Discord about members with a tighter one. The server of an interaction is `guildIdOf(interaction)` (`guards.ts`). What autocomplete handlers share (`Choice`, `MAX_CHOICES`, `byName`, `beginningFirst`) is in `src/commands/choices.ts`. A question with "Remove all" / "Keep" is `removeAllQuestion` (`src/commands/notifications/remove-all.ts`). `/wants` and `/targets` answer with a components-v2 list (`renderMemberList`, `src/render/member-list.ts`; plan 8B-1): a heading and a count, `LIST_PAGE` (10) entries to a page, each a section with a red Remove, Previous / Next, "Remove all…" (the question of `/unwant-all` / `/untarget-all`, asked in a new private answer) and how to add one; the entries share what is left of `TEXT_BUDGET` (a gym's name is cut before it is escaped). Their controls are `memberListControls` (`src/commands/notifications/list-controls.ts`), the kinds `wantlist` and `targetlist` (`wants` and `targets` are the remove-all questions): `<kind>:<page>:prev|next|all` and `<kind>:<page>:remove:<what>` with `<what>` as `stopArgs` spells it; a press reads the member's list anew, removes (what is gone already is no error) and shows the page again with `update` (the last page when it is past the end); one throttle, `MEMBER_WRITE_THROTTLE`, for all of a kind. An answer that is a v2 message goes through `answer(interaction, v2Answer(message))` (`src/discord/late-reply.ts`), an `update` or `editReply` with `v2Answer(message)`.
 - There is no EX raid tier (removed in plan 4F; none since 2020): `RaidLevel` has no `EX`. What is stored with it is tolerated, never written: a raid's state document reads `EX` as `Elite`, `RaidBoss` rows with an unknown level are left out, an override with one is logged once, the feed's EX heading is an unknown heading, the retired settings keys are stripped before the strict check (`withoutRetiredSettings`), and migration 009 made EX wants elite wants. Elite raids are rare (Matt, 2026-10-12): wherever they compete with another feature the other feature wins. Elite raid gyms are another matter and keep everything they had.
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn`, `normal` (raid wants, gym targets, new trains), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`).
 - Who of many members is in a server and can see a channel is `ctx.members.viewers(guildId, channelId, userIds)`: batches of 99 (and the bot itself, whose absence from an answer means the answer is no answer) through the gateway's request for members by user id, one request a second and thirty a minute at most (`MEMBER_REQUEST_BUDGET`), single REST look-ups when it fails and a rest that doubles up to six hours (`GatewayWithFallback`); "sees" is kept ten minutes, "does not" one (`src/discord/member-viewers.ts`). `FakeMemberDirectory` has `viewers`, `holding`, and members who are not there or cannot see.
 - Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated`, `meetingTimeChanged`, `startTimeChanged`, `spawnReported`. Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
 - Emoji are looked for by name (`PartyService.emoji`): the bot's application's first (`ApplicationEmoji`, `src/services/application-emoji.ts`, read after the connection and with the hourly upkeep; a failed read keeps the last list; a read that finds other emoji has every active post shown anew, one party every `EMOJI_RENDER_GAP_MS`, `PartyService.emojiChanged`; `flush` drops what still waits, and after `close`, which shutdown calls instead of `flush`, nothing is shown anew), then the forum's server's, then characters, or words for types and weather. The names are the legacy server names (`src/domain/pogo/game-icons.ts`: the 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`; the game master's clear weather shows `sunny`); `PostEmoji.icon(name)` gives one or undefined. `npm run emoji:upload` (`scripts/emoji/`) makes them from PokeMiners' pogo_assets at a pinned commit, an icon that fails said in a line (Discord's status and code only, `failureReason`) while the others go on, a count at the end and a non-zero exit when anything failed; it is never run by tests. A command's other forms are named with it in the role-authorization export (`scripts/role-auth/report.ts`): Discord sets each by itself.
-- A DM is rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `reasonLine`, `stopRow`): the address of the post (`postLink`), never `<#post>`, and one stop button per reason, five at most. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, takes the button off the message and keeps nothing in memory.
+- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
-- A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild`: a message in the region's text channel (as text where the bot may not post embeds), deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one. Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
+- A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild`: a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning), deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
 - The picture of a Pokémon is `pokemonPicture(source)` (`src/domain/pogo/pokemon-icons.ts`): the feed's picture of a current boss wins, else the game's icon (`iconName`: the first candidate that exists in the list of icon files the bot downloads with the game data, `settings.gameData.iconsUrl`; a form that only changes the look shows the species' plain file, a species with per-form files a preferred form, never a mega's), served by Leek Duck's CDN (`POKEMON_ICON_BASE`). Tests use `iconsFixture()`.
 - Text a member typed that reaches other members' DMs or a spawn report goes through `plainNoLinks` (`src/render/text.ts`), which also breaks bare addresses; a member's name is always shown through it. `plain()` leaves an address alone (a meetup's description may link).
 - What is kept in memory with a bound is a `BoundedMap` (`src/bounded-map.ts`, oldest out); a snowflake is recognised by `isSnowflake` (`src/db/snowflake.ts`). A command's help may depend on the settings (`CommandHelp.details` as a function).
diff --git a/docs/superpowers/plans/2026-10-15-phase-8b1-staging.md b/docs/superpowers/plans/2026-10-15-phase-8b1-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..24e0e963f112fc93d3fd7be3cc7758534d119b8d
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-15-phase-8b1-staging.md
@@ -0,0 +1,25 @@
+# Phase 8B-1: staging checklist
+
+The text for the end of the 8B-1 plan. Each step with Matt's go-ahead, on the test server, with the dev application and both accounts (Matt's own and Googer's).
+
+1. **No registration:** no command definition changed (only the help texts of `/wants` and `/targets`, which the bot keeps), and there is no migration. Start the bot (Matt, in a terminal).
+2. **DMs, one of each kind, with its Stop** (Googer wants, Matt reports; look at each on the desktop and on the phone):
+   - a want of a raid boss (`/want Yveltal`, then a T5 reported and set to Yveltal) and of a tier (`/want t5`): one container in the post's colour, the sentence first and no address after it, the brief beside the boss's picture ("Level 5 raid against Yveltal", the time line, "N trainers"), the buttons "Go to post" and "Map", then "You asked to be told about" with one Stop per reason;
+   - a gym target (`/target`), boss-set (`/settings`), a new train (`/settings` new trains on, then `/train`): a train's brief (its boss, where it is or "No route yet", the times);
+   - a spawn (`/want Dratini`, then `/wild`): the picture, "Where", when the report goes away, and "Go to report", which opens the report in the region channel;
+   - a DM with several reasons (a want of the boss and of its tier and the gym as a target): one Stop beside each;
+   - press a Stop: it turns into a grey, disabled "Stopped" where it was, the rest of the DM stays, and the want (or target, or setting) is gone (`/wants`). Press another Stop of the same DM: the same. A classic DM sent before 8B-1, if one is left in Googer's DMs: its Stop still takes its button off.
+3. **A v2 DM's phone preview:** with Googer's app in the background (the tab away, as in 8A), a want's DM: what does the notification show? The sentence comes first in the first text, for a preview that reads text. Note what it shows; if it shows nothing useful, say so for a follow-up (the meeting-time DM stays plain text whatever this shows).
+4. **`/wants`** (Googer, with more than ten wants: `/want` eleven times, a species, one form, shadow raids, a tier, perfect IVs): the heading "Your wants in <server>", "N wants · page 1 of 2", each with its type ("· raids and spawns", "· raids", "· spawns") and a red Remove; Next and Previous (disabled at the ends); Remove one on page 2 (the list comes back at page 2, or page 1 once it fits one page); Remove an entry whose want was already removed with `/unwant` in the meantime (no error); "Remove all…" asks in a new private message, and Keep and Remove all work as for `/unwant-all`. An empty list: the heading and "You want nothing yet. `/want` adds one." without buttons.
+5. **`/targets`** the same way: the gyms by region, each a link to Google Maps with its region and "· elite raid gym" where it is one; Remove, the pages, "Remove all…"; a gym outside the server's regions says "in no region of this server".
+6. **`/wild` in a channel with Embed Links:** one container in green, "### Wild Dratini", "Reported by **Name** (@mention)" (no ping), "This report goes away in 30 minutes", the picture beside it, "Where" and the small print with the caution and the footer. It goes after 30 minutes. With an Unown and the sightings channel: the same container there, headed by the sentence that names the region, and it stays.
+7. **`/wild` in a channel without Embed Links** (take the permission away from the bot's role in one region channel): the report comes as classic text with the warning. Whether Discord would show a v2 message there is still unknown (the bot never sends one where it lacks the permission); it stays a follow-up unless Matt wants a one-off test of it.
+8. **The summary post:** the pinned "Active raids" post of a forum that was made before 8B-1 becomes a v2 message by its next edit (report a raid): the log says once, with Discord's code, that a v2 edit of a classic message was refused and the message converted. Then: the count line ("2 raids · 1 train · 1 meetup"), the raids under "**Level 5**", "**Mega**", "**Shadow Level 3**" and so on, the trains and meetups under their headings, and "No raids right now. Report one with `/raid`." when nothing is going on. A change the list does not show sends no edit of the summary: a `/moveset`, a meeting time or a `/shout` in a raid's post (not a sign-up: the list shows the trainer count). The log has no summary edit then.
+9. **A new summary post:** delete the pinned "Active raids" post of a test forum by hand (or run `/admin setup-forums` for a forum that has none), then report a raid there. A v2 "Active raids" post appears and is pinned. Restart the bot before this step (or make this the first post since the start): the log says once which way forum posts are made, "forum posts are made as they are" (direct) or "Discord refused a components-v2 first message of a forum post" (made with "Setting up this post…" and edited at once). Either way no post that still says "Setting up this post…" is left in the forum.
+10. **`/status` in a region channel:** the same message as the summary post, for the member alone (a deferred answer edited into a v2 message: say whether Discord took it at once).
+11. **A long list:** many raids in one region (or the test of the 4,000 characters, if the test server cannot have that many): the list ends a tier in "…and N more", and Discord takes the post.
+
+## Left open (for the follow-ups)
+
+- **A busy day can starve the lower tiers of the summary.** The tiers are fitted in their order, each sure only of its heading and a "…and N more" line, so on a day with very many Level 5 and Mega raids the Level 3 and Level 1 raids may show only as counts. Look at it if staging or production shows it; a fairer share per tier is a small change.
+- **A spawn report whose picture Discord refuses is not sent again without it.** Party posts and their copies have that retry (`picture: false`), a spawn report has not: in the region channel nothing is posted, nobody is told, and `/wild` answers with the general error; in the Unown sightings channel only that copy is lost, with a warning in the log. The picture is Leek Duck's icon, which Discord has taken for posts so far.
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8b1 HEAD -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing; `npm run check` and `npm run build`, once and one after the other (no repository changed: the database suite is not needed). The test files with timers or waits that this plan changes (`src/services/dm-sender*.test.ts`, `src/services/notify-service*.test.ts`, `src/services/spawn-service*.test.ts`, `src/services/party-service*.test.ts`) ten times in a row.
2. Whole-branch review (Opus, high effort); one fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8B-1": the decisions above for Matt, what only staging shows, the two items left open), the Gantt chart and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-15-phase-8b1-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application; Matt starts the bot. No registration is needed.
