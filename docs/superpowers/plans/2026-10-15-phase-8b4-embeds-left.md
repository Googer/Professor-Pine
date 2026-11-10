# Phase 8B-4: The Last Embeds as Components-v2 Messages: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No message of the bot is an embed any more: the gym views (`/gym show` with Edit, Make elite, Move and Delete; the answers of the gym commands; `/find-gym`), every question of `/gym` and `/region`, a new gym's announcement with its map, `/bounds`, `/find-region`, the `/region import` preview and outcome, `/read-screenshot` and "Screenshot feedback", and the `/iam` menus become components-v2 messages.

**Architecture:** The last of the plans of 8B (8B-1 the DMs, member lists, spawn reports and summary; 8B-2 `/counters`, `/rank`, `/help`; 8B-3 trains), after the Wayfarer plan 8W-1 was merged back (it changed the same gym files; its import preview and `/gym review` were v2 already). Maps become a media gallery of the attached picture (`mediaGallery`, `mapPicture`, `V2Message.files`); every message of a question flow is v2 from its question to its last answer, because an answer replaces its question in place and a v2 message never becomes classic again; a press on a message made before the deploy (classic) is never updated to v2: it is closed with a line and the answer follows privately (`showInPlace`, `sayInPlace`, `answerApart` in `src/discord/late-reply.ts`). The test fakes check what Discord checks for files (`attachment://` names a file the message carries) and refuse a v2 update of a classic message.

**Tech Stack:** TypeScript 6.0, discord.js 14.27 (components v2: media gallery, file component, thumbnails by `attachment://`), Vitest. No new dependency. **No migration** and **no command definition changed**: no new registration before staging.

**Spec:** the design brief `.superpowers/sdd/2026-10-15-phase-8b4-embeds-left/design.md` (git-ignored; T1–T7), from Matt's approved drafts https://claude.ai/artifact/5KefCA1oYzA54TD6a5VUtn (version 2) and the earlier approved 8B drafts https://claude.ai/artifact/Gb3dr68kx63cifg268RN7X ("Optional": `/gym show`, `/read-screenshot`, `/iam`).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8b4`), one commit per task, each commit typechecked with its own tests green, and the full check and build clean on the tip (6,051 unit tests). Two Opus reviewers went through that branch (the groundwork and the gyms; regions, screenshots, roles and docs), a third through the fixes, which are folded into the commits below.

## Decisions in this plan

Matt's (2026-10-15): drafts approved; the buttons on `/gym show` stay (Edit, Make elite, Move, Delete); the plain-text lists stay plain text (`/region list`, `/gym duplicates`, `/admin boss list`, `/admin self-roles list`, `/settings`, the boss-change announcement, a deleted gym's line); one new gym's announcement shows its map like `/find-gym`, several at once stay the list of 8W-1. What a mass Wayfarer import announces is the Wayfarer session's work (Matt wants every change posted).

Made while prototyping, to look at in staging:

1. **Every message of the `/gym` and `/region` question flows is v2**, also one-line answers (a box around a sentence): an answer replaces its question, and a classic-to-v2 update of a message is not known to work, so it is never tried.
2. **A press on a classic message from before the deploy** (a `/gym` or `/region` question, an `/iam` menu) does what it did, closes the old message with "This message was replaced by the one below." and sends the v2 answer privately.
3. **The `/gym show` buttons:** a custom-id kind `gymview` (`gymview:<gym id>:edit|elite:<1|0>|move|delete`, nothing in memory), guarded like `/gym` and by the gym's reach; Make elite / Not elite sets what its label said (a stale view answers "already"); Edit… opens `/gym edit`'s form, Move… a form for the new place, Delete… the question of `/gym delete`, each answered in a message of its own so the view stays (it may then be stale). No throttle (`/gym` has none).
4. **A new gym's announcement** is sent with the map, then once more without it when Discord refuses it (no Attach Files in the channel, the file gone); the gym is read again after the map is downloaded and not announced when gone; the map is fetched only when a channel was found. Whether the channel allows Attach Files is not checked beforehand (the cache check knows Embed Links only).
5. **Colours:** gyms `GYM_COLOUR`, regions `REGION_COLOUR` (green), screenshots `SHOT_COLOUR` (gold), roles `LIST_COLOUR`.
6. **`/region import`** shows its preview and outcome as one container each, with `preview.txt` / `outcome.txt` attached whenever a list or the sentences are cut (channels by name in the file); Not imported has the larger room.
7. **`/read-screenshot`** shows the member's attachment (its https address) as the thumbnail; whether it keeps showing once that address expires is for staging. A waiting line followed by a refusal becomes the refusal.
8. **`/iam`** renders every press anew from the roster (never copies the pressed message); a roster that cannot be read leaves the note with "Use `/iam` again for the menus."
9. **A media gallery counts as one component** toward the 40 (its items have no type); Discord does not document it.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network.**
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8b4`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check` and the build after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Nothing Discord would refuse: galleries and `attachment://` with the files each message carries, 40 components and 4,000 characters in every worst case, menus alone in their rows.
2. No interaction update turns a classic message into a v2 one or a v2 message into a classic one; every path from a message made before the deploy.
3. The `/gym show` buttons: guards, reach, a gym gone, a stale view; the forms and questions they open.
4. The announcement: the map, the retry without it, no ping, the Wayfarer services untouched.
5. CLAUDE.md and the staging checklist match the code.

### Task 1: Plan 8B-4 T1: map galleries, files on v2 messages, answers in place

Prototype commit: `33d9a6ccfaa6449a927d2d9f73f4f3ebe480c380`

mediaGallery and mapPicture in src/render/v2.ts (the map at full width,
attachment:// of a file the message sends), textMessage for sentences;
mapOrNothing for a map that may fail; V2Message.files, sent by
discordPayload and v2Answer; showInPlace and sayInPlace answer a control
on a v2 message in place and close a classic one with a line, the v2
answer following privately. The fakes check galleries, thumbnails of
files and that a named file is carried.

**Files:**

```
 src/commands/gyms/import.test.ts         |  26 +++++++----
 src/commands/gyms/import.ts              |   4 +-
 src/commands/notifications/wants.test.ts |   4 +-
 src/commands/util/rank.test.ts           |   3 +-
 src/discord/late-reply.test.ts           | 126 +++++++++++++++++++++++++++++++++++++++++++++++--
 src/discord/late-reply.ts                | 123 +++++++++++++++++++++++++++++++++++++++++++++++-
 src/discord/party-gateway.ts             |  13 ++++++
 src/render/v2.ts                         |  62 +++++++++++++++++++++++++
 src/services/static-maps.test.ts         |  28 ++++++++++-
 src/services/static-maps.ts              |  20 ++++++++
 test/support/fake-gateway.test.ts        |  34 +++++++++++++-
 test/support/fake-gateway.ts             |  60 ++++++++++++++++++++----
 test/support/fake-interactions.test.ts   |  53 ++++++++++++++++++++-
 test/support/fake-interactions.ts        | 129 ++++++++++++++++++++++++++++++++++++++-------------
 14 files changed, 621 insertions(+), 64 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/gyms/import.test.ts src/commands/notifications/wants.test.ts src/commands/util/rank.test.ts src/discord/late-reply.test.ts src/services/static-maps.test.ts test/support/fake-gateway.test.ts test/support/fake-interactions.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 33d9a6ccfaa6449a927d2d9f73f4f3ebe480c380 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8B-4 T1: map galleries, files on v2 messages, answers in place`, the body above and the trailer, staging exactly
  `src/commands/gyms/import.test.ts src/commands/gyms/import.ts src/commands/notifications/wants.test.ts src/commands/util/rank.test.ts src/discord/late-reply.test.ts src/discord/late-reply.ts src/discord/party-gateway.ts src/render/v2.ts src/services/static-maps.test.ts src/services/static-maps.ts test/support/fake-gateway.test.ts test/support/fake-gateway.ts test/support/fake-interactions.test.ts test/support/fake-interactions.ts`.

````diff
diff --git a/src/commands/gyms/import.test.ts b/src/commands/gyms/import.test.ts
index 32db1c7882a68deb6e6e5699b1dbfb2e61d37c1c..7405fd3c5bd150c8ee44c24a7183753e04a21c70 100644
--- a/src/commands/gyms/import.test.ts
+++ b/src/commands/gyms/import.test.ts
@@ -5,6 +5,7 @@ import {
   fakeButton,
   fakeMessage,
   sent,
+  type FakeOptions,
   type SentPayload,
 } from '../../../test/support/fake-interactions.js';
 import { STAFF } from '../../../test/support/gym-admin.js';
@@ -163,8 +164,12 @@ async function importing(
 }
 
 /** A press on a button under a preview that shows its report, as Discord sends it. */
+/** A press on the preview, which is a components-v2 message. */
+const pressV2 = (made: Made, id: string, extra: FakeOptions = {}) =>
+  made.press(id, { v2Message: true, ...extra });
+
 const pressing = (made: Made, id: string, answer: SentPayload, userId?: string) =>
-  made.press(id, {
+  pressV2(made, id, {
     message: fakeMessage([], undefined, '', answer.files ?? []),
     ...(userId === undefined ? {} : { userId }),
   });
@@ -348,7 +353,7 @@ describe('/gym import: the preview', () => {
     const made = await gymCommandsWith();
     const file = cityFile(made);
     const { answer: first } = await importing(made, packed(file));
-    await made.press(buttonId(first, 'Import'));
+    await pressV2(made, buttonId(first, 'Import'));
     await made.settle();
     // Imported once, the same file finds every gym by its id and asks what is asked already.
     const { answer } = await importing(made, packed(file));
@@ -561,8 +566,8 @@ describe('/gym import: the buttons', () => {
     const made = await gymCommandsWith();
     const { answer } = await importing(made, packed(cityFile(made)));
     const id = buttonId(answer, 'Import');
-    await made.press(id);
-    const again = await made.press(id);
+    await pressV2(made, id);
+    const again = await pressV2(made, id);
     expect(again.deferUpdate).toHaveBeenCalled();
     expect(again.update).not.toHaveBeenCalled();
     expect(again.editReply).not.toHaveBeenCalled();
@@ -579,7 +584,7 @@ describe('/gym import: the buttons', () => {
     });
     expect((await pressed.fetchReply()).attachments).toEqual([]);
     // Import after Cancel is only acknowledged.
-    const late = await made.press(buttonId(answer, 'Import'));
+    const late = await pressV2(made, buttonId(answer, 'Import'));
     expect(late.deferUpdate).toHaveBeenCalled();
     await made.settle();
     expect(made.gymStore.writes).toEqual([]);
@@ -590,18 +595,18 @@ describe('/gym import: the buttons', () => {
     const made = await gymCommandsWith();
     const { answer } = await importing(made, packed(cityFile(made)));
     const id = buttonId(answer, 'Import');
-    const other = await made.press(id, { userId: '200000000000000007' });
+    const other = await pressV2(made, id, { userId: '200000000000000007' });
     expect(other.reply).toHaveBeenCalledWith({
       content: 'That is somebody else’s question.',
       flags: MessageFlags.Ephemeral,
     });
-    const member = await made.press(id, { userId: MEMBER, roleNames: [] });
+    const member = await pressV2(made, id, { userId: MEMBER, roleNames: [] });
     expect(member.reply).toHaveBeenCalledWith({
       content: 'Only admins, moderators and bot developers can do that.',
       flags: MessageFlags.Ephemeral,
     });
     expect(made.wayfarerStore.imports).toEqual([]);
-    await made.press(id);
+    await pressV2(made, id);
     expect(made.wayfarerStore.imports).toHaveLength(1);
   });
 
@@ -635,7 +640,7 @@ describe('/gym import: the buttons', () => {
       const made = await gymCommandsWith();
       const { answer } = await importing(made, packed(cityFile(made)));
       vi.setSystemTime(Date.now() + (IMPORT_PENDING_MINUTES + 1) * 60_000);
-      const pressed = await made.press(buttonId(answer, 'Import'));
+      const pressed = await pressV2(made, buttonId(answer, 'Import'));
       expect(replacedBy(sent(pressed.update, 0)).lines).toEqual([
         'That has expired. Use the command again.',
       ]);
@@ -650,7 +655,7 @@ describe('/gym import: the buttons', () => {
     const first = await importing(made, packed(cityFile(made)));
     for (let i = 0; i < MAX_PENDING_IMPORTS; i++) await importing(made, packed(cityFile(made)));
     expect(pendingImports.size).toBeLessThanOrEqual(MAX_PENDING_IMPORTS);
-    const pressed = await made.press(buttonId(first.answer, 'Import'));
+    const pressed = await pressV2(made, buttonId(first.answer, 'Import'));
     expect(replacedBy(sent(pressed.update, 0)).lines).toEqual([
       'That has expired. Use the command again.',
     ]);
@@ -665,6 +670,7 @@ describe('/gym import: the buttons', () => {
       roleNames: ['Moderator'],
       channelId: WEST_CHANNEL,
       guildId: made.gateway.guildId,
+      v2Message: true,
     });
     press.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));
     await made.router.handle(press as never);
diff --git a/src/commands/gyms/import.ts b/src/commands/gyms/import.ts
index 66d8131a728719caac302025236daf0cb2b74cee..1de397b168c02ee6b778136289edd3f69a23f5a4 100644
--- a/src/commands/gyms/import.ts
+++ b/src/commands/gyms/import.ts
@@ -514,7 +514,9 @@ export function renderImportPreview(
   file: WayspotExport,
   regionNames: ReadonlyMap<string, string>,
   buttons: APIButtonComponent[] = [],
-): { content: string } | (ReturnType<typeof discordPayload> & { files: AttachmentBuilder[] }) {
+):
+  | { content: string }
+  | (Omit<ReturnType<typeof discordPayload>, 'files'> & { files: AttachmentBuilder[] }) {
   if (preview.regions === 0) {
     return {
       content:
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index 56ed7ec128b84484a92b91e00a3010af8821df24..99649e6966199cb456041433625564318ed6c2f0 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -1361,7 +1361,9 @@ describe('/wants', () => {
     made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
     made.store.add(ALICE, FAKE_GUILD_ID, 3, 'both');
     const press = () =>
-      made.handle(fakeButton({ customId: 'wantlist:0:remove:p:150', userId: ALICE }));
+      made.handle(
+        fakeButton({ customId: 'wantlist:0:remove:p:150', userId: ALICE, v2Message: true }),
+      );
     const first = await press();
     const second = await press();
     for (const pressed of [first, second]) {
diff --git a/src/commands/util/rank.test.ts b/src/commands/util/rank.test.ts
index d35703d2176b2474e4f1e98f42a93b04405c42a0..4391a7c4e5a1e254b23aab6f3d3b9ef8c3b66c0a 100644
--- a/src/commands/util/rank.test.ts
+++ b/src/commands/util/rank.test.ts
@@ -267,7 +267,8 @@ describe('/rank: the buttons under an answer', () => {
   const ASKER = '700000000000000001';
   const OTHER = '700000000000000002';
   const press = async (customId: string, userId: string, extra: object = {}) => {
-    const interaction = fakeButton({ customId, userId, askedBy: ASKER, ...extra });
+    // The answer of /rank is a components-v2 message.
+    const interaction = fakeButton({ customId, userId, askedBy: ASKER, v2Message: true, ...extra });
     await router.handle(interaction as never);
     return interaction;
   };
diff --git a/src/discord/late-reply.test.ts b/src/discord/late-reply.test.ts
index 27319428367cb37f021b6de3d612d574bb9df0d5..da648e707290c8c2e8a6c6e504175989bf3fde3e 100644
--- a/src/discord/late-reply.test.ts
+++ b/src/discord/late-reply.test.ts
@@ -6,7 +6,12 @@ import {
   type ModalSubmitInteraction,
 } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
-import { fakeButton, fakeChatInput, fakeModal } from '../../test/support/fake-interactions.js';
+import {
+  fakeButton,
+  fakeChatInput,
+  fakeModal,
+  sent,
+} from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { SimpleCommand } from './command.js';
 import { UserError } from './errors.js';
@@ -16,7 +21,11 @@ import {
   answerPress,
   deferPress,
   LATE_DEFER_MS,
+  ANSWERED_BELOW,
+  answerApart,
   pressAnswer,
+  sayInPlace,
+  showInPlace,
   v2Answer,
 } from './late-reply.js';
 import type { V2Message } from './party-gateway.js';
@@ -256,7 +265,7 @@ describe('a press on the controls of an answer', () => {
   const V2_PRIVATE = { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
 
   it('changes a public answer when its asker pressed, and gives anybody else a copy', async () => {
-    const own = fakeButton({ customId: 'a:1:b', userId: ASKER, askedBy: ASKER });
+    const own = fakeButton({ customId: 'a:1:b', userId: ASKER, askedBy: ASKER, v2Message: true });
     expect(pressAnswer(own as unknown as ButtonInteraction)).toBe('update');
     await answerPress(own as unknown as ButtonInteraction, 'update', message);
     expect(own.update).toHaveBeenCalledExactlyOnceWith(v2Answer(message));
@@ -284,7 +293,7 @@ describe('a press on the controls of an answer', () => {
   });
 
   it('acknowledges first as it will answer, and then edits what it acknowledged', async () => {
-    const own = fakeModal({ customId: 'a:1:form', userId: ASKER, askedBy: ASKER });
+    const own = fakeModal({ customId: 'a:1:form', userId: ASKER, askedBy: ASKER, v2Message: true });
     await deferPress(own as unknown as ModalSubmitInteraction, 'update');
     expect(own.deferUpdate).toHaveBeenCalledOnce();
     await answerPress(own as unknown as ModalSubmitInteraction, 'update', message);
@@ -298,7 +307,12 @@ describe('a press on the controls of an answer', () => {
   });
 
   it('updates the message a form came from, and answers privately a form that came from none', async () => {
-    const fromMessage = fakeModal({ customId: 'a:1:form', userId: ASKER, askedBy: ASKER });
+    const fromMessage = fakeModal({
+      customId: 'a:1:form',
+      userId: ASKER,
+      askedBy: ASKER,
+      v2Message: true,
+    });
     await answerPress(fromMessage as unknown as ModalSubmitInteraction, 'update', message);
     expect(fromMessage.update).toHaveBeenCalledOnce();
     const fromCommand = fakeModal({ customId: 'a:1:form', modalFromCommand: true });
@@ -314,3 +328,107 @@ describe('a press on the controls of an answer', () => {
     expect(slow.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
   });
 });
+
+describe('showInPlace and sayInPlace', () => {
+  const view: V2Message = {
+    v2: true,
+    components: [container(1, [textDisplay('The new view')])],
+    files: ['var/images/gyms/1-abc.png'],
+  };
+  const pictured: V2Message = {
+    ...view,
+    components: [
+      container(1, [
+        textDisplay('The new view'),
+        { type: 12, items: [{ media: { url: 'attachment://1-abc.png' } }] },
+      ]),
+    ],
+  };
+
+  it('updates a v2 message in place, its files replacing the old ones', async () => {
+    const press = fakeButton({ customId: 'x:1:y', v2Message: true });
+    await showInPlace(press as unknown as ButtonInteraction, pictured);
+    expect(sent(press.update)).toEqual({
+      components: pictured.components,
+      flags: MessageFlags.IsComponentsV2,
+      files: view.files,
+      attachments: [],
+    });
+    expect(press.followUp).not.toHaveBeenCalled();
+  });
+
+  it('closes a classic message with a line and sends the view privately below it', async () => {
+    const press = fakeButton({ customId: 'x:1:y' });
+    await press.deferUpdate();
+    await showInPlace(press as unknown as ButtonInteraction, pictured, 'Old.');
+    expect(sent(press.editReply)).toEqual({
+      content: 'Old.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    expect(sent(press.followUp)).toEqual({
+      components: pictured.components,
+      files: view.files,
+      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
+    });
+    const other = fakeButton({ customId: 'x:1:y' });
+    await showInPlace(other as unknown as ButtonInteraction, view);
+    expect(sent(other.update).content).toBe(ANSWERED_BELOW);
+  });
+
+  it('refuses to show in place what follows a private deferral: that is an answer apart', async () => {
+    const press = fakeButton({ customId: 'x:1:y', v2Message: true });
+    await press.deferReply({ flags: MessageFlags.Ephemeral });
+    await expect(showInPlace(press as unknown as ButtonInteraction, view)).rejects.toThrow(
+      'answerApart',
+    );
+    await answerApart(press as unknown as ButtonInteraction, view);
+    expect(sent(press.editReply)).toEqual({ ...v2Answer(view) });
+    const fresh = fakeButton({ customId: 'x:1:y', v2Message: true });
+    await answerApart(fresh as unknown as ButtonInteraction, view);
+    expect(sent(fresh.reply).flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
+    expect(fresh.update).not.toHaveBeenCalled();
+  });
+
+  it('answers a form a command opened with a private message', async () => {
+    const form = fakeModal({ customId: 'x:1:y', modalFromCommand: true });
+    await showInPlace(form as unknown as ModalSubmitInteraction, view);
+    expect(sent(form.reply).flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
+  });
+
+  it('answers a form a command opened after its deferral, and says a sentence apart after one', async () => {
+    const form = fakeModal({ customId: 'x:1:y', modalFromCommand: true });
+    await form.deferReply({ flags: MessageFlags.Ephemeral });
+    await showInPlace(form as unknown as ModalSubmitInteraction, view);
+    expect(sent(form.editReply).flags).toBe(MessageFlags.IsComponentsV2);
+    // A press answered in a private message of its own says a refusal there, not in place.
+    const apart = fakeButton({ customId: 'x:1:y', v2Message: true });
+    await apart.deferReply({ flags: MessageFlags.Ephemeral });
+    await sayInPlace(apart as unknown as ButtonInteraction, 'Gone.', 7);
+    expect(sent(apart.editReply)).toEqual(
+      v2Answer({
+        v2: true,
+        components: [container(7, [textDisplay('Gone.')])],
+      }),
+    );
+  });
+
+  it('says a sentence as v2 on a v2 message and as text on a classic one', async () => {
+    const onV2 = fakeButton({ customId: 'x:1:y', v2Message: true });
+    await sayInPlace(onV2 as unknown as ButtonInteraction, 'Expired.', 7);
+    expect(sent(onV2.update)).toMatchObject({
+      components: [container(7, [textDisplay('Expired.')])],
+      flags: MessageFlags.IsComponentsV2,
+      attachments: [],
+    });
+    const onClassic = fakeButton({ customId: 'x:1:y' });
+    await sayInPlace(onClassic as unknown as ButtonInteraction, 'Expired.', 7);
+    expect(sent(onClassic.update)).toEqual({
+      content: 'Expired.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+  });
+});
diff --git a/src/discord/late-reply.ts b/src/discord/late-reply.ts
index 5c09c18badb44c03dc1b222ca1603da77a5e8026..efc4b2f674d59e34b9d8c462b018b6675c44cf2a 100644
--- a/src/discord/late-reply.ts
+++ b/src/discord/late-reply.ts
@@ -1,4 +1,5 @@
 import {
+  ComponentType,
   MessageFlags,
   type ChatInputCommandInteraction,
   type Message,
@@ -6,7 +7,7 @@ import {
   type MessageComponentInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
-import type { V2Message } from './party-gateway.js';
+import type { MessageFile, V2Message } from './party-gateway.js';
 
 /**
  * Late deferral (Matt, 2026-10-13). A request to Discord takes a quarter of a second from where
@@ -33,8 +34,13 @@ export type AnswerPayload = Pick<
 export function v2Answer(message: V2Message): {
   components: V2Message['components'];
   flags: MessageFlags.IsComponentsV2;
+  files?: MessageFile[];
 } {
-  return { components: message.components, flags: MessageFlags.IsComponentsV2 };
+  return {
+    components: message.components,
+    flags: MessageFlags.IsComponentsV2,
+    ...(message.files === undefined ? {} : { files: [...message.files] }),
+  };
 }
 
 type Answerable =
@@ -182,3 +188,116 @@ export async function answerPress(
   }
   await press.reply({ ...payload, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
 }
+
+/**
+ * Whether the message a control is on (or the message whose control opened a form) is
+ * components v2. False for a form a command opened: it has no message.
+ */
+export function onV2Message(press: Press): boolean {
+  return press.message?.flags.has(MessageFlags.IsComponentsV2) === true;
+}
+
+/**
+ * Whether a press on a message was answered in a private message of its own (a reply, or
+ * `deferReply`): an edit then goes to that answer. discord.js marks those by setting
+ * `ephemeral`, and leaves it null for `update` and `deferUpdate`. A form a command opened has
+ * no message, and its deferral is its only answer.
+ */
+export function answeredApart(press: Press): boolean {
+  const fromMessage = press.isMessageComponent() || press.isFromMessage();
+  return fromMessage && (press.deferred || press.replied) && press.ephemeral !== null;
+}
+
+/** What a message made before it was components v2 says once its answer follows below it. */
+export const ANSWERED_BELOW = 'This message was replaced by the one below.';
+
+/**
+ * Shows `message` in the place of the message a control is on (the question it answers, the
+ * view it changes): `update`, or an edit after `deferUpdate`. Its files replace the message's
+ * (`attachments: []`), so that a map of the earlier message does not stay behind.
+ *
+ * A message made before it was components v2 (plan 8B-4) is not changed into one in place:
+ * whether Discord takes a v2 interaction update of a classic message is not known and is not
+ * tried (8B-3's ruling). It is closed with `oldLine`, plain, without controls, and `message`
+ * follows privately below it. A form a command opened has no message: it is answered with a
+ * private reply, or an edit of its deferral.
+ */
+export async function showInPlace(
+  press: Press,
+  message: V2Message,
+  oldLine: string = ANSWERED_BELOW,
+): Promise<void> {
+  // After `deferReply` an edit goes to that private answer, not to the message the control is
+  // on: an answer of its own is `answerApart`'s. discord.js marks a reply or `deferReply` by
+  // setting `ephemeral`, and leaves it null for `update` and `deferUpdate`.
+  if (answeredApart(press)) {
+    throw new Error('showInPlace after a reply or deferReply: use answerApart');
+  }
+  const payload = { ...v2Answer(message), files: [...(message.files ?? [])], attachments: [] };
+  const acknowledged = press.deferred || press.replied;
+  if (!press.isMessageComponent() && !press.isFromMessage()) {
+    if (acknowledged) await press.editReply(payload);
+    else
+      await press.reply({
+        ...payload,
+        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+      });
+    return;
+  }
+  const fresh = onV2Message(press)
+    ? payload
+    : { content: oldLine, embeds: [], components: [], attachments: [] };
+  if (acknowledged) await press.editReply(fresh);
+  else await press.update(fresh);
+  if (onV2Message(press)) return;
+  await press.followUp({
+    ...v2Answer(message),
+    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+  });
+}
+
+/**
+ * Answers with `message` in a private message of its own, never in the place of the message a
+ * control is on: the reply, or the edit of what `deferReply` acknowledged (a command, Move… and
+ * Delete… of the view of `/gym show`, a form a command opened).
+ */
+export async function answerApart(interaction: Answerable, message: V2Message): Promise<void> {
+  if (interaction.deferred || interaction.replied) await interaction.editReply(v2Answer(message));
+  else {
+    await interaction.reply({
+      ...v2Answer(message),
+      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+    });
+  }
+}
+
+/**
+ * Says `text` in the place of the message a control is on (an expired question, a cancelled
+ * one, a refusal): as a components-v2 message of one container on a v2 message, as plain text,
+ * without controls, on a classic one (a message stays what it is).
+ */
+export async function sayInPlace(press: Press, text: string, accent: number): Promise<void> {
+  const said: V2Message = {
+    v2: true,
+    components: [
+      {
+        type: ComponentType.Container,
+        accent_color: accent,
+        components: [{ type: ComponentType.TextDisplay, content: text }],
+      },
+    ],
+  };
+  // A press answered in a message of its own says it there.
+  if (answeredApart(press)) {
+    await answerApart(press, said);
+    return;
+  }
+  const fromMessage = press.isMessageComponent() || press.isFromMessage();
+  if (!fromMessage || onV2Message(press)) {
+    await showInPlace(press, said);
+    return;
+  }
+  const plain = { content: text, embeds: [], components: [], attachments: [] };
+  if (press.deferred || press.replied) await press.editReply(plain);
+  else await press.update(plain);
+}
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index c03fd71e9274f86f5b65c60371bca4fb28fc1d7a..0b2057d0799858295f2c037c9cf5ed156c345589 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -47,10 +47,22 @@ export interface ClassicMessage extends Mentions {
 export interface V2Message extends Mentions {
   v2: true;
   components: APIMessageTopLevelComponent[];
+  /**
+   * Files sent with the message (`MessageFile`: a local path, or text made with its name), each
+   * shown where a component names it as `attachment://<file name>` (a map's gallery, a list cut
+   * short). Only for a message that is sent: an edit of a party's post never carries files.
+   */
+  files?: readonly MessageFile[];
   content?: never;
   embeds?: never;
 }
 
+/**
+ * A file sent with a message: a local path (named by its base name), or text the bot made
+ * with the name it has in the message (`preview.txt`).
+ */
+export type MessageFile = string | { attachment: Buffer; name: string };
+
 /** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
 export type OutgoingMessage = ClassicMessage | V2Message;
 
@@ -344,6 +356,7 @@ export function discordPayload(message: OutgoingMessage) {
       components: message.components,
       flags: MessageFlags.IsComponentsV2 as const,
       allowedMentions: allowedMentions(message),
+      ...(message.files === undefined ? {} : { files: [...message.files] }),
     };
   }
   return {
diff --git a/src/render/v2.ts b/src/render/v2.ts
index bf6c79ff9f8ae60e14a8e74300b9c5b318ca53cb..7f236052eb17544bba3987176a143cfb0ef057c8 100644
--- a/src/render/v2.ts
+++ b/src/render/v2.ts
@@ -1,3 +1,4 @@
+import { basename } from 'node:path';
 import {
   ButtonStyle,
   ComponentType,
@@ -9,12 +10,14 @@ import {
   type APIComponentInContainer,
   type APIContainerComponent,
   type APIFileComponent,
+  type APIMediaGalleryComponent,
   type APISectionAccessoryComponent,
   type APISectionComponent,
   type APISeparatorComponent,
   type APITextDisplayComponent,
   type APIThumbnailComponent,
 } from 'discord.js';
+import type { V2Message } from '../discord/party-gateway.js';
 
 /** The components of a components-v2 message, as plain API objects (as embeds were). */
 
@@ -53,6 +56,49 @@ export function fileComponent(name: string): APIFileComponent {
   return { type: ComponentType.File, file: { url: `attachment://${name}` } };
 }
 
+/** At most this many pictures stand in one gallery (Discord's limit). */
+export const GALLERY_ITEMS = 10;
+
+/**
+ * Pictures at the full width of the message (a map). Each address is `attachment://<name>` of a
+ * file sent with the message, or https. Discord counts the gallery as one component; its items
+ * are no components.
+ */
+export function mediaGallery(
+  items: readonly { url: string; description?: string }[],
+): APIMediaGalleryComponent {
+  if (items.length < 1 || items.length > GALLERY_ITEMS) {
+    throw new RangeError(`a gallery holds 1 to ${GALLERY_ITEMS} pictures, not ${items.length}`);
+  }
+  return {
+    type: ComponentType.MediaGallery,
+    items: items.map(({ url, description }) => ({
+      media: { url },
+      ...(description === undefined ? {} : { description }),
+    })),
+  };
+}
+
+/** A map picture as a message shows it: the gallery to put where it stands, and its file. */
+export interface MapPicture {
+  /** The gallery of the map, or nothing when there is no map. */
+  gallery: APIMediaGalleryComponent[];
+  /** The file the message sends with it (a local path), or nothing. */
+  files: string[];
+}
+
+/**
+ * A map file (a path from `ctx.maps`, or undefined when there is none) as the gallery that shows
+ * it and the file to send: without a map, neither. `description` is the picture's alt text.
+ */
+export function mapPicture(path: string | undefined, description?: string): MapPicture {
+  if (path === undefined) return { gallery: [], files: [] };
+  return {
+    gallery: [mediaGallery([{ url: `attachment://${basename(path)}`, description }])],
+    files: [path],
+  };
+}
+
 /** A row that holds one select menu (a row holds a menu alone). */
 export function menuRow(
   menu: APIStringSelectComponent,
@@ -88,3 +134,19 @@ export function container(
 ): APIContainerComponent {
   return { type: ComponentType.Container, accent_color: accent, components };
 }
+
+/**
+ * A components-v2 message of one container: these texts (blank ones left out), each a text
+ * display, then `more` (a row of buttons, a file). For questions and answers that are sentences.
+ */
+export function textMessage(
+  accent: number,
+  texts: readonly (string | undefined)[],
+  more: readonly APIComponentInContainer[] = [],
+): V2Message {
+  const shown = texts.filter((text): text is string => text !== undefined && text.trim() !== '');
+  return {
+    v2: true,
+    components: [container(accent, [...shown.map((text) => textDisplay(text)), ...more])],
+  };
+}
diff --git a/src/services/static-maps.test.ts b/src/services/static-maps.test.ts
index 6ee3b53546f9b20a899751913f6ec0e3d16e3da9..c10f7fe85d0b9979cd82e8abef39cad00334dfd5 100644
--- a/src/services/static-maps.test.ts
+++ b/src/services/static-maps.test.ts
@@ -5,7 +5,8 @@ import { afterEach, beforeEach, describe, expect, it } from 'vitest';
 import { WEST_CHANNEL, testRegions } from '../../test/support/gyms.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { ImageCache, type ImageResponse } from './image-cache.js';
-import { StaticMaps } from './static-maps.js';
+import { mapOrNothing, StaticMaps } from './static-maps.js';
+import { mapPicture } from '../render/v2.js';
 
 let dir: string;
 let urls: string[];
@@ -163,3 +164,28 @@ describe('StaticMaps', () => {
     expect(urls).toHaveLength(4);
   });
 });
+
+describe('mapOrNothing and mapPicture', () => {
+  it('gives the map as a gallery and its file, and nothing without one', async () => {
+    const { log } = createTestLogger();
+    const file = path.join('var', 'images', 'gyms', '1-abc.png');
+    const map = mapPicture(await mapOrNothing(Promise.resolve(file), log, 'a gym'), 'Map');
+    expect(map).toEqual({
+      gallery: [
+        {
+          type: 12,
+          items: [{ media: { url: 'attachment://1-abc.png' }, description: 'Map' }],
+        },
+      ],
+      files: [file],
+    });
+    expect(mapPicture(undefined)).toEqual({ gallery: [], files: [] });
+  });
+
+  it('logs a map that failed and goes on without it', async () => {
+    const { log, entries } = createTestLogger();
+    const failed = Promise.reject(new Error('down'));
+    expect(await mapOrNothing(failed, log, 'a gym', { gym: 7 })).toBeUndefined();
+    expect(entries).toMatchObject([{ msg: 'could not get the map of a gym', gym: 7 }]);
+  });
+});
diff --git a/src/services/static-maps.ts b/src/services/static-maps.ts
index 2069258723bce2832a9a8de652456527b1dc055c..521c427cdfe8255c892de3162be1bf1f71096e63 100644
--- a/src/services/static-maps.ts
+++ b/src/services/static-maps.ts
@@ -10,6 +10,7 @@ import {
   staticMapQuery,
   type StaticMap,
 } from '../domain/geo/static-map.js';
+import type { Logger } from '../log.js';
 import type { ImageCache, ImageResponse } from './image-cache.js';
 
 /** What handlers need: map pictures as files to attach. */
@@ -32,6 +33,25 @@ export interface MapProvider {
   clear(): Promise<number>;
 }
 
+/**
+ * A map of `ctx.maps` for a message that goes out with or without it: the file, or undefined
+ * when there is none or getting it failed (logged with `context`, as "could not get the map of
+ * <what>"). Never throws. Give the answer to `mapPicture` (`src/render/v2.ts`).
+ */
+export async function mapOrNothing(
+  map: Promise<string | undefined>,
+  log: Pick<Logger, 'warn'>,
+  what: string,
+  context: Record<string, unknown> = {},
+): Promise<string | undefined> {
+  try {
+    return await map;
+  } catch (err) {
+    log.warn({ err, ...context }, `could not get the map of ${what}`);
+    return undefined;
+  }
+}
+
 /** How long the picture of a place is kept after it was last made. */
 const PLACE_PICTURE_MS = 86_400_000;
 
diff --git a/test/support/fake-gateway.test.ts b/test/support/fake-gateway.test.ts
index 73a83d2a347cdc3afa658befa0af3490891036ca..5c16ef294890f0df410cfb5dc5e8cd8a09a06cce 100644
--- a/test/support/fake-gateway.test.ts
+++ b/test/support/fake-gateway.test.ts
@@ -480,7 +480,39 @@ describe('FakePartyGateway: the limits of a components-v2 message', () => {
       accessory: thumbnail('http://x.test/a.png'),
     };
     expect(await sending(message(section))).toBe(
-      'Invalid Form Body: a thumbnail needs an https address',
+      'Invalid Form Body: a thumbnail needs an https address or a file of the message (attachment://<name>)',
+    );
+  });
+
+  it('takes a gallery of the files the message sends, and refuses one of a file it lacks', async () => {
+    const gallery = (...urls: string[]) => ({
+      type: ComponentType.MediaGallery,
+      items: urls.map((url) => ({ media: { url } })),
+    });
+    const withFiles = (files: string[], ...components: object[]) =>
+      ({ ...message(...components), files }) as V2Message;
+    expect(
+      await sending(withFiles(['var/images/gyms/1-abc.png'], gallery('attachment://1-abc.png'))),
+    ).toBe('sent');
+    expect(await sending(message(gallery('https://x.test/a.png')))).toBe('sent');
+    expect(await sending(message(gallery('attachment://1-abc.png')))).toBe(
+      'Invalid Form Body: a gallery picture names attachment://1-abc.png, which the message does not have',
+    );
+    expect(await sending(message(gallery()))).toBe(
+      'Invalid Form Body: a gallery holds 1 to 10 pictures, not 0',
+    );
+    const eleven = Array.from({ length: 11 }, (_, i) => `https://x.test/${i}.png`);
+    expect(await sending(message(gallery(...eleven)))).toBe(
+      'Invalid Form Body: a gallery holds 1 to 10 pictures, not 11',
+    );
+    const pictured = {
+      type: ComponentType.Section,
+      components: [text('a')],
+      accessory: thumbnail('attachment://shot.png'),
+    };
+    expect(await sending(withFiles(['held/shot.png'], pictured))).toBe('sent');
+    expect(await sending(message(pictured))).toBe(
+      'Invalid Form Body: a thumbnail names attachment://shot.png, which the message does not have',
     );
   });
 
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 9eaedad79ed4381df495a14a13b902fce84cb07c..67b587862bdda99a8a5b9ad8e6f46898568a59e9 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1,3 +1,4 @@
+import { basename } from 'node:path';
 import { ButtonStyle, ComponentType, DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
 import type { ServerChannel } from '../../src/domain/regions/region-import.js';
 import type {
@@ -402,10 +403,18 @@ export class FakePartyGateway implements PartyGateway {
    * beside them, a row of one to five controls, a label of at most 80 characters, a custom id of
    * at most 100 that no other control of the message has, buttons and select menus in rows (a
    * button also beside a section), a select menu alone in its row and as `checkMenu` says, a
-   * thumbnail by an https address, and no container but at the top. Also what the fake
-   * interactions hold an answer to (`fake-interactions.ts`).
+   * thumbnail by an https address or a file of the message, a gallery of 1 to 10 pictures (by
+   * https or a file of the message; Discord counts the gallery as one component, its items as
+   * none), and no container but at the top. Also what the fake interactions hold an answer to
+   * (`fake-interactions.ts`). A file is named `attachment://<name>`, and `files` are the names
+   * of the files the message has: those it sends (`V2Message.files`, by their base names)
+   * unless given; `'unchecked'` leaves that to the caller.
    */
-  static checkV2(message: OutgoingMessage, textLimit: number = TEXT_LIMIT): void {
+  static checkV2(
+    message: OutgoingMessage,
+    textLimit: number = TEXT_LIMIT,
+    files?: ReadonlySet<string> | 'unchecked',
+  ): void {
     const refuse = (what: string): never => {
       throw refusedBody(what);
     };
@@ -414,6 +423,29 @@ export class FakePartyGateway implements PartyGateway {
       refuse('a v2 message has no content or embeds');
     const top = (message.components ?? []) as V2Component[];
     if (top.length === 0) refuse('a message needs a component');
+    const attached =
+      files ??
+      new Set(
+        (message.v2 ? (message.files ?? []) : []).map((file) =>
+          typeof file === 'string' ? basename(file) : file.name,
+        ),
+      );
+    /** An address of a file of the message, or of a picture elsewhere (https). */
+    const checkUrl = (url: unknown, what: string, https: boolean): void => {
+      if (typeof url !== 'string') return refuse(`${what} needs an address`);
+      if (https && url.startsWith('https://')) return;
+      const name = /^attachment:\/\/([^/]+)$/.exec(url)?.[1];
+      if (name === undefined) {
+        return refuse(
+          https
+            ? `${what} needs an https address or a file of the message (attachment://<name>)`
+            : `${what} names a file of the message (attachment://<name>)`,
+        );
+      }
+      if (attached !== 'unchecked' && !attached.has(name)) {
+        return refuse(`${what} names ${url}, which the message does not have`);
+      }
+    };
     const all = FakePartyGateway.flatten(top);
     if (all.length > 40) refuse(`a message has at most 40 components, not ${all.length}`);
     const containers = all.filter((component) => component.type === ComponentType.Container);
@@ -501,19 +533,29 @@ export class FakePartyGateway implements PartyGateway {
         }
         case ComponentType.File: {
           const url = (component.file as { url?: unknown } | undefined)?.url;
-          if (typeof url !== 'string' || !/^attachment:\/\/[^/]+$/.test(url)) {
-            refuse('a file component names a file of the message (attachment://<name>)');
-          }
+          checkUrl(url, 'a file component', false);
           break;
         }
         case ComponentType.Thumbnail: {
           const url = (component.media as { url?: unknown } | undefined)?.url;
-          if (typeof url !== 'string' || !url.startsWith('https://')) {
-            refuse('a thumbnail needs an https address');
-          }
+          checkUrl(url, 'a thumbnail', true);
           if (!accessories.has(component)) refuse('a thumbnail stands only beside a section');
           break;
         }
+        case ComponentType.MediaGallery: {
+          const items = Array.isArray(component.items) ? (component.items as unknown[]) : [];
+          if (items.length < 1 || items.length > 10) {
+            refuse(`a gallery holds 1 to 10 pictures, not ${items.length}`);
+          }
+          for (const item of items) {
+            checkUrl((item as { media?: { url?: unknown } }).media?.url, 'a gallery picture', true);
+            const description = (item as { description?: unknown }).description;
+            if (typeof description === 'string' && description.length > 1024) {
+              refuse('a picture of a gallery has a description of at most 1024 characters');
+            }
+          }
+          break;
+        }
         default:
           break;
       }
diff --git a/test/support/fake-interactions.test.ts b/test/support/fake-interactions.test.ts
index b3e3d0829837edc4afe5dbccddb95b299802028b..7057cca723a95182e34d00b9f2a8135dad5e5f53 100644
--- a/test/support/fake-interactions.test.ts
+++ b/test/support/fake-interactions.test.ts
@@ -301,7 +301,56 @@ describe('the files of the message a control is on', () => {
     });
     await added.deferUpdate();
     await added.editReply({ content: 'changed', files: ['f2'] });
-    expect((await added.fetchReply()).attachments).toEqual(['f1', 'f2']);
+    // discord.js lists only the new files as the message's attachments: the old ones go.
+    expect((await added.fetchReply()).attachments).toEqual(['f2']);
+
+    const both = fakeButton({ customId: 'a:1:x', message: fakeMessage([], undefined, '', ['f1']) });
+    await both.update({ content: 'changed', attachments: ['f1'], files: ['f2'] });
+    expect((await both.fetchReply()).attachments).toEqual(['f1', 'f2']);
+  });
+
+  it('refuses a v2 update of a classic message, which is not tried', async () => {
+    const text = { type: ComponentType.TextDisplay, content: 'Hello' };
+    const v2 = { flags: MessageFlags.IsComponentsV2, components: [text] };
+    const classic = fakeButton({ customId: 'a:1:x' });
+    await expect(classic.update(v2)).rejects.toThrow('a classic-to-v2 update is not tried');
+    const deferred = fakeButton({ customId: 'a:1:x' });
+    await deferred.deferUpdate();
+    await expect(deferred.editReply(v2)).rejects.toThrow('a classic-to-v2 update is not tried');
+    // A message that is v2 takes it, and so does a private answer of its own.
+    await fakeButton({ customId: 'a:1:x', v2Message: true }).update(v2);
+    const apart = fakeButton({ customId: 'a:1:x' });
+    await apart.deferReply({ flags: MessageFlags.Ephemeral });
+    await apart.editReply(v2);
+    // A v2 message pressed refuses becoming classic.
+    const shownV2 = fakeButton({ customId: 'a:1:x', v2Message: true });
+    await expect(shownV2.update({ content: 'classic' })).rejects.toThrow(
+      'a components-v2 message cannot become classic',
+    );
+  });
+
+  it('checks the files of a new answer against its own files, not the pressed message', async () => {
+    const text = { type: ComponentType.TextDisplay, content: 'Map' };
+    const gallery = {
+      type: ComponentType.MediaGallery,
+      items: [{ media: { url: 'attachment://map.png' } }],
+    };
+    const v2 = { flags: MessageFlags.IsComponentsV2, components: [text, gallery] };
+    const message = fakeMessage([], undefined, '', [{ name: 'map.png' }]);
+    const replied = fakeButton({ customId: 'a:1:x', message });
+    await expect(replied.reply(v2)).rejects.toThrow('no file attachment://map.png in the message');
+    const deferred = fakeButton({ customId: 'a:1:x', message });
+    await deferred.deferReply({ flags: MessageFlags.Ephemeral });
+    await expect(deferred.editReply(v2)).rejects.toThrow('no file attachment://map.png');
+    const followed = fakeButton({ customId: 'a:1:x', message, v2Message: true });
+    await followed.deferUpdate();
+    await expect(followed.followUp(v2)).rejects.toThrow('no file attachment://map.png');
+    await followed.followUp({ ...v2, files: ['var/images/map.png'] });
+    // An update that sends new files keeps none of the old: a component of an old one is refused.
+    const updated = fakeButton({ customId: 'a:1:x', message, v2Message: true });
+    await expect(updated.update({ ...v2, files: ['other.png'] })).rejects.toThrow(
+      'no file attachment://map.png',
+    );
   });
 
   it('holds a components-v2 answer to the limits of Discord, and keeps it v2', async () => {
@@ -319,7 +368,7 @@ describe('the files of the message a control is on', () => {
       'a components-v2 message cannot become classic',
     );
 
-    const pressed = fakeButton({ customId: 'gymreview:1:skip' });
+    const pressed = fakeButton({ customId: 'gymreview:1:skip', v2Message: true });
     await expect(
       pressed.update({
         flags: MessageFlags.IsComponentsV2,
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index aa8792d107ca44bcbe901d3bda7435e8cc0f694e..0dc1889e3479dc3557ab13c32517626602a3b457 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -6,27 +6,46 @@ import {
   PermissionsBitField,
   type APIEmbed,
 } from 'discord.js';
+import { basename } from 'node:path';
 import { vi } from 'vitest';
 import type { OutgoingMessage, V2Message } from '../../src/discord/party-gateway.js';
 import { checkMenu, FakePartyGateway, refusedBody, type MenuLike } from './fake-gateway.js';
 
-/** The addresses of the file components among these components, nested ones included. */
+/**
+ * The `attachment://` addresses among these components, nested ones included: of file
+ * components, thumbnails and the pictures of galleries.
+ */
 function fileUrls(components: readonly unknown[]): string[] {
   return components.flatMap((component) => {
     const {
-      type,
       file,
+      media,
+      items,
+      accessory,
       components: inner,
     } = component as {
-      type?: unknown;
       file?: { url?: unknown };
+      media?: { url?: unknown };
+      items?: { media?: { url?: unknown } }[];
+      accessory?: unknown;
       components?: unknown[];
     };
-    const own = type === ComponentType.File && typeof file?.url === 'string' ? [file.url] : [];
-    return [...own, ...fileUrls(inner ?? [])];
+    const urls = [file?.url, media?.url, ...(items ?? []).map((item) => item.media?.url)];
+    const own = urls.filter(
+      (url): url is string => typeof url === 'string' && url.startsWith('attachment://'),
+    );
+    return [
+      ...own,
+      ...fileUrls([...(inner ?? []), ...(accessory === undefined ? [] : [accessory])]),
+    ];
   });
 }
 
+/** The name a file of a payload has in the message: an attachment's, or a path's base name. */
+function fileName(file: unknown): unknown {
+  return typeof file === 'string' ? basename(file) : (file as { name?: unknown }).name;
+}
+
 /** What a test may want to read back from a reply, follow-up or edit. */
 export interface SentPayload {
   content?: string;
@@ -149,6 +168,12 @@ export interface FakeOptions {
   askedBy?: string;
   /** A control: the message it is on is private (`interaction.message.flags` has Ephemeral). */
   ephemeralMessage?: boolean;
+  /**
+   * A control (or a form it opened): the message it is on is components v2
+   * (`interaction.message.flags` has IsComponentsV2) whatever its rows; without it, it is so
+   * when its rows are more than rows of controls.
+   */
+  v2Message?: boolean;
 }
 
 /** A row of controls as Discord's API has it. */
@@ -248,7 +273,8 @@ function checkComponents(payload: SentPayload | undefined): void {
       ...('content' in payload ? { content: payload.content } : {}),
       ...('embeds' in payload ? { embeds: payload.embeds } : {}),
     } as unknown as V2Message;
-    FakePartyGateway.checkMessage(message);
+    // Which files the message has is for the caller (`refuseV2`): an edit may keep its own.
+    FakePartyGateway.checkV2(message, undefined, 'unchecked');
     return;
   }
   const v2Only = (payload.components ?? []).some((component) => {
@@ -495,20 +521,49 @@ function base(kind: Kind, o: FakeOptions) {
   const refuseIfFresh = (): Promise<never> | undefined =>
     interaction.deferred || interaction.replied ? undefined : Promise.reject(notReplied());
 
+  /** The message a control is on; shared by the presses a test makes on one message. */
+  const shown: FakeMessage = o.message ?? fakeMessage(o.messageRows ?? []);
+  /**
+   * Whether a message is a components-v2 one: the message the control is on as Discord says it
+   * (its rows, or `v2Message`) until a v2 edit makes it so; the answer of its own (a reply, or
+   * the edit of a `deferReply`) once it was answered with the flag. Such a message is held to
+   * the limits of the fake gateway (`FakePartyGateway.checkV2`), and like Discord the fake
+   * refuses to make it classic again. A v2 update of a classic message is refused too: whether
+   * Discord takes one is not known, and the bot does not try it (`showInPlace`).
+   */
+  let shownV2 = o.v2Message === true || shown.rows.some((row) => row.type !== 1);
+  let replyV2 = false;
+  /** The files the answer of its own has (a reply or the edit of its deferral). */
+  let replyFiles: readonly unknown[] = [];
   /**
-   * Whether the reply (or, after `deferUpdate`, the message the control is on) is a
-   * components-v2 message: one that was answered with the flag. Such an answer is held to the
-   * limits of the fake gateway (`FakePartyGateway.checkV2`), and like Discord the fake refuses
-   * to make it classic again (an edit with content or embeds and without the flag).
+   * The files a message has after a send or an edit: those it keeps (`attachments`, else all it
+   * had) and those it sends; discord.js lists only the files it sends when an edit sends files
+   * and does not say which stay, so the old ones go.
    */
-  let v2 = false;
-  const refuseV2 = (payload: SentPayload): Promise<never> | undefined => {
+  const filesAfter = (payload: SentPayload, before: readonly unknown[]): unknown[] => {
+    if (payload.attachments !== undefined)
+      return [...payload.attachments, ...(payload.files ?? [])];
+    return payload.files !== undefined ? [...payload.files] : [...before];
+  };
+  /**
+   * Refuses what Discord would refuse of a send or an edit of `target`: the message the control
+   * is on (`update`, or an edit after `deferUpdate`), the answer of its own (`reply`, or an edit
+   * after `deferReply`), or a follow-up, which is a new message.
+   */
+  const refuseV2 = (
+    payload: SentPayload,
+    target: 'shown' | 'reply' | 'followUp',
+  ): Promise<never> | undefined => {
+    const isV2 = target === 'shown' ? shownV2 : target === 'reply' ? replyV2 : false;
     if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0) {
-      if (v2 && (payload.content !== undefined || payload.embeds !== undefined)) {
+      if (isV2 && (payload.content !== undefined || payload.embeds !== undefined)) {
         return Promise.reject(refusedBody('a components-v2 message cannot become classic'));
       }
       return undefined;
     }
+    if (target === 'shown' && !shownV2) {
+      return Promise.reject(refusedBody('a classic-to-v2 update is not tried'));
+    }
     const message = {
       v2: true,
       components: payload.components ?? [],
@@ -516,27 +571,30 @@ function base(kind: Kind, o: FakeOptions) {
       ...('embeds' in payload ? { embeds: payload.embeds } : {}),
     } as unknown as OutgoingMessage;
     try {
-      FakePartyGateway.checkV2(message);
+      FakePartyGateway.checkV2(message, undefined, 'unchecked');
     } catch (err) {
       return Promise.reject(err instanceof Error ? err : new Error(String(err)));
     }
     // A file component shows a file the message has: one sent with it or one it keeps.
-    const kept = [...(payload.attachments ?? shown.files ?? []), ...(payload.files ?? [])];
-    const names = new Set(kept.map((file) => (file as { name?: unknown }).name));
+    const before = target === 'shown' ? (shown.files ?? []) : target === 'reply' ? replyFiles : [];
+    const names = new Set(filesAfter(payload, before).map(fileName));
     for (const url of fileUrls(payload.components ?? [])) {
       if (!names.has(url.replace(/^attachment:\/\//, ''))) {
         return Promise.reject(refusedBody(`no file ${url} in the message`));
       }
     }
-    v2 = true;
     return undefined;
   };
-
-  /** The message a control is on; shared by the presses a test makes on one message. */
-  const shown: FakeMessage = o.message ?? fakeMessage(o.messageRows ?? []);
-  /** What an edit of the message does to its files (see `FakeMessage.files`). */
-  const editFiles = (payload: SentPayload): void => {
-    shown.files = [...(payload.attachments ?? shown.files ?? []), ...(payload.files ?? [])];
+  /** Notes what a send or an edit that went through made of its target. */
+  const sentTo = (payload: SentPayload, target: 'shown' | 'reply'): void => {
+    const isV2 = ((payload.flags ?? 0) & MessageFlags.IsComponentsV2) !== 0;
+    if (target === 'shown') {
+      shownV2 ||= isV2;
+      shown.files = filesAfter(payload, shown.files ?? []);
+    } else {
+      replyV2 ||= isV2;
+      replyFiles = filesAfter(payload, replyFiles);
+    }
   };
   const shownMessage = () => ({
     id: shown.id,
@@ -545,7 +603,7 @@ function base(kind: Kind, o: FakeOptions) {
     components: shown.rows.map((row) => ({ type: row.type, toJSON: () => row })),
     // As Discord sets it: a message whose components are more than rows is components v2.
     flags: new MessageFlagsBitField(
-      (shown.rows.some((row) => row.type !== 1) ? MessageFlags.IsComponentsV2 : 0) |
+      (shownV2 || shown.rows.some((row) => row.type !== 1) ? MessageFlags.IsComponentsV2 : 0) |
         (o.ephemeralMessage === true ? MessageFlags.Ephemeral : 0),
     ).freeze(),
     interactionMetadata: o.askedBy === undefined ? null : { user: { id: o.askedBy } },
@@ -675,10 +733,11 @@ function base(kind: Kind, o: FakeOptions) {
     },
     // As in discord.js, these are async: a refusal rejects.
     reply: vi.fn((payload: SentPayload) => {
-      const refused = refuseIfAcknowledged() ?? refuseV2(payload);
+      const refused = refuseIfAcknowledged() ?? refuseV2(payload, 'reply');
       if (refused) return refused;
       const invalid = refuseInvalid(payload);
       if (invalid) return invalid;
+      sentTo(payload, 'reply');
       interaction.replied = true;
       interaction.ephemeral = isEphemeral(payload);
       return Promise.resolve();
@@ -691,14 +750,15 @@ function base(kind: Kind, o: FakeOptions) {
       return Promise.resolve();
     }),
     editReply: vi.fn((payload: SentPayload) => {
-      const refused = refuseIfFresh() ?? refuseV2(payload);
+      // After `deferUpdate` the reply is the message the control is on.
+      const target = updating ? 'shown' : 'reply';
+      const refused = refuseIfFresh() ?? refuseV2(payload, target);
       if (refused) return refused;
       const invalid = refuseInvalid(payload);
       if (invalid) return invalid;
       interaction.replied = true;
-      // After `deferUpdate` the reply is the message the control is on.
+      sentTo(payload, target);
       if (updating && payload.content !== undefined) shown.content = payload.content;
-      if (updating) editFiles(payload);
       if (updating && payload.components !== undefined) {
         shown.rows = payload.components.map((row) =>
           typeof (row as { toJSON?: unknown }).toJSON === 'function'
@@ -720,7 +780,7 @@ function base(kind: Kind, o: FakeOptions) {
       return Promise.resolve();
     }),
     followUp: vi.fn((payload: SentPayload) => {
-      const refused = refuseIfFresh();
+      const refused = refuseIfFresh() ?? refuseV2(payload, 'followUp');
       if (refused) return refused;
       const invalid = refuseInvalid(payload);
       if (invalid) return invalid;
@@ -736,12 +796,12 @@ function base(kind: Kind, o: FakeOptions) {
       return Promise.resolve();
     }),
     update: vi.fn((payload: SentPayload) => {
-      const refused = refuseIfAcknowledged() ?? refuseV2(payload);
+      const refused = refuseIfAcknowledged() ?? refuseV2(payload, 'shown');
       if (refused) return refused;
       const invalid = refuseInvalid(payload);
       if (invalid) return invalid;
       interaction.replied = true;
-      editFiles(payload);
+      sentTo(payload, 'shown');
       return Promise.resolve();
     }),
     showModal: vi.fn((modal: unknown) => {
@@ -825,5 +885,10 @@ export function asV2(payload: SentPayload): V2Message {
   if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0) {
     throw new Error('The payload has no IsComponentsV2 flag');
   }
-  return { v2: true, components: (payload.components ?? []) as V2Message['components'] };
+  const files = (payload.files ?? []).map((file) => String(fileName(file)));
+  return {
+    v2: true,
+    components: (payload.components ?? []) as V2Message['components'],
+    ...(files.length === 0 ? {} : { files }),
+  };
 }
````

### Task 2: Plan 8B-4 T2: gym views, questions and the announcement as v2 messages

Prototype commit: `0f9717c4c51b926f2bccc3e54911d5b7ac9dc488`

renderGymView and renderMemberGymView make one GYM_COLOUR container: the
name as a link to the place with the nickname, the address and regions,
the map as a gallery, the description, the facts and the small print, a
Map button. Every question and answer of the /gym flows is v2 from first
to last (gymQuestion, answerGym, sayGym; a press on a plain-text question
from before is answered below it). /find-gym answers with the member
view; one new gym is announced with its map (GymAdminService.maps).

**Files:**

```
 src/app.ts                              |  12 +-
 src/commands/gyms/add.ts                |  43 ++++----
 src/commands/gyms/controls.ts           |   7 +-
 src/commands/gyms/delete-export.test.ts | 101 ++++++++---------
 src/commands/gyms/delete.ts             |  43 +++++---
 src/commands/gyms/duplicates.test.ts    |  18 ++-
 src/commands/gyms/duplicates.ts         |   8 +-
 src/commands/gyms/edit-move.test.ts     | 212 ++++++++++++++++++++++-------------
 src/commands/gyms/edit.ts               |  29 +++--
 src/commands/gyms/elite.ts              |   4 +-
 src/commands/gyms/gym.test.ts           | 190 +++++++++++++++++++-------------
 src/commands/gyms/import.test.ts        |  13 ++-
 src/commands/gyms/move.ts               |  51 +++++----
 src/commands/gyms/servers.test.ts       |  35 +++---
 src/commands/gyms/shared.ts             | 116 +++++++++++++-------
 src/commands/gyms/show.ts               |   4 +-
 src/commands/gyms/upkeep.ts             |   5 +-
 src/commands/parties/status.ts          |   2 +-
 src/commands/util/find-gym.test.ts      |  43 ++++----
 src/commands/util/find-gym.ts           |  15 ++-
 src/commands/util/server-gym.test.ts    |   4 +-
 src/render/gym-view.test.ts             | 250 +++++++++++++++++++++++++++---------------
 src/render/gym-view.ts                  | 309 ++++++++++++++++++++++++++++++----------------------
 src/services/gym-admin-service.test.ts  | 103 +++++++++++++++---
 src/services/gym-admin-service.ts       |  55 ++++++++--
 test/support/fake-gateway.ts            |   8 ++
 test/support/gym-admin.ts               |   8 +-
 test/support/gym-commands.ts            | 141 +++++++++++++++++++++---
 test/support/messages.ts                |   8 ++
 29 files changed, 1186 insertions(+), 651 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/gyms/delete-export.test.ts src/commands/gyms/duplicates.test.ts src/commands/gyms/edit-move.test.ts src/commands/gyms/gym.test.ts src/commands/gyms/import.test.ts src/commands/gyms/servers.test.ts src/commands/util/find-gym.test.ts src/commands/util/server-gym.test.ts src/render/gym-view.test.ts src/services/gym-admin-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 0f9717c4c51b926f2bccc3e54911d5b7ac9dc488 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8B-4 T2: gym views, questions and the announcement as v2 messages`, the body above and the trailer, staging exactly
  `src/app.ts src/commands/gyms/add.ts src/commands/gyms/controls.ts src/commands/gyms/delete-export.test.ts src/commands/gyms/delete.ts src/commands/gyms/duplicates.test.ts src/commands/gyms/duplicates.ts src/commands/gyms/edit-move.test.ts src/commands/gyms/edit.ts src/commands/gyms/elite.ts src/commands/gyms/gym.test.ts src/commands/gyms/import.test.ts src/commands/gyms/move.ts src/commands/gyms/servers.test.ts src/commands/gyms/shared.ts src/commands/gyms/show.ts src/commands/gyms/upkeep.ts src/commands/parties/status.ts src/commands/util/find-gym.test.ts src/commands/util/find-gym.ts src/commands/util/server-gym.test.ts src/render/gym-view.test.ts src/render/gym-view.ts src/services/gym-admin-service.test.ts src/services/gym-admin-service.ts test/support/fake-gateway.ts test/support/gym-admin.ts test/support/gym-commands.ts test/support/messages.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index 6925ec5808bb45f023857211ba89dc1bede6a7a2..78284b53888e5534122091fa3dc570c5877173dd 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -217,7 +217,7 @@ export async function startApp(
   );
   const gymTargets = new GymNotificationRepository(db, rowIds);
   const newTrains = new NewTrainRepository(db);
-  // Made after the party service, whose embeds it sends, and told by it from here on.
+  // Made after the party service, whose briefs of parties it sends, and told by it from here on.
   const notify = new NotifyService({
     store: parties,
     posts: partyService,
@@ -315,6 +315,11 @@ export async function startApp(
     posts: partyService,
     log,
   });
+  // Map pictures from Google Static Maps, through the image cache (also for gym announcements).
+  const maps = new StaticMaps(
+    config.env.GOOGLE_API_KEY,
+    new ImageCache({ dir: IMAGE_CACHE, fetch: (url, init) => fetch(url, init), log }),
+  );
   // Gym administration and region administration exclude each other: one lock for both.
   const adminLock = new AdminLock();
   const gymAdmin = new GymAdminService({
@@ -330,6 +335,7 @@ export async function startApp(
     upkeep: gymUpkeep,
     geo,
     gateway: partyGateway,
+    maps,
     settings: config.settings,
     log,
   });
@@ -368,10 +374,6 @@ export async function startApp(
   });
   // Files that members attach to a command, downloaded from Discord's own hosts only.
   const attachments = new FetchAttachments({ fetch: (url, init) => fetch(url, init), log });
-  const maps = new StaticMaps(
-    config.env.GOOGLE_API_KEY,
-    new ImageCache({ dir: IMAGE_CACHE, fetch: (url, init) => fetch(url, init), log }),
-  );
   // The screenshots that were read, kept for a while and for review (`var/ocr/held`, `review`).
   const screenshotStore = new ScreenshotStore({
     dir: OCR_DIR,
diff --git a/src/commands/gyms/add.ts b/src/commands/gyms/add.ts
index e2c79ea4b1d18b1090f2c1561daf5bddd49ee86f..ad2565981ef2c14d6e19d9341e051846115edd0e 100644
--- a/src/commands/gyms/add.ts
+++ b/src/commands/gyms/add.ts
@@ -1,10 +1,8 @@
 import { namesakeNote } from './duplicates.js';
 import {
-  ActionRowBuilder,
   ButtonStyle,
   MessageFlags,
   SlashCommandSubcommandBuilder,
-  type ButtonBuilder,
   type ButtonInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
@@ -16,6 +14,7 @@ import { gymLabel, gymWithId, regionsSentence } from '../../render/gym-view.js';
 import { gymForm, sentForm } from './form.js';
 import {
   answerForm,
+  answerGym,
   APPROXIMATE,
   assertGymTexts,
   button,
@@ -25,6 +24,7 @@ import {
   EXPIRED,
   fetchNote,
   foreignPlace,
+  gymQuestion,
   gymViewMessage,
   markAnswered,
   nameNote,
@@ -78,23 +78,22 @@ function addQuestion(
     nearIds: near.map(({ gym }) => gym.id),
     typed,
   });
-  return {
-    content: content([
-      before,
-      `Add **${gymLabel({ name })}** at ${pointLink(point)}?`,
-      approximate ? APPROXIMATE : undefined,
-      regionsSentence(regions).replace(/^It lies/, 'It would lie'),
-      ...nearLines(near),
-    ]),
-    embeds: [],
-    components: [
-      new ActionRowBuilder<ButtonBuilder>().addComponents(
-        button(token, 'add', near.length === 0 ? 'Add' : 'Add anyway', ButtonStyle.Primary),
-        button(token, 'details', 'Add with details…', ButtonStyle.Secondary),
-        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
-      ),
+  return gymQuestion(
+    [
+      content([
+        before,
+        `Add **${gymLabel({ name })}** at ${pointLink(point)}?`,
+        approximate ? APPROXIMATE : undefined,
+        regionsSentence(regions).replace(/^It lies/, 'It would lie'),
+        ...nearLines(near),
+      ]),
     ],
-  };
+    [
+      button(token, 'add', near.length === 0 ? 'Add' : 'Add anyway', ButtonStyle.Primary),
+      button(token, 'details', 'Add with details…', ButtonStyle.Secondary),
+      button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
+    ],
+  );
 }
 
 /**
@@ -127,7 +126,8 @@ async function addAnswered(
   );
   if (outcome.kind === 'foreign') throw new UserError(FOREIGN_PLACE);
   if (outcome.kind === 'near') {
-    await interaction.editReply(
+    await answerGym(
+      interaction,
       addQuestion(
         ctx,
         interaction.user.id,
@@ -142,7 +142,8 @@ async function addAnswered(
     return;
   }
   const { gym } = outcome;
-  await interaction.editReply(
+  await answerGym(
+    interaction,
     await gymViewMessage(ctx, place, gym, [
       `Added ${gymWithId(gym)}.`,
       fetchNote(ctx),
@@ -248,6 +249,6 @@ export const addGym: SubcommandPart = {
     const { guildId } = await staffPlace(interaction, ctx);
     // Refused before anything is asked; the service decides again when Add is pressed.
     if (!ctx.gymAdmin.mayPlace(place.point, guildId)) throw new UserError(FOREIGN_PLACE);
-    await interaction.editReply(addQuestion(ctx, interaction.user.id, guildId, name, place));
+    await answerGym(interaction, addQuestion(ctx, interaction.user.id, guildId, name, place));
   },
 };
diff --git a/src/commands/gyms/controls.ts b/src/commands/gyms/controls.ts
index 6bd1bb716548197f574b396fedbaf1df1b8627c9..bd455f0adaf3fbacb8ca04be4d5ec43804684d4f 100644
--- a/src/commands/gyms/controls.ts
+++ b/src/commands/gyms/controls.ts
@@ -14,6 +14,7 @@ import {
   markAnswered,
   NOT_YOURS,
   pendingGyms,
+  sayGym,
   wasAnswered,
   type ButtonAnswer,
   type FormAnswer,
@@ -86,12 +87,12 @@ export const gymControls: ComponentHandler = {
     const request = requestOf(id, interaction.user.id, 'take');
     if (!request) {
       if (wasAnswered(id.id)) await interaction.deferUpdate();
-      else await interaction.update({ content: EXPIRED, embeds: [], components: [] });
+      else await sayGym(interaction, EXPIRED);
       return;
     }
     markAnswered(id.id);
     if (id.action === 'cancel') {
-      await interaction.update({ content: CANCELLED[request.what], embeds: [], components: [] });
+      await sayGym(interaction, CANCELLED[request.what]);
       return;
     }
     const answer = ANSWERS[`${request.what}:${id.action}`];
@@ -103,7 +104,7 @@ export const gymControls: ComponentHandler = {
       await answer(interaction, ctx, request);
     } catch (err) {
       if (!(err instanceof UserError)) throw err;
-      await interaction.editReply({ content: err.message, embeds: [], components: [] });
+      await sayGym(interaction, err.message);
     }
   },
 
diff --git a/src/commands/gyms/delete-export.test.ts b/src/commands/gyms/delete-export.test.ts
index 16366adec504fd604c198e0f568297c5064b6d9f..10f22fd24ef172dbbe863d8614f5181cbe3d3bcb 100644
--- a/src/commands/gyms/delete-export.test.ts
+++ b/src/commands/gyms/delete-export.test.ts
@@ -6,10 +6,11 @@ import {
   answerOf,
   buttonId,
   buttonsOf,
-  embedOf,
   gymCommandsWith,
+  gymViewOf,
   MEMBER,
   MODERATOR,
+  said,
 } from '../../../test/support/gym-commands.js';
 import { WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { ALICE, asTrain, BOB, REPORTER } from '../../../test/support/parties.js';
@@ -59,7 +60,7 @@ describe('/gym delete', () => {
 
     expect(asked.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const question = answerOf(asked);
-    expect(question.content?.split('\n')).toEqual([
+    expect(said(question).split('\n')).toEqual([
       'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.',
       'With it go:',
       '- its stop on the route of 1 active train',
@@ -73,7 +74,7 @@ describe('/gym delete', () => {
   it('says so when nothing refers to the gym', async () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    expect(question.content).toBe(
+    expect(said(question)).toBe(
       'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.',
     );
   });
@@ -89,25 +90,24 @@ describe('/gym delete', () => {
     await made.settle();
 
     expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
-    expect(answerOf(pressed)).toEqual({
-      content: [
+    expect(said(answerOf(pressed))).toBe(
+      [
         'Deleted **Maple Leaf Mosaic** (#6).',
         'With it went:',
         '- its stop on the route of 1 active train',
         '- its stop on 1 saved route',
         '- the gym target of 1 member',
       ].join('\n'),
-      embeds: [],
-      components: [],
-    });
+    );
+    expect(buttonsOf(answerOf(pressed))).toEqual([]);
     expect(made.gymStore.row(6)).toBeUndefined();
     expect(made.directory.get(6)).toBeUndefined();
     expect(asTrain(made.store.get(train.id)).train.route).toEqual([1]);
     // The post of the train says why, and names nobody as a mention.
-    const said = made.gateway
+    const lines = made.gateway
       .messagesIn(train.forumPostId ?? '')
       .map((message) => message.message.content ?? '');
-    expect(said).toContain("**Maple Leaf Mosaic** was removed from Pine's gym list.");
+    expect(lines).toContain("**Maple Leaf Mosaic** was removed from Pine's gym list.");
     expect(made.routes.rows.map((row) => row.gyms)).toEqual([[1]]);
     expect(made.gymTargets.rows).toEqual([]);
     expect(made.gateway.messagesIn(UPDATES_CHANNEL).map((m) => m.message)).toEqual([
@@ -117,7 +117,7 @@ describe('/gym delete', () => {
     const typed = await made.typing('show', 'maple leaf mosaic');
     const offered = typed.respond.mock.calls[0]?.[0] ?? [];
     expect(offered.some((choice) => choice.value === 'id:6')).toBe(false);
-    expect(sent((await made.use('show', { gym: 'id:6' })).followUp).content).toBe(
+    expect(said(sent((await made.use('show', { gym: 'id:6' })).followUp))).toBe(
       'There is no gym #6.',
     );
   });
@@ -126,11 +126,8 @@ describe('/gym delete', () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('delete', { gym: 'id:6' }));
     const pressed = await made.press(buttonId(question, 'Keep'));
-    expect(sent(pressed.update)).toEqual({
-      content: 'The gym was kept.',
-      embeds: [],
-      components: [],
-    });
+    expect(said(sent(pressed.update))).toBe('The gym was kept.');
+    expect(buttonsOf(sent(pressed.update))).toEqual([]);
     expect(made.gymStore.row(6)).toBeDefined();
   });
 
@@ -138,7 +135,7 @@ describe('/gym delete', () => {
     const made = await gymCommandsWith();
     const raid = await raidAt(made, 6);
     const used = await made.use('delete', { gym: 'id:6' });
-    expect(sent(used.followUp).content).toBe(
+    expect(said(sent(used.followUp))).toBe(
       `A raid is at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym cannot be ` +
         'deleted while a raid is there: wait until the raid is over, or close it with ' +
         '`/delete` in its post.',
@@ -153,7 +150,7 @@ describe('/gym delete', () => {
 
     const pressed = await made.press(buttonId(question, 'Delete'));
 
-    expect(answerOf(pressed).content).toBe(
+    expect(said(answerOf(pressed))).toBe(
       `A raid was reported at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym ` +
         'cannot be deleted while a raid is there: wait until the raid is over, or close it ' +
         'with `/delete` in its post.',
@@ -164,10 +161,10 @@ describe('/gym delete', () => {
   it('counts on Delete what is there then, not what the question listed', async () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    expect(question.content).toContain('Nothing refers to it.');
+    expect(said(question)).toContain('Nothing refers to it.');
     made.routes.add(ALICE, 1, 'Loop', [6, 1]);
     const pressed = await made.press(buttonId(question, 'Delete'));
-    expect(answerOf(pressed).content).toBe(
+    expect(said(answerOf(pressed))).toBe(
       'Deleted **Maple Leaf Mosaic** (#6).\nWith it went:\n- its stop on 1 saved route',
     );
     expect(made.routes.rows.map((row) => row.gyms)).toEqual([[1]]);
@@ -178,13 +175,13 @@ describe('/gym delete', () => {
     const first = answerOf(await made.use('delete', { gym: 'id:6' }));
     const second = answerOf(await made.use('delete', { gym: 'id:6' }));
     await made.press(buttonId(first, 'Delete'));
-    expect(answerOf(await made.press(buttonId(second, 'Delete'))).content).toBe(
+    expect(said(answerOf(await made.press(buttonId(second, 'Delete'))))).toBe(
       'That gym no longer exists.',
     );
 
     const question = answerOf(await made.use('delete', { gym: 'id:3' }));
     made.routes.failing = new Error('database is down');
-    expect(answerOf(await made.press(buttonId(question, 'Delete'))).content).toBe(
+    expect(said(answerOf(await made.press(buttonId(question, 'Delete'))))).toBe(
       'I could not delete the gym, and nothing was changed. Try again in a moment; the log ' +
         'says what failed.',
     );
@@ -199,7 +196,7 @@ describe('/gym delete', () => {
     await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
     await made.gymTargets.add(ALICE, '412345678901234568', 6);
     const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    expect(question.content).toContain('- the gym target of 1 member');
+    expect(said(question)).toContain('- the gym target of 1 member');
     // The gym goes; the train cannot be stored afterwards.
     const remove = made.removal.remove.bind(made.removal);
     made.removal.remove = async (id) => {
@@ -211,7 +208,7 @@ describe('/gym delete', () => {
     const pressed = await made.press(buttonId(question, 'Delete'));
     made.storage.failing = undefined;
 
-    expect(answerOf(pressed).content?.split('\n')).toEqual([
+    expect(said(answerOf(pressed)).split('\n')).toEqual([
       'Deleted **Maple Leaf Mosaic** (#6).',
       'With it went:',
       '- its stop on 1 saved route',
@@ -226,7 +223,7 @@ describe('/gym delete', () => {
     const question = answerOf(await made.use('delete', { gym: 'id:6' }));
     const first = await made.press(buttonId(question, 'Delete'));
     const second = await made.press(buttonId(question, 'Delete'));
-    expect(answerOf(first).content).toBe('Deleted **Maple Leaf Mosaic** (#6).');
+    expect(said(answerOf(first))).toBe('Deleted **Maple Leaf Mosaic** (#6).');
     expect(second.deferUpdate).toHaveBeenCalledTimes(1);
     expect(second.update).not.toHaveBeenCalled();
     expect(second.editReply).not.toHaveBeenCalled();
@@ -236,12 +233,12 @@ describe('/gym delete', () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('delete', { gym: 'id:6' }));
     const other = await made.press(buttonId(question, 'Delete'), { userId: '200000000000000007' });
-    expect(sent(other.reply).content).toBe('That is somebody else’s question.');
+    expect(said(sent(other.reply))).toBe('That is somebody else’s question.');
     const member = await made.press(buttonId(question, 'Delete'), {
       userId: MEMBER,
       roleNames: [],
     });
-    expect(sent(member.reply).content).toBe(
+    expect(said(sent(member.reply))).toBe(
       'Only admins, moderators and bot developers can do that.',
     );
     expect(made.gymStore.row(6)).toBeDefined();
@@ -253,18 +250,18 @@ describe('/gym refresh', () => {
     const made = await gymCommandsWith();
     const refreshed = await made.use('refresh', { gym: 'id:2' });
     const answer = answerOf(refreshed);
-    expect(answer.content?.split('\n')).toEqual([
+    expect(said(answer).split('\n')).toEqual([
       '**Old Stone Fountain** (#2):',
       'Its address was fetched anew.',
       'Its nearby places were fetched anew.',
     ]);
-    const fields = Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));
-    expect(fields['Nearby places (from Google)']).toBe('Corner Bakery Maple Dental');
-    expect(fields['Address (from Google)']).toBe('Test Road, Pinewood');
+    const view = gymViewOf(answer);
+    expect(view.facts['Nearby places (from Google)']).toBe('Corner Bakery Maple Dental');
+    expect(view.lines[0]).toBe('Test Road, Pinewood');
 
     expect(
-      answerOf(await made.use('refresh', { gym: 'id:2' }))
-        .content?.split('\n')
+      said(answerOf(await made.use('refresh', { gym: 'id:2' })))
+        .split('\n')
         .slice(1),
     ).toEqual([
       'Its address is as before: Google says the same.',
@@ -276,8 +273,8 @@ describe('/gym refresh', () => {
     const made = await gymCommandsWith();
     made.geo.failing = { geocode: 'failed', places: 'denied' };
     expect(
-      answerOf(await made.use('refresh', { gym: 'id:2' }))
-        .content?.split('\n')
+      said(answerOf(await made.use('refresh', { gym: 'id:2' })))
+        .split('\n')
         .slice(1),
     ).toEqual([
       'Its address could not be fetched (the log says why). It keeps what it had.',
@@ -286,8 +283,8 @@ describe('/gym refresh', () => {
     ]);
     made.geo.enabled = false;
     expect(
-      answerOf(await made.use('refresh', { gym: 'id:2' }))
-        .content?.split('\n')
+      said(answerOf(await made.use('refresh', { gym: 'id:2' })))
+        .split('\n')
         .slice(1),
     ).toEqual(['No Google API key is configured, so there is nothing to fetch.']);
     expect(made.gymStore.row(2)?.places).toBe('Riverside Plaza, Cafe Luna');
@@ -300,7 +297,7 @@ describe('/gym export', () => {
     await made.admin.edit(3, { name: 'The "Old"\tChurch' }, MODERATOR);
     const exported = await made.use('export');
     const answer = answerOf(exported);
-    expect(answer.content).toBe('The 11 gyms that lie in a region of this server.');
+    expect(said(answer)).toBe('The 11 gyms that lie in a region of this server.');
     const [file] = (answer.files ?? []) as { name: string; attachment: Buffer }[];
     expect(file?.name).toBe('gyms.tsv');
     const lines = file?.attachment.toString('utf8').split('\n') ?? [];
@@ -321,13 +318,11 @@ describe('/gym export', () => {
     for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]) {
       await made.admin.delete(id, { id: MODERATOR }, STAFF_PLACE);
     }
-    expect(sent((await made.use('export')).followUp).content).toBe(
+    expect(said(sent((await made.use('export')).followUp))).toBe(
       'No gym lies in a region of this server.',
     );
     made.regions.rows = [];
-    expect(sent((await made.use('export')).followUp).content).toBe(
-      'This server has no regions yet.',
-    );
+    expect(said(sent((await made.use('export')).followUp))).toBe('This server has no regions yet.');
   });
 });
 
@@ -371,7 +366,7 @@ describe('/admin clear-image-cache', () => {
       userId: MEMBER,
     });
     await made.router.handle(interaction as never);
-    expect(sent(interaction.reply).content).toBe(
+    expect(said(sent(interaction.reply))).toBe(
       'Only admins, moderators and bot developers can do that.',
     );
   });
@@ -404,16 +399,16 @@ describe('/gym: what it says fits one message', () => {
 
     const name = '*'.repeat(100);
     const add = answerOf(await made.use('add', { location: '40.015, -80.015', name }));
-    expect(add.content?.length).toBeLessThanOrEqual(LIMITS.content);
-    expect(add.content).toContain('5 other gyms lie within 10 metres of that place:');
-    expect(add.content).toContain('- …and 2 more');
-    expect(add.content).toMatch(/…and \d+ more\.\n/);
+    expect(said(add).length).toBeLessThanOrEqual(LIMITS.content);
+    expect(said(add)).toContain('5 other gyms lie within 10 metres of that place:');
+    expect(said(add)).toContain('- …and 2 more');
+    expect(said(add)).toMatch(/…and \d+ more\.\n/);
 
     const move = answerOf(await made.use('move', { gym: '#13', location: '40.01505, -80.015' }));
-    expect(move.content?.length).toBeLessThanOrEqual(LIMITS.content);
+    expect(said(move).length).toBeLessThanOrEqual(LIMITS.content);
     // Nothing of it was cut off by the limit: it names the gym by its number, lists three of
     // the gyms beside the new place with theirs, and ends with its last line.
-    const lines = move.content?.split('\n') ?? [];
+    const lines = said(move).split('\n') ?? [];
     expect(lines[0]).toMatch(
       /, #13\) from \[40\.015, -80\.015\]\(.+\) to \[40\.01505, -80\.015\]\(.+\)\?$/,
     );
@@ -427,13 +422,13 @@ describe('/gym: what it says fits one message', () => {
     expect(buttonsOf(move).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);
 
     const remove = answerOf(await made.use('delete', { gym: '#13' }));
-    expect(remove.content?.length).toBeLessThanOrEqual(LIMITS.content);
+    expect(said(remove).length).toBeLessThanOrEqual(LIMITS.content);
     // The number is what tells such gyms apart: it is never cut away.
-    expect(remove.content).toContain(', #13)? This cannot be undone.');
+    expect(said(remove)).toContain(', #13)? This cannot be undone.');
 
     const shown = answerOf(await made.use('show', { gym: '#13' }));
-    expect(shown.content?.length).toBeLessThanOrEqual(LIMITS.content);
+    expect(said(shown).length).toBeLessThanOrEqual(LIMITS.content);
     const refused = await made.use('show', { gym: '*_~`|' });
-    expect(sent(refused.followUp).content?.length).toBeLessThanOrEqual(LIMITS.content);
+    expect(said(sent(refused.followUp)).length).toBeLessThanOrEqual(LIMITS.content);
   });
 });
diff --git a/src/commands/gyms/delete.ts b/src/commands/gyms/delete.ts
index 0c4d211e14f2e602aa48755af3293addf04f8e7b..0be5abd454417557a8d4cbb6ad57acbbde989234 100644
--- a/src/commands/gyms/delete.ts
+++ b/src/commands/gyms/delete.ts
@@ -1,9 +1,4 @@
-import {
-  ActionRowBuilder,
-  ButtonStyle,
-  SlashCommandSubcommandBuilder,
-  type ButtonBuilder,
-} from 'discord.js';
+import { ButtonStyle, SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
 import type { RaidParty } from '../../domain/party/party.js';
@@ -12,7 +7,16 @@ import { count } from '../../render/text.js';
 import type { DeleteOutcome } from '../../services/gym-admin-service.js';
 import { actingMember } from '../parties/reply.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
-import { button, content, GYM_GONE, pendingGyms, staffPlace, type ButtonAnswer } from './shared.js';
+import {
+  answerGym,
+  button,
+  content,
+  GYM_GONE,
+  gymQuestion,
+  pendingGyms,
+  staffPlace,
+  type ButtonAnswer,
+} from './shared.js';
 
 /** Why a gym with a raid stays, with the raid's post (also the answer of `/gym review`). */
 export function raidThere(gym: string, raid: RaidParty, when: string): string {
@@ -85,18 +89,21 @@ export const deleteGym: SubcommandPart = {
     if (raid) throw new UserError(raidThere(gymWithId(gym), raid, 'is'));
     const token = pendingGyms.put(interaction.user.id, { what: 'delete', gymId: gym.id });
     const going = goesWith(references, 'With it go:');
-    await interaction.editReply({
-      content: content([
-        `Delete ${gymWithId(gym)}? This cannot be undone.`,
-        ...(going.length === 0 ? ['Nothing refers to it.'] : going),
-      ]),
-      components: [
-        new ActionRowBuilder<ButtonBuilder>().addComponents(
+    await answerGym(
+      interaction,
+      gymQuestion(
+        [
+          content([
+            `Delete ${gymWithId(gym)}? This cannot be undone.`,
+            ...(going.length === 0 ? ['Nothing refers to it.'] : going),
+          ]),
+        ],
+        [
           button(token, 'delete', 'Delete', ButtonStyle.Danger),
           button(token, 'cancel', 'Keep', ButtonStyle.Secondary),
-        ),
-      ],
-    });
+        ],
+      ),
+    );
   },
   autocomplete: respondWithGyms,
 };
@@ -133,6 +140,6 @@ export const deleteAnswers: Readonly<Record<string, ButtonAnswer>> = {
         lines = deletedLines(outcome);
         break;
     }
-    await interaction.editReply({ content: content(lines), embeds: [], components: [] });
+    await answerGym(interaction, gymQuestion([content(lines)]));
   },
 };
diff --git a/src/commands/gyms/duplicates.test.ts b/src/commands/gyms/duplicates.test.ts
index 2a2bfcdc47ace7766f2514339837d28217faac23..30166cb1dd5f01bd554bd148cfe6b984e07ab3ee 100644
--- a/src/commands/gyms/duplicates.test.ts
+++ b/src/commands/gyms/duplicates.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { sent } from '../../../test/support/fake-interactions.js';
-import { answerOf, buttonId, gymCommandsWith } from '../../../test/support/gym-commands.js';
+import { answerOf, buttonId, gymCommandsWith, said } from '../../../test/support/gym-commands.js';
 import { WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { MAX_DUPLICATE_MESSAGES, pagedGroups } from './duplicates.js';
 
@@ -23,24 +23,22 @@ describe('gyms that share a name', () => {
   it('says so when there are none: two Starbucks of two regions are no pair', async () => {
     const made = await gymCommandsWith();
     const listed = answerOf(await made.use('duplicates'));
-    expect(listed.content).toBe(
-      'No two gyms of a region of this server are shown by the same name.',
-    );
+    expect(said(listed)).toBe('No two gyms of a region of this server are shown by the same name.');
   });
 
   it('warns, and adds all the same, when a new gym is shown by the name of another of its region', async () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('add', { location: FREE, name: 'STAR-BUCKS' }));
     const added = answerOf(await made.press(buttonId(question, 'Add')));
-    expect(added.content).toContain('Added **STAR-BUCKS** (#13).');
-    expect(added.content).toContain(
+    expect(said(added)).toContain('Added **STAR-BUCKS** (#13).');
+    expect(said(added)).toContain(
       'Another gym of its region is shown as "STAR-BUCKS" too: **Starbucks** (#5). Members and ' +
         'screenshots can tell such gyms apart only by a nickname: give one with `/gym edit`.',
     );
     expect(made.gymStore.row(13)).toMatchObject({ name: 'STAR-BUCKS' });
 
     const listed = answerOf(await made.use('duplicates'));
-    expect(listed.content).toBe(
+    expect(said(listed)).toBe(
       'One name is shared by gyms of one region. Give each such gym a nickname with `/gym edit`.' +
         `\n\n**<#${WEST_CHANNEL}>** "Starbucks":\n- **Starbucks** (#5) — Sponsored gym\n` +
         '- **STAR-BUCKS** (#13)',
@@ -56,7 +54,7 @@ describe('gyms that share a name', () => {
       { ...filled(form), nickname: 'Old Stone Fountain' },
       { modalFromCommand: true },
     );
-    expect(answerOf(submitted).content).toContain(
+    expect(said(answerOf(submitted))).toContain(
       'Another gym of its region is shown as "Old Stone Fountain" too: **Old Stone Fountain** (#2).',
     );
   });
@@ -65,7 +63,7 @@ describe('gyms that share a name', () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('move', { gym: 'id:9', location: '40.021, -80.07' }));
     const moved = answerOf(await made.press(buttonId(question, 'Move anyway')));
-    expect(moved.content).toContain(
+    expect(said(moved)).toContain(
       'Another gym of its region is shown as "Starbucks" too: **Starbucks** (#5).',
     );
   });
@@ -91,7 +89,7 @@ describe('gyms that share a name', () => {
   it('sends the further messages as private follow-ups', async () => {
     const made = await gymCommandsWith();
     const listed = await made.use('duplicates');
-    expect(sent(listed.editReply).content).toMatch(/^No two gyms/);
+    expect(said(sent(listed.editReply))).toMatch(/^No two gyms/);
     expect(listed.followUp).not.toHaveBeenCalled();
   });
 });
diff --git a/src/commands/gyms/duplicates.ts b/src/commands/gyms/duplicates.ts
index 53fbf889adf3a61852b64c42e72c8e16646aff24..578a651f29cb48bb3ab1b25948b1bbf4a0a5803e 100644
--- a/src/commands/gyms/duplicates.ts
+++ b/src/commands/gyms/duplicates.ts
@@ -10,6 +10,9 @@ import { staffPlace } from './shared.js';
 /** A message's text stays within Discord's 2,000 characters. */
 const MESSAGE = 2_000;
 
+/** How much room the namesakes of a note take. */
+const NAMESAKES_SHOWN = 250;
+
 /**
  * What staff are told after adding, changing or moving a gym that is now shown by the same name
  * as another gym of a region it lies in (or was given a nickname that is another's shown name):
@@ -21,9 +24,10 @@ export function namesakeNote(ctx: Pick<AppContext, 'gyms'>, gym: Gym): string |
     for (const other of namesakes(gym, ctx.gyms.inRegion(channelId))) others.set(other.id, other);
   }
   if (others.size === 0) return undefined;
-  const named = fitItems([...others.values()].map(gymWithId), 1_000);
+  // A note above a view: kept short enough to stand beside what the change did (`fitLines`).
+  const named = fitItems([...others.values()].map(gymWithId), NAMESAKES_SHOWN);
   return (
-    `Another gym of its region is shown as "${plain(shownName(gym))}" too: ${named}. Members ` +
+    `Another gym of its region is shown as "${plain(truncate(shownName(gym), 60))}" too: ${named}. Members ` +
     'and screenshots can tell such gyms apart only by a nickname: give one with `/gym edit`.'
   );
 }
diff --git a/src/commands/gyms/edit-move.test.ts b/src/commands/gyms/edit-move.test.ts
index ea9d7e4c4f468bd5fc6abe7f2f74463b6c9eb8b8..0ca5b4e5596d0f7e1fd05632243d11f77b216181 100644
--- a/src/commands/gyms/edit-move.test.ts
+++ b/src/commands/gyms/edit-move.test.ts
@@ -6,14 +6,17 @@ import {
   answerOf,
   buttonId,
   buttonsOf,
-  embedOf,
   gymCommandsWith,
+  gymOf,
+  gymViewOf,
   MEMBER,
   MODERATOR,
+  said,
 } from '../../../test/support/gym-commands.js';
 import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { REPORTER } from '../../../test/support/parties.js';
 import { PartyStatus } from '../../domain/party/status.js';
+import { ANSWERED_BELOW } from '../../discord/late-reply.js';
 
 type Made = Awaited<ReturnType<typeof gymCommandsWith>>;
 
@@ -40,7 +43,7 @@ const filled = (form: Form): Record<string, string> =>
   );
 
 const fieldsOf = (answer: ReturnType<typeof answerOf>): Record<string, string> =>
-  Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));
+  gymViewOf(answer).facts;
 
 describe('/gym edit', () => {
   it('opens a form at once, filled with the texts of the gym', async () => {
@@ -86,10 +89,10 @@ describe('/gym edit', () => {
     ]);
     expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const answer = answerOf(submitted);
-    expect(answer.content).toBe(
+    expect(said(answer)).toBe(
       'Changed the nickname, the notice and the keywords of **Pinewood Public Library** (#1).',
     );
-    expect(embedOf(answer).title).toBe('Pinewood Public Library');
+    expect(gymViewOf(answer).title).toBe('Pinewood Public Library');
     expect(fieldsOf(answer)).toMatchObject({
       Notice: 'Closed on Sundays',
       Keywords: 'books, mural',
@@ -104,11 +107,9 @@ describe('/gym edit', () => {
     const form = await editForm(made, 'id:1');
     made.gymStore.writes.length = 0;
     const submitted = await made.submit(form.custom_id, filled(form), { modalFromCommand: true });
-    expect(answerOf(submitted)).toEqual({
-      content: 'Nothing was changed.',
-      components: [],
-      flags: MessageFlags.Ephemeral,
-    });
+    expect(said(answerOf(submitted))).toBe('Nothing was changed.');
+    expect(answerOf(submitted).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    expect(buttonsOf(answerOf(submitted))).toEqual([]);
     expect(made.gymStore.writes).toEqual([]);
   });
 
@@ -156,11 +157,11 @@ describe('/gym edit', () => {
     };
     const refused = await made.submit(form.custom_id, typed, { modalFromCommand: true });
     const refusal = answerOf(refused);
-    expect(refusal.content).toMatch(/^The name is too long as I store it, by 45 characters/);
-    expect(refusal.content).toContain('Nothing was saved. What you typed is kept:');
+    expect(said(refusal)).toMatch(/^The name is too long as I store it, by 45 characters/);
+    expect(said(refusal)).toContain('Nothing was saved. What you typed is kept:');
     // The first form came from the command: its refusal is a message of its own.
     expect(refused.reply).toHaveBeenCalledTimes(1);
-    expect(refusal.flags).toBe(MessageFlags.Ephemeral);
+    expect(refusal.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
     expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again', 'Cancel']);
     expect(made.gymStore.writes).toEqual([]);
 
@@ -182,13 +183,13 @@ describe('/gym edit', () => {
         },
       },
     ]);
-    expect(answerOf(submitted).content).toBe(
+    expect(said(answerOf(submitted))).toBe(
       'Changed the name and the description of **Reading Room** (The Stacks, #1).',
     );
     // Answered in the place of the refusal: its button does not stay under a finished edit.
     expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
     expect(submitted.reply).not.toHaveBeenCalled();
-    expect(answerOf(submitted).components).toEqual([]);
+    expect(buttonsOf(answerOf(submitted)).map(([label]) => label)).toEqual(['Map']);
   });
 
   it('answers a second refusal, and "nothing changed", in the place of the first', async () => {
@@ -200,14 +201,15 @@ describe('/gym edit', () => {
     // Sent again as it was, from the form the refusal opened.
     const second = await made.submit(form.custom_id, bad);
     expect(second.reply).not.toHaveBeenCalled();
-    expect(sent(second.update).content).toMatch(/^The name is too long as I store it/);
+    expect(said(sent(second.update))).toMatch(/^The name is too long as I store it/);
     expect(buttonsOf(sent(second.update)).map(([label]) => label)).toEqual([
       'Open the form again',
       'Cancel',
     ]);
     // Put back to what it was: nothing to write, said where the refusal stood.
     const third = await made.submit(form.custom_id, filled(form));
-    expect(sent(third.update)).toEqual({ content: 'Nothing was changed.', components: [] });
+    expect(said(sent(third.update))).toBe('Nothing was changed.');
+    expect(buttonsOf(sent(third.update))).toEqual([]);
     expect(made.gymStore.row(1)?.name).toBe('Pinewood Public Library');
   });
 
@@ -230,10 +232,10 @@ describe('/gym edit', () => {
     const made = await gymCommandsWith();
     const form = await editForm(made, 'id:1');
     const blank = await made.submit(form.custom_id, { ...filled(form), name: '  ' });
-    expect(answerOf(blank).content).toMatch(/^A gym needs a name\.\n/);
+    expect(said(answerOf(blank))).toMatch(/^A gym needs a name\.\n/);
     const keywords = Array.from({ length: 33 }, (_, n) => `k${n}`).join(',');
     const many = await made.submit(form.custom_id, { ...filled(form), keywords });
-    expect(answerOf(many).content).toMatch(/^That is 3 keywords too many: a gym may have 30\.\n/);
+    expect(said(answerOf(many))).toMatch(/^That is 3 keywords too many: a gym may have 30\.\n/);
     expect(buttonsOf(answerOf(many)).map(([label]) => label)).toEqual([
       'Open the form again',
       'Cancel',
@@ -256,7 +258,7 @@ describe('/gym edit', () => {
     ).toBe(true);
 
     const submitted = await made.submit(form.custom_id, { ...filled(form), nickname: 'Stacks' });
-    expect(answerOf(submitted).content).toBe(
+    expect(said(answerOf(submitted))).toBe(
       'Changed the nickname of **Pinewood Public Library** (Stacks, #1).\n' +
         'The notice of this gym is too long for the form and is unchanged. An admin has to ' +
         'shorten it in the database first.',
@@ -268,14 +270,12 @@ describe('/gym edit', () => {
     const made = await gymCommandsWith();
     const form = await editForm(made, 'id:1');
     const other = await made.submit(form.custom_id, filled(form), { userId: '200000000000000007' });
-    expect(answerOf(other).content).toBe('That is somebody else’s question.');
+    expect(said(answerOf(other))).toBe('That is somebody else’s question.');
     const member = await made.submit(form.custom_id, filled(form), {
       userId: MEMBER,
       roleNames: [],
     });
-    expect(answerOf(member).content).toBe(
-      'Only admins, moderators and bot developers can do that.',
-    );
+    expect(said(answerOf(member))).toBe('Only admins, moderators and bot developers can do that.');
     const unknown = await made.submit('gym:0000000000000000:edit', { name: 'X' });
     expect(answerOf(unknown)).toEqual({
       content: 'That has expired. Use the command again.',
@@ -284,7 +284,7 @@ describe('/gym edit', () => {
     // Sent twice: the second finds nothing to answer.
     await made.submit(form.custom_id, { ...filled(form), nickname: 'Stacks' });
     const twice = await made.submit(form.custom_id, { ...filled(form), nickname: 'Other' });
-    expect(answerOf(twice).content).toBe('That has expired. Use the command again.');
+    expect(said(answerOf(twice))).toBe('That has expired. Use the command again.');
     expect(made.gymStore.row(1)?.nickname).toBe('Stacks');
   });
 
@@ -298,7 +298,7 @@ describe('/gym edit', () => {
       { ...filled(form), nickname: 'Leaf' },
       { modalFromCommand: true },
     );
-    expect(sent(submitted.followUp).content).toBe('That gym no longer exists.');
+    expect(said(sent(submitted.followUp))).toBe('That gym no longer exists.');
   });
 
   it('leaves no button behind when a form opened again is sent after the gym was deleted', async () => {
@@ -311,11 +311,8 @@ describe('/gym edit', () => {
     const submitted = await made.submit(form.custom_id, { ...filled(form), nickname: 'Leaf' });
     // In the place of the refusal, without its buttons: not a note beside dead buttons.
     expect(submitted.followUp).not.toHaveBeenCalled();
-    expect(answerOf(submitted)).toEqual({
-      content: 'That gym no longer exists.',
-      embeds: [],
-      components: [],
-    });
+    expect(said(answerOf(submitted))).toBe('That gym no longer exists.');
+    expect(buttonsOf(answerOf(submitted))).toEqual([]);
   });
 
   it('notes a new name that the search ignores, and not again with every later change', async () => {
@@ -323,18 +320,18 @@ describe('/gym edit', () => {
     const note = 'Its name consists only of words the search ignores';
     const form = await editForm(made, 'id:1');
     const renamed = await made.submit(form.custom_id, { ...filled(form), name: 'The Gym' });
-    expect(answerOf(renamed).content).toContain(note);
+    expect(said(answerOf(renamed))).toContain(note);
     // It has a nickname: members find it, and a change of its notice says nothing of its name.
     const second = await editForm(made, 'id:1');
     const noticed = await made.submit(second.custom_id, { ...filled(second), notice: 'Wet paint' });
-    expect(answerOf(noticed).content).not.toContain(note);
+    expect(said(answerOf(noticed))).not.toContain(note);
     // Without nickname and keywords nothing finds it: said with every change.
     const third = await editForm(made, 'id:1');
     const bare = await made.submit(third.custom_id, { ...filled(third), nickname: '' });
-    expect(answerOf(bare).content).toContain(note);
+    expect(said(answerOf(bare))).toContain(note);
     const fourth = await editForm(made, 'id:1');
     const still = await made.submit(fourth.custom_id, { ...filled(fourth), notice: '' });
-    expect(answerOf(still).content).toContain(note);
+    expect(said(answerOf(still))).toContain(note);
   });
 
   it('says of several texts, and of the keywords, that they are too long for the form', async () => {
@@ -346,7 +343,7 @@ describe('/gym edit', () => {
     await made.directory.refreshGym(1);
     const form = await editForm(made, 'id:1');
     const both = await made.submit(form.custom_id, filled(form));
-    expect(answerOf(both).content).toBe(
+    expect(said(answerOf(both))).toBe(
       'Nothing was changed.\nThe notice and the keywords of this gym are too long for the form ' +
         'and are unchanged. An admin has to shorten them in the database first.',
     );
@@ -354,7 +351,7 @@ describe('/gym edit', () => {
     await made.directory.refreshGym(1);
     const next = await editForm(made, 'id:1');
     const one = await made.submit(next.custom_id, filled(next));
-    expect(answerOf(one).content).toContain(
+    expect(said(answerOf(one))).toContain(
       'The keywords of this gym are too long for the form and are unchanged. An admin has to ' +
         'shorten them in the database first.',
     );
@@ -370,13 +367,13 @@ describe('/gym move', () => {
     const moved = await made.use('move', { gym: 'id:6', location: '40.0302, -80.03' });
     expect(moved.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const answer = answerOf(moved);
-    expect(answer.content).toBe(
+    expect(said(answer)).toBe(
       `Moved **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)} (22 m).\n` +
         'Its address and the places around it are being fetched from Google; `/gym show` has ' +
         'them in a moment.',
     );
-    expect(answer.components).toEqual([]);
-    expect(embedOf(answer).footer?.text).toBe('Gym #6 · 40.0302, -80.03');
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Map']);
+    expect(gymOf(answer)).toBe('Gym #6 · 40.0302, -80.03');
     expect(made.gymStore.row(6)).toMatchObject({ lat: 40.0302, lon: -80.03 });
   });
 
@@ -384,7 +381,7 @@ describe('/gym move', () => {
     const made = await gymCommandsWith();
     const asked = await made.use('move', { gym: 'id:6', location: '40.05, -79.95' });
     const question = answerOf(asked);
-    expect(question.content?.split('\n')).toEqual([
+    expect(said(question).split('\n')).toEqual([
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)}?`,
       'That is 7.2 km from where it is now.',
     ]);
@@ -393,21 +390,21 @@ describe('/gym move', () => {
 
     const pressed = await made.press(buttonId(question, 'Move anyway'));
     const answer = answerOf(pressed);
-    expect(answer.content?.split('\n')[0]).toBe(
+    expect(said(answer).split('\n')[0]).toBe(
       `Moved **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)} (7.2 km).`,
     );
-    expect(fieldsOf(answer).Regions).toBe(`<#${EAST_CHANNEL}>`);
+    expect(gymViewOf(answer).lines.at(-1)).toBe(`It lies in <#${EAST_CHANNEL}>.`);
     expect(made.gymStore.row(6)).toMatchObject({ lat: 40.05, lon: -79.95 });
     // 499 metres are a correction; the limit is 500.
     const near = await made.use('move', { gym: 'id:6', location: '40.0544, -79.95' });
-    expect(answerOf(near).content).toMatch(/^Moved /);
+    expect(said(answerOf(near))).toMatch(/^Moved /);
   });
 
   it('asks one question when the place is far away and beside another gym', async () => {
     const made = await gymCommandsWith();
     const asked = await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' });
     const question = answerOf(asked);
-    expect(question.content?.split('\n')).toEqual([
+    expect(said(question).split('\n')).toEqual([
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05005, -80.05)}?`,
       'That is 2.8 km from where it is now.',
       'Another gym lies within 10 metres of that place:',
@@ -418,7 +415,7 @@ describe('/gym move', () => {
 
     const pressed = await made.press(buttonId(question, 'Move anyway'));
     expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
-    expect(answerOf(pressed).content).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\) from /);
+    expect(said(answerOf(pressed))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\) from /);
     expect(made.gymStore.row(6)).toMatchObject({ lat: 40.05005, lon: -80.05 });
   });
 
@@ -429,7 +426,7 @@ describe('/gym move', () => {
       location: 'https://www.google.com/maps/@40.0302,-80.03,17z',
     });
     const question = answerOf(asked);
-    expect(question.content?.split('\n')).toEqual([
+    expect(said(question).split('\n')).toEqual([
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
       'I read this from where the map was centred, not from a pin: check the link before you go on.',
     ]);
@@ -446,7 +443,7 @@ describe('/gym move', () => {
     const pressed = await made.press(buttonId(question, 'Move anyway'));
 
     const again = answerOf(pressed);
-    expect(again.content?.split('\n')).toEqual([
+    expect(said(again).split('\n')).toEqual([
       'A gym was added at that place since I asked, so nothing was moved yet.',
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)}?`,
       'That is 7.2 km from where it is now.',
@@ -466,7 +463,7 @@ describe('/gym move', () => {
         location: 'https://www.google.com/maps/@40.05,-79.95,17z',
       }),
     );
-    expect(question.content).toContain('I read this from where the map was centred');
+    expect(said(question)).toContain('I read this from where the map was centred');
     // Somebody else corrects the gym meanwhile.
     await made.admin.move(6, { lat: 40.0301, lon: -80.03 }, STAFF_PLACE, {
       from: { lat: 40.03, lon: -80.03 },
@@ -476,7 +473,7 @@ describe('/gym move', () => {
     const pressed = await made.press(buttonId(question, 'Move anyway'));
 
     const again = answerOf(pressed);
-    expect(again.content?.split('\n')).toEqual([
+    expect(said(again).split('\n')).toEqual([
       'The gym was moved since I asked, so nothing was moved yet.',
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.0301, -80.03)} to ${link(40.05, -79.95)}?`,
       'That is 7.2 km from where it is now.',
@@ -500,9 +497,9 @@ describe('/gym move', () => {
       made.press(buttonId(second, 'Move anyway'), other),
     ]);
 
-    expect(answerOf(moved).content).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\)/);
+    expect(said(answerOf(moved))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\)/);
     const again = answerOf(pressed);
-    expect(again.content?.split('\n')).toEqual([
+    expect(said(again).split('\n')).toEqual([
       'A gym was added at that place since I asked, so nothing was moved yet.',
       `Move **Pinewood Post Office Gym** (#12) from ${link(40.04, -80.04)} to ${link(40.015, -80.015)}?`,
       'That is 3.5 km from where it is now.',
@@ -521,7 +518,7 @@ describe('/gym move', () => {
       made.admin.add({ name: 'Newcomer', lat: 40.03021, lon: -80.03 }, STAFF_PLACE),
       made.use('move', { gym: 'id:6', location: '40.0302, -80.03' }),
     ]);
-    expect(answerOf(moved).content?.split('\n')).toEqual([
+    expect(said(answerOf(moved)).split('\n')).toEqual([
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
       'Another gym lies within 10 metres of that place:',
       '- **Newcomer** (#13), 1 m away',
@@ -539,7 +536,7 @@ describe('/gym move', () => {
     );
     await made.admin.add({ name: 'Newcomer', lat: 40.03021, lon: -80.03 }, STAFF_PLACE);
     const again = answerOf(await made.press(buttonId(question, 'Move')));
-    expect(again.content?.split('\n')).toEqual([
+    expect(said(again).split('\n')).toEqual([
       'A gym was added at that place since I asked, so nothing was moved yet.',
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
       'I read this from where the map was centred, not from a pin: check the link before you go on.',
@@ -552,7 +549,7 @@ describe('/gym move', () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' }));
     const pressed = await made.press(buttonId(question, 'Cancel'));
-    expect(sent(pressed.update).content).toBe('The gym stays where it is.');
+    expect(said(sent(pressed.update))).toBe('The gym stays where it is.');
     expect(made.gymStore.row(6)?.lat).toBe(40.03);
   });
 
@@ -563,18 +560,15 @@ describe('/gym move', () => {
     const pressed = await made.press(buttonId(question, 'Move anyway'));
     // In the place of the question, without its buttons: not a note beside dead buttons.
     expect(pressed.followUp).not.toHaveBeenCalled();
-    expect(answerOf(pressed)).toEqual({
-      content: 'That gym no longer exists.',
-      embeds: [],
-      components: [],
-    });
+    expect(said(answerOf(pressed))).toBe('That gym no longer exists.');
+    expect(buttonsOf(answerOf(pressed))).toEqual([]);
   });
 
   it('does not take the gym itself for another gym near its new place', async () => {
     const made = await gymCommandsWith();
     // Five metres from where it is.
     const moved = await made.use('move', { gym: 'id:1', location: '40.05005,-80.05' });
-    expect(answerOf(moved).content).toMatch(/^Moved \*\*Pinewood Public Library\*\*/);
+    expect(said(answerOf(moved))).toMatch(/^Moved \*\*Pinewood Public Library\*\*/);
   });
 
   it('is never refused for a raid or a train, and says what stays when the regions change', async () => {
@@ -602,10 +596,10 @@ describe('/gym move', () => {
     const lines = async (location: string): Promise<string[]> => {
       const used = await made.use('move', { gym: 'id:6', location });
       const first = answerOf(used);
-      const answer = first.components?.length
+      const answer = buttonsOf(first).some(([label]) => label === 'Move anyway')
         ? answerOf(await made.press(buttonId(first, 'Move anyway')))
         : first;
-      return answer.content?.split('\n').slice(2) ?? [];
+      return said(answer).split('\n').slice(2) ?? [];
     };
 
     // Within its region: nothing to say.
@@ -630,7 +624,7 @@ describe('/gym move', () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('move', { gym: 'id:6', location: '41.0, -80' }));
     const answer = answerOf(await made.press(buttonId(question, 'Move anyway')));
-    expect(answer.content?.split('\n').slice(2)).toEqual([
+    expect(said(answer).split('\n').slice(2)).toEqual([
       'It now lies in no region: raids cannot be reported there.',
     ]);
   });
@@ -650,11 +644,11 @@ describe('/gym move', () => {
     if (raid.kind !== 'created') throw new Error('no raid');
     const inPost = { channelId: raid.party.forumPostId ?? '', thread: { parentId: WEST_FORUM } };
     const moved = await made.use('move', { gym: 'id:6', location: '40.0302, -80.03' }, inPost);
-    expect(answerOf(moved).content?.split('\n').at(-1)).toBe(
+    expect(said(answerOf(moved)).split('\n').at(-1)).toBe(
       'To change this raid’s gym, use `/location`.',
     );
     const asked = await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' }, inPost);
-    expect(answerOf(asked).content?.split('\n').at(-1)).toBe(
+    expect(said(answerOf(asked)).split('\n').at(-1)).toBe(
       'To change this raid’s gym, use `/location`.',
     );
     // The raid is where it was.
@@ -682,7 +676,7 @@ describe('/gym move', () => {
   it('refuses a location it cannot read', async () => {
     const made = await gymCommandsWith();
     const used = await made.use('move', { gym: 'id:6', location: 'next door' });
-    expect(sent(used.followUp).content).toMatch(/^I could not read a place from that\./);
+    expect(said(sent(used.followUp))).toMatch(/^I could not read a place from that\./);
     expect(made.gymStore.row(6)?.lat).toBe(40.03);
   });
 });
@@ -691,19 +685,19 @@ describe('/gym elite', () => {
   it('marks a gym as an elite raid gym and takes the mark away', async () => {
     const made = await gymCommandsWith();
     const marked = await made.use('elite', { gym: 'id:1', eligible: true });
-    expect(answerOf(marked).content).toBe(
+    expect(said(answerOf(marked))).toBe(
       '**Pinewood Public Library** (The Stacks, #1) is now marked as an elite raid gym.',
     );
-    expect(fieldsOf(answerOf(marked))['Elite raid gym']).toBe('Yes');
+    expect(fieldsOf(answerOf(marked))['Elite raid gym']).toBe('yes');
     expect(made.gymStore.row(1)).toMatchObject({ taggedEx: true, confirmedEx: false });
     const again = await made.use('elite', { gym: 'id:1', eligible: true });
-    expect(answerOf(again).content).toContain('was an elite raid gym already.');
+    expect(said(answerOf(again))).toContain('was an elite raid gym already.');
 
     const cleared = await made.use('elite', { gym: 'id:1', eligible: false });
-    expect(answerOf(cleared).content).toContain('is no longer marked as an elite raid gym.');
-    expect(fieldsOf(answerOf(cleared))['Elite raid gym']).toBe('No');
+    expect(said(answerOf(cleared))).toContain('is no longer marked as an elite raid gym.');
+    expect(fieldsOf(answerOf(cleared))['Elite raid gym']).toBe('no');
     const none = await made.use('elite', { gym: 'id:1', eligible: false });
-    expect(answerOf(none).content).toContain('was no elite raid gym.');
+    expect(said(answerOf(none))).toContain('was no elite raid gym.');
   });
 
   it('clears both stored flags of a gym the legacy bot marked', async () => {
@@ -711,7 +705,7 @@ describe('/gym elite', () => {
     await made.gymStore.update(2, { confirmedEx: true });
     await made.directory.refreshGym(2);
     const cleared = await made.use('elite', { gym: 'id:2', eligible: false });
-    expect(answerOf(cleared).content).toContain('is no longer marked as an elite raid gym.');
+    expect(said(answerOf(cleared))).toContain('is no longer marked as an elite raid gym.');
     expect(made.gymStore.row(2)).toMatchObject({ taggedEx: false, confirmedEx: false });
   });
 
@@ -720,15 +714,81 @@ describe('/gym elite', () => {
     await made.gymStore.update(3, { name: '\u202e\u200b\u0007', nickname: null });
     await made.directory.refreshGym(3);
     const elite = answerOf(await made.use('elite', { gym: '#3', eligible: true }));
-    expect(elite.content).toBe('**Gym** (#3) is now marked as an elite raid gym.');
-    expect(embedOf(elite).title).toBe('Gym #3');
+    expect(said(elite)).toBe('**Gym** (#3) is now marked as an elite raid gym.');
+    expect(gymViewOf(elite).title).toBe('Gym #3');
   });
 
   it('never says EX', async () => {
     const made = await gymCommandsWith();
     const answer = answerOf(await made.use('elite', { gym: 'id:1', eligible: true }));
-    expect(JSON.stringify([answer.content, embedOf(answer)])).not.toMatch(/\bEX\b/);
+    expect(JSON.stringify(answer)).not.toMatch(/\bEX\b/);
     const { gym } = await import('./index.js');
     expect(JSON.stringify(gym.data.toJSON())).not.toMatch(/\bex\b/i);
   });
 });
+
+describe('/gym: questions and refusals from before plan 8B-4', () => {
+  const closed = {
+    content: ANSWERED_BELOW,
+    embeds: [],
+    components: [],
+    attachments: [],
+  };
+
+  it('answers Move on a plain-text question below it', async () => {
+    const made = await gymCommandsWith();
+    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.2, -80.03' }));
+    const pressed = await made.press(buttonId(question, 'Move anyway'), { v2Message: false });
+    expect(sent(pressed.editReply)).toEqual(closed);
+    expect(said(sent(pressed.followUp))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\*/);
+    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.2 });
+  });
+
+  it('answers Delete and Keep on a plain-text question below it, or in plain text', async () => {
+    const made = await gymCommandsWith();
+    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
+    const pressed = await made.press(buttonId(question, 'Delete'), { v2Message: false });
+    expect(sent(pressed.editReply)).toEqual(closed);
+    expect(said(sent(pressed.followUp))).toBe('Deleted **Maple Leaf Mosaic** (#6).');
+    const kept = answerOf(await made.use('delete', { gym: 'id:5' }));
+    const keep = await made.press(buttonId(kept, 'Keep'), { v2Message: false });
+    expect(sent(keep.update)).toEqual({
+      content: 'The gym was kept.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+  });
+
+  it('answers a form opened again from a plain-text refusal below that refusal', async () => {
+    const made = await gymCommandsWith();
+    const form = await editForm(made, 'id:1');
+    await made.submit(form.custom_id, { ...filled(form), name: '' }, { modalFromCommand: true });
+    // The form opened again from a refusal that was plain text.
+    const submitted = await made.submit(
+      form.custom_id,
+      { ...filled(form), notice: 'Wet paint' },
+      { v2Message: false },
+    );
+    expect(sent(submitted.editReply)).toEqual(closed);
+    expect(said(sent(submitted.followUp))).toBe(
+      'Changed the notice of **Pinewood Public Library** (The Stacks, #1).',
+    );
+  });
+
+  it('refuses /gym edit of a gym whose every text is too long for the form', async () => {
+    const made = await gymCommandsWith();
+    const long = 'x'.repeat(2_000);
+    await made.gymStore.update(1, {
+      name: 'n'.repeat(250),
+      nickname: 'k'.repeat(250),
+      description: long,
+      notice: long,
+      keywords: Array.from({ length: 40 }, (_, n) => `${'k'.repeat(48)}${n}`),
+    });
+    await made.directory.refreshGym(1);
+    const used = await made.use('edit', { gym: 'id:1' });
+    expect(used.showModal).not.toHaveBeenCalled();
+    expect(said(sent(used.reply))).toMatch(/too long for the form and are unchanged/);
+  });
+});
diff --git a/src/commands/gyms/edit.ts b/src/commands/gyms/edit.ts
index da48ec3b5aa9466ce887bf80f492b173f343be97..364fc5f5455b81868e02dc4ef0be6f7c97c3d9e9 100644
--- a/src/commands/gyms/edit.ts
+++ b/src/commands/gyms/edit.ts
@@ -2,6 +2,8 @@ import { namesakeNote } from './duplicates.js';
 import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
+import { answerApart, showInPlace, v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import {
   changedGymTexts,
   GYM_TEXT_FIELDS,
@@ -16,6 +18,7 @@ import {
   content,
   EXPIRED,
   GYM_GONE,
+  gymQuestion,
   gymViewMessage,
   markAnswered,
   nameNote,
@@ -125,26 +128,36 @@ export const editForms: Readonly<Record<string, FormAnswer>> = {
     const { typed, texts: sent } = sentForm(interaction, formFields(request));
     const changed = changedGymTexts(request.shown, sent);
     const refusal = textRefusal(changed);
+    // A form that was opened again from the refusal of an earlier one is answered in the place
+    // of that refusal: its button must not stay under an edit that is done. One that the
+    // command or "Edit…" of `/gym show` opened gets a message of its own (the view stays).
+    const again = interaction.isFromMessage() && request.fromView !== true;
     if (refusal !== undefined) {
       request.typed = typed;
-      await refuseForm(interaction, token, refusal);
+      // The next form comes from the refusal, which it is then answered in the place of.
+      request.fromView = undefined;
+      await refuseForm(interaction, token, refusal, !again);
       return;
     }
     if (pendingGyms.take(token, interaction.user.id) === 'expired') throw new UserError(EXPIRED);
     markAnswered(token);
     const names = GYM_TEXT_FIELDS.filter((field) => Object.hasOwn(changed, field));
     const note = tooLongNote(request.tooLong);
-    // A form that was opened again from the refusal of an earlier one is answered in the place
-    // of that refusal: its button must not stay under an edit that is done.
-    const again = interaction.isFromMessage();
     if (names.length === 0) {
-      const nothing = { content: content(['Nothing was changed.', note]), components: [] };
-      if (again) await interaction.update(nothing);
-      else await interaction.reply({ ...nothing, flags: MessageFlags.Ephemeral });
+      const nothing = gymQuestion([content(['Nothing was changed.', note])]);
+      if (again) await showInPlace(interaction, nothing);
+      else
+        await interaction.reply({
+          ...v2Answer(nothing),
+          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+        });
       return;
     }
     if (again) await interaction.deferUpdate();
     else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    /** The answer: in the place of a refusal, or the private answer just deferred. */
+    const show = (message: V2Message): Promise<unknown> =>
+      again ? showInPlace(interaction, message) : answerApart(interaction, message);
     await answerForm(interaction, async () => {
       const place = await staffPlace(interaction, ctx);
       // The form may have been open for hours: a gym that has come to lie only in another
@@ -155,7 +168,7 @@ export const editForms: Readonly<Record<string, FormAnswer>> = {
       // Said when the name was just made so, or while nothing else finds the gym either: not
       // again with every later change of a gym that has a nickname or keywords.
       const findable = gym.nickname !== null || gym.keywords.length > 0;
-      await interaction.editReply(
+      await show(
         await gymViewMessage(ctx, place, gym, [
           `Changed ${fieldList(names)} of ${gymWithId(gym)}.`,
           note,
diff --git a/src/commands/gyms/elite.ts b/src/commands/gyms/elite.ts
index e518ac9bf5a4b1c14164d3a99f29a29bcb7531ad..aabd00b2cac6321d7bd3b72e316455b6f760ff49 100644
--- a/src/commands/gyms/elite.ts
+++ b/src/commands/gyms/elite.ts
@@ -4,7 +4,7 @@ import { UserError } from '../../discord/errors.js';
 import { gymWithId } from '../../render/gym-view.js';
 import { isEliteGym } from '../../domain/party/raid.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
-import { GYM_GONE, gymViewMessage, staffPlace } from './shared.js';
+import { answerGym, GYM_GONE, gymViewMessage, staffPlace } from './shared.js';
 
 /**
  * `/gym elite`: whether a gym is an elite raid gym, as the game now calls what was an EX gym
@@ -40,7 +40,7 @@ export const eliteGym: SubcommandPart = {
       was === eligible
         ? `${gymWithId(gym)} ${eligible ? 'was an elite raid gym already' : 'was no elite raid gym'}.`
         : `${gymWithId(gym)} is ${eligible ? 'now marked as an elite raid gym' : 'no longer marked as an elite raid gym'}.`;
-    await interaction.editReply(await gymViewMessage(ctx, place, gym, [line]));
+    await answerGym(interaction, await gymViewMessage(ctx, place, gym, [line]));
   },
   autocomplete: respondWithGyms,
 };
diff --git a/src/commands/gyms/gym.test.ts b/src/commands/gyms/gym.test.ts
index 57bdf9819d51c0642957adff61b76d6132f86b72..ffb4fd47aa21e698a6632d085fe9caa25ae7d0c7 100644
--- a/src/commands/gyms/gym.test.ts
+++ b/src/commands/gyms/gym.test.ts
@@ -6,12 +6,15 @@ import {
   answerOf,
   buttonId,
   buttonsOf,
-  embedOf,
   gymCommandsWith,
+  gymOf,
+  gymViewOf,
   MEMBER,
   MODERATOR,
+  said,
 } from '../../../test/support/gym-commands.js';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { ANSWERED_BELOW } from '../../discord/late-reply.js';
 import { PENDING_HOURS } from './shared.js';
 
 const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
@@ -122,7 +125,7 @@ describe('/gym: the gym option', () => {
     async (typed) => {
       const made = await gymCommandsWith();
       const shown = await made.use('show', { gym: typed });
-      expect(embedOf(answerOf(shown)).footer?.text).toBe('Gym #1 · 40.05, -80.05');
+      expect(gymOf(answerOf(shown))).toBe('Gym #1 · 40.05, -80.05');
     },
   );
 
@@ -137,42 +140,36 @@ describe('/gym: the gym option', () => {
     });
     // A misspelling is a guess, even of one gym.
     const guess = await made.use('show', { gym: 'libary' });
-    expect(sent(guess.followUp).content).toContain(
-      '- **Pinewood Public Library** (The Stacks, #1)',
-    );
+    expect(said(sent(guess.followUp))).toContain('- **Pinewood Public Library** (The Stacks, #1)');
   });
 
   it('takes digits for the number of a gym, unless another gym is called so', async () => {
     const made = await gymCommandsWith();
     // Gym 12 exists, and no gym has 12 in its name: the number.
     const twelve = await made.use('show', { gym: '12' });
-    expect(embedOf(answerOf(twelve)).footer?.text).toMatch(/^Gym #12 /);
+    expect(gymOf(answerOf(twelve))).toMatch(/^Gym #12 /);
     // Not gym 120 or 121 either, which the search would find by the beginning of their number.
     await made.gymStore.create({ name: 'Liberty Bell', lat: 40.021, lon: -80.021 });
     await made.directory.refreshGym(13);
     const one = await made.use('show', { gym: '1' });
-    expect(embedOf(answerOf(one)).footer?.text).toMatch(/^Gym #1 /);
+    expect(gymOf(answerOf(one))).toMatch(/^Gym #1 /);
 
     // A gym that is called "1776": its name is no longer hidden behind gym #12's number…
     await made.admin.edit(13, { name: '12' }, MODERATOR);
     const both = await made.use('show', { gym: '12' });
-    expect(sent(both.followUp).content).toBe(
+    expect(said(sent(both.followUp))).toBe(
       '"12" is the number of one gym and in the name of another. Pick the one you mean from ' +
         'the list, or write the number as `#12`:\n' +
         '- **Pinewood Post Office Gym** (#12)\n- **12** (#13)',
     );
     // …and the number with its sign is always the number.
-    expect(embedOf(answerOf(await made.use('show', { gym: '#12' }))).footer?.text).toMatch(
-      /^Gym #12 /,
-    );
-    expect(embedOf(answerOf(await made.use('show', { gym: 'id:12' }))).footer?.text).toMatch(
-      /^Gym #12 /,
-    );
+    expect(gymOf(answerOf(await made.use('show', { gym: '#12' })))).toMatch(/^Gym #12 /);
+    expect(gymOf(answerOf(await made.use('show', { gym: 'id:12' })))).toMatch(/^Gym #12 /);
     // Digits that are no gym's number are text like any other.
     await made.admin.edit(13, { name: 'Route 1776 Marker' }, MODERATOR);
     const named = await made.use('show', { gym: '1776' });
-    expect(embedOf(answerOf(named)).footer?.text).toMatch(/^Gym #13 /);
-    expect(sent((await made.use('show', { gym: '4242' })).followUp).content).toMatch(
+    expect(gymOf(answerOf(named))).toMatch(/^Gym #13 /);
+    expect(said(sent((await made.use('show', { gym: '4242' })).followUp))).toMatch(
       /^I found no gym for "4242"\./,
     );
   });
@@ -181,11 +178,11 @@ describe('/gym: the gym option', () => {
     const made = await gymCommandsWith();
     await made.admin.edit(12, { name: 'Engine 12 Firehouse' }, MODERATOR);
     const shown = await made.use('show', { gym: '12' });
-    expect(embedOf(answerOf(shown)).footer?.text).toMatch(/^Gym #12 /);
+    expect(gymOf(answerOf(shown))).toMatch(/^Gym #12 /);
     // Another gym that is called so still makes it a question.
     await made.gymStore.create({ name: 'Pier 12', lat: 40.021, lon: -80.021 });
     await made.directory.refreshGym(13);
-    expect(sent((await made.use('show', { gym: '12' })).followUp).content).toBe(
+    expect(said(sent((await made.use('show', { gym: '12' })).followUp))).toBe(
       '"12" is the number of one gym and in the name of another. Pick the one you mean from ' +
         'the list, or write the number as `#12`:\n' +
         '- **Engine 12 Firehouse** (#12)\n- **Pier 12** (#13)',
@@ -206,7 +203,7 @@ describe('/gym: the gym option', () => {
     }
     await made.directory.load();
     const apostles = await made.use('show', { gym: '12' });
-    expect(embedOf(answerOf(apostles)).footer?.text).toMatch(/^Gym #120 /);
+    expect(gymOf(answerOf(apostles))).toMatch(/^Gym #120 /);
   });
 
   it('does not act on a number that another gym with a longer number is called by', async () => {
@@ -215,7 +212,7 @@ describe('/gym: the gym option', () => {
     await made.gymStore.create({ name: '1 Main Street', lat: 41, lon: -81 });
     await made.directory.refreshGym(13);
     const both = await made.use('show', { gym: '1' });
-    expect(sent(both.followUp).content).toBe(
+    expect(said(sent(both.followUp))).toBe(
       '"1" is the number of one gym and in the name of another. Pick the one you mean from ' +
         'the list, or write the number as `#1`:\n' +
         '- **Pinewood Public Library** (The Stacks, #1)\n- **1 Main Street** (#13)',
@@ -227,11 +224,11 @@ describe('/gym: the gym option', () => {
     await made.gymStore.update(3, { name: '\u202e\u200b\u0007', nickname: null });
     await made.directory.refreshGym(3);
     const shown = answerOf(await made.use('show', { gym: '#3' }));
-    expect(embedOf(shown).title).toBe('Gym #3');
+    expect(gymViewOf(shown).title).toBe('Gym #3');
     const typed = await made.typing('show', '#3');
     expect(choices(typed)).toEqual([{ name: 'Gym · #3', value: 'id:3' }]);
     const refused = await made.use('show', { gym: 'starbucks' });
-    expect(sent(refused.followUp).content).not.toContain('****');
+    expect(said(sent(refused.followUp))).not.toContain('****');
   });
 
   it('shows a legacy name without its control and direction characters, the number in its place', async () => {
@@ -241,19 +238,19 @@ describe('/gym: the gym option', () => {
     const [choice] = choices(await made.typing('show', 'mill'));
     expect(choice).toEqual({ name: 'Old Mill · XY · #3', value: 'id:3' });
     const refused = await made.use('show', { gym: 'old' });
-    expect(sent(refused.followUp).content).toContain('- **Old Mill** (XY, #3)');
+    expect(said(sent(refused.followUp))).toContain('- **Old Mill** (XY, #3)');
   });
 
   it('refuses text that names no gym, and a number that no gym has', async () => {
     const made = await gymCommandsWith();
-    expect(sent((await made.use('show', { gym: 'zzzz *qqqq*' })).followUp).content).toBe(
+    expect(said(sent((await made.use('show', { gym: 'zzzz *qqqq*' })).followUp))).toBe(
       'I found no gym for "zzzz \\*qqqq\\*". Type part of its name and pick it from the list, ' +
         'or give its number (`#123`).',
     );
-    expect(sent((await made.use('show', { gym: '#999' })).followUp).content).toBe(
+    expect(said(sent((await made.use('show', { gym: '#999' })).followUp))).toBe(
       'There is no gym #999.',
     );
-    expect(sent((await made.use('show', { gym: 'id:999' })).followUp).content).toBe(
+    expect(said(sent((await made.use('show', { gym: 'id:999' })).followUp))).toBe(
       'There is no gym #999.',
     );
   });
@@ -266,16 +263,13 @@ describe('/gym show', () => {
     const shown = await made.use('show', { gym: 'id:1' });
     expect(shown.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const answer = answerOf(shown);
-    expect(answer).toMatchObject({ content: '', files: [], components: [] });
-    const embed = embedOf(answer);
-    expect(embed.title).toBe('Pinewood Public Library (The Stacks)');
-    const fields = Object.fromEntries((embed.fields ?? []).map((f) => [f.name, f.value]));
-    expect(fields).toMatchObject({
-      'Elite raid gym': 'No',
-      Regions: `<#${WEST_CHANNEL}>`,
-      'Gym targets': '1 member',
-    });
-    expect(fields['Nearest gym']).toMatch(/^\*\*.+\*\* \(#\d+\), \d+(\.\d)? k?m away$/);
+    expect(answer).toMatchObject({ flags: MessageFlags.IsComponentsV2 });
+    expect(answer.files).toBeUndefined();
+    const view = gymViewOf(answer);
+    expect(view.title).toBe('Pinewood Public Library (The Stacks)');
+    expect(view.lines.at(-1)).toBe(`It lies in <#${WEST_CHANNEL}>.`);
+    expect(view.facts).toMatchObject({ 'Elite raid gym': 'no', 'Gym targets': '1 member' });
+    expect(view.facts['Nearest gym']).toMatch(/^\*\*.+\*\* \(#\d+\), \d+(\.\d)? k?m away$/);
   });
 
   it('attaches the map picture when there is one', async () => {
@@ -285,7 +279,7 @@ describe('/gym show', () => {
     });
     const answer = answerOf(await made.use('show', { gym: 'id:1' }));
     expect(answer.files).toEqual(['var/images/gyms/1-abc.png']);
-    expect(embedOf(answer).image).toEqual({ url: 'attachment://1-abc.png' });
+    expect(gymViewOf(answer).pictures).toEqual(['attachment://1-abc.png']);
   });
 
   it('shows the gym also when its map or its targets cannot be had', async () => {
@@ -295,9 +289,9 @@ describe('/gym show', () => {
     });
     made.gymTargets.failing = new Error('database is down');
     const answer = answerOf(await made.use('show', { gym: 'id:1' }));
-    const fields = Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));
-    expect(fields['Gym targets']).toBe('Unknown');
-    expect(answer.files).toEqual([]);
+    expect(gymViewOf(answer).facts['Gym targets']).toBe('unknown');
+    expect(answer.files).toBeUndefined();
+    expect(gymViewOf(answer).pictures).toEqual([]);
   });
 });
 
@@ -307,7 +301,7 @@ describe('/gym add', () => {
     const asked = await made.use('add', { location: FREE, name: '  Clock   Tower ' });
     expect(asked.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const question = answerOf(asked);
-    expect(question.content).toBe(
+    expect(said(question)).toBe(
       `Add **Clock Tower** at ${FREE_LINK}?\nIt would lie in <#${WEST_CHANNEL}>.`,
     );
     expect(buttonsOf(question).map(([label]) => label)).toEqual([
@@ -326,14 +320,14 @@ describe('/gym add', () => {
 
     expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
     const answer = answerOf(pressed);
-    expect(answer.content).toBe(
+    expect(said(answer)).toBe(
       'Added **Clock Tower** (#13).\nIts address and the places around it are being fetched ' +
         'from Google; `/gym show` has them in a moment.',
     );
-    expect(answer.components).toEqual([]);
-    expect(embedOf(answer)).toMatchObject({
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Map']);
+    expect(gymViewOf(answer)).toMatchObject({
       title: 'Clock Tower',
-      footer: { text: 'Gym #13 · 40.015, -80.015' },
+      smallPrint: 'Gym #13 · 40.015, -80.015',
     });
     expect(made.gymStore.row(13)).toMatchObject({ name: 'Clock Tower', lat: 40.015, lon: -80.015 });
     expect(made.directory.search(WEST_CHANNEL, 'clock tower')[0]?.gym.id).toBe(13);
@@ -353,10 +347,60 @@ describe('/gym add', () => {
   it('says that a question has expired when it is older than anything it remembers', async () => {
     const made = await gymCommandsWith();
     const pressed = await made.press('gym:00000000000000aa:add');
-    expect(sent(pressed.update)).toEqual({
+    expect(said(sent(pressed.update))).toBe('That has expired. Use the command again.');
+    expect(buttonsOf(sent(pressed.update))).toEqual([]);
+  });
+
+  it('shows the added gym with its map in place of the question, its file carried', async () => {
+    const made = await gymCommandsWith();
+    Object.assign(made.ctx, {
+      maps: { enabled: true, gym: () => Promise.resolve('var/images/gyms/13-abc.png') },
+    });
+    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
+    const pressed = await made.press(buttonId(question, 'Add'));
+    const answer = answerOf(pressed);
+    expect(gymViewOf(answer).pictures).toEqual(['attachment://13-abc.png']);
+    expect(answer.files).toEqual(['var/images/gyms/13-abc.png']);
+    expect(answer.attachments).toEqual([]);
+    // The fake holds the message to the file it names: the question it replaces had none.
+    expect((await pressed.fetchReply()).attachments).toEqual(['var/images/gyms/13-abc.png']);
+  });
+
+  it('asks and answers in components-v2 messages, the buttons in the container', async () => {
+    const made = await gymCommandsWith();
+    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
+    expect(question.flags).toBe(MessageFlags.IsComponentsV2);
+    expect(buttonsOf(question).map(([label]) => label)).toEqual([
+      'Add',
+      'Add with details…',
+      'Cancel',
+    ]);
+    const cancelled = await made.press(buttonId(question, 'Cancel'));
+    expect(sent(cancelled.update).flags).toBe(MessageFlags.IsComponentsV2);
+  });
+
+  it('answers a press on a plain-text question from before the plan below it', async () => {
+    const made = await gymCommandsWith();
+    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
+    const pressed = await made.press(buttonId(question, 'Add'), { v2Message: false });
+    // The old question is closed with a line, plain: it does not become a v2 message in place.
+    expect(sent(pressed.editReply)).toEqual({
+      content: ANSWERED_BELOW,
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    const below = sent(pressed.followUp);
+    expect(below.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
+    expect(said(below)).toMatch(/^Added \*\*Clock Tower\*\* \(#13\)\./);
+    expect(made.gymStore.row(13)).toBeDefined();
+    // An expired or cancelled one is told so in plain text.
+    const expired = await made.press('gym:00000000000000ab:add', { v2Message: false });
+    expect(sent(expired.update)).toEqual({
       content: 'That has expired. Use the command again.',
       embeds: [],
       components: [],
+      attachments: [],
     });
   });
 
@@ -376,7 +420,7 @@ describe('/gym add', () => {
       const late = answerOf(await made.use('add', { location: '40.02, -80.02', name: 'Late' }));
       vi.setSystemTime(Date.now() + PENDING_HOURS * 3_600_000);
       const pressed = await made.press(buttonId(late, 'Add'));
-      expect(sent(pressed.update).content).toBe('That has expired. Use the command again.');
+      expect(said(sent(pressed.update))).toBe('That has expired. Use the command again.');
     } finally {
       vi.useRealTimers();
     }
@@ -390,7 +434,7 @@ describe('/gym add', () => {
         name: 'Clock Tower',
       }),
     );
-    expect(question.content?.split('\n')).toEqual([
+    expect(said(question).split('\n')).toEqual([
       `Add **Clock Tower** at ${FREE_LINK}?`,
       'I read this from where the map was centred, not from a pin: check the link before you go on.',
       `It would lie in <#${WEST_CHANNEL}>.`,
@@ -403,7 +447,7 @@ describe('/gym add', () => {
     const question = answerOf(
       await made.use('add', { location: '40.05005,-80.05', name: 'Library Annex' }),
     );
-    expect(question.content?.split('\n').slice(2)).toEqual([
+    expect(said(question).split('\n').slice(2)).toEqual([
       'Another gym lies within 10 metres of that place:',
       '- **Pinewood Public Library** (The Stacks, #1), 6 m away',
     ]);
@@ -425,7 +469,7 @@ describe('/gym add', () => {
     const pressed = await made.press(buttonId(second, 'Add'));
 
     const again = answerOf(pressed);
-    expect(again.content?.split('\n')).toEqual([
+    expect(said(again).split('\n')).toEqual([
       'A gym was added at that place since I asked, so nothing was added yet.',
       `Add **Clock Tower** at ${FREE_LINK}?`,
       `It would lie in <#${WEST_CHANNEL}>.`,
@@ -448,9 +492,9 @@ describe('/gym add', () => {
       made.press(buttonId(second, 'Add'), other),
     ]);
 
-    expect(answerOf(added).content).toMatch(/^Added \*\*Clock Tower\*\* \(#13\)\./);
+    expect(said(answerOf(added))).toMatch(/^Added \*\*Clock Tower\*\* \(#13\)\./);
     const again = answerOf(pressed);
-    expect(again.content?.split('\n')).toEqual([
+    expect(said(again).split('\n')).toEqual([
       'A gym was added at that place since I asked, so nothing was added yet.',
       `Add **Clock Tower** at ${FREE_LINK}?`,
       `It would lie in <#${WEST_CHANNEL}>.`,
@@ -466,11 +510,8 @@ describe('/gym add', () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
     const pressed = await made.press(buttonId(question, 'Cancel'));
-    expect(sent(pressed.update)).toEqual({
-      content: 'Nothing was added.',
-      embeds: [],
-      components: [],
-    });
+    expect(said(sent(pressed.update))).toBe('Nothing was added.');
+    expect(buttonsOf(sent(pressed.update))).toEqual([]);
     expect(made.gymStore.writes).toEqual([]);
   });
 
@@ -501,7 +542,7 @@ describe('/gym add', () => {
     });
 
     expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
-    expect(answerOf(submitted).content).toContain('Added **Clock Tower** (Big Ben, #13).');
+    expect(said(answerOf(submitted))).toContain('Added **Clock Tower** (Big Ben, #13).');
     expect(made.gymStore.row(13)).toMatchObject({
       name: 'Clock Tower',
       nickname: 'Big Ben',
@@ -529,7 +570,7 @@ describe('/gym add', () => {
     // of the question stays that would add the gym without the details.
     expect(refused.reply).not.toHaveBeenCalled();
     const refusal = sent(refused.update);
-    expect(refusal.content).toBe(
+    expect(said(refusal)).toBe(
       'The nickname is too long as I store it, by 105 characters: apostrophes, accents and ' +
         'letters of other alphabets take several characters each. Shorten it.\n' +
         'The keyword "kkkkkkkkkkkkkkkkkkkkkkkkkkkkk…" is 2 characters too long: a keyword may have 50.\n' +
@@ -572,7 +613,7 @@ describe('/gym add', () => {
     const formId = buttonId(question, 'Add with details…').replace(/details$/, 'form');
     const refused = await made.submit(formId, { keywords: 'k'.repeat(52) });
     const cancelled = await made.press(buttonId(sent(refused.update), 'Cancel'));
-    expect(sent(cancelled.update).content).toBe('Nothing was added.');
+    expect(said(sent(cancelled.update))).toBe('Nothing was added.');
     expect(made.gymStore.writes).toEqual([]);
   });
 
@@ -593,7 +634,7 @@ describe('/gym add', () => {
       typed,
     );
     const again = answerOf(submitted);
-    expect(again.content).toContain('A gym was added at that place since I asked');
+    expect(said(again)).toContain('A gym was added at that place since I asked');
     expect(made.gymStore.row(14)).toBeUndefined();
 
     // "Add with details…" of the new question opens with them.
@@ -620,9 +661,9 @@ describe('/gym add', () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
     const other = await made.press(buttonId(question, 'Add'), { userId: '200000000000000007' });
-    expect(sent(other.reply).content).toBe('That is somebody else’s question.');
+    expect(said(sent(other.reply))).toBe('That is somebody else’s question.');
     const member = await made.press(buttonId(question, 'Add'), { userId: MEMBER, roleNames: [] });
-    expect(sent(member.reply).content).toBe(
+    expect(said(sent(member.reply))).toBe(
       'Only admins, moderators and bot developers can do that.',
     );
     const form = await made.press(buttonId(question, 'Add with details…'), {
@@ -644,9 +685,9 @@ describe('/gym add', () => {
     const question = answerOf(
       await made.use('add', { location: 'https://maps.app.goo.gl/AbC123', name: 'Clock Tower' }),
     );
-    expect(question.content).toContain(FREE_LINK);
+    expect(said(question)).toContain(FREE_LINK);
     const lost = await made.use('add', { location: 'https://maps.app.goo.gl/Nope', name: 'X' });
-    expect(sent(lost.followUp).content).toBe(
+    expect(said(sent(lost.followUp))).toBe(
       'I could not follow that link. Paste the coordinates instead.',
     );
     // What many links of the app lead to: a place by its name, without coordinates.
@@ -655,7 +696,7 @@ describe('/gym add', () => {
       'https://www.google.com/maps/place/Big+Fountain/data=!4m2!3m1!1s0x8834f1:0x1',
     );
     const named = await made.use('add', { location: 'https://maps.app.goo.gl/Named', name: 'X' });
-    expect(sent(named.followUp).content).toBe(
+    expect(said(sent(named.followUp))).toBe(
       'That link does not say where the place is. Open it, long-press the pin, and paste the ' +
         'coordinates Google shows.',
     );
@@ -689,7 +730,7 @@ describe('/gym add', () => {
       }),
     );
     // The place itself: no warning about the middle of a map.
-    expect(question.content).toBe(
+    expect(said(question)).toBe(
       `Add **Clock Tower** at ${FREE_LINK}?\nIt would lie in <#${WEST_CHANNEL}>.`,
     );
   });
@@ -697,17 +738,17 @@ describe('/gym add', () => {
   it('refuses a location it cannot read with what it reads, and a name of nothing', async () => {
     const made = await gymCommandsWith();
     const unreadable = await made.use('add', { location: 'by the lake', name: 'Clock Tower' });
-    expect(sent(unreadable.followUp).content).toBe(
+    expect(said(sent(unreadable.followUp))).toBe(
       'I could not read a place from that. Give the coordinates as `40.4406, -79.9959`, or ' +
         'paste a link to the place from Google Maps (also the short link its app shares), ' +
         'Apple Maps or the Ingress intel map.',
     );
     const nowhere = await made.use('add', { location: '95.5, 10', name: 'Clock Tower' });
-    expect(sent(nowhere.followUp).content).toMatch(/^Those numbers are no place: a latitude/);
+    expect(said(sent(nowhere.followUp))).toMatch(/^Those numbers are no place: a latitude/);
     const nameless = await made.use('add', { location: FREE, name: ' \n ' });
-    expect(sent(nameless.followUp).content).toBe('A gym needs a name.');
+    expect(said(sent(nameless.followUp))).toBe('A gym needs a name.');
     const wide = await made.use('add', { location: FREE, name: "'".repeat(50) });
-    expect(sent(wide.followUp).content).toMatch(
+    expect(said(sent(wide.followUp))).toMatch(
       /^The name is too long as I store it, by 45 characters/,
     );
     expect(made.pending()).toBeGreaterThanOrEqual(0);
@@ -717,10 +758,9 @@ describe('/gym add', () => {
   it('says of a place outside every region that it lies in none, and adds the gym all the same', async () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('add', { location: '41.0, -80', name: 'Far Away' }));
-    expect(question.content).toContain('It would lie in no region of this server.');
+    expect(said(question)).toContain('It would lie in no region of this server.');
     const answer = answerOf(await made.press(buttonId(question, 'Add')));
-    const fields = Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));
-    expect(fields.Regions).toBe('None of this server');
+    expect(gymViewOf(answer).lines.at(-1)).toBe('It lies in no region of this server.');
   });
 
   it('notes a name the search ignores, and that nothing is fetched without a key', async () => {
@@ -728,7 +768,7 @@ describe('/gym add', () => {
     made.geo.enabled = false;
     const question = answerOf(await made.use('add', { location: FREE, name: 'The Gym' }));
     const answer = answerOf(await made.press(buttonId(question, 'Add')));
-    expect(answer.content?.split('\n')).toEqual([
+    expect(said(answer).split('\n')).toEqual([
       'Added **The Gym** (#13).',
       'No Google API key is configured, so it has no address and no nearby places.',
       'Its name consists only of words the search ignores, so members will not find it by ' +
diff --git a/src/commands/gyms/import.test.ts b/src/commands/gyms/import.test.ts
index 7405fd3c5bd150c8ee44c24a7183753e04a21c70..ddb4901aef8be14d8ed8ed725f829ef5600f7941 100644
--- a/src/commands/gyms/import.test.ts
+++ b/src/commands/gyms/import.test.ts
@@ -14,6 +14,7 @@ import {
   gymCommandsWith,
   MEMBER,
   MODERATOR,
+  said,
 } from '../../../test/support/gym-commands.js';
 import { allComponents, buttonsOf, textDisplays } from '../../../test/support/messages.js';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
@@ -377,7 +378,7 @@ describe('/gym import: the preview', () => {
     const file = cityFile(made);
     for (const region of made.regions.all()) (region as { bounds: unknown }).bounds = null;
     const { answer } = await importing(made, packed(file));
-    expect(answer.content).toBe(
+    expect(said(answer)).toBe(
       'This server has no region with an outline, so an import has nothing to compare: give ' +
         'the regions their outlines with `/region import` first.',
     );
@@ -411,7 +412,7 @@ describe('/gym import: an export in parts', () => {
     const refusal = async (files: Attached[]): Promise<string> => {
       const { answer } = await importingFiles(made, files);
       expect(answer.components ?? []).toEqual([]);
-      return answer.content ?? '';
+      return said(answer) ?? '';
     };
     expect(await refusal([parts[0]!, other[1]!, parts[2]!])).toBe(
       'Those files are parts of different exports. Attach every part of one Save export ' +
@@ -439,7 +440,7 @@ describe('/gym import: an export in parts', () => {
       parts[0]!,
       { ...parts[1]!, size: MAX_EXPORT_BYTES + 1 },
     ]);
-    expect(answer.content).toBe(
+    expect(said(answer)).toBe(
       '`pine-wayspots-2026-10-15-part2of2.json.gz`: that file is larger than 10 MB, more ' +
         'than any packed part of an export. Attach the files the userscript saves, as they are.',
     );
@@ -453,7 +454,7 @@ describe('/gym import: an export in parts', () => {
       parts[0]!,
       { name: 'notes.txt', content: 'hello' },
     ]);
-    expect(answer.content).toMatch(
+    expect(said(answer)).toMatch(
       /^`notes\.txt`: that file is no export: it is neither gzip nor JSON\. /,
     );
   });
@@ -467,7 +468,7 @@ describe('/gym import: files it refuses', () => {
     const made = await gymCommandsWith();
     const { answer } = await importing(made, content, more);
     expect(answer.components ?? []).toEqual([]);
-    return { text: answer.content ?? '', made };
+    return { text: said(answer) ?? '', made };
   };
   const HOW =
     'Attach the file the userscript "Pine Wayspot export" saves (`pine-wayspots-<date>.json.gz`): ' +
@@ -523,7 +524,7 @@ describe('/gym import: files it refuses', () => {
     const made = await gymCommandsWith();
     made.attachments.failing = true;
     const { answer } = await importing(made, packed(cityFile(made)));
-    expect(answer.content).toBe(
+    expect(said(answer)).toBe(
       'I could not download that file from Discord. Try again in a moment.',
     );
   });
diff --git a/src/commands/gyms/move.ts b/src/commands/gyms/move.ts
index ce9f0a09cdde8ba6a5d16677b4e6f1556fb51b56..ce5d6bd3c6316a00fd36b0d677f65c729bffd79d 100644
--- a/src/commands/gyms/move.ts
+++ b/src/commands/gyms/move.ts
@@ -1,11 +1,10 @@
 import { namesakeNote } from './duplicates.js';
 import {
-  ActionRowBuilder,
   ButtonStyle,
   SlashCommandSubcommandBuilder,
-  type ButtonBuilder,
   type ButtonInteraction,
   type ChatInputCommandInteraction,
+  type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
@@ -19,12 +18,14 @@ import { count } from '../../render/text.js';
 import { FAR_MOVE_METRES, type MoveAsked } from '../../services/gym-admin-service.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
 import {
+  answerGym,
   APPROXIMATE,
   button,
   content,
   fetchNote,
   foreignPlace,
   GYM_GONE,
+  gymQuestion,
   gymViewMessage,
   HOW_TO_LOCATE,
   LOCATION_OPTION,
@@ -39,6 +40,9 @@ import {
 
 const FOREIGN_PLACE = foreignPlace('move a gym');
 
+/** What asks for a move: the command, a button of its question, the form of Move… of a view. */
+type MoveInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;
+
 /** What staff are told who move a gym in the post of a raid: that is not how a raid moves. */
 export const USE_LOCATION = 'To change this raid’s gym, use `/location`.';
 
@@ -48,7 +52,7 @@ export const USE_LOCATION = 'To change this raid’s gym, use `/location`.';
  * middle of a map. One question for all of them. It is kept as a pending request.
  */
 function moveQuestion(
-  interaction: ChatInputCommandInteraction | ButtonInteraction,
+  interaction: MoveInteraction,
   ctx: AppContext,
   gym: Gym,
   point: LatLon,
@@ -66,23 +70,22 @@ function moveQuestion(
     approximate,
     nearIds: near.map((found) => found.gym.id),
   });
-  return {
-    content: content([
-      before,
-      `Move ${gymWithId(gym)} from ${pointLink(gym)} to ${pointLink(point)}?`,
-      far ? `That is ${distanceText(metres)} from where it is now.` : undefined,
-      approximate ? APPROXIMATE : undefined,
-      ...nearLines(near),
-      raidOf(interaction, ctx) ? USE_LOCATION : undefined,
-    ]),
-    embeds: [],
-    components: [
-      new ActionRowBuilder<ButtonBuilder>().addComponents(
-        button(token, 'move', near.length > 0 || far ? 'Move anyway' : 'Move', ButtonStyle.Primary),
-        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
-      ),
+  return gymQuestion(
+    [
+      content([
+        before,
+        `Move ${gymWithId(gym)} from ${pointLink(gym)} to ${pointLink(point)}?`,
+        far ? `That is ${distanceText(metres)} from where it is now.` : undefined,
+        approximate ? APPROXIMATE : undefined,
+        ...nearLines(near),
+        raidOf(interaction, ctx) ? USE_LOCATION : undefined,
+      ]),
     ],
-  };
+    [
+      button(token, 'move', near.length > 0 || far ? 'Move anyway' : 'Move', ButtonStyle.Primary),
+      button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
+    ],
+  );
 }
 
 /**
@@ -101,7 +104,7 @@ function moveQuestion(
  * (`questioned`).
  */
 async function moveAnswered(
-  interaction: ChatInputCommandInteraction | ButtonInteraction,
+  interaction: MoveInteraction,
   ctx: AppContext,
   gymId: number,
   place: GivenPlace,
@@ -127,7 +130,8 @@ async function moveAnswered(
       moved.kind === 'elsewhere'
         ? 'The gym was moved since I asked, so nothing was moved yet.'
         : 'A gym was added at that place since I asked, so nothing was moved yet.';
-    await interaction.editReply(
+    await answerGym(
+      interaction,
       moveQuestion(interaction, ctx, gym, point, place.approximate, questioned ? since : undefined),
     );
     return;
@@ -135,7 +139,8 @@ async function moveAnswered(
   const { gym, from, metres } = moved;
   const shown = ctx.gymAdmin.shownBy(gymId);
   const elsewhere = regionsBefore.join() !== regionsNow().join();
-  await interaction.editReply(
+  await answerGym(
+    interaction,
     await gymViewMessage(ctx, staff, gym, [
       `Moved ${gymWithId(gym)} from ${pointLink(from)} to ${pointLink(point)} (${distanceText(metres)}).`,
       fetchNote(ctx),
@@ -216,7 +221,7 @@ export const moveGym: SubcommandPart = {
       await moveAnswered(interaction, ctx, gym.id, { point, approximate }, asked, false);
       return;
     }
-    await interaction.editReply(moveQuestion(interaction, ctx, gym, point, approximate));
+    await answerGym(interaction, moveQuestion(interaction, ctx, gym, point, approximate));
   },
   autocomplete: respondWithGyms,
 };
diff --git a/src/commands/gyms/servers.test.ts b/src/commands/gyms/servers.test.ts
index 64b294ac4396658d9ad5917698b2bb87e2147c0e..197f323529900dfb331f1841539d720ebe3cee5b 100644
--- a/src/commands/gyms/servers.test.ts
+++ b/src/commands/gyms/servers.test.ts
@@ -4,9 +4,11 @@ import { withOtherServer } from '../../../test/support/gym-admin.js';
 import {
   answerOf,
   buttonId,
-  embedOf,
+  buttonsOf,
   gymCommandsWith,
+  gymOf,
   OTHER_SERVER,
+  said,
 } from '../../../test/support/gym-commands.js';
 import { northRegion, OTHER_GUILD_ROW } from '../../../test/support/gyms.js';
 
@@ -24,10 +26,9 @@ const names = (interaction: { respond: { mock: { calls: unknown[][] } } }): stri
 
 /** What a command that was deferred answered a refusal with. */
 const refusal = async (used: Promise<Awaited<ReturnType<Made['use']>>>): Promise<string> =>
-  sent((await used).followUp).content ?? '';
+  said(sent((await used).followUp)) ?? '';
 
-const footer = (used: Awaited<ReturnType<Made['use']>>): string =>
-  embedOf(answerOf(used)).footer?.text ?? '';
+const footer = (used: Awaited<ReturnType<Made['use']>>): string => gymOf(answerOf(used)) ?? '';
 
 /** Puts gym 6 (Maple Leaf Mosaic, of West) into North: it now lies in the other server's region. */
 async function handOver(made: Made, gymId = 6): Promise<void> {
@@ -123,7 +124,7 @@ describe('/gym: the gyms of another server', () => {
     // The form of an edit is not deferred: its refusal is the reply.
     const edit = await made.use('edit', { gym: '#13' });
     expect(edit.showModal).not.toHaveBeenCalled();
-    expect(sent(edit.reply).content).toBe(none);
+    expect(said(sent(edit.reply))).toBe(none);
     expect(made.gymStore.writes).toEqual([]);
     expect(made.geo.asked).toEqual([]);
   });
@@ -158,9 +159,12 @@ describe('/gym: the gyms of another server', () => {
     await handOver(made);
     made.gymStore.writes.length = 0;
 
-    const gone = { content: 'That gym no longer exists.', embeds: [], components: [] };
-    expect(answerOf(await made.press(buttonId(deleting, 'Delete')))).toEqual(gone);
-    expect(answerOf(await made.press(buttonId(moving, 'Move anyway')))).toEqual(gone);
+    const deleted = answerOf(await made.press(buttonId(deleting, 'Delete')));
+    const moved = answerOf(await made.press(buttonId(moving, 'Move anyway')));
+    for (const gone of [deleted, moved]) {
+      expect(said(gone)).toBe('That gym no longer exists.');
+      expect(buttonsOf(gone)).toEqual([]);
+    }
     expect(made.gymStore.writes).toEqual([]);
     expect(made.gymStore.row(6)).toMatchObject({ lat: 40.26, lon: -80.06 });
     // It is the other server's now.
@@ -187,7 +191,7 @@ describe('/gym: the gyms of another server', () => {
       { ...fields, nickname: 'Ours' },
       { modalFromCommand: true },
     );
-    expect(sent(submitted.followUp).content).toBe('That gym no longer exists.');
+    expect(said(sent(submitted.followUp))).toBe('That gym no longer exists.');
     expect(made.gymStore.writes).toEqual([]);
   });
 });
@@ -196,7 +200,7 @@ describe('/gym add and /gym move: a place in another server’s regions', () =>
   it('adds no gym in a region of another server, and says why', async () => {
     const made = await twoServers();
     const refused = await made.use('add', { location: '40.26, -80.05', name: 'Intruder' });
-    expect(sent(refused.followUp).content).toBe(FOREIGN_ADD);
+    expect(said(sent(refused.followUp))).toBe(FOREIGN_ADD);
     expect(sent(refused.followUp).components ?? []).toEqual([]);
     // The server whose region it is adds it as ever; and so does anybody in no region.
     const own = answerOf(
@@ -235,19 +239,21 @@ describe('/gym add and /gym move: a place in another server’s regions', () =>
     await made.directory.load();
 
     const pressed = await made.press(buttonId(question, 'Add'));
-    expect(answerOf(pressed)).toEqual({ content: FOREIGN_ADD, embeds: [], components: [] });
+    expect(said(answerOf(pressed))).toBe(FOREIGN_ADD);
+    expect(buttonsOf(answerOf(pressed))).toEqual([]);
     // The same through the form for the details.
     const opened = await made.press(buttonId(withForm, 'Add with details…'));
     const form = opened.showModal.mock.calls[0]?.[0] as { custom_id: string };
     const submitted = await made.submit(form.custom_id, { nickname: 'Far' });
-    expect(answerOf(submitted)).toEqual({ content: FOREIGN_ADD, embeds: [], components: [] });
+    expect(said(answerOf(submitted))).toBe(FOREIGN_ADD);
+    expect(buttonsOf(answerOf(submitted))).toEqual([]);
     expect(made.gymStore.row(14)).toBeUndefined();
   });
 
   it('moves no gym into a region of another server, at the command or at the press', async () => {
     const made = await twoServers();
     const refused = await made.use('move', { gym: '#6', location: '40.26, -80.05' });
-    expect(sent(refused.followUp).content).toBe(FOREIGN_MOVE);
+    expect(said(sent(refused.followUp))).toBe(FOREIGN_MOVE);
     expect(made.gymStore.row(6)).toMatchObject({ lat: 40.03, lon: -80.03 });
 
     // Asked about a far place in no region, which is the other server's by the press.
@@ -266,7 +272,8 @@ describe('/gym add and /gym move: a place in another server’s regions', () =>
     });
     await made.directory.load();
     const pressed = await made.press(buttonId(question, 'Move anyway'));
-    expect(answerOf(pressed)).toEqual({ content: FOREIGN_MOVE, embeds: [], components: [] });
+    expect(said(answerOf(pressed))).toBe(FOREIGN_MOVE);
+    expect(buttonsOf(answerOf(pressed))).toEqual([]);
     expect(made.gymStore.row(6)).toMatchObject({ lat: 40.03, lon: -80.03 });
   });
 
diff --git a/src/commands/gyms/shared.ts b/src/commands/gyms/shared.ts
index c9b7ff1eb19c95881c9e86c1de4145ef0ab0e00b..1f8fd33fa57ac753337cb6ab6df60e9d68c36aa1 100644
--- a/src/commands/gyms/shared.ts
+++ b/src/commands/gyms/shared.ts
@@ -1,10 +1,8 @@
-import { basename } from 'node:path';
 import {
-  ActionRowBuilder,
   ButtonBuilder,
   ButtonStyle,
   MessageFlags,
-  type APIEmbed,
+  type APIButtonComponent,
   type APIModalInteractionResponseCallbackData,
   type ButtonInteraction,
   type ModalSubmitInteraction,
@@ -13,10 +11,18 @@ import type { AppContext } from '../../app-context.js';
 import { BoundedMap } from '../../bounded-map.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
 import { storedTextLength } from '../../db/repositories/gym-repository.js';
-import type { LocatedInteraction } from '../../discord/command.js';
+import type { GuardableInteraction, LocatedInteraction } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf } from '../../discord/guards.js';
+import {
+  answerApart,
+  answeredApart,
+  sayInPlace,
+  showInPlace,
+  v2Answer,
+} from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import { metresBetween } from '../../domain/geo/distance.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
 import { LOCATION_FORMS } from '../../domain/geo/location-input.js';
@@ -27,11 +33,13 @@ import {
   type GymTexts,
 } from '../../domain/gyms/gym-text.js';
 import { searchedWords } from '../../domain/search/gym-index.js';
-import { distanceText, gymWithId, renderGymView } from '../../render/gym-view.js';
+import { distanceText, GYM_COLOUR, gymWithId, renderGymView } from '../../render/gym-view.js';
 import { gymMapsUrl } from '../../render/raid-post.js';
 import { count, LIMITS, plain, truncate } from '../../render/text.js';
+import { actionRow, mapPicture, textMessage } from '../../render/v2.js';
 import type { LocationOutcome, StaffPlace } from '../../services/gym-admin-service.js';
 import { PendingRequests } from '../../services/pending-requests.js';
+import { mapOrNothing } from '../../services/static-maps.js';
 
 /** The custom-id kind of the controls of `/gym` (documented in `custom-id.ts`). */
 export const GYM_KIND = 'gym';
@@ -72,6 +80,8 @@ export type PendingGym =
       shown: Partial<GymTexts>;
       tooLong: readonly GymTextField[];
       typed?: TypedTexts | undefined;
+      /** The form was opened by Edit of a gym view: its answer is a message of its own. */
+      fromView?: boolean | undefined;
     }
   /**
    * `/gym move`: the gym, where it was when the question was asked (`from`) and where it goes,
@@ -318,19 +328,57 @@ export async function refuseForm(
   interaction: ModalSubmitInteraction,
   token: string,
   refusal: string,
+  apart = false,
 ): Promise<void> {
-  const answer = {
-    content: content([refusal, 'Nothing was saved. What you typed is kept:']),
-    embeds: [],
-    components: [
-      new ActionRowBuilder<ButtonBuilder>().addComponents(
-        button(token, 'reopen', 'Open the form again', ButtonStyle.Primary),
-        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
-      ),
+  const answer = gymQuestion(
+    [content([refusal, 'Nothing was saved. What you typed is kept:'])],
+    [
+      button(token, 'reopen', 'Open the form again', ButtonStyle.Primary),
+      button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
     ],
-  };
-  if (interaction.isFromMessage()) await interaction.update(answer);
-  else await interaction.reply({ ...answer, flags: MessageFlags.Ephemeral });
+  );
+  if (apart) await interaction.reply({ ...v2Answer(answer), flags: privateV2 });
+  else await showInPlace(interaction, answer);
+}
+
+/** The flags of a private components-v2 answer. */
+const privateV2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;
+
+/**
+ * A question or an answer of `/gym` as a components-v2 message (plan 8B-4: every message of the
+ * `/gym` flows is, since an answer takes the place of its question and a v2 message never
+ * becomes classic again): its sentences, and its buttons in a row inside.
+ */
+export function gymQuestion(
+  texts: readonly (string | undefined)[],
+  buttons: readonly (ButtonBuilder | APIButtonComponent)[] = [],
+): V2Message {
+  const row = buttons.map((one) => (one instanceof ButtonBuilder ? one.toJSON() : one));
+  return textMessage(GYM_COLOUR, texts, row.length === 0 ? [] : [actionRow(row)]);
+}
+
+/**
+ * Shows a question or an answer of `/gym`: as the answer of the command (its deferral edited)
+ * or of a press answered apart (`answerApart`), or in the place of the message a control is on (`showInPlace`: a question from before plan
+ * 8B-4, which is plain text, is closed with a line and the answer follows privately).
+ */
+export async function answerGym(
+  interaction: GuardableInteraction,
+  message: V2Message,
+): Promise<void> {
+  // A command, and a press answered in a private message of its own (Move… and Delete… of the
+  // view of `/gym show`), answer apart; a press on a question answers in its place.
+  if (interaction.isChatInputCommand() || answeredApart(interaction)) {
+    await answerApart(interaction, message);
+  } else await showInPlace(interaction, message);
+}
+
+/** Says a sentence in the place of the message a control of `/gym` is on (`sayInPlace`). */
+export function sayGym(
+  interaction: ButtonInteraction | ModalSubmitInteraction,
+  text: string,
+): Promise<void> {
+  return sayInPlace(interaction, text, GYM_COLOUR);
 }
 
 /**
@@ -348,7 +396,7 @@ export async function answerForm(
     await work();
   } catch (err) {
     if (!(err instanceof UserError) || !interaction.isFromMessage()) throw err;
-    await interaction.editReply({ content: err.message, embeds: [], components: [] });
+    await sayGym(interaction, err.message);
   }
 }
 
@@ -372,47 +420,33 @@ export function fetchNote(ctx: AppContext): string {
     : 'No Google API key is configured, so it has no address and no nearby places.';
 }
 
-/** A message with the full view of a gym, as the answer to a command or under a question. */
-interface GymViewMessage {
-  content: string;
-  embeds: APIEmbed[];
-  files: string[];
-  components: [];
-}
-
 /**
- * The full view of a gym under these lines: what `/gym show` answers, and every change of a
- * gym. The map picture is attached when there is one; the number of members who target the gym
- * is "Unknown" when it cannot be read. Neither stands in the way of the answer.
+ * The full view of a gym under these lines: what `/gym show` answers (with its `controls`), and
+ * every change of a gym. The map is shown when there is one; the number of members who target
+ * the gym is "unknown" when it cannot be read. Neither stands in the way of the answer.
  */
 export async function gymViewMessage(
   ctx: AppContext,
   place: StaffPlace,
   gym: Gym,
   lines: readonly (string | undefined)[],
-): Promise<GymViewMessage> {
+  controls: readonly APIButtonComponent[] = [],
+): Promise<V2Message> {
   const [targets, map] = await Promise.all([
     ctx.gymAdmin.targetCount(gym.id).catch((err: unknown) => {
       ctx.log.warn({ err, gym: gym.id }, 'could not count the gym targets of a gym');
       return undefined;
     }),
-    ctx.maps.gym(gym).catch((err: unknown) => {
-      ctx.log.warn({ err, gym: gym.id }, 'could not get the map of a gym');
-      return undefined;
-    }),
+    mapOrNothing(ctx.maps.gym(gym), ctx.log, 'a gym', { gym: gym.id }),
   ]);
   const nearestGym = gym.nearestGym === null ? undefined : ctx.gyms.get(gym.nearestGym);
-  const embed = renderGymView({
+  return renderGymView({
     gym,
     regions: ctx.gymAdmin.regionsOf(gym.id, place.guildId),
     nearest: nearestGym && { gym: nearestGym, metres: metresBetween(gym, nearestGym) },
     targets,
-    image: map === undefined ? undefined : `attachment://${basename(map)}`,
+    map: mapPicture(map, 'Map of the gym'),
+    above: lines,
+    controls,
   });
-  return {
-    content: content(lines),
-    embeds: [embed],
-    files: map === undefined ? [] : [map],
-    components: [],
-  };
 }
diff --git a/src/commands/gyms/show.ts b/src/commands/gyms/show.ts
index 96ee23fd31f758dece5765d2eb3457bb31a717aa..a3d1af79ccc4ae6bc4236174c2ffc9efcb32276f 100644
--- a/src/commands/gyms/show.ts
+++ b/src/commands/gyms/show.ts
@@ -1,7 +1,7 @@
 import { SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
-import { gymViewMessage, staffPlace } from './shared.js';
+import { answerGym, gymViewMessage, staffPlace } from './shared.js';
 
 /**
  * `/gym show`: everything Pine knows of a gym (the spec's `find` and `detail` in one). The
@@ -25,7 +25,7 @@ export const showGym: SubcommandPart = {
   async execute(interaction, ctx) {
     const gym = await chosenGym(interaction, ctx);
     const place = await staffPlace(interaction, ctx);
-    await interaction.editReply(await gymViewMessage(ctx, place, gym, []));
+    await answerGym(interaction, await gymViewMessage(ctx, place, gym, []));
   },
   autocomplete: respondWithGyms,
 };
diff --git a/src/commands/gyms/upkeep.ts b/src/commands/gyms/upkeep.ts
index 71252a94964cb211f27c319fcdbcb147cafd190d..05697d5d4e07866841887f607af2aa37b7b6df38 100644
--- a/src/commands/gyms/upkeep.ts
+++ b/src/commands/gyms/upkeep.ts
@@ -7,7 +7,7 @@ import { gymWithId } from '../../render/gym-view.js';
 import { count } from '../../render/text.js';
 import type { FetchOutcome } from '../../services/gym-upkeep.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
-import { GYM_GONE, gymViewMessage, staffPlace } from './shared.js';
+import { answerGym, GYM_GONE, gymViewMessage, staffPlace } from './shared.js';
 
 /** The name of the file `/gym export` attaches. */
 export const EXPORT_FILE = 'gyms.tsv';
@@ -63,7 +63,8 @@ export const refreshGym: SubcommandPart = {
             fetched('nearby places', 'Places API (New)', places),
           ];
     const place = await staffPlace(interaction, ctx);
-    await interaction.editReply(
+    await answerGym(
+      interaction,
       await gymViewMessage(ctx, place, gym, [`${gymWithId(gym)}:`, ...lines]),
     );
   },
diff --git a/src/commands/parties/status.ts b/src/commands/parties/status.ts
index 25bd792de2ee739e0a25e8020ac49b1926daaefc..efb6e69ee46f1184cd90eb1d897def856e5334be 100644
--- a/src/commands/parties/status.ts
+++ b/src/commands/parties/status.ts
@@ -16,7 +16,7 @@ import { gymMapsUrl } from '../../render/raid-post.js';
 import { plain } from '../../render/text.js';
 import { ACTION_THROTTLE, commandParty, partyOver } from './reply.js';
 
-/** Every use in a post sends a message with an embed into it. */
+/** Every use in a post sends a components-v2 message into it. */
 export const STATUS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };
 
 /**
diff --git a/src/commands/util/find-gym.test.ts b/src/commands/util/find-gym.test.ts
index ac2d6437e80e93939ce0f76491a350cffd762635..22c8ce9bbbdec02bb0eb96b6af3df0f5839227a3 100644
--- a/src/commands/util/find-gym.test.ts
+++ b/src/commands/util/find-gym.test.ts
@@ -6,7 +6,9 @@ import {
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
-import { embedOf } from '../../../test/support/gym-commands.js';
+import { gymViewOf, said } from '../../../test/support/gym-commands.js';
+import { asV2 } from '../../../test/support/fake-interactions.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { ALICE } from '../../../test/support/parties.js';
 import { reportedRaid } from '../../../test/support/party-service.js';
@@ -45,8 +47,8 @@ function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
   return { ctx, run, choices };
 }
 
-const shown = (used: FakeInteraction) => embedOf(sent(used.editReply));
-const refusal = (used: FakeInteraction) => sent(used.reply).content;
+const shown = (used: FakeInteraction) => gymViewOf(sent(used.editReply));
+const refusal = (used: FakeInteraction) => said(sent(used.reply));
 
 describe('/find-gym', () => {
   it('is a member command of servers, private, with a gym option of its own', () => {
@@ -73,14 +75,17 @@ describe('/find-gym', () => {
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(shown(used)).toEqual({
       title: 'Pinewood Public Library (The Stacks)',
-      url: 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
-      description: 'Mural of readers beside the front doors',
-      color: 0x3498db,
-      fields: [{ name: 'Regions', value: `<#${WEST_CHANNEL}>`, inline: true }],
-      image: { url: 'attachment://1-abc.png' },
-      footer: { text: 'Gym #1' },
+      lines: [`It lies in <#${WEST_CHANNEL}>.`],
+      facts: {},
+      smallPrint: 'Gym #1',
+      pictures: ['attachment://1-abc.png'],
     });
-    expect(sent(used.editReply).files).toEqual(['var/images/gyms/1-abc.png']);
+    const answer = sent(used.editReply);
+    expect(said(answer)).toBe('');
+    expect(answer.files).toEqual(['var/images/gyms/1-abc.png']);
+    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
+    expectV2Sendable(asV2(answer));
+    expect(JSON.stringify(answer)).toContain('Mural of readers beside the front doors');
   });
 
   it('shows the notice, and an elite raid gym as one', async () => {
@@ -88,22 +93,18 @@ describe('/find-gym', () => {
     const gym = made.ctx.gyms.get(11);
     if (!gym) throw new Error('no gym 11');
     Object.assign(gym, { taggedEx: true });
-    const embed = shown(await made.run('#11'));
-    expect(embed.fields).toEqual([
-      { name: 'Notice', value: 'Park closes at dusk' },
-      { name: 'Elite raid gym', value: 'Yes', inline: true },
-      { name: 'Regions', value: `<#${WEST_CHANNEL}>`, inline: true },
-    ]);
-    expect(embed).not.toHaveProperty('image');
+    const view = shown(await made.run('#11'));
+    expect(view.lines).toEqual(['Elite raid gym', `It lies in <#${WEST_CHANNEL}>.`]);
+    expect(view.facts).toEqual({ Notice: 'Park closes at dusk' });
+    expect(view.pictures).toEqual([]);
   });
 
   it('lists the raids at the gym now, with links to their posts', async () => {
     const raid = await reportedRaid();
     const made = setup({ parties: raid.store, regions: raid.regions });
-    const embed = shown(await made.run('g:1'));
-    const raids = embed.fields?.find((field) => field.name === 'Raids now');
-    expect(raids?.value).toMatch(new RegExp(`^<#${raid.postId}> · `));
-    expect(shown(await made.run('g:2')).fields?.map((field) => field.name)).toEqual(['Regions']);
+    const view = shown(await made.run('g:1'));
+    expect(view.facts['Raids now']).toMatch(new RegExp(`^<#${raid.postId}> · `));
+    expect(shown(await made.run('g:2')).facts).toEqual({});
   });
 
   it('acts on text only one gym of the server has every word of', async () => {
diff --git a/src/commands/util/find-gym.ts b/src/commands/util/find-gym.ts
index 9cab9cbae5989daf5784347c06e1f0b60bec0096..4da117ed75e7fa9467683ad8c3c5c4d61480a942 100644
--- a/src/commands/util/find-gym.ts
+++ b/src/commands/util/find-gym.ts
@@ -1,13 +1,15 @@
-import { basename } from 'node:path';
 import { SlashCommandBuilder } from 'discord.js';
 import type { Guard, SimpleCommand } from '../../discord/command.js';
 import { requireGuild } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { isRaid } from '../../domain/party/party.js';
 import { raidTierLabel } from '../../domain/pogo/raid-tier.js';
 import { renderMemberGymView } from '../../render/gym-view.js';
 import { raidLine } from '../../render/summary.js';
+import { mapPicture } from '../../render/v2.js';
 import { gymRegionsInGuild } from '../../services/region-directory.js';
+import { mapOrNothing } from '../../services/static-maps.js';
 import { respondWithServerGyms, serverGym, serverGymOption, serverOf } from './server-gym.js';
 
 /**
@@ -60,18 +62,15 @@ export const findGym: SimpleCommand = {
       .filter(isRaid)
       .filter((party) => party.gymId === gym.id && party.guildId === guildRow)
       .map((party) => raidLine({ party, title: `${raidTierLabel(party.raid.tier)} raid` }, now));
-    const map = await ctx.maps.gym(gym).catch((err: unknown) => {
-      ctx.log.warn({ err, gym: gym.id }, 'could not get the map of a gym');
-      return undefined;
-    });
-    const embed = renderMemberGymView({
+    const map = await mapOrNothing(ctx.maps.gym(gym), ctx.log, 'a gym', { gym: gym.id });
+    const view = renderMemberGymView({
       gym,
       regions:
         guildRow === undefined ? [] : gymRegionsInGuild(ctx.gyms, ctx.regions, gym.id, guildRow),
       raids,
-      image: map === undefined ? undefined : `attachment://${basename(map)}`,
+      map: mapPicture(map, 'Map of the gym'),
     });
-    await interaction.editReply({ embeds: [embed], files: map === undefined ? [] : [map] });
+    await interaction.editReply(v2Answer(view));
   },
   autocomplete: respondWithServerGyms,
 };
diff --git a/src/commands/util/server-gym.test.ts b/src/commands/util/server-gym.test.ts
index d1a9df9a0e13bf50312cf924025fa584473b9a18..2fb4dd1cd82129f18af12a88003381a8daf5d01e 100644
--- a/src/commands/util/server-gym.test.ts
+++ b/src/commands/util/server-gym.test.ts
@@ -4,7 +4,7 @@ import {
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
-import { embedOf } from '../../../test/support/gym-commands.js';
+import { gymViewOf } from '../../../test/support/gym-commands.js';
 import { testGyms, testRegions, WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
@@ -32,7 +32,7 @@ function setup(change: (gyms: ReturnType<typeof testGyms>) => void = () => undef
 }
 
 const refusal = (used: FakeInteraction) => sent(used.reply).content;
-const title = (used: FakeInteraction) => embedOf(sent(used.editReply)).title;
+const title = (used: FakeInteraction) => gymViewOf(sent(used.editReply)).title;
 
 describe('the gym option of the member commands', () => {
   it('offers the one gym a misspelt text may mean, without acting on it', async () => {
diff --git a/src/render/gym-view.test.ts b/src/render/gym-view.test.ts
index 0d4632af0cce9e37a3868965ad7255fa7546858d..ac345ae74608581cb440cb9f46c87e3f71f8ed0f 100644
--- a/src/render/gym-view.test.ts
+++ b/src/render/gym-view.test.ts
@@ -1,3 +1,5 @@
+import path from 'node:path';
+import { ButtonStyle, ComponentType } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { testGyms } from '../../test/support/gyms.js';
 import {
@@ -13,9 +15,17 @@ import {
   type GymView,
   type ViewedGym,
 } from './gym-view.js';
-import { textOf } from '../../test/support/messages.js';
+import {
+  accentOf,
+  buttonLabels,
+  galleryOf,
+  linksOf,
+  textDisplays,
+  textOf,
+} from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
 import { gymMapsUrl } from './raid-post.js';
-import { LIMITS } from './text.js';
+import { mapPicture } from './v2.js';
 
 const library = (): ViewedGym => {
   const gym = testGyms().find((one) => one.id === 1);
@@ -31,9 +41,6 @@ const view = (gym: Partial<ViewedGym> = {}, more: Partial<GymView> = {}): GymVie
   ...more,
 });
 
-const fieldsOf = (shown: GymView): Record<string, string> =>
-  Object.fromEntries((renderGymView(shown).fields ?? []).map(({ name, value }) => [name, value]));
-
 describe('sentences about a gym', () => {
   it('tells a gym from its namesakes by nickname and number', () => {
     expect(gymWithId({ id: 9, name: 'Starbucks', nickname: null })).toBe('**Starbucks** (#9)');
@@ -63,9 +70,8 @@ describe('sentences about a gym', () => {
     const invisible = { id: 12, name: '\u202e\u200b\u0007', nickname: '\u200e', lat: 40, lon: -80 };
     expect(gymWithId(invisible)).toBe('**Gym** (#12)');
     expect(gymRemovedLine(invisible)).toBe('**Gym** (#12) was removed from the gym list.');
-    expect(gymAnnouncement(invisible, []).embeds?.[0]?.title).toBe('Gym #12');
-    const embed = renderGymView(view({ ...invisible }));
-    expect(embed.title).toBe('Gym #12');
+    expect(textDisplays(gymAnnouncement(invisible, []))[1]).toMatch(/^### \[Gym #12\]\(/);
+    expect(textDisplays(renderGymView(view({ ...invisible })))[0]).toMatch(/^### \[Gym #12\]\(/);
   });
 
   it('counts the regions that do not fit into the sentence', () => {
@@ -91,10 +97,33 @@ describe('sentences about a gym', () => {
     expect(distanceText(1_402.4)).toBe('1.4 km');
   });
 
-  it('announces a new gym without its nickname when it has none', () => {
+  it('announces a new gym without its nickname when it has none, and without a ping', () => {
     const message = gymAnnouncement({ ...library(), nickname: null }, []);
-    expect(message.embeds?.[0]?.description).toBe('It lies in no region of this server.');
+    expect(textDisplays(message)).toEqual([
+      'A gym was added to the gym list.',
+      `### [Pinewood Public Library](<${gymMapsUrl(library())}>)
+` + 'It lies in no region of this server.',
+      '-# Gym #1',
+    ]);
+    expect(linksOf(message)).toEqual([`Map ${gymMapsUrl(library())}`]);
     expect(message.mention).toBeUndefined();
+    expect(message.files).toBeUndefined();
+  });
+
+  it('announces a new gym with its nickname, its regions and its map', () => {
+    const file = path.join('var', 'images', 'gyms', '1-abc.png');
+    const message = gymAnnouncement(
+      library(),
+      [{ channelId: '100000000000000001' }],
+      mapPicture(file, 'Map of the gym'),
+    );
+    expect(textDisplays(message)[1]).toBe(
+      `### [Pinewood Public Library (The Stacks)](<${gymMapsUrl(library())}>)
+` + 'It lies in <#100000000000000001>.',
+    );
+    expect(galleryOf(message)).toEqual(['attachment://1-abc.png']);
+    expect(message.files).toEqual([file]);
+    expectV2Sendable(message);
   });
 
   it('says in one line that a gym was removed', () => {
@@ -155,39 +184,28 @@ describe('gymsAnnouncement', () => {
 });
 
 describe('renderGymView', () => {
-  it('shows everything that is known of a gym', () => {
-    const embed = renderGymView(
+  const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';
+
+  it('shows everything that is known of a gym, as one container', () => {
+    const message = renderGymView(
       view({ notice: 'Closed on *Sundays*', keywords: ['books', 'mural'] }),
     );
-    expect(embed).toEqual({
-      title: 'Pinewood Public Library (The Stacks)',
-      url: 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
-      description: 'Mural of readers beside the front doors',
-      color: 0x3498db,
-      fields: [
-        { name: 'Notice', value: 'Closed on \\*Sundays\\*', inline: false },
-        { name: 'Elite raid gym', value: 'No', inline: true },
-        { name: 'Regions', value: '<#100000000000000001>', inline: true },
-        { name: 'Gym targets', value: '3 members', inline: true },
-        {
-          name: 'Nearest gym',
-          value: '**Pinewood Post Office Gym** (#12), 1.4 km away',
-          inline: false,
-        },
-        { name: 'Keywords', value: 'books, mural', inline: false },
-        {
-          name: 'Address (from Google)',
-          value: '12 Maple Avenue, Pinewood, Pennsylvania 15999',
-          inline: false,
-        },
-        {
-          name: 'Nearby places (from Google)',
-          value: 'Corner Bakery, Maple Dental',
-          inline: false,
-        },
-      ],
-      footer: { text: 'Gym #1 · 40.05, -80.05' },
-    });
+    expect(accentOf(message)).toBe(0x3498db);
+    expect(textDisplays(message)).toEqual([
+      `### [Pinewood Public Library (The Stacks)](<${MAPS}>)\n` +
+        '12 Maple Avenue, Pinewood, Pennsylvania 15999\n' +
+        'It lies in <#100000000000000001>.',
+      'Mural of readers beside the front doors',
+      '**Notice**\nClosed on \\*Sundays\\*\n' +
+        '**Keywords:** books, mural\n' +
+        '**Gym targets:** 3 members\n' +
+        '**Elite raid gym:** no\n' +
+        '**Nearest gym:** **Pinewood Post Office Gym** (#12), 1.4 km away\n' +
+        '-# Nearby places (from Google): Corner Bakery, Maple Dental',
+      '-# Gym #1 · 40.05, -80.05',
+    ]);
+    expect(linksOf(message)).toEqual([`Map ${MAPS}`]);
+    expect(message.files).toBeUndefined();
   });
 
   it('leaves out what a gym does not have, and says none where staff would wonder', () => {
@@ -195,36 +213,49 @@ describe('renderGymView', () => {
       { nickname: null, description: null, notice: null, geodata: null, places: null },
       { regions: [], nearest: undefined, targets: undefined },
     );
-    const embed = renderGymView(shown);
-    expect(embed.title).toBe('Pinewood Public Library');
-    expect(embed.description).toBeUndefined();
-    expect(embed.image).toBeUndefined();
-    expect(fieldsOf(shown)).toEqual({
-      'Elite raid gym': 'No',
-      Regions: 'None of this server',
-      'Gym targets': 'Unknown',
-      'Nearest gym': 'None',
-      Keywords: 'None',
-    });
+    expect(textDisplays(renderGymView(shown))).toEqual([
+      `### [Pinewood Public Library](<${MAPS}>)\nIt lies in no region of this server.`,
+      '**Keywords:** none\n' +
+        '**Gym targets:** unknown\n' +
+        '**Elite raid gym:** no\n' +
+        '**Nearest gym:** none',
+      '-# Gym #1 · 40.05, -80.05',
+    ]);
+  });
+
+  it('puts what a change did above the view, and buttons beside the Map link', () => {
+    const edit = {
+      type: ComponentType.Button as const,
+      style: ButtonStyle.Secondary as const,
+      label: 'Edit…',
+      custom_id: 'gymview:1:edit',
+    };
+    const message = renderGymView(
+      view({}, { above: ['Changed it.', undefined, 'Note.'], controls: [edit] }),
+    );
+    expect(textDisplays(message)[0]).toBe('Changed it.\nNote.');
+    expect(buttonLabels(message)).toEqual(['Map', 'Edit…']);
   });
 
   it('calls a gym an elite raid gym when either stored flag is set', () => {
-    expect(fieldsOf(view({ taggedEx: true }))['Elite raid gym']).toBe('Yes');
-    expect(fieldsOf(view({ confirmedEx: true }))['Elite raid gym']).toBe('Yes');
+    expect(textOf(renderGymView(view({ taggedEx: true })))).toContain('**Elite raid gym:** yes');
+    expect(textOf(renderGymView(view({ confirmedEx: true })))).toContain('**Elite raid gym:** yes');
     expect(JSON.stringify(renderGymView(view({ taggedEx: true, confirmedEx: true })))).not.toMatch(
       /\bEX\b/,
     );
   });
 
-  it('shows the map picture when there is one', () => {
-    expect(renderGymView(view({}, { image: 'attachment://gym.png' })).image).toEqual({
-      url: 'attachment://gym.png',
-    });
+  it('shows the map at full width with its file', () => {
+    const file = path.join('var', 'images', 'gyms', '1-abc.png');
+    const message = renderGymView(view({}, { map: mapPicture(file, 'Map of the gym') }));
+    expect(galleryOf(message)).toEqual(['attachment://1-abc.png']);
+    expect(message.files).toEqual([file]);
+    expectV2Sendable(message);
   });
 
   it('counts one member as one', () => {
-    expect(fieldsOf(view({}, { targets: 1 }))['Gym targets']).toBe('1 member');
-    expect(fieldsOf(view({}, { targets: 0 }))['Gym targets']).toBe('0 members');
+    expect(textOf(renderGymView(view({}, { targets: 1 })))).toContain('**Gym targets:** 1 member');
+    expect(textOf(renderGymView(view({}, { targets: 0 })))).toContain('**Gym targets:** 0 members');
   });
 
   it('shows what staff typed as plain text', () => {
@@ -235,28 +266,52 @@ describe('renderGymView', () => {
       keywords: ['_under_'],
       places: '*Star* Cafe',
     });
-    const text = JSON.stringify(renderGymView(shown));
+    const message = renderGymView(shown);
+    const text = textOf(message);
     expect(text).not.toContain('**Bold**');
     expect(text).not.toContain('](https://example.com)');
-    const description = renderGymView(shown).description ?? '';
+    // The brackets of the name cannot end the link of the heading.
+    expect(textDisplays(message)[0]).toMatch(/^### \[\\\*\\\*Bold\\\*\\\* \\\[link\\\]/);
+    const description = textDisplays(message)[1] ?? '';
     expect(description.startsWith('\\# Heading\n')).toBe(true);
     // A mention typed as text stays text.
     expect(description).not.toContain('<@123>');
     expect(description).not.toContain('<#456>');
     expect(text).not.toContain('@everyone');
-    expect(fieldsOf(shown).Keywords).toBe('\\_under\\_');
-    expect(fieldsOf(shown)['Nearby places (from Google)']).toBe('\\*Star\\* Cafe');
+    expect(text).toContain('**Keywords:** \\_under\\_');
+    expect(text).toContain('-# Nearby places (from Google): \\*Star\\* Cafe');
   });
 
-  it('stays within the limits of an embed whatever the texts of the gym', () => {
-    const long = (length: number): string => 'word '.repeat(Math.ceil(length / 5)).slice(0, length);
+  it('cuts what staff and Google wrote before escaping it, never in an escape', () => {
+    const stars = '*'.repeat(5_000);
+    const shown = view({
+      description: stars,
+      notice: stars,
+      places: stars,
+      geodata: JSON.stringify({ addressComponents: { formatted_address: stars } }),
+    });
+    const text = textOf(renderGymView(shown));
+    // A cut after escaping leaves a lone backslash before the ellipsis.
+    expect(text).not.toContain('\\…');
+    expect(text).toContain('\\*…');
+  });
+
+  it('keeps the lines above a view whole, and says how many more did not fit', () => {
+    const message = renderGymView(
+      view({}, { above: ['a'.repeat(900), `**Bold** ${'b'.repeat(200)}`, 'Third'] }),
+    );
+    expect(textDisplays(message)[0]).toBe(`${'a'.repeat(900)}\n…and 2 more lines`);
+  });
+
+  it('stays within the limits of a message whatever the texts of the gym', () => {
+    const long = (length: number): string => '*[x] '.repeat(Math.ceil(length / 5)).slice(0, length);
     const shown = view(
       {
         name: long(255),
         nickname: long(255),
         description: long(20_000),
         notice: long(20_000),
-        keywords: Array.from({ length: 400 }, (_, index) => `keyword-number-${index}`),
+        keywords: Array.from({ length: 400 }, (_, index) => `keyword_number_${index}`),
         geodata: JSON.stringify({
           addressComponents: Object.fromEntries(
             Array.from({ length: 80 }, (_, index) => [`type_${index}`, long(200)]),
@@ -264,33 +319,56 @@ describe('renderGymView', () => {
         }),
         places: long(20_000),
       },
-      { regions: Array.from({ length: 200 }, (_, index) => ({ channelId: `${1e17 + index}` })) },
+      {
+        regions: Array.from({ length: 200 }, (_, index) => ({ channelId: `${1e17 + index}` })),
+        nearest: { gym: { id: 99999, name: long(255), nickname: long(255) }, metres: 12 },
+        above: [long(5_000)],
+        map: mapPicture('var/images/gyms/1-abc.png'),
+      },
     );
-    const embed = renderGymView(shown);
-    expect(embed.title?.length).toBeLessThanOrEqual(LIMITS.embedTitle);
-    expect(embed.description?.length).toBeLessThanOrEqual(2_000);
-    expect(embed.fields?.length).toBeLessThanOrEqual(LIMITS.fields);
-    let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
-    total += embed.footer?.text.length ?? 0;
-    for (const { name, value } of embed.fields ?? []) {
-      expect(name.length).toBeLessThanOrEqual(LIMITS.fieldName);
-      expect(value.length).toBeGreaterThan(0);
-      expect(value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
-      total += name.length + value.length;
-    }
-    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
+    expectV2Sendable(renderGymView(shown));
   });
 });
 
 describe('renderMemberGymView', () => {
-  it('lists the raids at a gym in the room of a whole field', () => {
+  it('shows a gym as a member needs it, with its raids', () => {
     const raids = Array.from(
       { length: 12 },
       (_unused, i) => `<#1000000000000000${String(10 + i)}> · ends <t:1760000000:R> · 3 trainers`,
     );
-    const embed = renderMemberGymView({ gym: library(), regions: [], raids });
-    const shown = embed.fields?.find((field) => field.name === 'Raids now')?.value ?? '';
-    expect(shown.split('\n')).toEqual(raids);
-    expect(shown.length).toBeLessThanOrEqual(LIMITS.fieldValue);
+    const message = renderMemberGymView({
+      gym: { ...library(), notice: 'Closed', taggedEx: true },
+      regions: [{ channelId: '100000000000000001' }],
+      raids,
+    });
+    const texts = textDisplays(message);
+    expect(texts[0]?.split('\n')).toEqual([
+      `### [Pinewood Public Library (The Stacks)](<${gymMapsUrl(library())}>)`,
+      'Elite raid gym',
+      'It lies in <#100000000000000001>.',
+    ]);
+    expect(texts).toContain('**Notice**\nClosed');
+    expect(texts).toContain(`**Raids now**\n${raids.join('\n')}`);
+    expect(texts.at(-1)).toBe('-# Gym #1');
+    expect(textOf(message)).not.toContain('Keywords');
+    expect(linksOf(message)).toEqual([`Map ${gymMapsUrl(library())}`]);
+  });
+
+  it('stays within the limits of a message whatever the texts of the gym', () => {
+    const long = (length: number): string => '_x_ '.repeat(Math.ceil(length / 4)).slice(0, length);
+    const raids = Array.from({ length: 400 }, (_, i) => `<#${1e17 + i}> · ends soon · 3 trainers`);
+    const message = renderMemberGymView({
+      gym: {
+        ...library(),
+        name: long(255),
+        nickname: long(255),
+        description: long(9_000),
+        notice: long(9_000),
+      },
+      regions: Array.from({ length: 200 }, (_, index) => ({ channelId: `${1e17 + index}` })),
+      raids,
+      map: mapPicture('var/images/gyms/1-abc.png'),
+    });
+    expectV2Sendable(message);
   });
 });
diff --git a/src/render/gym-view.ts b/src/render/gym-view.ts
index b04c1dc4f6572284e7da6cd3bf4b3212693b63f0..676fe787d604e6f61124d784bd489024f418c28b 100644
--- a/src/render/gym-view.ts
+++ b/src/render/gym-view.ts
@@ -1,11 +1,19 @@
-import type { APIEmbed, APIEmbedField } from 'discord.js';
-import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
+import type { APIButtonComponent } from 'discord.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import { addressLine } from '../domain/geo/google.js';
 import { tidyLine } from '../domain/gyms/gym-text.js';
 import { isEliteGym } from '../domain/party/raid.js';
 import { gymMapsUrl } from './raid-post.js';
-import { count, fitItems, LIMITS, plain, plainLines, truncate } from './text.js';
-import { container, textDisplay } from './v2.js';
+import { count, fitItems, plain, plainLines, truncate } from './text.js';
+import {
+  actionRow,
+  container,
+  linkButton,
+  mapPicture,
+  separator,
+  textDisplay,
+  type MapPicture,
+} from './v2.js';
 
 /** What the sentences about a gym need of it (`Gym` of the repository has all of it). */
 interface NamedGym {
@@ -73,31 +81,62 @@ export function regionsSentence(regions: readonly { channelId: string }[]): stri
 }
 
 /**
- * What the channel for bot updates is told of a new gym: its name as a link to the place, its
- * nickname, and the regions of that server it lies in. It pings nobody.
+ * What the channel for bot updates is told of one new gym, as a components-v2 message (Matt,
+ * 2026-10-15): that it was added, its name as a link to the place with its nickname, the
+ * regions of that server it lies in, its map (`map`; without one, none), its number in small
+ * print and a Map button. It pings nobody. `map.files` go with the message.
  */
 export function gymAnnouncement(
   gym: NamedGym,
   regions: readonly { channelId: string }[],
-): ClassicMessage {
-  const lines = [
-    ...(gym.nickname ? [`Also known as **${shown(gym.nickname, NAMED.name)}**.`] : []),
-    regionsSentence(regions),
-  ];
+  map: MapPicture = mapPicture(undefined),
+): V2Message {
   return {
-    content: 'A gym was added to the gym list.',
-    embeds: [
-      {
-        title: truncate(gymLabel(gym), LIMITS.embedTitle),
-        url: gymMapsUrl(gym),
-        description: lines.join('\n'),
-        color: GYM_COLOUR,
-        footer: { text: `Gym #${gym.id}` },
-      },
+    v2: true,
+    components: [
+      container(GYM_COLOUR, [
+        textDisplay('A gym was added to the gym list.'),
+        textDisplay(`${gymHeading(gym)}\n${regionsSentence(regions)}`),
+        ...map.gallery,
+        textDisplay(`-# Gym #${gym.id}`),
+        actionRow([mapButton(gym)]),
+      ]),
     ],
+    ...withFiles(map),
   };
 }
 
+/** The files of a map for a message: none without one (the key is then left out). */
+function withFiles(map: MapPicture): { files?: string[] } {
+  return map.files.length === 0 ? {} : { files: map.files };
+}
+
+/**
+ * The heading of a view: `### [Name (Nickname)](<place>)`, plain, the name and the nickname cut
+ * before they are escaped (`HEADING`), and brackets escaped so that the link holds.
+ */
+function gymHeading(gym: Pick<NamedGym, 'id' | 'name' | 'nickname' | 'lat' | 'lon'>): string {
+  const nickname = gym.nickname ? shown(gym.nickname, HEADING.nickname) : '';
+  const name = gymLabel(gym, HEADING.name);
+  const title = nickname === '' ? name : `${name} (${nickname})`;
+  return `### [${escapeBrackets(title)}](<${gymMapsUrl(gym)}>)`;
+}
+
+/** How much of a name and a nickname a heading shows, cut before escaping. */
+const HEADING = { name: 100, nickname: 50 } as const;
+
+/** Brackets of a plain text escaped (unless a backslash escapes them already), for a link. */
+function escapeBrackets(text: string): string {
+  return text.replace(/(\\*)([[\]])/g, (whole, slashes: string, bracket: string) =>
+    slashes.length % 2 === 1 ? whole : `${slashes}\\${bracket}`,
+  );
+}
+
+/** The link button to the gym's place in Google Maps. */
+function mapButton(gym: { lat: number; lon: number }): APIButtonComponent {
+  return linkButton('Map', undefined, gymMapsUrl(gym));
+}
+
 /**
  * How many gyms an announcement of several names at most (`gymsAnnouncement`): each name is
  * cut by `gymWithId`, so the list stays far below the 4,096 characters of a description.
@@ -170,91 +209,109 @@ export interface GymView {
   nearest?: { gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>; metres: number } | undefined;
   /** How many members have it as a gym target; undefined when that could not be read. */
   targets?: number | undefined;
-  /** The address of the map picture (an attachment of the message); undefined without one. */
-  image?: string | undefined;
+  /** The map (`mapPicture`); without it, none. */
+  map?: MapPicture | undefined;
+  /** What an answer says above the view (what a change did); nothing for `/gym show`. */
+  above?: readonly (string | undefined)[] | undefined;
+  /** Buttons beside the Map button (those of `/gym show`). */
+  controls?: readonly APIButtonComponent[] | undefined;
 }
 
 /**
- * How much of each text the view shows at most. Discord counts 6,000 characters for an embed:
- * a title of 256, these, a notice of a whole field (1,024), the nearest gym (at most 270), the
- * short fields, the names of the fields and the footer come to about 5,700.
+ * How much of each text a view shows at most, so that the whole stays within `TEXT_BUDGET`
+ * whatever the gym's texts (the worst case is tested). What staff or Google wrote (the address,
+ * the description, the notices, the nearby places) is cut to these lengths before it is
+ * escaped, so that no escape is cut in two, and an escape may double it; the lines above the
+ * view (what a change did, made of escaped parts) are kept whole while they fit `above`, and
+ * the keywords and the raids are whole items within theirs. The heading is cut by `HEADING`,
+ * the regions by `regionsSentence`, the nearest gym by `gymWithId`.
  */
 const SHOWN = {
-  description: 1_200,
-  regions: 500,
-  keywords: 600,
-  address: 900,
-  places: 700,
-  /** The raids at a gym (`renderMemberGymView`), whose other texts are short: a whole field. */
-  raids: LIMITS.fieldValue,
+  above: 1_000,
+  address: 120,
+  description: 300,
+  notice: 200,
+  keywords: 250,
+  places: 120,
+  memberNotice: 300,
+  raids: 1_500,
 } as const;
 
-/** The title of a view of a gym: `Name (Nickname)`, plain, not cut. */
-function gymTitle(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>): string {
-  const nickname = gym.nickname ? shown(gym.nickname) : '';
-  return nickname === '' ? gymLabel(gym) : `${gymLabel(gym)} (${nickname})`;
+/** A text of several lines, cut to `limit` and then shown plain; empty for none. */
+function shownLines(text: string | null, limit: number): string {
+  return text ? plainLines(truncate(text, limit)) : '';
+}
+
+/**
+ * The lines above a view, kept whole in their order while they fit `room`, then how many more
+ * there were; the first always stays (a sentence of what a change did is short).
+ */
+function fitLines(lines: readonly string[], room: number): string {
+  const kept: string[] = [];
+  let used = 0;
+  for (const line of lines) {
+    if (kept.length > 0 && used + line.length + 1 > room) break;
+    // The first stays, cut only where it alone is longer than the room.
+    kept.push(kept.length === 0 ? truncate(line, room) : line);
+    used += line.length + 1;
+  }
+  const more = lines.length - kept.length;
+  return [...kept, ...(more > 0 ? [`…and ${count(more, 'more line')}`] : [])].join('\n');
 }
 
 /**
- * Everything Pine knows of a gym, as staff need it (`/gym show`, and the answer of every
- * change): name and nickname as a link to the place, the description, the notice, whether it
- * is an elite raid gym, the keywords, the regions, the nearest gym, how many members target
- * it, and what Google gave: the address parts and the nearby places. Every text is plain and
- * cut to what its place holds (`SHOWN`), so the embed is within Discord's limits whatever the
- * gym's texts.
+ * Everything Pine knows of a gym, as staff need it (`/gym show`, and the answer of every change
+ * with what the change did above it), as a components-v2 message: the name and nickname as a
+ * link to the place, the address Google gave and the regions of this server it lies in, the
+ * map, the description, then the notice, the keywords, how many members target it, whether it
+ * is an elite raid gym, the nearest gym and in small print the nearby places Google gave; the
+ * number and the coordinates in small print; a Map button with `controls` beside it. Every
+ * text is plain and cut to its room (`SHOWN`), so that the message is within Discord's limits
+ * whatever the gym's texts. `map.files` go with the message.
  */
-export function renderGymView(view: GymView): APIEmbed {
+export function renderGymView(view: GymView): V2Message {
   const { gym } = view;
-  const title = gymTitle(gym);
-  const fields: APIEmbedField[] = [];
-  const field = (
-    name: string,
-    value: string,
-    inline = false,
-    limit: number = LIMITS.fieldValue,
-  ): void => {
-    // Discord refuses a field without a value.
-    if (value !== '') fields.push({ name, value: truncate(value, limit), inline });
-  };
-  field('Notice', gym.notice ? plainLines(gym.notice) : '');
-  field('Elite raid gym', isEliteGym(gym) ? 'Yes' : 'No', true);
-  field(
-    'Regions',
-    view.regions.length === 0
-      ? 'None of this server'
-      : fitItems(
-          view.regions.map((region) => `<#${region.channelId}>`),
-          SHOWN.regions,
-        ),
-    true,
-  );
-  field(
-    'Gym targets',
-    view.targets === undefined ? 'Unknown' : count(view.targets, 'member'),
-    true,
-  );
-  field(
-    'Nearest gym',
+  const above = (view.above ?? []).filter((line): line is string => line !== undefined);
+  const address = plain(truncate(addressLine(gym.geodata), SHOWN.address));
+  const description = shownLines(gym.description, SHOWN.description);
+  const notice = shownLines(gym.notice, SHOWN.notice);
+  const facts = [
+    ...(notice === '' ? [] : [`**Notice**\n${notice}`]),
+    `**Keywords:** ${
+      gym.keywords.length === 0 ? 'none' : fitItems(gym.keywords.map(plain), SHOWN.keywords)
+    }`,
+    `**Gym targets:** ${view.targets === undefined ? 'unknown' : count(view.targets, 'member')}`,
+    `**Elite raid gym:** ${isEliteGym(gym) ? 'yes' : 'no'}`,
     // Cut inside `gymWithId`, before escaping: never here, where a cut could lose the `**`.
-    view.nearest
-      ? `${gymWithId(view.nearest.gym)}, ${distanceText(view.nearest.metres)} away`
-      : 'None',
-  );
-  field(
-    'Keywords',
-    gym.keywords.length === 0 ? 'None' : fitItems(gym.keywords.map(plain), SHOWN.keywords),
-  );
-  field('Address (from Google)', truncate(plain(addressLine(gym.geodata)), SHOWN.address));
-  field('Nearby places (from Google)', gym.places ? plain(gym.places) : '', false, SHOWN.places);
-  const description = gym.description ? plainLines(gym.description) : '';
+    `**Nearest gym:** ${
+      view.nearest
+        ? `${gymWithId(view.nearest.gym)}, ${distanceText(view.nearest.metres)} away`
+        : 'none'
+    }`,
+    ...(gym.places
+      ? [`-# Nearby places (from Google): ${plain(truncate(gym.places, SHOWN.places))}`]
+      : []),
+  ];
+  const map = view.map ?? mapPicture(undefined);
+  const where = [
+    gymHeading(gym),
+    ...(address === '' ? [] : [address]),
+    regionsSentence(view.regions),
+  ];
   return {
-    title: truncate(title, LIMITS.embedTitle),
-    url: gymMapsUrl(gym),
-    ...(description === '' ? {} : { description: truncate(description, SHOWN.description) }),
-    color: GYM_COLOUR,
-    fields,
-    ...(view.image === undefined ? {} : { image: { url: view.image } }),
-    footer: { text: `Gym #${gym.id} · ${gym.lat}, ${gym.lon}` },
+    v2: true,
+    components: [
+      container(GYM_COLOUR, [
+        ...(above.length === 0 ? [] : [textDisplay(fitLines(above, SHOWN.above)), separator()]),
+        textDisplay(where.join('\n')),
+        ...map.gallery,
+        ...(description === '' ? [] : [textDisplay(description)]),
+        textDisplay(facts.join('\n')),
+        textDisplay(`-# Gym #${gym.id} · ${gym.lat}, ${gym.lon}`),
+        actionRow([mapButton(gym), ...(view.controls ?? [])]),
+      ]),
+    ],
+    ...withFiles(map),
   };
 }
 
@@ -263,49 +320,45 @@ export interface MemberGymView {
   gym: Omit<ViewedGym, 'keywords' | 'geodata' | 'places'>;
   /** The regions of the server the view is shown in that the gym lies in. */
   regions: readonly { channelId: string }[];
-  /** The active raids at the gym in this server, as lines (`raidAtGymLine`). */
+  /** The active raids at the gym in this server, as lines (`raidLine`, each linking its post). */
   raids: readonly string[];
-  /** The address of the map picture (an attachment of the message); undefined without one. */
-  image?: string | undefined;
+  /** The map (`mapPicture`); without it, none. */
+  map?: MapPicture | undefined;
 }
 
 /**
- * A gym as a member looks it up (`/find-gym`): name and nickname as a link to the place, the
- * description, the notice, whether it is an elite raid gym, the regions of this server it lies
- * in, the raids there now and the map. Nothing of what only staff need (keywords, what Google
- * gave, the nearest gym, gym targets, the coordinates); the number only in the footer. Every
- * text is plain and cut as in `renderGymView`.
+ * A gym as a member looks it up (`/find-gym`), as a components-v2 message: the name and
+ * nickname as a link to the place, "Elite raid gym" under it when it is one, the regions of
+ * this server it lies in, the map, the description, the notice, the raids there now, its number
+ * in small print and a Map button. Nothing of what only staff need (keywords, what Google gave,
+ * the nearest gym, gym targets, the coordinates). Every text is plain and cut as in
+ * `renderGymView`.
  */
-export function renderMemberGymView(view: MemberGymView): APIEmbed {
+export function renderMemberGymView(view: MemberGymView): V2Message {
   const { gym } = view;
-  const fields: APIEmbedField[] = [];
-  if (gym.notice) {
-    const notice = plainLines(gym.notice);
-    if (notice !== '') fields.push({ name: 'Notice', value: truncate(notice, LIMITS.fieldValue) });
-  }
-  if (isEliteGym(gym)) fields.push({ name: 'Elite raid gym', value: 'Yes', inline: true });
-  fields.push({
-    name: 'Regions',
-    value:
-      view.regions.length === 0
-        ? 'None of this server'
-        : fitItems(
-            view.regions.map((region) => `<#${region.channelId}>`),
-            SHOWN.regions,
-          ),
-    inline: true,
-  });
-  if (view.raids.length > 0) {
-    fields.push({ name: 'Raids now', value: fitItems(view.raids, SHOWN.raids, '\n') });
-  }
-  const description = gym.description ? plainLines(gym.description) : '';
+  const description = shownLines(gym.description, SHOWN.description);
+  const notice = shownLines(gym.notice, SHOWN.memberNotice);
+  const map = view.map ?? mapPicture(undefined);
+  const where = [
+    gymHeading(gym),
+    ...(isEliteGym(gym) ? ['Elite raid gym'] : []),
+    regionsSentence(view.regions),
+  ];
   return {
-    title: truncate(gymTitle(gym), LIMITS.embedTitle),
-    url: gymMapsUrl(gym),
-    ...(description === '' ? {} : { description: truncate(description, SHOWN.description) }),
-    color: GYM_COLOUR,
-    fields,
-    ...(view.image === undefined ? {} : { image: { url: view.image } }),
-    footer: { text: `Gym #${gym.id}` },
+    v2: true,
+    components: [
+      container(GYM_COLOUR, [
+        textDisplay(where.join('\n')),
+        ...map.gallery,
+        ...(description === '' ? [] : [textDisplay(description)]),
+        ...(notice === '' ? [] : [textDisplay(`**Notice**\n${notice}`)]),
+        ...(view.raids.length === 0
+          ? []
+          : [textDisplay(`**Raids now**\n${fitItems(view.raids, SHOWN.raids, '\n')}`)]),
+        textDisplay(`-# Gym #${gym.id}`),
+        actionRow([mapButton(gym)]),
+      ]),
+    ],
+    ...withFiles(map),
   };
 }
diff --git a/src/services/gym-admin-service.test.ts b/src/services/gym-admin-service.test.ts
index 20051f307949aee7ed1ad367b5797530d5003665..3b034b8eb18a0b4f5ff4a5e4b62214a616b80c92 100644
--- a/src/services/gym-admin-service.test.ts
+++ b/src/services/gym-admin-service.test.ts
@@ -1,4 +1,4 @@
-import { textOf } from '../../test/support/messages.js';
+import { galleryOf, textDisplays, textOf, v2 } from '../../test/support/messages.js';
 import { describe, expect, it, vi } from 'vitest';
 import {
   gymAdminWith,
@@ -268,27 +268,100 @@ describe('GymAdminService.add', () => {
     const made = await gymAdminWith();
     await made.admin.add({ name: 'Clock *Tower*', ...FREE, nickname: 'Big Ben' }, STAFF_PLACE);
     await settle(made);
-    expect(announced(made)).toEqual([
-      {
-        content: 'A gym was added to the gym list.',
-        embeds: [
-          {
-            title: 'Clock \\*Tower\\*',
-            url: 'https://www.google.com/maps/search/?api=1&query=40.015%2C-80.015',
-            description: `Also known as **Big Ben**.\nIt lies in <#${WEST_CHANNEL}>.`,
-            color: 0x3498db,
-            footer: { text: 'Gym #13' },
-          },
-        ],
-      },
+    const [message, ...more] = announced(made);
+    expect(more).toEqual([]);
+    expect(textDisplays(message)).toEqual([
+      'A gym was added to the gym list.',
+      '### [Clock \\*Tower\\* (Big Ben)]' +
+        '(<https://www.google.com/maps/search/?api=1&query=40.015%2C-80.015>)\n' +
+        `It lies in <#${WEST_CHANNEL}>.`,
+      '-# Gym #13',
     ]);
+    expect(message?.mention).toBeUndefined();
+    // Without a map provider, no map.
+    expect(galleryOf(message)).toEqual([]);
+  });
+
+  it('shows the map of a new gym in its announcement, and goes without one that fails', async () => {
+    const asked: number[] = [];
+    const made = await gymAdminWith([], undefined, {
+      maps: {
+        gym: (gym) => {
+          asked.push(gym.id);
+          return Promise.resolve(`var/images/gyms/${gym.id}-abc.png`);
+        },
+      },
+    });
+    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
+    await settle(made);
+    const [message] = announced(made);
+    expect(asked).toEqual([13]);
+    expect(galleryOf(message)).toEqual(['attachment://13-abc.png']);
+    expect(v2(message).files).toEqual(['var/images/gyms/13-abc.png']);
+
+    const failing = await gymAdminWith([], undefined, {
+      maps: { gym: () => Promise.reject(new Error('disk full')) },
+    });
+    await failing.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
+    await settle(failing);
+    const [plain] = announced(failing);
+    expect(textDisplays(plain)[0]).toBe('A gym was added to the gym list.');
+    expect(galleryOf(plain)).toEqual([]);
+    expect(v2(plain).files).toBeUndefined();
+  });
+
+  it('sends the announcement once more without its map when Discord refuses the map', async () => {
+    const made = await gymAdminWith([], undefined, {
+      maps: { gym: (gym) => Promise.resolve(`var/images/gyms/${gym.id}-abc.png`) },
+    });
+    // Discord refuses a message with a file where the bot may not attach files.
+    made.gateway.refuseFiles = true;
+    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
+    await settle(made);
+    const [message, ...more] = announced(made);
+    expect(more).toEqual([]);
+    expect(textDisplays(message)[0]).toBe('A gym was added to the gym list.');
+    expect(galleryOf(message)).toEqual([]);
+    expect(v2(message).files).toBeUndefined();
+  });
+
+  it('fetches no map where there is no channel to announce in', async () => {
+    const asked: number[] = [];
+    const made = await gymAdminWith([], undefined, {
+      maps: {
+        gym: (gym) => {
+          asked.push(gym.id);
+          return Promise.resolve(undefined);
+        },
+      },
+    });
+    await made.admin.add({ name: 'Clock Tower', ...FREE }, { ...STAFF_PLACE, channelIds: [] });
+    await settle(made);
+    expect(asked).toEqual([]);
+    expect(announced(made)).toEqual([]);
+  });
+
+  it('announces nothing of a gym deleted while its map was fetched', async () => {
+    const forget: { gym?: (id: number) => void } = {};
+    const made = await gymAdminWith([], undefined, {
+      maps: {
+        gym: (gym) => {
+          forget.gym?.(gym.id);
+          return Promise.resolve(`var/images/gyms/${gym.id}-abc.png`);
+        },
+      },
+    });
+    forget.gym = (id) => made.directory.forget(id);
+    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
+    await settle(made);
+    expect(announced(made)).toEqual([]);
   });
 
   it('says of a gym outside every region of the server that it lies in none', async () => {
     const made = await gymAdminWith();
     await made.admin.add({ name: 'Far Away', lat: 41, lon: -80 }, STAFF_PLACE);
     await settle(made);
-    expect(announced(made)[0]?.embeds?.[0]?.description).toBe(
+    expect(textDisplays(announced(made)[0])[1]?.split('\n')[1]).toBe(
       'It lies in no region of this server.',
     );
   });
diff --git a/src/services/gym-admin-service.ts b/src/services/gym-admin-service.ts
index b1fe5cbb92392c352db3516b7f0c22b7d45b88fb..2d4c5d781f1f1b51ead931e8ffc2f9c666c780ec 100644
--- a/src/services/gym-admin-service.ts
+++ b/src/services/gym-admin-service.ts
@@ -4,7 +4,7 @@ import type { GymRemoval } from '../db/repositories/gym-removal-repository.js';
 import type { Gym, GymPatch, GymStorage, NewGym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import type { SavedRouteUpkeep } from '../db/repositories/saved-route-repository.js';
-import type { PartyGateway } from '../discord/party-gateway.js';
+import type { OutgoingMessage, PartyGateway } from '../discord/party-gateway.js';
 import { metresBetween, placesWithin } from '../domain/geo/distance.js';
 import type { LatLon } from '../domain/geo/lat-lon.js';
 import { readLocation } from '../domain/geo/location-input.js';
@@ -14,6 +14,8 @@ import type { GymTexts } from '../domain/gyms/gym-text.js';
 import { isRaid, isTrain, type RaidParty, type TrainParty } from '../domain/party/party.js';
 import type { Logger } from '../log.js';
 import { gymAnnouncement, gymLabel, gymRemovedLine, gymsAnnouncement } from '../render/gym-view.js';
+import { mapPicture } from '../render/v2.js';
+import { mapOrNothing, type MapProvider } from './static-maps.js';
 import type { Member } from './attendance-service.js';
 import type { GeoGateway } from './geo-gateway.js';
 import type { GymRefresh, GymsInMemory, GymUpkeep } from './gym-upkeep.js';
@@ -169,6 +171,8 @@ export interface GymAdminOptions {
   geo: Pick<GeoGateway, 'followShortLink'>;
   /** To announce a new gym and a deletion in the server's channel for bot updates. */
   gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage'>;
+  /** The map of a new gym for its announcement; without it the announcement has none. */
+  maps?: Pick<MapProvider, 'gym'>;
   settings: Settings;
   log: Logger;
   /**
@@ -336,7 +340,23 @@ export class GymAdminService {
       const outcome = await this.addLocked(gym, place, knownNearIds);
       if (outcome.kind === 'added') {
         const added = outcome.gym;
-        this.announce(place, () => gymAnnouncement(added, this.regionsOf(added.id, place.guildId)));
+        this.announce(place, async () => {
+          const map = this.options.maps
+            ? await mapOrNothing(this.options.maps.gym(added), this.options.log, 'a gym', {
+                gym: added.id,
+              })
+            : undefined;
+          // As the gym is once its map is there: a gym deleted meanwhile is not announced.
+          const gym = this.options.directory.get(added.id);
+          if (!gym) return [];
+          const regions = this.regionsOf(gym.id, place.guildId);
+          const plain = gymAnnouncement(gym, regions);
+          // Discord refuses a message with a file where the bot may not attach files (or the
+          // file is gone): the announcement then goes without its map.
+          return map === undefined
+            ? [plain]
+            : [gymAnnouncement(gym, regions, mapPicture(map, 'Map of the gym')), plain];
+        });
       }
       return outcome;
     });
@@ -460,15 +480,16 @@ export class GymAdminService {
   /** Tells the channel for bot updates of the gyms a batch added, in one message. */
   private announceAdded(place: StaffPlace, ids: readonly number[]): void {
     if (ids.length === 0) return;
-    this.announce(place, () =>
+    this.announce(place, () => {
       // A gym deleted again before the message went is not named; of none, nothing is said.
-      gymsAnnouncement(
+      const message = gymsAnnouncement(
         ids.flatMap((id) => {
           const gym = this.options.directory.get(id);
           return gym ? [{ gym, regions: this.regionsOf(id, place.guildId) }] : [];
         }),
-      ),
-    );
+      );
+      return message ? [message] : [];
+    });
   }
 
   /**
@@ -652,19 +673,20 @@ export class GymAdminService {
         log.warn({ err, gym: id }, 'could not bring the directory up to date after a deletion');
       }
       await upkeep.removed(id);
-      this.announce(place, () => ({ content: gymRemovedLine(gym) }));
+      this.announce(place, () => [{ content: gymRemovedLine(gym) }]);
       return { kind: 'deleted', gym, trains: mended, routes, targets, unmended };
     });
   }
 
   /**
    * Tells the server's channel for bot updates, where the setting asks for it and the server
-   * has such a channel in which the bot may post. Nobody waits for it, and a failure is only
-   * logged.
+   * has such a channel in which the bot may post. `messages` are what to send, the first that
+   * Discord takes (a new gym with its map, then without); none says nothing. Nobody waits for
+   * it, and a failure is only logged.
    */
   private announce(
     place: StaffPlace,
-    message: () => Parameters<PartyGateway['sendMessage']>[1] | undefined,
+    messages: () => readonly OutgoingMessage[] | Promise<readonly OutgoingMessage[]>,
   ): void {
     const { gateway, settings, log } = this.options;
     if (!settings.postNewGyms) return;
@@ -673,8 +695,17 @@ export class GymAdminService {
       for (const near of place.channelIds) {
         const channelId = gateway.findChannel(near, name);
         if (channelId === undefined) continue;
-        const shown = message();
-        if (shown) await gateway.sendMessage(channelId, shown);
+        // A map is fetched only once there is a channel to show it in.
+        const tried = await messages();
+        for (const [index, shown] of tried.entries()) {
+          try {
+            await gateway.sendMessage(channelId, shown);
+            return;
+          } catch (err) {
+            if (index === tried.length - 1) throw err;
+            log.warn({ err }, 'an announcement of the gym list was refused; sending it plainer');
+          }
+        }
         return;
       }
     })()
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 67b587862bdda99a8a5b9ad8e6f46898568a59e9..9292828479b0e299ee9396b02ae1478227cdd7a3 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -209,6 +209,11 @@ export class FakePartyGateway implements PartyGateway {
   readonly converted: { id: string; direct: boolean }[] = [];
   /** Makes every send and edit refuse (Invalid Form Body) a message with a thumbnail. */
   rejectThumbnails = false;
+  /**
+   * Refuses a sent message that carries files, as Discord does where the bot may not attach
+   * files (Attach Files) or a file cannot be read.
+   */
+  refuseFiles = false;
   /**
    * Makes `createPost` refuse a components-v2 message as the first message of a post: whether
    * Discord takes one there is not documented. `true` refuses it as Invalid Form Body (50035),
@@ -803,6 +808,9 @@ export class FakePartyGateway implements PartyGateway {
     return this.attempt('sendMessage', channelId, () => {
       if (this.gone.has(channelId) || this.forums.has(channelId)) return undefined;
       FakePartyGateway.checkMessage(message, this.textLimit);
+      if (this.refuseFiles && message.v2 && (message.files?.length ?? 0) > 0) {
+        throw refusedBody('the files were refused');
+      }
       this.checkPicture(message);
       const post = this.posts.get(channelId);
       if (post) FakePartyGateway.reopen(post);
diff --git a/test/support/gym-admin.ts b/test/support/gym-admin.ts
index bb546062476acd23f22d17ff2bc08052a9db9d31..9ff329cd6c2d38050f1781ed807d65e56ef9a026 100644
--- a/test/support/gym-admin.ts
+++ b/test/support/gym-admin.ts
@@ -1,3 +1,4 @@
+import type { MapProvider } from '../../src/services/static-maps.js';
 import type { GymRemoval, RemovedGym } from '../../src/db/repositories/gym-removal-repository.js';
 import { AdminLock } from '../../src/services/admin-lock.js';
 import { GymAdminService, type StaffPlace } from '../../src/services/gym-admin-service.js';
@@ -89,7 +90,11 @@ export class MemoryGymRemoval implements GymRemoval {
  * Nothing runs by itself: `upkeep.flush()` fetches what waits (the line never moves on its own),
  * `admin.flush()` waits for the announcements.
  */
-export async function gymAdminWith(parties: readonly Party[] = [], kept?: Partial<Outliving>) {
+export async function gymAdminWith(
+  parties: readonly Party[] = [],
+  kept?: Partial<Outliving>,
+  options: { maps?: Pick<MapProvider, 'gym'> } = {},
+) {
   const regions = kept?.regions ?? new TestRegions();
   const { gyms: gymStore, directory } = await gymDirectoryWith(new MemoryGyms(), regions);
   const made = await partyServiceWith(parties, { gyms: directory }, { ...kept, regions });
@@ -121,6 +126,7 @@ export async function gymAdminWith(parties: readonly Party[] = [], kept?: Partia
     upkeep,
     geo,
     gateway: made.gateway,
+    ...(options.maps === undefined ? {} : { maps: options.maps }),
     settings: made.settings,
     log: made.log,
   });
diff --git a/test/support/gym-commands.ts b/test/support/gym-commands.ts
index 13a02d33aa3664094c58ba93d77cf474d03563f5..279b046cd996e7cee96acd96f339474ad95fe498 100644
--- a/test/support/gym-commands.ts
+++ b/test/support/gym-commands.ts
@@ -1,3 +1,4 @@
+import { ComponentType, MessageFlags } from 'discord.js';
 import { gymControls } from '../../src/commands/gyms/controls.js';
 import { gymReviewControls } from '../../src/components/gym-review.js';
 import { gym } from '../../src/commands/gyms/index.js';
@@ -37,16 +38,120 @@ export const OTHER_SERVER: FakeOptions = {
   channelId: NORTH_CHANNEL,
 };
 
-/** The buttons of a message, as `[label, custom id]`, in order. */
-export function buttonsOf(payload: SentPayload): [string, string][] {
-  return (payload.components ?? []).flatMap((row) => {
-    const json = (
-      row as { toJSON(): { components: { label?: string; custom_id?: string }[] } }
-    ).toJSON();
-    return json.components.map((one): [string, string] => [one.label ?? '', one.custom_id ?? '']);
+/** A component as the API has it: a builder's JSON, or the plain object. */
+function asJson(component: unknown): Record<string, unknown> {
+  const json = (component as { toJSON?: () => unknown }).toJSON;
+  return (typeof json === 'function' ? json.call(component) : component) as Record<string, unknown>;
+}
+
+/** Every component of a payload, nested ones (a section's accessory too), depth first. */
+function componentsOf(components: readonly unknown[]): Record<string, unknown>[] {
+  return components.flatMap((component) => {
+    const json = asJson(component);
+    const inner = Array.isArray(json.components) ? (json.components as unknown[]) : [];
+    const accessory = json.accessory === undefined ? [] : [json.accessory];
+    return [json, ...componentsOf([...inner, ...accessory])];
   });
 }
 
+/**
+ * The buttons of a message (classic rows, or anywhere in a components-v2 message), as
+ * `[label, custom id]`, in order; a link button has an empty custom id.
+ */
+export function buttonsOf(payload: SentPayload): [string, string][] {
+  return componentsOf(payload.components ?? [])
+    .filter((one) => one.type === ComponentType.Button)
+    .map((one): [string, string] => [
+      typeof one.label === 'string' ? one.label : '',
+      typeof one.custom_id === 'string' ? one.custom_id : '',
+    ]);
+}
+
+/**
+ * What a message says: the text displays of a components-v2 one joined by line breaks (of one
+ * that shows a gym, those above the view: what a change did), the content of a classic one ('' for
+ * none). The view itself is read with `gymViewOf`.
+ */
+export function said(payload: SentPayload | undefined): string {
+  if (!payload) return '';
+  if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0) return payload.content ?? '';
+  const texts = componentsOf(payload.components ?? [])
+    .filter((one) => one.type === ComponentType.TextDisplay)
+    .map((one) => String(one.content));
+  const view = texts.findIndex((text) => text.startsWith('### ['));
+  return (view < 0 ? texts : texts.slice(0, view)).join('\n');
+}
+
+/** The small print of a view of a gym: `Gym #1 · 40.05, -80.05` (undefined without one). */
+export function gymOf(payload: SentPayload): string | undefined {
+  const line = componentsOf(payload.components ?? [])
+    .filter((one) => one.type === ComponentType.TextDisplay)
+    .flatMap((one) => String(one.content).split('\n'))
+    .find((text) => text.startsWith('-# Gym #'));
+  return line?.slice('-# '.length);
+}
+
+/** A view of a gym (`renderGymView`, `renderMemberGymView`) as a test reads it. */
+export interface ShownGymView {
+  /** The text of the heading's link: `Name (Nickname)`. */
+  title: string | undefined;
+  /** The lines under the heading: the address (staff), "Elite raid gym" (members), the regions. */
+  lines: string[];
+  /** The facts by name: `Keywords`, `Gym targets`, `Notice`, `Nearby places (from Google)`… */
+  facts: Record<string, string>;
+  /** The small print: `Gym #1 · 40.05, -80.05`. */
+  smallPrint: string | undefined;
+  /** The addresses of the map's gallery. */
+  pictures: string[];
+}
+
+/** Reads a view of a gym from what was sent; fails the test when it holds none. */
+export function gymViewOf(payload: SentPayload): ShownGymView {
+  const all = componentsOf(payload.components ?? []);
+  const texts = all
+    .filter((one) => one.type === ComponentType.TextDisplay)
+    .map((one) => String(one.content));
+  const at = texts.findIndex((text) => text.startsWith('### ['));
+  if (at < 0) throw new Error(`no view of a gym in ${JSON.stringify(texts)}`);
+  const [heading = '', ...lines] = texts[at]?.split('\n') ?? [];
+  const facts: Record<string, string> = {};
+  let open: string | undefined;
+  for (const line of texts.slice(at + 1).flatMap((text) => text.split('\n'))) {
+    const fact = /^\*\*(.+?):\*\* (.*)$/.exec(line);
+    const places = /^-# (Nearby places \(from Google\)): (.*)$/.exec(line);
+    if (fact?.[1] !== undefined) {
+      facts[fact[1]] = fact[2] ?? '';
+      open = undefined;
+    } else if (places?.[1] !== undefined) {
+      facts[places[1]] = places[2] ?? '';
+      open = undefined;
+    } else if (/^\*\*(.+)\*\*$/.test(line)) {
+      open = line.slice(2, -2);
+      facts[open] = '';
+    } else if (open !== undefined && !line.startsWith('-# ')) {
+      facts[open] = facts[open] === '' ? line : `${facts[open] ?? ''}\n${line}`;
+    }
+  }
+  return {
+    title: /^### \[(.*)\]\(<[^>]*>\)$/.exec(heading)?.[1],
+    lines,
+    facts,
+    smallPrint: gymOf(payload),
+    pictures: all.flatMap((one) =>
+      one.type === ComponentType.MediaGallery
+        ? ((one.items ?? []) as { media: { url: string } }[]).map((item) => item.media.url)
+        : [],
+    ),
+  };
+}
+
+/** The first embed of an answer, as Discord gets it (the region commands until plan 8B-4 T4). */
+export function embedOf(payload: SentPayload) {
+  const [embed] = payload.embeds ?? [];
+  if (!embed) throw new Error('the answer has no embed');
+  return 'toJSON' in embed ? embed.toJSON() : embed;
+}
+
 /** The custom id of the button with this label under a message. */
 export function buttonId(payload: SentPayload, label: string): string {
   const found = buttonsOf(payload).find(([text]) => text === label);
@@ -68,13 +173,6 @@ export function answerOf(interaction: FakeInteraction): SentPayload {
   throw new Error('the interaction was not answered');
 }
 
-/** The first embed of an answer, as Discord gets it. */
-export function embedOf(payload: SentPayload) {
-  const [embed] = payload.embeds ?? [];
-  if (!embed) throw new Error('the answer has no embed');
-  return 'toJSON' in embed ? embed.toJSON() : embed;
-}
-
 /**
  * `/gym` and `/admin` over the fakes of `gymAdminWith` and the Wayfarer import of
  * `wayfarerImportWith`, routed like in the bot, used by a moderator in the channel of West
@@ -159,10 +257,21 @@ export async function gymCommandsWith(parties: readonly Party[] = []) {
           ...extra,
         }),
       ),
+    // The questions of `/gym` are components-v2 messages (plan 8B-4): a press is on one, unless
+    // the test says the message is classic (`v2Message: false`, one from before the plan).
     press: (customId: string, extra: FakeOptions = {}) =>
-      handled(fakeButton({ customId, ...staff, ...extra })),
+      handled(fakeButton({ customId, ...staff, v2Message: true, ...extra })),
     submit: (customId: string, fields: Record<string, string>, extra: FakeOptions = {}) =>
-      handled(fakeModal({ customId, fields, form: forms.get(customId), ...staff, ...extra })),
+      handled(
+        fakeModal({
+          customId,
+          fields,
+          form: forms.get(customId),
+          ...staff,
+          v2Message: true,
+          ...extra,
+        }),
+      ),
     /** Lets everything that is under way go out. */
     settle: async () => {
       await made.upkeep.flush();
diff --git a/test/support/messages.ts b/test/support/messages.ts
index 2a2f006a44fe91e3bb68e47f28f170eb4c6c4f71..301712abcc262fe2245861468958b5e5a2d97824 100644
--- a/test/support/messages.ts
+++ b/test/support/messages.ts
@@ -156,6 +156,14 @@ export function thumbnailOf(message: OutgoingMessage | undefined): string | unde
   return thumbnail?.media.url;
 }
 
+/** The addresses of the pictures of the galleries of a v2 message, in order. */
+export function galleryOf(message: OutgoingMessage | undefined): string[] {
+  return allComponents(message).flatMap((component) => {
+    const { type, items } = component as { type?: unknown; items?: { media: { url: string } }[] };
+    return type === ComponentType.MediaGallery ? (items ?? []).map((item) => item.media.url) : [];
+  });
+}
+
 /** The line a copy of a post in another channel opens with: the first line of its first text. */
 export function leadOf(message: OutgoingMessage | undefined): string | undefined {
   return textDisplays(message)[0]?.split('\n')[0];
````

### Task 3: Plan 8B-4 T3: Edit, Make elite, Move and Delete on the view of /gym show

Prototype commit: `958bca1c03aa53591e92babf8f9980438f6793cd`

The custom-id kind gymview (gymview:<gym id>:edit|elite|move|delete and
the form gymview:<gym id>:place), nothing in memory, the guard of /gym
and a refusal for a gym that is gone or out of reach. Edit opens the
form of /gym edit and answers in a message of its own; Make elite or Not
elite shows the view anew in place with what it did; Move opens a form
for the new place and Delete asks, each answering as the command does in
a message of its own.

**Files:**

```
 src/commands/gyms/delete.ts             |  52 ++++++-----
 src/commands/gyms/edit.ts               |  51 ++++++++---
 src/commands/gyms/elite.ts              |  21 +++--
 src/commands/gyms/move.ts               |  41 ++++++---
 src/commands/gyms/show.ts               |   3 +-
 src/commands/gyms/view-controls.test.ts | 255 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/gyms/view-controls.ts      | 198 ++++++++++++++++++++++++++++++++++++++++
 src/components/index.ts                 |   2 +
 src/discord/custom-id.ts                |   6 ++
 test/support/gym-commands.ts            |   7 +-
 10 files changed, 581 insertions(+), 55 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/gyms/view-controls.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 958bca1c03aa53591e92babf8f9980438f6793cd -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8B-4 T3: Edit, Make elite, Move and Delete on the view of /gym show`, the body above and the trailer, staging exactly
  `src/commands/gyms/delete.ts src/commands/gyms/edit.ts src/commands/gyms/elite.ts src/commands/gyms/move.ts src/commands/gyms/show.ts src/commands/gyms/view-controls.test.ts src/commands/gyms/view-controls.ts src/components/index.ts src/discord/custom-id.ts test/support/gym-commands.ts`.

````diff
diff --git a/src/commands/gyms/delete.ts b/src/commands/gyms/delete.ts
index 0be5abd454417557a8d4cbb6ad57acbbde989234..b16001d78935ae22e84c1aa10098cbcbd10bf81c 100644
--- a/src/commands/gyms/delete.ts
+++ b/src/commands/gyms/delete.ts
@@ -1,5 +1,8 @@
 import { ButtonStyle, SlashCommandSubcommandBuilder } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import { UserError } from '../../discord/errors.js';
 import type { RaidParty } from '../../domain/party/party.js';
 import { gymWithId } from '../../render/gym-view.js';
@@ -84,30 +87,39 @@ export const deleteGym: SubcommandPart = {
   defer: 'ephemeral',
   async execute(interaction, ctx) {
     const gym = await chosenGym(interaction, ctx);
-    const references = await ctx.gymAdmin.references(gym.id);
-    const [raid] = references.raids;
-    if (raid) throw new UserError(raidThere(gymWithId(gym), raid, 'is'));
-    const token = pendingGyms.put(interaction.user.id, { what: 'delete', gymId: gym.id });
-    const going = goesWith(references, 'With it go:');
-    await answerGym(
-      interaction,
-      gymQuestion(
-        [
-          content([
-            `Delete ${gymWithId(gym)}? This cannot be undone.`,
-            ...(going.length === 0 ? ['Nothing refers to it.'] : going),
-          ]),
-        ],
-        [
-          button(token, 'delete', 'Delete', ButtonStyle.Danger),
-          button(token, 'cancel', 'Keep', ButtonStyle.Secondary),
-        ],
-      ),
-    );
+    await answerGym(interaction, await deleteQuestion(ctx, interaction.user.id, gym));
   },
   autocomplete: respondWithGyms,
 };
 
+/**
+ * The question of `/gym delete` (also of Delete… of the view of `/gym show`), with what goes with
+ * the gym; refused while a raid is there. It is kept as a pending request of the staff member.
+ */
+export async function deleteQuestion(
+  ctx: AppContext,
+  userId: string,
+  gym: Gym,
+): Promise<V2Message> {
+  const references = await ctx.gymAdmin.references(gym.id);
+  const [raid] = references.raids;
+  if (raid) throw new UserError(raidThere(gymWithId(gym), raid, 'is'));
+  const token = pendingGyms.put(userId, { what: 'delete', gymId: gym.id });
+  const going = goesWith(references, 'With it go:');
+  return gymQuestion(
+    [
+      content([
+        `Delete ${gymWithId(gym)}? This cannot be undone.`,
+        ...(going.length === 0 ? ['Nothing refers to it.'] : going),
+      ]),
+    ],
+    [
+      button(token, 'delete', 'Delete', ButtonStyle.Danger),
+      button(token, 'cancel', 'Keep', ButtonStyle.Secondary),
+    ],
+  );
+}
+
 /**
  * Delete was pressed under the question. Everything is decided again now (the question may be
  * minutes old), by the service, and what the answer counts is what really went; the answer
diff --git a/src/commands/gyms/edit.ts b/src/commands/gyms/edit.ts
index 364fc5f5455b81868e02dc4ef0be6f7c97c3d9e9..2daf56e3a99ae8c4760564485a468b54b9e57ccf 100644
--- a/src/commands/gyms/edit.ts
+++ b/src/commands/gyms/edit.ts
@@ -1,5 +1,12 @@
 import { namesakeNote } from './duplicates.js';
-import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
+import {
+  MessageFlags,
+  SlashCommandSubcommandBuilder,
+  type ButtonInteraction,
+  type ChatInputCommandInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
 import { answerApart, showInPlace, v2Answer } from '../../discord/late-reply.js';
@@ -94,22 +101,40 @@ export const editGym: SubcommandPart = {
     examples: ['/gym edit gym:Big Fountain'],
   },
   async execute(interaction, ctx) {
-    const gym = await chosenGym(interaction, ctx);
-    const { shown, tooLong } = gymFormTexts(gym);
-    if (tooLong.length > 0) {
-      ctx.log.warn(
-        { gym: gym.id, fields: tooLong },
-        'texts of a gym are too long for the form of /gym edit',
-      );
-    }
-    const request: PendingEdit = { what: 'edit', gymId: gym.id, shown, tooLong };
-    if (formFields(request).length === 0) throw new UserError(tooLongNote(tooLong) ?? EXPIRED);
-    const token = pendingGyms.put(interaction.user.id, request);
-    await interaction.showModal(editForm(token, request, gym.name));
+    await openEditForm(interaction, ctx, await chosenGym(interaction, ctx), false);
   },
   autocomplete: respondWithGyms,
 };
 
+/**
+ * Opens the form of an edit of `gym`, filled with its texts: for `/gym edit`, and for Edit… of
+ * the view of `/gym show` (`fromView`: its answer is a message of its own, and the view stays).
+ */
+export async function openEditForm(
+  interaction: ChatInputCommandInteraction | ButtonInteraction,
+  ctx: AppContext,
+  gym: Gym,
+  fromView: boolean,
+): Promise<void> {
+  const { shown, tooLong } = gymFormTexts(gym);
+  if (tooLong.length > 0) {
+    ctx.log.warn(
+      { gym: gym.id, fields: tooLong },
+      'texts of a gym are too long for the form of /gym edit',
+    );
+  }
+  const request: PendingEdit = {
+    what: 'edit',
+    gymId: gym.id,
+    shown,
+    tooLong,
+    ...(fromView ? { fromView } : {}),
+  };
+  if (formFields(request).length === 0) throw new UserError(tooLongNote(tooLong) ?? EXPIRED);
+  const token = pendingGyms.put(interaction.user.id, request);
+  await interaction.showModal(editForm(token, request, gym.name));
+}
+
 /** "Open the form again", under a form that was refused: the form with what was typed. */
 export const editOpeners: Readonly<Record<string, FormOpener>> = {
   'edit:reopen': (token, request) =>
diff --git a/src/commands/gyms/elite.ts b/src/commands/gyms/elite.ts
index aabd00b2cac6321d7bd3b72e316455b6f760ff49..3ca5e3393dddcd28298d92a1e48ffab01515297c 100644
--- a/src/commands/gyms/elite.ts
+++ b/src/commands/gyms/elite.ts
@@ -6,6 +6,17 @@ import { isEliteGym } from '../../domain/party/raid.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
 import { answerGym, GYM_GONE, gymViewMessage, staffPlace } from './shared.js';
 
+/** What a change of the elite mark says: what it is now, or that it was so already. */
+export function eliteLine(
+  was: boolean,
+  eligible: boolean,
+  gym: { id: number; name: string; nickname: string | null },
+): string {
+  return was === eligible
+    ? `${gymWithId(gym)} ${eligible ? 'was an elite raid gym already' : 'was no elite raid gym'}.`
+    : `${gymWithId(gym)} is ${eligible ? 'now marked as an elite raid gym' : 'no longer marked as an elite raid gym'}.`;
+}
+
 /**
  * `/gym elite`: whether a gym is an elite raid gym, as the game now calls what was an EX gym
  * (Matt, 2026-10-13). One answer, yes or no: the two flags the legacy bot kept (tagged, has
@@ -35,12 +46,10 @@ export const eliteGym: SubcommandPart = {
     const place = await staffPlace(interaction, ctx);
     const gym = await ctx.gymAdmin.setElite(before.id, eligible, place.staffId);
     if (!gym) throw new UserError(GYM_GONE);
-    const was = isEliteGym(before);
-    const line =
-      was === eligible
-        ? `${gymWithId(gym)} ${eligible ? 'was an elite raid gym already' : 'was no elite raid gym'}.`
-        : `${gymWithId(gym)} is ${eligible ? 'now marked as an elite raid gym' : 'no longer marked as an elite raid gym'}.`;
-    await answerGym(interaction, await gymViewMessage(ctx, place, gym, [line]));
+    await answerGym(
+      interaction,
+      await gymViewMessage(ctx, place, gym, [eliteLine(isEliteGym(before), eligible, gym)]),
+    );
   },
   autocomplete: respondWithGyms,
 };
diff --git a/src/commands/gyms/move.ts b/src/commands/gyms/move.ts
index ce5d6bd3c6316a00fd36b0d677f65c729bffd79d..275d337fa7a45f43a0e2371742065be1b4e7792b 100644
--- a/src/commands/gyms/move.ts
+++ b/src/commands/gyms/move.ts
@@ -206,22 +206,35 @@ export const moveGym: SubcommandPart = {
   defer: 'ephemeral',
   async execute(interaction, ctx) {
     const gym = await chosenGym(interaction, ctx);
-    const { point, approximate } = placeOrRefuse(
+    const given = placeOrRefuse(
       await ctx.gymAdmin.readLocation(interaction.options.getString('location', true)),
     );
-    // Refused before anything is asked or moved; the service decides again at its turn.
-    const { guildId } = await staffPlace(interaction, ctx);
-    if (!ctx.gymAdmin.mayPlace(point, guildId)) throw new UserError(FOREIGN_PLACE);
-    const near = ctx.gymAdmin.near(point, gym.id);
-    const far = metresBetween(gym, point) > FAR_MOVE_METRES;
-    if (near.length === 0 && !far && !approximate) {
-      // Nothing to ask about as things are now; should that change before the move has its
-      // turn, the question is asked after all.
-      const asked = { from: { lat: gym.lat, lon: gym.lon }, nearIds: [] };
-      await moveAnswered(interaction, ctx, gym.id, { point, approximate }, asked, false);
-      return;
-    }
-    await answerGym(interaction, moveQuestion(interaction, ctx, gym, point, approximate));
+    await moveGymTo(interaction, ctx, gym, given);
   },
   autocomplete: respondWithGyms,
 };
+
+/**
+ * Moves `gym` to a place a staff member gave, or asks first (`moveQuestion`): `/gym move`, and
+ * the form of Move… of the view of `/gym show`. The interaction has been acknowledged.
+ */
+export async function moveGymTo(
+  interaction: MoveInteraction,
+  ctx: AppContext,
+  gym: Gym,
+  { point, approximate }: GivenPlace,
+): Promise<void> {
+  // Refused before anything is asked or moved; the service decides again at its turn.
+  const { guildId } = await staffPlace(interaction, ctx);
+  if (!ctx.gymAdmin.mayPlace(point, guildId)) throw new UserError(FOREIGN_PLACE);
+  const near = ctx.gymAdmin.near(point, gym.id);
+  const far = metresBetween(gym, point) > FAR_MOVE_METRES;
+  if (near.length === 0 && !far && !approximate) {
+    // Nothing to ask about as things are now; should that change before the move has its
+    // turn, the question is asked after all.
+    const asked = { from: { lat: gym.lat, lon: gym.lon }, nearIds: [] };
+    await moveAnswered(interaction, ctx, gym.id, { point, approximate }, asked, false);
+    return;
+  }
+  await answerGym(interaction, moveQuestion(interaction, ctx, gym, point, approximate));
+}
diff --git a/src/commands/gyms/show.ts b/src/commands/gyms/show.ts
index a3d1af79ccc4ae6bc4236174c2ffc9efcb32276f..9502be1512f58b2f958319e71ee4eb74bb3b79df 100644
--- a/src/commands/gyms/show.ts
+++ b/src/commands/gyms/show.ts
@@ -2,6 +2,7 @@ import { SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
 import { answerGym, gymViewMessage, staffPlace } from './shared.js';
+import { viewControls } from './view-controls.js';
 
 /**
  * `/gym show`: everything Pine knows of a gym (the spec's `find` and `detail` in one). The
@@ -25,7 +26,7 @@ export const showGym: SubcommandPart = {
   async execute(interaction, ctx) {
     const gym = await chosenGym(interaction, ctx);
     const place = await staffPlace(interaction, ctx);
-    await answerGym(interaction, await gymViewMessage(ctx, place, gym, []));
+    await answerGym(interaction, await gymViewMessage(ctx, place, gym, [], viewControls(gym)));
   },
   autocomplete: respondWithGyms,
 };
diff --git a/src/commands/gyms/view-controls.test.ts b/src/commands/gyms/view-controls.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d548fe82b9ab0e083a4b6859fb9a908d2201b6d6
--- /dev/null
+++ b/src/commands/gyms/view-controls.test.ts
@@ -0,0 +1,255 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it, vi } from 'vitest';
+import { asV2, sent } from '../../../test/support/fake-interactions.js';
+import { STAFF_PLACE, withOtherServer } from '../../../test/support/gym-admin.js';
+import { NORTH_PLACE } from '../../../test/support/gyms.js';
+import {
+  answerOf,
+  buttonId,
+  buttonsOf,
+  gymCommandsWith,
+  gymViewOf,
+  MEMBER,
+  said,
+} from '../../../test/support/gym-commands.js';
+import { REPORTER } from '../../../test/support/parties.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { moveForm, VIEW_GONE, viewControls } from './view-controls.js';
+
+type Made = Awaited<ReturnType<typeof gymCommandsWith>>;
+
+/** `/gym show` of a gym: its answer, with the view's buttons. */
+async function shown(made: Made, gym: string) {
+  return answerOf(await made.use('show', { gym }));
+}
+
+/** The form a press opened. */
+function formOf(pressed: { showModal: { mock: { calls: unknown[][] } } }) {
+  const form = pressed.showModal.mock.calls[0]?.[0] as { custom_id: string } | undefined;
+  if (!form) throw new Error('no form was opened');
+  return form;
+}
+
+describe('the buttons of the view of /gym show', () => {
+  it('stand beside the Map link of /gym show, and only there', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:1');
+    expect(buttonsOf(view)).toEqual([
+      ['Map', ''],
+      ['Edit…', 'gymview:1:edit'],
+      ['Make elite', 'gymview:1:elite:1'],
+      ['Move…', 'gymview:1:move'],
+      ['Delete…', 'gymview:1:delete'],
+    ]);
+    expectV2Sendable(asV2(view));
+    // An answer of a change has none of them.
+    const elite = answerOf(await made.use('elite', { gym: 'id:1', eligible: true }));
+    expect(buttonsOf(elite).map(([label]) => label)).toEqual(['Map']);
+    expect(viewControls({ id: 1, taggedEx: false, confirmedEx: true })[1]).toMatchObject({
+      label: 'Not elite',
+      custom_id: 'gymview:1:elite:0',
+    });
+  });
+
+  it('marks a gym elite and takes it back in place, the label saying what a press does', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:1');
+    const marked = await made.press(buttonId(view, 'Make elite'));
+    expect(marked.deferUpdate).toHaveBeenCalledTimes(1);
+    expect(marked.reply).not.toHaveBeenCalled();
+    const answer = answerOf(marked);
+    expect(said(answer)).toBe(
+      '**Pinewood Public Library** (The Stacks, #1) is now marked as an elite raid gym.',
+    );
+    expect(gymViewOf(answer).facts['Elite raid gym']).toBe('yes');
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
+      'Map',
+      'Edit…',
+      'Not elite',
+      'Move…',
+      'Delete…',
+    ]);
+    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: true });
+    const cleared = answerOf(await made.press(buttonId(answer, 'Not elite')));
+    expect(said(cleared)).toContain('is no longer marked as an elite raid gym.');
+    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: false, confirmedEx: false });
+  });
+
+  it('sets what its label said, also on a view drawn before somebody else changed the mark', async () => {
+    const made = await gymCommandsWith();
+    const stale = await shown(made, 'id:1');
+    await made.use('elite', { gym: 'id:1', eligible: true });
+    const pressed = await made.press(buttonId(stale, 'Make elite'));
+    // Make elite on a gym that is one already keeps it one.
+    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: true });
+    expect(said(answerOf(pressed))).toBe(
+      '**Pinewood Public Library** (The Stacks, #1) was an elite raid gym already.',
+    );
+    expect(buttonsOf(answerOf(pressed))).toContainEqual(['Not elite', 'gymview:1:elite:0']);
+  });
+
+  it('says in the place of the view that a gym deleted during the press is gone', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:1');
+    vi.spyOn(made.admin, 'setElite').mockResolvedValueOnce(undefined);
+    const pressed = await made.press(buttonId(view, 'Make elite'));
+    expect(pressed.followUp).not.toHaveBeenCalled();
+    expect(said(answerOf(pressed))).toBe(VIEW_GONE);
+    expect(buttonsOf(answerOf(pressed))).toEqual([]);
+  });
+
+  it('names the gym in the title of the Move form as a sentence does, within 45 characters', () => {
+    expect(moveForm({ id: 6, name: 'A'.repeat(60) }).title).toBe(`Move ${'A'.repeat(37)}…`);
+    expect(moveForm({ id: 6, name: '\u202e\u200b' }).title).toBe('Move gym #6');
+    expect(moveForm({ id: 6, name: '*Big* Fountain' }).title).toBe('Move *Big* Fountain');
+  });
+
+  it('refuses a place of another server and a gym gone from the Move form', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:6');
+    const form = formOf(await made.press(buttonId(view, 'Move…')));
+    await withOtherServer(made);
+    const foreign = await made.submit(form.custom_id, {
+      location: `${NORTH_PLACE.lat}, ${NORTH_PLACE.lon}`,
+    });
+    expect(said(answerOf(foreign))).toMatch(/^That place belongs to another server/);
+    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
+    const gone = await made.submit(form.custom_id, { location: '40.0302, -80.03' });
+    expect(said(answerOf(gone))).toBe(VIEW_GONE);
+  });
+
+  it('opens the form of /gym edit, and answers it in a message of its own', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:1');
+    const pressed = await made.press(buttonId(view, 'Edit…'));
+    const form = formOf(pressed) as unknown as {
+      custom_id: string;
+      components: { components: { custom_id: string; value?: string }[] }[];
+    };
+    const typed = Object.fromEntries(
+      form.components.map((row) => [
+        row.components[0]?.custom_id ?? '',
+        row.components[0]?.value ?? '',
+      ]),
+    );
+    expect(typed.name).toBe('Pinewood Public Library');
+    const submitted = await made.submit(form.custom_id, { ...typed, notice: 'Wet paint' });
+    // The view stays as it is: the answer is a private message of its own.
+    expect(submitted.update).not.toHaveBeenCalled();
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    const answer = answerOf(submitted);
+    expect(said(answer)).toBe(
+      'Changed the notice of **Pinewood Public Library** (The Stacks, #1).',
+    );
+    expect(gymViewOf(answer).facts.Notice).toBe('Wet paint');
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Map']);
+    expect(made.gymStore.row(1)?.notice).toBe('Wet paint');
+  });
+
+  it('answers a refused form of Edit… in a message of its own, and the next in its place', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:1');
+    const form = formOf(await made.press(buttonId(view, 'Edit…')));
+    const refused = await made.submit(form.custom_id, { name: '' });
+    expect(refused.update).not.toHaveBeenCalled();
+    const refusal = sent(refused.reply);
+    expect(refusal.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    expect(said(refusal)).toMatch(/^A gym needs a name\./);
+    // Opened again from the refusal, the form is answered in the place of the refusal.
+    const again = await made.press(buttonId(refusal, 'Open the form again'));
+    const second = formOf(again);
+    const done = await made.submit(second.custom_id, { name: 'Reading Room' });
+    expect(done.deferUpdate).toHaveBeenCalledTimes(1);
+    expect(said(answerOf(done))).toMatch(/^Changed the name, .* of \*\*Reading Room\*\* \(#1\)\.$/);
+  });
+
+  it('moves a gym from the form of Move…, answering as /gym move in a message of its own', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:6');
+    const pressed = await made.press(buttonId(view, 'Move…'));
+    const form = formOf(pressed);
+    expect(form).toEqual(moveForm({ id: 6, name: 'Maple Leaf Mosaic' }));
+    // A correction of some metres: moved at once.
+    const near = await made.submit(form.custom_id, { location: '40.0302, -80.03' });
+    expect(near.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(near.update).not.toHaveBeenCalled();
+    expect(said(answerOf(near))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\) from /);
+    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.0302, lon: -80.03 });
+    // Far away: the question of /gym move, answered in its place.
+    const far = await made.submit(form.custom_id, { location: '40.2, -80.03' });
+    const question = answerOf(far);
+    expect(said(question)).toContain('Move **Maple Leaf Mosaic** (#6) from');
+    const moved = await made.press(buttonId(question, 'Move anyway'));
+    expect(said(answerOf(moved))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\*/);
+    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.2 });
+    // A place that cannot be read is refused as /gym move refuses it.
+    const unread = await made.submit(form.custom_id, { location: 'somewhere' });
+    expect(said(answerOf(unread))).toMatch(/^I could not read a place from that\./);
+  });
+
+  it('asks before it deletes, in a message of its own', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:6');
+    const pressed = await made.press(buttonId(view, 'Delete…'));
+    expect(pressed.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(pressed.update).not.toHaveBeenCalled();
+    const question = answerOf(pressed);
+    expect(said(question)).toBe(
+      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.',
+    );
+    const deleted = await made.press(buttonId(question, 'Delete'));
+    expect(said(answerOf(deleted))).toBe('Deleted **Maple Leaf Mosaic** (#6).');
+    expect(made.gymStore.row(6)).toBeUndefined();
+  });
+
+  it('refuses to delete a gym with a raid, as /gym delete does', async () => {
+    const made = await gymCommandsWith();
+    const gym = made.directory.get(6);
+    if (!gym) throw new Error('no gym 6');
+    const raid = await made.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    if (raid.kind !== 'created') throw new Error('no raid');
+    const view = await shown(made, 'id:6');
+    const pressed = await made.press(buttonId(view, 'Delete…'));
+    expect(said(answerOf(pressed))).toMatch(/^A raid is at \*\*Maple Leaf Mosaic\*\* \(#6\)/);
+    expect(made.gymStore.row(6)).toBeDefined();
+  });
+
+  it('refuses every button of a gym that is gone, or lies in another server’s regions only', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:6');
+    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
+    for (const label of ['Edit…', 'Make elite', 'Move…', 'Delete…']) {
+      const pressed = await made.press(buttonId(view, label));
+      expect(said(answerOf(pressed))).toBe(VIEW_GONE);
+      expect(pressed.showModal).not.toHaveBeenCalled();
+    }
+    const north = await withOtherServer(made);
+    const foreign = await made.press(`gymview:${north.id}:elite`);
+    expect(said(answerOf(foreign))).toBe(VIEW_GONE);
+    expect(made.gymStore.row(north.id)).toMatchObject({ taggedEx: false });
+    // A number that is no gym's, and one that is no number.
+    expect(said(answerOf(await made.press('gymview:4242:delete')))).toBe(VIEW_GONE);
+    expect(said(answerOf(await made.press('gymview:x:delete')))).toBe(VIEW_GONE);
+  });
+
+  it('lets nobody but staff press them', async () => {
+    const made = await gymCommandsWith();
+    const view = await shown(made, 'id:1');
+    const pressed = await made.press(buttonId(view, 'Make elite'), {
+      userId: MEMBER,
+      roleNames: [],
+    });
+    expect(said(sent(pressed.reply))).toBe(
+      'Only admins, moderators and bot developers can do that.',
+    );
+    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: false });
+  });
+});
diff --git a/src/commands/gyms/view-controls.ts b/src/commands/gyms/view-controls.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bacdf0560e67d2a6c7dafa9187d25eec23ab5448
--- /dev/null
+++ b/src/commands/gyms/view-controls.ts
@@ -0,0 +1,198 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  MessageFlags,
+  TextInputStyle,
+  type APIButtonComponent,
+  type APIModalInteractionResponseCallbackData,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { ComponentHandler, GuardableInteraction } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { requireBotManagement } from '../../discord/guards.js';
+import { showInPlace } from '../../discord/late-reply.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import { tidyLine } from '../../domain/gyms/gym-text.js';
+import { isEliteGym } from '../../domain/party/raid.js';
+import { truncate } from '../../render/text.js';
+import { deleteQuestion } from './delete.js';
+import { openEditForm } from './edit.js';
+import { eliteLine } from './elite.js';
+import { moveGymTo } from './move.js';
+import {
+  answerGym,
+  gymViewMessage,
+  LOCATION_OPTION,
+  placeOrRefuse,
+  sayGym,
+  staffPlace,
+} from './shared.js';
+
+/**
+ * The custom-id kind of the buttons of the view of `/gym show` (documented in `custom-id.ts`):
+ * `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0`, and the form of Move…
+ * `gymview:<gym id>:place`.
+ * Nothing is kept in memory: the gym's number is in the custom id.
+ */
+export const GYM_VIEW_KIND = 'gymview';
+
+/** What a press on the view of a gym that is gone (or another server's now) is told. */
+export const VIEW_GONE = 'That gym is no longer in the gym list.';
+
+/** The id of the one input of the form of Move…. */
+const LOCATION_INPUT = 'location';
+
+const viewButton = (
+  gymId: number,
+  action: string,
+  label: string,
+  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Danger,
+  args: string[] = [],
+): APIButtonComponent => ({
+  type: ComponentType.Button,
+  custom_id: encodeCustomId({ kind: GYM_VIEW_KIND, id: String(gymId), action, args }),
+  label,
+  style,
+});
+
+/**
+ * The buttons of the view of `/gym show` beside its Map link (Matt, 2026-10-15): Edit…, Make
+ * elite or Not elite, Move…, Delete…. Make elite carries what it sets (`elite:1`, Not elite
+ * `elite:0`), so that a view drawn before somebody else changed the mark does what its label
+ * says. Only on the answer of `/gym show`, never on the answer of a change.
+ */
+export function viewControls(
+  gym: Pick<Gym, 'id' | 'taggedEx' | 'confirmedEx'>,
+): APIButtonComponent[] {
+  return [
+    viewButton(gym.id, 'edit', 'Edit…', ButtonStyle.Secondary),
+    isEliteGym(gym)
+      ? viewButton(gym.id, 'elite', 'Not elite', ButtonStyle.Secondary, ['0'])
+      : viewButton(gym.id, 'elite', 'Make elite', ButtonStyle.Secondary, ['1']),
+    viewButton(gym.id, 'move', 'Move…', ButtonStyle.Secondary),
+    viewButton(gym.id, 'delete', 'Delete…', ButtonStyle.Danger),
+  ];
+}
+
+/**
+ * The form of Move…: one input for the new place, read as `/gym move` reads its option. Its
+ * title names the gym as text (a title shows no Markdown), tidied and cut to the 45 characters
+ * of a title; a name that shows as nothing is the gym's number.
+ */
+export function moveForm(gym: {
+  id: number;
+  name: string;
+}): APIModalInteractionResponseCallbackData {
+  const name = tidyLine(gym.name);
+  return {
+    custom_id: encodeCustomId({ kind: GYM_VIEW_KIND, id: String(gym.id), action: 'place' }),
+    title: `Move ${name === '' ? `gym #${gym.id}` : truncate(name, 38)}`,
+    components: [
+      {
+        type: ComponentType.Label,
+        label: 'The new place of the gym',
+        description: LOCATION_OPTION,
+        component: {
+          type: ComponentType.TextInput,
+          custom_id: LOCATION_INPUT,
+          style: TextInputStyle.Short,
+          required: true,
+          max_length: 1_000,
+        },
+      },
+    ],
+  };
+}
+
+/**
+ * The gym of a control's custom id, as the staff member may touch it: refused when it is gone,
+ * or lies only in regions of another server now (for this server's staff it then does not
+ * exist, as for the commands).
+ */
+async function viewedGym(
+  interaction: GuardableInteraction,
+  ctx: AppContext,
+  id: string,
+): Promise<Gym> {
+  const gymId = Number(id);
+  const gym = Number.isSafeInteger(gymId) ? ctx.gyms.get(gymId) : undefined;
+  const { guildId } = await staffPlace(interaction, ctx);
+  if (!gym || !ctx.gymAdmin.mayTouch(gym.id, guildId)) throw new UserError(VIEW_GONE);
+  return gym;
+}
+
+/**
+ * The buttons of the view of `/gym show` (kind `gymview`), with the guard of `/gym`: a control
+ * can be pressed by whoever sees it, and a custom id can be sent by anybody. No throttle, as
+ * `/gym` has none: they are staff's.
+ *
+ * Edit… opens the form of `/gym edit`, whose answer is a message of its own; Make elite / Not
+ * elite changes the mark and shows the view anew in place, with what it did above it and the
+ * buttons as they now are; Move… opens a form for the new place and answers, in a message of
+ * its own, as `/gym move` does (the question, or the moved gym); Delete… answers with the
+ * question of `/gym delete` in a message of its own. The view itself stays.
+ */
+export const gymViewControls: ComponentHandler = {
+  kind: GYM_VIEW_KIND,
+  guards: [requireBotManagement],
+
+  async button(interaction, id, ctx) {
+    switch (id.action) {
+      case 'edit':
+        await openEditForm(interaction, ctx, await viewedGym(interaction, ctx, id.id), true);
+        return;
+      case 'move': {
+        const gym = await viewedGym(interaction, ctx, id.id);
+        await interaction.showModal(moveForm(gym));
+        return;
+      }
+      case 'elite': {
+        const before = await viewedGym(interaction, ctx, id.id);
+        // What the label said when the view was drawn: not the opposite of the gym as it is.
+        const eligible = id.args[0] === undefined ? !isEliteGym(before) : id.args[0] === '1';
+        // Drawing the view anew asks for its map.
+        await interaction.deferUpdate();
+        const place = await staffPlace(interaction, ctx);
+        const gym = await ctx.gymAdmin.setElite(before.id, eligible, place.staffId);
+        if (!gym) {
+          // Gone during the press: said in the place of the view, whose buttons lead nowhere.
+          await sayGym(interaction, VIEW_GONE);
+          return;
+        }
+        await showInPlace(
+          interaction,
+          await gymViewMessage(
+            ctx,
+            place,
+            gym,
+            [eliteLine(isEliteGym(before), eligible, gym)],
+            viewControls(gym),
+          ),
+        );
+        return;
+      }
+      case 'delete': {
+        const gym = await viewedGym(interaction, ctx, id.id);
+        // A message of its own; the view stays.
+        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+        await answerGym(interaction, await deleteQuestion(ctx, interaction.user.id, gym));
+        return;
+      }
+      default:
+        throw new UserError(STALE_COMPONENT);
+    }
+  },
+
+  async modal(interaction, id, ctx) {
+    if (id.action !== 'place') throw new UserError(STALE_COMPONENT);
+    const gym = await viewedGym(interaction, ctx, id.id);
+    // Following a short link takes a moment; the answer is a message of its own.
+    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    const given = placeOrRefuse(
+      await ctx.gymAdmin.readLocation(interaction.fields.getTextInputValue(LOCATION_INPUT)),
+    );
+    await moveGymTo(interaction, ctx, gym, given);
+  },
+};
diff --git a/src/components/index.ts b/src/components/index.ts
index 0a59f9deeeb5b2133068108d76d86f229c5d684c..285d4342b0492aba9f03bc0167865423e985a875 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,4 +1,5 @@
 import { gymControls } from '../commands/gyms/controls.js';
+import { gymViewControls } from '../commands/gyms/view-controls.js';
 import { regionControls } from '../commands/regions/controls.js';
 import { infoControls } from '../commands/meetups/info.js';
 import {
@@ -33,6 +34,7 @@ export const components: readonly ComponentHandler[] = [
   dmControls,
   roleControls,
   gymControls,
+  gymViewControls,
   gymReviewControls,
   regionControls,
   screenshotControls,
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 57ca76acbd02da2a60854489bcc39073c6cc27c9..b6dbbf8198787f085ee8a8416057eacf4eef258e 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -28,6 +28,12 @@
  * `gym:<token>:wayfarer-import` and `gym:<token>:wayfarer-cancel`, whose token is one of the
  * import's own pending requests (`pendingImports`, `src/commands/gyms/import.ts`).
  *
+ * The buttons of the view of `/gym show` have the kind `gymview` (`src/commands/gyms/view-controls.ts`),
+ * and their id is the number of the gym: `gymview:<gym id>:edit` (opens the form of `/gym
+ * edit`), `gymview:<gym id>:elite:1|0` (Make elite / Not elite: what it sets), `gymview:<gym id>:move` (opens the
+ * form `gymview:<gym id>:place`) and `gymview:<gym id>:delete` (asks as `/gym delete`). Nothing
+ * else is kept anywhere.
+ *
  * The buttons of `/gym review` have the kind `gymreview` (`src/components/gym-review.ts`), and
  * their id is the row id of an item of the review queue (`GymReview.id`), found again for the
  * presser's server: `gymreview:<id>:same:<Wayfarer id>` and `gymreview:<id>:new:<Wayfarer id>`
diff --git a/test/support/gym-commands.ts b/test/support/gym-commands.ts
index 279b046cd996e7cee96acd96f339474ad95fe498..ba81b5b8d000cae761c15aff1641a51f5c8eb84c 100644
--- a/test/support/gym-commands.ts
+++ b/test/support/gym-commands.ts
@@ -1,5 +1,6 @@
 import { ComponentType, MessageFlags } from 'discord.js';
 import { gymControls } from '../../src/commands/gyms/controls.js';
+import { gymViewControls } from '../../src/commands/gyms/view-controls.js';
 import { gymReviewControls } from '../../src/components/gym-review.js';
 import { gym } from '../../src/commands/gyms/index.js';
 import { pendingGyms } from '../../src/commands/gyms/shared.js';
@@ -210,7 +211,11 @@ export async function gymCommandsWith(parties: readonly Party[] = []) {
     wayfarerReview: made.wayfarerReview,
     attachments,
   });
-  const router = new InteractionRouter(ctx, [gym, admin], [gymControls, gymReviewControls]);
+  const router = new InteractionRouter(
+    ctx,
+    [gym, admin],
+    [gymControls, gymViewControls, gymReviewControls],
+  );
   const staff: FakeOptions = {
     userId: MODERATOR,
     roleNames: ['Moderator'],
````

### Task 4: Plan 8B-4 T4: regions and places as v2 messages

Prototype commit: `c94f85547f84ba27a80b25909104247a77d59d2e`

/bounds and /find-region answer with one container and the map as a
gallery (the OpenStreetMap licence in small print). The preview of
/region import is one container: the heading and sentences, the lists
under their bold headings within the text budget, preview.txt as a file
when a list is cut, Import and Cancel inside; its outcome likewise. The
question and outcome of /region remove and what the region controls say
are v2 too (answerRegion, sayRegion); a press on a plain-text question
from before is answered below it.

**Files:**

```
 src/commands/regions/bounds.ts           |  41 ++++++++---
 src/commands/regions/controls.ts         |  25 ++-----
 src/commands/regions/import.more.test.ts | 159 +++++++++++++++++++++++++---------------
 src/commands/regions/import.test.ts      | 135 ++++++++++++++++++----------------
 src/commands/regions/import.ts           | 202 ++++++++++++++++++++++++++++++---------------------
 src/commands/regions/region.more.test.ts |  16 ++--
 src/commands/regions/region.test.ts      |  34 +++++----
 src/commands/regions/remove.test.ts      |  85 +++++++++++++---------
 src/commands/regions/remove.ts           |  69 ++++++++----------
 src/commands/regions/shared.ts           |  39 +++++++++-
 src/commands/util/find-region.test.ts    |  46 ++++++++----
 src/commands/util/find-region.ts         |  64 ++++++++++------
 test/support/gym-commands.ts             |   7 --
 test/support/region-commands.ts          |  45 +++++++++++-
 14 files changed, 595 insertions(+), 372 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/regions/import.more.test.ts src/commands/regions/import.test.ts src/commands/regions/region.more.test.ts src/commands/regions/region.test.ts src/commands/regions/remove.test.ts src/commands/util/find-region.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff c94f85547f84ba27a80b25909104247a77d59d2e -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8B-4 T4: regions and places as v2 messages`, the body above and the trailer, staging exactly
  `src/commands/regions/bounds.ts src/commands/regions/controls.ts src/commands/regions/import.more.test.ts src/commands/regions/import.test.ts src/commands/regions/import.ts src/commands/regions/region.more.test.ts src/commands/regions/region.test.ts src/commands/regions/remove.test.ts src/commands/regions/remove.ts src/commands/regions/shared.ts src/commands/util/find-region.test.ts src/commands/util/find-region.ts test/support/gym-commands.ts test/support/region-commands.ts`.

````diff
diff --git a/src/commands/regions/bounds.ts b/src/commands/regions/bounds.ts
index b58cc7d60b5bcec599230838145be42a0c0faaf2..95fb5cfc69721e5e817e6660753b74391ef19e5b 100644
--- a/src/commands/regions/bounds.ts
+++ b/src/commands/regions/bounds.ts
@@ -1,10 +1,14 @@
-import { basename } from 'node:path';
-import { SlashCommandBuilder, type APIEmbed } from 'discord.js';
+import { SlashCommandBuilder } from 'discord.js';
 import { channelContext } from '../../discord/channel-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { regionChannelOf, requireGuild } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import type { Throttle } from '../../discord/throttle.js';
+import { container, mapPicture, textDisplay } from '../../render/v2.js';
+import { mapOrNothing } from '../../services/static-maps.js';
+import { REGION_COLOUR } from './shared.js';
 
 /** A picture is attached to every answer: a member looks at a region now and then, not often. */
 export const BOUNDS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };
@@ -17,6 +21,25 @@ export function gymCountSentence(gyms: number): string {
     : `There are ${gyms} gyms within this region.`;
 }
 
+/**
+ * The answer of `/bounds` as a components-v2 message (plan 8B-4): the region's channel as the
+ * heading, how many gyms lie in it, and the map of its outline at full width (`map`; without
+ * one, none).
+ */
+export function boundsMessage(channelId: string, gyms: number, map?: string): V2Message {
+  const picture = mapPicture(map, 'The outline of the region');
+  return {
+    v2: true,
+    components: [
+      container(REGION_COLOUR, [
+        textDisplay(`### The area of <#${channelId}>\n${gymCountSentence(gyms)}`),
+        ...picture.gallery,
+      ]),
+    ],
+    ...(picture.files.length === 0 ? {} : { files: picture.files }),
+  };
+}
+
 /**
  * `/bounds`: what area a region covers, for any member (Matt, 2026-10-13: ordinary members
  * used the legacy command). In the channel of a region, its forum or a post in it: a picture
@@ -53,16 +76,10 @@ export const bounds: SimpleCommand = {
           'in a post there.',
       );
     }
-    const map = await ctx.maps.region(region).catch((err: unknown) => {
-      ctx.log.warn({ err, region: region.id }, 'could not get the map of a region');
-      return undefined;
+    const map = await mapOrNothing(ctx.maps.region(region), ctx.log, 'a region', {
+      region: region.id,
     });
-    const embed: APIEmbed = {
-      title: 'This channel covers the following area',
-      description:
-        `<#${region.channelId}>\n` + gymCountSentence(ctx.gyms.inRegion(region.channelId).length),
-      ...(map === undefined ? {} : { image: { url: `attachment://${basename(map)}` } }),
-    };
-    await interaction.editReply({ embeds: [embed], files: map === undefined ? [] : [map] });
+    const gyms = ctx.gyms.inRegion(region.channelId).length;
+    await interaction.editReply(v2Answer(boundsMessage(region.channelId, gyms, map)));
   },
 };
diff --git a/src/commands/regions/controls.ts b/src/commands/regions/controls.ts
index d37f05ff7ec422683aca6334a82e8a64c8594394..10275ac40f46307503deb8cd84404eb8d96a3c63 100644
--- a/src/commands/regions/controls.ts
+++ b/src/commands/regions/controls.ts
@@ -11,6 +11,7 @@ import {
   NOT_YOURS,
   pendingRegions,
   REGION_KIND,
+  sayRegion,
   wasAnswered,
   type ButtonAnswer,
   type PendingRegion,
@@ -58,39 +59,23 @@ export const regionControls: ComponentHandler = {
     if (found === 'not-yours') throw new UserError(NOT_YOURS);
     if (found === 'expired') {
       if (wasAnswered(id.id)) await interaction.deferUpdate();
-      else
-        await interaction.update({ content: EXPIRED, embeds: [], components: [], attachments: [] });
+      else await sayRegion(interaction, EXPIRED);
       return;
     }
     const request = found.value;
     markAnswered(id.id);
     if (id.action === 'cancel') {
-      await interaction.update({
-        content: CANCELLED[request.what],
-        embeds: [],
-        components: [],
-        attachments: [],
-      });
+      await sayRegion(interaction, CANCELLED[request.what]);
       return;
     }
     const answer = ANSWERS[`${request.what}:${id.action}`];
     if (!answer) throw new UserError(STALE_COMPONENT);
-    await interaction.update({
-      content: working(request),
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
+    await sayRegion(interaction, working(request));
     try {
       await answer(interaction, ctx, request);
     } catch (err) {
       if (!(err instanceof UserError)) throw err;
-      await interaction.editReply({
-        content: err.message,
-        embeds: [],
-        components: [],
-        attachments: [],
-      });
+      await sayRegion(interaction, err.message);
     }
   },
 };
diff --git a/src/commands/regions/import.more.test.ts b/src/commands/regions/import.more.test.ts
index f4591a1991587fecff841d23321047558c5d4034..f2ef4e343a1f68510a0584069b0aecfd94d56da5 100644
--- a/src/commands/regions/import.more.test.ts
+++ b/src/commands/regions/import.more.test.ts
@@ -1,11 +1,13 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
-import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
 import {
   fakeButton,
+  asV2,
   fakeMessage,
+  sent,
   type SentPayload,
 } from '../../../test/support/fake-interactions.js';
-import { answerOf, buttonId, buttonsOf, embedOf } from '../../../test/support/gym-commands.js';
+import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { testRaid } from '../../../test/support/parties.js';
 import {
@@ -16,11 +18,21 @@ import {
   TOWN_CATEGORY,
   WEST_RING,
 } from '../../../test/support/region-admin.js';
-import { attachedText, regionCommandsWith } from '../../../test/support/region-commands.js';
+import {
+  attachedText,
+  regionCommandsWith,
+  regionListed,
+  regionSaid,
+} from '../../../test/support/region-commands.js';
 import { writeKml } from '../../domain/geo/kml.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
 import { MAX_KML_CORNERS } from '../../domain/geo/kml.js';
 import { MAX_NEW_CHANNELS } from '../../domain/regions/region-import.js';
+import { ANSWERED_BELOW } from '../../discord/late-reply.js';
+import type { ImportOutcome } from '../../services/region-admin-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { textDisplays } from '../../../test/support/messages.js';
+import { renderOutcome } from './import.js';
 
 type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
 
@@ -48,22 +60,7 @@ async function importing(
   return { used, answer: answerOf(used) };
 }
 
-function embedText(embed: unknown): string {
-  const json = (
-    typeof (embed as { toJSON?: unknown }).toJSON === 'function'
-      ? (embed as { toJSON(): unknown }).toJSON()
-      : embed
-  ) as { title?: string; description?: string };
-  return `${json.title ?? ''}\n${json.description ?? ''}`;
-}
-
-function listed(answer: SentPayload, title: string): string[] {
-  for (const embed of answer.embeds ?? []) {
-    const text = embedText(embed);
-    if (text.startsWith(`${title}\n`)) return text.split('\n').slice(1);
-  }
-  throw new Error(`no embed "${title}"`);
-}
+const listed = regionListed;
 
 /** The custom id of the first button under an answer: Import, whatever it creates. */
 const importButton = (answer: SentPayload): string => buttonsOf(answer)[0]?.[1] ?? '';
@@ -81,7 +78,7 @@ describe('/region import: the preview, as review B asked', () => {
       '- River Side → **new channel** `#river-side` in the new category `River Towns` · 0 gyms · gets a forum',
       `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
     ]);
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain(
       'I would **create 2 forums**, one for each region that has none.',
     );
     expect(buttonsOf(answer)[0]?.[0]).toBe('Import and create 1 channel, 1 category, 2 forums');
@@ -111,7 +108,7 @@ describe('/region import: the preview, as review B asked', () => {
       '- Brand New → **new channel** `#brand-new` in the new category `Brand New` · 0 gyms · gets a forum',
       `- West → <#${WEST_CHANNEL}> · outline unchanged · 8 gyms`,
     ]);
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain(
       '**1 new channel has a name close to another**: is it a typo in the file?',
     );
   });
@@ -119,7 +116,7 @@ describe('/region import: the preview, as review B asked', () => {
   it('marks and counts outlines that stay as they are, and says that other regions stay', async () => {
     const made = await regionCommandsWith();
     const { answer } = await importing(made, [area('West', WEST_RING), area('South', SOUTH_RING)]);
-    expect((answer.content ?? '').split('\n').slice(0, 2)).toEqual([
+    expect(regionSaid(answer).split('\n').slice(0, 2)).toEqual([
       'This file would give 1 new region and leave 1 outline as it is. Nothing is changed yet.',
       'Regions that are not in this file stay as they are.',
     ]);
@@ -128,10 +125,10 @@ describe('/region import: the preview, as review B asked', () => {
   it('says for one channel that no channel is created', async () => {
     const made = await regionCommandsWith();
     const { answer } = await importing(made, [area('x', SOUTH_RING)], { channel: SOUTH_CHANNEL });
-    expect(answer.content?.split('\n')[0]).toBe(
+    expect(regionSaid(answer)?.split('\n')[0]).toBe(
       'This file would give 1 new region. Nothing is changed yet (no channel is created).',
     );
-    expect(answer.content).not.toContain('Regions that are not in this file');
+    expect(regionSaid(answer)).not.toContain('Regions that are not in this file');
   });
 
   it('warns of a category that would hold more than Discord allows', async () => {
@@ -140,7 +137,7 @@ describe('/region import: the preview, as review B asked', () => {
     for (let i = 0; i < 49; i++)
       made.gateway.addChannel(`full${i}`, `full-${i}`, { categoryId: 'k9' });
     const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain(
       'The category `Full` would hold 51 channels and forums, and Discord allows 50: what is ' +
         'more is refused. Put some of these areas into another category.',
     );
@@ -155,7 +152,7 @@ describe('/region import: the preview, as review B asked', () => {
     expect(listed(answer, 'Would be imported').at(-1)).toMatch(/^…and \d+ more$/u);
     const text = attachedText(answer, 'preview.txt');
     expect(text.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(56);
-    expect(answer.content).toContain('Every line is in the attached file.');
+    expect(regionSaid(answer)).toContain('Every line is in the attached file.');
     // The file is for reading: channels by their names, no Markdown.
     expect(text).not.toContain('**');
     expect(text).not.toMatch(/<#\d+>/u);
@@ -164,9 +161,13 @@ describe('/region import: the preview, as review B asked', () => {
       .split('\n')
       .find((line) => line.startsWith('- West'));
     expect(westLine).toBe('- West → #west · outline unchanged · 8 gyms');
+    // The file is shown as a file of the preview, which carries it.
+    expect(JSON.stringify(answer.components)).toContain('attachment://preview.txt');
+    expectV2Sendable(asV2(answer));
     // A preview that fits has no file.
     const small = await importing(made, [area('South', SOUTH_RING)]);
     expect(small.answer.files ?? []).toEqual([]);
+    expect(JSON.stringify(small.answer.components)).not.toContain('attachment://');
   });
 
   it('takes the file away with the preview, whatever is pressed', async () => {
@@ -178,18 +179,76 @@ describe('/region import: the preview, as review B asked', () => {
       const { answer } = await importing(made, areas);
       const id =
         label === 'Cancel' ? buttonId(answer, 'Cancel') : (buttonsOf(answer)[0]?.[1] ?? '');
-      const message = fakeMessage([], undefined, answer.content ?? '', answer.files ?? []);
+      const message = fakeMessage([], undefined, regionSaid(answer), answer.files ?? []);
       const pressed = await made.press(id, { message });
       expect((await pressed.fetchReply()).attachments).toEqual([]);
     }
     // An answer for an expired question takes it away too.
     const { answer } = await importing(made, areas);
     const expired = await made.press('region:0123456789abcdef:import', {
-      message: fakeMessage([], undefined, answer.content ?? '', answer.files ?? []),
+      message: fakeMessage([], undefined, regionSaid(answer), answer.files ?? []),
     });
     expect((await expired.fetchReply()).attachments).toEqual([]);
   });
 
+  it('takes the file away from a plain-text preview from before, and shows the outcome below', async () => {
+    const made = await regionCommandsWith();
+    const areas = Array.from({ length: 56 }, (_unused, i) =>
+      area(`A rather long name of a region number ${i} ${'x'.repeat(60)}`, far(i), 'Cat'),
+    );
+    const { answer } = await importing(made, areas);
+    const message = fakeMessage([], undefined, 'An old preview', answer.files ?? []);
+    const pressed = await made.press(buttonsOf(answer)[0]?.[1] ?? '', {
+      message,
+      v2Message: false,
+    });
+    expect((await pressed.fetchReply()).attachments).toEqual([]);
+    expect(sent(pressed.editReply)).toMatchObject({ content: ANSWERED_BELOW, attachments: [] });
+    expect(regionSaid(sent(pressed.followUp))).toMatch(/^Imported \d+ regions/u);
+  });
+
+  it('attaches every line of an outcome whose lists had to be cut, and fits Discord', () => {
+    const { ctx } = createTestContext();
+    const hostile = ['@everyone', '**bold** `code`', '[link](https://example.com)', '<#1>'];
+    const outcome: ImportOutcome = {
+      imported: Array.from({ length: 200 }, (_unused, i) => ({
+        name: `${hostile[i % hostile.length] ?? ''} ${i}`,
+        channelId: String(100000000000000000n + BigInt(i)),
+        regionId: i + 1,
+        newRegion: true,
+        unchanged: false,
+        channelCreated: i % 2 === 0,
+        gyms: i,
+        forum: 'none' as const,
+        forumReason: `${hostile[(i + 1) % hostile.length] ?? ''} ${'y'.repeat(200)}`,
+      })),
+      notImported: Array.from({ length: 100 }, (_unused, i) => ({
+        name: `${hostile[i % hostile.length] ?? ''} ${'z'.repeat(80)} ${i}`,
+        channelName: `channel-${i}`,
+        reason: 'failed' as const,
+      })),
+      categoriesCreated: Array.from(
+        { length: 30 },
+        (_unused, i) => `Category ${'c'.repeat(90)} ${i}`,
+      ),
+      reloaded: false,
+    };
+    const message = renderOutcome(ctx, outcome);
+    expectV2Sendable(message);
+    expect(JSON.stringify(message.components)).toContain('attachment://outcome.txt');
+    const file = (message.files ?? []).find(
+      (one): one is { attachment: Buffer; name: string } =>
+        typeof one !== 'string' && one.name === 'outcome.txt',
+    );
+    const lines = file?.attachment.toString('utf8').split('\n') ?? [];
+    expect(lines.filter((line) => line.startsWith('- '))).toHaveLength(300);
+    expect(file?.attachment.toString('utf8')).not.toContain('**');
+    expect(textDisplays(message)[0]).toContain('Every line is in the attached file.');
+    // What was not imported has the larger room: it is what staff have to put right.
+    const [, imported = '', notImported = ''] = textDisplays(message);
+    expect(notImported.length).toBeGreaterThan(imported.length);
+  });
+
   it('fits Discord with a hostile file of 200 areas', async () => {
     const made = await regionCommandsWith();
     const hostile = [
@@ -210,13 +269,8 @@ describe('/region import: the preview, as review B asked', () => {
       ),
     );
     const { answer } = await importing(made, areas);
-    expect(() => {
-      FakePartyGateway.checkMessage({
-        content: answer.content ?? '',
-        embeds: (answer.embeds ?? []).map((embed) => embedOf({ embeds: [embed] })),
-      });
-    }).not.toThrow();
-    expect(answer.content).not.toContain('@everyone');
+    expectV2Sendable(asV2(answer));
+    expect(regionSaid(answer)).not.toContain('@everyone');
     expect(buttonsOf(answer).length).toBe(2);
   });
 
@@ -234,7 +288,7 @@ describe('/region import: the preview, as review B asked', () => {
       made,
       Array.from({ length: 5 }, (_unused, i) => area(`R${i}`, ring(40 + i))),
     );
-    expect(answer.content).toBe(
+    expect(regionSaid(answer)).toBe(
       `The outlines of that file have more than ${MAX_KML_CORNERS} corners in all. Import ` +
         'the regions in several files, or simplify the shapes.',
     );
@@ -257,14 +311,11 @@ describe('/region import: pressing', () => {
     const pressed = await made.press(
       buttonId(answer, 'Import and create 1 channel, 1 category, 2 forums'),
     );
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'Importing 3 areas… this message changes when it is done.',
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
+    expect(regionSaid(sent(pressed.update))).toBe(
+      'Importing 3 areas… this message changes when it is done.',
+    );
     const done = answerOf(pressed);
-    expect(done.content).toContain(
+    expect(regionSaid(done)).toContain(
       '2 of them have no forum, so nothing can be reported there yet:',
     );
     const lines = listed(done, 'Imported');
@@ -285,7 +336,7 @@ describe('/region import: pressing', () => {
     const { answer } = await importing(made, [area('South', SOUTH_RING)]);
     made.directory.load = () => Promise.reject(new Error('connection lost'));
     const done = answerOf(await made.press(buttonId(answer, 'Import and create 1 forum')));
-    expect(done.content).toContain(
+    expect(regionSaid(done)).toContain(
       'The outlines are stored, but I could not load them again: members see them after the ' +
         'next restart.',
     );
@@ -297,12 +348,7 @@ describe('/region import: pressing', () => {
     const { answer } = await importing(made, [area('South', SOUTH_RING)]);
     vi.setSystemTime(Date.now() + 31 * 60_000);
     const pressed = await made.press(buttonId(answer, 'Import and create 1 forum'));
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'That has expired. Use the command again.',
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
+    expect(regionSaid(sent(pressed.update))).toBe('That has expired. Use the command again.');
     expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
   });
 
@@ -311,12 +357,7 @@ describe('/region import: pressing', () => {
     const first = await importing(made, [area('South', SOUTH_RING)]);
     for (let i = 0; i < 50; i++) await importing(made, [area('South', SOUTH_RING)]);
     const pressed = await made.press(buttonId(first.answer, 'Import and create 1 forum'));
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'That has expired. Use the command again.',
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
+    expect(regionSaid(sent(pressed.update))).toBe('That has expired. Use the command again.');
   });
 });
 
@@ -327,7 +368,7 @@ describe('/region import: a big import', () => {
       area(`Place ${String.fromCharCode(97 + (i % 26))}${i}`, far(i), 'Cat'),
     );
     const { answer } = await importing(made, areas);
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain(
       `I create at most ${MAX_NEW_CHANNELS} channels in one import, so 2 areas wait (under ` +
         '"Left out"): once this import is done, import the same file again. What is imported ' +
         'already comes out unchanged.',
@@ -393,7 +434,7 @@ describe('/region import: the forum of a removed region', () => {
     expect(listed(answer, 'Would be imported')).toEqual([
       `- West → <#${WEST_CHANNEL}> · new region · 8 gyms · takes back its forum <#${WEST_FORUM}>`,
     ]);
-    expect(answer.content).not.toContain('forum**');
+    expect(regionSaid(answer)).not.toContain('forum**');
     const done = answerOf(await made.press(buttonId(answer, 'Import')));
     expect(listed(done, 'Imported')).toEqual([
       `- <#${WEST_CHANNEL}> · new region · 8 gyms · forum <#${WEST_FORUM}> taken back`,
@@ -419,7 +460,7 @@ describe('/region import: staff without Manage Channels', () => {
       },
     );
     const answer = answerOf(used);
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain(
       'Creating channels takes the Manage Channels permission, which you lack, so areas ' +
         'without a channel are left out: create their channels yourself, or ask somebody who ' +
         'may.',
diff --git a/src/commands/regions/import.test.ts b/src/commands/regions/import.test.ts
index 3a582b0037b1d292b3db78a16caab8a3d5ab0747..3576b3129653254e967d441e456f31fe8e0db920 100644
--- a/src/commands/regions/import.test.ts
+++ b/src/commands/regions/import.test.ts
@@ -1,7 +1,10 @@
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
-import { answerOf, buttonId, buttonsOf, embedOf } from '../../../test/support/gym-commands.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
+import { asV2, sent } from '../../../test/support/fake-interactions.js';
+import { textDisplays } from '../../../test/support/messages.js';
+import { ANSWERED_BELOW } from '../../discord/late-reply.js';
+import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
 import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { testRaid } from '../../../test/support/parties.js';
 import {
@@ -12,7 +15,12 @@ import {
   WEST_HALF_RING,
   WEST_RING,
 } from '../../../test/support/region-admin.js';
-import { MEMBER, regionCommandsWith } from '../../../test/support/region-commands.js';
+import {
+  MEMBER,
+  regionCommandsWith,
+  regionListed,
+  regionSaid,
+} from '../../../test/support/region-commands.js';
 import type { SentPayload } from '../../../test/support/fake-interactions.js';
 import { writeKml } from '../../domain/geo/kml.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
@@ -51,26 +59,7 @@ async function importing(
 /** The custom id of the first button under an answer: Import, whatever it creates. */
 const importButton = (answer: SentPayload): string => buttonsOf(answer)[0]?.[1] ?? '';
 
-const texts = (answer: SentPayload): string =>
-  [answer.content ?? '', ...(answer.embeds ?? []).map((embed) => embedText(embed))].join('\n');
-
-function embedText(embed: unknown): string {
-  const json = (
-    typeof (embed as { toJSON?: unknown }).toJSON === 'function'
-      ? (embed as { toJSON(): unknown }).toJSON()
-      : embed
-  ) as { title?: string; description?: string };
-  return `${json.title ?? ''}\n${json.description ?? ''}`;
-}
-
-/** The embed of an answer with this title, as lines. */
-function listed(answer: SentPayload, title: string): string[] {
-  for (const embed of answer.embeds ?? []) {
-    const text = embedText(embed);
-    if (text.startsWith(`${title}\n`)) return text.split('\n').slice(1);
-  }
-  throw new Error(`no embed "${title}" in ${texts(answer)}`);
-}
+const listed = regionListed;
 
 describe('/region import: the preview', () => {
   it('shows what would be imported and changes nothing until Import is pressed', async () => {
@@ -84,7 +73,7 @@ describe('/region import: the preview', () => {
       area('South', SOUTH_RING),
     ]);
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
-    expect((answer.content ?? '').split('\n')).toEqual([
+    expect(regionSaid(answer).split('\n')).toEqual([
       'This file would give 1 new region and 1 new outline. Nothing is changed yet.',
       'Regions that are not in this file stay as they are.',
       'I would **create 1 forum**, one for each region that has none.',
@@ -115,7 +104,7 @@ describe('/region import: the preview', () => {
       area('Old Town', squareRing(42, -81, 42.1, -80.9), 'Town'),
       area('Lonely', squareRing(43, -81, 43.1, -80.9)),
     ]);
-    expect((answer.content ?? '').split('\n')).toEqual([
+    expect(regionSaid(answer).split('\n')).toEqual([
       'This file would give 4 new regions. Nothing is changed yet.',
       'Regions that are not in this file stay as they are.',
       'I would **create 4 channels**: `#river-side`, `#hill-top`, `#old-town`, `#lonely`. Check the ' +
@@ -143,8 +132,8 @@ describe('/region import: the preview', () => {
       area('South', SOUTH_RING),
       area('River Side', SOUTH_RING),
     ]);
-    expect(answer.content).toContain('This file would give 1 new region.');
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain('This file would give 1 new region.');
+    expect(regionSaid(answer)).toContain(
       'I may not create channels in this server (I lack Manage Channels)',
     );
     expect(listed(answer, 'Left out')).toEqual([
@@ -193,7 +182,7 @@ describe('/region import: the preview', () => {
       '- Bow \\*\\*tie\\*\\*: its outline crosses or touches itself',
       '- Islands: it has several areas, and a region is one',
     ]);
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain(
       '2 placemarks of the file are no areas (points, lines) and are ignored.',
     );
   });
@@ -202,7 +191,7 @@ describe('/region import: the preview', () => {
     const made = await regionCommandsWith();
     const size = made.pending();
     const { answer } = await importing(made, [area('!!!', SOUTH_RING)]);
-    expect(answer.content).toBe('Nothing in this file can be imported.');
+    expect(regionSaid(answer)).toBe('Nothing in this file can be imported.');
     expect(buttonsOf(answer)).toEqual([]);
     expect(made.pending()).toBe(size);
   });
@@ -231,17 +220,12 @@ describe('/region import: the preview', () => {
     );
     const { answer } = await importing(made, areas);
     // The fake gateway refuses what Discord would refuse.
-    expect(() => {
-      FakePartyGateway.checkMessage({
-        content: answer.content ?? '',
-        embeds: (answer.embeds ?? []).map((embed) => embedOf({ embeds: [embed] })),
-      });
-    }).not.toThrow();
+    expectV2Sendable(asV2(answer));
     // One import creates 25 channels; the others wait for the next.
-    expect(answer.content).toContain('This file would give 25 new regions.');
-    expect(answer.content).toContain('I would **create 25 channels**');
-    expect(answer.content).toContain('so 31 areas wait');
-    expect(answer.content).toMatch(/…and \d+ more/u);
+    expect(regionSaid(answer)).toContain('This file would give 25 new regions.');
+    expect(regionSaid(answer)).toContain('I would **create 25 channels**');
+    expect(regionSaid(answer)).toContain('so 31 areas wait');
+    expect(regionSaid(answer)).toMatch(/…and \d+ more/u);
     expect(listed(answer, 'Would be imported').at(-1)).toMatch(/^…and \d+ more$/u);
     expect(buttonsOf(answer)[0]?.[0]).toBe(
       'Import and create 25 channels, 9 categories, 25 forums',
@@ -254,7 +238,7 @@ describe('/region import: what is no file of regions', () => {
     const made = await regionCommandsWith();
     const { answer } = await importing(made, file, more);
     expect(buttonsOf(answer)).toEqual([]);
-    return answer.content ?? '';
+    return regionSaid(answer);
   };
 
   it('says how to get KML when the file is a KMZ', async () => {
@@ -278,7 +262,7 @@ describe('/region import: what is no file of regions', () => {
   it('refuses a file that says it is larger than a megabyte, before any download', async () => {
     const made = await regionCommandsWith();
     const { answer } = await importing(made, '<kml/>', { size: MAX_KML_BYTES + 1 });
-    expect(answer.content).toContain('larger than 1 MB');
+    expect(regionSaid(answer)).toContain('larger than 1 MB');
     expect(made.attachments.asked).toEqual([]);
   });
 
@@ -291,7 +275,7 @@ describe('/region import: what is no file of regions', () => {
     const made = await regionCommandsWith();
     made.attachments.failing = true;
     const { answer } = await importing(made, '<kml/>');
-    expect(answer.content).toBe(
+    expect(regionSaid(answer)).toBe(
       'I could not download that file from Discord. Try again in a moment.',
     );
   });
@@ -329,8 +313,8 @@ describe('/region import: for one channel', () => {
       '- East: it stands for another channel',
       '- Brand New: it stands for another channel',
     ]);
-    expect(answer.content).toContain('(no channel is created)');
-    expect(answer.content).not.toContain('I would **create');
+    expect(regionSaid(answer)).toContain('(no channel is created)');
+    expect(regionSaid(answer)).not.toContain('I would **create');
   });
 
   it('refuses a file of several areas of which none, or more than one, is the channel’s', async () => {
@@ -338,14 +322,14 @@ describe('/region import: for one channel', () => {
     const none = await importing(made, [area('A', SOUTH_RING), area('B', SOUTH_RING)], {
       channel: SOUTH_CHANNEL,
     });
-    expect(none.answer.content).toBe(
+    expect(regionSaid(none.answer)).toBe(
       `The file has 2 areas, and none of them is named after <#${SOUTH_CHANNEL}>. Use a file ` +
         'with that area alone, or name exactly one area after the channel.',
     );
     const several = await importing(made, [area('South', SOUTH_RING), area('south', WEST_RING)], {
       channel: SOUTH_CHANNEL,
     });
-    expect(several.answer.content).toContain('several of them are named after');
+    expect(regionSaid(several.answer)).toContain('several of them are named after');
     expect(buttonsOf(several.answer)).toEqual([]);
   });
 
@@ -353,7 +337,7 @@ describe('/region import: for one channel', () => {
     const made = await regionCommandsWith();
     for (const channel of [WEST_FORUM, TOWN_CATEGORY, '100000000000009999']) {
       const { answer } = await importing(made, [area('x', SOUTH_RING)], { channel });
-      expect(answer.content).toBe(
+      expect(regionSaid(answer)).toBe(
         'Only an ordinary text channel of this server can be a region: not a thread, a ' +
           'forum, a voice or an announcement channel.',
       );
@@ -376,7 +360,7 @@ describe('/region import: Import and Cancel', () => {
     const created = made.gateway
       .serverChannels(made.gateway.guildId)
       ?.find((channel) => channel.name === 'river-side');
-    expect((done.content ?? '').split('\n')).toEqual([
+    expect(regionSaid(done).split('\n')).toEqual([
       'Imported 3 regions, and created 1 channel for them.',
       'Created 1 category: `River Towns`.',
       'If members give themselves a role for a region, add the role of a new region with ' +
@@ -387,7 +371,7 @@ describe('/region import: Import and Cancel', () => {
       `- <#${created?.id ?? ''}> · new region · channel created · 0 gyms · forum created`,
       `- <#${WEST_CHANNEL}> · new outline · 5 gyms`,
     ]);
-    expect(done.components).toEqual([]);
+    expect(buttonsOf(done)).toEqual([]);
     expect(made.regions.byChannel(WEST_CHANNEL)?.bounds).toEqual(WEST_HALF_RING);
     expect(made.regions.byChannel(created?.id ?? '')?.forumChannelId).not.toBeNull();
     expect(made.directory.isRegion(SOUTH_CHANNEL)).toBe(true);
@@ -398,7 +382,7 @@ describe('/region import: Import and Cancel', () => {
     made.ctx.config.settings.features.roles = false;
     const { answer } = await importing(made, [area('South', SOUTH_RING)]);
     const done = answerOf(await made.press(importButton(answer)));
-    expect(done.content).toBe('Imported 1 region.');
+    expect(regionSaid(done)).toBe('Imported 1 region.');
     made.ctx.config.settings.features.roles = true;
   });
 
@@ -413,7 +397,7 @@ describe('/region import: Import and Cancel', () => {
     const done = answerOf(await made.press(importButton(answer)));
     made.regions.failing = undefined;
     const [createdId] = made.gateway.createdChannels.slice(-1);
-    expect(done.content).toContain('Nothing was imported.');
+    expect(regionSaid(done)).toContain('Nothing was imported.');
     expect(listed(done, 'Not imported')).toEqual([
       '- South: its channel is gone, or is no text channel any more.',
       `- River Side: the outlines could not be written (the log says why). I had created ` +
@@ -426,7 +410,7 @@ describe('/region import: Import and Cancel', () => {
     const { answer } = await importing(made, [area('South', SOUTH_RING)]);
     made.gateway.failing.set('createForum', new Error('Discord is down'));
     const done = answerOf(await made.press(importButton(answer)));
-    expect(done.content).toContain('run `/admin setup-forums`');
+    expect(regionSaid(done)).toContain('run `/admin setup-forums`');
     expect(listed(done, 'Imported')).toEqual([
       `- <#${SOUTH_CHANNEL}> · new region · 0 gyms · **no forum**: something went wrong (see the log)`,
     ]);
@@ -436,13 +420,47 @@ describe('/region import: Import and Cancel', () => {
     const made = await regionCommandsWith();
     const { answer } = await importing(made, [area('South', SOUTH_RING)]);
     const pressed = await made.press(buttonId(answer, 'Cancel'));
-    expect(pressed.update).toHaveBeenCalledWith({
+    expect(regionSaid(sent(pressed.update))).toBe('Nothing was imported.');
+    expect(sent(pressed.update).flags).toBe(MessageFlags.IsComponentsV2);
+    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
+  });
+
+  it('shows the preview as one container: the sentences, the lists, the buttons inside', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
+    const message = asV2(answer);
+    expect(textDisplays(message)[0]?.split('\n')[0]).toBe('### Import regions');
+    expect(textDisplays(message)[1]).toMatch(/^\*\*Would be imported\*\*\n- South/u);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
+      'Import and create 1 forum',
+      'Cancel',
+    ]);
+    expectV2Sendable(message);
+  });
+
+  it('answers a press on a plain-text preview from before the plan below it', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    const pressed = await made.press(importButton(answer), { v2Message: false });
+    // Working, then closed with a line, in plain text; what was done follows privately.
+    expect(sent(pressed.update)).toMatchObject({
+      content: 'Importing 1 area… this message changes when it is done.',
+    });
+    expect(sent(pressed.editReply)).toMatchObject({ content: ANSWERED_BELOW, components: [] });
+    const below = sent(pressed.followUp);
+    expect(below.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
+    expect(regionSaid(below)).toMatch(/^Imported 1 region\./u);
+    const cancelled = await made.press(
+      buttonId((await importing(made, [area('North', SOUTH_RING)])).answer, 'Cancel'),
+      { v2Message: false },
+    );
+    expect(sent(cancelled.update)).toEqual({
       content: 'Nothing was imported.',
       embeds: [],
       components: [],
       attachments: [],
     });
-    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
   });
 
   it('answers a question once: a second press is only acknowledged', async () => {
@@ -481,12 +499,7 @@ describe('/region import: Import and Cancel', () => {
   it('says that a question has expired that the bot no longer remembers', async () => {
     const made = await regionCommandsWith();
     const pressed = await made.press('region:0123456789abcdef:import');
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'That has expired. Use the command again.',
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
+    expect(regionSaid(sent(pressed.update))).toBe('That has expired. Use the command again.');
     expect(PENDING_MINUTES).toBe(30);
     expect(pendingRegions.size).toBeLessThanOrEqual(50);
   });
@@ -506,6 +519,6 @@ describe('/region import: Import and Cancel', () => {
         },
       },
     );
-    expect(answerOf(used).content).toContain('Only an ordinary text channel of this server');
+    expect(regionSaid(answerOf(used))).toContain('Only an ordinary text channel of this server');
   });
 });
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
index 95af4442dd78234dd08a614066cd89b90b0fffaa..c5875e3393567fffa45dd5e7e3ce921bac53e70d 100644
--- a/src/commands/regions/import.ts
+++ b/src/commands/regions/import.ts
@@ -1,15 +1,13 @@
 import {
-  ActionRowBuilder,
-  AttachmentBuilder,
   ButtonStyle,
   ChannelType,
   SlashCommandSubcommandBuilder,
-  type APIEmbed,
-  type ButtonBuilder,
+  type APIButtonComponent,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import {
   kmlText,
   MAX_KML_AREAS,
@@ -28,6 +26,7 @@ import {
   type PlannedImport,
 } from '../../domain/regions/region-import.js';
 import { count, fitItems, plain, truncate } from '../../render/text.js';
+import { actionRow, container, fileComponent, separator, textDisplay } from '../../render/v2.js';
 import {
   importSummary,
   type ImportedRegion,
@@ -37,9 +36,10 @@ import {
   type NotImported,
 } from '../../services/region-admin-service.js';
 import {
+  answerRegion,
   button,
-  content,
   pendingRegions,
+  REGION_COLOUR,
   regionStaff,
   selfRoleReminder,
   type ButtonAnswer,
@@ -51,9 +51,16 @@ export const MAX_KML_BYTES = 1_000_000;
 const DOWNLOAD_MS = 10_000;
 /** How much of a name from a file is shown. */
 const NAME_SHOWN = 40;
-/** How much room the list of what would be imported, and of what is left out, may take. */
-const IMPORT_LIST = 3_600;
-const LEFT_OUT_LIST = 1_500;
+/**
+ * How much room the sentences of a preview or an outcome, the list of what would be (or was)
+ * imported, and the list of what is left out (or was not imported) may take: together with
+ * their headings within the 4,000 characters of a components-v2 message (`TEXT_BUDGET`).
+ */
+const SENTENCES = 1_400;
+const IMPORT_LIST = 1_700;
+const LEFT_OUT_LIST = 800;
+/** The heading of the preview of `/region import` and of its outcome. */
+const IMPORT_HEADING = '### Import regions';
 /** How much of a message the names of new channels or categories may take. */
 const NAMES_SHOWN = 500;
 
@@ -258,7 +265,8 @@ export function renderPreview(
   others: number,
   oneChannel = false,
   channelNames: ReadonlyMap<string, string> = new Map(),
-): { content: string; embeds: APIEmbed[]; files: AttachmentBuilder[] } {
+  buttons: readonly APIButtonComponent[] = [],
+): V2Message {
   const { imports, leftOut, newChannels, newCategories } = preview;
   const lines: string[] = [];
   if (imports.length === 0) {
@@ -351,39 +359,70 @@ export function renderPreview(
     ...leftOut.map((left) => `- ${shown(left.name)}: ${leftOutText(left)}`),
     ...skipped.map((skip) => `- ${shown(skip.name)}: ${skipText(skip.reason)}`),
   ];
-  const embeds: APIEmbed[] = [];
+  return importMessage(
+    lines,
+    [
+      { title: 'Would be imported', items: planned, room: IMPORT_LIST },
+      { title: 'Left out', items: out, room: LEFT_OUT_LIST },
+    ],
+    PREVIEW_FILE,
+    channelNames,
+    buttons,
+  );
+}
+
+/** A list of a preview or an outcome: its heading, its lines and the room it has. */
+interface ImportList {
+  title: string;
+  items: readonly string[];
+  room: number;
+}
+
+/**
+ * A preview or an outcome of `/region import` as a components-v2 message (plan 8B-4): one
+ * container with the heading and the sentences, a line, the lists each under its heading in
+ * bold (a list without lines is left out), and the buttons in a row inside. Lists that do not
+ * fit are cut with a count, and then every line is also in an attached file (`file`, shown as
+ * a file of the message), written for reading in a text editor: channels by their names
+ * (`channelNames`, by id), and no bold.
+ */
+function importMessage(
+  lines: readonly string[],
+  lists: readonly ImportList[],
+  file: string,
+  channelNames: ReadonlyMap<string, string>,
+  buttons: readonly APIButtonComponent[] = [],
+): V2Message {
+  const shownLists = lists.filter((list) => list.items.length > 0);
   let cut = false;
-  const fitted = (items: readonly string[], limit: number): string => {
-    const text = fitItems(items, limit, '\n');
-    if (text !== items.join('\n')) cut = true;
-    return text;
-  };
-  if (planned.length > 0) {
-    embeds.push({ title: 'Would be imported', description: fitted(planned, IMPORT_LIST) });
-  }
-  if (out.length > 0) {
-    embeds.push({ title: 'Left out', description: fitted(out, LEFT_OUT_LIST) });
-  }
-  const text = content(lines);
-  if (text !== lines.join('\n')) cut = true;
-  if (!cut) return { content: text, embeds, files: [] };
-  const whole = [
-    ...lines,
-    '',
-    ...(planned.length > 0 ? ['Would be imported:', ...planned, ''] : []),
-    ...(out.length > 0 ? ['Left out:', ...out] : []),
-  ]
+  const texts = shownLists.map((list) => {
+    const text = fitItems(list.items, list.room, '\n');
+    if (text !== list.items.join('\n')) cut = true;
+    return `**${list.title}**\n${text}`;
+  });
+  const said = lines.join('\n');
+  if (truncate(said, SENTENCES) !== said) cut = true;
+  const sentences = truncate(
+    cut
+      ? [...lines.slice(0, 1), 'Every line is in the attached file.', ...lines.slice(1)].join('\n')
+      : said,
+    SENTENCES,
+  );
+  const whole = [...lines, ...shownLists.flatMap((list) => ['', `${list.title}:`, ...list.items])]
     .join('\n')
     .replace(/<#(\d+)>/gu, (_mention, id: string) => `#${channelNames.get(id) ?? id}`)
     .replace(/\*\*/gu, '');
   return {
-    content: content([
-      ...lines.slice(0, 1),
-      'Every line is in the attached file.',
-      ...lines.slice(1),
-    ]),
-    embeds,
-    files: [new AttachmentBuilder(Buffer.from(whole, 'utf8'), { name: PREVIEW_FILE })],
+    v2: true,
+    components: [
+      container(REGION_COLOUR, [
+        textDisplay(sentences === '' ? IMPORT_HEADING : `${IMPORT_HEADING}\n${sentences}`),
+        ...(texts.length === 0 ? [] : [separator(), ...texts.map((text) => textDisplay(text))]),
+        ...(cut ? [fileComponent(file)] : []),
+        ...(buttons.length === 0 ? [] : [actionRow([...buttons])]),
+      ]),
+    ],
+    ...(cut ? { files: [{ attachment: Buffer.from(whole, 'utf8'), name: file }] } : {}),
   };
 }
 
@@ -447,11 +486,18 @@ const FORUM_ORDER: Readonly<Record<ImportedRegion['forum'], number>> = {
   had: 2,
 };
 
-/** What an import did, as the answer that takes the place of the preview. */
+/** The name of the file an outcome attaches when its lists had to be cut. */
+export const OUTCOME_FILE = 'outcome.txt';
+
+/**
+ * What an import did, as the answer that takes the place of the preview; cut lists are in
+ * `outcome.txt` whole. **Not imported** has the larger room: it is what staff have to put right.
+ */
 export function renderOutcome(
   ctx: AppContext,
   outcome: ImportOutcome,
-): { content: string; embeds: APIEmbed[] } {
+  channelNames: ReadonlyMap<string, string> = new Map(),
+): V2Message {
   const { imported, notImported, categoriesCreated } = outcome;
   const lines: string[] = [];
   if (imported.length === 0) {
@@ -487,27 +533,20 @@ export function renderOutcome(
     const reminder = selfRoleReminder(ctx, 'new');
     if (reminder !== undefined) lines.push(reminder);
   }
-  const embeds: APIEmbed[] = [];
-  if (imported.length > 0) {
-    const ordered = imported
-      .map((region, index) => ({ region, index }))
-      .sort(
-        (a, b) => FORUM_ORDER[a.region.forum] - FORUM_ORDER[b.region.forum] || a.index - b.index,
-      )
-      .map(({ region }) => importedLine(region));
-    embeds.push({ title: 'Imported', description: fitItems(ordered, IMPORT_LIST, '\n') });
-  }
-  if (notImported.length > 0) {
-    embeds.push({
-      title: 'Not imported',
-      description: fitItems(
-        notImported.map((failed) => `- ${shown(failed.name)}: ${failureText(failed)}`),
-        LEFT_OUT_LIST,
-        '\n',
-      ),
-    });
-  }
-  return { content: content(lines), embeds };
+  const ordered = imported
+    .map((region, index) => ({ region, index }))
+    .sort((a, b) => FORUM_ORDER[a.region.forum] - FORUM_ORDER[b.region.forum] || a.index - b.index)
+    .map(({ region }) => importedLine(region));
+  const failures = notImported.map((failed) => `- ${shown(failed.name)}: ${failureText(failed)}`);
+  return importMessage(
+    lines,
+    [
+      { title: 'Imported', items: ordered, room: LEFT_OUT_LIST },
+      { title: 'Not imported', items: failures, room: IMPORT_LIST },
+    ],
+    OUTCOME_FILE,
+    channelNames,
+  );
 }
 
 /**
@@ -607,30 +646,30 @@ export const importRegions: SubcommandPart = {
     const channelNames = new Map(
       ctx.regionAdmin.channelsOf(staff).map((channel) => [channel.id, channel.name]),
     );
-    const rendered = renderPreview(
-      preview,
-      reading.skipped,
-      reading.others,
-      target !== undefined,
-      channelNames,
-    );
+    const render = (buttons: readonly APIButtonComponent[]) =>
+      renderPreview(
+        preview,
+        reading.skipped,
+        reading.others,
+        target !== undefined,
+        channelNames,
+        buttons,
+      );
     if (preview.imports.length === 0) {
-      await interaction.editReply({ ...rendered, components: [] });
+      await answerRegion(interaction, render([]));
       return;
     }
     const token = pendingRegions.put(interaction.user.id, {
       what: 'import',
       imports: preview.imports,
     });
-    await interaction.editReply({
-      ...rendered,
-      components: [
-        new ActionRowBuilder<ButtonBuilder>().addComponents(
-          button(token, 'import', importLabel(preview), ButtonStyle.Primary),
-          button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
-        ),
-      ],
-    });
+    await answerRegion(
+      interaction,
+      render([
+        button(token, 'import', importLabel(preview), ButtonStyle.Primary).toJSON(),
+        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary).toJSON(),
+      ]),
+    );
   },
 };
 
@@ -645,11 +684,10 @@ export const importAnswers: Readonly<Record<string, ButtonAnswer>> = {
     const staff = await regionStaff(interaction, ctx);
     const outcome = await ctx.regionAdmin.import(staff, request.imports);
     try {
-      await interaction.editReply({
-        ...renderOutcome(ctx, outcome),
-        components: [],
-        attachments: [],
-      });
+      const channelNames = new Map(
+        ctx.regionAdmin.channelsOf(staff).map((channel) => [channel.id, channel.name]),
+      );
+      await answerRegion(interaction, renderOutcome(ctx, outcome, channelNames));
     } catch (err) {
       // An import of many areas may outlast the interaction (a quarter of an hour): what it did
       // is in the log, the only place left to say it.
diff --git a/src/commands/regions/region.more.test.ts b/src/commands/regions/region.more.test.ts
index c9ad9a1a7823997b501f17f7827684aa8116c659..95848df8f8a8030d50f2201a17b60eceac130067 100644
--- a/src/commands/regions/region.more.test.ts
+++ b/src/commands/regions/region.more.test.ts
@@ -3,7 +3,11 @@ import { describe, expect, it } from 'vitest';
 import { answerOf } from '../../../test/support/gym-commands.js';
 import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { SOUTH_CHANNEL } from '../../../test/support/region-admin.js';
-import { attachedText, regionCommandsWith } from '../../../test/support/region-commands.js';
+import {
+  attachedText,
+  regionCommandsWith,
+  regionSaid,
+} from '../../../test/support/region-commands.js';
 import { MAX_KML_AREAS, MAX_KML_CORNERS, readKml } from '../../domain/geo/kml.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
 import { MAX_OUTLINE_CORNERS } from '../../domain/geo/outline.js';
@@ -39,7 +43,7 @@ describe('/region export: all regions, by name', () => {
     const made = await regionCommandsWith();
     made.gateway.gone.add(EAST_CHANNEL);
     const used = await made.use('export', { region: 'id:2' });
-    expect(answerOf(used).content).toBe(
+    expect(regionSaid(answerOf(used))).toBe(
       `The outline of the region of the deleted channel ${EAST_CHANNEL}. Its channel is gone: ` +
         'to give the outline to another channel, use `/region import` with `channel:`.',
     );
@@ -102,7 +106,7 @@ describe('/region export: more than one import takes', () => {
     const used = await made.use('export', {}, { channelId: SOUTH_CHANNEL });
     const answer = answerOf(used);
     expect(filesOf(answer)).toEqual(['regions.kml', 'regions-2.kml']);
-    expect(answer.content).toBe(
+    expect(regionSaid(answer)).toBe(
       `The outlines of ${MAX_KML_AREAS + 7} regions of this server, in 2 files: ` +
         `\`/region import\` takes at most ${MAX_KML_AREAS} areas and ${MAX_KML_CORNERS} ` +
         'corners from one file, so import them one after the other. 1 region without an ' +
@@ -125,7 +129,7 @@ describe('/region export: more than one import takes', () => {
     const files = filesOf(answerOf(used));
     expect(files).toHaveLength(10);
     expect(files[9]).toBe('regions-10.kml');
-    expect(answerOf(used).content).toContain('in 11 files');
+    expect(regionSaid(answerOf(used))).toContain('in 11 files');
     const followUps = (used.followUp as unknown as { mock: { calls: [FollowUp][] } }).mock.calls;
     expect(followUps).toHaveLength(1);
     const [[more]] = followUps as [[FollowUp]];
@@ -143,7 +147,7 @@ describe('/region list: what it counts', () => {
     made.gateway.gone.add(EAST_CHANNEL);
     made.regions.rows.splice(2, 1);
     const used = await made.use('list');
-    expect(answerOf(used).content).not.toContain('/admin setup-forums');
+    expect(regionSaid(answerOf(used))).not.toContain('/admin setup-forums');
     // A region whose channel exists and that has no forum is helped by it.
     const other = await regionCommandsWith();
     expect(answerOf(await other.use('list')).content).toContain(
@@ -156,7 +160,7 @@ describe('/bounds elsewhere', () => {
   it('says what to do outside a region', async () => {
     const made = await regionCommandsWith();
     const used = await made.run('bounds', { channelId: SOUTH_CHANNEL });
-    expect(answerOf(used).content).toBe(
+    expect(regionSaid(answerOf(used))).toBe(
       'This channel is not a region. Use /bounds in the channel of a region, in its forum or ' +
         'in a post there.',
     );
diff --git a/src/commands/regions/region.test.ts b/src/commands/regions/region.test.ts
index aa4cc3bfa5a9a68254929718a4ab2f7d5024bbd0..b67cf394be79585b4b97e28c0e68e65f11089a2f 100644
--- a/src/commands/regions/region.test.ts
+++ b/src/commands/regions/region.test.ts
@@ -1,6 +1,9 @@
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { answerOf, embedOf } from '../../../test/support/gym-commands.js';
+import { answerOf } from '../../../test/support/gym-commands.js';
+import { asV2 } from '../../../test/support/fake-interactions.js';
+import { galleryOf, textDisplays, textOf as textOfV2 } from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { withOtherServer } from '../../../test/support/gym-admin.js';
 import {
   EAST_CHANNEL,
@@ -22,6 +25,7 @@ import {
   MEMBER,
   OTHER_SERVER,
   regionCommandsWith,
+  regionSaid,
 } from '../../../test/support/region-commands.js';
 import { readKml } from '../../domain/geo/kml.js';
 import type { Region } from '../../db/repositories/region-repository.js';
@@ -32,7 +36,7 @@ const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
   interaction.respond.mock.calls[0]?.[0] as { name: string; value: string }[];
 
 const textOf = (interaction: Parameters<typeof answerOf>[0]): string =>
-  answerOf(interaction).content ?? '';
+  regionSaid(answerOf(interaction));
 
 /** Every text a command answered with, the follow-ups too, in order. */
 function allTexts(interaction: Awaited<ReturnType<typeof regionCommandsWith>>['staff'] & object) {
@@ -302,23 +306,23 @@ describe('/bounds', () => {
     const used = await made.run('bounds', { userId: MEMBER, roleNames: [] });
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const answer = answerOf(used);
-    expect(embedOf(answer)).toEqual({
-      title: 'This channel covers the following area',
-      description: `<#${WEST_CHANNEL}>\nThere are 8 gyms within this region.`,
-      image: { url: 'attachment://1-abc.png' },
-    });
+    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
+    const message = asV2(answer);
+    expect(textDisplays(message)).toEqual([
+      `### The area of <#${WEST_CHANNEL}>\nThere are 8 gyms within this region.`,
+    ]);
+    expect(galleryOf(message)).toEqual(['attachment://1-abc.png']);
     expect(answer.files).toEqual(['var/images/regions/1-abc.png']);
-    expect(answer.content).toBeUndefined();
+    expectV2Sendable(message);
   });
 
   it('answers without a picture when there is none, or the picture fails', async () => {
     const made = await regionCommandsWith();
     const used = await made.run('bounds', { userId: MEMBER, roleNames: [], channelId: EAST_FORUM });
-    expect(embedOf(answerOf(used))).toEqual({
-      title: 'This channel covers the following area',
-      description: `<#${EAST_CHANNEL}>\nThere are 3 gyms within this region.`,
-    });
-    expect(answerOf(used).files).toEqual([]);
+    expect(textDisplays(asV2(answerOf(used)))).toEqual([
+      `### The area of <#${EAST_CHANNEL}>\nThere are 3 gyms within this region.`,
+    ]);
+    expect(answerOf(used).files).toBeUndefined();
 
     const failing = await regionCommandsWith([], {
       maps: {
@@ -330,7 +334,7 @@ describe('/bounds', () => {
       },
     });
     const again = await failing.run('bounds', { userId: MEMBER, roleNames: [] });
-    expect(embedOf(answerOf(again)).image).toBeUndefined();
+    expect(galleryOf(asV2(answerOf(again)))).toEqual([]);
   });
 
   it('works in a post of the region’s forum', async () => {
@@ -341,7 +345,7 @@ describe('/bounds', () => {
       channelId: '900000000000009999',
       thread: { parentId: WEST_FORUM },
     });
-    expect(embedOf(answerOf(used)).description).toContain(`<#${WEST_CHANNEL}>`);
+    expect(textOfV2(asV2(answerOf(used)))).toContain(`<#${WEST_CHANNEL}>`);
   });
 
   it('says where there is no region, and of a region without an outline that it has none', async () => {
diff --git a/src/commands/regions/remove.test.ts b/src/commands/regions/remove.test.ts
index 091d667ac8354e37e1e78a86a3e341d019e1dbd0..4d109fae3647463f1e8710af9f19c5b5bda95200 100644
--- a/src/commands/regions/remove.test.ts
+++ b/src/commands/regions/remove.test.ts
@@ -1,5 +1,7 @@
 import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { sent } from '../../../test/support/fake-interactions.js';
+import { ANSWERED_BELOW } from '../../discord/late-reply.js';
 import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
 import {
   EAST_CHANNEL,
@@ -9,7 +11,7 @@ import {
   WEST_FORUM,
 } from '../../../test/support/gyms.js';
 import { ALICE, REPORTER } from '../../../test/support/parties.js';
-import { MEMBER, regionCommandsWith } from '../../../test/support/region-commands.js';
+import { MEMBER, regionCommandsWith, regionSaid } from '../../../test/support/region-commands.js';
 import { PartyStatus } from '../../domain/party/status.js';
 
 type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
@@ -52,7 +54,9 @@ describe('/region remove: the question', () => {
     const used = await made.use('remove', { region: 'id:1' });
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const answer = answerOf(used);
-    expect((answer.content ?? '').split('\n')).toEqual([
+    // A components-v2 message, its buttons inside (plan 8B-4).
+    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
+    expect(regionSaid(answer).split('\n')).toEqual([
       `Remove the region <#${WEST_CHANNEL}>? This cannot be undone.`,
       '- 1 active raid, train or meetup will be ended; its post says why',
       '- 8 gyms will lie in no region of this server: no raid can be reported there until a ' +
@@ -76,7 +80,7 @@ describe('/region remove: the question', () => {
     const made = await regionCommandsWith();
     const used = await made.use('remove', { region: 'unbounded' });
     const answer = answerOf(used);
-    expect((answer.content ?? '').split('\n')).toEqual([
+    expect(regionSaid(answer).split('\n')).toEqual([
       `Remove the region <#${UNBOUNDED_CHANNEL}>? This cannot be undone.`,
       'Nothing goes with it.',
       'Its text channel stays as it is, and no gym is deleted.',
@@ -86,16 +90,16 @@ describe('/region remove: the question', () => {
     made.gateway.gone.add(EAST_FORUM);
     made.gateway.gone.add(EAST_CHANNEL);
     const east = answerOf(await made.use('remove', { region: 'id:2' }));
-    expect(east.content).toContain(`Remove the region of the deleted channel ${EAST_CHANNEL}?`);
-    expect(east.content).toContain('Its forum is gone already.');
-    expect(east.content).not.toContain('text channel stays');
+    expect(regionSaid(east)).toContain(`Remove the region of the deleted channel ${EAST_CHANNEL}?`);
+    expect(regionSaid(east)).toContain('Its forum is gone already.');
+    expect(regionSaid(east)).not.toContain('text channel stays');
   });
 
   it('refuses a region of another server, or none', async () => {
     const made = await regionCommandsWith();
     for (const typed of ['id:99', 'nowhere']) {
       const used = await made.use('remove', { region: typed });
-      expect(answerOf(used).content).toContain('is no region of this server');
+      expect(regionSaid(answerOf(used))).toContain('is no region of this server');
     }
   });
 });
@@ -113,7 +117,7 @@ describe('/region remove: the answers', () => {
     const post = second.forumPostId ?? '';
     made.storage.rows.delete(second.id);
     const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
-    expect(answerOf(pressed).content).toBe(
+    expect(regionSaid(answerOf(pressed))).toBe(
       `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
         'log says what failed.\n1 of its raids, trains and meetups was ended already.',
     );
@@ -124,7 +128,7 @@ describe('/region remove: the answers', () => {
     const question = answerOf(await made.use('remove', { region: 'id:3' }));
     made.directory.load = () => Promise.reject(new Error('connection lost'));
     const pressed = await made.press(buttonId(question, 'Remove'));
-    expect(answerOf(pressed).content).toContain(
+    expect(regionSaid(answerOf(pressed))).toContain(
       'The region is removed, but I could not load the regions again: members see the change ' +
         'after the next restart.',
     );
@@ -139,7 +143,7 @@ describe('/region remove: the answers', () => {
     };
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
     const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
-    expect(answerOf(pressed).content).toContain(`Its forum <#${EAST_FORUM}> stays as history.`);
+    expect(regionSaid(answerOf(pressed))).toContain(`Its forum <#${EAST_FORUM}> stays as history.`);
     // A row without a forum names none, whatever memory said.
     const other = await regionCommandsWith();
     other.regions.remove = async (id, guildId) => {
@@ -148,8 +152,8 @@ describe('/region remove: the answers', () => {
     };
     const asked = answerOf(await other.use('remove', { region: 'id:1' }));
     const done = answerOf(await other.press(buttonId(asked, 'Remove, keep the forum')));
-    expect(done.content).not.toContain('<#>');
-    expect(done.content).not.toContain('Its forum');
+    expect(regionSaid(done)).not.toContain('<#>');
+    expect(regionSaid(done)).not.toContain('Its forum');
   });
 
   it('removes the region and keeps the forum as history', async () => {
@@ -159,13 +163,10 @@ describe('/region remove: the answers', () => {
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
     const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
     await made.settle();
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'Removing the region… this message changes when it is done.',
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
-    expect((answerOf(pressed).content ?? '').split('\n')).toEqual([
+    expect(regionSaid(sent(pressed.update))).toBe(
+      'Removing the region… this message changes when it is done.',
+    );
+    expect(regionSaid(answerOf(pressed)).split('\n')).toEqual([
       `Removed the region <#${WEST_CHANNEL}>.`,
       '- 1 active raid, train or meetup was ended; its post says why',
       '- 8 gyms now lie in no region of this server: no raid can be reported there until a ' +
@@ -175,20 +176,22 @@ describe('/region remove: the answers', () => {
       'If members gave themselves a role for this region, take it off the list with ' +
         '`/admin self-roles remove`.',
     ]);
-    expect(answerOf(pressed).components).toEqual([]);
+    expect(buttonsOf(answerOf(pressed))).toEqual([]);
     expect(made.regions.byId(1)).toBeUndefined();
     expect(made.gateway.posts.get(post)).toMatchObject({ archived: true, locked: true });
     expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
     // The channel is no region now: a member asking there is told so.
     const asked = await made.run('bounds', { userId: MEMBER, roleNames: [] });
-    expect(answerOf(asked).content).toContain('This channel is not a region.');
+    expect(regionSaid(answerOf(asked))).toContain('This channel is not a region.');
   });
 
   it('removes the region and deletes its forum when asked', async () => {
     const made = await regionCommandsWith();
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
     const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
-    expect(answerOf(pressed).content).toContain('Its forum was deleted, with every post in it.');
+    expect(regionSaid(answerOf(pressed))).toContain(
+      'Its forum was deleted, with every post in it.',
+    );
     expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
   });
 
@@ -197,7 +200,7 @@ describe('/region remove: the answers', () => {
     made.gateway.failing.set('deleteChannel', missingPermissions());
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
     const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
-    expect(answerOf(pressed).content).toContain(
+    expect(regionSaid(answerOf(pressed))).toContain(
       `I could not delete its forum <#${WEST_FORUM}> (I need Manage Channels there): delete it ` +
         'by hand. The region is gone all the same.',
     );
@@ -211,7 +214,7 @@ describe('/region remove: the answers', () => {
     made.storage.failing = new Error('connection lost');
     const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
     made.storage.failing = undefined;
-    expect(answerOf(pressed).content).toBe(
+    expect(regionSaid(answerOf(pressed))).toBe(
       `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
         'log says what failed.',
     );
@@ -225,7 +228,7 @@ describe('/region remove: the answers', () => {
     made.regions.failing = new Error('connection lost');
     const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
     made.regions.failing = undefined;
-    expect((answerOf(pressed).content ?? '').split('\n')).toEqual([
+    expect(regionSaid(answerOf(pressed)).split('\n')).toEqual([
       'I could not remove the region, and it is still there (the log says what failed). Try ' +
         'again in a moment.',
       '1 of its raids, trains and meetups was ended before that.',
@@ -238,19 +241,14 @@ describe('/region remove: the answers', () => {
     const second = answerOf(await made.use('remove', { region: 'id:3' }));
     await made.press(buttonId(first, 'Remove'));
     const late = await made.press(buttonId(second, 'Remove'));
-    expect(answerOf(late).content).toBe('That region no longer exists.');
+    expect(regionSaid(answerOf(late))).toBe('That region no longer exists.');
   });
 
   it('keeps the region on Cancel', async () => {
     const made = await regionCommandsWith();
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
     const pressed = await made.press(buttonId(question, 'Cancel'));
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'The region was kept.',
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
+    expect(regionSaid(sent(pressed.update))).toBe('The region was kept.');
     expect(made.regions.byId(1)).toBeDefined();
   });
 
@@ -259,13 +257,30 @@ describe('/region remove: the answers', () => {
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
     const post = await reported(made, 2);
     const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
-    expect(answerOf(pressed).content).toContain(
+    expect(regionSaid(answerOf(pressed))).toContain(
       '- 1 active raid, train or meetup was ended; its post says why',
     );
     expect(made.gateway.posts.get(post)?.archived).toBe(true);
   });
 });
 
+describe('/region remove: a question from before plan 8B-4', () => {
+  it('removes on a plain-text question and shows the outcome below it', async () => {
+    for (const label of ['Remove, keep the forum', 'Remove and delete the forum']) {
+      const made = await regionCommandsWith();
+      const question = answerOf(await made.use('remove', { region: 'id:1' }));
+      const pressed = await made.press(buttonId(question, label), { v2Message: false });
+      // Working, then the line that the answer follows below, in plain text.
+      expect(sent(pressed.update).content).toBe(
+        'Removing the region… this message changes when it is done.',
+      );
+      expect(sent(pressed.editReply)).toMatchObject({ content: ANSWERED_BELOW, components: [] });
+      expect(regionSaid(sent(pressed.followUp))).toMatch(/^Removed the region/u);
+      expect(made.regions.byChannel(WEST_CHANNEL)).toBeUndefined();
+    }
+  });
+});
+
 describe('/region remove: staff without Manage Channels', () => {
   /** A moderator whose roles do not let them manage channels. */
   const LACKING = { permissions: 0n };
@@ -273,7 +288,7 @@ describe('/region remove: staff without Manage Channels', () => {
   it('offers only to keep the forum, and says why', async () => {
     const made = await regionCommandsWith();
     const answer = answerOf(await made.use('remove', { region: 'id:1' }, LACKING));
-    expect(answer.content).toContain(
+    expect(regionSaid(answer)).toContain(
       `Its forum <#${WEST_FORUM}> stays as history (its posts are archived and locked): ` +
         'deleting it takes the Manage Channels permission, which you lack.',
     );
@@ -284,7 +299,7 @@ describe('/region remove: staff without Manage Channels', () => {
     const made = await regionCommandsWith();
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
     const pressed = await made.press(buttonId(question, 'Remove and delete the forum'), LACKING);
-    expect(answerOf(pressed).content).toBe(
+    expect(regionSaid(answerOf(pressed))).toBe(
       'Deleting the forum of a region takes the Manage Channels permission, which you lack. ' +
         'Nothing was removed.',
     );
diff --git a/src/commands/regions/remove.ts b/src/commands/regions/remove.ts
index 54687ea5717e5b78289f9b5fab5bb3ef21e0709f..6a9e62c1857f64876a6c4b3a0a247136b30007c7 100644
--- a/src/commands/regions/remove.ts
+++ b/src/commands/regions/remove.ts
@@ -1,9 +1,4 @@
-import {
-  ActionRowBuilder,
-  ButtonStyle,
-  SlashCommandSubcommandBuilder,
-  type ButtonBuilder,
-} from 'discord.js';
+import { ButtonStyle, SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
 import { partyWord } from '../../domain/party/party.js';
@@ -11,9 +6,11 @@ import { count } from '../../render/text.js';
 import type { RemovalOutcome } from '../../services/region-admin-service.js';
 import { chosenRegion, respondWithRegions, withRegionOption } from './region-option.js';
 import {
+  answerRegion,
   button,
   content,
   pendingRegions,
+  regionQuestion,
   REGION_GONE,
   regionInSentence,
   regionStaff,
@@ -100,28 +97,31 @@ export const removeRegion: SubcommandPart = {
     const hasForum = question.forum === 'there' && forumId !== null;
     // Deleting a channel through the bot takes what deleting it by hand takes.
     const mayDelete = hasForum && staff.mayManageChannels;
-    await interaction.editReply({
-      content: content([
-        `Remove ${label}? This cannot be undone.`,
-        ...(going.length === 0 ? ['Nothing goes with it.'] : going),
-        question.channel === 'there'
-          ? 'Its text channel stays as it is, and no gym is deleted.'
-          : 'No gym is deleted.',
-        ...(mayDelete
-          ? [
-              `Its forum <#${forumId}> can stay as history (its posts are archived and ` +
-                'locked), or be deleted. **Deleting the forum deletes every post in it for ' +
-                'good.**',
-            ]
-          : hasForum
-            ? [
-                `Its forum <#${forumId}> stays as history (its posts are archived and locked): ` +
-                  'deleting it takes the Manage Channels permission, which you lack.',
-              ]
-            : [question.forum === 'gone' ? 'Its forum is gone already.' : 'It has no forum.']),
-      ]),
-      components: [
-        new ActionRowBuilder<ButtonBuilder>().addComponents(
+    await answerRegion(
+      interaction,
+      regionQuestion(
+        [
+          content([
+            `Remove ${label}? This cannot be undone.`,
+            ...(going.length === 0 ? ['Nothing goes with it.'] : going),
+            question.channel === 'there'
+              ? 'Its text channel stays as it is, and no gym is deleted.'
+              : 'No gym is deleted.',
+            ...(mayDelete
+              ? [
+                  `Its forum <#${forumId}> can stay as history (its posts are archived and ` +
+                    'locked), or be deleted. **Deleting the forum deletes every post in it for ' +
+                    'good.**',
+                ]
+              : hasForum
+                ? [
+                    `Its forum <#${forumId}> stays as history (its posts are archived and locked): ` +
+                      'deleting it takes the Manage Channels permission, which you lack.',
+                  ]
+                : [question.forum === 'gone' ? 'Its forum is gone already.' : 'It has no forum.']),
+          ]),
+        ],
+        [
           ...(hasForum
             ? [
                 button(token, 'keep', 'Remove, keep the forum', ButtonStyle.Danger),
@@ -131,9 +131,9 @@ export const removeRegion: SubcommandPart = {
               ]
             : [button(token, 'keep', 'Remove', ButtonStyle.Danger)]),
           button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
-        ),
-      ],
-    });
+        ],
+      ),
+    );
   },
   autocomplete: respondWithRegions,
 };
@@ -214,12 +214,7 @@ const removal =
       outcome.kind === 'gone'
         ? [REGION_GONE]
         : outcomeLines(outcome, label, selfRoleReminder(ctx, 'removed'));
-    await interaction.editReply({
-      content: content(lines),
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
+    await answerRegion(interaction, regionQuestion([content(lines)]));
   };
 
 export const removeAnswers: Readonly<Record<string, ButtonAnswer>> = {
diff --git a/src/commands/regions/shared.ts b/src/commands/regions/shared.ts
index e739ede0753f296d074c9f651d4c0ac898350165..50453a0dcba721c5bc6ebf620fd5169bc341ebff 100644
--- a/src/commands/regions/shared.ts
+++ b/src/commands/regions/shared.ts
@@ -1,6 +1,7 @@
 import {
   ButtonBuilder,
   PermissionFlagsBits,
+  type APIButtonComponent,
   type ButtonInteraction,
   type ButtonStyle,
 } from 'discord.js';
@@ -8,18 +9,54 @@ import type { AppContext } from '../../app-context.js';
 import { BoundedMap } from '../../bounded-map.js';
 import type { Region } from '../../db/repositories/region-repository.js';
 import { channelContext } from '../../discord/channel-context.js';
-import type { LocatedInteraction } from '../../discord/command.js';
+import type { GuardableInteraction, LocatedInteraction } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf } from '../../discord/guards.js';
+import { answerApart, sayInPlace, showInPlace, type Press } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import type { PlannedImport, ServerChannel } from '../../domain/regions/region-import.js';
 import { LIMITS, truncate } from '../../render/text.js';
+import { actionRow, textMessage } from '../../render/v2.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import type { RegionStaff } from '../../services/region-admin-service.js';
 
 /** The custom-id kind of the controls of `/region` (documented in `custom-id.ts`). */
 export const REGION_KIND = 'region';
 
+/** The colour of what is said about regions: `/region`, `/bounds`, `/find-region`. */
+export const REGION_COLOUR = 0x2ecc71;
+
+/**
+ * A question or an answer of `/region` as a components-v2 message (plan 8B-4: an answer takes
+ * the place of its question, and a v2 message never becomes classic again): its sentences, and
+ * its buttons in a row inside.
+ */
+export function regionQuestion(
+  texts: readonly (string | undefined)[],
+  buttons: readonly (ButtonBuilder | APIButtonComponent)[] = [],
+): V2Message {
+  const row = buttons.map((one) => (one instanceof ButtonBuilder ? one.toJSON() : one));
+  return textMessage(REGION_COLOUR, texts, row.length === 0 ? [] : [actionRow(row)]);
+}
+
+/**
+ * Shows a question or an answer of `/region`: as the answer of the command (its deferral
+ * edited), or in the place of the message a control is on (`showInPlace`).
+ */
+export async function answerRegion(
+  interaction: GuardableInteraction,
+  message: V2Message,
+): Promise<void> {
+  if (interaction.isChatInputCommand()) await answerApart(interaction, message);
+  else await showInPlace(interaction, message);
+}
+
+/** Says a sentence in the place of the message a control of `/region` is on (`sayInPlace`). */
+export function sayRegion(interaction: Press, text: string): Promise<void> {
+  return sayInPlace(interaction, text, REGION_COLOUR);
+}
+
 /** What a question of `/region` waits with until the staff member answers. */
 export type PendingRegion =
   /** `/region import`: what the preview said would be imported, as it was planned. */
diff --git a/src/commands/util/find-region.test.ts b/src/commands/util/find-region.test.ts
index e8746dd6bad0e54f3871542670a6d30798c12ebb..055635cb992339284279bd31cecb2b182ccca5b8 100644
--- a/src/commands/util/find-region.test.ts
+++ b/src/commands/util/find-region.test.ts
@@ -1,10 +1,13 @@
-import { MessageFlags, type APIEmbed } from 'discord.js';
+import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
+  asV2,
   fakeChatInput,
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
+import { galleryOf, textDisplays } from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { ALICE } from '../../../test/support/parties.js';
 import { FakePlaces } from '../../../test/support/places.js';
@@ -98,10 +101,25 @@ function told(used: FakeInteraction): string | undefined {
   throw new Error('nothing was answered');
 }
 
-function embedOf(used: FakeInteraction): APIEmbed {
-  const embed = (sent(used.editReply).embeds as APIEmbed[] | undefined)?.[0];
-  if (!embed) throw new Error('no embed was answered');
-  return embed;
+/**
+ * The answer as a test reads it: its text, its map and its small print (the components-v2
+ * message of plan 8B-4, read in the shape the embed had).
+ */
+function shownAnswer(used: FakeInteraction): {
+  description?: string;
+  image?: { url: string };
+  footer?: { text: string };
+} {
+  const message = asV2(sent(used.editReply));
+  expectV2Sendable(message);
+  const [description, ...rest] = textDisplays(message);
+  const [url] = galleryOf(message);
+  const small = rest.find((text) => text.startsWith('-# '));
+  return {
+    ...(description === undefined ? {} : { description }),
+    ...(url === undefined ? {} : { image: { url } }),
+    ...(small === undefined ? {} : { footer: { text: small.slice(3) } }),
+  };
 }
 
 describe('/find-region: the command', () => {
@@ -134,7 +152,7 @@ describe('/find-region: a place by name', () => {
         box: widenedBox({ south: 40, north: 40.1, west: -80.1, east: -79.9 }, 10),
       },
     ]);
-    expect(embedOf(used)).toEqual({
+    expect(shownAnswer(used)).toEqual({
       description:
         '**Big Park, Pinewood** (the most likely of 2 places by that name) lies wholly or partly ' +
         `in <#${WEST_CHANNEL}>, <#${EAST_CHANNEL}>.`,
@@ -169,7 +187,7 @@ describe('/find-region: a place by name', () => {
       },
     ]);
     const used = await made.run('Bentleyville');
-    expect(embedOf(used).description).toBe(
+    expect(shownAnswer(used).description).toBe(
       '**Bentleyville** (the most likely of 2 places by that name) lies in none of this ' +
         'server’s regions.',
     );
@@ -183,7 +201,7 @@ describe('/find-region: a place by name', () => {
         shape: PARK,
       },
     ]);
-    expect(embedOf(await made.run('Schenley Park')).description).toMatch(
+    expect(shownAnswer(await made.run('Schenley Park')).description).toMatch(
       /^\*\*Schenley Park, Squirrel Hill North, Pittsburgh\*\* lies wholly or partly in /,
     );
   });
@@ -197,7 +215,7 @@ describe('/find-region: a place by name', () => {
         tooDetailed: true,
       },
     ]);
-    expect(embedOf(await made.run('Big County')).description).toBe(
+    expect(shownAnswer(await made.run('Big County')).description).toBe(
       `**Big County** lies in <#${WEST_CHANNEL}>. Its outline is too detailed for me to read, ` +
         'so this is where its centre lies.',
     );
@@ -218,7 +236,7 @@ describe('/find-region: a place by name', () => {
     made.places.found.set('edge', [
       { name: 'Edge', shape: { kind: 'point', point: { lat: 40.099, lon: -79.85 } } },
     ]);
-    expect(embedOf(await made.run('Edge')).description).toBe(
+    expect(shownAnswer(await made.run('Edge')).description).toBe(
       '**Edge** lies in none of this server’s regions.',
     );
   });
@@ -245,8 +263,10 @@ describe('/find-region: coordinates and links', () => {
     const made = setup({ maps: mapsFixture() });
     const used = await made.run('40.05, -80.05');
     expect(made.places.asked).toEqual([]);
-    expect(embedOf(used)).toEqual({ description: `**40.05, -80.05** lies in <#${WEST_CHANNEL}>.` });
-    expect(sent(used.editReply).files).toEqual([]);
+    expect(shownAnswer(used)).toEqual({
+      description: `**40.05, -80.05** lies in <#${WEST_CHANNEL}>.`,
+    });
+    expect(sent(used.editReply).files).toBeUndefined();
   });
 
   it('follows a short link of the Maps app', async () => {
@@ -256,7 +276,7 @@ describe('/find-region: coordinates and links', () => {
     } as unknown as GymAdminService;
     const made = setup({ gymAdmin });
     const used = await made.run('https://maps.app.goo.gl/abcdef');
-    expect(embedOf(used).description).toBe(
+    expect(shownAnswer(used).description).toBe(
       `**40.05, -79.95** (where the map of the link was centred) lies in <#${EAST_CHANNEL}>.`,
     );
   });
diff --git a/src/commands/util/find-region.ts b/src/commands/util/find-region.ts
index b74d4dc6e99c82684cc0a1d7be9079d8ee0b61c8..de2867294c29dea3d3fd8f7e41ebe35b82f86167 100644
--- a/src/commands/util/find-region.ts
+++ b/src/commands/util/find-region.ts
@@ -1,15 +1,19 @@
-import { basename } from 'node:path';
-import { SlashCommandBuilder, type APIEmbed, type ChatInputCommandInteraction } from 'discord.js';
+import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Region } from '../../db/repositories/region-repository.js';
 import type { Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { requireGuild } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import type { Throttle } from '../../discord/throttle.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
 import { LOCATION_FORMS, readLocation } from '../../domain/geo/location-input.js';
 import { regionsBox, regionsTouching, widenedBox, type Shape } from '../../domain/geo/shape.js';
-import { fitItems, LIMITS, plainNoLinks, truncate } from '../../render/text.js';
+import { fitItems, plainNoLinks, truncate } from '../../render/text.js';
+import { container, mapPicture, textDisplay } from '../../render/v2.js';
+import { mapOrNothing } from '../../services/static-maps.js';
+import { REGION_COLOUR } from '../regions/shared.js';
 import type { PlaceOutcome } from '../../services/place-search.js';
 import { serverOf } from './server-gym.js';
 
@@ -210,13 +214,40 @@ function regionsText(
   if (found.length === 0) return `${place}${where} lies in none of this server’s regions.`;
   const channels = fitItems(
     found.map((region) => `<#${region.channelId}>`),
-    LIMITS.embedDescription - 400,
+    CHANNELS_SHOWN,
   );
   return shape.kind === 'point'
     ? `${place}${where} lies in ${channels}.`
     : `${place} lies wholly or partly in ${channels}.`;
 }
 
+/** How much room the channels of the regions get in the answer of `/find-region`. */
+const CHANNELS_SHOWN = 3_000;
+
+/**
+ * The answer of `/find-region` as a components-v2 message (plan 8B-4): what the place lies in,
+ * the map of the place with those regions at full width (`map`; without one, none), and the
+ * licence of OpenStreetMap in small print when the place came from it.
+ */
+export function findRegionMessage(
+  text: string,
+  map: string | undefined,
+  fromOsm: boolean,
+): V2Message {
+  const picture = mapPicture(map, 'The place and the regions it lies in');
+  return {
+    v2: true,
+    components: [
+      container(REGION_COLOUR, [
+        textDisplay(text),
+        ...picture.gallery,
+        ...(fromOsm ? [textDisplay(`-# ${OSM_ATTRIBUTION}`)] : []),
+      ]),
+    ],
+    ...(picture.files.length === 0 ? {} : { files: picture.files }),
+  };
+}
+
 /**
  * `/find-region` (spec row 200, the legacy `!find`): which of this server's regions a place
  * lies in. The place is coordinates or a map link (read as `/gym add` reads them), or a name,
@@ -253,26 +284,15 @@ export const findRegion: SimpleCommand = {
     const regions = await serverRegions(interaction, ctx);
     const place = await placeOf(interaction, ctx, text, regions);
     const found = regionsTouching(place.shape, regions);
-    const map = await ctx.maps
-      .place(
+    const map = await mapOrNothing(
+      ctx.maps.place(
         place.shape,
         found.flatMap((region) => (region.bounds ? [region.bounds] : [])),
-      )
-      .catch((err: unknown) => {
-        ctx.log.warn({ err }, 'could not get the map of a place');
-        return undefined;
-      });
-    const embed: APIEmbed = {
-      description: answerText(
-        place.label,
-        place.shape,
-        found,
-        place.approximate,
-        place.tooDetailed,
       ),
-      ...(map === undefined ? {} : { image: { url: `attachment://${basename(map)}` } }),
-      ...(place.fromOsm ? { footer: { text: OSM_ATTRIBUTION } } : {}),
-    };
-    await interaction.editReply({ embeds: [embed], files: map === undefined ? [] : [map] });
+      ctx.log,
+      'a place',
+    );
+    const said = answerText(place.label, place.shape, found, place.approximate, place.tooDetailed);
+    await interaction.editReply(v2Answer(findRegionMessage(said, map, place.fromOsm)));
   },
 };
diff --git a/test/support/gym-commands.ts b/test/support/gym-commands.ts
index ba81b5b8d000cae761c15aff1641a51f5c8eb84c..277b8cc0f230a56f56f7d9ee10b701c41c75fbf5 100644
--- a/test/support/gym-commands.ts
+++ b/test/support/gym-commands.ts
@@ -146,13 +146,6 @@ export function gymViewOf(payload: SentPayload): ShownGymView {
   };
 }
 
-/** The first embed of an answer, as Discord gets it (the region commands until plan 8B-4 T4). */
-export function embedOf(payload: SentPayload) {
-  const [embed] = payload.embeds ?? [];
-  if (!embed) throw new Error('the answer has no embed');
-  return 'toJSON' in embed ? embed.toJSON() : embed;
-}
-
 /** The custom id of the button with this label under a message. */
 export function buttonId(payload: SentPayload, label: string): string {
   const found = buttonsOf(payload).find(([text]) => text === label);
diff --git a/test/support/region-commands.ts b/test/support/region-commands.ts
index 53de372be52349cdd3e4f9d02b082cef96bd3977..922fcd9b56abad86ffa3de3c11abce0a56fc77c7 100644
--- a/test/support/region-commands.ts
+++ b/test/support/region-commands.ts
@@ -1,4 +1,4 @@
-import { PermissionFlagsBits } from 'discord.js';
+import { ComponentType, MessageFlags, PermissionFlagsBits } from 'discord.js';
 import { admin } from '../../src/commands/admin/index.js';
 import { bounds } from '../../src/commands/regions/bounds.js';
 import { regionControls } from '../../src/commands/regions/controls.js';
@@ -14,6 +14,7 @@ import {
   fakeChatInput,
   type FakeInteraction,
   type FakeOptions,
+  type SentPayload,
 } from './fake-interactions.js';
 import { OTHER_STAFF } from './gym-admin.js';
 import { MEMBER, MODERATOR } from './gym-commands.js';
@@ -31,6 +32,44 @@ export const OTHER_SERVER: FakeOptions = {
   channelId: NORTH_CHANNEL,
 };
 
+/** The text displays of a components-v2 payload, nested ones included, in order. */
+function texts(payload: SentPayload): string[] {
+  const found: string[] = [];
+  const visit = (component: unknown): void => {
+    const one = component as { type?: unknown; content?: unknown; components?: unknown[] };
+    if (one.type === ComponentType.TextDisplay && typeof one.content === 'string') {
+      found.push(one.content);
+    }
+    for (const inner of one.components ?? []) visit(inner);
+  };
+  for (const component of payload.components ?? []) visit(component);
+  return found;
+}
+
+const isV2 = (payload: SentPayload): boolean =>
+  ((payload.flags ?? 0) & MessageFlags.IsComponentsV2) !== 0;
+
+/**
+ * What an answer of `/region` says in sentences: of a components-v2 one its first text without
+ * a heading (`### Import regions`), of a classic one (a refusal) its content.
+ */
+export function regionSaid(payload: SentPayload): string {
+  if (!isV2(payload)) return payload.content ?? '';
+  return (texts(payload)[0] ?? '').replace(/^### [^\n]*\n?/u, '');
+}
+
+/** Everything an answer of `/region` says: all its texts (or its content), joined by lines. */
+export function regionTexts(payload: SentPayload): string {
+  return isV2(payload) ? texts(payload).join('\n') : (payload.content ?? '');
+}
+
+/** The lines of the list of an answer under this heading (`**Would be imported**`). */
+export function regionListed(payload: SentPayload, title: string): string[] {
+  const list = texts(payload).find((text) => text.startsWith(`**${title}**\n`));
+  if (list === undefined) throw new Error(`no list "${title}" in ${regionTexts(payload)}`);
+  return list.split('\n').slice(1);
+}
+
 /** The text of a file that an answer attached, by its name. */
 export function attachedText(payload: { files?: readonly unknown[] }, name: string): string {
   for (const file of payload.files ?? []) {
@@ -126,8 +165,10 @@ export async function regionCommandsWith(
           ...extra,
         }),
       ),
+    // The questions of `/region` are components-v2 messages (plan 8B-4), unless a test says
+    // the message is one from before (`v2Message: false`).
     press: (customId: string, extra: FakeOptions = {}) =>
-      handled(fakeButton({ customId, ...staff, ...extra })),
+      handled(fakeButton({ customId, ...staff, v2Message: true, ...extra })),
     /** Lets everything that is under way go out. */
     settle: async () => {
       await made.trains.flush();
````

### Task 5: Plan 8B-4 T5: read-screenshot and Screenshot feedback as v2 messages

Prototype commit: `7e72ebb2c91c555de84f46848b7526379408f9f8`

screenshotMessage (SHOT_COLOUR) shows what was read beside the screenshot
as a thumbnail (the member's upload, or the kept file as an attachment),
the doubts in small print, then the decision, the question and the
feedback buttons inside. The line that says a screenshot waits is sent
as the answer will be (v2 for read-screenshot, plain for /raid). The shot
controls only reply with messages of their own, so nothing rewrites
these messages afterwards.

**Files:**

```
 src/commands/raids/raid-screenshot.test.ts       |  6 ++--
 src/commands/screenshots/feedback.ts             | 50 +++++++++++++++++-------------
 src/commands/screenshots/read-screenshot.test.ts | 73 ++++++++++++++++++++++++++++++-------------
 src/commands/screenshots/read-screenshot.ts      | 58 ++++++++++++++++++++++++----------
 src/render/screenshot-reading.test.ts            | 69 ++++++++++++++++++++++++++++++++++++++++-
 src/render/screenshot-reading.ts                 | 74 ++++++++++++++++++++++++++++++++++++++++++--
 6 files changed, 264 insertions(+), 66 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/raids/raid-screenshot.test.ts src/commands/screenshots/read-screenshot.test.ts src/render/screenshot-reading.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 7e72ebb2c91c555de84f46848b7526379408f9f8 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8B-4 T5: read-screenshot and Screenshot feedback as v2 messages`, the body above and the trailer, staging exactly
  `src/commands/raids/raid-screenshot.test.ts src/commands/screenshots/feedback.ts src/commands/screenshots/read-screenshot.test.ts src/commands/screenshots/read-screenshot.ts src/render/screenshot-reading.test.ts src/render/screenshot-reading.ts`.

````diff
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index a2e363b6ab0a044b6a8a18ddb5db1e42654f91a1..6c4c11a8ce19e33759f9cc95750980423f2f28b8 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -1,5 +1,6 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
+  asV2,
   fakeButton,
   fakeChatInput,
   fakeSelect,
@@ -8,6 +9,7 @@ import {
   type FakeOptions,
 } from '../../../test/support/fake-interactions.js';
 import { testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { textOf } from '../../../test/support/messages.js';
 import { at, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { gymsFixture } from '../../../test/support/providers.js';
@@ -131,7 +133,7 @@ describe('/raid with a screenshot', () => {
     );
     const shown = sent(pressed.editReply);
     expect(shown.files).toEqual([expect.objectContaining({ name: `${id}.png` })]);
-    expect(shown.content).toContain('**Gym:** read `Old Stone Fountain`');
+    expect(textOf(asV2(shown))).toContain('**Gym:** read `Old Stone Fountain`');
   });
 
   it('keeps the button on the copies of the post, and answers it once the raid is over', async () => {
@@ -153,7 +155,7 @@ describe('/raid with a screenshot', () => {
     // The reporter's own button still shows it for a while.
     const own = rowsOf(sent(used.editReply))[0]?.components[0]?.custom_id ?? '';
     const shown = await handle(fakeButton({ customId: own }));
-    expect(sent(shown.editReply).content).toContain('Is this what the screenshot shows?');
+    expect(textOf(asV2(sent(shown.editReply)))).toContain('Is this what the screenshot shows?');
   });
 
   it('shows no button for a screenshot that could not be kept, and still says the time is a guess', () => {
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index 73f77e26e722ee96282f822cf8f65a5f1950c55b..3d238c5e1aebda227902fad666be510bf54be2a9 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -4,6 +4,7 @@ import {
   MessageFlags,
   TextInputStyle,
   type APIActionRowComponent,
+  type APIButtonComponent,
   type APIComponentInMessageActionRow,
   type APIModalInteractionResponseCallbackData,
   type ButtonInteraction,
@@ -13,6 +14,7 @@ import type { ComponentHandler } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { requireGuild } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
 import {
@@ -22,9 +24,8 @@ import {
   type FeedbackElement,
   type StoredDecision,
 } from '../../domain/ocr/screenshot-record.js';
-import { readingLines, refusalWords } from '../../render/screenshot-reading.js';
+import { refusalWords, screenshotMessage } from '../../render/screenshot-reading.js';
 import { SCREENSHOT_FEEDBACK } from '../../render/party-controls.js';
-import { truncate } from '../../render/text.js';
 import { gymNamerOf } from './gym-question.js';
 import { cancelShot, chooseShotGym } from './mention.js';
 import { SHOT_KIND } from './shot-kind.js';
@@ -60,14 +61,16 @@ function shotButton(
 }
 
 /** "All right" and "Something is wrong" under what was read. */
+export function feedbackButtons(screenshotId: string): APIButtonComponent[] {
+  return [
+    shotButton(screenshotId, 'right', 'All right', ButtonStyle.Success),
+    shotButton(screenshotId, 'wrong', 'Something is wrong', ButtonStyle.Secondary),
+  ];
+}
+
+/** The same in a row of a plain-text message (the refusal of `/raid`). */
 export function feedbackRow(screenshotId: string): Row {
-  return {
-    type: ComponentType.ActionRow,
-    components: [
-      shotButton(screenshotId, 'right', 'All right', ButtonStyle.Success),
-      shotButton(screenshotId, 'wrong', 'Something is wrong', ButtonStyle.Secondary),
-    ],
-  };
+  return { type: ComponentType.ActionRow, components: feedbackButtons(screenshotId) };
 }
 
 /** The button of the reporter's private answer that shows the screenshot. */
@@ -126,9 +129,6 @@ export function decisionWords(decision: StoredDecision): string {
   }
 }
 
-/** A message's text stays within Discord's 2,000 characters. */
-const MESSAGE = 2_000;
-
 /**
  * Shows a member privately the kept screenshot itself (so they can read what Pine could not),
  * what was read and what Pine made of it, with "All right" and "Something is wrong". For the
@@ -143,23 +143,29 @@ export async function showScreenshot(
   const kept = await ctx.screenshots.get(screenshotId);
   // A screenshot of another server is none here: a custom id can be sent from anywhere.
   if (!kept || kept === 'gone' || kept.record.guildId !== interaction.guildId) {
+    // Plain: the deferral of a message that is still nothing becomes what it is answered with.
     await interaction.editReply({ content: GONE });
     return;
   }
   const { record } = kept;
-  const lines = [
-    ...readingLines(record.report, gymNamerOf(ctx)),
-    '',
-    decisionWords(record.decision),
-    record.file === null ? 'Is this what the picture shows?' : 'Is this what the screenshot shows?',
-  ];
+  const shown = kept.path === undefined || record.file === null ? undefined : record.file;
+  const message = screenshotMessage({
+    report: record.report,
+    gymName: gymNamerOf(ctx),
+    decision: decisionWords(record.decision),
+    question:
+      record.file === null
+        ? 'Is this what the picture shows?'
+        : 'Is this what the screenshot shows?',
+    picture: shown === undefined ? undefined : `attachment://${shown}`,
+    buttons: feedbackButtons(screenshotId),
+  });
   await interaction.editReply({
-    content: truncate(lines.join('\n'), MESSAGE),
+    ...v2Answer(message),
     files:
-      kept.path === undefined || record.file === null
+      shown === undefined || kept.path === undefined
         ? []
-        : [{ attachment: kept.path, name: record.file }],
-    components: [feedbackRow(screenshotId)],
+        : [{ attachment: kept.path, name: shown }],
   });
 }
 
diff --git a/src/commands/screenshots/read-screenshot.test.ts b/src/commands/screenshots/read-screenshot.test.ts
index 13c22e775e48d1cac58ada933140cdd21fddee4e..610d81d16df82577d02007c4f11fbf3b20d4652f 100644
--- a/src/commands/screenshots/read-screenshot.test.ts
+++ b/src/commands/screenshots/read-screenshot.test.ts
@@ -2,14 +2,19 @@ import { readFileSync, rmSync } from 'node:fs';
 import path from 'node:path';
 import { DateTime } from 'luxon';
 import { afterEach, describe, expect, it, vi } from 'vitest';
+import { MessageFlags } from 'discord.js';
 import {
+  asV2,
   fakeButton,
   fakeChatInput,
   fakeModal,
   sent,
   type FakeInteraction,
   type FakeOptions,
+  type SentPayload,
 } from '../../../test/support/fake-interactions.js';
+import { buttonsOf, textDisplays, textOf, thumbnailOf } from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
 import { eggReading, readingOf } from '../../../test/support/screenshots.js';
@@ -49,14 +54,20 @@ function setup() {
   return { ...made, ctx, handled, read, record };
 }
 
-/** The id of the screenshot whose buttons are under an answer. */
-function shownId(payload: { components?: readonly unknown[] }): string {
-  const row = payload.components?.[0] as { components: { custom_id: string }[] } | undefined;
-  const id = row?.components[0]?.custom_id.split(':')[1];
+/** The id of the screenshot whose buttons are in an answer (a components-v2 message). */
+function shownId(payload: SentPayload): string {
+  const id = buttonsOf(asV2(payload))[0]?.customId?.split(':')[1];
   if (!id) throw new Error('no buttons');
   return id;
 }
 
+/** What an answer says: the texts of a components-v2 one, the content of a plain one. */
+function said(payload: SentPayload): string {
+  return ((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0
+    ? (payload.content ?? '')
+    : textOf(asV2(payload));
+}
+
 afterEach(() => {
   vi.useRealTimers();
 });
@@ -76,18 +87,22 @@ describe('/read-screenshot', () => {
     );
     vi.useRealTimers();
     const answer = sent(used.editReply);
-    expect(answer.content).toContain('**Gym:** read `Old Stone Fountain` → **Old Stone Fountain**');
-    expect(answer.content).toContain('**Tier:** 5 heads → **T5**');
-    expect(answer.content).toContain('I report the raid as above');
+    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
+    const message = asV2(answer);
+    expectV2Sendable(message);
+    const [reading = '', ...rest] = textDisplays(message);
+    expect(reading).toContain('**Gym:** read `Old Stone Fountain` → **Old Stone Fountain**');
+    expect(reading).toContain('**Tier:** 5 heads → **T5**');
+    expect(reading).not.toContain('Not sure');
+    expect(rest.at(-1)).toBe(
+      'With a screenshot like this, I report the raid as above.\nDid I read it right?',
+    );
+    // The member's own upload stands beside what was read of it.
+    expect(thumbnailOf(message)).toMatch(/^https:\/\//u);
     const id = shownId(answer);
-    expect(answer.components).toEqual([
-      {
-        type: 1,
-        components: [
-          expect.objectContaining({ custom_id: `shot:${id}:right`, label: 'All right' }),
-          expect.objectContaining({ custom_id: `shot:${id}:wrong`, label: 'Something is wrong' }),
-        ],
-      },
+    expect(buttonsOf(message).map(({ customId, label }) => [customId, label])).toEqual([
+      [`shot:${id}:right`, 'All right'],
+      [`shot:${id}:wrong`, 'Something is wrong'],
     ]);
     expect(files('held')).toContain(`${id}.json`);
   });
@@ -97,7 +112,10 @@ describe('/read-screenshot', () => {
     const busy = await read('busy.png', { kind: 'busy' });
     expect(sent(busy.followUp).content).toMatch(/many screenshots/);
     const cat = await read('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
-    expect(sent(cat.editReply).content).toContain('does not look like the screen of a raid');
+    const refused = asV2(sent(cat.editReply));
+    expect(textOf(refused)).toContain('does not look like the screen of a raid');
+    // What it was not sure of stands apart, in small print.
+    expect(textDisplays(refused)[1]).toMatch(/^-# Not sure: /u);
   });
 
   it('records "All right" and "Something is wrong" with its form, one per member', async () => {
@@ -173,8 +191,9 @@ describe('/read-screenshot', () => {
     const id = shownId(sent(cat.editReply));
     const show = await handled(fakeButton({ customId: `shot:${id}:show` }));
     const answer = sent(show.editReply);
-    expect(answer.content).toContain('does not look like the screen of a raid');
+    expect(said(answer)).toContain('does not look like the screen of a raid');
     expect(answer.files).toEqual([]);
+    expect(thumbnailOf(asV2(answer))).toBeUndefined();
   });
 
   it('gives up a screenshot whose turn would come too late to answer', async () => {
@@ -188,13 +207,23 @@ describe('/read-screenshot', () => {
     const { read, reader } = setup();
     reader.ahead = 2;
     const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
-    const edits = used.editReply.mock.calls.map(
-      (call) => (call[0] as { content?: string }).content,
-    );
+    const edits = used.editReply.mock.calls.map((call) => said(call[0]));
     expect(edits[0]).toMatch(/2 screenshots are ahead of yours/);
+    // As the answer will be: a components-v2 message, which the answer edits.
+    expect(sent(used.editReply).flags).toBe(MessageFlags.IsComponentsV2);
     expect(edits.at(-1)).toContain('**Gym:**');
   });
 
+  it('turns the line that it waits into the refusal when the screenshot could not be read', async () => {
+    const { read, reader } = setup();
+    reader.ahead = 2;
+    const used = await read('broken.png', { kind: 'failed' });
+    const last = sent(used.editReply, used.editReply.mock.calls.length - 1);
+    expect(last.flags).toBe(MessageFlags.IsComponentsV2);
+    expect(said(last)).toMatch(/^Reading that screenshot went wrong/);
+    expect(used.followUp).not.toHaveBeenCalled();
+  });
+
   it('answers feedback on a screenshot that is no longer kept', async () => {
     const { handled } = setup();
     const right = await handled(fakeButton({ customId: 'shot:AAAAAAAAAAAA:right' }));
@@ -209,8 +238,10 @@ describe('/read-screenshot', () => {
     const id = shownId(sent(used.editReply));
     const show = await handled(fakeButton({ customId: `shot:${id}:show`, userId: OTHER }));
     const answer = sent(show.editReply);
-    expect(answer.content).toContain('Is this what the screenshot shows?');
+    expect(said(answer)).toContain('Is this what the screenshot shows?');
     expect(answer.files).toEqual([expect.objectContaining({ name: `${id}.png` })]);
+    expect(thumbnailOf(asV2(answer))).toBe(`attachment://${id}.png`);
+    expectV2Sendable(asV2(answer));
     expect(shownId(answer)).toBe(id);
   });
 
diff --git a/src/commands/screenshots/read-screenshot.ts b/src/commands/screenshots/read-screenshot.ts
index f13165bf9a9339f24727c0a7e718b0cf6d46c501..57335b52d600b90ecd7cf46f3f578f2eb2eecdb4 100644
--- a/src/commands/screenshots/read-screenshot.ts
+++ b/src/commands/screenshots/read-screenshot.ts
@@ -1,22 +1,21 @@
 import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
+import { v2Answer } from '../../discord/late-reply.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { storedReport } from '../../domain/ocr/screenshot-record.js';
-import { readingLines } from '../../render/screenshot-reading.js';
-import { truncate } from '../../render/text.js';
+import { screenshotMessage, SHOT_COLOUR } from '../../render/screenshot-reading.js';
+import { textMessage } from '../../render/v2.js';
 import {
   unreadWords,
   type ScreenshotOutcome,
   type ScreenshotSource,
   type ScreenshotWhere,
 } from '../../services/screenshot-service.js';
-import { decisionWords, feedbackRow } from './feedback.js';
+import { decisionWords, feedbackButtons } from './feedback.js';
 import { gymNamerOf } from './gym-question.js';
 
-/** A message's text stays within Discord's 2,000 characters. */
-const MESSAGE = 2_000;
 /**
  * A screenshot whose turn in the reader comes later than this after its interaction is given up
  * as busy: the reading and the answer must fit into the fifteen minutes Discord allows.
@@ -40,18 +39,27 @@ export async function readAttached(
   ctx: AppContext,
   source: ScreenshotSource,
   more: Pick<ScreenshotWhere, 'use'> & Partial<Pick<ScreenshotWhere, 'typed'>>,
+  waitAs: WaitAs = 'plain',
 ): Promise<Extract<ScreenshotOutcome, { kind: 'read' }>> {
-  const outcome = await readAttachedOutcome(interaction, ctx, source, more);
+  const outcome = await readAttachedOutcome(interaction, ctx, source, more, waitAs);
   if (outcome.kind !== 'read') throw new UserError(unreadWords(outcome));
   return outcome;
 }
 
+/**
+ * How the line that says a screenshot waits is sent: as the answer will be, since an answer
+ * that was plain text does not become a components-v2 message (`/raid` answers plain, `/read-
+ * screenshot` v2).
+ */
+export type WaitAs = 'plain' | 'v2';
+
 /** `readAttached`, answering a screenshot that could not be read at all rather than throwing. */
 export async function readAttachedOutcome(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
   source: ScreenshotSource,
   more: Pick<ScreenshotWhere, 'use'> & Partial<Pick<ScreenshotWhere, 'typed'>>,
+  waitAs: WaitAs = 'plain',
 ): Promise<ScreenshotOutcome> {
   const guildId = guildIdOf(interaction);
   const guildRow = await ctx.guilds.idFor(guildId);
@@ -67,7 +75,10 @@ export async function readAttachedOutcome(
     // Read later than this, the interaction could no longer be answered (fifteen minutes).
     startBy: interaction.createdTimestamp + START_BY_MS,
     onQueued: (ahead) => {
-      waiting = interaction.editReply({ content: waitingWords(ahead) }).catch((err: unknown) => {
+      const words = waitingWords(ahead);
+      const line =
+        waitAs === 'v2' ? v2Answer(textMessage(SHOT_COLOUR, [words])) : { content: words };
+      waiting = interaction.editReply(line).catch((err: unknown) => {
         ctx.log.warn({ err }, 'could not say that a screenshot waits');
       });
     },
@@ -104,22 +115,35 @@ export const readScreenshot: SimpleCommand = {
 
   async execute(interaction, ctx) {
     const attachment = interaction.options.getAttachment('screenshot', true);
-    const outcome = await readAttached(interaction, ctx, attachment, { use: 'read-screenshot' });
+    const outcome = await readAttachedOutcome(
+      interaction,
+      ctx,
+      attachment,
+      { use: 'read-screenshot' },
+      'v2',
+    );
+    if (outcome.kind !== 'read') {
+      // The line that said it waits stands as the answer: it becomes the refusal, in kind (a
+      // v2 message does not become plain text again). Without it the refusal goes as usual.
+      if (!interaction.replied) throw new UserError(unreadWords(outcome));
+      await interaction.editReply(v2Answer(textMessage(SHOT_COLOUR, [unreadWords(outcome)])));
+      return;
+    }
     const decision =
       outcome.decision.kind === 'report'
         ? { kind: 'report' as const }
         : outcome.decision.kind === 'ask'
           ? { kind: 'ask' as const, doubts: outcome.decision.doubts }
           : outcome.decision;
-    const lines = [
-      ...readingLines(storedReport(outcome.report), gymNamerOf(ctx)),
-      '',
-      decisionWords(decision),
-      ...(outcome.id === undefined ? [] : ['Did I read it right?']),
-    ];
-    await interaction.editReply({
-      content: truncate(lines.join('\n'), MESSAGE),
-      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
+    const message = screenshotMessage({
+      report: storedReport(outcome.report),
+      gymName: gymNamerOf(ctx),
+      decision: decisionWords(decision),
+      question: outcome.id === undefined ? undefined : 'Did I read it right?',
+      // The member's own upload, beside what was read of it.
+      picture: attachment.url.startsWith('https://') ? attachment.url : undefined,
+      buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id),
     });
+    await interaction.editReply(v2Answer(message));
   },
 };
diff --git a/src/render/screenshot-reading.test.ts b/src/render/screenshot-reading.test.ts
index 0291a2f53713b11bf6cf3a90bc1c7354093a7b8a..53d44ee12d3383f6672428b5ea6f679e0605d5a8 100644
--- a/src/render/screenshot-reading.test.ts
+++ b/src/render/screenshot-reading.test.ts
@@ -1,6 +1,15 @@
 import { describe, expect, it } from 'vitest';
 import type { StoredReport } from '../domain/ocr/screenshot-record.js';
-import { doubtWords, readingLines, refusalWords, shortReading } from './screenshot-reading.js';
+import { accentOf, textDisplays, thumbnailOf } from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import {
+  doubtWords,
+  readingLines,
+  refusalWords,
+  screenshotMessage,
+  shortReading,
+  SHOT_COLOUR,
+} from './screenshot-reading.js';
 
 const NAMES: Record<number, string> = { 7: 'Heinz *Plant*' };
 const gymName = (id: number) => NAMES[id];
@@ -105,3 +114,61 @@ describe('shortReading', () => {
     expect(refusalWords('raid-over')).toBe('By its countdown this raid has already ended.');
   });
 });
+
+describe('screenshotMessage', () => {
+  it('shows what was read beside the screenshot, the doubts in small print, then the question', () => {
+    const message = screenshotMessage({
+      report: report({ doubts: ['time-guessed', 'heads-only'] }),
+      gymName,
+      decision: 'With a screenshot like this, I report the raid as above.',
+      question: 'Did I read it right?',
+      picture: 'attachment://abc.png',
+    });
+    expect(accentOf(message)).toBe(SHOT_COLOUR);
+    expect(thumbnailOf(message)).toBe('attachment://abc.png');
+    const [read = '', doubts, last] = textDisplays(message);
+    expect(read.split('\n')[0]).toBe("**Gym:** read `Heinz Plant'x` → **Heinz \\*Plant\\***");
+    expect(read).not.toContain('Not sure');
+    expect(doubts).toMatch(/^-# Not sure: The time is a guess .* The tier comes from the heads/u);
+    expect(last).toBe(
+      'With a screenshot like this, I report the raid as above.\nDid I read it right?',
+    );
+    expectV2Sendable({ ...message, files: ['held/abc.png'] });
+  });
+
+  it('stays within a message with every doubt and long texts, and without a picture', () => {
+    const message = screenshotMessage({
+      report: report({
+        gym: { read: 'x'.repeat(500), searched: 'x', gymId: 7, place: 'local', clear: false },
+        bossName: 'y'.repeat(500),
+        doubts: [
+          'not-a-raid-screen',
+          'no-gym',
+          'gym-unclear',
+          'no-time',
+          'time-guessed',
+          'time-stale',
+          'time-sources-differ',
+          'time-past',
+          'countdown-long',
+          'stage-unknown',
+          'tier-unknown',
+          'heads-unverified',
+          'heads-only',
+          'heads-uncertain',
+          'heads-boss-conflict',
+          'boss-unknown',
+          'boss-from-name',
+          'boss-name-differs',
+          'elite',
+          'shadow-unlisted',
+          'shadow-differs',
+        ],
+      }),
+      gymName: () => 'z'.repeat(300),
+      decision: 'This does not look like the screen of a raid, so I made nothing of it.',
+    });
+    expect(thumbnailOf(message)).toBeUndefined();
+    expectV2Sendable(message);
+  });
+});
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index f9d0172073dccdde9aa2062c1e67cec545018db0..0fe04b40f6363380c46e8c422a3c1e2b52930d75 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -1,7 +1,10 @@
+import type { APIButtonComponent } from 'discord.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import { clockText, countdownText, type StoredReport } from '../domain/ocr/screenshot-record.js';
 import type { ReportDoubt } from '../domain/ocr/screenshot-report.js';
 import { raidTierLabel } from '../domain/pogo/raid-tier.js';
 import { plain, timestamp, truncate } from './text.js';
+import { actionRow, container, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /**
  * What a screenshot showed Pine, in words: for `/read-screenshot`, the question of `/raid`, the
@@ -105,8 +108,15 @@ function bossLine(report: StoredReport): string {
   return `**Boss:** ${cp}, name read ${quoted(report.bossName)} → ${understood}`;
 }
 
-/** Every element, raw and as understood, and what was not sure. */
-export function readingLines(report: StoredReport, gymName: GymNamer): string[] {
+/**
+ * Every element, raw and as understood, and what was not sure (`doubts: false` leaves that out,
+ * for a message that says it apart: `screenshotMessage`).
+ */
+export function readingLines(
+  report: StoredReport,
+  gymName: GymNamer,
+  options: { doubts?: boolean } = {},
+): string[] {
   const lines = [
     gymLine(report, gymName),
     timeLine(report),
@@ -115,11 +125,69 @@ export function readingLines(report: StoredReport, gymName: GymNamer): string[]
   ];
   if (report.stage !== 'egg') lines.push(bossLine(report));
   lines.push(`**Shadow purple:** ${(report.purple * 100).toFixed(1)}% of the screen`);
-  if (report.doubts.length > 0)
+  if (report.doubts.length > 0 && options.doubts !== false)
     lines.push('', 'Not sure:', ...doubtLines(report.doubts, report.clock));
   return lines;
 }
 
+/** The colour of what is said about a screenshot (`/read-screenshot`, Screenshot feedback). */
+export const SHOT_COLOUR = 0xf1c40f;
+
+/**
+ * How much room the reading and the doubts of a screenshot take at most: with the decision and
+ * the question well within the 4,000 characters of a components-v2 message.
+ */
+const READING_ROOM = 1_800;
+const DOUBTS_ROOM = 1_200;
+
+/** What a message about a screenshot shows (`screenshotMessage`). */
+export interface ScreenshotView {
+  report: StoredReport;
+  gymName: GymNamer;
+  /** What Pine did, or would do, with it (`decisionWords`). */
+  decision: string;
+  /** The question under it ("Did I read it right?"); none when nothing can be answered. */
+  question?: string | undefined;
+  /** The screenshot beside what was read: an https address or `attachment://<file>`. */
+  picture?: string | undefined;
+  /** "All right" and "Something is wrong". */
+  buttons?: readonly APIButtonComponent[] | undefined;
+}
+
+/**
+ * What a screenshot showed Pine as a components-v2 message (`/read-screenshot`, Screenshot
+ * feedback; plan 8B-4): one container of `SHOT_COLOUR`, what was read beside the screenshot
+ * itself (a plain text without a picture), the doubts in small print, a line, what Pine does
+ * with such a screenshot and the question, and the buttons inside.
+ */
+export function screenshotMessage(view: ScreenshotView): V2Message {
+  const { report } = view;
+  const read = truncate(
+    readingLines(report, view.gymName, { doubts: false }).join('\n'),
+    READING_ROOM,
+  );
+  const doubts =
+    report.doubts.length === 0
+      ? undefined
+      : truncate(
+          `-# Not sure: ${report.doubts.map((doubt) => doubtWords(doubt, report.clock)).join(' ')}`,
+          DOUBTS_ROOM,
+        );
+  const buttons = view.buttons ?? [];
+  return {
+    v2: true,
+    components: [
+      container(SHOT_COLOUR, [
+        view.picture === undefined ? textDisplay(read) : section(read, thumbnail(view.picture)),
+        ...(doubts === undefined ? [] : [textDisplay(doubts)]),
+        separator(),
+        textDisplay([view.decision, view.question].filter(Boolean).join('\n')),
+        ...(buttons.length === 0 ? [] : [actionRow([...buttons])]),
+      ]),
+    ],
+  };
+}
+
 /**
  * What the screenshot shows, in one line: `T5 egg at Heinz Plant, hatching at 13:49`. Without the
  * gym (`gym: false`) when the gym is what is asked about; a raid whose stage was not told is a
````

### Task 6: Plan 8B-4 T6: the menus of /iam as one v2 container

Prototype commit: `b680c6bc86be65c5a20d7e78e165ec034881ce41`

renderRoleMenus makes one LIST_COLOUR container: the heading and its line
of help, each menu under its name and rule, Page n of m with Previous and
Next, and what the last change did in small print. A press reads the
menu from inside the container (or from the rows of a message from
before), and the message is always made anew from the roster and the
roles the member holds, never copied; a press on a plain-text message
of menus is carried out, closes it with a line and sends the new menus
privately below it.

**Files:**

```
 src/commands/roles/menus.test.ts | 183 ++++++++++++++++++++++++++++++++++++++++++-----------------
 src/commands/roles/menus.ts      | 136 ++++++++++++++++++++++++++++++--------------
 src/render/role-menus.test.ts    |  59 ++++++++++---------
 src/render/role-menus.ts         | 130 +++++++++++++++++++++---------------------
 test/support/roles.ts            |  75 ++++++++++++++++++------
 5 files changed, 375 insertions(+), 208 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/roles/menus.test.ts src/render/role-menus.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff b680c6bc86be65c5a20d7e78e165ec034881ce41 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8B-4 T6: the menus of /iam as one v2 container`, the body above and the trailer, staging exactly
  `src/commands/roles/menus.test.ts src/commands/roles/menus.ts src/render/role-menus.test.ts src/render/role-menus.ts test/support/roles.ts`.

````diff
diff --git a/src/commands/roles/menus.test.ts b/src/commands/roles/menus.test.ts
index 056cf3fefca57253ba4e67e7846398822983ae99..ab5c2763cf09033f78d8fda790229d45ffa0d485 100644
--- a/src/commands/roles/menus.test.ts
+++ b/src/commands/roles/menus.test.ts
@@ -18,6 +18,7 @@ import {
   buttonsOf,
   FakeRoleGateway,
   menusOf,
+  textOfMenus,
   ROLE,
   selfRolesWith,
 } from '../../../test/support/roles.js';
@@ -28,7 +29,7 @@ import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
 import { menuRequest, NONE_VALUE } from '../../domain/roles/menus.js';
 import { iam, iamnot } from './iam.js';
-import { roleControls } from './menus.js';
+import { OLD_MENUS, roleControls } from './menus.js';
 
 const ELSEWHERE = '499999999999999999';
 /** What a member reads when Discord refuses a role for lack of a permission. */
@@ -53,7 +54,7 @@ async function setup(kept: { storage?: MemorySelfRoles; gateway?: FakeRoleGatewa
   const shownBy = (payload: SentPayload): Shown => {
     assertSendable(payload);
     return {
-      content: payload.content ?? '',
+      content: textOfMenus(payload),
       message: fakeMessage((payload.components ?? []) as FakeRow[], undefined, payload.content),
     };
   };
@@ -104,7 +105,8 @@ async function setup(kept: { storage?: MemorySelfRoles; gateway?: FakeRoleGatewa
   };
   const held = () => made.server.heldNames(ALICE);
   /** The last line of a message: what the change did. */
-  const note = (shown: Shown | undefined) => shown?.content.split('\n').at(-1);
+  const note = (shown: Shown | undefined) =>
+    shown?.content.split('\n').at(-1)?.replace(/^-# /u, '');
   const ticked = (shown: Shown | undefined) =>
     menusOf({ components: shown?.message.rows ?? [] }).map((menu) =>
       menu.options.filter((option) => option.default === true).map((option) => option.label),
@@ -127,13 +129,19 @@ describe('/iam without a role', () => {
     server.member(ALICE, ROLE.north, ROLE.valor, ROLE.moderator);
     const interaction = fakeChatInput({ commandName: 'iam', ...server.interactionOf(ALICE) });
     await router.handle(interaction as never);
-    expect(sent(interaction.reply).flags).toBe(MessageFlags.Ephemeral);
+    expect(sent(interaction.reply).flags).toBe(
+      MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+    );
     expect(interaction.deferReply).not.toHaveBeenCalled();
     const shown = await open();
-    expect(shown.content.split('\n').slice(1)).toEqual([
-      '1. Regions · any number',
-      '2. Teams · pick one',
-      '3. Other · any number',
+    expect(shown.content.split('\n').slice(0, 2)).toEqual([
+      '### Your roles on this server',
+      'Tick and untick them in the menus; a menu takes effect as soon as you close it.',
+    ]);
+    expect(shown.content.split('\n').slice(2)).toEqual([
+      '**Regions** · pick any number',
+      '**Teams** · pick one',
+      '**Other** · pick any number',
     ]);
     expect(ticked(shown)).toEqual([['North'], ['Valor'], []]);
   });
@@ -145,11 +153,12 @@ describe('/iam without a role', () => {
     const router = new InteractionRouter(ctx, [iam], [roleControls]);
     const interaction = fakeChatInput({ commandName: 'iam', ...made.server.interactionOf(ALICE) });
     await router.handle(interaction as never);
-    expect(answered(interaction)).toEqual({
-      flags: MessageFlags.Ephemeral,
-      content: 'This server has no roles you can give yourself at the moment.',
-      components: [],
-    });
+    const answer = answered(interaction);
+    expect(answer.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    expect(textOfMenus(answer)).toBe(
+      'This server has no roles you can give yourself at the moment.',
+    );
+    expect(menusOf(answer)).toEqual([]);
   });
 
   it('says what is wrong when roles are offered but none can be given', async () => {
@@ -168,7 +177,7 @@ describe('/iam without a role', () => {
       "None of this server's self-assignable roles can be given at the moment. A moderator " +
         'can see why with `/admin self-roles list`.',
     );
-    expect(shown.message.rows).toEqual([]);
+    expect(menusOf({ components: shown.message.rows })).toEqual([]);
   });
 
   it('says so when the roles of the server are not known', async () => {
@@ -395,23 +404,23 @@ describe('changing a menu', () => {
     expect(held()).toEqual([]);
   });
 
-  it('puts the menus back as they were when the roles of the server are not known', async () => {
+  it('says so, without menus, when the roles of the server are not known', async () => {
     const { server, open, pick, ticked } = await setup();
     server.member(ALICE, ROLE.south);
     const shown = await open();
     const { interaction, after } = await pick(shown, 0, [ROLE.north], { guildId: ELSEWHERE });
-    // The message keeps its own text, and what happened is said below it.
+    // Menus are drawn from the roles of the server: without them there are none to show, and
+    // the ticks of the press do not stand.
     expect(after?.content).toBe(
-      `${shown.content}\nI cannot see the roles of this server at the moment. Try again in a ` +
-        'minute. Nothing was changed.',
+      'I cannot see the roles of this server at the moment. Try again in a minute. Nothing was ' +
+        'changed. Use `/iam` again for the menus.',
     );
-    // The tick of the press does not stand: the message shows what it showed before.
-    expect(ticked(after)).toEqual([['South'], ['None'], []]);
+    expect(ticked(after)).toEqual([]);
     expect(interaction.followUp).not.toHaveBeenCalled();
   });
 
   it('puts the menus back as they were for a member whose earlier changes are still under way', async () => {
-    const { server, gateway, selfRoles, open, pick, held, ticked } = await setup();
+    const { server, gateway, selfRoles, open, pick, held, ticked, note } = await setup();
     server.member(ALICE, ROLE.south);
     const shown = await open();
     let release = (): void => undefined;
@@ -421,7 +430,7 @@ describe('changing a menu', () => {
       selfRoles.change(FAKE_GUILD_ID, seen, { give: [roleId], take: [] }),
     );
     const { after } = await pick(shown, 1, [ROLE.mystic]);
-    expect(after?.content.split('\n').at(-1)).toBe(
+    expect(note(after)).toBe(
       'I am still working on your earlier changes. Try again in a moment. Nothing was changed.',
     );
     expect(ticked(after)).toEqual([['South'], ['None'], []]);
@@ -452,15 +461,16 @@ describe('changing a menu', () => {
   });
 
   it('puts the menus back as they were when the change fails before anything was done', async () => {
-    const { server, gateway, open, pick, held, ticked, entries } = await setup();
+    const { server, gateway, open, pick, held, ticked, entries, note } = await setup();
     server.member(ALICE, ROLE.south);
     gateway.failing = new Error('Discord is away');
     const shown = await open();
     const { interaction, after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
-    // The tick of the press does not stand: the message shows what it showed before, with its
-    // own text. A request that timed out may have arrived: it does not say that nothing changed.
+    // The tick of the press does not stand: the menus are made anew as the roles are. A
+    // request that timed out may have arrived: it does not say that nothing changed.
     expect(interaction.editReply).toHaveBeenCalledTimes(1);
-    expect(after?.content).toBe(`${shown.content}\nI could not make the change.`);
+    expect(after?.content).toBe(`${shown.content}\n-# I could not make the change.`);
+    expect(note(after)).toBe('I could not make the change.');
     expect(ticked(after)).toEqual([['South'], ['None'], []]);
     expect(held()).toEqual(['South']);
     // and the member is told as for any failure, with the reference of the log line.
@@ -472,26 +482,93 @@ describe('changing a menu', () => {
     });
   });
 
-  it('keeps what the message said before when it is put back, and says a thing once', async () => {
-    const { server, gateway, open, pick, note } = await setup();
+  it('says what the last press did, never copying what the message said before', async () => {
+    const { server, gateway, open, pick, note, ticked } = await setup();
     server.member(ALICE);
     const first = await pick(await open(), 0, [ROLE.north]);
     expect(note(first.after)).toBe('Added **North**.');
     gateway.failing = new Error('Discord is away');
     if (!first.after) throw new Error('nothing was shown');
     const second = await pick(first.after, 0, [ROLE.north, ROLE.south]);
-    expect(second.after?.content).toBe(`${first.after.content}\nI could not make the change.`);
+    expect(note(second.after)).toBe('I could not make the change.');
+    expect(second.after?.content).not.toContain('Added **North**.');
+    expect(ticked(second.after)).toEqual([['North'], ['None'], []]);
     if (!second.after) throw new Error('nothing was shown');
     const third = await pick(second.after, 0, [ROLE.north, ROLE.south]);
     expect(third.after?.content).toBe(second.after.content);
-    // A text that is as long as a message may be keeps its end: the sentence.
-    const long = {
-      ...second.after,
-      message: { ...second.after.message, content: 'x'.repeat(2000) },
-    };
-    const fourth = await pick(long, 0, [ROLE.north, ROLE.south]);
-    expect(fourth.after?.content).toHaveLength(2000);
-    expect(fourth.after?.content.endsWith('\nI could not make the change.')).toBe(true);
+  });
+
+  it('turns the pages of a plain-text message of menus from before below it', async () => {
+    const { open, press } = await manyGroups();
+    const shown = await open();
+    const rows = [
+      ...menusOf({ components: shown.message.rows }).map((menu) => ({
+        type: 1,
+        components: [{ type: 3, ...menu }],
+      })),
+      { type: 1, components: buttonsOf({ components: shown.message.rows }) },
+    ] as unknown as FakeRow[];
+    const old = { content: 'Your roles', message: fakeMessage(rows, undefined, 'Your roles') };
+    const { interaction } = await press(old, 'Next');
+    expect(sent(interaction.editReply)).toMatchObject({ content: OLD_MENUS, components: [] });
+    expect(textOfMenus(sent(interaction.followUp))).toContain('Page 2 of 2');
+  });
+
+  it('says a failure and a busy member below a plain-text message of menus from before', async () => {
+    const { server, gateway, selfRoles, open, pick } = await setup();
+    server.member(ALICE, ROLE.south);
+    const shown = await open();
+    const rows = menusOf({ components: shown.message.rows }).map((menu) => ({
+      type: 1,
+      components: [{ type: 3, ...menu }],
+    })) as unknown as FakeRow[];
+    const old = () => ({
+      content: 'Your roles',
+      message: fakeMessage(rows, undefined, 'Your roles'),
+    });
+    gateway.failing = new Error('Discord is away');
+    const failed = await pick(old(), 0, [ROLE.north, ROLE.south]);
+    expect(sent(failed.interaction.editReply)).toMatchObject({ content: OLD_MENUS });
+    expect(textOfMenus(sent(failed.interaction.followUp)).split('\n').at(-1)).toBe(
+      '-# I could not make the change.',
+    );
+    gateway.failing = undefined;
+    let release = (): void => undefined;
+    gateway.holding = new Promise<void>((resolve) => (release = resolve));
+    const seen = server.seen(ALICE);
+    const three = [ROLE.north, ROLE.east, ROLE.trader].map((roleId) =>
+      selfRoles.change(FAKE_GUILD_ID, seen, { give: [roleId], take: [] }),
+    );
+    const busy = await pick(old(), 1, [ROLE.mystic]);
+    expect(sent(busy.interaction.editReply)).toMatchObject({ content: OLD_MENUS });
+    expect(textOfMenus(sent(busy.interaction.followUp))).toContain(
+      'I am still working on your earlier changes.',
+    );
+    release();
+    await Promise.all(three);
+  });
+
+  it('carries a change out from a plain-text message of menus from before, and shows new ones below', async () => {
+    const { server, open, pick, held } = await setup();
+    server.member(ALICE);
+    const shown = await open();
+    // The same menus as rows at the top of a message without the components-v2 flag.
+    const rows = menusOf({ components: shown.message.rows }).map((menu) => ({
+      type: 1,
+      components: [{ type: 3, ...menu }],
+    })) as unknown as FakeRow[];
+    const old = { content: 'Your roles', message: fakeMessage(rows, undefined, 'Your roles') };
+    const { interaction } = await pick(old, 0, [ROLE.north]);
+    expect(held()).toEqual(['North']);
+    expect(sent(interaction.editReply)).toEqual({
+      content: OLD_MENUS,
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    const below = sent(interaction.followUp);
+    expect(below.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    expect(textOfMenus(below).split('\n').at(-1)).toBe('-# Added **North**.');
   });
 
   it('still reports the failure when the menus cannot be put back either', async () => {
@@ -820,27 +897,27 @@ describe('pages of menus', () => {
     const { open, press, pick, note, held } = await manyGroups();
     // Regions, Teams, Hobbies, Leagues (two parts), Pings, Times, Other: eight menus.
     const first = await open();
-    expect(first.content.split('\n').slice(1)).toEqual([
-      '1. Regions · any number',
-      '2. Teams · pick one',
-      '3. Hobbies · any number',
-      '4. Leagues: Leagues 00 – Leagues 14 · pick one',
+    expect(first.content.split('\n').slice(2)).toEqual([
+      '**Regions** · pick any number',
+      '**Teams** · pick one',
+      '**Hobbies** · pick any number',
+      '**Leagues: Leagues 00 – Leagues 14** · pick one',
       'Page 1 of 2',
     ]);
     const { interaction: turned, after: second } = await press(first, 'Next');
     // A page is read from the database: the press is acknowledged before that.
     expect(turned.deferUpdate).toHaveBeenCalledTimes(1);
     expect(turned.update).not.toHaveBeenCalled();
-    expect(second?.content.split('\n').slice(1)).toEqual([
-      '1. Leagues: Leagues 15 – Leagues 29 · pick one',
-      '2. Pings · any number',
-      '3. Times · any number',
-      '4. Other · any number',
+    expect(second?.content.split('\n').slice(2)).toEqual([
+      '**Leagues: Leagues 15 – Leagues 29** · pick one',
+      '**Pings** · pick any number',
+      '**Times** · pick any number',
+      '**Other** · pick any number',
       'Page 2 of 2',
     ]);
     if (!second) throw new Error('no second page');
     const { after: changed } = await pick(second, 3, [ROLE.trader]);
-    expect(changed?.content.split('\n').slice(-2)).toEqual(['Page 2 of 2', 'Added **Trader**.']);
+    expect(changed?.content.split('\n').slice(-2)).toEqual(['Page 2 of 2', '-# Added **Trader**.']);
     expect(held()).toEqual(['Trader']);
     const { after: back } = await press(changed ?? second, 'Previous');
     expect(note(back)).toBe('Page 1 of 2');
@@ -857,7 +934,7 @@ describe('pages of menus', () => {
     const { after: second } = await press(first, 'Next');
     if (!second) throw new Error('no second page');
     const { after: picked } = await pick(second, 0, [late]);
-    expect(picked?.content.split('\n').at(-1)).toBe(
+    expect(note(picked)).toBe(
       'Added **Leagues 29**; removed **Leagues 00**. Only one role of the group Leagues can ' +
         'be held at a time.',
     );
@@ -882,10 +959,10 @@ describe('pages of menus', () => {
       }
     }
     const { after } = await press(second, 'Next');
-    expect(after?.content.split('\n').slice(1)).toEqual([
-      '1. Regions · any number',
-      '2. Teams · pick one',
-      '3. Other · any number',
+    expect(after?.content.split('\n').slice(2)).toEqual([
+      '**Regions** · pick any number',
+      '**Teams** · pick one',
+      '**Other** · pick any number',
     ]);
   });
 });
diff --git a/src/commands/roles/menus.ts b/src/commands/roles/menus.ts
index 8260d611e7875100e41c29940c53271e0b8ce94f..0d22b256fc480d5f0eb083bb35dad2cbbf28c14f 100644
--- a/src/commands/roles/menus.ts
+++ b/src/commands/roles/menus.ts
@@ -1,5 +1,6 @@
 import {
   ComponentType,
+  type ButtonInteraction,
   type ChatInputCommandInteraction,
   type StringSelectMenuInteraction,
 } from 'discord.js';
@@ -25,7 +26,9 @@ import {
   renderRoleMenus,
   ROLES_KIND,
 } from '../../render/role-menus.js';
-import { fitItems, LIMITS, plain, truncate } from '../../render/text.js';
+import { fitItems, plain } from '../../render/text.js';
+import { LIST_COLOUR, textMessage } from '../../render/v2.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import type { RoleChangeOutcome } from '../../services/self-role-service.js';
 import {
   actingRoleMember,
@@ -36,7 +39,7 @@ import {
   STILL_WORKING,
 } from './shared.js';
 import { failureSentences, memberProblem } from './words.js';
-import { answer } from '../../discord/late-reply.js';
+import { answer, showInPlace, v2Answer } from '../../discord/late-reply.js';
 
 /** `/iam` without a role: the private message with the menus, the member's roles ticked. */
 export async function showRoleMenus(
@@ -49,10 +52,49 @@ export async function showRoleMenus(
   if (!roster) throw new UserError(ROLES_UNAVAILABLE);
   await answer(
     interaction,
-    renderRoleMenus(roster, new Set(ctx.selfRoles.heldNow(guildId, member)), 0),
+    v2Answer(renderRoleMenus(roster, new Set(ctx.selfRoles.heldNow(guildId, member)), 0)),
   );
 }
 
+/** What a press says that could not draw the menus again. */
+const MENUS_AGAIN = 'Use `/iam` again for the menus.';
+
+/** What an old message of menus says once the new menus follow below it. */
+export const OLD_MENUS = 'These menus were replaced by the ones below.';
+
+/**
+ * Shows the menus in the place of the message that was pressed (acknowledged with
+ * `deferUpdate`). A message of menus from before plan 8B-4 is plain text with rows: it is not
+ * made a components-v2 message in place (whether Discord takes that is not known); it is
+ * closed with `OLD_MENUS` and the menus follow privately below it.
+ */
+function showMenus(
+  interaction: StringSelectMenuInteraction | ButtonInteraction,
+  message: V2Message,
+): Promise<void> {
+  return showInPlace(interaction, message, OLD_MENUS);
+}
+
+/**
+ * The menus made anew from the roster and the roles the member holds now, with `note` at the
+ * end; only the note when the roster cannot be read.
+ */
+async function menusNow(
+  ctx: AppContext,
+  guildId: string,
+  member: ReturnType<typeof actingRoleMember>,
+  page: number,
+  note: string,
+): Promise<V2Message> {
+  const roster = await ctx.selfRoles.roster(guildId).catch((err: unknown) => {
+    ctx.log.warn({ err }, 'could not read the self-assignable roles again');
+    return undefined;
+  });
+  // Without the roster there are no menus to draw: the member is told how to get them back.
+  if (!roster) return textMessage(LIST_COLOUR, [`${note} ${MENUS_AGAIN}`]);
+  return renderRoleMenus(roster, new Set(ctx.selfRoles.heldNow(guildId, member)), page, note);
+}
+
 /** A choice of the menu that was pressed, with the name it showed. */
 interface PressedChoice extends ShownChoice {
   label: string;
@@ -63,20 +105,31 @@ interface PressedChoice extends ShownChoice {
  * which of them it showed ticked.
  */
 function pressedMenu(interaction: StringSelectMenuInteraction): PressedChoice[] | undefined {
-  for (const row of interaction.message.components) {
-    if (row.type !== ComponentType.ActionRow) continue;
-    for (const control of row.toJSON().components) {
-      if (
-        control.type === ComponentType.StringSelect &&
-        control.custom_id === interaction.customId
-      ) {
-        return control.options.map((option) => ({
-          value: option.value,
-          label: option.label,
-          ticked: option.default === true,
-        }));
-      }
+  // A components-v2 message holds its menus inside its container; one from before plan 8B-4
+  // in rows at the top. Both are looked through.
+  const visit = (component: unknown): PressedChoice[] | undefined => {
+    const one = component as {
+      type?: unknown;
+      custom_id?: unknown;
+      options?: { value: string; label: string; default?: boolean }[];
+      components?: unknown[];
+    };
+    if (one.type === ComponentType.StringSelect && one.custom_id === interaction.customId) {
+      return (one.options ?? []).map((option) => ({
+        value: option.value,
+        label: option.label,
+        ticked: option.default === true,
+      }));
     }
+    for (const inner of one.components ?? []) {
+      const found = visit(inner);
+      if (found) return found;
+    }
+    return undefined;
+  };
+  for (const component of interaction.message.components) {
+    const found = visit(component.toJSON());
+    if (found) return found;
   }
   return undefined;
 }
@@ -93,17 +146,6 @@ const NOTHING_CHANGED = 'Nothing was changed.';
  */
 const COULD_NOT_CHANGE = 'I could not make the change.';
 
-/**
- * A message's own text with a sentence below it: the text is kept (the heading, the list of the
- * menus and what an earlier change said), cut only where both would not fit a message, and a
- * sentence the text already ends with is not said twice.
- */
-function withSentence(text: string, sentence: string): string {
-  if (text.trim() === '') return sentence;
-  if (text.endsWith(sentence)) return text;
-  return `${truncate(text, LIMITS.content - sentence.length - 1)}\n${sentence}`;
-}
-
 /**
  * What a change of a menu did, as the message says it: "Added **Mystic**; removed **Valor**."
  * (what was really done), a sentence for each role of the menu that was skipped, and for a
@@ -171,14 +213,16 @@ const requireRoles: Guard = (_interaction, ctx) => {
  * The controls of `/iam` without a role. Changing a menu applies exactly that menu's
  * difference (`menuRequest`: what it showed unticked and is now ticked is given, what it showed
  * ticked and is now unticked is taken), read from the menu as the message shows it
- * (`interaction.message`), so nothing
- * about an open message is kept anywhere and it still works after a restart. The message is
- * then made anew from the roster and the member's roles as they are now. Every press is
- * acknowledged first: what follows may ask Discord and the database. A change that did nothing
- * (the roles are not known, the member has too many changes under way, or it failed before its
- * first step was done) puts the message back as it was, with its own text and a sentence below
- * it: Discord's client keeps the ticks of a press that was acknowledged, and they must not stand
- * as if they had been applied.
+ * (`interaction.message`: inside its container, or in the rows of a message from before plan
+ * 8B-4), so nothing about an open message is kept anywhere and it still works after a restart.
+ * Every press is acknowledged first: what follows may ask Discord and the database. Then the
+ * message is always made anew from the roster and the member's roles as they are now
+ * (`menusNow`), never copied, with what the press did in small print: also after a change that
+ * did nothing (the member has too many changes under way, or it failed before its first step
+ * was done), since Discord's client keeps the ticks of a press that was acknowledged and they
+ * must not stand as if they had been applied. Without the roster it says so and how to get the
+ * menus again. A message of menus from before plan 8B-4 is closed with `OLD_MENUS` and the new
+ * menus follow privately below it (`showMenus`).
  */
 export const roleControls: ComponentHandler = {
   kind: ROLES_KIND,
@@ -196,12 +240,14 @@ export const roleControls: ComponentHandler = {
     // Changing the roles is requests to Discord, which may take longer than an answer may.
     await interaction.deferUpdate();
     const request = menuRequest(shown, interaction.values);
-    /** The message as it was before the press, with what is to be said about the press. */
-    const putBack = (sentence: string) =>
-      interaction.editReply({
-        content: withSentence(interaction.message.content, sentence),
-        components: interaction.message.components.map((row) => row.toJSON()),
-      });
+    const page = Number(id.args[1]);
+    /**
+     * The menus made anew as the member's roles are now (never the pressed message copied:
+     * Discord's client keeps the ticks of a press that was acknowledged, and they must not
+     * stand as if they had been applied), with what is to be said about the press.
+     */
+    const putBack = async (sentence: string) =>
+      showMenus(interaction, await menusNow(ctx, guildId, member, page, sentence));
     let outcome: RoleChangeOutcome;
     try {
       // "None" counts only where the menu offered it and showed it unticked: it is no role's
@@ -233,11 +279,12 @@ export const roleControls: ComponentHandler = {
       if (outcome.reason === 'busy') await putBack(`${STILL_WORKING} ${NOTHING_CHANGED}`);
       return;
     }
-    await interaction.editReply(
+    await showMenus(
+      interaction,
       renderRoleMenus(
         outcome.roster,
         new Set(outcome.held),
-        Number(id.args[1]),
+        page,
         changeNote(outcome, request, shown, interaction.values),
       ),
     );
@@ -251,7 +298,8 @@ export const roleControls: ComponentHandler = {
     await interaction.deferUpdate();
     const roster = await ctx.selfRoles.roster(guildId);
     if (!roster) throw new UserError(ROLES_UNAVAILABLE);
-    await interaction.editReply(
+    await showMenus(
+      interaction,
       renderRoleMenus(
         roster,
         new Set(ctx.selfRoles.heldNow(guildId, member)),
diff --git a/src/render/role-menus.test.ts b/src/render/role-menus.test.ts
index 891d6eb8a99d5613b344f95903b9a036cdafc981..441ab14da18134f9176e8ab4f36dc6ed44309697 100644
--- a/src/render/role-menus.test.ts
+++ b/src/render/role-menus.test.ts
@@ -3,7 +3,9 @@ import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import {
   assertSendable,
   buttonsOf,
+  controlsOf,
   menusOf,
+  textOfMenus,
   ROLE,
   selfRolesWith,
 } from '../../test/support/roles.js';
@@ -52,14 +54,14 @@ describe('renderRoleMenus', () => {
     const { roster } = await sample();
     const message = renderRoleMenus(roster, new Set(), 0);
     assertSendable(message);
-    expect(message.content.split('\n')).toEqual([
-      '**Your roles on this server.** Tick and untick them in the menus; a menu takes effect ' +
-        'as soon as you close it.',
-      '1. Regions · any number',
-      '2. Teams · pick one',
-      '3. Other · any number',
+    expect(textOfMenus(message).split('\n')).toEqual([
+      '### Your roles on this server',
+      'Tick and untick them in the menus; a menu takes effect as soon as you close it.',
+      '**Regions** · pick any number',
+      '**Teams** · pick one',
+      '**Other** · pick any number',
     ]);
-    const [regions, teams, other] = message.components.map((row) => row.components[0]);
+    const [regions, teams, other] = controlsOf(message).filter((one) => one.type === 3);
     expect(regions).toMatchObject({
       placeholder: 'Regions (any number)',
       min_values: 0,
@@ -121,30 +123,26 @@ describe('renderRoleMenus', () => {
 
   it('leaves out what cannot be given, and says so when nothing can', async () => {
     const { roster, server, selfRoles } = await sample();
-    expect(renderRoleMenus({ ...roster, entries: [] }, new Set(), 0)).toEqual({
-      content: NO_ROLES,
-      components: [],
-    });
+    const none = renderRoleMenus({ ...roster, entries: [] }, new Set(), 0);
+    expect(textOfMenus(none)).toBe(NO_ROLES);
+    expect(menusOf(none)).toEqual([]);
+    assertSendable(none);
     // Roles are offered, but the bot cannot give any: the member reads what a moderator has to mend.
     server.bot.mayManageRoles = false;
     const powerless = await selfRoles.roster(FAKE_GUILD_ID);
     if (!powerless) throw new Error('no roster');
-    expect(renderRoleMenus(powerless, new Set([ROLE.north]), 0)).toEqual({
-      content: NO_MANAGE_ROLES,
-      components: [],
-    });
+    expect(textOfMenus(renderRoleMenus(powerless, new Set([ROLE.north]), 0))).toBe(NO_MANAGE_ROLES);
     // A change that led here and said so already is not followed by the same sentence.
     const said = `${NO_MANAGE_ROLES} Nothing was changed.`;
-    expect(renderRoleMenus(powerless, new Set(), 0, said).content).toBe(said);
+    expect(textOfMenus(renderRoleMenus(powerless, new Set(), 0, said))).toBe(said);
     // Roles are offered, and each has a problem of its own.
     server.bot.mayManageRoles = true;
     for (const entry of roster.entries) server.edit(entry.role?.id ?? '', { position: 60 });
     const stuck = await selfRoles.roster(FAKE_GUILD_ID);
     if (!stuck) throw new Error('no roster');
-    expect(renderRoleMenus(stuck, new Set(), 0, 'Nothing was changed.')).toEqual({
-      content: `Nothing was changed.\n${NONE_AVAILABLE}`,
-      components: [],
-    });
+    expect(textOfMenus(renderRoleMenus(stuck, new Set(), 0, 'Nothing was changed.'))).toBe(
+      `Nothing was changed.\n${NONE_AVAILABLE}`,
+    );
     expect(NONE_AVAILABLE).toBe(
       "None of this server's self-assignable roles can be given at the moment. A moderator " +
         'can see why with `/admin self-roles list`.',
@@ -154,10 +152,11 @@ describe('renderRoleMenus', () => {
   it('puts what a change did last, and cuts it to what the message has room for', async () => {
     const { roster } = await sample();
     const message = renderRoleMenus(roster, new Set(), 0, 'Added **North**.');
-    expect(message.content.split('\n').at(-1)).toBe('Added **North**.');
+    // In small print, last.
+    expect(textOfMenus(message).split('\n').at(-1)).toBe('-# Added **North**.');
     const long = renderRoleMenus(roster, new Set(), 0, 'x'.repeat(5000));
     assertSendable(long);
-    expect(long.content).toHaveLength(2000);
+    expect(textOfMenus(long).split('\n').at(-1)).toHaveLength('-# '.length + 1_500);
   });
 
   it('shows text staff wrote as text in the message; a menu takes any text as it is', async () => {
@@ -172,9 +171,9 @@ describe('renderRoleMenus', () => {
     const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
     if (!roster) throw new Error('no roster');
     const message = renderRoleMenus(roster, new Set(), 0);
-    expect(message.content).not.toContain('**Loud**');
-    expect(message.content).not.toContain('@everyone');
-    expect(message.components[0]?.components[0]).toMatchObject({
+    expect(textOfMenus(message)).not.toContain('**Loud** ');
+    expect(textOfMenus(message)).toContain('**\\*\\*Loud\\*\\* @\u200beveryone**');
+    expect(controlsOf(message).find((one) => one.type === 3)).toMatchObject({
       placeholder: '**Loud** @everyone (any number)',
     });
   });
@@ -185,10 +184,10 @@ describe('renderRoleMenus', () => {
     assertSendable(message);
     const menus = menusOf(message);
     expect(menus.map((menu) => menu.options.length)).toEqual([20, 20, 20]);
-    expect(message.content.split('\n').slice(1)).toEqual([
-      '1. Regions: A – GRegions 032 · any number',
-      '2. Regions: GRegions 058 – P · any number',
-      '3. Regions: Q – Z · any number',
+    expect(textOfMenus(message).split('\n').slice(2)).toEqual([
+      '**Regions: A – GRegions 032** · pick any number',
+      '**Regions: GRegions 058 – P** · pick any number',
+      '**Regions: Q – Z** · pick any number',
     ]);
     // Every role is in one menu, and the 30 the member holds are ticked.
     expect(menus.flatMap((menu) => menu.options.map((option) => option.value)).sort()).toEqual(
@@ -236,7 +235,7 @@ describe('renderRoleMenus', () => {
     const pages = [0, 1, 2].map((page) => renderRoleMenus(nine.roster, new Set(nine.ids), page));
     for (const page of pages) assertSendable(page);
     expect(pages.map((page) => menusOf(page).length)).toEqual([4, 4, 1]);
-    expect(pages.map((page) => page.content.split('\n').at(-1))).toEqual([
+    expect(pages.map((page) => textOfMenus(page).split('\n').at(-1))).toEqual([
       'Page 1 of 3',
       'Page 2 of 3',
       'Page 3 of 3',
diff --git a/src/render/role-menus.ts b/src/render/role-menus.ts
index bedda4938f5507a904dbdc577dd07a467ecd46f7..97c2489617fd55c685da4f613c80cf97ed6163e0 100644
--- a/src/render/role-menus.ts
+++ b/src/render/role-menus.ts
@@ -1,10 +1,12 @@
 import {
   ButtonStyle,
   ComponentType,
-  type APIActionRowComponent,
-  type APIComponentInMessageActionRow,
+  type APIButtonComponent,
+  type APIComponentInContainer,
   type APISelectMenuOption,
+  type APIStringSelectComponent,
 } from 'discord.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import {
   groupRoleIds,
@@ -15,7 +17,8 @@ import {
   type RoleMenu,
 } from '../domain/roles/menus.js';
 import type { Roster } from '../domain/roles/self-roles.js';
-import { LIMITS, plain, truncate } from './text.js';
+import { plain, truncate } from './text.js';
+import { actionRow, container, LIST_COLOUR, menuRow, separator, textDisplay } from './v2.js';
 
 /**
  * The custom-id kind of the controls of `/iam` without a role (see `custom-id.ts`):
@@ -35,20 +38,17 @@ const OPTION_LABEL = 100;
 const OPTION_DESCRIPTION = 100;
 const PLACEHOLDER = 150;
 
-type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
-
-/** The private message of `/iam` without a role: its text and its rows of controls. */
-interface RoleMenuMessage {
-  content: string;
-  components: Row[];
-}
-
 /** The rule of a group, or of a menu of it, as a list and a menu say it. */
 export function groupRule(group: { pickOne: boolean }): string {
   return group.pickOne ? 'pick one' : 'any number';
 }
 
-function menuRow(menu: RoleMenu, roster: Roster, held: ReadonlySet<string>, page: number): Row {
+function roleMenu(
+  menu: RoleMenu,
+  roster: Roster,
+  held: ReadonlySet<string>,
+  page: number,
+): APIStringSelectComponent {
   const options: APISelectMenuOption[] = menu.entries.map((entry) => ({
     label: truncate(entry.name, OPTION_LABEL),
     value: entry.role?.id ?? '',
@@ -73,26 +73,21 @@ function menuRow(menu: RoleMenu, roster: Roster, held: ReadonlySet<string>, page
     });
   }
   return {
-    type: ComponentType.ActionRow,
-    components: [
-      {
-        type: ComponentType.StringSelect,
-        custom_id: encodeCustomId({
-          kind: ROLES_KIND,
-          id: menu.group ? String(menu.group.id) : OTHER_ID,
-          action: PICK_ACTION,
-          args: [String(menu.part), String(page)],
-        }),
-        placeholder: truncate(`${menu.title} (${groupRule(menu)})`, PLACEHOLDER),
-        min_values: menu.pickOne ? 1 : 0,
-        max_values: menu.pickOne ? 1 : options.length,
-        options,
-      },
-    ],
+    type: ComponentType.StringSelect,
+    custom_id: encodeCustomId({
+      kind: ROLES_KIND,
+      id: menu.group ? String(menu.group.id) : OTHER_ID,
+      action: PICK_ACTION,
+      args: [String(menu.part), String(page)],
+    }),
+    placeholder: truncate(`${menu.title} (${groupRule(menu)})`, PLACEHOLDER),
+    min_values: menu.pickOne ? 1 : 0,
+    max_values: menu.pickOne ? 1 : options.length,
+    options,
   };
 }
 
-function pageRow(page: number, pages: number): Row {
+function pageButtons(page: number, pages: number): APIButtonComponent[] {
   const button = (action: string, label: string, disabled: boolean) => ({
     type: ComponentType.Button as const,
     style: ButtonStyle.Secondary as const,
@@ -105,18 +100,18 @@ function pageRow(page: number, pages: number): Row {
     }),
     disabled,
   });
-  return {
-    type: ComponentType.ActionRow,
-    components: [
-      button(PREVIOUS_ACTION, 'Previous', page === 0),
-      button(NEXT_ACTION, 'Next', page >= pages - 1),
-    ],
-  };
+  return [
+    button(PREVIOUS_ACTION, 'Previous', page === 0),
+    button(NEXT_ACTION, 'Next', page >= pages - 1),
+  ];
 }
 
+/** The heading of the message, and the line of help under it. */
 const HEADING =
-  '**Your roles on this server.** Tick and untick them in the menus; a menu takes effect as ' +
+  '### Your roles on this server\nTick and untick them in the menus; a menu takes effect as ' +
   'soon as you close it.';
+/** How much of a note (what the last change did) the message shows. */
+const NOTE_ROOM = 1_500;
 /** What the message says in a server that offers no role at all. */
 export const NO_ROLES = 'This server has no roles you can give yourself at the moment.';
 /** What a member is told when nothing can be handed out because the bot lacks Manage Roles. */
@@ -134,47 +129,52 @@ function nothingToPick(roster: Roster): string {
   return roster.bot.mayManageRoles ? NONE_AVAILABLE : NO_MANAGE_ROLES;
 }
 
+/** The rule of a menu as its heading says it. */
+const headingRule = (menu: { pickOne: boolean }): string =>
+  menu.pickOne ? 'pick one' : 'pick any number';
+
 /**
- * The message with the menus: one per group (a part of a group that needs several), the
- * member's own roles ticked, and with more than five menus four to a page and a row of
- * Previous and Next. Nothing depends on anything but the roster and the roles the member holds,
- * so the same message can be made again after every change and after a restart. A menu shows
- * its name only while nothing is ticked in it, so the text lists the menus of the page in
- * their order. `note` is what the change that led here did; it comes last, next to the menus.
+ * The message with the menus, as a components-v2 message (plan 8B-4): one container of
+ * `LIST_COLOUR` with the heading and a line of help, then each menu (one per group, a part of a
+ * group that needs several) under its name and rule, the member's own roles ticked; with more
+ * than five menus four to a page, "Page 2 of 3" and a row of Previous and Next. Nothing depends
+ * on anything but the roster and the roles the member holds, so the same message is made anew
+ * after every change and after a restart. `note` is what the change that led here did; it
+ * comes last, in small print.
  */
 export function renderRoleMenus(
   roster: Roster,
   held: ReadonlySet<string>,
   page: number,
   note?: string,
-): RoleMenuMessage {
+): V2Message {
+  const said = note === undefined || note === '' ? undefined : truncate(note, NOTE_ROOM);
   const menus = roleMenus(roster);
   if (menus.length === 0) {
     const why = nothingToPick(roster);
     // A change that led here may have said the same already.
-    const said = note !== undefined && note.includes(why);
-    return { content: said ? note : [note, why].filter(Boolean).join('\n'), components: [] };
+    const text = said !== undefined && said.includes(why) ? said : [said, why].filter(Boolean);
+    return {
+      v2: true,
+      components: [container(LIST_COLOUR, [textDisplay([text].flat().join('\n'))])],
+    };
   }
   const pages = menuPages(menus);
   const shown = nearestPage(page, pages.length);
   const onPage = pages[shown] ?? [];
-  const lines = [
-    HEADING,
-    ...onPage.map(
-      (menu, index) => `${String(index + 1)}. ${plain(menu.title)} · ${groupRule(menu)}`,
-    ),
-    ...(pages.length > 1 ? [`Page ${String(shown + 1)} of ${String(pages.length)}`] : []),
-  ];
-  const text = lines.join('\n');
-  const content =
-    note === undefined || note === ''
-      ? text
-      : `${text}\n${truncate(note, LIMITS.content - text.length - 1)}`;
-  return {
-    content,
-    components: [
-      ...onPage.map((menu) => menuRow(menu, roster, held, shown)),
-      ...(pages.length > 1 ? [pageRow(shown, pages.length)] : []),
-    ],
-  };
+  const parts: APIComponentInContainer[] = [textDisplay(HEADING), separator()];
+  for (const menu of onPage) {
+    parts.push(
+      textDisplay(`**${plain(menu.title)}** · ${headingRule(menu)}`),
+      menuRow(roleMenu(menu, roster, held, shown)),
+    );
+  }
+  if (pages.length > 1) {
+    parts.push(
+      textDisplay(`Page ${String(shown + 1)} of ${String(pages.length)}`),
+      actionRow(pageButtons(shown, pages.length)),
+    );
+  }
+  if (said !== undefined) parts.push(textDisplay(`-# ${said}`));
+  return { v2: true, components: [container(LIST_COLOUR, parts)] };
 }
diff --git a/test/support/roles.ts b/test/support/roles.ts
index debf57627fe108e264b1e87d6da7f75cfb8ddd79..b990631ba24f7a73182c9f1cb4780c4718648ef2 100644
--- a/test/support/roles.ts
+++ b/test/support/roles.ts
@@ -1,3 +1,8 @@
+import { expect } from 'vitest';
+import type { V2Message } from '../../src/discord/party-gateway.js';
+import { MAX_COMPONENTS, TEXT_BUDGET } from '../../src/render/party-post.js';
+import { FakePartyGateway } from './fake-gateway.js';
+import { componentCount } from './messages.js';
 import { isStaffRoleName } from '../../src/discord/guards.js';
 import type { RoleGateway, RoleWriteOutcome } from '../../src/discord/role-gateway.js';
 import {
@@ -374,31 +379,59 @@ interface SentControl {
   options?: { label: string; value: string; description?: string; default?: boolean }[];
 }
 
-/** The select menus of a message with controls, in their order. */
+/** Every component of a message, nested ones included (a builder by its JSON), depth first. */
+function everyComponent(
+  components: readonly unknown[],
+): (SentControl & { components?: unknown[]; content?: string })[] {
+  return components.flatMap((component) => {
+    const json = (
+      typeof (component as { toJSON?: unknown }).toJSON === 'function'
+        ? (component as { toJSON(): unknown }).toJSON()
+        : component
+    ) as SentControl & { components?: unknown[]; content?: string };
+    return [json, ...everyComponent(json.components ?? [])];
+  });
+}
+
+/** Every component of a message, nested ones included, depth first (for what a test reads). */
+export function controlsOf(message: { components?: readonly unknown[] }): SentControl[] {
+  return everyComponent(message.components ?? []);
+}
+
+/** The select menus of a message with controls (in rows, or inside a container), in order. */
 export function menusOf(message: {
   components?: readonly unknown[];
 }): Required<Pick<SentControl, 'custom_id' | 'options'>>[] {
-  return (message.components ?? []).flatMap((row) =>
-    (row as { components: SentControl[] }).components.flatMap((control) =>
-      control.type === 3 && control.custom_id !== undefined && control.options !== undefined
-        ? [{ custom_id: control.custom_id, options: control.options }]
-        : [],
-    ),
+  return everyComponent(message.components ?? []).flatMap((control) =>
+    control.type === 3 && control.custom_id !== undefined && control.options !== undefined
+      ? [{ custom_id: control.custom_id, options: control.options }]
+      : [],
   );
 }
 
 /** The buttons of a message with controls, in their order. */
 export function buttonsOf(message: { components?: readonly unknown[] }): SentControl[] {
-  return (message.components ?? []).flatMap((row) =>
-    (row as { components: SentControl[] }).components.filter((control) => control.type === 2),
+  return everyComponent(message.components ?? []).filter((control) => control.type === 2);
+}
+
+/** The text of a message: the text displays of a components-v2 one by lines, else its content. */
+export function textOfMenus(message: {
+  content?: string;
+  components?: readonly unknown[];
+}): string {
+  const texts = everyComponent(message.components ?? []).flatMap((component) =>
+    component.type === 10 && typeof component.content === 'string' ? [component.content] : [],
   );
+  return texts.length === 0 ? (message.content ?? '') : texts.join('\n');
 }
 
 /**
- * Throws unless Discord would take this message: its text and its rows of select menus and
- * buttons, checked against the limits Discord enforces (five rows, one menu or up to five
- * buttons in a row, 25 options, the lengths of labels, descriptions, placeholders and custom
- * ids, no custom id and no option value twice, no more options chosen than may be).
+ * Throws unless Discord would take this message: its text and its select menus and buttons,
+ * checked against the limits Discord enforces (one menu or up to five buttons in a row, 25
+ * options, the lengths of labels, descriptions, placeholders and custom ids, no custom id and
+ * no option value twice, no more options chosen than may be); a classic message at most five
+ * rows, a components-v2 message (plan 8B-4) what the fake gateway holds one to, with at most 40
+ * components and the text within `TEXT_BUDGET`.
  */
 export function assertSendable(message: {
   content?: string;
@@ -407,11 +440,21 @@ export function assertSendable(message: {
   const fail = (what: string): never => {
     throw new Error(`Discord would refuse this message: ${what}`);
   };
+  const top = (message.components ?? []) as { type: number }[];
+  const v2 = top.some((component) => component.type !== 1);
+  if (v2) {
+    const sent = { v2: true as const, components: top as V2Message['components'] };
+    expect(componentCount(sent)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    FakePartyGateway.checkMessage(sent, TEXT_BUDGET);
+  }
   const content = message.content ?? '';
   if (content.length > 2000) fail(`content of ${String(content.length)} characters`);
-  const rows = (message.components ?? []) as { type: number; components: SentControl[] }[];
-  if (content.trim() === '' && rows.length === 0) fail('it is empty');
-  if (rows.length > 5) fail(`${String(rows.length)} rows`);
+  const rows = (v2 ? everyComponent(top).filter((component) => component.type === 1) : top) as {
+    type: number;
+    components: SentControl[];
+  }[];
+  if (content.trim() === '' && rows.length === 0 && !v2) fail('it is empty');
+  if (!v2 && rows.length > 5) fail(`${String(rows.length)} rows`);
   const ids = new Set<string>();
   for (const row of rows) {
     if (row.type !== 1) fail(`a top-level component of type ${String(row.type)}`);
````

### Task 7: Plan 8B-4 T7: conventions, help and the staging checklist

Prototype commit: `85e060a621c2763733bb0421eaba6efbe9237463`

CLAUDE.md says what is now true: no code builds an embed, the map as a
gallery (mapPicture, mapOrNothing, V2Message.files), answers in place
(showInPlace, sayInPlace), the views and flows of /gym, the kind gymview,
the region and screenshot messages, the menus of /iam and the checks of
the fakes. The help of /gym show names its buttons. The staging
checklist is docs/superpowers/plans/2026-10-15-phase-8b4-staging.md.

**Files:**

```
 CLAUDE.md                                              | 18 +++++++++++-------
 docs/superpowers/plans/2026-10-15-phase-8b4-staging.md | 31 +++++++++++++++++++++++++++++++
 src/commands/gyms/show.ts                              |  4 +++-
 3 files changed, 45 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  no unit test files of its own); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 85e060a621c2763733bb0421eaba6efbe9237463 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8B-4 T7: conventions, help and the staging checklist`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/superpowers/plans/2026-10-15-phase-8b4-staging.md src/commands/gyms/show.ts`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index a338521b21450c6fc60131cc3af319e2610803bc..411f4fce97170f261df2899f6ec37e854a422378 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -58,7 +58,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Secrets come from environment variables (`.env`, see `.env.example`), never from `data/` files. Blank values mean "unset".
 - Required intents are `Guilds`, `GuildMessages`, `DirectMessages`. `MessageContent` only when `settings.ocr.passive`; `GuildMembers` only when `settings.autoAssignRole`. Never `GuildPresences` or `GuildMessageReactions`.
 - Ephemeral replies use `flags: MessageFlags.Ephemeral`. Things the user did wrong are thrown as `UserError`; the router turns them into ephemeral replies.
-- Every message that is more than plain text is a components-v2 message (Matt, 2026-10-15): new code never builds an embed (`APIEmbed`, `EmbedBuilder`). The embeds still left (gym and region administration, `/find-gym`, `/find-region`, `/bounds`, the gym announcements) go in plan 8B-4; only the classic text spawn report for a channel without Embed Links stays until staging says whether v2 needs that permission.
+- Every message that is more than plain text is a components-v2 message (Matt, 2026-10-15): no code builds an embed (`APIEmbed`, `EmbedBuilder`; plan 8B-4 converted the last). Only the classic text spawn report for a channel without Embed Links stays plain until staging says whether v2 needs that permission; `ClassicMessage.embeds` and the fake gateway's embed checks remain for the messages made before (a conversion clears them).
 - Mentions are off by default (`allowedMentions: { parse: [] }` on the client); a send that should ping must opt in with its own `allowedMentions`.
 - Component custom IDs are `<kind>:<id>:<action>[:<arg>...]`, at most 100 characters, built and parsed only through `src/discord/custom-id.ts`.
 - Every slash command is a `CommandModule` listed in `src/commands/index.ts`; the router and the deploy script both read that list. A command with another name is listed under both: `alsoAs(command, name)` (`src/discord/command.ts`; `/hmm` of `/interested`, `/coming` of `/join`) gives the same guards, handlers, throttle and help under another name, and a short form (`/little`, `/great`, `/ultra`, `/master`: `/rank` in that league) is a command of its own with `formOf`. The uses of a form count as the command's (the router's throttle key), "You can use /x again" names the name typed, and `/help` lists a form beside the command's name on its line and explains it as the command's.
@@ -91,7 +91,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Gyms are found through `ctx.gyms` (`search(channelId, text, { limit })`, `get`, `isRegion`, `regionsOf`, `inRegion`): all gyms are held in memory by `GymDirectory`. A hit says where it lies (`place`: `local`, `neighbouring`, `anywhere`), whether every word matched (`allWords`; false means a guess) and whether a word had to be read as a misspelling (`corrected`). Act only on a clear hit; offer the rest as a choice. After a gym edit call `GymDirectory.refreshGym(id)`; after regions change, `load()`.
 - Pokémon are found through `ctx.pokemon`: `exact(text)` is the one entry a text names outright (act on this); `search(text)` is a list ordered best first that includes near misses (offer it, never act on its first entry); `find(text, { limit, filter, plain })` is the same list with how each hit fits (`exact`, `word`, `beginning`, `loose`, `guess`) and whether it was found by its name (`named`). The order: a whole word of a name, then a beginning, then looser hits, guesses last; among hits led by the species' own name or a nickname, a legendary, mythical or ultra-beast species (`PokemonEntry.class`, from the game master) first, at most `CLASS_LIFTS` entries of one species (`plain: true` switches that off). A nickname is never read as a misspelling, a costume word alone does not find its species, a word of up to five letters must keep its first letter, and a text that names a Pokémon outright brings no guesses. A list that puts current bosses first asks for them by themselves (`filter`), and offers a guess only where the shown name has the guessed word (`showsGuessed`, `src/commands/choices.ts`). After a nickname change call `PokemonSearchService.reloadNicknames()`.
 - Short fixed lists (status and privacy words, a boss's moves) use the strict matcher `matchNamed` (`src/domain/search/word-match.ts`), not an index: a misspelling must keep the first letter and may not add words.
-- Map pictures come from `ctx.maps` (`gym(gym)`, `region(region)`): a file path under `var/images/`, or undefined when there is no API key or the download failed; a message must go out without the map then. `ImageCache` names a file by what it shows, so a moved gym gets a new picture by itself. The Google API key is only ever in the address of a download: never in a log line, a file name or anything sent to Discord.
+- Map pictures come from `ctx.maps` (`gym(gym)`, `region(region)`): a file path under `var/images/`, or undefined when there is no API key or the download failed; a message must go out without the map then. A message shows a map at full width as a gallery (plan 8B-4): `mapPicture(await mapOrNothing(ctx.maps.gym(gym), ctx.log, 'a gym', { gym: gym.id }), alt)` (`src/render/v2.ts`, `src/services/static-maps.ts`; `mapOrNothing` logs a failure and never throws) gives the `gallery` to put where the map stands (`mediaGallery`, `attachment://<file name>`) and the `files` to send with it (`V2Message.files`, local paths, which `discordPayload` and `v2Answer` send). `ImageCache` names a file by what it shows, so a moved gym gets a new picture by itself. The Google API key is only ever in the address of a download: never in a log line, a file name or anything sent to Discord.
 - `src/domain/` is pure: no `discord.js`, `kysely`, `node:fs`, network, `src/services/` or `src/db/` imports. Domain modules state what they need of a gym or region as small interfaces.
 - A party (a raid, a meetup or a train) is an immutable plain object (`src/domain/party/party.ts`). Everything that can happen to it is a pure function in `src/domain/party/` (`attendance.ts`, `raid.ts`) that returns a changed party with what came of it, or `{ ok: false, reason }` (`Change`); a function returns the very same object when nothing changed. Commands turn a `reason` into a sentence. Never mutate a party.
 - What the clock does is `partyTick(party, input)` (`tick.ts`; it dispatches to `raidTick` or `timedTick`): it returns the party as it should be now, `effects` (`stage`, `ask-complete`, `completed`, `warn`, `end`) and `render`. It is idempotent and catches up after downtime by itself. `end` comes alone and repeats until the caller has ended the party with `endParty`.
@@ -104,7 +104,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
 - What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`). A party's post is a components-v2 message (Matt, 2026-10-15): the renderer lays it out (`PostLayout`: an accent colour, a picture, blocks of text, sections with the picture or a button beside them, rows of buttons) and `postMessage(layout, variant)` (`src/render/party-post.ts`) makes it one container; `rendered.message` is `postMessage(layout)`, the whole message and the only place its parts are put together, and its other forms are variants of the layout (`picture: false` when Discord refuses the picture, `controls: false` for the last showing of an ended party, `move: false` and `lead` for a copy), never edits of the component tree. `rendered.brief` (`PartyBrief`: the post's accent and picture, a few of its lines, a raid's map address) is what a direct message shows of the party, made by the renderer that makes the post, so a line the post shows is worded once (`PartyService.briefOf`; plan 8B-1: the embed card and `party-card.ts` are gone). Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as is the heading of the boss block ("Hatches as Yveltal"), said once. A raid is called as the legacy bot called it (`raidWords`: "Level 5 raid", "Shadow Level 3 raid"; the titles of posts and their tags keep `T5`), and the statuses are Interested, Coming, Present and Complete. A message holds at most `MAX_COMPONENTS` (40, every nested component counted) and its text displays at most `TEXT_BUDGET` (4,000, assumed: Discord documents no total) less the room of a copy's line (`LEAD_ROOM`): `fittedLayout(build)` gives `build` a `Fit`: every list of members goes through `fit.list` and is cut down with the others when the post is too long (`fitLists`, "…and N more"), and as a last resort the other texts that can be long (a group's label, a gym's notes, where a train is, its route) go through `fit.part(room => …)` and are cut (`cutText`, "…"). A copy's line (`lead`) opens the post's first text, never a component of its own. The worst case of each kind, with every text needing escapes, is tested with every copy (`expectSendable`, `test/support/post-limits.ts`).
-- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, https thumbnails, buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `customIdsOf`, `accentOf`, `thumbnailOf`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `customIdsOf`, `accentOf`, `thumbnailOf`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
@@ -176,7 +176,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - The bot never writes a member's role list. `RoleGateway` (`src/discord/role-gateway.ts`) has `server(guildId)` (the roles from the cache, the bot's standing) and `giveRole` / `takeRole`, one role per request: a list built from what an interaction showed would undo what anybody else changed meanwhile. Only the id of a current roster entry without a problem reaches `giveRole`. Tests use `FakeRoleGateway` and `selfRolesWith()` (`test/support/roles.ts`), `MemorySelfRoles` (`test/support/self-roles.ts`); the fake interactions take `roleIds` and the member's server `permissions`.
 - What may be self-assigned is `roleProblem` (never `@everyone`, a managed role, a role at or above the bot's highest, or one that adds a permission of `MODERATION_PERMISSIONS` to what `@everyone` has, by itself or through a channel overwrite, or one whose name makes its holder staff of this bot: `addedModeration`, `channelModeration`, `src/discord/role-permissions.ts`; `isStaffRoleName`, `guards.ts`), checked when staff add a role and every time one is given; staff may offer only what they could give by hand (`offerProblem`: the owner, or Manage Roles on the server, read from `interaction.member.permissions`, never the channel's `memberPermissions`, and a role below their own highest). A new permission flag of discord.js must be sorted into moderation or harmless (a test fails otherwise).
 - A legacy `Role` row is linked to its Discord role the first time it is resolved (exactly one unclaimed role of that name, without case), and its `roleName` follows a renamed role so the legacy bot keeps finding it (`buildRoster` says what to write, `SelfRoleRepository.remember` writes it, also during autocomplete). A group is pick-one or not; roles without a group are "Other".
-- `/iam` without a role shows menus (`roleMenus`, `menuPages`, `menuRequest` in `src/domain/roles/menus.ts`; `renderRoleMenus`; the handler `roleControls` in `src/commands/roles/menus.ts`): one per group, a group over 25 split into ranges, five on a message or four with Previous / Next; custom ids `roles:<group row id|other>:pick:<part>:<page>` and `roles:page:prev|next:<page>`. A menu gives only what it showed unticked and is now ticked, and takes away only what it showed ticked and is now unticked, read from the pressed message; a pick-one menu asks for a take only with a "None" that was not ticked already. Nothing about an open menu is kept in memory.
+- `/iam` without a role shows menus (`roleMenus`, `menuPages`, `menuRequest` in `src/domain/roles/menus.ts`; `renderRoleMenus`; the handler `roleControls` in `src/commands/roles/menus.ts`): one per group, a group over 25 split into ranges, five on a message or four with Previous / Next; custom ids `roles:<group row id|other>:pick:<part>:<page>` and `roles:page:prev|next:<page>`. The message is one components-v2 container of `LIST_COLOUR` (plan 8B-4): `### Your roles on this server` and a line of help, each menu under `**<group>** · pick one|pick any number`, "Page 2 of 3" with Previous / Next, and what the last change did in small print at the end. A menu gives only what it showed unticked and is now ticked, and takes away only what it showed ticked and is now unticked, read from the pressed message (inside its container, or in the rows of a message from before 8B-4); a pick-one menu asks for a take only with a "None" that was not ticked already. After every press the message is made anew from the roster and the roles the member holds now (`menusNow`), never copied, and shown through `showInPlace` (`OLD_MENUS` on a plain-text message of menus, the new ones privately below it); without the roster the answer is the sentence and "Use `/iam` again for the menus.". Nothing about an open menu is kept in memory.
 - A part of a `commandGroup` may have `enabled(config)` (`SubcommandPart.enabled`): `enabledCommands()` then narrows the command to the subcommands its settings offer, for the router, `/help` and the deploy script alike (`/admin self-roles` exists only where `features.roles` is on).
 - Gyms are administered through `ctx.gymAdmin` (`GymAdminService`, `src/services/gym-admin-service.ts`): `readLocation`, `add`, `edit`, `setElite`, `move`, `references`, `delete`, `refresh`. Adding, moving and deleting run one at a time under one lock, and what a question promised (no other gym within 10 metres, the gym still where it was) is looked at again inside that lock: `add` and `move` answer `near`, `elsewhere` or `foreign` and the command asks anew. Every change is logged with who, which gym and what, never the texts. After a change the service refreshes `GymDirectory` and has the posts that show the gym rendered anew; commands never call `GymRepository` or `refreshGym` themselves.
 - A deletion is refused while an active raid is at the gym. Otherwise: one transaction for the saved routes, the gym targets and the row (`GymRemovalRepository`), then `GymDirectory.forget(id)`, then the gym is taken off the route of every active train (best effort; a train that could not be changed is named in the answer), then the announcement. Nothing visible happens before the gym is really gone. From `forget` on, whatever picks the gym late (a report, `/location`, a relocation, a train's `addStop`, a loaded route) is refused with the reason `gym-gone`; `PartyStore.addRaidUnlessTaken` asks `gymExists` under the gym's lock. The hourly upkeep takes stops the directory does not know off active trains (`TrainService.removeUnknownStops`; never against an empty directory). Lock order: the admin lock, then a gym's lock, then a party's.
@@ -190,7 +190,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id.
 - KML is read by pure code: `src/domain/geo/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, crowded categories). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
 - An attachment is downloaded only through `AttachmentGateway.download(url, { maxBytes, timeoutMs })` (`src/services/attachment-gateway.ts`): https, Discord's attachment hosts only, no redirect, a hard byte limit, the address never logged. Tests use the fake in `test/support/attachments.ts`.
-- `/bounds` is a members' command (the picture and the gym count of the region of the channel). Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
+- `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the question and outcome of `/region remove` are `regionQuestion`s; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
 - Staff change the raid boss list only through `ctx.raidBossAdmin` (`RaidBossService` as `RaidBossAdmin`: overrides, `feedBosses()`, `sync()`; override writes and the end of a sync run one at a time). A sync's change is `FeedChange` with `seen`, the difference of `effectiveBosses` before and after with the same overrides (`diffBosses`, `src/domain/pogo/boss-diff.ts`): what members see. `RaidBossAnnouncer` posts `seen` in every server's bot-updates channel when `settings.raidBosses.announceChanges`, and the out-of-date warning (time, never the error) in the moderators' channel; nothing before `ready()`, nothing after `close()`. A failed sync has a `kind` (never show `reason`). A new autoset for a tier replaces the tier's earlier one. A boss the game data does not know has a key starting with `UNKNOWN_KEY_PREFIX` (`~`), never equal to a catalogue key and never stored; `howIdentified` says how a feed boss was matched.
 - Pokémon nicknames change only through `ctx.nicknames` (`PokemonSearchService`: changes and reloads one at a time; `nicknameProblem` in `src/domain/pogo/nickname-rules.ts` refuses words other commands read, names and nicknames of other Pokémon; removal from every legacy row of the Pokémon; the column stays `, `-joined lower case).
 - PvP ranks are pure (`src/domain/pvp/rank.ts`: CP multipliers of the game master, whole levels `Math.fround`ed, half levels by the legacy formula; the product computed as `m*m*((A+a)*(D+d)*hp)` so equal integers tie; competition ranking by product, IV sum, CP; caps 50 and 51, the second shown only when rank or best IVs differ). `PokemonEntry.evolutions` holds the direct evolutions from the game master (megas left out; a species entry without its own branch takes its forms'); `catalogue.evolutionLine(entry)` is the Pokémon and what it evolves into. `GAME_DATA_VERSION` 5. The answer of `/rank` and its short forms is a public components-v2 message (`renderRank`, `src/render/pvp-rank.ts`; plan 8B-2) with the leagues' buttons, the evolution line's and a link to pvpivs.com; the buttons keep everything in their custom ids (kind `rank`, `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>`, nothing in memory; `rankControls` reads the Pokémon from the game data anew and ranks with the command's `rankAnswer`), and answer by `pressAnswer`, with no guard of the PvP channel.
@@ -207,8 +207,12 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes; a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
 - Gyms of one region shown by the same name (`src/domain/gyms/shared-names.ts`: the nickname where there is one, compared by letters and digits alone, so "P.N.C. Park" is "PNC Park"; the search is unchanged) are listed by `/gym duplicates` (in several private messages for a long list); `/gym add`, `/gym edit` and `/gym move` warn about such a pair without refusing (`namesakeNote`).
 - The post of an egg shows the game's egg (`raidEggPicture`, `src/domain/pogo/raid-eggs.ts`, served by address from `settings.raidEggPicturesUrl`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one.
-- A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced.
-- Every new message of the bot that is not plain text is a components-v2 message, never an embed (Matt, 2026-10-15), ephemeral answers included: one `container` of `textDisplay`s and rows from `src/render/v2.ts`, sent and edited through `discordPayload({ v2: true, components })`, and every later edit of it v2 as well (a v2 message cannot become classic again: "Importing…", the outcome, Cancel and "expired" of `/gym import` are v2). A file sent with such a message is shown by `fileComponent(name)` (`attachment://<name>`), an edit that drops it passes `attachments: []`. The announcement of the gyms a batch added is `gymsAnnouncement` (`src/render/gym-view.ts`, at most `ANNOUNCED_GYMS` names, then "and N more").
+- A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced. One gym added alone is `gymAnnouncement(gym, regions, map)`, a components-v2 message with its map (Matt, 2026-10-15: like `/find-gym`; `GymAdminOptions.maps`, fetched only once a channel was found, the announcement going without it when it fails); several gyms of a batch stay `gymsAnnouncement`, a deletion `gymRemovedLine`. `announce` takes the messages to try in order: one Discord refuses (a file where the bot may not attach files, a map file gone) is followed by the next (the gym without its map); the map is fetched only once a channel was found, and a gym gone by then is not announced. The fake gateway's `refuseFiles` refuses a sent message with files.
+- Every new message of the bot that is not plain text is a components-v2 message, never an embed (Matt, 2026-10-15), ephemeral answers included: one `container` of `textDisplay`s and rows from `src/render/v2.ts`, sent and edited through `discordPayload({ v2: true, components })`, and every later edit of it v2 as well (a v2 message cannot become classic again: "Importing…", the outcome, Cancel and "expired" of `/gym import` are v2). A file sent with such a message is shown by `fileComponent(name)` (`attachment://<name>`), an edit that drops it passes `attachments: []`. The announcement of the gyms a batch added is `gymsAnnouncement` (`src/render/gym-view.ts`, at most `ANNOUNCED_GYMS` names, then "and N more"). A message of sentences is `textMessage(accent, texts, more)`.
+- A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
+- The views of a gym are components-v2 messages of `GYM_COLOUR` (`renderGymView`, staff: the heading `### [Name (Nickname)](<place>)`, the address Google gave and `regionsSentence`, the map, the description, `**Notice**`, `**Keywords:**`, `**Gym targets:**`, `**Elite raid gym:**`, `**Nearest gym:**`, nearby places and `Gym #<id> · <lat>, <lon>` in small print, a Map button; `renderMemberGymView` for `/find-gym`: "Elite raid gym" under the heading, the regions, the notice, **Raids now**, `Gym #<id>`); every text is cut to its room (`SHOWN`, `HEADING`) so that the worst case is within `TEXT_BUDGET`: what staff or Google wrote is cut before it is escaped, the lines above a view are kept whole while they fit (`fitLines`, "…and N more lines"), and `namesakeNote` names its namesakes within `NAMESAKES_SHOWN`. Every message of the `/gym` flows is v2 from first to last (`gymQuestion` for questions and answers, `gymViewMessage(ctx, place, gym, lines, controls)` for a view with what a change did above it, `answerGym` and `sayGym` to show them); the answer of a change has no buttons but the Map link. Tests read them with `said` (the sentences above a view), `gymViewOf` (title, lines, facts, small print, pictures) and `gymOf` (`test/support/gym-commands.ts`).
+- The view of `/gym show` has Edit…, Make elite / Not elite, Move… and Delete… beside its Map link (`viewControls`, `src/commands/gyms/view-controls.ts`): the custom-id kind `gymview`, `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0` (what Make elite / Not elite sets, so that a view drawn before somebody else changed the mark does what its label says) and the form `gymview:<gym id>:place` (titled by the gym's tidied name, cut to 38), nothing kept in memory, the guard of `/gym` and no throttle (as `/gym`), a gym gone or out of reach refused with `VIEW_GONE`. Edit… opens the form of `/gym edit` (`openEditForm`, `fromView`: its answer is a message of its own and the view stays; a refusal of it too, and the form opened again from that refusal is answered in its place); Make elite sets the mark and shows the view anew in place with what it did and the buttons as they now are (a gym gone during the press is said in the view's place); Move… opens a form of one input read by `readLocation` and answers as `/gym move` does (`moveGymTo`), Delete… with the question of `/gym delete` (`deleteQuestion`), both in a private message of their own (`deferReply`, then `answerGym`).
+- `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
 - The Wayfarer export (`src/domain/wayspots/export-file.ts`, written by the Pine Wayspot export tool, read by the bot) is `WayspotExport`: `format: 'pine-wayspots'`, `version` 1, `script`, `startedAt`, `finishedAt`, `regions` (the KML's area names), `margin` (metres the run went beyond their outlines, 0 to `MAX_SCAN_MARGIN`, and read as 0 where a file lacks it), `cells` (level-14 tokens received whole), `bareCells` (received empty; both count as covered: `coveredCells`), `wayspots` (`ExportedWayspot`: `id` of Wayfarer's form, `isWayfarerId`; `kind` `gym | stop | powerspot`; `status` kept and never acted on; `lat`, `lon`, `title`, `address`, `description`, `image`, empty where Wayfarer has none), and `part` for a file of an export saved in parts. `readWayspotExport` checks everything (`ExportProblem`: `not-json`, `not-an-export`, `version`, `too-many` beyond `MAX_EXPORT_WAYSPOTS` / `MAX_EXPORT_CELLS`, `bad-wayspot` with its index and `WayspotFault`, `bad-cell`) and uses nothing of a file that fails; of several Wayspots with one id the last counts. `writeWayspotExport` writes one line with the keys in a fixed order. The file is gzip (`pine-wayspots-<date>.json.gz`); `/gym import` also takes plain JSON (`unpackExport`: gzip by its first bytes, `MAX_UNPACKED_BYTES` 64 MB, UTF-8).
 - An export larger packed than `MAX_PART_BYTES` (9 MB; Discord takes 10) is saved in parts: `exportParts(file, count, runId)` cuts the cells in token order (neighbours stay together) into parts of about equal weight, each a whole export of its own cells and the Wayspots that lie in them, with `part: { index, count, runId }` (`count` 2 to `MAX_EXPORT_PARTS` 5; `runId` names one saving of one run, `run-<run id>-<saved at ms>`); the tool names the parts `pine-wayspots-<date>-part<n>of<m>.json.gz`. `/gym import` takes `file` and `file2` to `file5` (`FILE_OPTIONS`), checks every file's size (`MAX_EXPORT_BYTES`) before it downloads any, names the file a refusal is about when there are several, and merges with `mergeExportParts` (`PartsProblem`: `not-parts` for a whole export beside other files, `mixed-runs`, `same-part`, `missing-parts`); merged, an export has no `part`.
 - S2 cells are `src/domain/geo/s2.ts` (pure, `bigint` ids, checked against known cells): `cellIdAt(point, level)`, `cellToken` / `cellIdOf`, `isWayfarerCell` (a level-14 token written as S2 writes it), `wayfarerCellAt(point)`, `cellCentre(token)`, `WAYFARER_CELL_LEVEL` 14. Whether an export covers a place is whether the token of its level-14 cell is in `coveredCells`.
diff --git a/docs/superpowers/plans/2026-10-15-phase-8b4-staging.md b/docs/superpowers/plans/2026-10-15-phase-8b4-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..6b37bbe066336459868b3bb64926dad5fc1390d1
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-15-phase-8b4-staging.md
@@ -0,0 +1,31 @@
+# Phase 8B-4: staging checklist
+
+The text for the end of the 8B-4 plan (the last embeds as components-v2 messages; the buttons of `/gym show`; `/read-screenshot` and Screenshot feedback; the menus of `/iam`). Each step with Matt's go-ahead, on the test server, with the dev application and both accounts (Matt's own and Googer's), on the desktop client and on a phone. No command definition changed and there is no migration: no registration is needed. The Google API key is in `.env`; for the steps "without a map" Matt starts the bot once with `GOOGLE_API_KEY` blank.
+
+1. **Before the deploy, leave old messages open** (with the bot of the previous version still running): a question of `/gym add` (do not answer it), a question of `/region remove` of a throwaway region (made for this with `/region import channel:`), a second one to Cancel, the preview of `/region import` of a large file (with `preview.txt`), and `/iam` without a role (the plain-text menus). Then Matt stops that bot and starts this one in a terminal.
+2. **An old `/gym` question pressed after the deploy** (step 1): Add adds the gym; the old question now says "This message was replaced by the one below." without buttons, and the gym's view comes privately below it. A Cancel or an expired old question answers in plain text in its place.
+3. **Old `/region` questions** (step 1): Cancel says "The region was kept." in plain text in its place. Remove on the throwaway region's old question: "Removing the region…", then "This message was replaced by the one below." in its place and the green outcome privately below it. Import on the old preview of the large file: the same, the old message without its `preview.txt` afterwards, the green outcome below (with `outcome.txt` if a list of it is cut).
+4. **An old `/iam` menu** (step 1): tick a role in it: the role is given, the old message says "These menus were replaced by the ones below.", and the new menus come privately below it with "Added **…**." in small print.
+5. **`/gym show`** (Matt): one blue container: the name as a link (opens Google Maps), the nickname in brackets, the address Google gave and "It lies in #…", the map at full width, the description, **Notice**, **Keywords:**, **Gym targets:**, **Elite raid gym:**, **Nearest gym:**, nearby places and "Gym #… · lat, lon" in small print; a row Map (link), Edit…, Make elite (or Not elite), Move…, Delete…. On the phone: does the map fill the width and the row of five buttons fit?
+6. **A gym without a map** (the bot started without a Google key): `/gym show` and `/find-gym` go out without the gallery and read well.
+7. **Edit…** (on the view of step 5): the form of `/gym edit` opens filled; change the notice: the answer is a private message of its own ("Changed the notice of …" above the view, only the Map button), and the view of step 5 stays as it was. Empty the name: the refusal is a message of its own with "Open the form again"; the form opened from it is answered in its place.
+8. **Make elite / Not elite**: the view is drawn anew in place with "… is now marked as an elite raid gym." above it, **Elite raid gym:** yes, and the button now says Not elite; press it again: back. On an older view of the same gym (Make elite while the gym is one already): it stays one and says "… was an elite raid gym already.".
+9. **Move…**: a form with one input "The new place of the gym" (its description says what it reads). A point a few metres away: the gym moves at once, answered in a message of its own. A point far away: the question of `/gym move` in a message of its own; Move anyway moves it in place of that question.
+10. **Delete…**: the question of `/gym delete` in a message of its own; Keep keeps it, Delete deletes it. A gym with a raid: the refusal of `/gym delete`.
+11. **A view of a gym that is gone:** delete a gym from one view, then press Make elite on an older view of it: "That gym is no longer in the gym list." Googer (no staff role) pressing any of the buttons on a view Matt forwards a screenshot of cannot (the view is private; try the custom id only if a tool is at hand, otherwise skip).
+12. **The answers of changes:** `/gym add` (Add), `/gym edit`, `/gym move`, `/gym elite`, `/gym refresh`: each shows its sentences above the view, with the map, and only the Map button. Every question and refusal of the `/gym` flows is a blue container with its buttons inside.
+13. **A new gym announced:** with `settings.postNewGyms` on, `/gym add` a gym: the bot updates channel shows one container "A gym was added to the gym list.", the heading as a link, "It lies in #…", the map at full width, "Gym #…" in small print and a Map button; no ping. Without a key: the same without the map. With Attach Files taken from the bot in that channel: the announcement comes without the map (the first try is refused). A Wayfarer import that adds several gyms still posts the list (unchanged).
+14. **`/find-gym`** (Googer): the member's view: the heading, "Elite raid gym" under it where it is one, the regions, the map, the description, **Notice**, **Raids now** with links to the posts, "Gym #…", Map. Nothing of keywords, targets, Google or coordinates.
+15. **`/bounds`** (Googer, in a region channel and in a post of its forum): "### The area of #…" (does a channel mention read well in a heading, on the phone too?), the gym count, the outline map at full width.
+16. **`/find-region`** (Googer): a place name: the sentence, the map at full width, "© OpenStreetMap contributors" in small print; coordinates: the same without the attribution.
+17. **`/region import` with a cut list** (Matt, a KML of many areas, e.g. the 56-area test file): one green container "### Import regions", the sentences with "Every line is in the attached file.", a line, **Would be imported** and **Left out** cut with "…and N more", `preview.txt` shown as a file (opens, every line in it), Import and Cancel inside. Import: "Importing … areas…" in place, then the outcome (**Imported**, **Not imported**), the file gone. A small file: no file component.
+18. **`/region remove`**: the question and its outcome are green containers with the buttons inside; Cancel says "The region was kept." in place.
+19. **`/read-screenshot`** (Googer, a raid screenshot): a gold container: what was read beside the screenshot itself as a thumbnail (does Discord show the thumbnail of an upload's address after a while? open the answer again later), the doubts in small print ("Not sure: …"), a line, "With a screenshot like this, I report the raid as above." and "Did I read it right?", All right and Something is wrong inside. A busy reader: "N screenshots are ahead of yours." first, then the answer in its place (a file that is no picture after such a line: the line becomes the refusal).
+20. **Screenshot feedback** (Googer, on a raid post made from a screenshot): the same container with the kept screenshot as the thumbnail, "Is this what the screenshot shows?"; All right and Something is wrong (its form) answer privately as before.
+21. **`/iam` without a role** (Googer): one blurple container "### Your roles on this server", the line of help, each menu under "**Group** · pick one / pick any number", the menus with his roles ticked; tick and untick: the menus are drawn anew, "Added … / removed …" in small print at the end; a server with more than five menus: "Page 1 of 2" with Previous and Next. On the phone: are the menus and their headings clear?
+
+## Left open (for the follow-ups)
+
+- A components-v2 interaction update of a classic message was not tried (8B-3's ruling): old questions and menus are closed with a line and answered below (steps 2 to 4).
+- Whether the thumbnail of `/read-screenshot` (the interaction attachment's address) keeps showing once that address expires (step 19).
+- `CAN_POST` still asks for Embed Links: whether a v2 message needs it is still open. Attach Files is not asked for beforehand: a refused announcement is sent again without its map (step 13).
diff --git a/src/commands/gyms/show.ts b/src/commands/gyms/show.ts
index 9502be1512f58b2f958319e71ee4eb74bb3b79df..88175ca5cf710312651d3a7d10257d78c4872edb 100644
--- a/src/commands/gyms/show.ts
+++ b/src/commands/gyms/show.ts
@@ -19,7 +19,9 @@ export const showGym: SubcommandPart = {
       'Name, nickname and number, a link to the place, description, notice, whether it is an ' +
       'elite raid gym, keywords, the regions of this server it lies in, the nearest gym, how ' +
       'many members have it as a gym target, and the address and nearby places Google gave, ' +
-      'by which it is also found. Pick the gym from the list, or give its number.',
+      'by which it is also found, with its map. Buttons under it edit its texts, mark it as an ' +
+      'elite raid gym or take the mark away, move it and delete it, as the commands do. Pick ' +
+      'the gym from the list, or give its number.',
     examples: ['/gym show gym:Big Fountain', '/gym show gym:#123'],
   },
   defer: 'ephemeral',
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8b4 HEAD -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b4-embeds-left.md'` prints nothing; `npm run check`, then `npm run build`, one after the other. No database test file is touched by this plan. The test files with timers or waits that this plan changes (`src/commands/gyms/gym.test.ts`, `src/commands/gyms/edit-move.test.ts`, `src/commands/gyms/view-controls.test.ts`, `src/commands/gyms/import.test.ts`, `src/commands/regions/import.more.test.ts`, `src/commands/screenshots/read-screenshot.test.ts`, `src/commands/raids/raid-screenshot.test.ts`, `src/commands/roles/menus.test.ts`, `src/discord/late-reply.test.ts`, `src/services/gym-admin-service.test.ts`, `test/support/fake-interactions.test.ts`) ten times in a row.
2. Whole-branch review (Opus, high effort); one fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8B-4": the decisions above for Matt, what only staging shows, what was left open), the Gantt chart and memory. Then the restructure of CLAUDE.md Matt asked for (2026-10-15): the status to a few lines, the cross-cutting conventions kept, the subsystem conventions moved to `docs/architecture/<area>.md` with an index.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-15-phase-8b4-staging.md` (added by task 7). Each step with Matt's go-ahead, on the test server with the dev application; Matt starts the bot. No registration, no migration; old messages (a `/gym` question, a `/region import` preview, an `/iam` menu) are made with the build before this plan, then pressed after.
