# Phase 8B-2: `/counters` with Its Dialog, `/rank` and `/help` as Components-v2 Messages: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three answers 8B-1 left as embeds, in the new layout with controls that change the answer in place: `/counters` (the boss and the trainers it takes beside its picture, the moves with their type emoji, "Change options…" opening a dialog of menus and checkboxes that runs the simulation again), `/rank` and `/little` `/great` `/ultra` `/master` (rank and percentage beside the picture, league buttons, the evolution line on a button), and `/help` (an overview of names per group, a group's page, a command's page, menus and back buttons).

**Architecture:** The second of the three plans of 8B (8B-1 the DMs, member lists, spawn reports and summary; 8B-2 these answers; 8B-3 the Move train panel, `/gym show`, `/read-screenshot`, headings over `/iam`). Shared first: a public answer's controls (`pressAnswer`, `deferPress`, `answerPress` in `src/discord/late-reply.ts`: the asker's press changes the answer, anybody else's gives them a private copy), a component throttle that may be a function and may count in a command's window (`ControlThrottle`), and fakes as strict as Discord about forms (`checkModal`, strict modal readers, `fakeModal` with the shown form) and menus (`checkMenu`). `/rank` and `/help` carry their state in their custom ids (kinds `rank`, `help`); `/counters` keeps a day's options in memory under a token (kind `counters`). Type emoji come from `ctx.emoji` (`EmojiFinder`: the application's, then the server's by the interaction's `guildId`).

**Tech Stack:** TypeScript 6.0, discord.js 14.27 (components v2; modals with labels, string selects and a checkbox group), Vitest. No new dependency, no migration, no command definition changed: no registration before staging.

**Spec:** the design brief `.superpowers/sdd/2026-10-15-phase-8b2-counters-rank-help/design.md` (git-ignored; R0–R4, from Matt's approved drafts https://claude.ai/artifact/Qfr8DwViDs6pkdCJe3wepD and his answers in `docs/superpowers/plans/phase-0-follow-ups.md`, "From Phase 8A", the bullet "Matt, 2026-10-15 (morning), for the rest of Phase 8").

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8b2`), one commit per task, each commit typechecked with its own tests green, and the full check and build clean on the tip (5,163 unit tests). Two Opus reviewers went through that branch (R0, `/rank`, `/help`; `/counters`, its dialog, the docs), a third reviewer through the fixes, which are folded into the commits below.

## Decisions in this plan

Matt's (the drafts and his answers, 2026-10-15): the three layouts; a press by the asker changes a public answer, anybody else's gives a private copy; a `/counters` answer's options are kept a day; one "Change options…" dialog; a Pokébox answer is private wherever it is asked.

Made while prototyping, to look at in staging:

1. **Limits:** the dialog's submits count in the same window as `/counters` (three a minute in all: Pokebattler's sake); a refused submit does not count (a guard). The controls of `/rank` and `/help` count in a window of their own (`MEMBER_READ_THROTTLE`), apart from the command's.
2. **A message without interaction metadata** is nobody's: a press gives a private copy.
3. **`/rank` with one cap** reads `Up to level 50 · the same rank up to 51`.
4. **Link buttons** are `Full results` and `pvpivs.com` without `↗` (Discord draws its own mark).
5. **Custom ids:** `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>` (a Pokémon whose ids would not fit gets only the link); `help:overview:group`, `help:group:<category>:command|more|overview`, `help:command:<path>:back|overview|subgroup` (a bare category cannot be the id: `/train` and others are also command names); `counters:<token>:options|dialog`.
6. **`/help`:** `HELP_COLOUR` is the lists' blue; the overview gives groups text room by need; a subcommand inside a group goes back one level (`/admin boss add` → `◀ /admin boss`).
7. **`/counters`:** a type without an emoji is named in words (`Bite (Dark)`); the counters are one text display fitted with "…and N more"; `† a legacy move` only when a shown row has one; the kept options (a 16-hex token, at most 5,000, a day, in memory only) keep the post's party so an ended party's public answer is never edited, and never the Pokébox number (read again on submit).
8. **The dialog** is built from plain API objects as the bot's other forms; a Pokébox answer reopened by a member without an id preselects level 40; a kept moveset the boss no longer has preselects the average; a Pokébox picked in the dialog takes the checkboxes as shown; the presser's settings are read before the dialog is shown (one primary-key read).
9. **Task 7** is outside 8B-2: a `/read-screenshot` test that failed every afternoon (its egg is over by about 2:34 pm New York time) fakes `Date`.

Left open (also in the staging checklist): whether every client shows the checkbox group of a dialog (the phone app).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network.**
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8b2`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check` and the build after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Nothing Discord would refuse: every page of `/help`, every `/rank` and `/counters` answer within 40 components and the text budget in its worst case; menus within 25 options; custom ids of at most 100 characters and unique; the dialog within a modal's limits; no deferral before `showModal`.
2. A press never changes somebody else's public answer, and a public answer whose post's party has ended is never edited.
3. The throttles: the dialog's submits share `/counters`' window, refusals do not count.
4. Staff commands stay hidden from members in every `/help` page and control.
5. Nothing left that reads the removed embed renderers.

### Task 1: Controls of a public answer, a throttle per control, and forms checked in the fakes

Prototype commit: `cceaf687d01d38a33f9f2ba444d5beebf2c096cc`

The shared pieces of plan 8B-2 (R0 of its brief) before /rank, /help and
/counters use them.

- late-reply.ts: pressAnswer(press, { onlyPrivate }) decides how a press on
  the controls of an answer is answered: `update` (the answer itself, for
  the member who asked it, read from message.interactionMetadata.user, or
  for any press on a private answer) or `copy` (a private copy for anybody
  else; also for the asker when what the press shows is private, a
  Pokebox). deferPress acknowledges a press whose work takes time as it
  will be answered (deferUpdate, or a private deferReply; a form submitted
  from no message has nothing to update and is deferred as a copy),
  answerPress shows the V2 message: update, a private reply, or an edit of
  what was acknowledged. Decision: a message without interaction metadata
  counts as nobody's (a copy), never as the presser's.
- ComponentHandler.throttle may be a function of the interaction and its
  custom id, asked after the guards (as a command's): undefined lets the
  control through uncounted, and each limit is counted by itself. A limit
  with `as` (ControlThrottle) counts in the window of that command, as
  the router counts the command's uses, and its refusal names the command
  ("You can use /counters again in …"): the dialog of /counters runs the
  command's work against Pokebattler, so command and submits share one
  window of three a minute. Without `as` a control counts in its kind's
  own window (component:<kind>), as /rank's and /help's do.
- The fake interactions refuse a form Discord would refuse (checkModal:
  title, 1 to 5 components, labels of 45, unique custom ids, and its menus
  as checkMenu checks them; a menu that may stay empty, min_values 0, must
  say required false). A submitted fake form is as strict as discord.js:
  reading an input it did not submit, or as another type, throws. Given
  the form the opener showed (`form`), it submits every input of it (a
  text left empty as '', an unticked checkbox group or an optional menu as
  []), needs a value for a required menu and refuses values for inputs it
  does not have. It carries ticked groups (`checked`,
  fields.getCheckboxGroup), and a control says who asked for its message
  (`askedBy`) and whether it is private (`ephemeralMessage`).
- The fake gateway's components-v2 check refuses a button or a select menu
  outside a row (a button beside a section stays allowed), a row with a
  menu and anything else, and a menu that checkMenu refuses (1 to 25
  options, labels and values of 1 to 100, values unique, min and max
  within the options, no more defaults than may be chosen, a placeholder
  of 150); the custom id of a menu counts with the buttons' as unique.
  checkMenu (test/support/fake-gateway.ts) is shared with checkModal.
- The /gym test helper submits the form the bot showed under that custom
  id; one test of a refused form now opens the form first, as a member
  must.

**Files:**

```
 src/commands/gyms/gym.test.ts          |   1 +
 src/discord/command.ts                 |  22 ++++-
 src/discord/late-reply.test.ts         |  85 ++++++++++++++++++-
 src/discord/late-reply.ts              |  62 ++++++++++++++
 src/discord/router.test.ts             |  64 ++++++++++++++
 src/discord/router.ts                  |  28 +++++--
 test/support/fake-gateway.test.ts      |  58 +++++++++++++
 test/support/fake-gateway.ts           |  90 +++++++++++++++++++-
 test/support/fake-interactions.test.ts | 150 ++++++++++++++++++++++++++++++++-
 test/support/fake-interactions.ts      | 241 +++++++++++++++++++++++++++++++++++++++++++++++++++--
 test/support/gym-commands.ts           |  11 ++-
 11 files changed, 784 insertions(+), 28 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/gyms/gym.test.ts src/discord/late-reply.test.ts src/discord/router.test.ts test/support/fake-gateway.test.ts test/support/fake-interactions.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff cceaf687d01d38a33f9f2ba444d5beebf2c096cc -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Controls of a public answer, a throttle per control, and forms checked in the fakes`, the body above and the trailer, staging exactly
  `src/commands/gyms/gym.test.ts src/discord/command.ts src/discord/late-reply.test.ts src/discord/late-reply.ts src/discord/router.test.ts src/discord/router.ts test/support/fake-gateway.test.ts test/support/fake-gateway.ts test/support/fake-interactions.test.ts test/support/fake-interactions.ts test/support/gym-commands.ts`.

````diff
diff --git a/src/commands/gyms/gym.test.ts b/src/commands/gyms/gym.test.ts
index 335cca0f7738551d284a9ca6ef3f09e9651bb785..57bdf9819d51c0642957adff61b76d6132f86b72 100644
--- a/src/commands/gyms/gym.test.ts
+++ b/src/commands/gyms/gym.test.ts
@@ -568,6 +568,7 @@ describe('/gym add', () => {
   it('adds nothing when a refused form is given up', async () => {
     const made = await gymCommandsWith();
     const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
+    await made.press(buttonId(question, 'Add with details…'));
     const formId = buttonId(question, 'Add with details…').replace(/details$/, 'form');
     const refused = await made.submit(formId, { keywords: 'k'.repeat(52) });
     const cancelled = await made.press(buttonId(sent(refused.update), 'Cancel'));
diff --git a/src/discord/command.ts b/src/discord/command.ts
index 91ea63fa1249842f6e7387bd2f6783650849bb12..82209d2db12511a518788143974973234b72b4e8 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -213,14 +213,32 @@ export function declaredSubcommands(
  * implements only what it puts on screen; anything else with its kind is answered as a control
  * that is no longer active. List every handler in `src/components/index.ts`.
  */
+/**
+ * The limit of a control. `as` names the command whose window it shares, as the router counts
+ * that command's uses (its name, `counters`; a subcommand as `name path`): a control that runs
+ * the work of a command that protects an outside service (`/counters`' dialog and Pokebattler)
+ * counts together with the command. Without it the control counts in its kind's own window
+ * (`component:<kind>`).
+ */
+export type ControlThrottle = Throttle & { as?: string };
+
 export interface ComponentHandler {
   kind: string;
   guards?: readonly Guard[];
   /**
    * How often one member may use the controls of this kind, all of them together. A use counts
-   * once the guards have let it through.
+   * once the guards have let it through. A function, asked after the guards, for a kind some of
+   * whose controls do the work of a command again and others not (`/counters`: a submitted form
+   * runs a new simulation, the button that opens it does not): undefined lets a control through
+   * uncounted, and each limit it gives is counted by itself. A limit with `as` is counted in the
+   * window of that command instead (`ControlThrottle`).
    */
-  throttle?: Throttle;
+  throttle?:
+    | Throttle
+    | ((
+        interaction: MessageComponentInteraction | ModalSubmitInteraction,
+        id: CustomId,
+      ) => ControlThrottle | undefined);
   button?: (interaction: ButtonInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   select?: (interaction: AnySelectMenuInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   modal?: (interaction: ModalSubmitInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
diff --git a/src/discord/late-reply.test.ts b/src/discord/late-reply.test.ts
index 988475dc6fecd388645b0f57592dc517fb9eb33c..27319428367cb37f021b6de3d612d574bb9df0d5 100644
--- a/src/discord/late-reply.test.ts
+++ b/src/discord/late-reply.test.ts
@@ -1,11 +1,24 @@
-import { MessageFlags, type ChatInputCommandInteraction, type Interaction } from 'discord.js';
+import {
+  MessageFlags,
+  type ButtonInteraction,
+  type ChatInputCommandInteraction,
+  type Interaction,
+  type ModalSubmitInteraction,
+} from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
-import { fakeChatInput } from '../../test/support/fake-interactions.js';
+import { fakeButton, fakeChatInput, fakeModal } from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { SimpleCommand } from './command.js';
 import { UserError } from './errors.js';
 import { container, textDisplay } from '../render/v2.js';
-import { answer, LATE_DEFER_MS, v2Answer } from './late-reply.js';
+import {
+  answer,
+  answerPress,
+  deferPress,
+  LATE_DEFER_MS,
+  pressAnswer,
+  v2Answer,
+} from './late-reply.js';
 import type { V2Message } from './party-gateway.js';
 import { InteractionRouter } from './router.js';
 
@@ -235,3 +248,69 @@ describe('answer', () => {
     });
   });
 });
+
+describe('a press on the controls of an answer', () => {
+  const ASKER = '700000000000000001';
+  const OTHER = '700000000000000002';
+  const message: V2Message = { v2: true, components: [container(0x5865f2, [textDisplay('x')])] };
+  const V2_PRIVATE = { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
+
+  it('changes a public answer when its asker pressed, and gives anybody else a copy', async () => {
+    const own = fakeButton({ customId: 'a:1:b', userId: ASKER, askedBy: ASKER });
+    expect(pressAnswer(own as unknown as ButtonInteraction)).toBe('update');
+    await answerPress(own as unknown as ButtonInteraction, 'update', message);
+    expect(own.update).toHaveBeenCalledExactlyOnceWith(v2Answer(message));
+
+    const other = fakeButton({ customId: 'a:1:b', userId: OTHER, askedBy: ASKER });
+    expect(pressAnswer(other as unknown as ButtonInteraction)).toBe('copy');
+    await answerPress(other as unknown as ButtonInteraction, 'copy', message);
+    expect(other.reply).toHaveBeenCalledExactlyOnceWith({
+      components: message.components,
+      ...V2_PRIVATE,
+    });
+    expect(other.update).not.toHaveBeenCalled();
+    // Without metadata nobody is known to have asked: a copy.
+    expect(pressAnswer(fakeButton({ customId: 'a:1:b' }) as unknown as ButtonInteraction)).toBe(
+      'copy',
+    );
+  });
+
+  it('always changes a private answer, and never shows what is private in a public one', () => {
+    const own = fakeButton({ customId: 'a:1:b', userId: ASKER, ephemeralMessage: true });
+    expect(pressAnswer(own as unknown as ButtonInteraction)).toBe('update');
+    expect(pressAnswer(own as unknown as ButtonInteraction, { onlyPrivate: true })).toBe('update');
+    const asker = fakeButton({ customId: 'a:1:b', userId: ASKER, askedBy: ASKER });
+    expect(pressAnswer(asker as unknown as ButtonInteraction, { onlyPrivate: true })).toBe('copy');
+  });
+
+  it('acknowledges first as it will answer, and then edits what it acknowledged', async () => {
+    const own = fakeModal({ customId: 'a:1:form', userId: ASKER, askedBy: ASKER });
+    await deferPress(own as unknown as ModalSubmitInteraction, 'update');
+    expect(own.deferUpdate).toHaveBeenCalledOnce();
+    await answerPress(own as unknown as ModalSubmitInteraction, 'update', message);
+    expect(own.editReply).toHaveBeenCalledExactlyOnceWith(v2Answer(message));
+
+    const other = fakeModal({ customId: 'a:1:form', userId: OTHER, askedBy: ASKER });
+    await deferPress(other as unknown as ModalSubmitInteraction, 'copy');
+    expect(other.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
+    await answerPress(other as unknown as ModalSubmitInteraction, 'copy', message);
+    expect(other.editReply).toHaveBeenCalledExactlyOnceWith(v2Answer(message));
+  });
+
+  it('updates the message a form came from, and answers privately a form that came from none', async () => {
+    const fromMessage = fakeModal({ customId: 'a:1:form', userId: ASKER, askedBy: ASKER });
+    await answerPress(fromMessage as unknown as ModalSubmitInteraction, 'update', message);
+    expect(fromMessage.update).toHaveBeenCalledOnce();
+    const fromCommand = fakeModal({ customId: 'a:1:form', modalFromCommand: true });
+    await answerPress(fromCommand as unknown as ModalSubmitInteraction, 'update', message);
+    expect(fromCommand.reply).toHaveBeenCalledExactlyOnceWith({
+      components: message.components,
+      ...V2_PRIVATE,
+    });
+    // Acknowledged first, it is a private "thinking…", which the answer then edits.
+    const slow = fakeModal({ customId: 'a:1:form', modalFromCommand: true });
+    await deferPress(slow as unknown as ModalSubmitInteraction, 'update');
+    expect(slow.deferUpdate).not.toHaveBeenCalled();
+    expect(slow.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
+  });
+});
diff --git a/src/discord/late-reply.ts b/src/discord/late-reply.ts
index ab1a7ee0161f882624f2cf2de420289b547067a6..5c09c18badb44c03dc1b222ca1603da77a5e8026 100644
--- a/src/discord/late-reply.ts
+++ b/src/discord/late-reply.ts
@@ -1,6 +1,7 @@
 import {
   MessageFlags,
   type ChatInputCommandInteraction,
+  type Message,
   type InteractionReplyOptions,
   type MessageComponentInteraction,
   type ModalSubmitInteraction,
@@ -120,3 +121,64 @@ export async function answer(interaction: Answerable, payload: AnswerPayload): P
   else
     await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral | (payload.flags ?? 0) });
 }
+
+/** A press on a control of an answer, or a form one of them opened. */
+export type Press = MessageComponentInteraction | ModalSubmitInteraction;
+
+/**
+ * How a press on the controls of an answer is answered (plan 8B-2): `update` changes the answer
+ * itself, `copy` gives the presser a private copy with the change and leaves the answer as it
+ * was. A public answer (`/counters` in a post, `/rank`) is changed for everybody only by the
+ * member who asked for it, `message.interactionMetadata.user` (never the deprecated
+ * `interaction`); a private answer only its member sees, so a press on it always changes it.
+ * `onlyPrivate`: what the press shows is for the presser alone (a Pokébox), so a public answer
+ * is never changed into it, not even by its asker.
+ */
+export type PressAnswer = 'update' | 'copy';
+
+export function pressAnswer(press: Press, options: { onlyPrivate?: boolean } = {}): PressAnswer {
+  const message: Message | null = press.message;
+  if (!message) return 'copy';
+  if (message.flags.has(MessageFlags.Ephemeral)) return 'update';
+  if (options.onlyPrivate === true) return 'copy';
+  return message.interactionMetadata?.user.id === press.user.id ? 'update' : 'copy';
+}
+
+/**
+ * Acknowledges a press whose work takes time (Pokebattler), as it will be answered: `update`
+ * with `deferUpdate` (the answer stays as it is until `answerPress` edits it), `copy` with a
+ * private "thinking…".
+ */
+export async function deferPress(press: Press, how: PressAnswer): Promise<void> {
+  // A form that came from no message has no message to update: it is answered as a copy.
+  const updatable = press.isMessageComponent() || press.isFromMessage();
+  if (how === 'update' && updatable) await press.deferUpdate();
+  else await press.deferReply({ flags: MessageFlags.Ephemeral });
+}
+
+/**
+ * Shows `message` as the answer to a press, as `how` says: the answer itself changed, or a
+ * private copy. After `deferPress` it edits what that acknowledged.
+ */
+export async function answerPress(
+  press: Press,
+  how: PressAnswer,
+  message: V2Message,
+): Promise<void> {
+  const payload = v2Answer(message);
+  if (press.deferred || press.replied) {
+    await press.editReply(payload);
+    return;
+  }
+  if (how === 'update') {
+    if (press.isMessageComponent()) {
+      await press.update(payload);
+      return;
+    }
+    if (press.isFromMessage()) {
+      await press.update(payload);
+      return;
+    }
+  }
+  await press.reply({ ...payload, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
+}
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index 7eaec35f06262827a41712424d66f549d4822488..9436347e75e66ae21ea69ddac618e7a597152b42 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -877,6 +877,70 @@ describe('InteractionRouter', () => {
     expect(button).toHaveBeenCalledTimes(3);
   });
 
+  it('asks a kind whose controls count differently which limit a control has', async () => {
+    const { ctx } = createTestContext();
+    const button = ran();
+    const modal = ran();
+    const router = new InteractionRouter(
+      ctx,
+      [],
+      [
+        {
+          kind: 'p',
+          // Opening the form is free; submitting it counts, one in a minute.
+          throttle: (_interaction, id) =>
+            id.action === 'form' ? { uses: 1, perSeconds: 60 } : undefined,
+          button,
+          modal,
+        },
+      ],
+    );
+    for (let n = 0; n < 3; n++) {
+      await router.handle(asInteraction(fakeButton({ customId: 'p:abc:open' })));
+    }
+    const submit = async () => {
+      const i = fakeModal({ customId: 'p:abc:form' });
+      await router.handle(asInteraction(i));
+      return i;
+    };
+    await submit();
+    const second = await submit();
+    expect(button).toHaveBeenCalledTimes(3);
+    expect(modal).toHaveBeenCalledTimes(1);
+    expect(second.reply).toHaveBeenCalledWith({
+      content: 'That was a lot of clicks. Try again in 1 minute.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('counts a control that names a command in that command’s window', async () => {
+    const { ctx } = createTestContext();
+    const execute = ran();
+    const modal = ran();
+    const cmd = command({ throttle: { uses: 2, perSeconds: 60 }, execute });
+    const router = new InteractionRouter(
+      ctx,
+      [cmd],
+      [
+        {
+          kind: 'p',
+          throttle: (_interaction, id) =>
+            id.action === 'form' ? { uses: 2, perSeconds: 60, as: 'test' } : undefined,
+          modal,
+        },
+      ],
+    );
+    await router.handle(asInteraction(fakeChatInput({ commandName: 'test' })));
+    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
+    const third = fakeModal({ customId: 'p:abc:form' });
+    await router.handle(asInteraction(third));
+    const fourth = fakeChatInput({ commandName: 'test' });
+    await router.handle(asInteraction(fourth));
+    expect([execute.mock.calls.length, modal.mock.calls.length]).toEqual([1, 1]);
+    expect(sent(third.reply).content).toBe('You can use /test again in 1 minute.');
+    expect(sent(fourth.reply).content).toBe('You can use /test again in 1 minute.');
+  });
+
   it('keeps the budget of a kind of control apart from a command of a like name', async () => {
     const { ctx } = createTestContext();
     const execute = ran();
diff --git a/src/discord/router.ts b/src/discord/router.ts
index f126f7e976f4fae76a20b1a98e41016b21687423..f1415b78a50618937d07ce5048cafa0581566f7c 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -14,6 +14,7 @@ import {
   type CommandHandler,
   type CommandModule,
   type ComponentHandler,
+  type ControlThrottle,
   type Guard,
   type GuardableInteraction,
   type LocatedInteraction,
@@ -254,7 +255,7 @@ export class InteractionRouter {
     const handler = id ? this.components.get(id.kind) : undefined;
     await this.guarded(interaction, async () => {
       const run = id && handler ? runnerFor(handler, interaction, id, this.ctx) : undefined;
-      if (!handler || !run) {
+      if (!id || !handler || !run) {
         // Not a custom id of this bot (or of its legacy version), a kind nobody handles any more,
         // or a kind that has no control of this type.
         const reason = !id ? 'undecodable' : !handler ? 'unknown-kind' : 'no-such-control';
@@ -265,15 +266,24 @@ export class InteractionRouter {
         throw new UserError(STALE_COMPONENT);
       }
       await runGuards(handler.guards ?? [], interaction, this.ctx);
-      if (handler.throttle) {
-        const wait = this.throttles.use(
-          `component:${handler.kind}`,
-          interaction.user.id,
-          handler.throttle,
-          this.now(),
-        );
+      const varies = typeof handler.throttle === 'function';
+      const throttle: ControlThrottle | undefined =
+        typeof handler.throttle === 'function'
+          ? handler.throttle(interaction, id)
+          : handler.throttle;
+      if (throttle) {
+        // A limit shared with a command counts in that command's window, as the command's uses
+        // are counted; the others in the kind's own, each limit by itself where they vary.
+        const key = `component:${handler.kind}`;
+        const counted =
+          throttle.as ?? (varies ? `${key}\n${throttle.perSeconds}/${throttle.uses}` : key);
+        const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
         if (wait !== undefined) {
-          throw new UserError(`That was a lot of clicks. Try again in ${waitText(wait)}.`);
+          throw new UserError(
+            throttle.as === undefined
+              ? `That was a lot of clicks. Try again in ${waitText(wait)}.`
+              : `You can use /${throttle.as} again in ${waitText(wait)}.`,
+          );
         }
       }
       await run();
diff --git a/test/support/fake-gateway.test.ts b/test/support/fake-gateway.test.ts
index 16c1e0ac9e4da20319da3f21152359b83bd65f13..73a83d2a347cdc3afa658befa0af3490891036ca 100644
--- a/test/support/fake-gateway.test.ts
+++ b/test/support/fake-gateway.test.ts
@@ -415,6 +415,64 @@ describe('FakePartyGateway: the limits of a components-v2 message', () => {
     );
   });
 
+  it('refuses a select menu Discord would refuse, and a control outside a row', async () => {
+    const row = (...items: object[]) => ({ type: ComponentType.ActionRow, components: items });
+    const menu = (custom_id: string, n: number, extra: object = {}) => ({
+      type: ComponentType.StringSelect,
+      custom_id,
+      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
+      ...extra,
+    });
+    const refusal = (what: string) => `Invalid Form Body: a select menu: ${what}`;
+    expect(await sending(message(row(menu('m', 25)), row(button('b'))))).toBe('sent');
+    expect(await sending(message(row(menu('m', 26))))).toBe(refusal('1 to 25 options, not 26'));
+    expect(await sending(message(row(menu('m', 2), button('b'))))).toBe(
+      'Invalid Form Body: a row with a select menu holds that menu alone',
+    );
+    expect(await sending(message(row(menu('a', 2)), row(button('a'))))).toBe(
+      'Invalid Form Body: the custom id a is used twice in the message',
+    );
+    expect(
+      await sending(
+        message(row(menu('m', 1, { options: [{ label: 'x'.repeat(101), value: 'v' }] }))),
+      ),
+    ).toBe(refusal("an option's label and value of 1 to 100 characters"));
+    expect(
+      await sending(
+        message(
+          row(
+            menu('m', 1, {
+              options: [
+                { label: 'a', value: 'v' },
+                { label: 'b', value: 'v' },
+              ],
+            }),
+          ),
+        ),
+      ),
+    ).toBe(refusal('the value v twice'));
+    expect(await sending(message(row(menu('m', 2, { max_values: 3 }))))).toBe(
+      refusal('min_values 1 and max_values 3 with 2 options'),
+    );
+    const ticked = menu('m', 2, {
+      options: [
+        { label: 'a', value: 'a', default: true },
+        { label: 'b', value: 'b', default: true },
+      ],
+    });
+    expect(await sending(message(row(ticked)))).toBe(
+      refusal('2 options ticked by default, at most 1'),
+    );
+    // A message's menu may be left empty without saying anything more.
+    expect(await sending(message(row(menu('m', 2, { min_values: 0 }))))).toBe('sent');
+    expect(await sending(message(menu('m', 2)))).toBe(
+      'Invalid Form Body: a select menu stands only in a row',
+    );
+    expect(await sending(message(button('b')))).toBe(
+      'Invalid Form Body: a button stands only in a row or beside a section',
+    );
+  });
+
   it('refuses a thumbnail that is not at an https address', async () => {
     const section = {
       type: ComponentType.Section,
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 323d3a34d46c9b84fb0e28d780ae7b245b652467..46913f4ac845939290d208bd882c1befb6c954f0 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -72,6 +72,61 @@ export function emptyMessage(): DiscordAPIError {
 /** What the bot keeps the text of a v2 message to (Discord documents no total). */
 const TEXT_LIMIT = 4000;
 
+/** A menu as Discord checks it: a string select (of a message or a form) or a checkbox group. */
+export interface MenuLike {
+  options?: { label?: unknown; value?: unknown; description?: unknown; default?: unknown }[];
+  min_values?: number;
+  max_values?: number;
+  required?: boolean;
+  placeholder?: unknown;
+}
+
+/**
+ * Refuses a menu Discord would refuse, through `fail`: 1 to `most` options (25 for a select, 10
+ * for a checkbox group), each with a label and a value of 1 to 100 characters and a description
+ * of at most 100, values unique; `min_values` (1 when not given) from 0 and `max_values` (1 for
+ * a select, every option for a group, when not given) from 1, both within the options and in
+ * order; no more options ticked by default than may be chosen; a placeholder of at most 150. In
+ * a form (`inForm`) a menu may be left empty (`min_values: 0`) only when it says `required:
+ * false`.
+ */
+export function checkMenu(
+  menu: MenuLike,
+  shape: { most: number; group: boolean; inForm: boolean },
+  fail: (what: string) => never,
+): void {
+  const options = menu.options ?? [];
+  if (options.length < 1 || options.length > shape.most) {
+    fail(`1 to ${shape.most} options, not ${options.length}`);
+  }
+  const values = new Set<unknown>();
+  for (const option of options) {
+    for (const text of [option.label, option.value]) {
+      if (typeof text !== 'string' || text.length < 1 || text.length > 100) {
+        fail("an option's label and value of 1 to 100 characters");
+      }
+    }
+    if (typeof option.description === 'string' && option.description.length > 100) {
+      fail("an option's description of at most 100 characters");
+    }
+    if (values.has(option.value)) fail(`the value ${String(option.value)} twice`);
+    values.add(option.value);
+  }
+  const min = menu.min_values ?? 1;
+  const max = menu.max_values ?? (shape.group ? options.length : 1);
+  if (min < 0 || min > options.length || max < 1 || max > options.length || min > max) {
+    fail(`min_values ${min} and max_values ${max} with ${options.length} options`);
+  }
+  if (shape.inForm && min === 0 && menu.required !== false) {
+    fail('min_values 0 in a form needs required false');
+  }
+  const ticked = options.filter((option) => option.default === true).length;
+  if (ticked > max) fail(`${ticked} options ticked by default, at most ${max}`);
+  if (typeof menu.placeholder === 'string' && menu.placeholder.length > 150) {
+    fail('a placeholder of at most 150 characters');
+  }
+}
+
 /** A component of a v2 message as the fake looks at it: its type and whatever else it has. */
 interface V2Component {
   type: ComponentType;
@@ -345,8 +400,9 @@ export class FakePartyGateway implements PartyGateway {
    * text displays (Discord documents no total: the bot keeps to this), a text display of at
    * least one character, a section of one to three text displays and a button or thumbnail
    * beside them, a row of one to five controls, a label of at most 80 characters, a custom id of
-   * at most 100 that no other control of the message has, a thumbnail by an https address, and
-   * no container but at the top.
+   * at most 100 that no other control of the message has, buttons and select menus in rows (a
+   * button also beside a section), a select menu alone in its row and as `checkMenu` says, a
+   * thumbnail by an https address, and no container but at the top.
    */
   private static checkV2(message: OutgoingMessage, textLimit: number): void {
     const refuse = (what: string): never => {
@@ -364,8 +420,22 @@ export class FakePartyGateway implements PartyGateway {
       refuse('a container cannot be inside another component');
     }
     const accessories = new Set(all.map((component) => component.accessory));
+    // What stands in a row of controls: a button or a select menu stands nowhere else (a button
+    // also beside a section).
+    const inRows = new Set(
+      all
+        .filter((component) => component.type === ComponentType.ActionRow)
+        .flatMap((row) => (Array.isArray(row.components) ? (row.components as unknown[]) : [])),
+    );
     let text = 0;
     const ids = new Set<string>();
+    const useId = (id: unknown, what: string): void => {
+      if (typeof id !== 'string' || id.length > 100) {
+        refuse(`${what} has a custom id of at most 100 characters`);
+      }
+      if (ids.has(id as string)) refuse(`the custom id ${String(id)} is used twice in the message`);
+      ids.add(id as string);
+    };
     for (const component of all) {
       const inner = (
         Array.isArray(component.components) ? component.components : []
@@ -397,8 +467,21 @@ export class FakePartyGateway implements PartyGateway {
           if (inner.length < 1 || inner.length > 5) {
             refuse(`a row has 1 to 5 controls, not ${inner.length}`);
           }
+          if (inner.length > 1 && inner.some((child) => child.type !== ComponentType.Button)) {
+            refuse('a row with a select menu holds that menu alone');
+          }
+          break;
+        case ComponentType.StringSelect:
+          if (!inRows.has(component)) refuse('a select menu stands only in a row');
+          checkMenu(component as MenuLike, { most: 25, group: false, inForm: false }, (what) =>
+            refuse(`a select menu: ${what}`),
+          );
+          useId(component.custom_id, 'a select menu');
           break;
         case ComponentType.Button: {
+          if (!inRows.has(component) && !accessories.has(component)) {
+            refuse('a button stands only in a row or beside a section');
+          }
           const label = typeof component.label === 'string' ? component.label : '';
           if (label.length > 80) refuse('a button label has at most 80 characters');
           const link = component.style === ButtonStyle.Link;
@@ -411,8 +494,7 @@ export class FakePartyGateway implements PartyGateway {
           const id = component.custom_id;
           if (typeof id === 'string') {
             if (id.length > 100) refuse('a custom id has at most 100 characters');
-            if (ids.has(id)) refuse(`the custom id ${id} is used twice in the message`);
-            ids.add(id);
+            useId(id, 'a button');
           }
           break;
         }
diff --git a/test/support/fake-interactions.test.ts b/test/support/fake-interactions.test.ts
index 06900b677dc2e9be8a5901db4ca6277da528b925..1652432f862dd2ce3545e23aacbf0e9e679157e8 100644
--- a/test/support/fake-interactions.test.ts
+++ b/test/support/fake-interactions.test.ts
@@ -1,8 +1,9 @@
-import { MessageFlags, PermissionFlagsBits } from 'discord.js';
+import { ComponentType, MessageFlags, PermissionFlagsBits } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
   FAKE_CHANNEL_ID,
   FAKE_PARENT_ID,
+  checkModal,
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
@@ -12,6 +13,13 @@ import {
   sent,
 } from './fake-interactions.js';
 
+/** A form Discord takes: one label with a text input. */
+const FORM = {
+  custom_id: 'p:1:form',
+  title: 'A form',
+  components: [{ type: 18, label: 'Time', component: { type: 4, custom_id: 'time', style: 1 } }],
+};
+
 describe('fake interactions', () => {
   it('says what kind of interaction it is', () => {
     expect(fakeChatInput().isChatInputCommand()).toBe(true);
@@ -32,7 +40,7 @@ describe('fake interactions', () => {
     const modal = fakeModal({ customId: 'p:1:time', fields: { time: '6pm' } });
     expect([modal.isModalSubmit(), modal.isMessageComponent()]).toEqual([true, false]);
     expect(modal.fields.getTextInputValue('time')).toBe('6pm');
-    expect(modal.fields.getTextInputValue('other')).toBe('');
+    expect(() => modal.fields.getTextInputValue('other')).toThrow(/FieldNotFound/);
   });
 
   it('shows a member with the roles of `roleIds` that the server has, and @everyone', () => {
@@ -137,7 +145,7 @@ describe('fake interactions', () => {
     await expect(button.deferUpdate()).rejects.toThrow(/InteractionAlreadyReplied/);
 
     const opener = fakeButton({ customId: 'p:1:time' });
-    await opener.showModal({});
+    await opener.showModal(FORM);
     expect(opener.replied).toBe(true);
 
     const deferred = fakeButton({ customId: 'p:1:join' });
@@ -296,3 +304,139 @@ describe('the files of the message a control is on', () => {
     expect((await added.fetchReply()).attachments).toEqual(['f1', 'f2']);
   });
 });
+
+describe('the forms a control opens', () => {
+  const select = (custom_id: string, n: number, extra: object = {}) => ({
+    type: ComponentType.Label,
+    label: 'Pick',
+    component: {
+      type: ComponentType.StringSelect,
+      custom_id,
+      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
+      ...extra,
+    },
+  });
+  const boxes = (custom_id: string, n: number, extra: object = {}) => ({
+    type: ComponentType.Label,
+    label: 'Tick',
+    component: {
+      type: ComponentType.CheckboxGroup,
+      custom_id,
+      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
+      ...extra,
+    },
+  });
+  const form = (components: object[], title = 'A form') => ({
+    custom_id: 'a:1:form',
+    title,
+    components,
+  });
+
+  it('takes what Discord takes: labels with selects, checkbox groups and text inputs', () => {
+    expect(() =>
+      checkModal(
+        form([
+          select('b', 25),
+          boxes('c', 10, { min_values: 0, required: false }),
+          FORM.components[0] as object,
+        ]),
+      ),
+    ).not.toThrow();
+    expect(() => checkModal(form([select('a', 25, { options: undefined })]))).toThrow(
+      /1 to 25 options, not 0/,
+    );
+  });
+
+  it('refuses what Discord refuses', () => {
+    const six = Array.from({ length: 6 }, (_, i) => select(`s${i}`, 2));
+    expect(() => checkModal(form(six))).toThrow(/1 to 5 components, not 6/);
+    expect(() => checkModal(form([select('a', 2)], 'x'.repeat(46)))).toThrow(/a title of 1 to 45/);
+    expect(() => checkModal(form([{ ...select('a', 2), label: 'x'.repeat(46) }]))).toThrow(
+      /a label of 1 to 45/,
+    );
+    expect(() => checkModal(form([select('a', 26)]))).toThrow(/1 to 25 options, not 26/);
+    expect(() => checkModal(form([boxes('a', 11)]))).toThrow(/1 to 10 options, not 11/);
+    expect(() => checkModal(form([select('a', 2), select('a', 2)]))).toThrow(/not unique/);
+    expect(() => checkModal(form([select('a:1:form', 2)]))).toThrow(/not unique/);
+    const twoTicked = select('a', 3, {
+      options: [
+        { label: 'One', value: '1', default: true },
+        { label: 'Two', value: '2', default: true },
+      ],
+    });
+    expect(() => checkModal(form([twoTicked]))).toThrow(/2 options ticked by default, at most 1/);
+    expect(() =>
+      checkModal(
+        form([
+          select('a', 1, {
+            options: [
+              { label: 'One', value: '1' },
+              { label: 'Again', value: '1' },
+            ],
+          }),
+        ]),
+      ),
+    ).toThrow(/the value 1 twice/);
+    expect(() => checkModal(form([select('a', 2, { max_values: 3 })]))).toThrow(/max_values 3/);
+    expect(() => checkModal(form([{ type: ComponentType.Button }]))).toThrow(/no component/);
+  });
+
+  it('is checked when a form is shown, and carries what was chosen and ticked back', async () => {
+    const opener = fakeButton({ customId: 'a:1:open' });
+    await expect(opener.showModal(form([select('a', 26)]))).rejects.toThrow(/26/);
+    expect(opener.replied).toBe(false);
+    const submitted = fakeModal({
+      customId: 'a:1:form',
+      selected: { a: ['v1'] },
+      checked: { c: ['v0', 'v2'] },
+    });
+    expect(submitted.fields.getStringSelectValues('a')).toEqual(['v1']);
+    expect(submitted.fields.getCheckboxGroup('c')).toEqual(['v0', 'v2']);
+    expect(() => submitted.fields.getCheckboxGroup('none')).toThrow(/FieldNotFound/);
+    // An input read as another type than it is: as discord.js, an error.
+    expect(() => submitted.fields.getCheckboxGroup('a')).toThrow(/FieldNotFound/);
+    expect(() => submitted.fields.getTextInputValue('a')).toThrow(/FieldNotFound/);
+  });
+
+  it('submits every input of the form the opener showed, and nothing else', () => {
+    const shown = form([
+      select('a', 3),
+      select('b', 3, { min_values: 0, required: false }),
+      boxes('c', 3, { min_values: 0, required: false }),
+      FORM.components[0] as object,
+    ]);
+    const submitted = fakeModal({ customId: 'a:1:form', form: shown, selected: { a: ['v2'] } });
+    expect(submitted.fields.getStringSelectValues('a')).toEqual(['v2']);
+    // Left empty: an optional menu, an unticked group, a text nobody typed.
+    expect(submitted.fields.getStringSelectValues('b')).toEqual([]);
+    expect(submitted.fields.getCheckboxGroup('c')).toEqual([]);
+    expect(submitted.fields.getTextInputValue('time')).toBe('');
+    expect(() => fakeModal({ customId: 'a:1:form', form: shown })).toThrow(
+      /no value for its required menu a/,
+    );
+    expect(() =>
+      fakeModal({ customId: 'a:1:form', form: shown, selected: { a: ['v1'], z: ['v1'] } }),
+    ).toThrow(/has no input z/);
+    expect(() =>
+      fakeModal({ customId: 'a:1:form', form: shown, selected: { a: ['v1'] }, checked: { a: [] } }),
+    ).toThrow(/no such/);
+  });
+
+  it('refuses a menu of a form that may stay empty without saying it is not required', () => {
+    expect(() => checkModal(form([select('a', 2, { min_values: 0 })]))).toThrow(
+      /min_values 0 in a form needs required false/,
+    );
+    expect(() => checkModal(form([boxes('a', 2, { min_values: 0 })]))).toThrow(
+      /min_values 0 in a form needs required false/,
+    );
+  });
+
+  it('says who asked for the message a control is on, and whether it is private', () => {
+    const pressed = fakeButton({ customId: 'a:1:x', askedBy: '700000000000000009' });
+    expect(pressed.message?.interactionMetadata?.user.id).toBe('700000000000000009');
+    expect(pressed.message?.flags.has(MessageFlags.Ephemeral)).toBe(false);
+    const own = fakeButton({ customId: 'a:1:x', ephemeralMessage: true });
+    expect(own.message?.interactionMetadata).toBeNull();
+    expect(own.message?.flags.has(MessageFlags.Ephemeral)).toBe(true);
+  });
+});
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index fe4ed9bb9c8c33d086cac8e8994d61ac209dc360..8f4cee430ce410af911757d31690b7994ebb8c03 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -1,5 +1,6 @@
 import {
   Collection,
+  ComponentType,
   MessageFlags,
   MessageFlagsBitField,
   PermissionsBitField,
@@ -7,7 +8,7 @@ import {
 } from 'discord.js';
 import { vi } from 'vitest';
 import type { V2Message } from '../../src/discord/party-gateway.js';
-import { FakePartyGateway } from './fake-gateway.js';
+import { checkMenu, FakePartyGateway, type MenuLike } from './fake-gateway.js';
 
 /** What a test may want to read back from a reply, follow-up or edit. */
 export interface SentPayload {
@@ -98,6 +99,13 @@ export interface FakeOptions {
   fields?: Record<string, string>;
   /** Modal: what was chosen in each select menu of the form, by the menu's custom id. */
   selected?: Record<string, string[]>;
+  /** Modal: what was ticked in each checkbox group of the form, by the group's custom id. */
+  checked?: Record<string, string[]>;
+  /**
+   * Modal: the form the opener showed (as passed to `showModal`). The submitted form then has
+   * every input of it, and refuses values for inputs it does not have (`submittedForm`).
+   */
+  form?: unknown;
   /**
    * Modal: the form was opened by a slash command, not by a control of a message
    * (`isFromMessage()` is then false: there is no message to update).
@@ -116,6 +124,14 @@ export interface FakeOptions {
    * `messageRows`.
    */
   message?: FakeMessage;
+  /**
+   * A control (or a form it opened): the member whose command made the message it is on, as
+   * Discord says it (`interaction.message.interactionMetadata.user`); without it the message
+   * has no metadata.
+   */
+  askedBy?: string;
+  /** A control: the message it is on is private (`interaction.message.flags` has Ephemeral). */
+  ephemeralMessage?: boolean;
 }
 
 /** A row of controls as Discord's API has it. */
@@ -235,6 +251,197 @@ function refuseInvalid(payload: SentPayload | undefined): Promise<never> | undef
   }
 }
 
+/** Discord's limits for a form (a modal), as its documentation gives them. */
+const MODAL = {
+  title: 45,
+  customId: 100,
+  components: 5,
+  label: 45,
+  labelDescription: 100,
+  selectOptions: 25,
+  checkboxOptions: 10,
+} as const;
+
+/** The data of a form, from a builder's `toJSON()` or as given. */
+function formData(modal: unknown): { custom_id?: string; title?: string; components?: unknown[] } {
+  const built =
+    typeof modal === 'object' &&
+    modal !== null &&
+    typeof (modal as { toJSON?: unknown }).toJSON === 'function';
+  return (built ? (modal as { toJSON(): unknown }).toJSON() : (modal ?? {})) as {
+    custom_id?: string;
+    title?: string;
+    components?: unknown[];
+  };
+}
+
+/** An input of a form, as a submitted form has it: its type, and whether it may stay empty. */
+interface FormInput {
+  type: ComponentType;
+  /** A select menu or checkbox group that may be submitted with nothing chosen. */
+  optional: boolean;
+}
+
+/** The inputs of a form by their custom ids: the text inputs, select menus and other inputs. */
+function formInputs(modal: unknown): Map<string, FormInput> {
+  const inputs = new Map<string, FormInput>();
+  for (const raw of formData(modal).components ?? []) {
+    const component = raw as {
+      type?: ComponentType;
+      component?: {
+        type?: ComponentType;
+        custom_id?: unknown;
+        required?: unknown;
+        min_values?: unknown;
+      };
+      components?: { type?: ComponentType; custom_id?: unknown }[];
+    };
+    const inner =
+      component.type === ComponentType.ActionRow ? component.components?.[0] : component.component;
+    if (typeof inner?.custom_id !== 'string' || inner.type === undefined) continue;
+    const optional =
+      'required' in inner && inner.required === false
+        ? true
+        : 'min_values' in inner && inner.min_values === 0;
+    inputs.set(inner.custom_id, { type: inner.type, optional });
+  }
+  return inputs;
+}
+
+/**
+ * Refuses a form Discord would refuse: a title of 1 to 45 characters, 1 to 5 components (a label,
+ * a text display, or a row with one text input), a label's text of at most 45 and its
+ * description of at most 100, custom ids of at most 100 that are unique in the form; a string
+ * select with 1 to 25 options and a checkbox group with 1 to 10, as `checkMenu` checks them (a
+ * menu that may stay empty, `min_values: 0`, says `required: false`). A builder is read by its
+ * `toJSON()`. Throws with what is wrong.
+ */
+export function checkModal(modal: unknown): void {
+  const data = formData(modal);
+  const fail = (what: string): never => {
+    throw new Error(`Invalid Form Body (modal): ${what}`);
+  };
+  const ids = new Set<string>();
+  const customId = (id: unknown, where: string): void => {
+    if (typeof id !== 'string' || id.length < 1 || id.length > MODAL.customId) {
+      fail(`${where}: a custom id of 1 to ${MODAL.customId} characters`);
+    }
+    if (ids.has(id as string)) fail(`${where}: the custom id ${String(id)} is not unique`);
+    ids.add(id as string);
+  };
+  customId(data.custom_id, 'the modal');
+  if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > MODAL.title) {
+    fail(`a title of 1 to ${MODAL.title} characters`);
+  }
+  const components = data.components ?? [];
+  if (components.length < 1 || components.length > MODAL.components) {
+    fail(`1 to ${MODAL.components} components, not ${components.length}`);
+  }
+  for (const [index, raw] of components.entries()) {
+    const component = raw as {
+      type?: number;
+      label?: unknown;
+      description?: unknown;
+      component?: MenuLike & { type?: number; custom_id?: unknown };
+      components?: { type?: number; custom_id?: unknown }[];
+    };
+    const where = `component ${index}`;
+    if (component.type === ComponentType.TextDisplay) continue;
+    if (component.type === ComponentType.ActionRow) {
+      const inner = component.components ?? [];
+      if (inner.length !== 1 || inner[0]?.type !== ComponentType.TextInput) {
+        fail(`${where}: a row in a modal holds one text input`);
+      }
+      customId(inner[0]?.custom_id, where);
+      continue;
+    }
+    if (component.type !== ComponentType.Label) fail(`${where}: no component of a modal`);
+    if (
+      typeof component.label !== 'string' ||
+      component.label.length < 1 ||
+      component.label.length > MODAL.label
+    ) {
+      fail(`${where}: a label of 1 to ${MODAL.label} characters`);
+    }
+    if (
+      typeof component.description === 'string' &&
+      component.description.length > MODAL.labelDescription
+    ) {
+      fail(`${where}: a label's description of at most ${MODAL.labelDescription} characters`);
+    }
+    const inner = component.component;
+    if (!inner) return fail(`${where}: a label without its component`);
+    customId(inner.custom_id, where);
+    const menuFail = (what: string): never => fail(`${where}: ${what}`);
+    if (inner.type === ComponentType.StringSelect) {
+      checkMenu(inner, { most: MODAL.selectOptions, group: false, inForm: true }, menuFail);
+    } else if (inner.type === ComponentType.CheckboxGroup) {
+      checkMenu(inner, { most: MODAL.checkboxOptions, group: true, inForm: true }, menuFail);
+    } else if (
+      inner.type !== ComponentType.TextInput &&
+      inner.type !== ComponentType.Checkbox &&
+      inner.type !== ComponentType.RadioGroup &&
+      inner.type !== ComponentType.FileUpload &&
+      inner.type !== ComponentType.UserSelect &&
+      inner.type !== ComponentType.RoleSelect &&
+      inner.type !== ComponentType.ChannelSelect &&
+      inner.type !== ComponentType.MentionableSelect
+    ) {
+      fail(`${where}: no component of a label`);
+    }
+  }
+}
+
+/** A value of a submitted form, by the type of its input. */
+type Submitted =
+  | { type: ComponentType.TextInput; value: string }
+  | { type: ComponentType.StringSelect | ComponentType.CheckboxGroup; values: string[] };
+
+/**
+ * What a fake form was submitted with, by custom id. With the form the opener showed (`form`),
+ * every input of it is there (a text left empty as `''`, an unticked checkbox group or a menu
+ * that may stay empty as `[]`), a required menu must be given a value, and a value for an input
+ * the form does not have, or of another type, is refused. Without it, the inputs are what
+ * `fields`, `selected` and `checked` name.
+ */
+function submittedForm(o: FakeOptions): Map<string, Submitted> {
+  const given = new Map<string, Submitted>();
+  for (const [id, value] of Object.entries(o.fields ?? {})) {
+    given.set(id, { type: ComponentType.TextInput, value });
+  }
+  for (const [id, values] of Object.entries(o.selected ?? {})) {
+    given.set(id, { type: ComponentType.StringSelect, values });
+  }
+  for (const [id, values] of Object.entries(o.checked ?? {})) {
+    given.set(id, { type: ComponentType.CheckboxGroup, values });
+  }
+  if (o.form === undefined) return given;
+  const inputs = formInputs(o.form);
+  for (const [id, value] of given) {
+    const input = inputs.get(id);
+    if (!input) throw new Error(`The fake form has no input ${id}`);
+    if (input.type !== value.type) throw new Error(`The input ${id} of the fake form is no such`);
+  }
+  const all = new Map<string, Submitted>();
+  for (const [id, input] of inputs) {
+    const value = given.get(id);
+    if (value) {
+      all.set(id, value);
+    } else if (input.type === ComponentType.TextInput) {
+      all.set(id, { type: ComponentType.TextInput, value: '' });
+    } else if (
+      input.type === ComponentType.CheckboxGroup ||
+      input.type === ComponentType.StringSelect
+    ) {
+      if (input.type === ComponentType.StringSelect && !input.optional) {
+        throw new Error(`The fake form has no value for its required menu ${id}`);
+      }
+      all.set(id, { type: input.type, values: [] });
+    }
+  }
+  return all;
+}
+
 /**
  * Just enough of a discord.js interaction for router, guard, command and component tests.
  * It keeps `deferred`, `replied` and `ephemeral` the way discord.js does. Cast to the concrete
@@ -284,9 +491,14 @@ function base(kind: Kind, o: FakeOptions) {
     components: shown.rows.map((row) => ({ type: row.type, toJSON: () => row })),
     // As Discord sets it: a message whose components are more than rows is components v2.
     flags: new MessageFlagsBitField(
-      shown.rows.some((row) => row.type !== 1) ? MessageFlags.IsComponentsV2 : 0,
+      (shown.rows.some((row) => row.type !== 1) ? MessageFlags.IsComponentsV2 : 0) |
+        (o.ephemeralMessage === true ? MessageFlags.Ephemeral : 0),
     ).freeze(),
+    interactionMetadata: o.askedBy === undefined ? null : { user: { id: o.askedBy } },
   });
+  const submitted = kind === 'modal' ? submittedForm(o) : new Map<string, Submitted>();
+  const notSubmitted = (id: string, what: string) =>
+    new Error(`ModalSubmitInteractionFieldNotFound: the form submitted no ${what} ${id}`);
   /** Whether the interaction was acknowledged with `deferUpdate`. */
   let updating = false;
   const memberRoles: [string, { id: string; name: string }][] = (o.roleNames ?? []).map(
@@ -389,9 +601,23 @@ function base(kind: Kind, o: FakeOptions) {
       getFocused: (full?: boolean) =>
         full ? { name: o.focusedName ?? 'option', value: o.focused ?? '' } : (o.focused ?? ''),
     },
+    // As discord.js: reading an input the form did not submit, or of another type, throws.
     fields: {
-      getTextInputValue: (id: string) => o.fields?.[id] ?? '',
-      getStringSelectValues: (id: string) => o.selected?.[id] ?? [],
+      getTextInputValue: (id: string) => {
+        const input = submitted.get(id);
+        if (input?.type !== ComponentType.TextInput) throw notSubmitted(id, 'text input');
+        return input.value;
+      },
+      getStringSelectValues: (id: string) => {
+        const input = submitted.get(id);
+        if (input?.type !== ComponentType.StringSelect) throw notSubmitted(id, 'select menu');
+        return input.values;
+      },
+      getCheckboxGroup: (id: string) => {
+        const input = submitted.get(id);
+        if (input?.type !== ComponentType.CheckboxGroup) throw notSubmitted(id, 'checkbox group');
+        return input.values;
+      },
     },
     // As in discord.js, these are async: a refusal rejects.
     reply: vi.fn((payload: SentPayload) => {
@@ -464,9 +690,14 @@ function base(kind: Kind, o: FakeOptions) {
       editFiles(payload);
       return Promise.resolve();
     }),
-    showModal: vi.fn((_modal: unknown) => {
+    showModal: vi.fn((modal: unknown) => {
       const refused = refuseIfAcknowledged();
       if (refused) return refused;
+      try {
+        checkModal(modal);
+      } catch (err) {
+        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
+      }
       interaction.replied = true;
       return Promise.resolve();
     }),
diff --git a/test/support/gym-commands.ts b/test/support/gym-commands.ts
index eac2275281d1c241179078e66560a3606d029ba0..e6d8b7c5c6a06044f6f424853d832ffa82010504 100644
--- a/test/support/gym-commands.ts
+++ b/test/support/gym-commands.ts
@@ -76,7 +76,8 @@ export function embedOf(payload: SentPayload) {
  * `/gym` and `/admin` over the fakes of `gymAdminWith`, routed like in the bot, used by a
  * moderator in the channel of West unless a call says otherwise. `use` runs a subcommand,
  * `typing` asks for the list of its `gym` option, `press` presses a button and `submit` sends a
- * form, each through the router and each answering the fake interaction to read back.
+ * form (the form the bot showed under that custom id, as Discord submits it), each through the
+ * router and each answering the fake interaction to read back.
  */
 export async function gymCommandsWith(parties: readonly Party[] = []) {
   const made = await gymAdminWith(parties);
@@ -110,8 +111,14 @@ export async function gymCommandsWith(parties: readonly Party[] = []) {
     channelId: WEST_CHANNEL,
     guildId: made.gateway.guildId,
   };
+  /** The forms the bot showed, by their custom ids: a submit sends the form it was shown. */
+  const forms = new Map<string, unknown>();
   const handled = async (interaction: FakeInteraction): Promise<FakeInteraction> => {
     await router.handle(interaction as never);
+    for (const [form] of interaction.showModal.mock.calls) {
+      const id = (form as { custom_id?: unknown } | undefined)?.custom_id;
+      if (typeof id === 'string') forms.set(id, form);
+    }
     return interaction;
   };
   return {
@@ -138,7 +145,7 @@ export async function gymCommandsWith(parties: readonly Party[] = []) {
     press: (customId: string, extra: FakeOptions = {}) =>
       handled(fakeButton({ customId, ...staff, ...extra })),
     submit: (customId: string, fields: Record<string, string>, extra: FakeOptions = {}) =>
-      handled(fakeModal({ customId, fields, ...staff, ...extra })),
+      handled(fakeModal({ customId, fields, form: forms.get(customId), ...staff, ...extra })),
     /** Lets everything that is under way go out. */
     settle: async () => {
       await made.upkeep.flush();
````

### Task 2: The answer of rank and its short forms as a components-v2 message with buttons

Prototype commit: `4d1ffaa80905ede0898e30a4b205b73d14242e6a`

R2 of plan 8B-2. renderRank gives one container coloured by the share of
the best stat product (as before): a section with `### <Pokemon> a/d/s`,
the league and `**Rank 3** of 4,096 · 99.62%` (numbers with a thousands
separator) beside the picture, or the sentence for a league the Pokemon is
too strong for; under a line `**Up to level 50**` with the spread on one
line and `-# Best: ...` in small print, and `**Up to level 51 (best
buddy)** · rank 5 · 99.41%` with the same two lines where that differs; the
evolution line in a block of its own (fitted to the text budget); the
filter in small print; a row of the four leagues (the shown one primary and
disabled) and a row with Evolution line / Hide evolution line and the link
to pvpivs.com. The embed renderer is gone.

The buttons keep everything in their custom ids (kind `rank`, nothing in
memory): `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>`, each
saying what it shows. rankControls (in src/components/index.ts) reads the
Pokemon from the game data anew (a key it no longer knows: "I no longer
know that Pokemon. Use `/rank` again."), ranks with the same function as
the command (rankAnswer) and answers by R0: the member who asked changes
the public answer, anybody else gets a private copy. No requirePvpContext
on the controls; MEMBER_READ_THROTTLE. A test checks that the custom ids
fit for every key of the catalogue fixture (the longest with the longest
filter); a Pokemon whose ids would not fit gets the link alone.

linkButton takes no emoji for a link to another site.

Decisions:
- With one cap shown (levels 50 and 51 rank the same) the heading is
  `**Up to level 50** · the same rank up to 51`: the spread shown is level
  50's, so "Up to level 50 and 51" would claim its CP for 51 as well.
- The link buttons are labelled `pvpivs.com` without `↗`: Discord draws its
  own external-link sign on every link button.
- The rank line of the heading is level 50's (as the colour is).

**Files:**

```
 src/commands/util/rank.test.ts | 275 +++++++++++++++++++++++++++++++++++++++++++++++--------------
 src/commands/util/rank.ts      | 125 +++++++++++++++++++++-------
 src/components/index.ts        |   2 +
 src/render/pvp-rank.test.ts    |  47 ++++++++---
 src/render/pvp-rank.ts         | 229 +++++++++++++++++++++++++++++++++++++-------------
 src/render/v2.ts               |  13 ++-
 6 files changed, 528 insertions(+), 163 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/util/rank.test.ts src/render/pvp-rank.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 4d1ffaa80905ede0898e30a4b205b73d14242e6a -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `The answer of rank and its short forms as a components-v2 message with buttons`, the body above and the trailer, staging exactly
  `src/commands/util/rank.test.ts src/commands/util/rank.ts src/components/index.ts src/render/pvp-rank.test.ts src/render/pvp-rank.ts src/render/v2.ts`.

````diff
diff --git a/src/commands/util/rank.test.ts b/src/commands/util/rank.test.ts
index 5c017042666fc767925bd589385b379c50a7426a..d35703d2176b2474e4f1e98f42a93b04405c42a0 100644
--- a/src/commands/util/rank.test.ts
+++ b/src/commands/util/rank.test.ts
@@ -1,22 +1,40 @@
-import { InteractionContextType, MessageFlags, type APIEmbed } from 'discord.js';
+import { ButtonStyle, InteractionContextType, MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { fakeAutocomplete, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
+import {
+  asV2,
+  fakeAutocomplete,
+  fakeButton,
+  fakeChatInput,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
 import {
   catalogueFixture,
   gameDataFixture,
   iconsFixture,
 } from '../../../test/support/game-data.js';
-import { embedOf as shownEmbed } from '../../../test/support/gym-commands.js';
+import {
+  accentOf,
+  buttonsOf,
+  header,
+  linksOf,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { createTestContext } from '../../../test/support/test-context.js';
-import { InteractionRouter } from '../../discord/router.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
-import { leagueRanks, rank } from './rank.js';
+import { rankButtonId } from '../../render/pvp-rank.js';
+import { leagueRanks, rank, rankControls } from './rank.js';
 
 const PVP = 'PVP CHAT AND TOURNAMENTS';
 const { ctx } = createTestContext({
   gameData: { catalogue: catalogueFixture(), icons: iconsFixture() },
 });
-const router = new InteractionRouter(ctx, [rank], []);
+const router = new InteractionRouter(ctx, [rank], [rankControls]);
 
 const IVS = { attack: 10, defense: 12, stamina: 13 };
 
@@ -31,8 +49,10 @@ async function use(options: Record<string, string | number | boolean>, extra: ob
   return interaction;
 }
 
-const embedOf = (interaction: Awaited<ReturnType<typeof use>>): APIEmbed =>
-  shownEmbed(sent(interaction.reply));
+/** The answer, a components-v2 message. */
+const answerOf = (interaction: FakeInteraction): V2Message => asV2(sent(interaction.reply));
+/** The text under the heading of the answer, by its blocks. */
+const blocksOf = (interaction: FakeInteraction): string[] => textDisplays(answerOf(interaction));
 
 describe('/rank: the command', () => {
   it('works in servers and in a DM with the bot, for every member', () => {
@@ -67,23 +87,44 @@ describe('/rank: the answer', () => {
   it('is public under the PvP category, with the rank, the best combination and a link', async () => {
     const used = await use({ pokemon: 'mewtwo' });
     const payload = sent(used.reply);
-    expect(payload.flags).toBeUndefined();
-    const embed = embedOf(used);
-    expect(embed.title).toBe('Mewtwo 10/12/13 · Great League');
-    expect(embed.url).toBe('https://pvpivs.com/?mon=Mewtwo&cp=1500&IVs=10_12_13');
-    expect(embed).not.toHaveProperty('description');
-    expect(embed).not.toHaveProperty('footer');
-    expect(embed.fields?.map((field) => field.name)).toEqual(['Rank']);
-    const value = embed.fields?.[0]?.value ?? '';
-    expect(value).toMatch(/^\*\*Rank \d+\*\* of 4096 · \d+\.\d\d%\n\d+ CP at level \d+(\.5)?\n/);
-    expect(value).toMatch(/\nAttack \d+\.\d\d · Defense \d+\.\d\d · HP \d+\n/);
-    expect(value).toMatch(/\nBest: \d+\/\d+\/\d+ · \d+ CP at level/);
-    expect(embed.thumbnail?.url).toMatch(/^https:\/\/cdn\.leekduck\.com\/.*pm150/);
+    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
+    const answer = answerOf(used);
+    expectV2Sendable(answer);
+    const [heading, league, rankLine] = header(answer);
+    expect([heading, league]).toEqual(['### Mewtwo 10/12/13', 'Great League']);
+    expect(rankLine).toMatch(/^\*\*Rank [\d,]+\*\* of 4,096 · \d+\.\d\d%$/);
+    expect(thumbnailOf(answer)).toMatch(/^https:\/\/cdn\.leekduck\.com\/.*pm150/);
+    const [, cap] = blocksOf(used);
+    expect(cap?.split('\n')).toEqual([
+      '**Up to level 50** · the same rank up to 51',
+      expect.stringMatching(
+        /^\d+ CP at level \d+(\.5)? · Attack \d+\.\d\d · Defense \d+\.\d\d · HP \d+$/,
+      ),
+      expect.stringMatching(/^-# Best: \d+\/\d+\/\d+ · \d+ CP at level [\d.]+$/),
+    ]);
+    expect(textOf(answer)).not.toContain('Filter');
+    expect(linksOf(answer)).toEqual([
+      'pvpivs.com https://pvpivs.com/?mon=Mewtwo&cp=1500&IVs=10_12_13',
+    ]);
+  });
+
+  it('has the leagues’ buttons, the shown one pressed, and the evolution line’s', async () => {
+    const answer = answerOf(await use({ pokemon: 'mewtwo' }));
+    expect(
+      buttonsOf(answer).map((button) => [button.label, button.style, button.customId]),
+    ).toEqual([
+      ['Little', ButtonStyle.Secondary, 'rank:mewtwo:show:little:10-12-13:none:0'],
+      ['Great', ButtonStyle.Primary, 'rank:mewtwo:show:great:10-12-13:none:0'],
+      ['Ultra', ButtonStyle.Secondary, 'rank:mewtwo:show:ultra:10-12-13:none:0'],
+      ['Master', ButtonStyle.Secondary, 'rank:mewtwo:show:master:10-12-13:none:0'],
+      ['Evolution line', ButtonStyle.Secondary, 'rank:mewtwo:show:great:10-12-13:none:1'],
+      ['pvpivs.com', ButtonStyle.Link, undefined],
+    ]);
   });
 
   it('is the answer in a DM too', async () => {
     const used = await use({ pokemon: 'mewtwo' }, { isDm: true, guildId: null });
-    expect(embedOf(used).title).toBe('Mewtwo 10/12/13 · Great League');
+    expect(header(answerOf(used))[0]).toBe('### Mewtwo 10/12/13');
   });
 
   it('ranks the best combination first, gold', async () => {
@@ -94,28 +135,34 @@ describe('/rank: the answer', () => {
       defense: 15,
       stamina: 15,
     });
-    const embed = embedOf(used);
-    expect(embed.color).toBe(0xffd700);
-    expect(embed.url).toBe('https://pvpivs.com/?mon=Mewtwo&cp=10000&IVs=15_15_15');
-    // Level 51 changes the CP, but neither the rank nor the best combination: one column.
-    expect(embed.fields?.map((field) => field.name)).toEqual(['Rank']);
-    expect(embed.fields?.[0]?.value).toMatch(
-      /^\*\*Rank 1\*\* of 4096 · 100\.00%\n\d+ CP at level 50\n/,
-    );
+    const answer = answerOf(used);
+    expect(accentOf(answer)).toBe(0xffd700);
+    expect(linksOf(answer)).toEqual([
+      'pvpivs.com https://pvpivs.com/?mon=Mewtwo&cp=10000&IVs=15_15_15',
+    ]);
+    expect(header(answer)[2]).toBe('**Rank 1** of 4,096 · 100.00%');
+    // Level 51 changes the CP, but neither the rank nor the best combination: one block.
+    const [, cap, next] = blocksOf(used);
+    expect(cap).toMatch(/^\*\*Up to level 50\*\* · the same rank up to 51\n\d+ CP at level 50 /);
+    expect(next).toBeUndefined();
   });
 
-  it('shows level 51 beside level 50 where the rank differs', async () => {
-    const embed = embedOf(await use({ pokemon: 'medicham', attack: 15, defense: 15, stamina: 15 }));
-    expect(embed.fields?.map((field) => field.name)).toEqual([
-      'Up to level 50',
-      'Up to level 51 (best buddy)',
-    ]);
+  it('shows level 51 below level 50 where the rank differs', async () => {
+    const used = await use({ pokemon: 'medicham', attack: 15, defense: 15, stamina: 15 });
+    const [, level50, level51] = blocksOf(used);
+    expect(level50?.split('\n')[0]).toBe('**Up to level 50**');
+    expect(level51?.split('\n')[0]).toMatch(
+      /^\*\*Up to level 51 \(best buddy\)\*\* · rank [\d,]+ · \d+\.\d\d%$/,
+    );
+    expect(level51?.split('\n')).toHaveLength(3);
   });
 
   it('counts among what the filter allows, and says the filter', async () => {
-    const embed = embedOf(await use({ pokemon: 'mewtwo', filter: 'raid' }));
-    expect(embed.footer).toEqual({ text: 'Filter: Raid, egg or research (IVs from 10)' });
-    expect(embed.fields?.[0]?.value).toMatch(/ of 216 · /);
+    const used = await use({ pokemon: 'mewtwo', filter: 'raid' });
+    const answer = answerOf(used);
+    expect(header(answer)[2]).toMatch(/ of 216 · /);
+    expect(blocksOf(used).at(-1)).toBe('-# Filter: Raid, egg or research (IVs from 10)');
+    expect(buttonsOf(answer)[0]?.customId).toBe('rank:mewtwo:show:little:10-12-13:raid:0');
   });
 
   it('refuses IVs below the filter', async () => {
@@ -129,12 +176,12 @@ describe('/rank: the answer', () => {
   });
 
   it('ranks a mega and a primal: some cups of Go Battle League allow megas', async () => {
-    expect(embedOf(await use({ pokemon: 'charizard_mega_x' })).title).toBe(
-      'Mega Charizard X 10/12/13 · Great League',
-    );
-    expect(embedOf(await use({ pokemon: 'kyogre_primal', league: 'master' })).title).toBe(
-      'Primal Kyogre 10/12/13 · Master League',
+    expect(header(answerOf(await use({ pokemon: 'charizard_mega_x' })))[0]).toBe(
+      '### Mega Charizard X 10/12/13',
     );
+    expect(
+      header(answerOf(await use({ pokemon: 'kyogre_primal', league: 'master' }))).slice(0, 2),
+    ).toEqual(['### Primal Kyogre 10/12/13', 'Master League']);
   });
 
   it('refuses with a sentence when the game data does not reach level 51', async () => {
@@ -154,43 +201,147 @@ describe('/rank: the answer', () => {
   });
 
   it('acts on typed text only when it names one Pokémon', async () => {
-    expect(embedOf(await use({ pokemon: 'Mewtwo' })).title).toBe('Mewtwo 10/12/13 · Great League');
+    expect(header(answerOf(await use({ pokemon: 'Mewtwo' })))[0]).toBe('### Mewtwo 10/12/13');
     const used = await use({ pokemon: 'mewtw' });
     expect(sent(used.reply).content).toMatch(
       /^"mewtw" is not the name of one Pokémon\. Did you mean /,
     );
   });
 
-  it('ranks the evolution line with the same IVs on request, in the description', async () => {
-    const embed = embedOf(await use({ pokemon: 'bulbasaur', evolutions: true }));
-    const lines = (embed.description ?? '').split('\n');
+  it('ranks the evolution line with the same IVs on request, in a block of its own', async () => {
+    const used = await use({ pokemon: 'bulbasaur', evolutions: true });
+    const lines = (
+      blocksOf(used).find((block) => block.startsWith('**Evolution line**')) ?? ''
+    ).split('\n');
     expect(lines).toHaveLength(4);
-    expect(lines[0]).toBe('**Evolution line**');
     expect(lines[1]).toMatch(
       /^\*\*Bulbasaur\*\* · rank \d+( \(best buddy: rank \d+\))? · \d+\.\d\d% · \d+ CP at level /,
     );
     expect(lines[2]).toMatch(/^\*\*Ivysaur\*\* · /);
     expect(lines[3]).toMatch(/^\*\*Venusaur\*\* · /);
+    const evolution = buttonsOf(answerOf(used)).find((b) => b.label === 'Hide evolution line');
+    expect(evolution?.customId).toBe('rank:bulbasaur:show:great:10-12-13:none:0');
   });
 
   it('gives every branch of a line that branches, in order', async () => {
-    const embed = embedOf(await use({ pokemon: 'ralts', evolutions: true }));
-    const names = (embed.description ?? '')
+    const used = await use({ pokemon: 'ralts', evolutions: true });
+    const names = (blocksOf(used).find((block) => block.startsWith('**Evolution line**')) ?? '')
       .split('\n')
       .slice(1)
       .map((line) => /^\*\*(.+?)\*\*/.exec(line)?.[1]);
     expect(names).toEqual(['Ralts', 'Kirlia', 'Gallade', 'Gardevoir']);
   });
 
-  it('shows all of the line of Eevee in Master League', async () => {
-    const embed = embedOf(await use({ pokemon: 'eevee', league: 'master', evolutions: true }));
-    expect((embed.description ?? '').split('\n')).toHaveLength(10);
-    expect(embed.description).not.toContain('more');
+  it('shows all of the line of Eevee in Master League, within what a message holds', async () => {
+    const used = await use({
+      pokemon: 'eevee',
+      league: 'master',
+      evolutions: true,
+      filter: 'raid',
+    });
+    const line = blocksOf(used).find((block) => block.startsWith('**Evolution line**')) ?? '';
+    expect(line.split('\n')).toHaveLength(10);
+    expect(line).not.toContain('more');
+    expectV2Sendable(answerOf(used));
   });
 
   it('says of a Pokémon that does not evolve that it does not', async () => {
-    const embed = embedOf(await use({ pokemon: 'mewtwo', evolutions: true }));
-    expect(embed.description).toBe('**Evolution line**\nMewtwo does not evolve.');
+    const used = await use({ pokemon: 'mewtwo', evolutions: true });
+    expect(blocksOf(used)).toContain('**Evolution line**\nMewtwo does not evolve.');
+  });
+
+  it('has room in its buttons’ custom ids for every Pokémon of the game data', () => {
+    const worst = {
+      league: 'master',
+      ivs: { attack: 15, defense: 15, stamina: 15 },
+      floor: 'ultra-friend',
+      evolutions: true,
+    } as const;
+    for (const entry of catalogueFixture().all) {
+      expect(rankButtonId(entry.key, worst), entry.key).toBeDefined();
+    }
+  });
+});
+
+describe('/rank: the buttons under an answer', () => {
+  const ASKER = '700000000000000001';
+  const OTHER = '700000000000000002';
+  const press = async (customId: string, userId: string, extra: object = {}) => {
+    const interaction = fakeButton({ customId, userId, askedBy: ASKER, ...extra });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+
+  it('change the answer for everybody when the member who asked presses them', async () => {
+    const pressed = await press('rank:mewtwo:show:ultra:10-12-13:none:1', ASKER);
+    const shown = asV2(sent(pressed.update));
+    expect(header(shown).slice(0, 2)).toEqual(['### Mewtwo 10/12/13', 'Ultra League']);
+    expect(textOf(shown)).toContain('**Evolution line**\nMewtwo does not evolve.');
+    expect(buttonsOf(shown).find((button) => button.label === 'Ultra')?.style).toBe(
+      ButtonStyle.Primary,
+    );
+    expect(pressed.reply).not.toHaveBeenCalled();
+  });
+
+  it('give anybody else a private copy, and leave the answer as it is', async () => {
+    const pressed = await press('rank:mewtwo:show:master:10-12-13:raid:0', OTHER);
+    expect(pressed.update).not.toHaveBeenCalled();
+    const copy = sent(pressed.reply);
+    expect(copy.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    expect(header(asV2(copy)).slice(0, 2)).toEqual(['### Mewtwo 10/12/13', 'Master League']);
+    expect(textOf(asV2(copy))).toContain('-# Filter: Raid, egg or research (IVs from 10)');
+  });
+
+  it('change a private copy in its place for the member who holds it', async () => {
+    const pressed = await press('rank:mewtwo:show:little:10-12-13:none:0', OTHER, {
+      askedBy: OTHER,
+      ephemeralMessage: true,
+    });
+    expect(pressed.reply).not.toHaveBeenCalled();
+    expect(header(asV2(sent(pressed.update)))[1]).toBe('Little League');
+  });
+
+  it('work where /rank may not be used: the answer stands where it was allowed', async () => {
+    const pressed = await press('rank:mewtwo:show:little:10-12-13:none:0', ASKER, {
+      parentName: 'RAIDS',
+    });
+    expect(header(asV2(sent(pressed.update)))[1]).toBe('Little League');
+  });
+
+  it('say so of a Pokémon the game data no longer has, and of a custom id they cannot read', async () => {
+    const gone = await press('rank:missingno:show:great:10-12-13:none:0', ASKER);
+    expect(sent(gone.reply)).toEqual({
+      content: 'I no longer know that Pokémon. Use `/rank` again.',
+      flags: MessageFlags.Ephemeral,
+    });
+    for (const customId of [
+      'rank:mewtwo:show:great:10-12-16:none:0',
+      'rank:mewtwo:show:great:10-12:none:0',
+      'rank:mewtwo:show:silph:10-12-13:none:0',
+      'rank:mewtwo:show:great:10-12-13:none:2',
+      'rank:mewtwo:hide:great:10-12-13:none:0',
+    ]) {
+      expect(sent((await press(customId, ASKER)).reply).content, customId).toBe(STALE_COMPONENT);
+    }
+  });
+
+  it('count as uses of /rank’s controls, thirty a minute', async () => {
+    const member = '700000000000000777';
+    const own = new InteractionRouter(ctx, [rank], [rankControls], {
+      now: () => 1_800_000_000_000,
+    });
+    let last: FakeInteraction | undefined;
+    for (let n = 0; n < 31; n++) {
+      last = fakeButton({
+        customId: 'rank:mewtwo:show:great:10-12-13:none:0',
+        userId: member,
+        askedBy: member,
+      });
+      await own.handle(last as never);
+    }
+    expect(last && sent(last.reply).content).toBe(
+      'That was a lot of clicks. Try again in 1 minute.',
+    );
   });
 });
 
@@ -252,14 +403,10 @@ describe('/little, /great, /ultra and /master', () => {
   });
 
   it('rank in their own league', async () => {
-    expect(embedOf(await useIn('master', { pokemon: 'Mewtwo' })).title).toBe(
-      'Mewtwo 10/12/13 · Master League',
-    );
-    expect(embedOf(await useIn('ultra', { pokemon: 'Mewtwo' })).title).toBe(
-      'Mewtwo 10/12/13 · Ultra League',
-    );
-    expect(embedOf(await useIn('great', { pokemon: 'Mewtwo' })).title).toBe(
-      embedOf(await useIn('rank', { pokemon: 'Mewtwo' })).title,
+    expect(header(answerOf(await useIn('master', { pokemon: 'Mewtwo' })))[1]).toBe('Master League');
+    expect(header(answerOf(await useIn('ultra', { pokemon: 'Mewtwo' })))[1]).toBe('Ultra League');
+    expect(answerOf(await useIn('great', { pokemon: 'Mewtwo' }))).toEqual(
+      answerOf(await useIn('rank', { pokemon: 'Mewtwo' })),
     );
   });
 
diff --git a/src/commands/util/rank.ts b/src/commands/util/rank.ts
index f4c0398379bea88eecc20824f31a9ff04fa2d337..33eee1c652012609c6d9d6fbf46a22085b5b122f 100644
--- a/src/commands/util/rank.ts
+++ b/src/commands/util/rank.ts
@@ -6,9 +6,12 @@ import {
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Settings } from '../../config/settings.js';
-import type { SimpleCommand } from '../../discord/command.js';
+import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { requirePvpContext } from '../../discord/guards.js';
+import { answerPress, pressAnswer, v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
 import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
 import type { Ivs } from '../../domain/pogo/cp.js';
 import { PVP_MAX_LEVEL, type PokemonEntry } from '../../domain/pogo/game-master.js';
@@ -26,7 +29,7 @@ import {
   type IvFloor,
   type League,
 } from '../../domain/pvp/rank.js';
-import { ivText, renderRank } from '../../render/pvp-rank.js';
+import { ivText, RANK_KIND, RANK_SHOW, renderRank, type RankState } from '../../render/pvp-rank.js';
 import { namedPokemon, pokemonChoices, pokemonOption } from '../pokemon-option.js';
 import { SpreadMemo } from './spread-memo.js';
 
@@ -109,9 +112,45 @@ function rankData(name: string, description: string, league: boolean): SlashComm
   return builder;
 }
 
+/**
+ * The answer of `/rank` for one Pokémon as `state` says: a use of the command and a press on the
+ * buttons of an answer rank with this, so they say the same. Refuses with a sentence what cannot
+ * be ranked.
+ */
+function rankAnswer(ctx: AppContext, entry: PokemonEntry, state: RankState): V2Message {
+  if (ctx.gameData.catalogue.cpMultipliers.length < PVP_MAX_LEVEL) {
+    throw new UserError(
+      `The game data I have does not reach level ${String(PVP_MAX_LEVEL)}, so I cannot rank ` +
+        'IVs just now.',
+    );
+  }
+  const { ivs, league, floor } = state;
+  if (Math.min(ivs.attack, ivs.defense, ivs.stamina) < IV_FLOOR_VALUE[floor]) {
+    throw new UserError(
+      `With the filter "${IV_FLOOR_NAMES[floor]}" every IV is ${String(IV_FLOOR_VALUE[floor])} ` +
+        `or more, and ${ivText(ivs)} has one below that.`,
+    );
+  }
+  const line = state.evolutions
+    ? ctx.gameData.catalogue.evolutionLine(entry).map((member) => ({
+        entry: member,
+        ranks: ranksOf(ctx, member, ivs, league, floor),
+      }))
+    : undefined;
+  return renderRank({
+    entry,
+    ivs,
+    league,
+    floor,
+    ranks: line?.[0]?.ranks ?? ranksOf(ctx, entry, ivs, league, floor),
+    ...(line ? { line } : {}),
+    picture: pokemonPicture(undefined, entry, ctx.gameData),
+  });
+}
+
 /**
  * Answers a use of `/rank` or of one of its short forms: in `league` when that is fixed,
- * otherwise in the league the member picked (Great League when none).
+ * otherwise in the league the member picked (Great League when none). The answer is public.
  */
 async function answerRank(
   interaction: ChatInputCommandInteraction,
@@ -119,12 +158,6 @@ async function answerRank(
   league?: League,
 ): Promise<void> {
   const entry = namedPokemon(ctx, interaction.options.getString('pokemon', true));
-  if (ctx.gameData.catalogue.cpMultipliers.length < PVP_MAX_LEVEL) {
-    throw new UserError(
-      `The game data I have does not reach level ${String(PVP_MAX_LEVEL)}, so I cannot rank ` +
-        'IVs just now.',
-    );
-  }
   const ivs: Ivs = {
     attack: interaction.options.getInteger('attack', true),
     defense: interaction.options.getInteger('defense', true),
@@ -138,31 +171,65 @@ async function answerRank(
   if (!isLeague(leagueValue) || !isFloor(floorValue)) {
     throw new UserError('Pick the league and the filter from their lists.');
   }
-  const floor = IV_FLOOR_VALUE[floorValue];
-  if (Math.min(ivs.attack, ivs.defense, ivs.stamina) < floor) {
-    throw new UserError(
-      `With the filter "${IV_FLOOR_NAMES[floorValue]}" every IV is ${String(floor)} or more, ` +
-        `and ${ivText(ivs)} has one below that.`,
-    );
-  }
-  const line = interaction.options.getBoolean('evolutions')
-    ? ctx.gameData.catalogue.evolutionLine(entry).map((member) => ({
-        entry: member,
-        ranks: ranksOf(ctx, member, ivs, leagueValue, floorValue),
-      }))
-    : undefined;
-  const embed = renderRank({
-    entry,
-    ivs,
+  const message = rankAnswer(ctx, entry, {
     league: leagueValue,
+    ivs,
     floor: floorValue,
-    ranks: line?.[0]?.ranks ?? ranksOf(ctx, entry, ivs, leagueValue, floorValue),
-    ...(line ? { line } : {}),
-    picture: pokemonPicture(undefined, entry, ctx.gameData),
+    evolutions: interaction.options.getBoolean('evolutions') ?? false,
   });
-  await interaction.reply({ embeds: [embed] });
+  await interaction.reply(v2Answer(message));
+}
+
+/** An IV of a custom id: `0` to `15`. */
+function ivOf(text: string | undefined): number | undefined {
+  if (text === undefined || !/^\d{1,2}$/.test(text)) return undefined;
+  const iv = Number(text);
+  return iv <= MAX_IV ? iv : undefined;
+}
+
+/** What the custom id of a button under an answer says (`rankButtonId`), or undefined. */
+function stateOf(args: readonly string[]): RankState | undefined {
+  const [league, ivPart, floor, evolutions, ...rest] = args;
+  const [attack, defense, stamina] = (ivPart ?? '').split('-').map((part) => ivOf(part));
+  if (
+    rest.length > 0 ||
+    league === undefined ||
+    !isLeague(league) ||
+    floor === undefined ||
+    !isFloor(floor) ||
+    (evolutions !== '0' && evolutions !== '1') ||
+    attack === undefined ||
+    defense === undefined ||
+    stamina === undefined ||
+    (ivPart ?? '').split('-').length !== 3
+  ) {
+    return undefined;
+  }
+  return { league, ivs: { attack, defense, stamina }, floor, evolutions: evolutions === '1' };
 }
 
+/**
+ * The buttons under an answer of `/rank` (plan 8B-2): another league, the evolution line shown or
+ * hidden. Everything is in the custom id (`rankButtonId`), nothing is kept: a press reads the
+ * Pokémon from the game data anew and ranks as the command does. The member who asked changes
+ * the answer for everybody; anybody else gets a private copy (`pressAnswer`). No guard of
+ * `requirePvpContext`: the answer stands where the command was allowed. The throttle is that of
+ * `/rank`.
+ */
+export const rankControls: ComponentHandler = {
+  kind: RANK_KIND,
+  throttle: MEMBER_READ_THROTTLE,
+  async button(interaction, id, ctx) {
+    const state = id.action === RANK_SHOW ? stateOf(id.args) : undefined;
+    if (!state) throw new UserError(STALE_COMPONENT);
+    const entry = ctx.gameData.catalogue.byKey(id.id);
+    if (!entry) {
+      throw new UserError('I no longer know that Pokémon. Use `/rank` again.');
+    }
+    await answerPress(interaction, pressAnswer(interaction), rankAnswer(ctx, entry, state));
+  },
+};
+
 async function pokemonAutocomplete(
   interaction: Parameters<NonNullable<SimpleCommand['autocomplete']>>[0],
   ctx: AppContext,
diff --git a/src/components/index.ts b/src/components/index.ts
index 9048c99d94ebaa42c4cfda5f5b369778f3dde29b..82b1229fb0d3ff7118e8cfdae1163bc12e69e622 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -10,6 +10,7 @@ import { wantControls, wantListControls } from '../commands/notifications/wants.
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import { roleControls } from '../commands/roles/menus.js';
+import { rankControls } from '../commands/util/rank.js';
 import { screenshotControls } from '../commands/screenshots/feedback.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { dmControls } from './dm.js';
@@ -31,4 +32,5 @@ export const components: readonly ComponentHandler[] = [
   gymControls,
   regionControls,
   screenshotControls,
+  rankControls,
 ];
diff --git a/src/render/pvp-rank.test.ts b/src/render/pvp-rank.test.ts
index ed9c29c029c66acb871672aad9b7d51dded0ce35..c9fcb34c9d5529457dee939353adb555884768d9 100644
--- a/src/render/pvp-rank.test.ts
+++ b/src/render/pvp-rank.test.ts
@@ -1,5 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import { catalogueFixture } from '../../test/support/game-data.js';
+import { buttonsOf, textDisplays } from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
 import { percentText, pvpivsLink, rankColour, renderRank } from './pvp-rank.js';
 
 const catalogue = catalogueFixture();
@@ -42,19 +44,40 @@ describe('percentText', () => {
 });
 
 describe('renderRank', () => {
+  const mewtwo = catalogue.byKey('mewtwo');
+  if (!mewtwo) throw new Error('no mewtwo');
+  const view = {
+    entry: mewtwo,
+    ivs: { attack: 15, defense: 15, stamina: 15 },
+    league: 'little',
+    floor: 'none',
+    ranks: { level50: undefined },
+  } as const;
+
   it('says of a combination too strong for the league already at level 1 that it is', () => {
-    const mewtwo = catalogue.byKey('mewtwo');
-    if (!mewtwo) throw new Error('no mewtwo');
-    const embed = renderRank({
-      entry: mewtwo,
-      ivs: { attack: 15, defense: 15, stamina: 15 },
-      league: 'little',
-      floor: 'none',
-      ranks: { level50: undefined },
-    });
-    expect(embed.title).toBe('Mewtwo 15/15/15 · Little League');
-    expect(embed.fields).toEqual([
-      { name: 'Rank', value: 'Too strong for Little League already at level 1 (above 500 CP).' },
+    const message = renderRank(view);
+    expect(textDisplays(message)).toEqual([
+      [
+        '### Mewtwo 15/15/15',
+        'Little League',
+        'Too strong for Little League already at level 1 (above 500 CP).',
+      ].join('\n'),
     ]);
+    expectV2Sendable(message);
+  });
+
+  it('keeps a name that needs escapes within what a message holds', () => {
+    const odd = { ...mewtwo, name: '*_Mr. ~Mime~_* [x](y)' };
+    const message = renderRank({ ...view, entry: odd, picture: 'https://example.com/a.png' });
+    expect(textDisplays(message)[0]?.split('\n')[0]).toBe(
+      String.raw`### \*\_Mr. ~Mime~\_\* \[x]\(y) 15/15/15`,
+    );
+    expectV2Sendable(message);
+  });
+
+  it('has the link alone for a Pokémon whose custom ids would not fit', () => {
+    const long = { ...mewtwo, key: 'x'.repeat(70) };
+    const message = renderRank({ ...view, entry: long });
+    expect(buttonsOf(message).map((button) => button.label)).toEqual(['pvpivs.com']);
   });
 });
diff --git a/src/render/pvp-rank.ts b/src/render/pvp-rank.ts
index 4c190909f39bed0866042ee0db2619be2d5bf1d1..b6eb46e1294c545a6f5dd542b158f4b453e5ecfa 100644
--- a/src/render/pvp-rank.ts
+++ b/src/render/pvp-rank.ts
@@ -1,4 +1,11 @@
-import type { APIEmbed } from 'discord.js';
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIButtonComponentWithCustomId,
+  type APIComponentInContainer,
+} from 'discord.js';
+import { encodeCustomIdIfFits } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import type { Ivs } from '../domain/pogo/cp.js';
 import type { PokemonEntry } from '../domain/pogo/game-master.js';
 import {
@@ -6,13 +13,24 @@ import {
   IV_FLOOR_VALUE,
   LEAGUE_CP,
   LEAGUE_NAMES,
+  LEAGUES,
   type CappedRanks,
   type IvFloor,
   type League,
   type PvpRank,
   type Spread,
 } from '../domain/pvp/rank.js';
-import { fitItems, LIMITS, plain } from './text.js';
+import { TEXT_BUDGET } from './party-post.js';
+import { fitItems, plain } from './text.js';
+import {
+  actionRow,
+  container,
+  linkButton,
+  section,
+  separator,
+  textDisplay,
+  thumbnail,
+} from './v2.js';
 
 /** The CP pvpivs.com takes for a league; Master League is any CP. */
 const PVPIVS_CP: Readonly<Record<League, number>> = {
@@ -52,19 +70,25 @@ export function percentText(percent: number): string {
 export const ivText = (ivs: Ivs): string =>
   `${String(ivs.attack)}/${String(ivs.defense)}/${String(ivs.stamina)}`;
 
+/** `4,096`: numbers with a thousands separator. */
+const number = (n: number): string => n.toLocaleString('en-US');
+
 /** `1499 CP at level 22.5`. */
 const atLevel = (spread: Spread): string =>
   `${String(spread.cp)} CP at level ${String(spread.level)}`;
 
-/** What one level cap gives a combination, in lines. */
-function rankLines(ranked: PvpRank | undefined, league: League): string {
-  if (!ranked) return notInLeague(league);
+/** `**Rank 3** of 4,096 · 99.62%`. */
+const rankLine = (ranked: PvpRank): string =>
+  `**Rank ${number(ranked.rank)}** of ${number(ranked.of)} · ${percentText(ranked.percent)}`;
+
+/** Where the combination stands up to one level cap, under its heading: the spread, the best. */
+function capText(heading: string, ranked: PvpRank): string {
   const { spread, best } = ranked;
   return [
-    `**Rank ${String(ranked.rank)}** of ${String(ranked.of)} · ${percentText(ranked.percent)}`,
-    atLevel(spread),
-    `Attack ${spread.attack.toFixed(2)} · Defense ${spread.defense.toFixed(2)} · HP ${String(spread.hp)}`,
-    `Best: ${ivText(best.ivs)} · ${atLevel(best)}`,
+    heading,
+    `${atLevel(spread)} · Attack ${spread.attack.toFixed(2)} · Defense ` +
+      `${spread.defense.toFixed(2)} · HP ${String(spread.hp)}`,
+    `-# Best: ${ivText(best.ivs)} · ${atLevel(best)}`,
   ].join('\n');
 }
 
@@ -91,64 +115,159 @@ export interface RankView {
   picture?: string | undefined;
 }
 
-/** One member of the evolution line on one line (the title links to pvpivs.com). */
+/** One member of the evolution line on one line. */
 function lineText(member: LineMember, view: RankView): string {
   const name = `**${plain(member.entry.name)}**`;
   const { level50, level51 } = member.ranks;
   if (!level50) return `${name} · ${notInLeague(view.league)}`;
   const buddy =
-    level51 && level51.rank !== level50.rank ? ` (best buddy: rank ${String(level51.rank)})` : '';
+    level51 && level51.rank !== level50.rank ? ` (best buddy: rank ${number(level51.rank)})` : '';
   return (
-    `${name} · rank ${String(level50.rank)}${buddy} · ${percentText(level50.percent)} · ` +
+    `${name} · rank ${number(level50.rank)}${buddy} · ${percentText(level50.percent)} · ` +
     atLevel(level50.spread)
   );
 }
 
+/** The custom-id kind of the buttons under an answer of `/rank` (`rankControls`). */
+export const RANK_KIND = 'rank';
+/** Their one action: show the ranking as the rest of the custom id says. */
+export const RANK_SHOW = 'show';
+
+/** What an answer of `/rank` shows, as its buttons say it: everything but the Pokémon's key. */
+export interface RankState {
+  league: League;
+  ivs: Ivs;
+  floor: IvFloor;
+  evolutions: boolean;
+}
+
+/** `10-12-13`: the IVs as a part of a custom id. */
+export const ivArg = (ivs: Ivs): string =>
+  `${String(ivs.attack)}-${String(ivs.defense)}-${String(ivs.stamina)}`;
+
 /**
- * The answer of `/rank`: the legacy layout made tidy. The title names the Pokémon, the IVs and
- * the league and links to the ranking on pvpivs.com; the fields say where the combination stands
- * up to level 50, and up to level 51 (a best buddy) when that differs, with the best
- * combination; the evolution line on request is the description (it holds 4,096 characters, a
- * field 1,024); a filter is the footer. Coloured by the share of the best stat product.
+ * The custom id of a button that shows the ranking of a Pokémon as `state` says:
+ * `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>` (the last: the evolution line shown).
+ * Nothing about the answer is kept anywhere else. Undefined when it would be longer than
+ * Discord allows (no key of the game master comes close).
  */
-export function renderRank(view: RankView): APIEmbed {
-  const { entry, ivs, league, floor, ranks } = view;
-  const fields: NonNullable<APIEmbed['fields']> =
-    ranks.level51 === undefined
-      ? [{ name: 'Rank', value: rankLines(ranks.level50, league) }]
-      : [
-          { name: 'Up to level 50', value: rankLines(ranks.level50, league), inline: true },
-          {
-            name: 'Up to level 51 (best buddy)',
-            value: rankLines(ranks.level51, league),
-            inline: true,
-          },
-        ];
-  const heading = '**Evolution line**\n';
-  const description =
-    view.line === undefined
-      ? undefined
-      : heading +
-        (view.line.length <= 1
-          ? `${plain(entry.name)} does not evolve.`
-          : fitItems(
-              view.line.map((member) => lineText(member, view)),
-              LIMITS.embedDescription - heading.length,
-              '\n',
-            ));
+export function rankButtonId(key: string, state: RankState): string | undefined {
+  return encodeCustomIdIfFits({
+    kind: RANK_KIND,
+    id: key,
+    action: RANK_SHOW,
+    args: [state.league, ivArg(state.ivs), state.floor, state.evolutions ? '1' : '0'],
+  });
+}
+
+/** The leagues' buttons say only the first word of the league's name. */
+const LEAGUE_LABELS: Readonly<Record<League, string>> = {
+  little: 'Little',
+  great: 'Great',
+  ultra: 'Ultra',
+  master: 'Master',
+};
+
+function stateButton(
+  customId: string,
+  label: string,
+  shown: boolean,
+): APIButtonComponentWithCustomId {
   return {
-    title: `${entry.name} ${ivText(ivs)} · ${LEAGUE_NAMES[league]}`,
-    url: pvpivsLink(entry, league, ivs),
-    ...(description === undefined ? {} : { description }),
-    color: rankColour(ranks.level50?.percent ?? 0),
-    fields,
-    ...(view.picture === undefined ? {} : { thumbnail: { url: view.picture } }),
-    ...(floor === 'none'
-      ? {}
-      : {
-          footer: {
-            text: `Filter: ${IV_FLOOR_NAMES[floor]} (IVs from ${String(IV_FLOOR_VALUE[floor])})`,
-          },
-        }),
+    type: ComponentType.Button,
+    style: shown ? ButtonStyle.Primary : ButtonStyle.Secondary,
+    custom_id: customId,
+    label,
+    ...(shown ? { disabled: true } : {}),
   };
 }
+
+/**
+ * The answer of `/rank` (plan 8B-2), one components-v2 message coloured by the share of the
+ * best stat product: the Pokémon with its IVs, the league and the rank up to level 50 beside its
+ * picture; where it stands up to level 50, and up to 51 (a best buddy) when that differs, each
+ * with its spread and the best combination in small print; the evolution line when asked for;
+ * the filter; the leagues' buttons (the shown one pressed and disabled), the evolution line's
+ * and a link to the ranking on pvpivs.com. A Pokémon whose custom ids would not fit has the link
+ * alone.
+ */
+export function renderRank(view: RankView): V2Message {
+  const { entry, ivs, league, floor, ranks } = view;
+  const { level50, level51 } = ranks;
+  const head = [
+    `### ${plain(entry.name)} ${ivText(ivs)}`,
+    LEAGUE_NAMES[league],
+    level50 ? rankLine(level50) : notInLeague(league),
+  ].join('\n');
+  const parts: APIComponentInContainer[] = [
+    view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
+  ];
+  const caps: string[] = [];
+  if (level50) {
+    caps.push(
+      capText(
+        level51 === undefined
+          ? '**Up to level 50** · the same rank up to 51'
+          : '**Up to level 50**',
+        level50,
+      ),
+    );
+  }
+  if (level51) {
+    caps.push(
+      capText(
+        `**Up to level 51 (best buddy)** · rank ${number(level51.rank)} · ` +
+          percentText(level51.percent),
+        level51,
+      ),
+    );
+  }
+  if (caps.length > 0) parts.push(separator(), ...caps.map(textDisplay));
+  const filter =
+    floor === 'none'
+      ? undefined
+      : `-# Filter: ${IV_FLOOR_NAMES[floor]} (IVs from ${String(IV_FLOOR_VALUE[floor])})`;
+  if (view.line !== undefined) {
+    const heading = '**Evolution line**\n';
+    const used = head.length + caps.join('').length + (filter?.length ?? 0) + heading.length;
+    parts.push(
+      separator(),
+      textDisplay(
+        heading +
+          (view.line.length <= 1
+            ? `${plain(entry.name)} does not evolve.`
+            : fitItems(
+                view.line.map((member) => lineText(member, view)),
+                TEXT_BUDGET - used,
+                '\n',
+              )),
+      ),
+    );
+  }
+  if (filter !== undefined) parts.push(textDisplay(filter));
+  parts.push(separator());
+  const state: RankState = { league, ivs, floor, evolutions: view.line !== undefined };
+  const leagueIds = LEAGUES.map((each) => rankButtonId(entry.key, { ...state, league: each }));
+  const evolutionId = rankButtonId(entry.key, { ...state, evolutions: !state.evolutions });
+  const link = linkButton('pvpivs.com', undefined, pvpivsLink(entry, league, ivs));
+  if (evolutionId === undefined || leagueIds.some((id) => id === undefined)) {
+    parts.push(actionRow([link]));
+  } else {
+    parts.push(
+      actionRow(
+        LEAGUES.map((each, i) =>
+          stateButton(leagueIds[i] ?? '', LEAGUE_LABELS[each], each === league),
+        ),
+      ),
+      actionRow([
+        stateButton(
+          evolutionId,
+          state.evolutions ? 'Hide evolution line' : 'Evolution line',
+          false,
+        ),
+        link,
+      ]),
+    );
+  }
+  return { v2: true, components: [container(rankColour(level50?.percent ?? 0), parts)] };
+}
diff --git a/src/render/v2.ts b/src/render/v2.ts
index 6e18b458cc3e1b66d9c3fd36b8e7d0348803a805..6cc567ec4e6c7404d5ca1c5a284e209ecff1a857 100644
--- a/src/render/v2.ts
+++ b/src/render/v2.ts
@@ -43,13 +43,20 @@ export function actionRow(
   return { type: ComponentType.ActionRow, components: buttons };
 }
 
-/** A button that opens an address: a post, a message, a place in Google Maps. */
-export function linkButton(label: string, emoji: string, url: string): APIButtonComponentWithURL {
+/**
+ * A button that opens an address: a post, a message, a place in Google Maps, a page of another
+ * site (without an emoji: Discord marks a link button with its own sign).
+ */
+export function linkButton(
+  label: string,
+  emoji: string | undefined,
+  url: string,
+): APIButtonComponentWithURL {
   return {
     type: ComponentType.Button,
     style: ButtonStyle.Link,
     label,
-    emoji: { name: emoji },
+    ...(emoji === undefined ? {} : { emoji: { name: emoji } }),
     url,
   };
 }
````

### Task 3: Help as components-v2 pages with menus and buttons between them

Prototype commit: `6ee01a00117c904084bac0602389d3a0b3386b5b`

R3 of plan 8B-2. /help answers privately with one page at a time, and its
controls (kind `help`, helpControls in src/components/index.ts) show
another page in the place of the one they are on (`update`):

- The overview: `### Professor Pine commands`, the hint, and one text per
  group with its commands' names only (`/interested` `/hmm` · `/join`
  `/coming` · ...), then the menu `Show a group…` (help:overview:group,
  its value the category, each option with its count of commands). The
  groups get the text room by need (roomsByNeed: the small groups whole,
  smallest first, the rest sharing what is left); a group whose names
  still do not fit says how many it left out, never cutting a name. Order
  and visibility as before (helpGroupsOf: the settings' groups, then the
  staff's for staff).
- A group: `### <label>`, `N commands`, a line per command with its
  names and description (fitLines, "…and N more"), the menu `Details of a
  command…` (help:group:<category>:command; a second menu
  help:group:<category>:more for those past 25, at most 25 more) and
  `◀ All groups` (help:group:<category>:overview).
- A command (also what /help command:<name> answers): `### /raid`, the
  description and details (cut to what is left of the budget), then
  **Usage** and **Examples** as code lines (fitted, 1,400 and 700
  characters at most), a menu `Subcommands of a group…` for a command
  with groups of subcommands (help:command:<name>:subgroup, its value the
  group), and `◀ <its group's label>` / `All groups`
  (help:command:<path>:back and :overview). Back goes one level up: a
  group of subcommands and a subcommand lead to their command (`◀ /gym`),
  a subcommand of a group to its group (`/admin boss add`: `◀ /admin
  boss`, which opens the group's page).

Every press asks anew who is staff: a staff group or command reached by a
control is answered as one that does not exist ("There is no such group
of commands.", "There is no /gym command."). MEMBER_READ_THROTTLE for the
controls (their own window, component:help); /help itself stays
unthrottled. The embed renderers are gone; the tests that read /wild's
help read the page. test/support/messages.ts has selectsOf; v2.ts menuRow.

Decisions:
- Custom ids: the id says the kind of page (overview, group, command), the
  action which page (a category, a command's path, which may hold spaces),
  the first argument what the control does. A category cannot be used as
  the page's id alone: /train, /meetup, /admin and /region are also
  command names.
- HELP_COLOUR is the blue of the lists (LIST_COLOUR): the embed had none.
- The command page's hint now says the groups can be picked below.

**Files:**

```
 src/commands/notifications/wild.test.ts |  13 +-
 src/commands/util/help-render.test.ts   | 412 +++++++++++++++++++++++++++++++++-------------------
 src/commands/util/help-render.ts        | 388 +++++++++++++++++++++++++++++++++++++++----------
 src/commands/util/help.test.ts          | 165 +++++++++++++++------
 src/commands/util/help.ts               | 124 +++++++++++++---
 src/components/index.ts                 |   2 +
 src/render/v2.ts                        |   8 +
 test/support/messages.ts                |  26 ++++
 8 files changed, 841 insertions(+), 297 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/notifications/wild.test.ts src/commands/util/help-render.test.ts src/commands/util/help.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 6ee01a00117c904084bac0602389d3a0b3386b5b -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Help as components-v2 pages with menus and buttons between them`, the body above and the trailer, staging exactly
  `src/commands/notifications/wild.test.ts src/commands/util/help-render.test.ts src/commands/util/help-render.ts src/commands/util/help.test.ts src/commands/util/help.ts src/components/index.ts src/render/v2.ts test/support/messages.ts`.

````diff
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index 38fa31ef7f0792e74bf978e51dcc0873bae26b65..92c59e4a9268a0befbf5d9c343753dae671e971f 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -212,8 +212,7 @@ describe('/wild', () => {
       `-# ${SPAWN_CAUTION} · /wild reports a spawn like this one`,
     );
     expect(text?.message.content).toMatch(/\n-# \/wild reports a spawn like this one$/);
-    const help = (of: typeof settings) =>
-      renderCommandHelp(wildCommand, of).toJSON().description ?? '';
+    const help = (of: typeof settings) => textDisplays(renderCommandHelp(wildCommand, of))[0] ?? '';
     expect(help(settings)).toContain('`/want`');
     expect(help(settings)).toContain('get a direct message');
     expect(help(off)).not.toContain('/want');
@@ -318,7 +317,7 @@ describe('/wild', () => {
     const listed = ['Articuno', 'Nobody', 'tapu_koko', 'giratina_origin'];
     const settings = { ...made.ctx.config.settings, wildSpawnExceptions: listed };
     // Before anything read the list, the help does not guess at names.
-    expect(renderCommandHelp(wildCommand, settings).toJSON().description).toContain(
+    expect(textDisplays(renderCommandHelp(wildCommand, settings))[0]).toContain(
       'ultra beasts do not, with few exceptions. `details`',
     );
     const { ctx, entries } = createTestContext({
@@ -354,19 +353,19 @@ describe('/wild', () => {
     );
     expect(warned).toMatchObject([{ level: 40, text: 'Nobody', setting: 'wildSpawnExceptions' }]);
     // The help names what the game data knew, by its names: not `Nobody`, and no key.
-    const help = renderCommandHelp(wildCommand, settings).toJSON().description ?? '';
+    const help = textDisplays(renderCommandHelp(wildCommand, settings))[0] ?? '';
     expect(help).toContain(
       'ultra beasts do not, except Articuno, Tapu Koko and Giratina. `details`',
     );
     // Another settings object with the same list reads the same.
     const same = { ...settings, wildSpawnExceptions: [...listed] };
-    expect(renderCommandHelp(wildCommand, same).toJSON().description).toBe(help);
+    expect(textDisplays(renderCommandHelp(wildCommand, same))[0]).toBe(help);
     const none = renderCommandHelp(wildCommand, { ...settings, wildSpawnExceptions: [] });
-    expect(none.toJSON().description).toContain('ultra beasts do not. `details`');
+    expect(textDisplays(none)[0]).toContain('ultra beasts do not. `details`');
     // The usual list is read here, as the start of the bot reads it: whether an earlier test
     // happened to read it must not matter.
     wildExceptionsOf(made.ctx);
-    const usual = renderCommandHelp(wildCommand, made.ctx.config.settings).toJSON().description;
+    const usual = textDisplays(renderCommandHelp(wildCommand, made.ctx.config.settings))[0];
     expect(usual).toContain('ultra beasts do not, except Uxie, Mesprit and Azelf. `details`');
   });
 
diff --git a/src/commands/util/help-render.test.ts b/src/commands/util/help-render.test.ts
index 6bc5b848ce59eaeb3e2632cb707034434ef653f6..948ed5043b838f58e1b66480acc06f299be54625 100644
--- a/src/commands/util/help-render.test.ts
+++ b/src/commands/util/help-render.test.ts
@@ -4,18 +4,25 @@ import {
   SlashCommandSubcommandBuilder,
 } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { buttonsOf, selectsOf, textDisplays, textOf } from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { commandGroup } from '../../discord/command-group.js';
 import type { CommandModule, SimpleCommand } from '../../discord/command.js';
+import { MAX_CUSTOM_ID_LENGTH } from '../../discord/custom-id.js';
 import { loadSettings } from '../../config/settings.js';
 import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
 import type { HelpCategory } from '../categories.js';
 import { commands } from '../index.js';
 import {
   fitLines,
+  helpGroupsOf,
   isStaffCommand,
   renderCommandHelp,
+  renderGroupHelp,
   renderHelpOverview,
   renderSubcommandHelp,
+  roomsByNeed,
+  type HelpGroup,
 } from './help-render.js';
 
 const noop = () => Promise.resolve();
@@ -40,13 +47,15 @@ const all = [
 ];
 const groups = ['basic-raid', 'raid-crud', 'util'];
 
-/** Characters Discord counts against the 6,000 allowed in one embed. */
-function embedSize(json: ReturnType<ReturnType<typeof renderHelpOverview>['toJSON']>): number {
-  return (
-    (json.title?.length ?? 0) +
-    (json.description?.length ?? 0) +
-    (json.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0)
-  );
+/** The headings of the groups of an overview, by their bold first lines. */
+const groupLabels = (texts: readonly string[]): string[] =>
+  texts.slice(1).map((text) => /^\*\*(.+?)\*\*/.exec(text)?.[1] ?? '');
+
+/** The group of this bot's commands that has this label, as staff see them. */
+function realGroup(label: string): HelpGroup {
+  const found = helpGroupsOf(commands, SETTINGS.helpGroups, true).find((g) => g.label === label);
+  if (!found) throw new Error(`no group ${label}`);
+  return found;
 }
 
 describe('fitLines', () => {
@@ -76,19 +85,34 @@ describe('isStaffCommand', () => {
 });
 
 describe('renderHelpOverview', () => {
-  it('lists public categories in helpGroups order with labels', () => {
-    const fields = renderHelpOverview(all, groups, false).toJSON().fields ?? [];
-    expect(fields.map((f) => f.name)).toEqual([
-      'Raid Basics',
-      'Raid Creation and Maintenance',
-      'Utility',
+  it('lists public groups in helpGroups order, with their commands’ names and a menu', () => {
+    const message = renderHelpOverview(helpGroupsOf(all, groups, false));
+    const texts = textDisplays(message);
+    expect(texts[0]).toBe(
+      '### Professor Pine commands\n' +
+        'Pick a group to see what its commands do, or use `/help command:<name>`.',
+    );
+    expect(texts.slice(1)).toEqual([
+      '**Raid Basics**\n`/join`',
+      '**Raid Creation and Maintenance**\n`/raid`',
+      '**Utility**\n`/help`',
+    ]);
+    expect(selectsOf(message)).toEqual([
+      {
+        customId: 'help:overview:group',
+        placeholder: 'Show a group…',
+        options: [
+          { label: 'Raid Basics', value: 'basic-raid', description: '1 command' },
+          { label: 'Raid Creation and Maintenance', value: 'raid-crud', description: '1 command' },
+          { label: 'Utility', value: 'util', description: '1 command' },
+        ],
+      },
     ]);
-    expect(fields[0]?.value).toBe('`/join` About join');
   });
 
-  it('appends staff-only categories for staff', () => {
-    const fields = renderHelpOverview(all, groups, true).toJSON().fields ?? [];
-    expect(fields.map((f) => f.name)).toEqual([
+  it('appends staff-only groups for staff', () => {
+    const texts = textDisplays(renderHelpOverview(helpGroupsOf(all, groups, true)));
+    expect(groupLabels(texts)).toEqual([
       'Raid Basics',
       'Raid Creation and Maintenance',
       'Utility',
@@ -97,35 +121,30 @@ describe('renderHelpOverview', () => {
   });
 
   it('ignores a help group the settings name that no command is filed under', () => {
-    const fields = renderHelpOverview(all, ['silph', ...groups], false).toJSON().fields ?? [];
-    expect(fields).toHaveLength(3);
+    expect(helpGroupsOf(all, ['silph', ...groups], false)).toHaveLength(3);
   });
 
-  it('lists the names only of a category whose descriptions do not fit, and loses no command', () => {
-    const many = Array.from({ length: 30 }, (_, i) => cmd(`command-number-${i}`, 'util'));
-    const fields = renderHelpOverview([...many, cmd('join', 'basic-raid')], groups, false).toJSON()
-      .fields;
-    const util = fields?.find((field) => field.name === 'Utility');
-    expect(util?.value.length).toBeLessThanOrEqual(1024);
-    expect(util?.value.split(' ').sort()).toEqual(many.map((c) => `\`/${c.data.name}\``).sort());
-    // The other categories keep their descriptions.
-    expect(fields?.find((field) => field.name === 'Raid Basics')?.value).toBe('`/join` About join');
+  it('says how many it left out when the names of a group do not fit, never cutting a name', () => {
+    const many = Array.from({ length: 400 }, (_, i) => cmd(`command-number-${i}`, 'util'));
+    const message = renderHelpOverview(helpGroupsOf(many, ['util'], false));
+    expectV2Sendable(message);
+    const names = textDisplays(message)[1] ?? '';
+    expect(names).toMatch(/ · …and \d+ more$/);
+    const shown = names
+      .replace(/^\*\*Utility\*\*\n/, '')
+      .replace(/ · …and \d+ more$/, '')
+      .split(' · ');
+    expect(shown.every((name) => /^`\/command-number-\d+`$/.test(name))).toBe(true);
   });
 
-  it('says how many it left out when not even the names of a category fit, never cutting a name', () => {
-    const many = Array.from({ length: 80 }, (_, i) => cmd(`command-number-${i}`, 'util'));
-    const field = renderHelpOverview(many, ['util'], false).toJSON().fields?.[0];
-    expect(field?.value.length).toBeLessThanOrEqual(1024);
-    expect(field?.value).toMatch(/ …and \d+ more$/);
-    const names = field?.value.replace(/ …and \d+ more$/, '').split(' ') ?? [];
-    expect(names.every((name) => /^`\/command-number-\d+`$/.test(name))).toBe(true);
-  });
-
-  it('shows every command of this bot that a member may use', () => {
-    const { helpGroups } = loadSettings(TEST_SETTINGS_PATH);
-    const text = JSON.stringify(renderHelpOverview(commands, helpGroups, true).toJSON());
+  it('shows every command of this bot that a member may use, within what a message holds', () => {
+    const { helpGroups } = SETTINGS;
+    const forStaff = renderHelpOverview(helpGroupsOf(commands, helpGroups, true));
+    expectV2Sendable(forStaff);
+    const text = textOf(forStaff);
     for (const command of commands) expect(text).toContain(`\`/${command.data.name}\``);
-    const forMembers = JSON.stringify(renderHelpOverview(commands, helpGroups, false).toJSON());
+    expect(text).not.toContain('more');
+    const forMembers = textOf(renderHelpOverview(helpGroupsOf(commands, helpGroups, false)));
     for (const command of commands) {
       expect(forMembers.includes(`\`/${command.data.name}\``)).toBe(
         helpGroups.includes(command.help.category),
@@ -133,90 +152,95 @@ describe('renderHelpOverview', () => {
     }
   });
 
-  it('still has room to describe every command of this bot, in every category', () => {
-    // A category that outgrows its field (1024 characters) falls back to names alone.
-    const { helpGroups } = loadSettings(TEST_SETTINGS_PATH);
-    const { fields = [] } = renderHelpOverview(commands, helpGroups, true).toJSON();
-    expect(fields.map((field) => field.name)).toEqual(
-      expect.arrayContaining(['Raid Basics', 'Raid Creation and Maintenance', 'Meetups']),
-    );
-    for (const field of fields) {
-      expect(field.value.length).toBeLessThanOrEqual(1024);
-      for (const line of field.value.split('\n')) expect(line).toMatch(/^`\/[a-z-]+` \S.*$/);
-    }
-    // A command's other names stand beside it, and its category keeps its descriptions.
-    const basics = fields.find((field) => field.name === 'Raid Basics')?.value.split('\n');
-    expect(basics).toContain(
-      '`/interested` `/hmm` Say that you are interested in this raid, train or meetup',
-    );
-    expect(basics).toContain(
-      '`/join` `/coming` Say that you are coming to this raid, train or meetup',
-    );
-    expect(fields.find((field) => field.name === 'Utility')?.value.split('\n')).toContain(
-      '`/rank` `/little` `/great` `/ultra` `/master` The PvP rank of a Pokémon with these IVs in a league',
+  it('writes a command’s other forms beside its name', () => {
+    const basics = textDisplays(renderHelpOverview(helpGroupsOf(commands, groups, false)))[1];
+    expect(basics).toContain('`/interested` `/hmm` · ');
+    expect(basics).toContain('`/join` `/coming` · ');
+    const utility = textOf(renderHelpOverview(helpGroupsOf(commands, SETTINGS.helpGroups, false)));
+    expect(utility).toContain('`/rank` `/little` `/great` `/ultra` `/master`');
+  });
+});
+
+describe('roomsByNeed', () => {
+  it('gives the small texts all they need and lets the others share the rest', () => {
+    expect(roomsByNeed([10, 500, 20, 900], 1000)).toEqual([10, 485, 20, 485]);
+    expect(roomsByNeed([10, 20], 1000)).toEqual([10, 20]);
+    expect(roomsByNeed([600, 600], 1000)).toEqual([500, 500]);
+  });
+
+  it('shows small groups whole beside a group too large for its share', () => {
+    const big = Array.from({ length: 400 }, (_, i) => cmd(`command-number-${i}`, 'util'));
+    const message = renderHelpOverview(
+      helpGroupsOf(
+        [...big, cmd('join', 'basic-raid'), cmd('raid', 'raid-crud')],
+        ['basic-raid', 'raid-crud', 'util'],
+        false,
+      ),
     );
-    expect(fields.find((field) => field.name === 'Meetups')?.value.split('\n')).toEqual([
-      '`/info` Write what there is to know about this meetup, in a form',
-      '`/meetup` Create a meetup in this region, with a post of its own',
-      '`/name` Rename this train or meetup',
+    expectV2Sendable(message);
+    const [, basics, crud, util] = textDisplays(message);
+    expect([basics, crud]).toEqual([
+      '**Raid Basics**\n`/join`',
+      '**Raid Creation and Maintenance**\n`/raid`',
     ]);
+    expect(util).toMatch(/ · …and \d+ more$/);
+    // The large group has all the room the small ones left.
+    expect(textOf(message).length).toBeGreaterThan(3_800);
   });
+});
 
-  it('explains every command of this bot within what an embed holds', () => {
-    for (const command of commands) {
-      const json = renderCommandHelp(command, SETTINGS).toJSON();
-      expect(json.title).toBe(`/${command.data.name}`);
-      expect((json.description ?? '').length).toBeLessThanOrEqual(4096);
-      for (const field of json.fields ?? []) expect(field.value.length).toBeLessThanOrEqual(1024);
-    }
+describe('renderGroupHelp', () => {
+  it('lists a group’s commands with what they do, a menu of them and the way back', () => {
+    const message = renderGroupHelp(realGroup('Meetups'));
+    expect(textDisplays(message)).toEqual([
+      '### Meetups\n3 commands',
+      [
+        '`/info` Write what there is to know about this meetup, in a form',
+        '`/meetup` Create a meetup in this region, with a post of its own',
+        '`/name` Rename this train or meetup',
+      ].join('\n'),
+    ]);
+    const [menu] = selectsOf(message);
+    expect(menu?.customId).toBe('help:group:meetup:command');
+    expect(menu?.placeholder).toBe('Details of a command…');
+    expect(menu?.options.map((option) => [option.label, option.value])).toEqual([
+      ['/info', 'info'],
+      ['/meetup', 'meetup'],
+      ['/name', 'name'],
+    ]);
+    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
+      ['◀ All groups', 'help:group:meetup:overview'],
+    ]);
   });
 
-  it('explains the commands of a meetup: when it is archived, and how its times are read', () => {
-    const explained = (name: string): string => {
-      const command = commands.find((c) => c.data.name === name);
-      if (!command) throw new Error(`no command ${name}`);
-      const json = renderCommandHelp(command, SETTINGS).toJSON();
-      expect(json.fields?.[0]).toMatchObject({ name: 'Usage' });
-      return json.description ?? '';
-    };
-    expect(explained('meetup')).toContain(
-      'a day after it was made, or after its last time was removed',
-    );
-    expect(explained('name')).toContain('renamed twice in ten minutes');
-    expect(explained('info')).toContain('A form opens with the text as it is now');
-    for (const name of ['meet', 'end']) {
-      expect(explained(name)).toContain('month-day');
-      expect(explained(name)).toContain("today's date");
+  it('keeps every group of this bot within what a message holds', () => {
+    for (const group of helpGroupsOf(commands, SETTINGS.helpGroups, true)) {
+      const message = renderGroupHelp(group);
+      expectV2Sendable(message);
+      expect(textOf(message), group.label).not.toMatch(/…and \d+ more/);
     }
-    expect(explained('end')).toContain('after its last time was removed');
   });
 
-  it('falls back to names only when descriptions would exceed what one embed holds', () => {
-    const categories: HelpCategory[] = [
-      'basic-raid',
-      'raid-crud',
-      'train',
-      'meetup',
-      'roles',
-      'notifications',
-      'friends',
-      'util',
-    ];
-    const long = 'x'.repeat(90);
-    const many = categories.flatMap((category) =>
-      Array.from({ length: 10 }, (_, i) => cmd(`${category}-${i}`, category, undefined, long)),
-    );
-    const json = renderHelpOverview(many, categories, false).toJSON();
-    expect(embedSize(json)).toBeLessThanOrEqual(6000);
-    expect(json.fields).toHaveLength(8);
-    expect(json.fields?.[0]?.value).toBe(
-      Array.from({ length: 10 }, (_, i) => `\`/basic-raid-${i}\``).join(' '),
+  it('gives a group of more than 25 a second menu, and fits its lines', () => {
+    const long = 'x'.repeat(95);
+    const many = Array.from({ length: 60 }, (_, i) =>
+      cmd(`command-${String(i).padStart(2, '0')}`, 'util', undefined, long),
     );
+    const [group] = helpGroupsOf(many, ['util'], false);
+    if (!group) throw new Error('no group');
+    const message = renderGroupHelp(group);
+    expectV2Sendable(message);
+    const menus = selectsOf(message);
+    expect(menus.map((menu) => [menu.customId, menu.options.length])).toEqual([
+      ['help:group:util:command', 25],
+      ['help:group:util:more', 25],
+    ]);
+    expect(textOf(message)).toMatch(/\n…and \d+ more$/);
   });
 });
 
 describe('renderCommandHelp', () => {
-  it('shows usage with required and optional options, details and examples', () => {
+  it('shows what it does, the usage, the examples, and the way back to its group', () => {
     const command = cmd('meet', 'basic-raid', (b) =>
       b
         .addStringOption((o) => o.setName('time').setDescription('When').setRequired(true))
@@ -227,13 +251,16 @@ describe('renderCommandHelp', () => {
       details: 'Sets your meeting time.',
       examples: ['/meet time:2:30'],
     };
-    const json = renderCommandHelp(command, SETTINGS).toJSON();
-    expect(json.title).toBe('/meet');
-    expect(json.description).toBe('About meet\n\nSets your meeting time.');
-    expect(json.fields).toEqual([
-      { name: 'Usage', value: '`/meet <time> [group]`' },
-      { name: 'Examples', value: '`/meet time:2:30`' },
+    const message = renderCommandHelp(command, SETTINGS);
+    expect(textDisplays(message)).toEqual([
+      '### /meet\nAbout meet\n\nSets your meeting time.',
+      '**Usage**\n`/meet <time> [group]`\n**Examples**\n`/meet time:2:30`',
+    ]);
+    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
+      ['◀ Raid Basics', 'help:command:meet:back'],
+      ['All groups', 'help:command:meet:overview'],
     ]);
+    expect(selectsOf(message)).toEqual([]);
   });
 
   it('asks the settings for details that depend on what the installation has', () => {
@@ -243,28 +270,38 @@ describe('renderCommandHelp', () => {
       details: (settings) => (settings.features.notifications ? 'Tells who wants it.' : 'Posts.'),
     };
     const off = { ...SETTINGS, features: { ...SETTINGS.features, notifications: false } };
-    expect(renderCommandHelp(command, SETTINGS).toJSON().description).toBe(
-      'About wild\n\nTells who wants it.',
+    expect(textDisplays(renderCommandHelp(command, SETTINGS))[0]).toBe(
+      '### /wild\nAbout wild\n\nTells who wants it.',
+    );
+    expect(textDisplays(renderCommandHelp(command, off))[0]).toBe(
+      '### /wild\nAbout wild\n\nPosts.',
     );
-    expect(renderCommandHelp(command, off).toJSON().description).toBe('About wild\n\nPosts.');
   });
 
-  it('lists every subcommand with what it does, and a group on one line', () => {
-    const json = renderCommandHelp(route(), SETTINGS).toJSON();
-    expect(json.fields?.[0]?.value).toBe(
-      '`/route show` Show the route\n' +
-        '`/route add <gym>` Add a stop\n' +
+  it('lists every subcommand with what it does, a group on one line, and a menu of the groups', () => {
+    const message = renderCommandHelp(route(), SETTINGS);
+    expect(textDisplays(message)).toEqual([
+      '### /route\nThe route of a train\n\nPick a group below, or use ' +
+        '`/help command:route saved`, for the subcommands of a group.',
+      '**Usage**\n`/route show` Show the route\n`/route add <gym>` Add a stop\n' +
         '`/route saved …` Saved routes',
-    );
-    expect(json.description).toBe(
-      'The route of a train\n\nUse `/help command:route saved` for the subcommands of a group.',
-    );
+    ]);
+    expect(selectsOf(message)).toEqual([
+      {
+        customId: 'help:command:route:subgroup',
+        placeholder: 'Subcommands of a group…',
+        options: [{ label: '/route saved', value: 'saved', description: 'Saved routes' }],
+      },
+    ]);
+    expect(buttonsOf(message).map((button) => button.label)).toEqual(['◀ Trains', 'All groups']);
   });
 
-  it('names every subcommand and group of every command of this bot', () => {
+  it('names every subcommand and group of every command of this bot, within a message', () => {
     for (const command of commands) {
       const json = command.data.toJSON();
-      const usage = renderCommandHelp(command, SETTINGS).toJSON().fields?.[0]?.value ?? '';
+      const message = renderCommandHelp(command, SETTINGS);
+      expectV2Sendable(message);
+      const usage = textDisplays(message)[1] ?? '';
       for (const option of json.options ?? []) {
         const nested =
           option.type === ApplicationCommandOptionType.Subcommand ||
@@ -273,6 +310,69 @@ describe('renderCommandHelp', () => {
         expect(usage, `/${json.name} ${option.name}`).toContain(`/${json.name} ${option.name}`);
       }
       expect(usage, `/${json.name}`).not.toMatch(/more$/);
+      expect(textDisplays(message)[0], `/${json.name}`).not.toMatch(/…$/);
+    }
+  });
+
+  it('explains the commands of a meetup: when it is archived, and how its times are read', () => {
+    const explained = (name: string): string => {
+      const command = commands.find((c) => c.data.name === name);
+      if (!command) throw new Error(`no command ${name}`);
+      const texts = textDisplays(renderCommandHelp(command, SETTINGS));
+      expect(texts[1]).toMatch(/^\*\*Usage\*\*/);
+      return texts[0] ?? '';
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
+  it('cuts what is too long for a message, and keeps the usage and the controls', () => {
+    const command = cmd('long', 'util');
+    command.help = {
+      category: 'util',
+      details: '*'.repeat(5_000),
+      examples: Array.from({ length: 100 }, (_, i) => `/long example:${'x'.repeat(30)}${i}`),
+    };
+    const message = renderCommandHelp(command, SETTINGS);
+    expectV2Sendable(message);
+    expect(textDisplays(message)[0]).toMatch(/…$/);
+    expect(textDisplays(message)[1]).toMatch(/^\*\*Usage\*\*\n`\/long`\n\*\*Examples\*\*\n/);
+    expect(textDisplays(message)[1]).toMatch(/…and \d+ more$/);
+    expect(buttonsOf(message)).toHaveLength(2);
+  });
+
+  it('has custom ids that fit for every command, group and subcommand of this bot', () => {
+    for (const command of commands) {
+      const json = command.data.toJSON();
+      // The paths of its subcommands and groups, after the command's name.
+      const paths = (json.options ?? []).flatMap((option) =>
+        option.type === ApplicationCommandOptionType.SubcommandGroup
+          ? [option.name, ...(option.options ?? []).map((sub) => `${option.name} ${sub.name}`)]
+          : option.type === ApplicationCommandOptionType.Subcommand
+            ? [option.name]
+            : [],
+      );
+      for (const path of ['', ...paths]) {
+        const page =
+          path === ''
+            ? renderCommandHelp(command, SETTINGS)
+            : renderSubcommandHelp(command, path, SETTINGS);
+        expect(page, `/${json.name} ${path}`).toBeDefined();
+        const ids = [
+          ...buttonsOf(page).map((button) => button.customId ?? ''),
+          ...selectsOf(page).map((menu) => menu.customId),
+        ];
+        expect(ids.length, `/${json.name} ${path}`).toBeGreaterThanOrEqual(2);
+        for (const id of ids) expect(id.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
+      }
     }
   });
 });
@@ -308,37 +408,45 @@ function route(): CommandModule {
 }
 
 describe('renderSubcommandHelp', () => {
-  it('explains one subcommand with its own details and examples', () => {
-    expect(renderSubcommandHelp(route(), 'add', SETTINGS)?.toJSON()).toMatchObject({
-      title: '/route add',
-      description: 'Add a stop\n\nThe stop goes to the end of the route.',
-      fields: [
-        { name: 'Usage', value: '`/route add <gym>`' },
-        { name: 'Examples', value: '`/route add gym:mall`' },
-      ],
-    });
+  it('explains one subcommand with its own details and examples, and leads back to its command', () => {
+    const message = renderSubcommandHelp(route(), 'add', SETTINGS);
+    expect(textDisplays(message)).toEqual([
+      '### /route add\nAdd a stop\n\nThe stop goes to the end of the route.',
+      '**Usage**\n`/route add <gym>`\n**Examples**\n`/route add gym:mall`',
+    ]);
+    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
+      ['◀ /route', 'help:command:route add:back'],
+      ['All groups', 'help:command:route add:overview'],
+    ]);
   });
 
-  it('finds a subcommand inside a group', () => {
-    expect(renderSubcommandHelp(route(), 'saved load', SETTINGS)?.toJSON()).toMatchObject({
-      title: '/route saved load',
-      description: 'Use a saved route',
-      fields: [{ name: 'Usage', value: '`/route saved load <name>`' }],
-    });
+  it('finds a subcommand inside a group, and leads back to the group', () => {
+    const message = renderSubcommandHelp(route(), 'saved load', SETTINGS);
+    expect(textDisplays(message)).toEqual([
+      '### /route saved load\nUse a saved route',
+      '**Usage**\n`/route saved load <name>`',
+    ]);
+    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
+      ['◀ /route saved', 'help:command:route saved load:back'],
+      ['All groups', 'help:command:route saved load:overview'],
+    ]);
   });
 
   it('is undefined for a subcommand the command does not have', () => {
     expect(renderSubcommandHelp(route(), 'remove', SETTINGS)).toBeUndefined();
     expect(renderSubcommandHelp(route(), 'saved load now', SETTINGS)).toBeUndefined();
-    expect(renderSubcommandHelp(route(), 'show', SETTINGS)?.toJSON().title).toBe('/route show');
+    expect(textDisplays(renderSubcommandHelp(route(), 'show', SETTINGS))[0]).toMatch(
+      /^### \/route show\n/,
+    );
     expect(renderSubcommandHelp(cmd('join', 'basic-raid'), 'now', SETTINGS)).toBeUndefined();
   });
 
   it('lists the subcommands of a group with what each does', () => {
-    expect(renderSubcommandHelp(route(), 'saved', SETTINGS)?.toJSON()).toMatchObject({
-      title: '/route saved',
-      description: 'Saved routes',
-      fields: [{ name: 'Usage', value: '`/route saved load <name>` Use a saved route' }],
-    });
+    const message = renderSubcommandHelp(route(), 'saved', SETTINGS);
+    expect(textDisplays(message)).toEqual([
+      '### /route saved\nSaved routes',
+      '**Usage**\n`/route saved load <name>` Use a saved route',
+    ]);
+    expect(buttonsOf(message)[0]?.label).toBe('◀ /route');
   });
 });
diff --git a/src/commands/util/help-render.ts b/src/commands/util/help-render.ts
index 6afa1cbe48992b755791538cbda6b5c28fb9b340..d516649fdbbf5b7ef23a863244c9b79d9a09bb84 100644
--- a/src/commands/util/help-render.ts
+++ b/src/commands/util/help-render.ts
@@ -1,25 +1,67 @@
 import {
   ApplicationCommandOptionType,
-  EmbedBuilder,
+  ButtonStyle,
+  ComponentType,
   type APIApplicationCommandOption,
+  type APIButtonComponentWithCustomId,
+  type APIComponentInContainer,
+  type APISelectMenuOption,
+  type APIStringSelectComponent,
 } from 'discord.js';
 import type { Settings } from '../../config/settings.js';
 import { subcommandPath, type CommandHelp, type CommandModule } from '../../discord/command.js';
-import { fitItems } from '../../render/text.js';
+import { encodeCustomIdIfFits } from '../../discord/custom-id.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { cutText, TEXT_BUDGET } from '../../render/party-post.js';
+import { count, fitItems } from '../../render/text.js';
+import {
+  actionRow,
+  container,
+  LIST_COLOUR,
+  menuRow,
+  separator,
+  textDisplay,
+} from '../../render/v2.js';
 import { CATEGORY_LABELS, type HelpCategory } from '../categories.js';
 
-/** Discord's limits for one embed. */
-const FIELD_LIMIT = 1024;
-const DESCRIPTION_LIMIT = 4096;
-const MAX_FIELDS = 25;
-const EMBED_LIMIT = 6000;
+/**
+ * What `/help` shows (plan 8B-2): components-v2 messages for the member alone, one page at a
+ * time (the overview, a group of commands, one command), with the controls that lead from one
+ * to another (`helpControls`, kind `help`).
+ */
 
-const OVERVIEW_TITLE = 'Professor Pine commands';
-const OVERVIEW_HINT = 'Use `/help command:<name>` for details on one command.';
+/** The colour of the edge of a help page: the blue of the lists. */
+export const HELP_COLOUR = LIST_COLOUR;
 
-function truncate(text: string, limit: number): string {
-  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
-}
+/** The custom-id kind of the controls of a help page. */
+export const HELP_KIND = 'help';
+
+/**
+ * The custom ids of the controls, by the page they are on (the custom id's id: `overview`,
+ * `group`, `command`), the page itself (its action: a category, a command's path) and what the
+ * control does (the first argument):
+ * - `help:overview:group`: the overview's menu of groups (its value: a category);
+ * - `help:group:<category>:command` and `…:command:more`: a group's menus of commands (their
+ *   value: a command's name); `help:group:<category>:overview`: "◀ All groups";
+ * - `help:command:<path>:back` ("◀" to the command's group, or to the command of a subcommand or
+ *   a group of subcommands), `help:command:<path>:overview` ("All groups"), and
+ *   `help:command:<path>:subgroup`, the menu of a command's groups of subcommands (its value: a
+ *   group's name).
+ */
+export const HELP_PAGES = { overview: 'overview', group: 'group', command: 'command' } as const;
+export const HELP_CONTROLS = {
+  group: 'group',
+  command: 'command',
+  more: 'more',
+  overview: 'overview',
+  back: 'back',
+  subgroup: 'subgroup',
+} as const;
+
+/** What a select menu holds at most. */
+const MAX_OPTIONS = 25;
+/** What an option's label and description hold. */
+const OPTION_TEXT = 100;
 
 /**
  * As many whole lines as fit in `limit` characters; when some do not, the last line says how
@@ -32,7 +74,7 @@ export function fitLines(lines: readonly string[], limit: number): string {
     const text = [...lines.slice(0, kept), `…and ${lines.length - kept} more`].join('\n');
     if (text.length <= limit) return text;
   }
-  return truncate(lines[0] ?? '', limit);
+  return cutText(lines[0] ?? '', limit);
 }
 
 /** A command in a category outside `settings.helpGroups` is for staff. */
@@ -40,15 +82,34 @@ export function isStaffCommand(command: CommandModule, helpGroups: readonly stri
   return !helpGroups.includes(command.help.category);
 }
 
-const byName = (a: CommandModule, b: CommandModule) => a.data.name.localeCompare(b.data.name);
+/** A command as a help page lists it: by its name and its other forms (`/hmm` of `/interested`). */
+export interface HelpEntry {
+  command: CommandModule;
+  /** The command's name first, then its other forms. */
+  names: string[];
+}
+
+/** A group of commands: a help category with what is filed under it. */
+export interface HelpGroup {
+  category: HelpCategory;
+  label: string;
+  /** By name. */
+  entries: HelpEntry[];
+}
+
+const byName = (a: HelpEntry, b: HelpEntry) =>
+  a.command.data.name.localeCompare(b.command.data.name);
 
-export function renderHelpOverview(
+/**
+ * The groups of commands a member sees, in the order of `helpGroups` and then, for staff, the
+ * staff's groups by name. A command's other forms stand on its line, not on their own.
+ */
+export function helpGroupsOf(
   commands: readonly CommandModule[],
   helpGroups: readonly string[],
   includeStaff: boolean,
-): EmbedBuilder {
-  const byCategory = new Map<HelpCategory, CommandModule[]>();
-  /** The other forms of each command (`/hmm` of `/interested`), listed on its line. */
+): HelpGroup[] {
+  const byCategory = new Map<HelpCategory, HelpEntry[]>();
   const forms = new Map<string, string[]>();
   const listedNames = new Set(commands.map((command) => command.data.name));
   for (const command of commands) {
@@ -57,7 +118,7 @@ export function renderHelpOverview(
       continue;
     }
     const list = byCategory.get(command.help.category) ?? [];
-    list.push(command);
+    list.push({ command, names: [command.data.name] });
     byCategory.set(command.help.category, list);
   }
   const categories = [...byCategory.keys()];
@@ -65,40 +126,156 @@ export function renderHelpOverview(
     ...helpGroups.flatMap((group) => categories.filter((category) => category === group)),
     ...(includeStaff ? categories.filter((c) => !helpGroups.includes(c)).sort() : []),
   ];
+  return order.map((category) => ({
+    category,
+    label: CATEGORY_LABELS[category],
+    entries: (byCategory.get(category) ?? [])
+      .map((entry) => ({
+        ...entry,
+        names: [...entry.names, ...(forms.get(entry.command.data.name) ?? [])],
+      }))
+      .sort(byName),
+  }));
+}
+
+/** `` `/interested` `/hmm` ``. */
+const namesOf = (entry: HelpEntry): string => entry.names.map((name) => `\`/${name}\``).join(' ');
+
+function select(
+  customId: string,
+  placeholder: string,
+  options: APISelectMenuOption[],
+): APIStringSelectComponent {
+  return { type: ComponentType.StringSelect, custom_id: customId, placeholder, options };
+}
+
+const option = (label: string, value: string, description?: string): APISelectMenuOption => ({
+  label: cutText(label, OPTION_TEXT),
+  value,
+  ...(description ? { description: cutText(description, OPTION_TEXT) } : {}),
+});
+
+function button(customId: string, label: string): APIButtonComponentWithCustomId {
+  return { type: ComponentType.Button, style: ButtonStyle.Secondary, custom_id: customId, label };
+}
+
+/** A custom id of a help control; undefined when it would be too long (then no control). */
+function helpId(page: string, which: string, control?: string): string | undefined {
+  return encodeCustomIdIfFits({
+    kind: HELP_KIND,
+    id: page,
+    action: which,
+    ...(control === undefined ? {} : { args: [control] }),
+  });
+}
+
+/**
+ * The room each of several texts gets of `room` by what it needs: those that need no more than an
+ * equal share of what is left get all they need, smallest first, and the others share the rest
+ * equally.
+ */
+export function roomsByNeed(needs: readonly number[], room: number): number[] {
+  const rooms = needs.map(() => 0);
+  const order = needs.map((need, i) => ({ need, i })).sort((a, b) => a.need - b.need);
+  let left = room;
+  for (const [k, { need, i }] of order.entries()) {
+    const given = Math.min(need, Math.floor(left / (order.length - k)));
+    rooms[i] = given;
+    left -= given;
+  }
+  return rooms;
+}
 
-  // A command's other forms stand beside its name, with no more words: the field of the
-  // commands of a party is close to what a field holds.
-  const named = (c: CommandModule) =>
-    [c.data.name, ...(forms.get(c.data.name) ?? [])].map((name) => `\`/${name}\``).join(' ');
-  const described = (c: CommandModule) => `${named(c)} ${c.data.toJSON().description}`;
-  // A category whose lines with descriptions do not fit one field lists its names only, so
-  // that no command is missing from the overview; names are never cut.
-  const fieldsWith = (descriptions: boolean) =>
-    order.slice(0, MAX_FIELDS).map((category) => {
-      const listed = (byCategory.get(category) ?? []).sort(byName);
-      const lines = listed.map(described).join('\n');
-      return {
-        name: CATEGORY_LABELS[category],
-        value:
-          descriptions && lines.length <= FIELD_LIMIT
-            ? lines
-            : fitItems(listed.map(named), FIELD_LIMIT, ' '),
-      };
-    });
-  const size = (fields: ReadonlyArray<{ name: string; value: string }>) =>
-    OVERVIEW_TITLE.length +
-    OVERVIEW_HINT.length +
-    fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
-
-  // One line per command with its description; names only when that is too long for one embed.
-  let fields = fieldsWith(true);
-  if (size(fields) > EMBED_LIMIT) fields = fieldsWith(false);
-  while (size(fields) > EMBED_LIMIT) fields.pop();
-
-  return new EmbedBuilder()
-    .setTitle(OVERVIEW_TITLE)
-    .setDescription(OVERVIEW_HINT)
-    .addFields(fields);
+const OVERVIEW_HEAD =
+  '### Professor Pine commands\n' +
+  'Pick a group to see what its commands do, or use `/help command:<name>`.';
+
+/**
+ * The overview: every group the member sees with its commands' names (a command's other forms
+ * beside it), and a menu that opens a group. The groups get what is left of `TEXT_BUDGET` by
+ * need (`roomsByNeed`: the small ones whole, the others sharing the rest); a group whose names
+ * do not fit says how many it left out, never cutting a name.
+ */
+export function renderHelpOverview(groups: readonly HelpGroup[]): V2Message {
+  const parts: APIComponentInContainer[] = [textDisplay(OVERVIEW_HEAD)];
+  if (groups.length > 0) {
+    parts.push(separator());
+    const texts = groups.map((group) => ({
+      heading: `**${group.label}**\n`,
+      names: group.entries.map(namesOf),
+    }));
+    const rooms = roomsByNeed(
+      texts.map((text) => text.heading.length + text.names.join(' · ').length),
+      TEXT_BUDGET - OVERVIEW_HEAD.length,
+    );
+    for (const [i, text] of texts.entries()) {
+      const room = (rooms[i] ?? 0) - text.heading.length;
+      parts.push(textDisplay(text.heading + fitItems(text.names, room, ' · ')));
+    }
+    const id = helpId(HELP_PAGES.overview, HELP_CONTROLS.group);
+    if (id !== undefined) {
+      parts.push(
+        separator(),
+        menuRow(
+          select(
+            id,
+            'Show a group…',
+            groups
+              .slice(0, MAX_OPTIONS)
+              .map((group) =>
+                option(group.label, group.category, count(group.entries.length, 'command')),
+              ),
+          ),
+        ),
+      );
+    }
+  }
+  return { v2: true, components: [container(HELP_COLOUR, parts)] };
+}
+
+/**
+ * A group of commands: its label and how many, a line per command (its names and what it does;
+ * "…and N more" when they do not fit), a menu of its commands (a second for those past 25) and
+ * "◀ All groups".
+ */
+export function renderGroupHelp(group: HelpGroup): V2Message {
+  const head = `### ${group.label}\n${count(group.entries.length, 'command')}`;
+  const lines = group.entries.map(
+    (entry) => `${namesOf(entry)} ${entry.command.data.toJSON().description}`,
+  );
+  const parts: APIComponentInContainer[] = [textDisplay(head), separator()];
+  if (lines.length > 0) parts.push(textDisplay(fitLines(lines, TEXT_BUDGET - head.length)));
+  const menus = [
+    { control: HELP_CONTROLS.command, entries: group.entries.slice(0, MAX_OPTIONS) },
+    {
+      control: HELP_CONTROLS.more,
+      entries: group.entries.slice(MAX_OPTIONS, 2 * MAX_OPTIONS),
+    },
+  ].filter((menu) => menu.entries.length > 0);
+  const rows: APIComponentInContainer[] = [];
+  for (const [index, menu] of menus.entries()) {
+    const id = helpId(HELP_PAGES.group, group.category, menu.control);
+    if (id === undefined) continue;
+    rows.push(
+      menuRow(
+        select(
+          id,
+          index === 0 ? 'Details of a command…' : 'Details of a command (more)…',
+          menu.entries.map((entry) =>
+            option(
+              `/${entry.command.data.name}`,
+              entry.command.data.name,
+              entry.command.data.toJSON().description,
+            ),
+          ),
+        ),
+      ),
+    );
+  }
+  const back = helpId(HELP_PAGES.group, group.category, HELP_CONTROLS.overview);
+  if (back !== undefined) rows.push(actionRow([button(back, '◀ All groups')]));
+  if (rows.length > 0) parts.push(separator(), ...rows);
+  return { v2: true, components: [container(HELP_COLOUR, parts)] };
 }
 
 type Option = APIApplicationCommandOption;
@@ -128,33 +305,78 @@ function usageLines(path: string, options: readonly Option[], description?: stri
   return nested.flatMap((o) => usageLines(`${path} ${o.name}`, childrenOf(o), o.description));
 }
 
-function helpEmbed(
+/**
+ * What a page of one command may take of the text for its usage and its examples, at most; what
+ * it does has the rest.
+ */
+const USAGE_ROOM = 1_400;
+const EXAMPLES_ROOM = 700;
+
+/** Where a command's page leads besides "All groups". */
+interface HelpPageControls {
+  /** The page's path: `raid`, `admin boss`, `route add`. */
+  path: string;
+  /** The label of "◀": a group's label, or `/admin`. */
+  back: string;
+  /** The command's groups of subcommands, for their menu. */
+  subgroups?: readonly { name: string; description: string }[];
+}
+
+function helpPage(
   title: string,
   description: string,
   help: Pick<CommandHelp, 'details' | 'examples'> | undefined,
   usage: readonly string[],
   settings: Settings,
-): EmbedBuilder {
+  controls: HelpPageControls,
+): V2Message {
   const details = typeof help?.details === 'function' ? help.details(settings) : help?.details;
-  const embed = new EmbedBuilder()
-    .setTitle(title)
-    .setDescription(
-      truncate([description, details].filter(Boolean).join('\n\n'), DESCRIPTION_LIMIT),
-    )
-    .addFields({ name: 'Usage', value: fitLines(usage, FIELD_LIMIT) });
-  if (help?.examples?.length) {
-    const examples = help.examples.map((e) => `\`${e}\``);
-    embed.addFields({ name: 'Examples', value: fitLines(examples, FIELD_LIMIT) });
+  const usageText = `**Usage**\n${fitLines(usage, USAGE_ROOM)}`;
+  const examples = help?.examples?.length
+    ? `**Examples**\n${fitLines(
+        help.examples.map((example) => `\`${example}\``),
+        EXAMPLES_ROOM,
+      )}`
+    : undefined;
+  const howTo = examples === undefined ? usageText : `${usageText}\n${examples}`;
+  const about = cutText(
+    [`### ${title}`, [description, details].filter(Boolean).join('\n\n')].join('\n'),
+    TEXT_BUDGET - howTo.length,
+  );
+  const parts: APIComponentInContainer[] = [textDisplay(about), separator(), textDisplay(howTo)];
+  const rows: APIComponentInContainer[] = [];
+  const subgroups = controls.subgroups ?? [];
+  const menu = helpId(HELP_PAGES.command, controls.path, HELP_CONTROLS.subgroup);
+  if (subgroups.length > 0 && menu !== undefined) {
+    rows.push(
+      menuRow(
+        select(
+          menu,
+          'Subcommands of a group…',
+          subgroups
+            .slice(0, MAX_OPTIONS)
+            .map((group) =>
+              option(`/${controls.path} ${group.name}`, group.name, group.description),
+            ),
+        ),
+      ),
+    );
+  }
+  const back = helpId(HELP_PAGES.command, controls.path, HELP_CONTROLS.back);
+  const all = helpId(HELP_PAGES.command, controls.path, HELP_CONTROLS.overview);
+  if (back !== undefined && all !== undefined) {
+    rows.push(actionRow([button(back, `◀ ${controls.back}`), button(all, 'All groups')]));
   }
-  return embed;
+  if (rows.length > 0) parts.push(separator(), ...rows);
+  return { v2: true, components: [container(HELP_COLOUR, parts)] };
 }
 
 /**
- * Help for a command: a usage line per subcommand, and one per group of subcommands (`/admin
- * boss …` with what the group is for), so that a command with many stays readable; its
- * description then says how to see a group's subcommands.
+ * Help for a command: what it does, a usage line per subcommand, and one per group of
+ * subcommands (`/admin boss …` with what the group is for), with a menu of those groups; its
+ * examples; "◀" to its group of commands and "All groups".
  */
-export function renderCommandHelp(command: CommandModule, settings: Settings): EmbedBuilder {
+export function renderCommandHelp(command: CommandModule, settings: Settings): V2Message {
   const json = command.data.toJSON();
   const options = json.options ?? [];
   const groups = options.filter(
@@ -167,39 +389,48 @@ export function renderCommandHelp(command: CommandModule, settings: Settings): E
   );
   const [first] = groups;
   const hint = first
-    ? `Use \`/help command:${json.name} ${first.name}\` for the subcommands of a group.`
+    ? `Pick a group below, or use \`/help command:${json.name} ${first.name}\`, for the ` +
+      'subcommands of a group.'
     : undefined;
-  return helpEmbed(
+  return helpPage(
     `/${json.name}`,
     [json.description, hint].filter(Boolean).join('\n\n'),
     command.help,
     options.some(isNested) ? usage : usageLines(json.name, options),
     settings,
+    {
+      path: json.name,
+      back: CATEGORY_LABELS[command.help.category],
+      subgroups: groups.map((group) => ({ name: group.name, description: group.description })),
+    },
   );
 }
 
 /**
  * Help for one subcommand (`create`, `boss add`), or for a group of subcommands (`boss`: each
- * of its subcommands with what it does); undefined when the command has none such.
+ * of its subcommands with what it does), with "◀" to the command; undefined when the command has
+ * none such.
  */
 export function renderSubcommandHelp(
   command: CommandModule,
   path: string,
   settings: Settings,
-): EmbedBuilder | undefined {
+): V2Message | undefined {
   const json = command.data.toJSON();
+  const name = `${json.name} ${path}`;
+  const controls = { path: name, back: `/${json.name}` };
   const group = (json.options ?? []).find(
     (option) =>
       option.type === ApplicationCommandOptionType.SubcommandGroup && option.name === path,
   );
   if (group) {
-    const name = `${json.name} ${path}`;
-    return helpEmbed(
+    return helpPage(
       `/${name}`,
       group.description,
       undefined,
       usageLines(name, childrenOf(group)),
       settings,
+      controls,
     );
   }
   for (const option of (json.options ?? []).filter(isNested)) {
@@ -207,15 +438,16 @@ export function renderSubcommandHelp(
       option.type === ApplicationCommandOptionType.SubcommandGroup
         ? childrenOf(option).map((sub) => ({ sub, group: option.name }))
         : [{ sub: option, group: null }];
-    for (const { sub, group } of candidates) {
-      if (subcommandPath(group, sub.name) !== path) continue;
-      const name = `${json.name} ${path}`;
-      return helpEmbed(
+    for (const { sub, group: parent } of candidates) {
+      if (subcommandPath(parent, sub.name) !== path) continue;
+      return helpPage(
         `/${name}`,
         sub.description,
         command.subcommands?.get(path)?.help,
         [usageLine(name, childrenOf(sub))],
         settings,
+        // A subcommand of a group leads back to its group: `/admin boss add` to `/admin boss`.
+        parent === null ? controls : { path: name, back: `/${json.name} ${parent}` },
       );
     }
   }
diff --git a/src/commands/util/help.test.ts b/src/commands/util/help.test.ts
index abf99606828f7c23e501121f3ed31bffd61b2698..5d8d671c7c62937c446c956703ceaa55c396a5ad 100644
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -7,16 +7,23 @@ import {
 } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
+  asV2,
   fakeAutocomplete,
+  fakeButton,
   fakeChatInput,
+  fakeSelect,
   sent,
   type FakeOptions,
 } from '../../../test/support/fake-interactions.js';
+import { buttonsOf, selectsOf, textDisplays } from '../../../test/support/messages.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { commandGroup } from '../../discord/command-group.js';
 import { alsoAs, type CommandModule, type SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { help } from './help.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
+import { help, helpControls } from './help.js';
 
 const noop = () => Promise.resolve();
 const sub = (name: string) =>
@@ -50,10 +57,12 @@ const { ctx } = createTestContext({ commands: [help, route, gym] });
 /** A bot that has a command with another name. */
 const named = createTestContext({ commands: [help, maybe, hmm] }).ctx;
 
-const ask = async (o: FakeOptions = {}, context = ctx) => {
+const ask = async (o: FakeOptions = {}, context = ctx): Promise<V2Message> => {
   const i = fakeChatInput({ commandName: 'help', ...o });
   await help.execute(i as unknown as ChatInputCommandInteraction, context);
-  return sent(i.reply);
+  const payload = sent(i.reply);
+  expect(payload.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+  return asV2(payload);
 };
 const choices = async (focused: string, o: FakeOptions = {}, context = ctx) => {
   const i = fakeAutocomplete({ commandName: 'help', focused, ...o });
@@ -62,23 +71,26 @@ const choices = async (focused: string, o: FakeOptions = {}, context = ctx) => {
 };
 const MODERATOR = { roleNames: ['moderator'] };
 
+/** The bold headings of the groups an overview lists. */
+const groupsOf = (message: V2Message): string[] =>
+  textDisplays(message)
+    .slice(1)
+    .map((text) => /^\*\*(.+?)\*\*/.exec(text)?.[1] ?? '');
+/** The title of a help page. */
+const titleOf = (message: V2Message | undefined): string | undefined =>
+  textDisplays(message)[0]?.split('\n')[0];
+
 describe('/help: a command with another name', () => {
-  it('lists the other name on the line of the command, not on a line of its own', async () => {
-    const payload = await ask({}, named);
-    const utility = payload.embeds?.[0]
-      ?.toJSON()
-      .fields?.find((field) => field.name === 'Utility')
-      ?.value.split('\n');
-    expect(utility).toContain('`/interested` `/hmm` Say you are interested');
-    expect(utility?.some((line) => line.startsWith('`/hmm`'))).toBe(false);
+  it('lists the other name beside the command, not on its own', async () => {
+    const message = await ask({}, named);
+    expect(textDisplays(message)).toContain('**Utility**\n`/help` · `/interested` `/hmm`');
   });
 
   it('explains the other name as the command, and says whose name it is', async () => {
-    const payload = await ask({ options: { command: 'hmm' } }, named);
-    const json = payload.embeds?.[0]?.toJSON();
-    expect(json?.title).toBe('/hmm');
-    expect(json?.description).toBe(
-      'Say you are interested\n\n`/hmm` is another name for `/interested`. Marks you as interested.',
+    const message = await ask({ options: { command: 'hmm' } }, named);
+    expect(textDisplays(message)[0]).toBe(
+      '### /hmm\nSay you are interested\n\n`/hmm` is another name for `/interested`. Marks ' +
+        'you as interested.',
     );
   });
 
@@ -89,31 +101,22 @@ describe('/help: a command with another name', () => {
 });
 
 describe('/help', () => {
-  it('replies ephemerally with the overview', async () => {
-    const payload = await ask();
-    expect(payload.flags).toBe(MessageFlags.Ephemeral);
-    expect(payload.embeds?.[0]?.toJSON().fields?.map((f) => f.name)).toEqual(['Trains', 'Utility']);
+  it('answers privately with the overview', async () => {
+    expect(groupsOf(await ask())).toEqual(['Trains', 'Utility']);
   });
 
-  it('shows staff the staff categories too', async () => {
-    const payload = await ask(MODERATOR);
-    expect(payload.embeds?.[0]?.toJSON().fields?.map((f) => f.name)).toEqual([
-      'Trains',
-      'Utility',
-      'Administration',
-    ]);
+  it('shows staff the staff groups too', async () => {
+    expect(groupsOf(await ask(MODERATOR))).toEqual(['Trains', 'Utility', 'Administration']);
   });
 
   it('explains one command, however its name was typed', async () => {
     for (const command of ['help', '/help', ' /Help ', '/ help']) {
-      const payload = await ask({ options: { command } });
-      expect(payload.embeds?.[0]?.toJSON().title).toBe('/help');
+      expect(titleOf(await ask({ options: { command } }))).toBe('### /help');
     }
   });
 
   it('explains one subcommand', async () => {
-    const payload = await ask({ options: { command: '/Route  Add' } });
-    expect(payload.embeds?.[0]?.toJSON().title).toBe('/route add');
+    expect(titleOf(await ask({ options: { command: '/Route  Add' } }))).toBe('### /route add');
   });
 
   it('rejects an unknown command or subcommand, naming what was asked', async () => {
@@ -130,19 +133,21 @@ describe('/help', () => {
     await expect(ask({ options: { command: 'gym create' } })).rejects.toThrow(
       'There is no /gym create command.',
     );
-    const payload = await ask({ options: { command: 'gym create' }, ...MODERATOR });
-    expect(payload.embeds?.[0]?.toJSON().title).toBe('/gym create');
+    expect(titleOf(await ask({ options: { command: 'gym create' }, ...MODERATOR }))).toBe(
+      '### /gym create',
+    );
   });
 
   it('explains a group of subcommands to staff, and to members as if it did not exist', async () => {
     await expect(ask({ options: { command: 'gym meta' } })).rejects.toThrow(
       'There is no /gym meta command.',
     );
-    const payload = await ask({ options: { command: '/Gym Meta' }, ...MODERATOR });
-    expect(payload.embeds?.[0]?.toJSON()).toMatchObject({
-      title: '/gym meta',
-      fields: [{ name: 'Usage', value: '`/gym meta show` About show' }],
-    });
+    const message = await ask({ options: { command: '/Gym Meta' }, ...MODERATOR });
+    expect(textDisplays(message)).toEqual([
+      '### /gym meta\nThe details of a gym',
+      '**Usage**\n`/gym meta show` About show',
+    ]);
+    expect(buttonsOf(message).map((button) => button.label)).toEqual(['◀ /gym', 'All groups']);
   });
 
   it('autocompletes command and subcommand names, those that start with the text first', async () => {
@@ -164,10 +169,9 @@ describe('/help', () => {
   });
 
   it('works in a DM, where nobody but the owner is staff', async () => {
-    const payload = await ask({ isDm: true });
-    expect(payload.embeds?.[0]?.toJSON().fields?.map((f) => f.name)).toEqual(['Trains', 'Utility']);
+    expect(groupsOf(await ask({ isDm: true }))).toEqual(['Trains', 'Utility']);
     const owner = await ask({ isDm: true, userId: ctx.config.env.OWNER_ID });
-    expect(owner.embeds?.[0]?.toJSON().fields).toHaveLength(3);
+    expect(groupsOf(owner)).toHaveLength(3);
   });
 
   it('limits the command option to 100 characters, so an error text stays short', () => {
@@ -186,3 +190,82 @@ describe('/help', () => {
     expect(i.respond.mock.calls[0]?.[0]).toHaveLength(25);
   });
 });
+
+describe('/help: the controls of a page', () => {
+  const router = new InteractionRouter(ctx, [help], [helpControls]);
+  const pick = async (customId: string, value: string, o: FakeOptions = {}) => {
+    const i = fakeSelect({ customId, values: [value], ephemeralMessage: true, ...o });
+    await router.handle(i as never);
+    return i;
+  };
+  const press = async (customId: string, o: FakeOptions = {}) => {
+    const i = fakeButton({ customId, ephemeralMessage: true, ...o });
+    await router.handle(i as never);
+    return i;
+  };
+  const shown = (i: Awaited<ReturnType<typeof press>>): V2Message => asV2(sent(i.update));
+
+  it('lead from the overview to a group, a command and back, in the same message', async () => {
+    const overview = await ask(MODERATOR);
+    expect(selectsOf(overview)[0]?.options.map((option) => option.value)).toEqual([
+      'train',
+      'util',
+      'admin',
+    ]);
+    const group = shown(await pick('help:overview:group', 'train'));
+    expect(textDisplays(group)[0]).toBe('### Trains\n1 command');
+    expect(selectsOf(group)[0]?.customId).toBe('help:group:train:command');
+    const command = shown(await pick('help:group:train:command', 'route'));
+    expect(titleOf(command)).toBe('### /route');
+    expect(buttonsOf(command).map((button) => button.label)).toEqual(['◀ Trains', 'All groups']);
+    expect(titleOf(shown(await press('help:command:route:back')))).toBe('### Trains');
+    expect(groupsOf(shown(await press('help:command:route:overview')))).toEqual([
+      'Trains',
+      'Utility',
+    ]);
+    expect(groupsOf(shown(await press('help:group:train:overview', MODERATOR)))).toEqual([
+      'Trains',
+      'Utility',
+      'Administration',
+    ]);
+  });
+
+  it('open a group of subcommands from its command, and lead back to the command', async () => {
+    const command = await ask({ options: { command: 'gym' }, ...MODERATOR });
+    expect(selectsOf(command)[0]?.customId).toBe('help:command:gym:subgroup');
+    const meta = shown(await pick('help:command:gym:subgroup', 'meta', MODERATOR));
+    expect(titleOf(meta)).toBe('### /gym meta');
+    expect(buttonsOf(meta)[0]?.customId).toBe('help:command:gym meta:back');
+    expect(titleOf(shown(await press('help:command:gym meta:back', MODERATOR)))).toBe('### /gym');
+  });
+
+  it('ask anew who is staff, and answer a staff page as one that does not exist', async () => {
+    const group = await pick('help:overview:group', 'admin');
+    expect(sent(group.reply)).toEqual({
+      content: 'There is no such group of commands.',
+      flags: MessageFlags.Ephemeral,
+    });
+    const command = await pick('help:group:admin:command', 'gym');
+    expect(sent(command.reply).content).toBe('There is no /gym command.');
+    const back = await press('help:command:gym meta:back');
+    expect(sent(back.reply).content).toBe('There is no /gym command.');
+    expect(group.update).not.toHaveBeenCalled();
+  });
+
+  it('lead from a subcommand of a group back to the group, and from the second menu too', async () => {
+    const back = shown(await press('help:command:gym meta show:back', MODERATOR));
+    expect(titleOf(back)).toBe('### /gym meta');
+    expect(buttonsOf(back)[0]?.label).toBe('◀ /gym');
+    expect(titleOf(shown(await pick('help:group:train:more', 'route')))).toBe('### /route');
+  });
+
+  it('are throttled as a reading command is', () => {
+    expect(helpControls.throttle).toEqual(MEMBER_READ_THROTTLE);
+  });
+
+  it('work in a DM, and say so of a control they do not know', async () => {
+    const dm = await pick('help:overview:group', 'util', { isDm: true, guildId: null });
+    expect(titleOf(shown(dm))).toBe('### Utility');
+    expect(sent((await press('help:command:route:sideways')).reply).content).toBe(STALE_COMPONENT);
+  });
+});
diff --git a/src/commands/util/help.ts b/src/commands/util/help.ts
index b8c9cd64105660680dd03a54353c027d32905911..6d3d8830677dcbd46d412191f7668cf87d69bd69 100644
--- a/src/commands/util/help.ts
+++ b/src/commands/util/help.ts
@@ -8,15 +8,26 @@ import type { AppContext } from '../../app-context.js';
 import {
   declaredSubcommands,
   type CommandModule,
+  type ComponentHandler,
   type SimpleCommand,
 } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { isBotManagement, memberRoleNames } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
 import {
+  HELP_CONTROLS,
+  HELP_KIND,
+  HELP_PAGES,
+  helpGroupsOf,
   isStaffCommand,
   renderCommandHelp,
+  renderGroupHelp,
   renderHelpOverview,
   renderSubcommandHelp,
+  type HelpGroup,
 } from './help-render.js';
 
 const MAX_CHOICES = 25;
@@ -43,6 +54,38 @@ function visibleCommands(staff: boolean, ctx: AppContext): readonly CommandModul
     : ctx.commands.filter((c) => !isStaffCommand(c, ctx.config.settings.helpGroups));
 }
 
+/** What a member is told of a command they cannot see or that does not exist. */
+const noCommand = (asked: string): UserError => new UserError(`There is no /${asked} command.`);
+
+/**
+ * The page of a command, a subcommand or a group of subcommands (`raid`, `route add`, `admin
+ * boss`) as the member who asks may see it; a staff command is answered to anybody else exactly
+ * as one that does not exist.
+ */
+function commandPage(path: string, staff: boolean, ctx: AppContext): V2Message {
+  const [name = '', ...rest] = path.split(' ');
+  const command = visibleCommands(staff, ctx).find((c) => c.data.name === name);
+  const page =
+    command &&
+    (rest.length === 0
+      ? renderCommandHelp(command, ctx.config.settings)
+      : renderSubcommandHelp(command, rest.join(' '), ctx.config.settings));
+  if (!page) throw noCommand(path);
+  return page;
+}
+
+/** The groups of commands the member sees. */
+function groupsFor(staff: boolean, ctx: AppContext): HelpGroup[] {
+  return helpGroupsOf(visibleCommands(staff, ctx), ctx.config.settings.helpGroups, staff);
+}
+
+/** The page of one group of commands, if the member sees it. */
+function groupPage(category: string, staff: boolean, ctx: AppContext): V2Message {
+  const group = groupsFor(staff, ctx).find((each) => each.category === category);
+  if (!group) throw new UserError('There is no such group of commands.');
+  return renderGroupHelp(group);
+}
+
 export const help: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('help')
@@ -57,7 +100,9 @@ export const help: SimpleCommand = {
     ),
   help: {
     category: 'util',
-    details: 'Without a command, lists the commands you can use. With one, explains it.',
+    details:
+      'Without a command, lists the groups of commands you can use: pick one to see what its ' +
+      'commands do, and a command to see how it is used. With a command, explains it.',
     examples: [
       '/help',
       '/help command:raid',
@@ -68,25 +113,13 @@ export const help: SimpleCommand = {
 
   async execute(interaction, ctx) {
     const staff = isStaff(interaction, ctx);
-    const visible = visibleCommands(staff, ctx);
     const asked = normalise(interaction.options.getString('command') ?? '');
-    if (asked === '') {
-      await interaction.reply({
-        embeds: [renderHelpOverview(visible, ctx.config.settings.helpGroups, staff)],
-        flags: MessageFlags.Ephemeral,
-      });
-      return;
-    }
-    const [name = '', ...rest] = asked.split(' ');
-    const command = visible.find((c) => c.data.name === name);
-    const embed =
-      command &&
-      (rest.length === 0
-        ? renderCommandHelp(command, ctx.config.settings)
-        : renderSubcommandHelp(command, rest.join(' '), ctx.config.settings));
-    // A staff command is reported to other members exactly as one that does not exist.
-    if (!embed) throw new UserError(`There is no /${asked} command.`);
-    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
+    const page =
+      asked === '' ? renderHelpOverview(groupsFor(staff, ctx)) : commandPage(asked, staff, ctx);
+    await interaction.reply({
+      ...v2Answer(page),
+      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+    });
   },
 
   async autocomplete(interaction, ctx) {
@@ -112,3 +145,56 @@ export const help: SimpleCommand = {
     await interaction.respond(choices.map((n) => ({ name: `/${n}`, value: n })));
   },
 };
+
+/**
+ * The controls of a help page (custom ids in `help-render.ts`, `HELP_PAGES`): every press shows
+ * another page in the place of the one it was on (`update`; a help page is the member's alone).
+ * Who is staff is asked anew with every press, so a staff page reached otherwise is answered as
+ * one that does not exist.
+ */
+export const helpControls: ComponentHandler = {
+  kind: HELP_KIND,
+  throttle: MEMBER_READ_THROTTLE,
+  async button(interaction, id, ctx) {
+    const staff = isStaff(interaction, ctx);
+    const [control] = id.args;
+    let page: V2Message;
+    if (control === HELP_CONTROLS.overview) {
+      page = renderHelpOverview(groupsFor(staff, ctx));
+    } else if (id.id === HELP_PAGES.command && control === HELP_CONTROLS.back) {
+      const words = id.action.split(' ');
+      const [name = ''] = words;
+      if (words.length > 1) {
+        // One level up: `/admin boss add` to `/admin boss`, `/route add` to `/route`.
+        page = commandPage(words.slice(0, -1).join(' '), staff, ctx);
+      } else {
+        const command = visibleCommands(staff, ctx).find((c) => c.data.name === name);
+        if (!command) throw noCommand(name);
+        page = groupPage(command.help.category, staff, ctx);
+      }
+    } else {
+      throw new UserError(STALE_COMPONENT);
+    }
+    await interaction.update(v2Answer(page));
+  },
+  async select(interaction, id, ctx) {
+    const staff = isStaff(interaction, ctx);
+    const [value] = interaction.values;
+    const [control] = id.args;
+    if (value === undefined) throw new UserError(STALE_COMPONENT);
+    let page: V2Message;
+    if (id.id === HELP_PAGES.overview && id.action === HELP_CONTROLS.group) {
+      page = groupPage(value, staff, ctx);
+    } else if (
+      id.id === HELP_PAGES.group &&
+      (control === HELP_CONTROLS.command || control === HELP_CONTROLS.more)
+    ) {
+      page = commandPage(value, staff, ctx);
+    } else if (id.id === HELP_PAGES.command && control === HELP_CONTROLS.subgroup) {
+      page = commandPage(`${id.action} ${value}`, staff, ctx);
+    } else {
+      throw new UserError(STALE_COMPONENT);
+    }
+    await interaction.update(v2Answer(page));
+  },
+};
diff --git a/src/components/index.ts b/src/components/index.ts
index 82b1229fb0d3ff7118e8cfdae1163bc12e69e622..5b8f1f2832d42c45db50b9150cfdf71c7e5a69f1 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -10,6 +10,7 @@ import { wantControls, wantListControls } from '../commands/notifications/wants.
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import { roleControls } from '../commands/roles/menus.js';
+import { helpControls } from '../commands/util/help.js';
 import { rankControls } from '../commands/util/rank.js';
 import { screenshotControls } from '../commands/screenshots/feedback.js';
 import type { ComponentHandler } from '../discord/command.js';
@@ -33,4 +34,5 @@ export const components: readonly ComponentHandler[] = [
   regionControls,
   screenshotControls,
   rankControls,
+  helpControls,
 ];
diff --git a/src/render/v2.ts b/src/render/v2.ts
index 6cc567ec4e6c7404d5ca1c5a284e209ecff1a857..f5f6b1e9ed2aa18458a388a4bc14f1750b06cb09 100644
--- a/src/render/v2.ts
+++ b/src/render/v2.ts
@@ -4,6 +4,7 @@ import {
   SeparatorSpacingSize,
   type APIActionRowComponent,
   type APIButtonComponent,
+  type APIStringSelectComponent,
   type APIButtonComponentWithURL,
   type APIComponentInContainer,
   type APIContainerComponent,
@@ -43,6 +44,13 @@ export function actionRow(
   return { type: ComponentType.ActionRow, components: buttons };
 }
 
+/** A row that holds one select menu (a row holds a menu alone). */
+export function menuRow(
+  menu: APIStringSelectComponent,
+): APIActionRowComponent<APIStringSelectComponent> {
+  return { type: ComponentType.ActionRow, components: [menu] };
+}
+
 /**
  * A button that opens an address: a post, a message, a place in Google Maps, a page of another
  * site (without an emoji: Discord marks a link button with its own sign).
diff --git a/test/support/messages.ts b/test/support/messages.ts
index 5c9e44c84ccd419b5e06a16b08d0f86382a435eb..2a2f006a44fe91e3bb68e47f28f170eb4c6c4f71 100644
--- a/test/support/messages.ts
+++ b/test/support/messages.ts
@@ -4,6 +4,7 @@ import {
   type APIButtonComponent,
   type APIComponentInMessageActionRow,
   type APIMessageTopLevelComponent,
+  type APIStringSelectComponent,
 } from 'discord.js';
 import type {
   ClassicMessage,
@@ -99,6 +100,31 @@ export function buttonsOf(message: OutgoingMessage | undefined): ShownButton[] {
     }));
 }
 
+/** A string select menu as a test reads it. */
+export interface ShownSelect {
+  customId: string;
+  placeholder: string | undefined;
+  options: { label: string; value: string; description: string | undefined }[];
+}
+
+/** Every string select menu of a v2 message, in order. */
+export function selectsOf(message: OutgoingMessage | undefined): ShownSelect[] {
+  return allComponents(message)
+    .filter(
+      (component): component is APIStringSelectComponent =>
+        (component as { type?: unknown }).type === ComponentType.StringSelect,
+    )
+    .map((menu) => ({
+      customId: menu.custom_id,
+      placeholder: menu.placeholder,
+      options: menu.options.map((option) => ({
+        label: option.label,
+        value: option.value,
+        description: option.description,
+      })),
+    }));
+}
+
 /** The labels of every button of a message, in order. */
 export function buttonLabels(message: OutgoingMessage | undefined): (string | undefined)[] {
   return buttonsOf(message).map((button) => button.label);
````

### Task 4: The answer of counters as a components-v2 message

Prototype commit: `7e73fccb93997df6958a17849416e52539784e2f`

R1.1 and R1.2 of plan 8B-2. renderCounters gives one container in
Pokebattler's green:

1. `### Counters for <boss>`, `<raid words> · boss moves: <the average of
   all its movesets | Fast / Charged>` and `About **N trainers** with the
   best counters` (`your best counters` for a Pokebox; no line without an
   estimate), beside the boss's picture.
2. The counters (twelve), one entry each: `` `#01` **Zekrom** · 141s ·
   1.2 deaths · 2.8 trainers`` (a Pokebox's adds its nickname in quotes and
   `3,512 CP`), and under it in small print its moves, each with its type's
   emoji, the legacy mark kept. They share what is left of TEXT_BUDGET
   ("…and N more").
3. In small print what the simulation was for: `Attackers at level 40 · no
   weather · best friends · no shadow Pokemon or megas` (`Your Pokebox on
   Pokebattler`, `shadow Pokemon and megas listed` and the other two,
   `every moveset of a counter`, `† a legacy move`). No "(assumed)": the
   plan no longer keeps what was left out.
4. A row with "Change options…" (once its custom id is given: the next
   commit) and the `Full results` link.
5. `-# Data provided by Pokebattler`.

The member's Pokebattler user number is no longer in the text (the link
to the full results still has it, as Pokebattler's address needs it). The
command simulates through simulate() and renders through
countersMessage(), which the dialog will reuse; public in a post, private
elsewhere and for a Pokebox, and the post-gone path sends the V2 message
privately as before. The embed renderer is gone.

The emoji of the moves' types: a new ctx.emoji (EmojiFinder,
src/services/application-emoji.ts: the application's emoji first, then the
server's, as the posts find them; none of a server in a DM). The server is
the interaction's own guildId, read in the client's cache of servers
(DiscordApplicationEmoji.inServer), not through a channel the cache may
lack. The test context finds none.

The small print says what `†` means only when a counter that is shown has
a legacy move (one cut off by "…and N more" does not count); the counters
have the room the small print with that note would leave. movesetValue is
the one spelling of a boss moveset as a list's value.

Decisions:
- A move whose type has no emoji shows its type in words after it,
  `Bite (Dark)`; a move the game data does not know shows its name alone.
- The weather in the small print is `<name> weather` in lower case
  (`windy weather`, `no weather`), the friendship as named in lower case.
- The counters are one text display (at most what the budget leaves, under
  4,000), not one per counter: 12 displays would cost components and say
  nothing more.

**Files:**

```
 src/app-context.ts                     |   3 +
 src/app.ts                             |   3 +-
 src/commands/util/counters.test.ts     | 122 ++++++++++++++++++-------------
 src/commands/util/counters.ts          | 150 ++++++++++++++++++++++++--------------
 src/discord/application-emoji.ts       |  11 +++
 src/render/counters.test.ts            | 151 +++++++++++++++++++++++++++++++-------
 src/render/counters.ts                 | 208 +++++++++++++++++++++++++++++++++++++----------------
 src/services/application-emoji.test.ts |  16 ++++-
 src/services/application-emoji.ts      |  20 ++++++
 test/support/test-context.ts           |   2 +
 10 files changed, 494 insertions(+), 192 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/util/counters.test.ts src/render/counters.test.ts src/services/application-emoji.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 7e73fccb93997df6958a17849416e52539784e2f -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `The answer of counters as a components-v2 message`, the body above and the trailer, staging exactly
  `src/app-context.ts src/app.ts src/commands/util/counters.test.ts src/commands/util/counters.ts src/discord/application-emoji.ts src/render/counters.test.ts src/render/counters.ts src/services/application-emoji.test.ts src/services/application-emoji.ts test/support/test-context.ts`.

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 16e9d0e363869c900f38f7ba8bbc2b740531c68f..19b254a9ad8bb3246d3fca1b8f7fabc2628f3ee8 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -10,6 +10,7 @@ import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
 import type { MemberDirectory } from './discord/member-directory.js';
 import type { Logger } from './log.js';
+import type { EmojiFinder } from './services/application-emoji.js';
 import type { AttachmentGateway } from './services/attachment-gateway.js';
 import type { AttendanceService } from './services/attendance-service.js';
 import type { DmSender } from './services/dm-sender.js';
@@ -107,6 +108,8 @@ export interface AppContext {
   readonly screenshotReader: ScreenshotReader;
   /** Screenshots on Discord: read, decided on and kept, and what members say of them. */
   readonly screenshots: Screenshots;
+  /** Emoji by name: the application's, then a server's (`/counters` shows types). */
+  readonly emoji: EmojiFinder;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
diff --git a/src/app.ts b/src/app.ts
index bb7661ae4591a4094bdff97668bc3378776b007d..f2fa7ab3fcb5d6bab3687b417d22f591fcbbf458 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -62,7 +62,7 @@ import { OcrService } from './services/ocr-service.js';
 import { ScreenshotService } from './services/screenshot-service.js';
 import { ScreenshotStore } from './services/screenshot-store.js';
 import { PartyLines } from './services/party-lines.js';
-import { ApplicationEmoji } from './services/application-emoji.js';
+import { ApplicationEmoji, emojiFinder } from './services/application-emoji.js';
 import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
@@ -483,6 +483,7 @@ export async function startApp(
       store: screenshotStore,
       context: { raidBosses, raidEvents, gyms, regions, config },
     }),
+    emoji: emojiFinder(appEmoji, appEmojiSource),
     features: requested,
   };
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index 0975d35b8572965e3fe660967296a1473eb26ea6..b4b41eaccafb058759acc272d69e37a08ed3f1d9 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -1,17 +1,21 @@
-import { InteractionContextType, MessageFlags, type APIEmbed } from 'discord.js';
+import { InteractionContextType, MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
+  asV2,
   fakeAutocomplete,
   fakeChatInput,
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../../test/support/gyms.js';
+import { linksOf, textDisplays, textOf, thumbnailOf } from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { ALICE } from '../../../test/support/parties.js';
 import { createdTrain, reportedRaid } from '../../../test/support/party-service.js';
 import { FakePokebattler } from '../../../test/support/pokebattler.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { counters } from './counters.js';
 
@@ -41,11 +45,15 @@ function told(used: FakeInteraction): string | undefined {
   throw new Error('nothing was answered');
 }
 
-/** The embed of the answer. */
-function embedOf(used: FakeInteraction): APIEmbed {
-  const embed = (sent(used.editReply).embeds as APIEmbed[] | undefined)?.[0];
-  if (!embed) throw new Error('no embed was answered');
-  return embed;
+/** The answer, a components-v2 message. */
+const answerOf = (used: FakeInteraction): V2Message => asV2(sent(used.editReply));
+
+/** The parts of an answer: its head, its counters, what the simulation was for, its link. */
+function partsOf(used: FakeInteraction) {
+  const answer = answerOf(used);
+  const [head = '', rows = '', settings = ''] = textDisplays(answer);
+  const [link = ''] = linksOf(answer);
+  return { head, rows, settings, link };
 }
 
 describe('/counters: the command', () => {
@@ -101,30 +109,40 @@ describe('/counters: elsewhere than in a raid post', () => {
         friendship: '4',
       },
     ]);
-    const embed = embedOf(used);
-    expect(embed.title).toBe('Counters for Yveltal (T5)');
-    expect(embed.url).toBe(
-      'https://www.pokebattler.com/raids/defenders/YVELTAL/levels/RAID_LEVEL_5/attackers/' +
-        'levels/40/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?sort=TIME&' +
-        'weatherCondition=NO_WEATHER&dodgeStrategy=DODGE_REACTION_TIME&aggregation=AVERAGE&' +
-        'randomAssistants=-1&friendLevel=FRIENDSHIP_LEVEL_4',
-    );
-    expect(embed.description).toBe(
-      [
-        'About **3 trainers** with the best counters.',
-        'Attackers at Level 40 (assumed) · No weather (assumed) · Best friends (assumed)',
-        'Boss moves: the average of all its movesets',
-        '__Time to win | Deaths | Trainers__',
-        '`#01` **Tyranitar**: 120s | 5.0 | 2.7\n*Bite / Brutal Swing*',
-        '`#02` **Darkrai**: 122s | 5.0 | 2.7\n*Snarl / Shadow Ball †*',
-      ].join('\n'),
-    );
-    expect(embed.footer?.text).toBe(
-      'Click the title for the full results · † a legacy move · no shadow Pokémon ' +
-        '(shadow:True lists them) · no megas (mega:True lists them)',
+    const answer = answerOf(used);
+    expect(sent(used.editReply).flags).toBe(MessageFlags.IsComponentsV2);
+    expect(textDisplays(answer)).toEqual([
+      '### Counters for Yveltal\nLevel 5 raid · boss moves: the average of all its movesets\n' +
+        'About **3 trainers** with the best counters',
+      '`#01` **Tyranitar** · 120s · 5.0 deaths · 2.7 trainers\n' +
+        '-# Bite (Dark) / Brutal Swing (Dark)\n' +
+        '`#02` **Darkrai** · 122s · 5.0 deaths · 2.7 trainers\n' +
+        '-# Snarl (Dark) / Shadow Ball (Ghost) †',
+      '-# Attackers at level 40 · no weather · best friends · no shadow Pokémon or megas · ' +
+        '† a legacy move',
+      '-# Data provided by Pokebattler',
+    ]);
+    expect(linksOf(answer)).toEqual([
+      'Full results https://www.pokebattler.com/raids/defenders/YVELTAL/levels/RAID_LEVEL_5/' +
+        'attackers/levels/40/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?' +
+        'sort=TIME&weatherCondition=NO_WEATHER&dodgeStrategy=DODGE_REACTION_TIME&' +
+        'aggregation=AVERAGE&randomAssistants=-1&friendLevel=FRIENDSHIP_LEVEL_4',
+    ]);
+    expect(thumbnailOf(answer)).toBeDefined();
+    expectV2Sendable(answer);
+  });
+
+  it('shows the types of the moves as the emoji of the application or the server', async () => {
+    const made = setup({
+      emoji: { find: (name, guildId) => (guildId === null ? undefined : `<:${name}:1>`) },
+    });
+    expect(partsOf(await made.run({ boss: 'yveltal' })).rows).toContain(
+      '-# <:dark:1> Bite / <:dark:1> Brutal Swing',
     );
-    expect(embed.author?.name).toBe('Data provided by Pokebattler');
-    expect(embed.thumbnail?.url).toBeDefined();
+    // A DM has no server: only the application's would show.
+    expect(
+      partsOf(await made.run({ boss: 'yveltal' }, { isDm: true, guildId: null })).rows,
+    ).toContain('-# Bite (Dark) / Brutal Swing (Dark)');
   });
 
   it('takes the shadow tier a Pokémon is a boss of, and its shadow name', async () => {
@@ -158,13 +176,15 @@ describe('/counters: elsewhere than in a raid post', () => {
         friendship: '2',
       },
     ]);
-    const embed = embedOf(used);
-    expect(embed.url).toContain('/raids/defenders/LANDORUS/levels/RAID_LEVEL_5/');
-    expect(embed.description).toContain('Attackers at Level 50 · Windy · Great friends');
-    expect(embed.description).toContain('`#01` **Shadow Tyranitar**: 100s');
-    expect(embed.description).toContain('`#02` **Mega Gengar**: 110s');
-    expect(embed.description).toContain('`#05` **Tyranitar**: 125s');
-    expect(embed.footer?.text).toBe('Click the title for the full results · † a legacy move');
+    const { link, rows, settings } = partsOf(used);
+    expect(link).toContain('/raids/defenders/LANDORUS/levels/RAID_LEVEL_5/');
+    expect(settings).toBe(
+      '-# Attackers at level 50 · windy weather · great friends · shadow Pokémon and megas ' +
+        'listed · every moveset of a counter · † a legacy move',
+    );
+    expect(rows).toContain('`#01` **Shadow Tyranitar** · 100s');
+    expect(rows).toContain('`#02` **Mega Gengar** · 110s');
+    expect(rows).toContain('`#05` **Tyranitar** · 125s');
   });
 
   it('shows the counters against one moveset of the boss', async () => {
@@ -174,10 +194,10 @@ describe('/counters: elsewhere than in a raid post', () => {
       tier: 'T5',
       moveset: 'CONFUSION_FAST/PSYSTRIKE',
     });
-    const description = embedOf(used).description ?? '';
-    expect(description).toContain('Boss moves: Confusion / Psystrike');
-    expect(description).toContain('`#01` **Tyranitar**');
-    expect(description).not.toContain('Darkrai');
+    const { head, rows } = partsOf(used);
+    expect(head).toContain('Level 5 raid · boss moves: Confusion / Psystrike');
+    expect(rows).toContain('`#01` **Tyranitar**');
+    expect(rows).not.toContain('Darkrai');
   });
 
   it('reads a moveset typed by its moves, and says which Pokebattler has', async () => {
@@ -265,7 +285,7 @@ describe('/counters: elsewhere than in a raid post', () => {
   it('works in a DM', async () => {
     const made = setup();
     const used = await made.run({ boss: 'yveltal' }, { isDm: true, guildId: null });
-    expect(embedOf(used).title).toBe('Counters for Yveltal (T5)');
+    expect(partsOf(used).head).toMatch(/^### Counters for Yveltal\nLevel 5 raid · /);
   });
 });
 
@@ -279,7 +299,7 @@ describe('/counters: in the post of a raid', () => {
     const used = await made.run({}, { channelId: raid.postId, thread: { parentId: WEST_FORUM } });
     expect(used.deferReply).toHaveBeenCalledWith({});
     expect(made.pokebattler.asked[0]?.boss).toBe('YVELTAL');
-    expect(embedOf(used).title).toBe('Counters for Yveltal (T5)');
+    expect(partsOf(used).head).toMatch(/^### Counters for Yveltal\nLevel 5 raid · /);
   });
 
   it('answers a Pokébox privately, with the member’s saved id', async () => {
@@ -292,7 +312,11 @@ describe('/counters: in the post of a raid', () => {
     );
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(made.pokebattler.asked[0]?.attackers).toEqual({ kind: 'box', userId: 4242 });
-    expect(embedOf(used).description).toContain('The Pokébox of Pokebattler user 4242');
+    const { head, settings } = partsOf(used);
+    expect(head).toContain('with your best counters');
+    expect(settings).toMatch(/^-# Your Pokébox on Pokebattler · /);
+    // The text never shows the member's Pokebattler user number (the link to the results has it).
+    expect(textOf(answerOf(used))).not.toContain('4242');
   });
 
   it('refuses for an egg whose boss is not known yet', async () => {
@@ -388,8 +412,8 @@ describe('/counters: more in the posts of parties', () => {
     expect(used.editReply).not.toHaveBeenCalled();
     expect(used.deleteReply).toHaveBeenCalled();
     const answer = sent(used.followUp);
-    expect(answer.flags).toBe(MessageFlags.Ephemeral);
-    expect((answer.embeds as APIEmbed[] | undefined)?.[0]?.title).toBe('Counters for Yveltal (T5)');
+    expect(answer.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    expect(textDisplays(asV2(answer))[0]).toMatch(/^### Counters for Yveltal/);
   });
 
   it('simulates the boss of a train for everybody in its post, and refuses without one', async () => {
@@ -415,11 +439,11 @@ describe('/counters: more in the posts of parties', () => {
     const made = setup();
     await made.users.update(ALICE, { pokebattlerId: 4242 });
     const used = await made.run({ boss: 'yveltal', level: 'box' });
-    const description = embedOf(used).description ?? '';
-    expect(description).toContain('**Shadow Tyranitar**');
-    expect(description).toContain('**Mega Gengar**');
+    const { rows } = partsOf(used);
+    expect(rows).toContain('**Shadow Tyranitar**');
+    expect(rows).toContain('**Mega Gengar**');
     const without = await made.run({ boss: 'yveltal', level: 'box', shadow: false, mega: false });
-    expect(embedOf(without).description).not.toContain('Shadow Tyranitar');
+    expect(partsOf(without).rows).not.toContain('Shadow Tyranitar');
   });
 
   it('says so of a Pokébox with nothing that can fight', async () => {
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index 516d6847b3c925f158f5384eb57e250d7c4db9a2..19965ac3c5ca005152060cd5cf0c368193127eff 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -9,6 +9,8 @@ import type { AppContext } from '../../app-context.js';
 import type { Guard, LocatedInteraction, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { partyOf } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { counterRows, pokebattlerNames, titleCase } from '../../domain/counters/counters.js';
 import {
@@ -47,7 +49,7 @@ import {
   SHADOW_RAID_LEVELS,
   type RaidTier,
 } from '../../domain/pogo/raid-tier.js';
-import { renderCounters, type Assumed } from '../../render/counters.js';
+import { renderCounters } from '../../render/counters.js';
 import { plain, truncate } from '../../render/text.js';
 import type { CounterOutcome } from '../../services/pokebattler-gateway.js';
 import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
@@ -86,7 +88,6 @@ interface CounterPlan {
   attackers: CounterAttackers;
   weather: CounterWeather;
   friendship: Friendship;
-  assumed: Assumed;
   moveset: { fast: Move; charged: Move } | undefined;
   shadow: boolean;
   mega: boolean;
@@ -188,6 +189,10 @@ function bossMovesets(
   ];
 }
 
+/** `CONFUSION_FAST/PSYSTRIKE`: a boss moveset as a value of a list (the option's, the dialog's). */
+export const movesetValue = (moveset: { fast: Move; charged: Move }): string =>
+  `${moveset.fast.id}/${moveset.charged.id}`;
+
 const movesetName = (moveset: { fast: Move; charged: Move }): string =>
   `${moveset.fast.name} / ${moveset.charged.name}`;
 
@@ -200,9 +205,7 @@ function chosenMoveset(
   const text = value?.trim() ?? '';
   if (text === '' || text === AVERAGE_MOVESET) return undefined;
   // A value of the list: one of this boss's movesets, never another Pokémon's.
-  const listed = bossMovesets(catalogue, entry).find(
-    (moveset) => `${moveset.fast.id}/${moveset.charged.id}` === text,
-  );
+  const listed = bossMovesets(catalogue, entry).find((moveset) => movesetValue(moveset) === text);
   if (listed) return listed;
   const typed = parseMoveset(catalogue, entry, text);
   if (typed.fast && typed.charged && typed.unknown.length === 0) {
@@ -216,25 +219,23 @@ function chosenMoveset(
 
 /** Where the attackers come from: a level, or the member's Pokébox. */
 async function attackersOf(
-  interaction: ChatInputCommandInteraction,
+  level: string | null,
+  userId: string,
   ctx: AppContext,
-): Promise<{ attackers: CounterAttackers; assumed: boolean }> {
-  const level = interaction.options.getString('level');
-  if (level === null) {
-    return { attackers: { kind: 'level', level: DEFAULT_ATTACKER_LEVEL }, assumed: true };
-  }
+): Promise<CounterAttackers> {
+  if (level === null) return { kind: 'level', level: DEFAULT_ATTACKER_LEVEL };
   if (level === POKEBOX) {
-    const userId = (await ctx.users.get(interaction.user.id)).pokebattlerId;
-    if (userId === null) {
+    const boxId = (await ctx.users.get(userId)).pokebattlerId;
+    if (boxId === null) {
       throw new UserError(
         'You have no Pokebattler user id saved. Save it with `/settings pokebattler-id`, or ' +
           'pick a level.',
       );
     }
-    return { attackers: { kind: 'box', userId }, assumed: false };
+    return { kind: 'box', userId: boxId };
   }
   if (!isAttackerLevel(level)) throw new UserError('Pick the level from its list.');
-  return { attackers: { kind: 'level', level }, assumed: false };
+  return { kind: 'level', level };
 }
 
 async function readPlan(
@@ -265,7 +266,11 @@ async function readPlan(
   if (!isCounterWeather(weather) || !isFriendship(friendship)) {
     throw new UserError('Pick the weather and the friendship from their lists.');
   }
-  const { attackers, assumed } = await attackersOf(interaction, ctx);
+  const attackers = await attackersOf(
+    interaction.options.getString('level'),
+    interaction.user.id,
+    ctx,
+  );
   return {
     entry,
     tier,
@@ -274,11 +279,6 @@ async function readPlan(
     attackers,
     weather,
     friendship,
-    assumed: {
-      level: assumed,
-      weather: interaction.options.getString('weather') === null,
-      friendship: interaction.options.getString('friendship') === null,
-    },
     moveset,
     // A Pokébox is the member's own Pokémon: its shadows and megas are shown unless left out.
     shadow: interaction.options.getBoolean('shadow') ?? attackers.kind === 'box',
@@ -374,7 +374,7 @@ function movesetChoices(ctx: AppContext, entry: PokemonEntry | undefined, typed:
   const own = entry
     ? bossMovesets(ctx.gameData.catalogue, entry).map((moveset) => ({
         name: truncate(movesetName(moveset), CHOICE_NAME),
-        value: `${moveset.fast.id}/${moveset.charged.id}`,
+        value: movesetValue(moveset),
       }))
     : [];
   return [average, ...own].filter((choice) => fits(choice.name)).slice(0, MAX_CHOICES);
@@ -394,6 +394,75 @@ function bossWhileTyping(
   return ref && 'key' in ref ? ctx.gameData.catalogue.byKey(ref.key) : undefined;
 }
 
+/** The server whose emoji an answer may show, by the interaction's own id; none in a DM. */
+const serverOf = (interaction: LocatedInteraction): string | null =>
+  interaction.inGuild() ? interaction.guildId : null;
+
+/** What Pokebattler answered for a plan: the counters against the boss moveset asked for. */
+interface Simulated {
+  set: BossMovesetCounters;
+  /** The page of the full results on pokebattler.com. */
+  link: string;
+}
+
+/**
+ * Asks Pokebattler for a plan; a failure, or an answer without the boss moveset asked for, is
+ * refused with a sentence (`failureText`). The command and the dialog of an answer both run it.
+ */
+async function simulate(ctx: AppContext, plan: CounterPlan): Promise<Simulated> {
+  const outcome = await ctx.pokebattler.counters({
+    bosses: plan.bosses,
+    raidLevel: plan.raidLevel,
+    attackers: plan.attackers,
+    weather: plan.weather,
+    friendship: plan.friendship,
+  });
+  if (!outcome.ok) throw new UserError(failureText(outcome, plan));
+  return {
+    set: countersFor(outcome, plan, ctx.gameData.catalogue),
+    link: `${POKEBATTLER_SITE}${counterPath(outcome.query)}`,
+  };
+}
+
+/**
+ * The answer for a plan that Pokebattler simulated: the boss's picture, the counters with their
+ * moves' types as emoji where the server or the application has them, and
+ * "Change options…" with `optionsId` when there is one.
+ */
+function countersMessage(
+  ctx: AppContext,
+  plan: CounterPlan,
+  simulated: Simulated,
+  guildId: string | null,
+  optionsId?: string,
+): V2Message {
+  const catalogue = ctx.gameData.catalogue;
+  const feedImage = ctx.raidBosses
+    .bosses()
+    .find((boss) => boss.entry?.key === plan.entry.key)?.image;
+  return renderCounters({
+    bossName: plan.entry.name,
+    tier: plan.tier,
+    link: simulated.link,
+    picture: pokemonPicture(feedImage, plan.entry, ctx.gameData),
+    attackers: plan.attackers,
+    weather: plan.weather,
+    friendship: plan.friendship,
+    bossMoves: plan.moveset ? movesetName(plan.moveset) : undefined,
+    rows: counterRows(simulated.set, plan),
+    pokemonName: namesOf(catalogue),
+    move: (id) => {
+      const move = catalogue.move(id);
+      return { name: move?.name ?? titleCase(id), type: move?.type };
+    },
+    icon: (name) => ctx.emoji.find(name, guildId),
+    shadow: plan.shadow,
+    mega: plan.mega,
+    single: plan.single,
+    optionsId,
+  });
+}
+
 /**
  * `/counters` (spec row 199, the legacy `!counters`): the best counters against a raid boss, as
  * Pokebattler simulates the raid, with the trainers each takes. In the post of a raid the boss
@@ -500,35 +569,7 @@ export const counters: SimpleCommand = {
   async execute(interaction, ctx) {
     const party = bossParty(interaction, ctx);
     const plan = await readPlan(interaction, ctx);
-    const catalogue = ctx.gameData.catalogue;
-    const outcome = await ctx.pokebattler.counters({
-      bosses: plan.bosses,
-      raidLevel: plan.raidLevel,
-      attackers: plan.attackers,
-      weather: plan.weather,
-      friendship: plan.friendship,
-    });
-    if (!outcome.ok) throw new UserError(failureText(outcome, plan));
-    const set = countersFor(outcome, plan, catalogue);
-    const feedImage = ctx.raidBosses
-      .bosses()
-      .find((boss) => boss.entry?.key === plan.entry.key)?.image;
-    const embed = renderCounters({
-      bossName: plan.entry.name,
-      tierLabel: raidTierLabel(plan.tier),
-      link: `${POKEBATTLER_SITE}${counterPath(outcome.query)}`,
-      picture: pokemonPicture(feedImage, plan.entry, ctx.gameData),
-      attackers: plan.attackers,
-      weather: plan.weather,
-      friendship: plan.friendship,
-      assumed: plan.assumed,
-      bossMoves: plan.moveset ? movesetName(plan.moveset) : undefined,
-      rows: counterRows(set, plan),
-      pokemonName: namesOf(catalogue),
-      moveName: (id) => catalogue.move(id)?.name ?? titleCase(id),
-      shadow: plan.shadow,
-      mega: plan.mega,
-    });
+    const message = countersMessage(ctx, plan, await simulate(ctx, plan), serverOf(interaction));
     // The answer in a post is public; the party may have ended while Pokebattler was asked, and
     // anything sent or edited in its archived post would open it again: the answer is then the
     // member's alone, after the public "thinking…" is deleted (as the router does for an error).
@@ -536,10 +577,13 @@ export const counters: SimpleCommand = {
       interaction.ephemeral === false && (!party || ctx.parties.get(party.id) === undefined);
     if (postGone) {
       await interaction.deleteReply();
-      await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
+      await interaction.followUp({
+        ...v2Answer(message),
+        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+      });
       return;
     }
-    await interaction.editReply({ embeds: [embed] });
+    await interaction.editReply(v2Answer(message));
   },
   async autocomplete(interaction, ctx) {
     const focused = interaction.options.getFocused(true);
diff --git a/src/discord/application-emoji.ts b/src/discord/application-emoji.ts
index 879bede33708461184ab15516d93e1d380648ea1..8c7c0222b41a01bd292a1af422c2eb5dde1a379b 100644
--- a/src/discord/application-emoji.ts
+++ b/src/discord/application-emoji.ts
@@ -23,4 +23,15 @@ export class DiscordApplicationEmoji implements ApplicationEmojiSource {
     }
     return found;
   }
+
+  /**
+   * An emoji of a server by name, from the cache (the Guilds intent keeps it), by the server's
+   * id: an answer is not tied to a channel the cache may lack. Undefined where it has none.
+   */
+  inServer(guildId: string, name: string): string | undefined {
+    return this.client?.guilds.cache
+      .get(guildId)
+      ?.emojis.cache.find((emoji) => emoji.name === name)
+      ?.toString();
+  }
 }
diff --git a/src/render/counters.test.ts b/src/render/counters.test.ts
index 64f90c9d41083f2556c10fc8509871011c3eb981..54953acf419c8ca1d12ead428d73001ae615d0c3 100644
--- a/src/render/counters.test.ts
+++ b/src/render/counters.test.ts
@@ -1,7 +1,10 @@
+import { ButtonStyle } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { titleCase } from '../domain/counters/counters.js';
+import { accentOf, buttonsOf, textDisplays, thumbnailOf } from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import { titleCase, type CounterRow } from '../domain/counters/counters.js';
 import type { Counter } from '../domain/counters/pokebattler-answer.js';
-import { renderCounters, type CountersView } from './counters.js';
+import { COUNTERS_COLOUR, renderCounters, type CountersView } from './counters.js';
 
 const tyranitar = (nickname: string | null, cp: number, estimator: number | null): Counter => ({
   pokemonId: 'TYRANITAR',
@@ -20,55 +23,149 @@ const tyranitar = (nickname: string | null, cp: number, estimator: number | null
   ],
 });
 
+const rowOf = (counter: Counter): CounterRow => {
+  const [result] = counter.results;
+  if (!result) throw new Error('no result');
+  return { counter, result };
+};
+
 function view(overrides: Partial<CountersView> = {}): CountersView {
   return {
     bossName: 'Mewtwo',
-    tierLabel: 'T5',
+    tier: { level: 'T5', shadow: false },
     link: 'https://www.pokebattler.com/raids/x',
     picture: undefined,
-    attackers: { kind: 'box', userId: 77 },
+    attackers: { kind: 'box' },
     weather: 'FOG',
     friendship: '0',
-    assumed: { level: false, weather: false, friendship: false },
     bossMoves: undefined,
     rows: [],
     pokemonName: titleCase,
-    moveName: titleCase,
+    move: (id) => ({ name: titleCase(id), type: 'dark' }),
+    icon: () => undefined,
     shadow: true,
     mega: true,
+    single: false,
     ...overrides,
   };
 }
 
 describe('renderCounters', () => {
-  it('names a Pokémon of a Pokébox with its nickname and CP, plainly', () => {
+  it('names a Pokémon of a Pokébox with its nickname and CP, plainly, and never the user', () => {
     const counter = tyranitar('*Rocky* https://x.test', 3512, 1.01);
-    const embed = renderCounters(view({ rows: [{ counter, result: counter.results[0]! }] }));
-    expect(embed.description).toBe(
-      [
-        'About **2 trainers** with the best counters.',
-        'The Pokébox of Pokebattler user 77 · Fog · Not friends',
-        'Boss moves: the average of all its movesets',
-        '__Time to win | Deaths | Trainers__',
-        '`#01` **Tyranitar** "\\*Rocky\\* https:\u200b//x.test" 3512 CP: 150s | 3.0 | 1.1\n' +
-          '*Bite / Brutal Swing / Crunch*',
-      ].join('\n'),
+    const message = renderCounters(view({ rows: [rowOf(counter)] }));
+    expect(textDisplays(message)).toEqual([
+      '### Counters for Mewtwo\nLevel 5 raid · boss moves: the average of all its movesets\n' +
+        'About **2 trainers** with your best counters',
+      '`#01` **Tyranitar** "\\*Rocky\\* https:​//x.test" · 3,512 CP · 150s · 3.0 deaths · ' +
+        '1.1 trainers\n-# Bite (Dark) / Brutal Swing (Dark) / Crunch (Dark)',
+      '-# Your Pokébox on Pokebattler · fog weather · not friends · shadow Pokémon and megas ' +
+        'listed',
+      '-# Data provided by Pokebattler',
+    ]);
+    expect(accentOf(message)).toBe(COUNTERS_COLOUR);
+    expect(thumbnailOf(message)).toBeUndefined();
+    expect(buttonsOf(message).map((button) => [button.label, button.style, button.url])).toEqual([
+      ['Full results', ButtonStyle.Link, 'https://www.pokebattler.com/raids/x'],
+    ]);
+  });
+
+  it('shows the types of the moves as emoji where there are some, and the legacy mark', () => {
+    const counter = tyranitar(null, 3000, 2.71);
+    const [result] = counter.results;
+    if (!result) throw new Error('no result');
+    const message = renderCounters(
+      view({
+        attackers: { kind: 'level', level: '50' },
+        weather: 'NO_WEATHER',
+        friendship: '4',
+        shadow: false,
+        mega: false,
+        single: true,
+        bossMoves: 'Confusion / Psystrike',
+        picture: 'https://example.com/mewtwo.png',
+        rows: [{ counter, result: { ...result, third: null, legacy: true } }],
+        icon: (name) => (name === 'dark' ? '<:dark:1>' : undefined),
+        optionsId: 'counters:abc:options',
+      }),
     );
-    expect(embed.footer?.text).toBe('Click the title for the full results');
-    expect(embed.thumbnail).toBeUndefined();
+    expect(textDisplays(message)).toEqual([
+      '### Counters for Mewtwo\nLevel 5 raid · boss moves: Confusion / Psystrike\n' +
+        'About **3 trainers** with the best counters',
+      '`#01` **Tyranitar** · 150s · 3.0 deaths · 2.8 trainers\n' +
+        '-# <:dark:1> Bite / <:dark:1> Brutal Swing †',
+      '-# Attackers at level 50 · no weather · best friends · no shadow Pokémon or megas · ' +
+        'every moveset of a counter · † a legacy move',
+      '-# Data provided by Pokebattler',
+    ]);
+    expect(thumbnailOf(message)).toBe('https://example.com/mewtwo.png');
+    expect(
+      buttonsOf(message).map((button) => [button.label, button.emoji, button.customId]),
+    ).toEqual([
+      ['Change options…', '⚙️', 'counters:abc:options'],
+      ['Full results', undefined, undefined],
+    ]);
   });
 
   it('leaves out the trainers when Pokebattler gave no estimate, and says when nothing fits', () => {
     const counter = tyranitar(null, 3000, null);
     const one = renderCounters(
-      view({
-        attackers: { kind: 'level', level: '40' },
-        rows: [{ counter, result: counter.results[0]! }],
-      }),
+      view({ attackers: { kind: 'level', level: '40' }, rows: [rowOf(counter)], shadow: false }),
     );
-    expect(one.description).not.toContain('About');
-    expect(one.description).toContain('`#01` **Tyranitar**: 150s | 3.0 | ?');
-    const none = renderCounters(view());
-    expect(none.description).toContain('Pokebattler lists no counter that fits.');
+    expect(textDisplays(one)[0]).not.toContain('About');
+    expect(textDisplays(one)[1]).toMatch(/^`#01` \*\*Tyranitar\*\* · 150s · 3\.0 deaths · \? /);
+    expect(textDisplays(one)[2]).toContain('megas listed, no shadow Pokémon');
+    expect(textDisplays(renderCounters(view()))[1]).toBe('Pokebattler lists no counter that fits.');
+  });
+
+  it('keeps the worst case within what a message holds, leaving out what does not fit', () => {
+    const message = renderCounters(worstView(() => true));
+    expectV2Sendable(message);
+    const [, rows = '', settings = ''] = textDisplays(message);
+    expect(rows).toMatch(/…and \d+ more$/);
+    expect(settings).toContain('† a legacy move');
+  });
+
+  it('says what † means only when a counter that is shown has a legacy move', () => {
+    const [, rows = '', settings = ''] = textDisplays(renderCounters(worstView((i) => i === 11)));
+    expect(rows).not.toContain('#12');
+    expect(settings).not.toContain('†');
   });
 });
+
+/**
+ * The worst case: twelve counters of a Pokébox with long names, nicknames that need escapes all
+ * through, a third move, and every move with an emoji; `legacy` says which have a legacy move.
+ */
+function worstView(legacy: (index: number) => boolean): CountersView {
+  const rows = Array.from({ length: 12 }, (_, i): CounterRow => {
+    const counter: Counter = {
+      pokemonId: `SOME_VERY_LONG_POKEMON_NAME_FORM_${i}`,
+      cp: 12_345,
+      nickname: '*_~`|>'.repeat(10),
+      results: [
+        {
+          fast: 'A_VERY_LONG_FAST_MOVE_NAME_FAST',
+          charged: 'A_VERY_LONG_CHARGED_MOVE_NAME',
+          third: 'ANOTHER_VERY_LONG_CHARGED_MOVE',
+          legacy: legacy(i),
+          timeMs: 999_999,
+          deaths: 99.99,
+          estimator: 99.99,
+        },
+      ],
+    };
+    return rowOf(counter);
+  });
+  return view({
+    bossName: '*_'.repeat(40),
+    bossMoves: '*_'.repeat(40),
+    picture: 'https://example.com/boss.png',
+    rows,
+    icon: (name) => `<:${name}:123456789012345678>`,
+    single: true,
+    shadow: false,
+    mega: true,
+    optionsId: `counters:${'a'.repeat(16)}:options`,
+  });
+}
diff --git a/src/render/counters.ts b/src/render/counters.ts
index c5decc1bc4b372b28fb348bb2826086a0650bbd8..07a148840365c0edb043fed33993e87de665fbae 100644
--- a/src/render/counters.ts
+++ b/src/render/counters.ts
@@ -1,46 +1,69 @@
-import type { APIEmbed } from 'discord.js';
+import { ButtonStyle, ComponentType, type APIComponentInContainer } from 'discord.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import type { CounterRow } from '../domain/counters/counters.js';
 import {
   ATTACKER_LEVEL_NAMES,
   FRIENDSHIP_NAMES,
   WEATHER_NAMES,
-  type CounterAttackers,
+  type AttackerLevel,
   type CounterWeather,
   type Friendship,
 } from '../domain/counters/options.js';
-import { count, fitItems, LIMITS, plain, plainNoLinks, truncate } from './text.js';
+import { typeWord } from '../domain/pogo/game-icons.js';
+import { raidWords, type RaidTier } from '../domain/pogo/raid-tier.js';
+import type { PokemonType } from '../domain/pogo/types.js';
+import { cutText, TEXT_BUDGET } from './party-post.js';
+import { count, fitItems, plain, plainNoLinks, truncate } from './text.js';
+import {
+  actionRow,
+  container,
+  linkButton,
+  section,
+  separator,
+  textDisplay,
+  thumbnail,
+} from './v2.js';
 
 /** Pokebattler's green, as the legacy answer had it. */
 export const COUNTERS_COLOUR = 0x43b581;
 
-/** What the member left out and was assumed: the answer says so. */
-export interface Assumed {
-  level: boolean;
-  weather: boolean;
-  friendship: boolean;
+/** A move as the answer names it: its name, and its type where the game data knows the move. */
+export interface ShownMove {
+  name: string;
+  type: PokemonType | undefined;
 }
 
+/**
+ * Where the attackers of a simulation came from, as the answer says it: a level, or the member's
+ * Pokébox (whose user number the answer never shows).
+ */
+export type ShownAttackers = { kind: 'level'; level: AttackerLevel } | { kind: 'box' };
+
 /** What `/counters` shows. */
 export interface CountersView {
   bossName: string;
-  /** `T5`, `Shadow T5`. */
-  tierLabel: string;
+  tier: RaidTier;
   /** The page with the full results on pokebattler.com. */
   link: string;
   picture: string | undefined;
-  attackers: CounterAttackers;
+  attackers: ShownAttackers;
   weather: CounterWeather;
   friendship: Friendship;
-  assumed: Assumed;
   /** The boss's moves, `Confusion / Psystrike`; undefined for the average of all movesets. */
   bossMoves: string | undefined;
   rows: readonly CounterRow[];
   /** The name of a Pokémon by what Pokebattler calls it. */
   pokemonName: (pokemonId: string) => string;
-  moveName: (moveId: string) => string;
-  /** Whether shadow Pokémon and megas were asked for. */
+  /** A move by its id (`DRAGON_BREATH_FAST`). */
+  move: (moveId: string) => ShownMove;
+  /** The emoji of a type by its name (`dragon`), undefined where there is none. */
+  icon: (name: string) => string | undefined;
+  /** Whether shadow Pokémon and megas were listed, and every moveset of a counter. */
   shadow: boolean;
   mega: boolean;
+  single: boolean;
+  /** The custom id of "Change options…"; without it the answer has the link alone. */
+  optionsId?: string | undefined;
 }
 
 /** `#01`. */
@@ -50,72 +73,135 @@ const place = (index: number): string => `\`#${String(index + 1).padStart(2, '0'
 const trainers = (estimator: number | null): string =>
   estimator === null ? '?' : (Math.ceil(estimator * 10) / 10).toFixed(1);
 
+/** A move with its type's emoji before it, or its type in words after it where there is none. */
+function moveText(move: ShownMove, view: CountersView): string {
+  if (move.type === undefined) return plain(move.name);
+  const icon = view.icon(move.type);
+  return icon === undefined
+    ? `${plain(move.name)} (${typeWord(move.type)})`
+    : `${icon} ${plain(move.name)}`;
+}
+
+/** One counter: its place, name and numbers, and its moves in small print under them. */
 function rowText(row: CounterRow, index: number, view: CountersView): string {
   const { counter, result } = row;
+  const box = view.attackers.kind === 'box';
   const nickname =
     counter.nickname === null ? '' : ` "${plainNoLinks(truncate(counter.nickname, 30))}"`;
-  const cp =
-    view.attackers.kind === 'box' && counter.cp !== null ? ` ${String(counter.cp)} CP` : '';
+  const cp = box && counter.cp !== null ? ` · ${counter.cp.toLocaleString('en-US')} CP` : '';
   const moves = [result.fast, result.charged, ...(result.third === null ? [] : [result.third])]
-    .map(view.moveName)
+    .map((id) => moveText(view.move(id), view))
     .join(' / ');
   return (
-    `${place(index)} **${plain(view.pokemonName(counter.pokemonId))}**${nickname}${cp}: ` +
-    `${String(Math.round(result.timeMs / 1000))}s | ${result.deaths.toFixed(1)} | ` +
-    `${trainers(result.estimator)}\n*${plain(moves)}${result.legacy ? ' †' : ''}*`
+    `${place(index)} **${plain(view.pokemonName(counter.pokemonId))}**${nickname}${cp} · ` +
+    `${String(Math.round(result.timeMs / 1000))}s · ${result.deaths.toFixed(1)} deaths · ` +
+    `${trainers(result.estimator)} trainers\n-# ${moves}${result.legacy ? ' †' : ''}`
   );
 }
 
-/** What the simulation was for, with what was assumed marked. */
-function settingLine(view: CountersView): string {
-  const mark = (text: string, assumed: boolean): string => (assumed ? `${text} (assumed)` : text);
+/** `no weather`, `windy weather`. */
+function weatherText(weather: CounterWeather): string {
+  return weather === 'NO_WEATHER'
+    ? 'no weather'
+    : `${WEATHER_NAMES[weather].toLowerCase()} weather`;
+}
+
+/** Which counters were listed besides the plain ones. */
+function listedText(view: CountersView): string {
+  if (view.shadow && view.mega) return 'shadow Pokémon and megas listed';
+  if (view.shadow) return 'shadow Pokémon listed, no megas';
+  if (view.mega) return 'megas listed, no shadow Pokémon';
+  return 'no shadow Pokémon or megas';
+}
+
+/**
+ * What the simulation was for, in small print: `Attackers at level 40 · no weather · best
+ * friends · no shadow Pokémon or megas`, a Pokébox's, every moveset, and what `†` means.
+ */
+function settingLine(view: CountersView, legacyShown: boolean): string {
   const attackers =
     view.attackers.kind === 'box'
-      ? `The Pokébox of Pokebattler user ${String(view.attackers.userId)}`
-      : mark(`Attackers at ${ATTACKER_LEVEL_NAMES[view.attackers.level]}`, view.assumed.level);
-  return [
+      ? 'Your Pokébox on Pokebattler'
+      : `Attackers at ${ATTACKER_LEVEL_NAMES[view.attackers.level].replace(/^Level/, 'level')}`;
+  return `-# ${[
     attackers,
-    mark(WEATHER_NAMES[view.weather], view.assumed.weather),
-    mark(FRIENDSHIP_NAMES[view.friendship], view.assumed.friendship),
-  ].join(' · ');
+    weatherText(view.weather),
+    FRIENDSHIP_NAMES[view.friendship].toLowerCase(),
+    listedText(view),
+    ...(view.single ? ['every moveset of a counter'] : []),
+    ...(legacyShown ? ['† a legacy move'] : []),
+  ].join(' · ')}`;
+}
+
+const CREDIT = '-# Data provided by Pokebattler';
+
+/**
+ * As many whole rows as fit into `room`, one under the other, and "…and N more" for the rest
+ * (`fitItems`), with how many are shown; a single row too long by itself is cut.
+ */
+function fitRows(rows: readonly string[], room: number): { text: string; shown: number } {
+  const text = fitItems(rows, room, '\n');
+  const more = /…and (\d+) more$/.exec(text);
+  const shown = more ? rows.length - Number(more[1]) : rows.length;
+  return { text: cutText(text, room), shown };
 }
 
 /**
- * The answer of `/counters`: the legacy embed made tidy. The best counters (twelve), each with
- * the time to win, how often it faints and how many trainers it takes (Pokebattler's
- * estimator), one line above them with the trainers the best counter takes, and a link to the
- * full results on pokebattler.com.
+ * The answer of `/counters` (plan 8B-2), one components-v2 message: the boss, the raid and its
+ * moves and how many trainers it takes beside the boss's picture; the best counters (twelve),
+ * each with the time to win, how often it faints and how many trainers it takes (Pokebattler's
+ * estimator), its moves in small print with their types' emoji; what the simulation was for;
+ * "Change options…" and the full results on pokebattler.com; and the credit. The counters share
+ * what is left of `TEXT_BUDGET` ("…and N more" for those that do not fit).
  */
-export function renderCounters(view: CountersView): APIEmbed {
+export function renderCounters(view: CountersView): V2Message {
   const best = view.rows[0]?.result.estimator ?? null;
   const head = [
-    best === null
-      ? undefined
-      : `About **${count(Math.max(1, Math.ceil(best)), 'trainer')}** with the best counters.`,
-    settingLine(view),
-    view.bossMoves === undefined
-      ? 'Boss moves: the average of all its movesets'
-      : `Boss moves: ${plain(view.bossMoves)}`,
-  ].filter((line): line is string => line !== undefined);
-  const rows =
-    view.rows.length === 0
-      ? ['Pokebattler lists no counter that fits.']
+    `### Counters for ${plain(view.bossName)}`,
+    `${raidWords(view.tier)} · boss moves: ${
+      view.bossMoves === undefined ? 'the average of all its movesets' : plain(view.bossMoves)
+    }`,
+    ...(best === null
+      ? []
       : [
-          '__Time to win | Deaths | Trainers__',
-          ...view.rows.map((row, i) => rowText(row, i, view)),
-        ];
-  const notes = [
-    ...(view.rows.some((row) => row.result.legacy) ? ['† a legacy move'] : []),
-    ...(view.shadow ? [] : ['no shadow Pokémon (shadow:True lists them)']),
-    ...(view.mega ? [] : ['no megas (mega:True lists them)']),
+          `About **${count(Math.max(1, Math.ceil(best)), 'trainer')}** with ` +
+            `${view.attackers.kind === 'box' ? 'your' : 'the'} best counters`,
+        ]),
+  ].join('\n');
+  // The rows have what is left beside the small print with the legacy note; the note stays only
+  // when a row that is shown has a legacy move (a shorter line leaves more room, never less).
+  const room = TEXT_BUDGET - head.length - settingLine(view, true).length - CREDIT.length;
+  const fitted = fitRows(
+    view.rows.map((row, i) => rowText(row, i, view)),
+    room,
+  );
+  const settings = settingLine(
+    view,
+    view.rows.slice(0, fitted.shown).some((row) => row.result.legacy),
+  );
+  const rows = view.rows.length === 0 ? 'Pokebattler lists no counter that fits.' : fitted.text;
+  const buttons = [
+    ...(view.optionsId === undefined
+      ? []
+      : [
+          {
+            type: ComponentType.Button as const,
+            style: ButtonStyle.Primary as const,
+            custom_id: view.optionsId,
+            label: 'Change options…',
+            emoji: { name: '⚙️' },
+          },
+        ]),
+    linkButton('Full results', undefined, view.link),
+  ];
+  const parts: APIComponentInContainer[] = [
+    view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
+    separator(),
+    textDisplay(rows),
+    separator(),
+    textDisplay(settings),
+    actionRow(buttons),
+    textDisplay(CREDIT),
   ];
-  return {
-    author: { name: 'Data provided by Pokebattler', url: 'https://www.pokebattler.com' },
-    title: truncate(`Counters for ${view.bossName} (${view.tierLabel})`, LIMITS.embedTitle),
-    url: view.link,
-    color: COUNTERS_COLOUR,
-    description: fitItems([head.join('\n'), ...rows], LIMITS.embedDescription, '\n'),
-    ...(view.picture === undefined ? {} : { thumbnail: { url: view.picture } }),
-    footer: { text: ['Click the title for the full results', ...notes].join(' · ') },
-  };
+  return { v2: true, components: [container(COUNTERS_COLOUR, parts)] };
 }
diff --git a/src/services/application-emoji.test.ts b/src/services/application-emoji.test.ts
index 90c78ef408725ede37cf8c17f4ca2daf30e0b373..a4962dce64b9de3a5413853acfe90866a1bb5c5d 100644
--- a/src/services/application-emoji.test.ts
+++ b/src/services/application-emoji.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { createTestLogger } from '../../test/support/test-logger.js';
-import { ApplicationEmoji } from './application-emoji.js';
+import { ApplicationEmoji, emojiFinder } from './application-emoji.js';
 
 describe('ApplicationEmoji', () => {
   it('knows nothing before the first read, and the emoji of the application after it', async () => {
@@ -102,3 +102,17 @@ describe('ApplicationEmoji', () => {
     expect(reads).toBe(2);
   });
 });
+
+describe('emojiFinder', () => {
+  it('finds the application’s first, then the server’s, and none in a DM', () => {
+    const app = new Map([['rock', '<:rock:1>']]);
+    const servers = {
+      inServer: (guildId: string, name: string) => (guildId === 'g1' ? `<:${name}:2>` : undefined),
+    };
+    const finder = emojiFinder(app, servers);
+    expect(finder.find('rock', 'g1')).toBe('<:rock:1>');
+    expect(finder.find('dark', 'g1')).toBe('<:dark:2>');
+    expect(finder.find('dark', null)).toBeUndefined();
+    expect(finder.find('dark', 'g2')).toBeUndefined();
+  });
+});
diff --git a/src/services/application-emoji.ts b/src/services/application-emoji.ts
index 4f729019f9522b002b60077fbde815e4bd76da35..cd31734fe71bbedeb800dbff09925298d8e54047 100644
--- a/src/services/application-emoji.ts
+++ b/src/services/application-emoji.ts
@@ -61,3 +61,23 @@ export class ApplicationEmoji {
     return this.known.get(name);
   }
 }
+
+/**
+ * The emoji of a name, as the posts find them (`PartyService.emoji`): the bot's application's
+ * first, then those of a server, by its id (none in a DM). For answers that are no posts
+ * (`/counters`).
+ */
+export interface EmojiFinder {
+  find(name: string, guildId: string | null): string | undefined;
+}
+
+/** The finder over the application's emoji and the servers' (`DiscordApplicationEmoji`). */
+export function emojiFinder(
+  app: { get(name: string): string | undefined },
+  servers: { inServer(guildId: string, name: string): string | undefined },
+): EmojiFinder {
+  return {
+    find: (name, guildId) =>
+      app.get(name) ?? (guildId === null ? undefined : servers.inServer(guildId, name)),
+  };
+}
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 56d1a784b4f47e807d11df6af22d3a0e0063df02..0aeb0168179737c501ce814ce5332467547879e8 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -140,6 +140,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'screenshots',
       'pass { screenshots } from screenshotsWith() (test/support/screenshot-service.ts)',
     ),
+    // No emoji: the game's icons are named in words; a test passes its own finder.
+    emoji: { find: () => undefined },
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
   };
````

### Task 5: Change options of a counters answer: kept options, a dialog and its submit

Prototype commit: `8fc27a28f6fa8eb13b92414418e5c704a50f0df1`

R1.3 to R1.6 of plan 8B-2.

- Kept options: every answer keeps its plan (boss key, tier, attackers as
  a level or "a Pokebox" without its number, weather, friendship, the boss
  moveset's move ids, shadow, mega, single, who asked, and the party of
  the post a public answer stands in) in KeptCounterOptions under a random
  token (16 hex characters) that is the id of its controls'
  custom ids, kind `counters`: `counters:<token>:options` ("Change
  options…") and `counters:<token>:dialog`. A day (COUNTERS_KEEP_MS), at
  most COUNTERS_KEPT_MAX = 5,000 answers (a BoundedMap, oldest out: a few
  hundred bytes each), in memory only. A press whose token is gone answers
  privately "These options are no longer kept. Use `/counters` again."
  (also for a boss the game data no longer has).
- The dialog (counters-dialog.ts, countersDialog): shown at once
  (showModal, no deferral), titled `Counters for <boss>` (cut to 45),
  five labels: Attackers (the levels, and `My Pokebox on Pokebattler` only
  for a presser whose settings have a Pokebattler id), Weather,
  Friendship, Boss moves (the average, then the boss's movesets, 25 in all
  at most, the current one always among them) and Also list, a checkbox
  group (Shadow Pokemon, Megas, Every moveset of a counter; required
  false, min 0), each with the answer's choice preselected. Plain API
  objects, as the other forms of this bot; the values are read with
  discord.js's fields.getStringSelectValues and getCheckboxGroup.
- Submit: the plan is built from the kept one (boss and tier never change;
  pokebattlerTarget is shared with the command), refused as the command
  refuses (a Pokebox without a saved id: the same sentence; the Pokebox
  number read anew from ctx.users), simulated by the command's own
  simulate() and rendered by countersMessage(), which keeps the new
  answer's options under a new token (the old one stays good for its
  message). It answers by R0: the asker's public answer is edited
  (deferUpdate, then editReply), anybody else gets a private copy (a
  private deferReply), a Pokebox only ever privately, a private answer in
  its place; a public answer whose party has ended is never edited (before
  the simulation: a private copy; during it: a private follow-up after the
  deferUpdate). A failure is a private sentence (the router's follow-up),
  never an edit of the answer. A submit counts in the same window as the
  /counters command (COUNTERS_THROTTLE with `as: 'counters'`: three a
  minute for Pokebattler, command and submits together; "You can use
  /counters again in …"); opening the dialog is not counted, nor is a
  submit refused by the handler's guard (requireDialogPlan: options no
  longer kept, a Pokebox without a saved id, a boss moveset or a weather
  or friendship not of the lists), which runs before the throttle.
- Boss moves: the average and the boss's movesets (movesetOptions, values
  spelled by the command's movesetValue); a kept moveset the boss no
  longer has (the game data changed) leaves the average selected.
- /counters' help text mentions Change options…; no slash option changed.

Decisions:
- The copy's kept options name its presser as the asker and no party, so
  a press on the copy changes the copy.
- The Pokebox answer's dialog opened by a member who no longer has an id
  preselects level 40 (the command's default).
- A boss moveset value of the dialog that is not among the boss's movesets
  is refused ("Pick the boss moves from their list."); typed movesets
  stay the command's.
- Ruled to stay (review of the prototype): a Pokebox picked in the dialog
  takes the checkboxes as shown (what the member sees is what they get;
  the command's Pokebox default of shadows and megas applies to the slash
  options only); the settings read before showModal stays (a primary-key
  read); the form stays plain API objects rather than LabelBuilder.

**Files:**

```
 src/commands/util/counters-dialog.test.ts | 435 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/util/counters-dialog.ts      | 304 +++++++++++++++++++++++++++++++++++
 src/commands/util/counters.ts             | 159 +++++++++++++++---
 src/components/index.ts                   |   2 +
 4 files changed, 882 insertions(+), 18 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/util/counters-dialog.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 8fc27a28f6fa8eb13b92414418e5c704a50f0df1 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Change options of a counters answer: kept options, a dialog and its submit`, the body above and the trailer, staging exactly
  `src/commands/util/counters-dialog.test.ts src/commands/util/counters-dialog.ts src/commands/util/counters.ts src/components/index.ts`.

````diff
diff --git a/src/commands/util/counters-dialog.test.ts b/src/commands/util/counters-dialog.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1cc1b6e862472edf4b16f4e18f31df3658374394
--- /dev/null
+++ b/src/commands/util/counters-dialog.test.ts
@@ -0,0 +1,435 @@
+import { ComponentType, MessageFlags } from 'discord.js';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import {
+  asV2,
+  checkModal,
+  fakeButton,
+  fakeChatInput,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+  type FakeOptions,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../../test/support/gyms.js';
+import { buttonsOf, textDisplays } from '../../../test/support/messages.js';
+import { ALICE, BOB } from '../../../test/support/parties.js';
+import { reportedRaid } from '../../../test/support/party-service.js';
+import { FakePokebattler } from '../../../test/support/pokebattler.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { MemoryUsers } from '../../../test/support/users.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { bossMovesets, counters, KeptCounterOptions, keptCounters } from './counters.js';
+import { countersControls, countersDialog, NOT_KEPT } from './counters-dialog.js';
+
+/** The form as the fake recorded it. */
+interface Form {
+  custom_id: string;
+  title: string;
+  components: {
+    label: string;
+    component: {
+      type: number;
+      custom_id: string;
+      options: { label: string; value: string; default?: boolean }[];
+    };
+  }[];
+}
+
+async function setup(options: { inPost?: boolean } = {}) {
+  const pokebattler = new FakePokebattler();
+  const users = new MemoryUsers();
+  const raid = options.inPost ? await reportedRaid({ boss: { key: 'mewtwo' } }) : undefined;
+  const { ctx } = createTestContext({
+    pokebattler,
+    users,
+    ...(raid ? { parties: raid.store, regions: raid.regions } : {}),
+  });
+  const router = new InteractionRouter(ctx, [counters], [countersControls], {
+    now: () => 1_800_000_000_000,
+  });
+  const where: FakeOptions = raid
+    ? { channelId: raid.postId, thread: { parentId: WEST_FORUM } }
+    : {};
+  /** Asks `/counters` as Alice, and gives the answer and the token of its options. */
+  const ask = async (opts: Record<string, string | boolean> = {}) => {
+    const used = fakeChatInput({
+      commandName: 'counters',
+      userId: ALICE,
+      options: raid ? opts : { boss: 'mewtwo', tier: 'T5', ...opts },
+      ...where,
+    });
+    await router.handle(used as never);
+    const answer = asV2(sent(used.editReply));
+    const optionsId = buttonsOf(answer).find((b) => b.label === 'Change options…')?.customId;
+    const token = optionsId?.split(':')[1] ?? '';
+    return { used, answer, token, optionsId };
+  };
+  const open = async (token: string, userId: string, extra: FakeOptions = {}) => {
+    const press = fakeButton({ customId: `counters:${token}:options`, userId, ...where, ...extra });
+    await router.handle(press as never);
+    return press;
+  };
+  const submit = async (
+    token: string,
+    userId: string,
+    values: { attackers?: string; weather?: string; friendship?: string; moveset?: string } = {},
+    also: string[] = [],
+    extra: FakeOptions = {},
+  ) => {
+    // The form the bot shows this member, so that the submit is checked against its real inputs
+    // (none where the options are no longer kept: the submit then names its inputs itself).
+    const shown = (await open(token, userId)).showModal.mock.calls[0]?.[0];
+    const form = fakeModal({
+      customId: `counters:${token}:dialog`,
+      userId,
+      askedBy: ALICE,
+      ...(shown === undefined ? {} : { form: shown }),
+      selected: {
+        attackers: [values.attackers ?? '40'],
+        weather: [values.weather ?? 'NO_WEATHER'],
+        friendship: [values.friendship ?? '4'],
+        moveset: [values.moveset ?? 'average'],
+      },
+      checked: { also },
+      ...where,
+      ...extra,
+    });
+    await router.handle(form as never);
+    return form;
+  };
+  return { ctx, pokebattler, users, raid, router, ask, open, submit };
+}
+
+const formOf = (press: FakeInteraction): Form => {
+  const form = press.showModal.mock.calls[0]?.[0] as Form | undefined;
+  if (!form) throw new Error('no form was shown');
+  return form;
+};
+const selectedIn = (form: Form, label: string): string[] =>
+  form.components
+    .find((component) => component.label === label)
+    ?.component.options.filter((option) => option.default === true)
+    .map((option) => option.value) ?? [];
+const valuesIn = (form: Form, label: string): string[] =>
+  form.components
+    .find((component) => component.label === label)
+    ?.component.options.map((option) => option.value) ?? [];
+const settingsOf = (message: V2Message): string => textDisplays(message)[2] ?? '';
+
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+describe('/counters: Change options…', () => {
+  it('stands under every answer, with a token of its own', async () => {
+    const made = await setup();
+    const first = await made.ask();
+    const second = await made.ask();
+    expect(first.optionsId).toMatch(/^counters:[0-9a-f]{16}:options$/);
+    expect(second.token).not.toBe(first.token);
+    expect(keptCounters.get(first.token)).toMatchObject({
+      bossKey: 'mewtwo',
+      tier: { level: 'T5', shadow: false },
+      attackers: { kind: 'level', level: '40' },
+      askerId: ALICE,
+      partyId: null,
+    });
+  });
+
+  it('opens a dialog with what the answer chose, the Pokébox only for who has one', async () => {
+    const made = await setup();
+    const { token } = await made.ask({
+      level: '50',
+      weather: 'WINDY',
+      friendship: '2',
+      moveset: 'CONFUSION_FAST/PSYSTRIKE',
+      shadow: true,
+    });
+    const press = await made.open(token, BOB);
+    expect(press.deferReply).not.toHaveBeenCalled();
+    const form = formOf(press);
+    expect(form.custom_id).toBe(`counters:${token}:dialog`);
+    expect(form.title).toBe('Counters for Mewtwo');
+    expect(form.components.map((component) => component.label)).toEqual([
+      'Attackers',
+      'Weather',
+      'Friendship',
+      'Boss moves',
+      'Also list',
+    ]);
+    expect(selectedIn(form, 'Attackers')).toEqual(['50']);
+    expect(valuesIn(form, 'Attackers')).not.toContain('box');
+    expect(selectedIn(form, 'Weather')).toEqual(['WINDY']);
+    expect(selectedIn(form, 'Friendship')).toEqual(['2']);
+    expect(selectedIn(form, 'Boss moves')).toEqual(['CONFUSION_FAST/PSYSTRIKE']);
+    expect(valuesIn(form, 'Boss moves')[0]).toBe('average');
+    expect(selectedIn(form, 'Also list')).toEqual(['shadow']);
+    expect(form.components[4]?.component.type).toBe(ComponentType.CheckboxGroup);
+    await made.users.update(BOB, { pokebattlerId: 4242 });
+    expect(valuesIn(formOf(await made.open(token, BOB)), 'Attackers')).toContain('box');
+  });
+
+  it('keeps every boss’s moves within a menu, with the current ones among them', async () => {
+    const made = await setup();
+    const entry = made.ctx.gameData.catalogue.byKey('mew');
+    if (!entry) throw new Error('no mew');
+    const kept = {
+      bossKey: 'mew',
+      tier: { level: 'T5', shadow: false },
+      attackers: { kind: 'level', level: '40' },
+      weather: 'NO_WEATHER',
+      friendship: '4',
+      moveset: null,
+      shadow: false,
+      mega: false,
+      single: false,
+      askerId: ALICE,
+      partyId: null,
+    } as const;
+    const all = countersDialog(made.ctx, 'abc', kept, entry, true) as unknown as Form;
+    checkModal(all);
+    const moves = valuesIn(all, 'Boss moves');
+    expect(moves.length).toBeLessThanOrEqual(25);
+    // Mew knows far more than 24 movesets: the last one is shown when it is the current one.
+    const movesets = bossMovesets(made.ctx.gameData.catalogue, entry);
+    expect(movesets.length).toBeGreaterThan(24);
+    const lastMoveset = movesets.at(-1);
+    if (!lastMoveset) throw new Error('no moveset');
+    const current = `${lastMoveset.fast.id}/${lastMoveset.charged.id}`;
+    expect(moves).not.toContain(current);
+    const last = countersDialog(
+      made.ctx,
+      'abc',
+      { ...kept, moveset: { fast: lastMoveset.fast.id, charged: lastMoveset.charged.id } },
+      entry,
+      true,
+    ) as unknown as Form;
+    checkModal(last);
+    expect(selectedIn(last, 'Boss moves')).toEqual([current]);
+    expect(valuesIn(last, 'Boss moves')).toHaveLength(25);
+  });
+
+  it('changes the asker’s public answer in a post, with options of its own', async () => {
+    const made = await setup({ inPost: true });
+    const { token } = await made.ask();
+    const form = await made.submit(
+      token,
+      ALICE,
+      { attackers: '50', weather: 'WINDY', friendship: '2' },
+      ['shadow', 'mega'],
+    );
+    expect(form.deferUpdate).toHaveBeenCalledOnce();
+    expect(form.reply).not.toHaveBeenCalled();
+    const changed = asV2(sent(form.editReply));
+    expect(settingsOf(changed)).toBe(
+      '-# Attackers at level 50 · windy weather · great friends · shadow Pokémon and megas ' +
+        'listed · † a legacy move',
+    );
+    expect(made.pokebattler.asked.at(-1)).toMatchObject({
+      boss: 'MEWTWO',
+      raidLevel: 'RAID_LEVEL_5',
+      attackers: { kind: 'level', level: '50' },
+      weather: 'WINDY',
+      friendship: '2',
+    });
+    const newToken = buttonsOf(changed)
+      .find((b) => b.label === 'Change options…')
+      ?.customId?.split(':')[1];
+    expect(newToken).toBeDefined();
+    expect(newToken).not.toBe(token);
+    expect(keptCounters.get(newToken ?? '')).toMatchObject({
+      askerId: ALICE,
+      partyId: made.raid?.party.id,
+      shadow: true,
+      weather: 'WINDY',
+    });
+    // The old token stays good for its own message.
+    expect(keptCounters.get(token)?.weather).toBe('NO_WEATHER');
+  });
+
+  it('gives anybody else a private copy and leaves the public answer alone', async () => {
+    const made = await setup({ inPost: true });
+    const { token } = await made.ask();
+    const form = await made.submit(token, BOB, { friendship: '0' });
+    expect(form.deferUpdate).not.toHaveBeenCalled();
+    expect(form.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
+    const copy = asV2(sent(form.editReply));
+    expect(settingsOf(copy)).toContain('not friends');
+    const copyToken = buttonsOf(copy)
+      .find((b) => b.label === 'Change options…')
+      ?.customId?.split(':')[1];
+    expect(keptCounters.get(copyToken ?? '')).toMatchObject({ askerId: BOB, partyId: null });
+  });
+
+  it('shows a Pokébox privately only, also to the asker of a public answer', async () => {
+    const made = await setup({ inPost: true });
+    await made.users.update(ALICE, { pokebattlerId: 4242 });
+    const { token } = await made.ask();
+    const form = await made.submit(token, ALICE, { attackers: 'box' });
+    expect(form.deferUpdate).not.toHaveBeenCalled();
+    expect(form.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
+    expect(made.pokebattler.asked.at(-1)?.attackers).toEqual({ kind: 'box', userId: 4242 });
+    expect(settingsOf(asV2(sent(form.editReply)))).toMatch(/^-# Your Pokébox on Pokebattler/);
+  });
+
+  it('refuses a Pokébox to a member who has saved no Pokebattler id', async () => {
+    const made = await setup();
+    const { token } = await made.ask();
+    const form = await made.submit(token, BOB, { attackers: 'box' });
+    expect(sent(form.reply)).toEqual({
+      content:
+        'You have no Pokebattler user id saved. Save it with `/settings pokebattler-id`, or ' +
+        'pick a level.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(made.pokebattler.asked).toHaveLength(1);
+  });
+
+  it('updates a private answer in its place', async () => {
+    const made = await setup();
+    const { token } = await made.ask();
+    const form = await made.submit(token, ALICE, { weather: 'FOG' }, [], {
+      askedBy: ALICE,
+      ephemeralMessage: true,
+    });
+    expect(form.deferUpdate).toHaveBeenCalledOnce();
+    expect(settingsOf(asV2(sent(form.editReply)))).toContain('fog weather');
+  });
+
+  it('says privately when Pokebattler failed, and leaves the answer as it was', async () => {
+    const made = await setup({ inPost: true });
+    const { token } = await made.ask();
+    made.pokebattler.failing = { ok: false, reason: 'timeout' };
+    const form = await made.submit(token, ALICE);
+    expect(form.editReply).not.toHaveBeenCalled();
+    expect(sent(form.followUp)).toEqual({
+      content: 'Pokebattler did not answer just now. Please try again later.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('answers privately when the raid ended while Pokebattler was asked', async () => {
+    const made = await setup({ inPost: true });
+    const { token } = await made.ask();
+    const raid = made.raid;
+    if (!raid) throw new Error('no raid');
+    const ask = made.pokebattler.counters.bind(made.pokebattler);
+    made.pokebattler.counters = async (request) => {
+      await raid.service.end(raid.party.id);
+      return ask(request);
+    };
+    const form = await made.submit(token, ALICE);
+    expect(form.deferUpdate).toHaveBeenCalledOnce();
+    expect(form.editReply).not.toHaveBeenCalled();
+    expect(sent(form.followUp).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    // Once the party has ended, the asker's next change is a private copy from the start.
+    made.pokebattler.counters = ask;
+    const later = await made.submit(token, ALICE);
+    expect(later.deferUpdate).not.toHaveBeenCalled();
+    expect(later.deferReply).toHaveBeenCalledOnce();
+  });
+
+  it('counts submits against the three a minute, not the opening of the dialog', async () => {
+    const made = await setup();
+    const { token } = await made.ask();
+    for (let n = 0; n < 5; n++) expect(formOf(await made.open(token, BOB)).title).toBeDefined();
+    for (let n = 0; n < 3; n++) await made.submit(token, BOB);
+    const over = await made.submit(token, BOB);
+    expect(sent(over.reply).content).toBe('You can use /counters again in 1 minute.');
+    expect(made.pokebattler.asked).toHaveLength(4);
+  });
+
+  it('counts submits in the same window as the command itself', async () => {
+    const made = await setup();
+    // Alice's use of the command is one of her three.
+    const { token } = await made.ask();
+    await made.submit(token, ALICE);
+    await made.submit(token, ALICE);
+    expect(sent((await made.submit(token, ALICE)).reply).content).toBe(
+      'You can use /counters again in 1 minute.',
+    );
+    const again = fakeChatInput({
+      commandName: 'counters',
+      userId: ALICE,
+      options: { boss: 'mewtwo', tier: 'T5' },
+    });
+    await made.router.handle(again as never);
+    expect(sent(again.reply).content).toBe('You can use /counters again in 1 minute.');
+    expect(made.pokebattler.asked).toHaveLength(3);
+  });
+
+  it('does not count a submit it refuses', async () => {
+    const made = await setup();
+    const { token } = await made.ask();
+    for (let n = 0; n < 4; n++) {
+      expect(sent((await made.submit(token, BOB, { attackers: 'box' })).reply).content).toMatch(
+        /^You have no Pokebattler user id saved/,
+      );
+      expect(
+        sent((await made.submit(token, BOB, { moveset: 'HYDRO_PUMP/SURF' })).reply).content,
+      ).toBe('Pick the boss moves from their list.');
+      expect(sent((await made.submit('0123456789abcdef', BOB)).reply).content).toBe(NOT_KEPT);
+    }
+    for (let n = 0; n < 3; n++)
+      expect((await made.submit(token, BOB)).editReply).toHaveBeenCalled();
+    expect(made.pokebattler.asked).toHaveLength(4);
+  });
+
+  it('selects the average for a kept moveset the boss no longer has', async () => {
+    const made = await setup();
+    const { token } = await made.ask();
+    const kept = keptCounters.get(token);
+    const entry = made.ctx.gameData.catalogue.byKey('mewtwo');
+    if (!kept || !entry) throw new Error('nothing kept');
+    const form = countersDialog(
+      made.ctx,
+      token,
+      { ...kept, moveset: { fast: 'SPLASH_FAST', charged: 'STRUGGLE' } },
+      entry,
+      false,
+    ) as unknown as Form;
+    checkModal(form);
+    expect(selectedIn(form, 'Boss moves')).toEqual(['average']);
+  });
+
+  it('says the options are no longer kept after a day, or after a restart', async () => {
+    const made = await setup();
+    const { token } = await made.ask();
+    vi.useFakeTimers({ toFake: ['Date'] });
+    vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1);
+    expect(sent((await made.open(token, ALICE)).reply).content).toBe(NOT_KEPT);
+    expect(sent((await made.submit(token, ALICE)).reply).content).toBe(NOT_KEPT);
+    expect(sent((await made.open('0123456789abcdef', ALICE)).reply).content).toBe(NOT_KEPT);
+  });
+});
+
+describe('KeptCounterOptions', () => {
+  it('keeps at most so many, the oldest going first, each for its time', () => {
+    let now = 0;
+    const kept = new KeptCounterOptions({ max: 2, ttlMs: 1_000, now: () => now });
+    const value = keptCountersValue();
+    const a = kept.keep(value);
+    const b = kept.keep(value);
+    const c = kept.keep(value);
+    expect([kept.get(a), kept.get(b), kept.get(c)].map(Boolean)).toEqual([false, true, true]);
+    now = 1_000;
+    expect(kept.get(c)).toBeUndefined();
+  });
+});
+
+function keptCountersValue() {
+  return {
+    bossKey: 'mewtwo',
+    tier: { level: 'T5', shadow: false },
+    attackers: { kind: 'box' },
+    weather: 'NO_WEATHER',
+    friendship: '4',
+    moveset: null,
+    shadow: true,
+    mega: true,
+    single: false,
+    askerId: ALICE,
+    partyId: null,
+  } as const;
+}
diff --git a/src/commands/util/counters-dialog.ts b/src/commands/util/counters-dialog.ts
new file mode 100644
index 0000000000000000000000000000000000000000..486850833b3c99efbcf1c4839027c765b2def566
--- /dev/null
+++ b/src/commands/util/counters-dialog.ts
@@ -0,0 +1,304 @@
+import {
+  ComponentType,
+  MessageFlags,
+  type APIModalInteractionResponseCallbackData,
+  type APISelectMenuOption,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler, Guard } from '../../discord/command.js';
+import { decodeCustomId, encodeCustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { answerPress, deferPress, pressAnswer } from '../../discord/late-reply.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import {
+  ATTACKER_LEVEL_NAMES,
+  ATTACKER_LEVELS,
+  FRIENDSHIP_NAMES,
+  FRIENDSHIPS,
+  isCounterWeather,
+  isFriendship,
+  WEATHER_NAMES,
+  WEATHERS,
+} from '../../domain/counters/options.js';
+import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import { cutText } from '../../render/party-post.js';
+import {
+  attackersOf,
+  AVERAGE_MOVESET,
+  bossMovesets,
+  COUNTERS_ACTIONS,
+  COUNTERS_KIND,
+  COUNTERS_THROTTLE,
+  countersMessage,
+  keptCounters,
+  movesetName,
+  movesetValue,
+  POKEBOX,
+  pokebattlerTarget,
+  serverOf,
+  simulate,
+  type CounterPlan,
+  type KeptCounters,
+} from './counters.js';
+
+/** What a press is told when the options of an answer are no longer kept. */
+export const NOT_KEPT = 'These options are no longer kept. Use `/counters` again.';
+
+/** The custom ids of the inputs of the dialog. */
+const INPUTS = {
+  attackers: 'attackers',
+  weather: 'weather',
+  friendship: 'friendship',
+  moveset: 'moveset',
+  also: 'also',
+} as const;
+
+/** The values of the checkboxes of "Also list". */
+const ALSO = { shadow: 'shadow', mega: 'mega', single: 'single' } as const;
+
+/** What a modal's title, a select menu and an option hold. */
+const TITLE_ROOM = 45;
+const MAX_OPTIONS = 25;
+const OPTION_TEXT = 100;
+
+const choice = (label: string, value: string, selected: boolean): APISelectMenuOption => ({
+  label: cutText(label, OPTION_TEXT),
+  value,
+  ...(selected ? { default: true } : {}),
+});
+
+/**
+ * The options of "Boss moves": the average, then the boss's movesets, at most 25 in all; the
+ * current one is always among them (in the place of the last that fits when it is further down).
+ * A kept moveset the boss no longer has (the game data changed) leaves the average selected.
+ */
+function movesetOptions(
+  ctx: AppContext,
+  entry: PokemonEntry,
+  current: KeptCounters['moveset'],
+): APISelectMenuOption[] {
+  const all = bossMovesets(ctx.gameData.catalogue, entry);
+  const kept = current ? `${current.fast}/${current.charged}` : AVERAGE_MOVESET;
+  const currentValue = all.some((moveset) => movesetValue(moveset) === kept)
+    ? kept
+    : AVERAGE_MOVESET;
+  let shown = all.slice(0, MAX_OPTIONS - 1);
+  const missing = all.find(
+    (moveset) =>
+      movesetValue(moveset) === currentValue &&
+      !shown.some((other) => movesetValue(other) === currentValue),
+  );
+  if (missing) shown = [...shown.slice(0, MAX_OPTIONS - 2), missing];
+  return [
+    choice('The average of all its movesets', AVERAGE_MOVESET, currentValue === AVERAGE_MOVESET),
+    ...shown.map((moveset) =>
+      choice(movesetName(moveset), movesetValue(moveset), movesetValue(moveset) === currentValue),
+    ),
+  ];
+}
+
+function selectLabel(
+  label: string,
+  customId: string,
+  options: APISelectMenuOption[],
+): APIModalInteractionResponseCallbackData['components'][number] {
+  return {
+    type: ComponentType.Label,
+    label,
+    component: { type: ComponentType.StringSelect, custom_id: customId, options },
+  };
+}
+
+/**
+ * The dialog of "Change options…" (plan 8B-2): five labels, the most a modal holds, each with
+ * what the answer had chosen: the attackers (the levels, and the presser's Pokébox when their
+ * settings have a Pokebattler id), the weather, the friendship, the boss's moves, and "Also
+ * list" (shadow Pokémon, megas, every moveset of a counter) as checkboxes.
+ */
+export function countersDialog(
+  ctx: AppContext,
+  token: string,
+  kept: KeptCounters,
+  entry: PokemonEntry,
+  hasBox: boolean,
+): APIModalInteractionResponseCallbackData {
+  const box = kept.attackers.kind === 'box' && hasBox;
+  const level = kept.attackers.kind === 'level' ? kept.attackers.level : undefined;
+  return {
+    custom_id: encodeCustomId({ kind: COUNTERS_KIND, id: token, action: COUNTERS_ACTIONS.dialog }),
+    title: cutText(`Counters for ${entry.name}`, TITLE_ROOM),
+    components: [
+      selectLabel('Attackers', INPUTS.attackers, [
+        ...ATTACKER_LEVELS.map((each) =>
+          // A Pokébox answer opened by a member without a Pokébox: the usual level.
+          choice(
+            ATTACKER_LEVEL_NAMES[each],
+            each,
+            each === level || (level === undefined && !box && each === '40'),
+          ),
+        ),
+        ...(hasBox ? [choice('My Pokébox on Pokebattler', POKEBOX, box)] : []),
+      ]),
+      selectLabel(
+        'Weather',
+        INPUTS.weather,
+        WEATHERS.map((each) => choice(WEATHER_NAMES[each], each, each === kept.weather)),
+      ),
+      selectLabel(
+        'Friendship',
+        INPUTS.friendship,
+        FRIENDSHIPS.map((each) => choice(FRIENDSHIP_NAMES[each], each, each === kept.friendship)),
+      ),
+      selectLabel('Boss moves', INPUTS.moveset, movesetOptions(ctx, entry, kept.moveset)),
+      {
+        type: ComponentType.Label,
+        label: 'Also list',
+        component: {
+          type: ComponentType.CheckboxGroup,
+          custom_id: INPUTS.also,
+          required: false,
+          min_values: 0,
+          options: [
+            { label: 'Shadow Pokémon', value: ALSO.shadow, default: kept.shadow },
+            { label: 'Megas', value: ALSO.mega, default: kept.mega },
+            { label: 'Every moveset of a counter', value: ALSO.single, default: kept.single },
+          ],
+        },
+      },
+    ],
+  };
+}
+
+/** The boss of kept options, as the game data has it now. */
+function keptBoss(ctx: AppContext, kept: KeptCounters): PokemonEntry {
+  const entry = ctx.gameData.catalogue.byKey(kept.bossKey);
+  if (!entry) throw new UserError(NOT_KEPT);
+  return entry;
+}
+
+/** The one value of a select menu of the dialog. */
+function picked(interaction: ModalSubmitInteraction, id: string): string | undefined {
+  const [value] = interaction.fields.getStringSelectValues(id);
+  return value;
+}
+
+/**
+ * The plan a submitted dialog asks for: the boss and the tier of the answer, everything else as
+ * the dialog says. Refuses what does not fit as the command does (a Pokébox for a member who has
+ * saved no Pokebattler id: the same sentence).
+ */
+async function dialogPlan(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  kept: KeptCounters,
+): Promise<CounterPlan> {
+  const entry = keptBoss(ctx, kept);
+  const { raidLevel, bosses } = pokebattlerTarget(entry, kept.tier);
+  const weather = picked(interaction, INPUTS.weather) ?? '';
+  const friendship = picked(interaction, INPUTS.friendship) ?? '';
+  if (!isCounterWeather(weather) || !isFriendship(friendship)) {
+    throw new UserError('Pick the weather and the friendship from their lists.');
+  }
+  const movesetText = picked(interaction, INPUTS.moveset) ?? AVERAGE_MOVESET;
+  const moveset =
+    movesetText === AVERAGE_MOVESET
+      ? undefined
+      : bossMovesets(ctx.gameData.catalogue, entry).find(
+          (each) => movesetValue(each) === movesetText,
+        );
+  if (movesetText !== AVERAGE_MOVESET && !moveset) {
+    throw new UserError('Pick the boss moves from their list.');
+  }
+  const attackers = await attackersOf(
+    picked(interaction, INPUTS.attackers) ?? null,
+    interaction.user.id,
+    ctx,
+  );
+  const also = new Set(interaction.fields.getCheckboxGroup(INPUTS.also));
+  return {
+    entry,
+    tier: kept.tier,
+    raidLevel,
+    bosses,
+    attackers,
+    weather,
+    friendship,
+    moveset,
+    shadow: also.has(ALSO.shadow),
+    mega: also.has(ALSO.mega),
+    single: also.has(ALSO.single),
+  };
+}
+
+/**
+ * What a submitted dialog asks for is refused here when it does not fit (options no longer kept,
+ * a Pokébox without a saved id, a boss moveset or a weather not of the lists), before the submit
+ * counts against the three of a minute: a refusal is no simulation.
+ */
+const requireDialogPlan: Guard = async (interaction, ctx) => {
+  if (!interaction.isModalSubmit()) return;
+  const id = decodeCustomId(interaction.customId);
+  if (id?.action !== COUNTERS_ACTIONS.dialog) return;
+  const kept = keptCounters.get(id.id);
+  if (!kept) throw new UserError(NOT_KEPT);
+  await dialogPlan(interaction, ctx, kept);
+};
+
+/**
+ * "Change options…" under an answer of `/counters` and its dialog (plan 8B-2; custom ids
+ * `counters:<token>:options` and `counters:<token>:dialog`, the token that of the answer's kept
+ * options, `keptCounters`). Anybody who sees an answer may open its dialog. A submitted dialog
+ * runs a new simulation (counted with the command's uses in `COUNTERS_THROTTLE`; opening the
+ * dialog is not counted, nor is a submit the guard refuses) and answers
+ * as `pressAnswer` says: the member who asked changes their public answer, anybody else gets a
+ * private copy; a Pokébox is shown privately only, and a public answer whose party has ended is
+ * never edited (its post is archived). The new answer keeps its own options under a new token;
+ * the old token stays good for its message. A failure is a private sentence.
+ */
+export const countersControls: ComponentHandler = {
+  kind: COUNTERS_KIND,
+  guards: [requireDialogPlan],
+  // A submit runs `/counters` again: it counts in the command's own window (Pokebattler's three
+  // a minute, command and submits together).
+  throttle: (_interaction, id) =>
+    id.action === COUNTERS_ACTIONS.dialog ? { ...COUNTERS_THROTTLE, as: 'counters' } : undefined,
+  async button(interaction, id, ctx) {
+    if (id.action !== COUNTERS_ACTIONS.options) throw new UserError(STALE_COMPONENT);
+    const kept = keptCounters.get(id.id);
+    if (!kept) throw new UserError(NOT_KEPT);
+    const entry = keptBoss(ctx, kept);
+    const hasBox = (await ctx.users.get(interaction.user.id)).pokebattlerId !== null;
+    await interaction.showModal(countersDialog(ctx, id.id, kept, entry, hasBox));
+  },
+  async modal(interaction, id, ctx) {
+    if (id.action !== COUNTERS_ACTIONS.dialog) throw new UserError(STALE_COMPONENT);
+    const kept = keptCounters.get(id.id);
+    if (!kept) throw new UserError(NOT_KEPT);
+    // Read again after the guard, which refused what does not fit before the use was counted.
+    const plan = await dialogPlan(interaction, ctx, kept);
+    const postGone = (): boolean =>
+      kept.partyId !== null && ctx.parties.get(kept.partyId) === undefined;
+    let how = pressAnswer(interaction, { onlyPrivate: plan.attackers.kind === 'box' });
+    if (how === 'update' && postGone()) how = 'copy';
+    await deferPress(interaction, how);
+    const simulated = await simulate(ctx, plan);
+    // The party may have ended while Pokebattler was asked: its archived post is left alone, and
+    // the answer is the member's.
+    const gone = how === 'update' && postGone();
+    const changed = how === 'update' && !gone;
+    const message = countersMessage(ctx, plan, simulated, {
+      guildId: serverOf(interaction),
+      askerId: changed ? kept.askerId : interaction.user.id,
+      partyId: changed ? kept.partyId : null,
+    });
+    if (gone) {
+      await interaction.followUp({
+        components: message.components,
+        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+      });
+      return;
+    }
+    await answerPress(interaction, how, message);
+  },
+};
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index 19965ac3c5ca005152060cd5cf0c368193127eff..f09f237918fe6a4d1c10b17298bd480c36ec1784 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -1,3 +1,4 @@
+import { randomBytes } from 'node:crypto';
 import {
   InteractionContextType,
   MessageFlags,
@@ -6,7 +7,9 @@ import {
   type ChatInputCommandInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
+import { BoundedMap } from '../../bounded-map.js';
 import type { Guard, LocatedInteraction, SimpleCommand } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { partyOf } from '../../discord/guards.js';
 import { v2Answer } from '../../discord/late-reply.js';
@@ -30,6 +33,7 @@ import {
   pokebattlerRaidLevel,
   WEATHER_NAMES,
   WEATHERS,
+  type AttackerLevel,
   type CounterAttackers,
   type CounterWeather,
   type Friendship,
@@ -80,7 +84,7 @@ function readTier(value: string): RaidTier {
 }
 
 /** Everything a use of `/counters` asks for, read before anything is sent. */
-interface CounterPlan {
+export interface CounterPlan {
   entry: PokemonEntry;
   tier: RaidTier;
   raidLevel: string;
@@ -95,7 +99,7 @@ interface CounterPlan {
 }
 
 /** The post of a party with a boss, where the boss and the tier need not be named. */
-function bossParty(interaction: LocatedInteraction, ctx: AppContext): Party | undefined {
+export function bossParty(interaction: LocatedInteraction, ctx: AppContext): Party | undefined {
   if (!interaction.inGuild()) return undefined;
   const party = partyOf(interaction, ctx);
   return party && (isRaid(party) || isTrain(party)) ? party : undefined;
@@ -170,7 +174,7 @@ function bossAndTier(
  * The boss's movesets: each fast move with each charged move, its elite moves among them (a
  * raid boss can have one: Mewtwo with Psystrike), those without elite moves first.
  */
-function bossMovesets(
+export function bossMovesets(
   catalogue: PokemonCatalogue,
   entry: PokemonEntry,
 ): { fast: Move; charged: Move }[] {
@@ -193,7 +197,7 @@ function bossMovesets(
 export const movesetValue = (moveset: { fast: Move; charged: Move }): string =>
   `${moveset.fast.id}/${moveset.charged.id}`;
 
-const movesetName = (moveset: { fast: Move; charged: Move }): string =>
+export const movesetName = (moveset: { fast: Move; charged: Move }): string =>
   `${moveset.fast.name} / ${moveset.charged.name}`;
 
 /** The boss moveset asked for: a choice of the list (`FAST/CHARGED`), or the moves typed. */
@@ -218,7 +222,7 @@ function chosenMoveset(
 }
 
 /** Where the attackers come from: a level, or the member's Pokébox. */
-async function attackersOf(
+export async function attackersOf(
   level: string | null,
   userId: string,
   ctx: AppContext,
@@ -238,11 +242,15 @@ async function attackersOf(
   return { kind: 'level', level };
 }
 
-async function readPlan(
-  interaction: ChatInputCommandInteraction,
-  ctx: AppContext,
-): Promise<CounterPlan> {
-  const { entry, tier, fromPost } = bossAndTier(interaction, ctx);
+/**
+ * What Pokebattler is asked about for a boss in a tier: its raid level and the names it may know
+ * the boss by; refused with a sentence where it has none. `fromPost`: the tier was the post's.
+ */
+export function pokebattlerTarget(
+  entry: PokemonEntry,
+  tier: RaidTier,
+  fromPost = false,
+): { raidLevel: string; bosses: string[] } {
   const raidLevel = pokebattlerRaidLevel(tier);
   if (raidLevel === undefined) {
     throw new UserError(`Pokebattler simulates no ${raidTierLabel(tier)} raids.`);
@@ -256,6 +264,15 @@ async function readPlan(
           : ''),
     );
   }
+  return { raidLevel, bosses };
+}
+
+async function readPlan(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Promise<CounterPlan> {
+  const { entry, tier, fromPost } = bossAndTier(interaction, ctx);
+  const { raidLevel, bosses } = pokebattlerTarget(entry, tier, fromPost);
   const moveset = chosenMoveset(
     ctx.gameData.catalogue,
     entry,
@@ -395,7 +412,7 @@ function bossWhileTyping(
 }
 
 /** The server whose emoji an answer may show, by the interaction's own id; none in a DM. */
-const serverOf = (interaction: LocatedInteraction): string | null =>
+export const serverOf = (interaction: LocatedInteraction): string | null =>
   interaction.inGuild() ? interaction.guildId : null;
 
 /** What Pokebattler answered for a plan: the counters against the boss moveset asked for. */
@@ -409,7 +426,7 @@ interface Simulated {
  * Asks Pokebattler for a plan; a failure, or an answer without the boss moveset asked for, is
  * refused with a sentence (`failureText`). The command and the dialog of an answer both run it.
  */
-async function simulate(ctx: AppContext, plan: CounterPlan): Promise<Simulated> {
+export async function simulate(ctx: AppContext, plan: CounterPlan): Promise<Simulated> {
   const outcome = await ctx.pokebattler.counters({
     bosses: plan.bosses,
     raidLevel: plan.raidLevel,
@@ -424,18 +441,116 @@ async function simulate(ctx: AppContext, plan: CounterPlan): Promise<Simulated>
   };
 }
 
+/** The custom-id kind of "Change options…" under an answer and of its dialog. */
+export const COUNTERS_KIND = 'counters';
+/** `counters:<token>:options` opens the dialog, which is `counters:<token>:dialog`. */
+export const COUNTERS_ACTIONS = { options: 'options', dialog: 'dialog' } as const;
+
+/** How long the options of an answer are kept for its "Change options…": a day (Matt). */
+export const COUNTERS_KEEP_MS = 24 * 60 * 60_000;
+/**
+ * At most so many answers' options are kept, the oldest going first: a few hundred bytes each,
+ * a few megabytes in all, far more answers than a day brings.
+ */
+export const COUNTERS_KEPT_MAX = 5_000;
+
+/**
+ * The options of an answer, kept for its dialog: everything its plan was made of but the
+ * member's Pokébox number (read anew when the dialog is sent with the Pokébox), who asked, and
+ * the party whose post a public answer stands in.
+ */
+export interface KeptCounters {
+  bossKey: string;
+  tier: RaidTier;
+  attackers: { kind: 'level'; level: AttackerLevel } | { kind: 'box' };
+  weather: CounterWeather;
+  friendship: Friendship;
+  /** The boss moveset's move ids; null for the average of all. */
+  moveset: { fast: string; charged: string } | null;
+  shadow: boolean;
+  mega: boolean;
+  single: boolean;
+  askerId: string;
+  /** The party of the post a public answer stands in; null for a private answer. */
+  partyId: string | null;
+}
+
+/**
+ * The options of answers by the token of their custom ids, for a day and at most `max` of them
+ * (`BoundedMap`, oldest out); kept in memory only, so a restart forgets them.
+ */
+export class KeptCounterOptions {
+  private readonly kept: BoundedMap<string, { value: KeptCounters; expires: number }>;
+
+  constructor(private readonly options: { ttlMs?: number; max?: number; now?: () => number } = {}) {
+    this.kept = new BoundedMap(options.max ?? COUNTERS_KEPT_MAX);
+  }
+
+  private now(): number {
+    return this.options.now?.() ?? Date.now();
+  }
+
+  /** Keeps the options of an answer and gives the token of its custom ids. */
+  keep(value: KeptCounters): string {
+    const now = this.now();
+    this.kept.dropWhile((entry) => entry.expires <= now);
+    const token = randomBytes(8).toString('hex');
+    this.kept.set(token, { value, expires: now + (this.options.ttlMs ?? COUNTERS_KEEP_MS) });
+    return token;
+  }
+
+  /** The options kept under a token; undefined once they are gone (a day, a restart). */
+  get(token: string): KeptCounters | undefined {
+    const entry = this.kept.get(token);
+    if (!entry || entry.expires <= this.now()) return undefined;
+    return entry.value;
+  }
+}
+
+/** The options of the answers of this process. */
+export const keptCounters = new KeptCounterOptions();
+
+/** Where an answer goes: the server (for its emoji), who asked, its post. */
+export interface AnswerPlace {
+  guildId: string | null;
+  askerId: string;
+  /** The party whose post a public answer stands in; null for a private answer. */
+  partyId: string | null;
+}
+
 /**
  * The answer for a plan that Pokebattler simulated: the boss's picture, the counters with their
  * moves' types as emoji where the server or the application has them, and
- * "Change options…" with `optionsId` when there is one.
+ * "Change options…", whose options are kept (`keptCounters`) under a new token.
  */
-function countersMessage(
+export function countersMessage(
   ctx: AppContext,
   plan: CounterPlan,
   simulated: Simulated,
-  guildId: string | null,
-  optionsId?: string,
+  place: AnswerPlace,
 ): V2Message {
+  const token = keptCounters.keep({
+    bossKey: plan.entry.key,
+    tier: plan.tier,
+    attackers:
+      plan.attackers.kind === 'box'
+        ? { kind: 'box' }
+        : { kind: 'level', level: plan.attackers.level },
+    weather: plan.weather,
+    friendship: plan.friendship,
+    moveset: plan.moveset ? { fast: plan.moveset.fast.id, charged: plan.moveset.charged.id } : null,
+    shadow: plan.shadow,
+    mega: plan.mega,
+    single: plan.single,
+    askerId: place.askerId,
+    partyId: place.partyId,
+  });
+  const optionsId = encodeCustomId({
+    kind: COUNTERS_KIND,
+    id: token,
+    action: COUNTERS_ACTIONS.options,
+  });
+  const { guildId } = place;
   const catalogue = ctx.gameData.catalogue;
   const feedImage = ctx.raidBosses
     .bosses()
@@ -552,7 +667,10 @@ export const counters: SimpleCommand = {
       'friends, and leaves out shadow Pokémon and megas. `level` can also be your own Pokébox ' +
       'on Pokebattler (save your user id with `/settings pokebattler-id`); that answer is ' +
       'always for you alone. A Pokébox lists its shadow Pokémon and megas too, unless ' +
-      '`shadow` or `mega` is False.',
+      '`shadow` or `mega` is False. "Change options…" under an answer opens a dialog with ' +
+      'its attackers, weather, friendship, boss moves and what else to list: the member who ' +
+      'asked changes the answer for everybody, anybody else gets an answer of their own. The ' +
+      'options of an answer are kept for a day.',
     examples: [
       '/counters',
       '/counters boss:Mewtwo',
@@ -569,12 +687,17 @@ export const counters: SimpleCommand = {
   async execute(interaction, ctx) {
     const party = bossParty(interaction, ctx);
     const plan = await readPlan(interaction, ctx);
-    const message = countersMessage(ctx, plan, await simulate(ctx, plan), serverOf(interaction));
+    const simulated = await simulate(ctx, plan);
     // The answer in a post is public; the party may have ended while Pokebattler was asked, and
     // anything sent or edited in its archived post would open it again: the answer is then the
     // member's alone, after the public "thinking…" is deleted (as the router does for an error).
     const postGone =
       interaction.ephemeral === false && (!party || ctx.parties.get(party.id) === undefined);
+    const message = countersMessage(ctx, plan, simulated, {
+      guildId: serverOf(interaction),
+      askerId: interaction.user.id,
+      partyId: interaction.ephemeral === false && !postGone && party ? party.id : null,
+    });
     if (postGone) {
       await interaction.deleteReply();
       await interaction.followUp({
diff --git a/src/components/index.ts b/src/components/index.ts
index 5b8f1f2832d42c45db50b9150cfdf71c7e5a69f1..a9b6a0df8458791a2da86e839a946acd1041fb70 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -10,6 +10,7 @@ import { wantControls, wantListControls } from '../commands/notifications/wants.
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import { roleControls } from '../commands/roles/menus.js';
+import { countersControls } from '../commands/util/counters-dialog.js';
 import { helpControls } from '../commands/util/help.js';
 import { rankControls } from '../commands/util/rank.js';
 import { screenshotControls } from '../commands/screenshots/feedback.js';
@@ -35,4 +36,5 @@ export const components: readonly ComponentHandler[] = [
   screenshotControls,
   rankControls,
   helpControls,
+  countersControls,
 ];
````

### Task 6: CLAUDE.md conventions for plan 8B-2, and its staging checklist

Prototype commit: `c080ebfba59f63cba564fbd96e8787138fb33518`

CLAUDE.md: the controls of a public answer (pressAnswer, deferPress,
answerPress; who asked by interactionMetadata), a component throttle as a
function, a limit shared with a command's window (`as`: the dialog of
/counters and the command count together) and a control's refusals in a
guard so they do not count, the fakes' strict forms (checkModal, the
submitted form as discord.js reads it, `form`), the fake gateway's rows
and menus (checkMenu), ctx.emoji by the server's id, the answer of
/counters with its kept options and dialog (kind `counters`), /rank's
answer and buttons (kind `rank`), /help's pages and controls (kind `help`,
back one level). The custom-id kinds are also described in custom-id.ts.

docs/superpowers/plans/2026-10-15-phase-8b2-staging.md: the staging
checklist (no registration: no command definition changed, only help
texts; no migration): also the shared limit of command and submits, a
boss with more than 24 movesets in the dialog, "Full results" following
a change, a private answer changed in place, the dialog on the phone app,
and `/help command:admin boss add`. Left open for the follow-ups: link
buttons without "↗", and whether every client shows the checkbox group.

**Files:**

```
 CLAUDE.md                                              | 17 +++++++++--------
 docs/superpowers/plans/2026-10-15-phase-8b2-staging.md | 24 ++++++++++++++++++++++++
 src/discord/custom-id.ts                               | 16 ++++++++++++++++
 3 files changed, 49 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  no test files of its own); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff c080ebfba59f63cba564fbd96e8787138fb33518 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `CLAUDE.md conventions for plan 8B-2, and its staging checklist`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/superpowers/plans/2026-10-15-phase-8b2-staging.md src/discord/custom-id.ts`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 3b082a1dcaeabb033f6c0e681e5e26af75acfef5..f1803c24a1ccd05586f610f973d49b96ccb77c4e 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -62,11 +62,12 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Every slash command is a `CommandModule` listed in `src/commands/index.ts`; the router and the deploy script both read that list. A command with another name is listed under both: `alsoAs(command, name)` (`src/discord/command.ts`; `/hmm` of `/interested`, `/coming` of `/join`) gives the same guards, handlers, throttle and help under another name, and a short form (`/little`, `/great`, `/ultra`, `/master`: `/rank` in that league) is a command of its own with `formOf`. The uses of a form count as the command's (the router's throttle key), "You can use /x again" names the name typed, and `/help` lists a form beside the command's name on its line and explains it as the command's.
 - A command with subcommands is built with `commandGroup({ data, help, guards, groups, parts })` (`src/discord/command-group.ts`): each part carries its own subcommand builder, `guards`, `execute` and `autocomplete`. The router refuses to start when the definition and the handlers differ. Command guards run before the subcommand's.
 - The router's order is guards, throttle, deferral, `execute`. A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
-- Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`.
+- Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog, not the button that opens it. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`component:<kind>`), as `/rank`'s and `/help`'s do. What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
+- A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - Where an interaction came from is read only through `channelContext(interaction)` (`src/discord/channel-context.ts`): a thread or forum post is judged by the channel it is in (`baseChannelId`), and a DM is `!interaction.inGuild()`, never the channel cache. `regionChannelOf(interaction, ctx)` gives the region channel or undefined. Both also take an autocomplete interaction (`LocatedInteraction`).
 - Commands are offered in servers only, and for server installs only, unless the definition sets its own `contexts` (`/help` adds the bot DM). A command that depends on a setting has `enabled(config)`; `enabledCommands()` filters the list for the router, `/help` and the deploy script alike.
 - Staff commands (those with `default_member_permissions`) are hidden from other members in `/help`, its autocomplete and its error texts.
-- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
+- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options and checkbox groups of 1 to 10, values unique, `min_values` / `max_values` within the options, no more defaults than may be chosen). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus) and `checked` (checkbox groups, `fields.getCheckboxGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`), needs a value for a required menu and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
 - A `DiscordAPIError` logged as `{ err }` has its `url` and `requestBody` redacted (the address of an interaction reply contains its token). Log errors under the key `err`.
 - `src/db/types.ts` and `src/db/baseline/legacy-schema.ts` are generated. Do not hand-edit them.
 - The migrator accepts only a fully migrated legacy database (takeover) or an empty schema (new install) and refuses anything else without writing to it.
@@ -101,7 +102,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
 - What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`). A party's post is a components-v2 message (Matt, 2026-10-15): the renderer lays it out (`PostLayout`: an accent colour, a picture, blocks of text, sections with the picture or a button beside them, rows of buttons) and `postMessage(layout, variant)` (`src/render/party-post.ts`) makes it one container; `rendered.message` is `postMessage(layout)`, the whole message and the only place its parts are put together, and its other forms are variants of the layout (`picture: false` when Discord refuses the picture, `controls: false` for the last showing of an ended party, `move: false` and `lead` for a copy), never edits of the component tree. `rendered.brief` (`PartyBrief`: the post's accent and picture, a few of its lines, a raid's map address) is what a direct message shows of the party, made by the renderer that makes the post, so a line the post shows is worded once (`PartyService.briefOf`; plan 8B-1: the embed card and `party-card.ts` are gone). Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as is the heading of the boss block ("Hatches as Yveltal"), said once. A raid is called as the legacy bot called it (`raidWords`: "Level 5 raid", "Shadow Level 3 raid"; the titles of posts and their tags keep `T5`), and the statuses are Interested, Coming, Present and Complete. A message holds at most `MAX_COMPONENTS` (40, every nested component counted) and its text displays at most `TEXT_BUDGET` (4,000, assumed: Discord documents no total) less the room of a copy's line (`LEAD_ROOM`): `fittedLayout(build)` gives `build` a `Fit`: every list of members goes through `fit.list` and is cut down with the others when the post is too long (`fitLists`, "…and N more"), and as a last resort the other texts that can be long (a group's label, a gym's notes, where a train is, its route) go through `fit.part(room => …)` and are cut (`cutText`, "…"). A copy's line (`lead`) opens the post's first text, never a component of its own. The worst case of each kind, with every text needing escapes, is tested with every copy (`expectSendable`, `test/support/post-limits.ts`).
-- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, https thumbnails; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `customIdsOf`, `accentOf`, `thumbnailOf`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, https thumbnails, buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `customIdsOf`, `accentOf`, `thumbnailOf`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
@@ -133,7 +134,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`), otherwise "This has ended."
 - A command's `throttle` may be a function of the interaction (`/meet`: 3 per 180 seconds in a timed party); a use that a guard refused does not count, so what can be known before the work (a bad name, no region, an unreadable time) is refused by a guard that reads the options (`/meetup`, `/meet`), and `execute` keeps its own checks.
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS`, `inShownOrder`), the components in `src/render/v2.ts`; `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut; what a post says about a gym under "Location Information" (`locationBlock`).
-- Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary` (`test/support/messages.ts`).
+- Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - The maker of a train is signed up as their auto-status says (None: not at all; Here counts as Coming), and with privacy Anonymous neither the post nor the new-train DM names them (`NewTrain.anonymous`, `autoStatus`). A maker who is not signed up may still arrange the route and the times as far as the train does not move (`mayArrange`, `party.ts`); moving it and being its conductor need a sign-up. Meetups know neither setting.
 - A raid train is the third kind (`TrainParty`: `timed` like a meetup, and `train: { route, stop, conductorId, boss, finishedFrom }`). `isTrain`, the guards `requireTrain` (with `commandTrain`, `trainOf`) and `requireRaidOrTrain` (what has a boss or a gym: `/boss`, `/where`); `bossOf(party)` is the boss of any party that has one. `route` is gym ids, none twice, at most `MAX_ROUTE_STOPS`; `stop === route.length` on a route that is not empty means finished; `party.gymId` is null (the gym of a train is `currentStop(party)`). It has groups like a raid and one start like a meetup; Done means leave, and whoever leaves as the conductor stops being it.
@@ -160,7 +161,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn`, `normal` (raid wants, gym targets, new trains), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`).
 - Who of many members is in a server and can see a channel is `ctx.members.viewers(guildId, channelId, userIds)`: batches of 99 (and the bot itself, whose absence from an answer means the answer is no answer) through the gateway's request for members by user id, one request a second and thirty a minute at most (`MEMBER_REQUEST_BUDGET`), single REST look-ups when it fails and a rest that doubles up to six hours (`GatewayWithFallback`); "sees" is kept ten minutes, "does not" one (`src/discord/member-viewers.ts`). `FakeMemberDirectory` has `viewers`, `holding`, and members who are not there or cannot see.
 - Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated`, `meetingTimeChanged`, `startTimeChanged`, `spawnReported`. Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
-- Emoji are looked for by name (`PartyService.emoji`): the bot's application's first (`ApplicationEmoji`, `src/services/application-emoji.ts`, read after the connection and with the hourly upkeep; a failed read keeps the last list; a read that finds other emoji has every active post shown anew, one party every `EMOJI_RENDER_GAP_MS`, `PartyService.emojiChanged`; `flush` drops what still waits, and after `close`, which shutdown calls instead of `flush`, nothing is shown anew), then the forum's server's, then characters, or words for types and weather. The names are the legacy server names (`src/domain/pogo/game-icons.ts`: the 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`; the game master's clear weather shows `sunny`); `PostEmoji.icon(name)` gives one or undefined. `npm run emoji:upload` (`scripts/emoji/`) makes them from PokeMiners' pogo_assets at a pinned commit, an icon that fails said in a line (Discord's status and code only, `failureReason`) while the others go on, a count at the end and a non-zero exit when anything failed; it is never run by tests. A command's other forms are named with it in the role-authorization export (`scripts/role-auth/report.ts`): Discord sets each by itself.
+- Emoji are looked for by name (`PartyService.emoji`): the bot's application's first (`ApplicationEmoji`, `src/services/application-emoji.ts`, read after the connection and with the hourly upkeep; a failed read keeps the last list; a read that finds other emoji has every active post shown anew, one party every `EMOJI_RENDER_GAP_MS`, `PartyService.emojiChanged`; `flush` drops what still waits, and after `close`, which shutdown calls instead of `flush`, nothing is shown anew), then the forum's server's, then characters, or words for types and weather. The names are the legacy server names (`src/domain/pogo/game-icons.ts`: the 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`; the game master's clear weather shows `sunny`); `PostEmoji.icon(name)` gives one or undefined. An answer that is no post finds them the same way through `ctx.emoji` (`EmojiFinder`, `emojiFinder` in `src/services/application-emoji.ts`: `find(name, guildId)`, the application's first, then the server's by the interaction's own server id (`DiscordApplicationEmoji.inServer`, from the cache of servers, not through a channel), none of a server in a DM; the test context finds none). `npm run emoji:upload` (`scripts/emoji/`) makes them from PokeMiners' pogo_assets at a pinned commit, an icon that fails said in a line (Discord's status and code only, `failureReason`) while the others go on, a count at the end and a non-zero exit when anything failed; it is never run by tests. A command's other forms are named with it in the role-authorization export (`scripts/role-auth/report.ts`): Discord sets each by itself.
 - A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 - A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild`: a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning); a message Discord refuses with Invalid Form Body is sent once more without its picture (the Unown copy too), and the DM says when the report goes away as the report does (`SpawnNews.goneAt`); deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
@@ -189,11 +190,11 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - `/bounds` is a members' command (the picture and the gym count of the region of the channel). Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
 - Staff change the raid boss list only through `ctx.raidBossAdmin` (`RaidBossService` as `RaidBossAdmin`: overrides, `feedBosses()`, `sync()`; override writes and the end of a sync run one at a time). A sync's change is `FeedChange` with `seen`, the difference of `effectiveBosses` before and after with the same overrides (`diffBosses`, `src/domain/pogo/boss-diff.ts`): what members see. `RaidBossAnnouncer` posts `seen` in every server's bot-updates channel when `settings.raidBosses.announceChanges`, and the out-of-date warning (time, never the error) in the moderators' channel; nothing before `ready()`, nothing after `close()`. A failed sync has a `kind` (never show `reason`). A new autoset for a tier replaces the tier's earlier one. A boss the game data does not know has a key starting with `UNKNOWN_KEY_PREFIX` (`~`), never equal to a catalogue key and never stored; `howIdentified` says how a feed boss was matched.
 - Pokémon nicknames change only through `ctx.nicknames` (`PokemonSearchService`: changes and reloads one at a time; `nicknameProblem` in `src/domain/pogo/nickname-rules.ts` refuses words other commands read, names and nicknames of other Pokémon; removal from every legacy row of the Pokémon; the column stays `, `-joined lower case).
-- PvP ranks are pure (`src/domain/pvp/rank.ts`: CP multipliers of the game master, whole levels `Math.fround`ed, half levels by the legacy formula; the product computed as `m*m*((A+a)*(D+d)*hp)` so equal integers tie; competition ranking by product, IV sum, CP; caps 50 and 51, the second shown only when rank or best IVs differ). `PokemonEntry.evolutions` holds the direct evolutions from the game master (megas left out; a species entry without its own branch takes its forms'); `catalogue.evolutionLine(entry)` is the Pokémon and what it evolves into. `GAME_DATA_VERSION` 5.
+- PvP ranks are pure (`src/domain/pvp/rank.ts`: CP multipliers of the game master, whole levels `Math.fround`ed, half levels by the legacy formula; the product computed as `m*m*((A+a)*(D+d)*hp)` so equal integers tie; competition ranking by product, IV sum, CP; caps 50 and 51, the second shown only when rank or best IVs differ). `PokemonEntry.evolutions` holds the direct evolutions from the game master (megas left out; a species entry without its own branch takes its forms'); `catalogue.evolutionLine(entry)` is the Pokémon and what it evolves into. `GAME_DATA_VERSION` 5. The answer of `/rank` and its short forms is a public components-v2 message (`renderRank`, `src/render/pvp-rank.ts`; plan 8B-2) with the leagues' buttons, the evolution line's and a link to pvpivs.com; the buttons keep everything in their custom ids (kind `rank`, `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>`, nothing in memory; `rankControls` reads the Pokémon from the game data anew and ranks with the command's `rankAnswer`), and answer by `pressAnswer`, with no guard of the PvP channel.
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
-- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`src/domain/geo/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again.
+- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`src/domain/geo/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `simulate` and `countersMessage` (a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), and the guard `requireDialogPlan` refuses what does not fit before it is counted.
 - `settings.regionMapLink` (blank is unset) enables `/maps`. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
-- `/help command:<command> <group>` lists a group's subcommands; a command's overview shows a group as one line.
+- `/help` answers with components-v2 pages for the member alone (`src/commands/util/help-render.ts`, plan 8B-2): the overview (each group with its commands' names, a command's other forms beside it, and the menu "Show a group…"), a group (a line per command with what it does, "Details of a command…" in one or two menus, "◀ All groups"), a command (what it does, **Usage**, **Examples**, "◀ <its group>", "All groups", and for a command with groups of subcommands "Subcommands of a group…"); `/help command:<command> <group>` and a subcommand's page lead one level up ("◀ /admin"; a subcommand of a group to its group, "◀ /admin boss"). The controls are the kind `help` (`help:overview:group`, `help:group:<category>:command|more|overview`, `help:command:<path>:back|overview|subgroup`; the id is the kind of page, the action which page, the first argument what the control does) and `update` the page; who is staff is asked anew with every press, and a staff page is answered as one that does not exist; `MEMBER_READ_THROTTLE`.
 - Screenshots are read through `ScreenshotReader` (`OcrService`, `src/services/ocr-service.ts`): `read(bytes, { onQueued })` never throws and answers `read` (with the `ScreenReading`), `not-an-image`, `failed`, `busy` (beyond `settings.ocr.queue`; `full()` says so beforehand, and `ScreenshotService` asks it before it downloads) or `unavailable`; more than `MAX_SCREENSHOT_BYTES` is no image. It reads in a child process (`src/ocr/worker.ts`, protocol in `src/ocr/protocol.ts`): forked on first use with a minimal environment (`workerEnvironment`: exact names, none of the bot's secrets), lowered priority (every thread on Linux), one screenshot at a time, killed after `ocr.timeoutSeconds`, ended after ten minutes idle; it answers `received` first, and only a process that died before that is given the screenshot again. A start that fails is not tried again for ten minutes; a device the platform lacks (`deviceProblem`) is refused once. `close()` at shutdown leaves no process behind. The bot's own process never decodes an image (it imports `sharp` as a type only). Tests use the fake worker `test/support/ocr-worker.ts`; only `npm run ocr:check` runs the real models.
 - The model files and the game's head icon (`OCR_ASSETS`, `src/domain/ocr/assets.ts`) are downloaded into `var/ocr/` by `OcrAssets` (`src/services/ocr-assets.ts`) and checked by size and SHA-256 before every start of the reading process; a file that differs is downloaded again, a download that still differs is refused. A new model version is a change of that list, measured with `ocr:check` first.
 - What the reader does with an image is pure (`src/domain/ocr/`): `text-model.ts` (detector boxes, CTC decoding, lines; caps `DETECTOR_PIXELS`, `MAX_LINE_WIDTH`), `raid-screen.ts` (the elements found from the text and its boxes, no fixed layout; the clock read again from the status bar; `clockIn`'s rules), `tier-heads.ts` (masked template matching against the game's icon), `shadow.ts` (the purple). Images are PNG, JPEG or WebP by their first bytes, at most `MAX_PIXELS`, of a screen's proportions (`src/ocr/screen-reader.ts`). Nothing the reader saw is logged.
diff --git a/docs/superpowers/plans/2026-10-15-phase-8b2-staging.md b/docs/superpowers/plans/2026-10-15-phase-8b2-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..fb2e58d39f6eab7091e2e20880efd07ed40152c4
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-15-phase-8b2-staging.md
@@ -0,0 +1,24 @@
+# Phase 8B-2: staging checklist
+
+The text for the end of the 8B-2 plan. Each step with Matt's go-ahead, on the test server, with the dev application and both accounts (Matt's own and Googer's).
+
+1. **No registration:** no command definition changed (only the help texts of `/counters` and `/help`, which the bot keeps), and there is no migration. Start the bot (Matt, in a terminal). The type emoji uploaded in 8A (`npm run emoji:upload -- --apply`) should be there for step 2.
+2. **`/counters` in a raid's post** (Matt; a T5 raid with a boss Pokebattler knows): one public container in green, `### Counters for <boss>`, "Level 5 raid · boss moves: the average of all its movesets", "About **N trainers** with the best counters" beside the boss's picture; twelve counters, each `` `#01` **Name** · 141s · 1.2 deaths · 2.8 trainers`` with its moves in small print under it, each move with its type's emoji (words in brackets where an emoji is missing), `†` on a legacy move; the small print "Attackers at level 40 · no weather · best friends · no shadow Pokémon or megas" (and "† a legacy move" where one is listed); the buttons "⚙️ Change options…" and "Full results" (opens Pokebattler's page); "Data provided by Pokebattler". On the phone too: does the list read well at that width?
+3. **Change options… by the asker** (Matt, on that answer): the dialog opens at once, titled "Counters for <boss>", with Attackers, Weather, Friendship, Boss moves and "Also list" (checkboxes), each set as the answer was. Pick level 50, windy, great friends, a moveset of the boss and tick Shadow Pokémon: the public answer changes in its place for everybody (Googer sees the change), with the new small print and boss moves, and "Full results" now opens Pokebattler's page for the new options (level 50, windy, great friends). Open the dialog again on the changed answer: it shows the new choices. Do the same on the phone app: the dialog, its menus and the checkboxes of "Also list" (note what the phone shows of the checkbox group).
+4. **Change options… by somebody else** (Googer, on Matt's public answer): the dialog opens with the answer's choices; submit something else: Googer gets a private answer of their own, and the public answer stays as it was (Matt sees no change). Googer's private answer has its own "Change options…", which changes that private answer in its place.
+5. **The limit:** `/counters` once and three submits within a minute by one account: the fourth use (a submit or the command) says "You can use /counters again in …" (command and submits share the three a minute); opening the dialog is never refused for that, and a submit that is refused (a Pokébox without a saved id) does not count.
+6. **A boss with many movesets** (a `/counters boss:Mew tier:T5`, or any boss with more than 24 movesets): "Boss moves" lists 25 options (the average and 24 movesets); pick the last one with `/counters moveset:` first, then open the dialog: that moveset is selected and among the 25.
+7. **A private answer in an ordinary channel** (Googer, `/counters boss:<boss>` in a region channel): "Change options…" by Googer changes that private answer in its place (no second answer).
+8. **A Pokébox** (Googer, with `/settings pokebattler-id` saved): in the bot's DM, `/counters boss:<boss> level:My Pokébox on Pokebattler`: a private answer, "with your best counters", nicknames and CP in the lines, "Your Pokébox on Pokebattler" in the small print, and the user number nowhere in the text. Its dialog offers "My Pokébox on Pokebattler", selected; a change updates the DM answer in its place. In a raid's post, Matt (with an id saved) picks the Pokébox in the dialog of his public answer: he gets a private answer, the public one stays. A member without an id sees no Pokébox in the dialog.
+9. **A token that is gone:** restart the bot, then press "Change options…" on an answer from before: "These options are no longer kept. Use `/counters` again." privately.
+10. **A raid that ends:** a public answer in a post whose raid then ends (`/delete`, or wait): "Change options…" on it gives a private answer, and the archived post stays archived (not reopened).
+11. **`/rank` and `/great`** (in the PvP category and in a DM): one public container in the gold, silver, bronze or blue of the rank, `### Medicham 0/15/15`, "Great League", "**Rank 1** of 4,096 · 100.00%" beside the picture; "**Up to level 50**" with the CP, level and stats on one line and "Best: …" in small print, "**Up to level 51 (best buddy)** · rank …" where that differs, otherwise "Up to level 50 · the same rank up to 51"; a filter in small print. The buttons: Little, Great (pressed and greyed), Ultra, Master; "Evolution line" and "pvpivs.com" (opens the site).
+12. **The buttons of a rank answer:** Matt (who asked) presses Ultra: the answer changes for everybody, Ultra now pressed. Googer presses Master on Matt's answer: Googer gets a private copy in Master League, Matt's answer stays in Ultra. "Evolution line" shows the line ("Hide evolution line" hides it again); try a Pokémon with a long line (Eevee in Master League) and one that does not evolve. The buttons ask for no PvP channel: they work wherever their answer stands.
+13. **`/help`** (Googer, an ordinary member): a private container, "### Professor Pine commands", one block per group with its commands' names (`/rank` `/little` `/great` `/ultra` `/master` on one entry), no staff groups, and "Show a group…". Pick a group: its page replaces the overview ("### Raid Basics", "N commands", a line per command with what it does, "Details of a command…", "◀ All groups"). Pick a command: its page ("### /raid", what it does, **Usage**, **Examples**, "◀ Raid Basics", "All groups"); "◀ Raid Basics" goes back to the group, "All groups" to the overview.
+14. **`/help` for staff** (Matt): the overview also has the staff groups. `/help command:admin`: the page with "Subcommands of a group…"; pick `boss`: "### /admin boss" with its subcommands and "◀ /admin", which leads back. `/help command:admin boss` gives the same page directly; `/help command:route add` has "◀ /route"; `/help command:admin boss add` has "◀ /admin boss", which opens the group's page.
+15. **`/help` in a DM** (Googer, in the bot's DM): the overview and the pages work as in the server; no staff groups (nobody but the owner is staff in a DM). Googer typing `/help command:admin`: "There is no /admin command."
+
+## Left open (for the follow-ups)
+
+- **Link buttons have no `↗` in their labels** ("Full results", "pvpivs.com"): Discord draws its own sign on every link button. Staging shows whether that reads as the draft meant.
+- **The modal's checkbox group** (`CheckboxGroup`, type 22) is new in Discord; whether every client shows it (the phone app, an older desktop) is for staging to show. Where a client cannot show it, the dialog would need a select of several values instead.
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index f66a6f7bdd4b1040ad8fcf6c2cef69d8922907c7..8b2e99c45c40d625794c0fc8c695cd25835b999e 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -46,6 +46,22 @@
  * `wantlist:<page>:remove:<what>`, where `<what>` is spelled as for the stop buttons of a DM
  * (`stopArgs`: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`, `ts:<level>`, `iv:…`, `g:<gym id>`).
  * Nothing about a list is kept anywhere: a press reads the member's list anew.
+ *
+ * The buttons under an answer of `/rank` have the kind `rank`, the Pokémon's catalogue key as the
+ * id, and everything the ranking they show is made of as the rest:
+ * `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>` (the last: the evolution line shown).
+ * Nothing is kept anywhere else (`rankButtonId`, `src/render/pvp-rank.ts`).
+ *
+ * The controls of a page of `/help` have the kind `help`; the id is the kind of page they are on
+ * (`overview`, `group`, `command`), the action which page (a category, a command's path), and
+ * the first argument what the control does: `help:overview:group` (the menu of groups),
+ * `help:group:<category>:command` and `…:more` (the menus of a group's commands),
+ * `help:group:<category>:overview`, `help:command:<path>:back`, `…:overview` and `…:subgroup`
+ * (`HELP_PAGES`, `src/commands/util/help-render.ts`).
+ *
+ * "Change options…" under an answer of `/counters` is `counters:<token>:options`, and the dialog
+ * it opens `counters:<token>:dialog`: the token is that of the answer's options, kept for a day
+ * (`keptCounters`, `src/commands/util/counters.ts`).
  */
 export const MAX_CUSTOM_ID_LENGTH = 100;
 const SEPARATOR = ':';
````

### Task 7: A read-screenshot test fakes the time it is read at

Prototype commit: `8b389a3c9ce3a82a7ed6bc06069b1fa6f7f84e76`

Found while running the check of the 8B-2 fix wave in the afternoon: the
first test of /read-screenshot reads an egg whose screenshot clock says
1:39 and that hatches ten minutes later, at the real time of the run, so
from about 2:34 pm (New York) on the raid is over and the test failed (it
passed in the morning). The test now reads it at 1:41 pm of the day it
runs, with only Date faked (CLAUDE.md: a test whose handler reads
Date.now() fakes Date). Not part of 8B-2; kept as a commit of its own so
that it can be taken or left.

**Files:**

```
 src/commands/screenshots/read-screenshot.test.ts | 14 +++++++++++++-
 1 file changed, 13 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/screenshots/read-screenshot.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 8b389a3c9ce3a82a7ed6bc06069b1fa6f7f84e76 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `A read-screenshot test fakes the time it is read at`, the body above and the trailer, staging exactly
  `src/commands/screenshots/read-screenshot.test.ts`.

````diff
diff --git a/src/commands/screenshots/read-screenshot.test.ts b/src/commands/screenshots/read-screenshot.test.ts
index 373db353a2a7502e2ecafccdd9ad594dbec4113e..13c22e775e48d1cac58ada933140cdd21fddee4e 100644
--- a/src/commands/screenshots/read-screenshot.test.ts
+++ b/src/commands/screenshots/read-screenshot.test.ts
@@ -1,6 +1,7 @@
 import { readFileSync, rmSync } from 'node:fs';
 import path from 'node:path';
-import { describe, expect, it } from 'vitest';
+import { DateTime } from 'luxon';
+import { afterEach, describe, expect, it, vi } from 'vitest';
 import {
   fakeButton,
   fakeChatInput,
@@ -56,13 +57,24 @@ function shownId(payload: { components?: readonly unknown[] }): string {
   return id;
 }
 
+afterEach(() => {
+  vi.useRealTimers();
+});
+
 describe('/read-screenshot', () => {
   it('shows what was read and what it makes of it, and creates nothing', async () => {
+    // The clock of the screenshot says 1:39, the egg hatches ten minutes later: read at 1:41 pm,
+    // whatever time the test runs (it failed every afternoon from 1:39 + 10 + 45 minutes on).
+    vi.useFakeTimers({ toFake: ['Date'] });
+    vi.setSystemTime(
+      DateTime.fromObject({ hour: 13, minute: 41 }, { zone: 'America/New_York' }).toMillis(),
+    );
     const { read, files } = setup();
     const used = await read(
       'egg.png',
       eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600),
     );
+    vi.useRealTimers();
     const answer = sent(used.editReply);
     expect(answer.content).toContain('**Gym:** read `Old Stone Fountain` → **Old Stone Fountain**');
     expect(answer.content).toContain('**Tier:** 5 heads → **T5**');
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8b2 HEAD -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b2-counters-rank-help.md'` prints nothing; `npm run check` and `npm run build`, once and one after the other (no repository changed: the database suite is not needed). The test files with timers or waits that this plan changes (`src/commands/util/counters-dialog.test.ts`, `src/commands/util/counters.test.ts`, `src/discord/late-reply.test.ts`, `src/discord/router.test.ts`, `src/commands/screenshots/read-screenshot.test.ts`) ten times in a row.
2. Whole-branch review (Opus, high effort); one fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8B-2": the decisions above for Matt, what only staging shows, what was left open), the Gantt chart and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-15-phase-8b2-staging.md` (added by task 6). Each step with Matt's go-ahead, on the test server with the dev application; Matt starts the bot. No registration is needed.
