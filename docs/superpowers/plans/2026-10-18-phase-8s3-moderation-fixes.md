# Phase 8S-3: the Small Fixes from the 8S-2 and Web Map Staging: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the staging of 8S-2 (2026-10-17/18) and of the web map plans (2026-10-18) found. No new feature. Matt asked for it on 2026-10-18 ("Do 1 and 2 now"; the web map's findings added the same afternoon). In detail:

- A report or ask tells the member what refuses it before the form opens (already reported, the limit), not after the reason was typed.
- A reported message in a party's post names the post once; a decided ask keeps showing the ruling it asked about.
- A command or control that fails for a reason that is none of the member's doing gives its use back (the router, for everything throttled).
- A post the bot may not make (a forum without Manage Posts, Create Posts …) is said plainly and counts nothing; the summary post is made without the tags' permission.
- `cutover-check` warns when a staff role cannot see the moderators' channel; the guides say so.
- The web map: Move… and Cancel no longer close their popup; refused reports are logged; the login button says not to share it.

**Architecture:**

- **The router** (`src/discord/router.ts`): guards, then `checks` (a window's room asked before a form opens, nothing counted), throttle, deferral, `execute`. Each counted use is noted with when it was counted (`whenCounted(interaction)`); an error that is not a `UserError`, or a `UserError` with `givesBack`, gives it back (`Throttles.giveBack`, only to the window that counted it, at most the limit per window). A `UserError` with `said` means the handler answered already: the use goes back and the router says nothing more. `ComponentHandler.carriesOn` names the command window a form's submit belongs to.
- **Posts:** `src/domain/party/post-permissions.ts` (`postNeeds(tagged)`, `PostsRefused`); `DiscordPartyGateway.createPost` refuses from the cache before asking Discord (and maps Missing Access) with `PostsRefusedError`; `PartyService` answers `no-post` with `refused`, logs once per forum; raids, meetups, trains, moves and the setup of forums word it from what is missing.
- **Reports** (`ModerationReports.reportedBefore`, `ReportStore.openReport`): a quick read before the form, raced against a second.
- **The map's page:** `keepClicksInPopup` on every popup that opens (`party-layer.ts`): Leaflet 1.9.4 judges a click by walking up from its target, which a form that redraws its box takes out of the page during the click.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely on MySQL 8.4, Leaflet 1.9.4, Vitest. No new dependency, **no migration**, no command change (no deploy), party state stays at version 11.

**Spec:** the brief `.superpowers/sdd/2026-10-18-phase-8s3-moderation-fixes/design.md` (git-ignored), from the follow-ups "From the staging run of 8S-2" and "From the staging run of the web map plans".

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8s3`, tip `3d1fe958`), one commit per task, rebased onto typescript-migration 05fa6e92 without conflict. Each commit typechecks; on the tip the full check (7,903 tests), the build and the database suite (487) are clean.

**Reviews:** an Opus reviewer went through the prototype (S3-1..S3-10: two Important), then each of two fix rounds (F1-1..F1-4, then R2-1..R2-2, all Minor); every finding is folded into the commits below. The last review: ready.

## Decisions in this plan

These were made while prototyping and reviewing, for Matt to look at:

1. **Give-back everywhere:** a use is given back for any failure that is not the member's doing, in the router for every throttled command, message command and control, and on the map for raids, meetups and trains. It is given back even when its effect had landed before the failure (an answer that could not be sent); at most twice the limit a window can come of it.
2. **A post the bot may not make** is refused plainly ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me.") rather than made without its tag: a post without its moderated tag would still fail when the party ends and its post is archived and locked. The region's summary post carries no tag and is made without Manage Posts; only its pin needs it ("posted the list of active raids (I could not pin it: give me Manage Posts there)").
3. **"in the post of <title>"** for a reported message inside a party's post: the post's title as it was when reported, no second mention.
4. **A decided ask** is redrawn with the ruling read before the decision (no migration, no stored copy).
5. **The read before a report's form** has a one-second limit; past it the form opens and the check after the form decides.
6. **`cutover-check`'s moderation line** names each role called Admin or Moderator that cannot see the moderators' channel (Administrator counts as seeing it), in one warning with the other problems.
7. **The map's logs:** every report on the map (raid, spawn, meetup) is logged once the member is known, refusals included, with an outcome and no typed text or point. The train routes and the change routes still log only after their throttle.
8. **The login button** (`/maps`, `/region edit`): "…It works once, within five minutes; do not share it: it logs in whoever opens it as you." The commands' help does not repeat it.

Note (whole-branch review, S3F-1): making a post no longer asks Send Messages in Posts (Discord starts a post with Send Messages alone; `cutover-check` still asks it of every forum), and asks Manage Posts only where an applied tag is moderated, as the forum lists its tags. Where Task 4 below lists Send Messages in Posts among what a post needs, read it without.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8s3`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **The give-back:** once per counted use, only to the window that counted it, never for a guard's refusal; `said` answers once.
2. **Posts refused** from the cache only where Discord would refuse too (tags need Manage Threads; the summary has none).
3. **The map's popups:** clicks stopped at a popup's element reach every handler inside it (links, buttons, the close button) and nothing outside.
4. **No text a member typed, and no point,** in the new log lines.

### Task 1: Plan 8S-3 T1: Reports, asks and appeals: what refuses a form is told before it opens

Prototype commit: `3a2970511e984289fb32a4391656118cc2426595`

Staging of 8S-2: "You already reported this." and the report throttle were
told only after the member had typed a reason and sent the form. Now:

- The router takes `checks` on a command, a message command and a control:
  the window a form's submit counts in, refused after the guards while it is
  full, counting nothing (`Throttles.wait`). A guard's refusal still counts
  nothing, and opening a form counts nothing either.
- `/report` and "Report to moderators" check `/report`'s window
  (`REPORT_WINDOW`, in `report-limit.ts`: the two files import each other)
  and read whether the member's reason is on the open report of the party or
  message already (`ModerationReports.reportedBefore` over the new
  `ReportStore.openReport`, raced against a second, `checkTimeoutMs`, so
  that the form still opens within Discord's three seconds; a stranded
  report, a failed or slow read opens the form, whose submit still says it).
- Ask the moderators and Appeal already said "with the moderators" and the
  waits before the form; their form's window (three an hour) is now checked
  before it too.

**Files:**

```
 src/commands/meetups/place-ask.test.ts      | 17 +++++++++++++
 src/commands/meetups/place-ask.ts           |  2 ++
 src/commands/parties/report-limit.ts        | 16 ++++++++++++
 src/commands/parties/report-message.test.ts | 36 ++++++++++++++++++++++++--
 src/commands/parties/report-message.ts      | 11 ++++++++
 src/commands/parties/report.test.ts         | 72 +++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/commands/parties/report.ts              | 29 +++++++++++++++------
 src/components/meetup-appeal.test.ts        | 14 ++++++++++
 src/components/meetup-appeal.ts             |  2 ++
 src/db/repositories/report-repository.ts    | 12 +++++++++
 src/discord/command.ts                      | 22 ++++++++++++++++
 src/discord/router.test.ts                  | 96 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/discord/router.ts                       | 79 +++++++++++++++++++++++++++++++++++++++++++-------------
 src/discord/throttle.test.ts                | 14 ++++++++++
 src/discord/throttle.ts                     | 10 ++++++++
 src/domain/moderation/reports.ts            | 11 +++++++-
 src/services/moderation-reports.ts          | 41 ++++++++++++++++++++++++++++++
 test/support/report-cases.ts                | 34 ++++++++++++++++++++-----
 test/support/reports.ts                     |  8 ++++++
 19 files changed, 491 insertions(+), 35 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/meetups/place-ask.test.ts src/commands/parties/report-message.test.ts src/commands/parties/report.test.ts src/components/meetup-appeal.test.ts src/discord/router.test.ts src/discord/throttle.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3a2970511e984289fb32a4391656118cc2426595 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-3 T1: Reports, asks and appeals: what refuses a form is told before it opens`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/commands/meetups/place-ask.test.ts b/src/commands/meetups/place-ask.test.ts
index 9761f2cc..c285b53b 100644
--- a/src/commands/meetups/place-ask.test.ts
+++ b/src/commands/meetups/place-ask.test.ts
@@ -14,6 +14,7 @@ import { meetupSafetyWith, MOD_CHANNEL } from '../../../test/support/meetup-safe
 import { buttonsOf, textOf } from '../../../test/support/messages.js';
 import { ALICE, BOB, PARTY_NOW } from '../../../test/support/parties.js';
 import { createTestContext } from '../../../test/support/test-context.js';
+import { APPEAL_THROTTLE } from '../../components/meetup-appeal.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { meetup, meetupFormControls, NO_MEETUP_HERE } from './meetup.js';
 import { ASK_INPUT, ASK_SENT, placeAskControls } from './place-ask.js';
@@ -168,4 +169,20 @@ describe('Ask the moderators (a place refused for good)', () => {
     const again = await made.ask(refused);
     expect(sent(again.reply).content).toBe('It is with the moderators already.');
   });
+
+  it('opens no form while the asks of the hour are used up, before anything is typed', async () => {
+    const made = await setup(20);
+    const refused = await made.run();
+    // Asks that could not reach the moderators count all the same.
+    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
+    for (let n = 0; n < APPEAL_THROTTLE.uses; n++) {
+      const opened = await made.ask(refused);
+      expect(opened.showModal).toHaveBeenCalled();
+      await made.submit(opened, `A park ${String(n)}.`);
+    }
+    made.gateway.failing.delete('sendMessage');
+    const full = await made.ask(refused);
+    expect(full.showModal).not.toHaveBeenCalled();
+    expect(sent(full.reply).content).toMatch(/^That was a lot of clicks\. Try again in /);
+  });
 });
diff --git a/src/commands/meetups/place-ask.ts b/src/commands/meetups/place-ask.ts
index e2ed91f4..db36eb4d 100644
--- a/src/commands/meetups/place-ask.ts
+++ b/src/commands/meetups/place-ask.ts
@@ -188,6 +188,8 @@ export const placeAskControls: ComponentHandler = {
       : id.action === 'allow' || id.action === 'keep'
         ? SAFETY_THROTTLE
         : MEMBER_READ_THROTTLE,
+  // Ask the moderators opens no form while the member's asks of the hour are used up.
+  checks: (_interaction, id) => (id.action === 'open' ? APPEAL_THROTTLE : undefined),
 
   async button(interaction, id, ctx) {
     if (id.action === 'open') {
diff --git a/src/commands/parties/report-limit.ts b/src/commands/parties/report-limit.ts
new file mode 100644
index 00000000..a4f7f9fd
--- /dev/null
+++ b/src/commands/parties/report-limit.ts
@@ -0,0 +1,16 @@
+import type { ControlThrottle } from '../../discord/command.js';
+import type { Throttle } from '../../discord/throttle.js';
+
+/**
+ * The limit of reports, apart from `report.ts` and `report-message.ts`, which import each other:
+ * both read it as they load (plan 8S-3).
+ */
+
+/** The name of `/report`, in whose window every report is counted (the Apps menu's too). */
+export const REPORT_COMMAND = 'report';
+
+/** How often a member may report: five an hour (a post in the moderators' channel each). */
+export const REPORT_THROTTLE: Throttle = { uses: 5, perSeconds: 3600 };
+
+/** `/report`'s window, which the form of every report counts in. */
+export const REPORT_WINDOW: ControlThrottle = { ...REPORT_THROTTLE, as: REPORT_COMMAND };
diff --git a/src/commands/parties/report-message.test.ts b/src/commands/parties/report-message.test.ts
index 61ee8813..4333b5aa 100644
--- a/src/commands/parties/report-message.test.ts
+++ b/src/commands/parties/report-message.test.ts
@@ -11,13 +11,19 @@ import {
 import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
 import { textOf } from '../../../test/support/messages.js';
-import { BOB } from '../../../test/support/parties.js';
+import { BOB, CAROL } from '../../../test/support/parties.js';
 import { reportedMeetup } from '../../../test/support/reports-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
 import { EXPIRED } from '../../services/pending-requests.js';
-import { partyReportForm, REPORT_REASON_INPUT, REPORT_SENT, reportControls } from './report.js';
+import {
+  partyReportForm,
+  REPORT_ALREADY,
+  REPORT_REASON_INPUT,
+  REPORT_SENT,
+  reportControls,
+} from './report.js';
 import { NOTHING_TO_REPORT, reportMessageCommand } from './report-message.js';
 
 const DAVE = '200000000000000005';
@@ -139,6 +145,32 @@ describe('Report to moderators (the Apps menu of a message)', () => {
     expect(text).not.toContain('(no text)');
   });
 
+  it('tells a member who reported the party or the message already, before the form opens', async () => {
+    const made = await setup();
+    await made.report(BOB);
+    const post = await made.use({ id: made.postId, channelId: made.postId, authorId: FAKE_BOT_ID });
+    expect(post.showModal).not.toHaveBeenCalled();
+    expect(sent(post.reply)).toEqual({ content: REPORT_ALREADY, flags: MessageFlags.Ephemeral });
+    const target = { id: '800000000000000001', authorId: DAVE, content: 'One.' };
+    await made.submit(await made.use(target), 'Rude.');
+    const again = await made.use(target);
+    expect(again.showModal).not.toHaveBeenCalled();
+    expect(sent(again.reply).content).toBe(REPORT_ALREADY);
+    const carol = await made.use(target, { userId: CAROL });
+    expect(carol.showModal).toHaveBeenCalled();
+  });
+
+  it('refuses the form while the member’s reports of the hour are used up, the form of /report’s too', async () => {
+    const made = await setup();
+    for (let n = 1; n <= 5; n++) {
+      const used = await made.use({ id: `80000000000000000${String(n)}`, authorId: DAVE });
+      expect(sent((await made.submit(used, 'Rude.')).editReply).content).toBe(REPORT_SENT);
+    }
+    const full = await made.use({ id: '800000000000000006', authorId: DAVE });
+    expect(full.showModal).not.toHaveBeenCalled();
+    expect(sent(full.reply).content).toMatch(/^You can use \/report again in /);
+  });
+
   it('refuses a message where the server has no moderators’ channel', async () => {
     const made = await setup({ moderation: null });
     const used = await made.use({ id: '800000000000000001', authorId: DAVE });
diff --git a/src/commands/parties/report-message.ts b/src/commands/parties/report-message.ts
index e0f5832f..80f371ef 100644
--- a/src/commands/parties/report-message.ts
+++ b/src/commands/parties/report-message.ts
@@ -19,9 +19,11 @@ import {
   messageReportForm,
   NO_MODERATORS,
   partyReportForm,
+  refuseReportedBefore,
   REPORT_REASON_INPUT,
   reportAnswer,
 } from './report.js';
+import { REPORT_WINDOW } from './report-limit.js';
 
 /** The name of the entry in the Apps menu of a message (the design's words). */
 export const REPORT_MESSAGE_NAME = 'Report to moderators';
@@ -89,15 +91,24 @@ export const reportMessageCommand: MessageCommand = {
       'form asks what is wrong; only the moderators read it.',
   },
   guards: [requireGuild],
+  // `/report`'s window, which its form counts in: checked before the form, counting nothing.
+  checks: REPORT_WINDOW,
   async run(interaction, ctx) {
     const target = interaction.targetMessage;
+    const reporterId = interaction.user.id;
     const party = partyOfMessage(ctx.parties, target.channelId, target.id);
     if (party) {
+      await refuseReportedBefore(ctx, { kind: 'party', partyId: party.id }, reporterId);
       await interaction.showModal(partyReportForm(party));
       return;
     }
     if (target.author.id === interaction.client.user.id) throw new UserError(NOTHING_TO_REPORT);
     if (!ctx.reports.on) throw new UserError(NO_MODERATORS);
+    await refuseReportedBefore(
+      ctx,
+      { kind: 'message', channelId: target.channelId, messageId: target.id },
+      reporterId,
+    );
     const inPost = ctx.parties.byPost(target.channelId);
     const where = channelContext(interaction);
     // The member's older form, if any, expires.
diff --git a/src/commands/parties/report.test.ts b/src/commands/parties/report.test.ts
index 015c5050..a308986c 100644
--- a/src/commands/parties/report.test.ts
+++ b/src/commands/parties/report.test.ts
@@ -1,5 +1,5 @@
 import { MessageFlags } from 'discord.js';
-import { describe, expect, it } from 'vitest';
+import { describe, expect, it, vi } from 'vitest';
 import {
   fakeChatInput,
   fakeModal,
@@ -113,6 +113,76 @@ describe('/report', () => {
     expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
   });
 
+  it('tells a member who reported the party already before the form opens, and nobody else', async () => {
+    const made = await setup();
+    await made.submit('A home address.');
+    const again = await made.handle(
+      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
+    );
+    expect(again.showModal).not.toHaveBeenCalled();
+    expect(sent(again.reply)).toEqual({ content: REPORT_ALREADY, flags: MessageFlags.Ephemeral });
+    const carol = await made.handle(
+      fakeChatInput({ commandName: 'report', userId: CAROL, ...made.inPost }),
+    );
+    expect(carol.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
+    // Decided, the report is no longer open: Bob may report the party anew.
+    const [kept] = [...made.reportStore.reports.keys()];
+    await made.reportStore.decideReport(kept ?? '', 'dismissed', null, null);
+    const anew = await made.handle(
+      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
+    );
+    expect(anew.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
+  });
+
+  it('refuses the form while the member’s five reports an hour are used up; opening it counts nothing', async () => {
+    const made = await setup();
+    const open = () =>
+      made.handle(fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }));
+    for (let i = 0; i < 6; i++) expect((await open()).showModal).toHaveBeenCalled();
+    for (let i = 0; i < 5; i++) {
+      expect((await made.submit(`Reason ${String(i)}`)).editReply).toHaveBeenCalled();
+    }
+    const full = await open();
+    expect(full.showModal).not.toHaveBeenCalled();
+    expect(sent(full.reply).content).toMatch(/^You can use \/report again in /);
+  });
+
+  it('opens the form as before when the reports cannot be read', async () => {
+    const made = await setup();
+    await made.submit('A home address.');
+    made.reportStore.failing.add('openReport');
+    const used = await made.handle(
+      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
+    );
+    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
+    // The form's submit still tells them.
+    made.reportStore.failing.delete('openReport');
+    expect(sent((await made.submit('Again.')).editReply).content).toBe(REPORT_ALREADY);
+  });
+
+  it('opens the form after a second when the reports do not answer, and logs it', async () => {
+    const made = await setup();
+    await made.submit('A home address.');
+    made.reportStore.openReport = () => new Promise(() => undefined);
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const used = fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost });
+      const handled = made.handle(used);
+      await vi.advanceTimersByTimeAsync(999);
+      expect(used.showModal).not.toHaveBeenCalled();
+      await vi.advanceTimersByTimeAsync(1);
+      await handled;
+      expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
+      expect(
+        made.entries.some(
+          (one) => one.msg === 'could not read whether a member reported this already',
+        ),
+      ).toBe(true);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
   it('refuses a reason of white space alone, without counting it', async () => {
     const made = await setup();
     for (let i = 0; i < 6; i++) {
diff --git a/src/commands/parties/report.ts b/src/commands/parties/report.ts
index 541352c3..49b0c267 100644
--- a/src/commands/parties/report.ts
+++ b/src/commands/parties/report.ts
@@ -13,18 +13,14 @@ import { UserError } from '../../discord/errors.js';
 import { guildIdOf, managementRoleIds, requireGuild, requireParty } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import type { Throttle } from '../../discord/throttle.js';
+import { REPORT_COMMAND, REPORT_WINDOW } from './report-limit.js';
 import { MAX_REPORT_REASON } from '../../domain/moderation/reports.js';
 import { partyWord, type Party } from '../../domain/party/party.js';
 import type { ReportOutcome } from '../../services/moderation-reports.js';
 import { submitMessageReport } from './report-message.js';
 import { commandParty, partyOver } from './reply.js';
 
-/** The name of `/report`, in whose window every report is counted (the Apps menu's too). */
-export const REPORT_COMMAND = 'report';
-
-/** How often a member may report: five an hour (a post in the moderators' channel each). */
-export const REPORT_THROTTLE: Throttle = { uses: 5, perSeconds: 3600 };
+export { REPORT_COMMAND, REPORT_THROTTLE } from './report-limit.js';
 
 /**
  * The custom-id kind of a report's form (plan 8S-2): `report:<party id>:party` (`/report`, and
@@ -172,11 +168,28 @@ export const report: SimpleCommand = {
     examples: ['/report'],
   },
   guards: [requireParty],
+  // Before the form: nobody types a reason only to be told the hour's reports are used up.
+  checks: REPORT_WINDOW,
   async execute(interaction, ctx) {
-    await interaction.showModal(partyReportForm(commandParty(interaction, ctx)));
+    const party = commandParty(interaction, ctx);
+    await refuseReportedBefore(ctx, { kind: 'party', partyId: party.id }, interaction.user.id);
+    await interaction.showModal(partyReportForm(party));
   },
 };
 
+/**
+ * Refuses, before its form opens, a report by a member whose reason is on the open report of the
+ * party or message already (plan 8S-3: a quick read; when it fails, the form opens and its
+ * submit says it).
+ */
+export async function refuseReportedBefore(
+  ctx: AppContext,
+  subject: Parameters<AppContext['reports']['reportedBefore']>[0],
+  reporterId: string,
+): Promise<void> {
+  if (await ctx.reports.reportedBefore(subject, reporterId)) throw new UserError(REPORT_ALREADY);
+}
+
 /**
  * The forms of reports (kind `report`): a party's (`report:<party id>:party`) and a message's
  * (`report:<token>:message`). Five an hour,
@@ -186,7 +199,7 @@ export const report: SimpleCommand = {
 export const reportControls: ComponentHandler = {
   kind: REPORT_FORM_KIND,
   guards: [requireGuild, requireReason],
-  throttle: () => ({ ...REPORT_THROTTLE, as: REPORT_COMMAND }),
+  throttle: () => REPORT_WINDOW,
   async modal(interaction, id, ctx) {
     if (id.action === 'party') return submitPartyReport(interaction, ctx, id.id);
     if (id.action === 'message') return submitMessageReport(interaction, ctx, id.id);
diff --git a/src/components/meetup-appeal.test.ts b/src/components/meetup-appeal.test.ts
index 17cf648c..d479aeb2 100644
--- a/src/components/meetup-appeal.test.ts
+++ b/src/components/meetup-appeal.test.ts
@@ -147,6 +147,20 @@ describe('appeals of a meetup block', () => {
     expect(told(await made.send('Please again.'))).toMatch(/again in/);
   });
 
+  it('opens no form while the appeals of the hour are used up, before anything is typed', async () => {
+    const made = await setup();
+    // Appeals that could not reach the moderators count all the same.
+    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
+    for (let n = 0; n < APPEAL_THROTTLE.uses; n++) {
+      expect((await made.open()).showModal).toHaveBeenCalled();
+      await made.send(`Please ${String(n)}.`);
+    }
+    made.gateway.failing.delete('sendMessage');
+    const full = await made.open();
+    expect(full.showModal).not.toHaveBeenCalled();
+    expect(told(full)).toMatch(/^That was a lot of clicks\. Try again in /);
+  });
+
   it('sends no appeal of a block lifted while its form was open', async () => {
     const made = await setup();
     await made.open();
diff --git a/src/components/meetup-appeal.ts b/src/components/meetup-appeal.ts
index 14f5d35b..c03f8342 100644
--- a/src/components/meetup-appeal.ts
+++ b/src/components/meetup-appeal.ts
@@ -130,6 +130,8 @@ export const meetupAppealControls: ComponentHandler = {
       : id.action === 'lift' || id.action === 'keep'
         ? SAFETY_THROTTLE
         : MEMBER_READ_THROTTLE,
+  // Appeal opens no form while the member's appeals of the hour are used up.
+  checks: (_interaction, id) => (id.action === 'open' ? APPEAL_THROTTLE : undefined),
 
   async button(interaction, id, ctx) {
     if (id.action === 'open') {
diff --git a/src/db/repositories/report-repository.ts b/src/db/repositories/report-repository.ts
index a14989b0..6f1d5493 100644
--- a/src/db/repositories/report-repository.ts
+++ b/src/db/repositories/report-repository.ts
@@ -127,6 +127,18 @@ export class ReportRepository implements ReportStore {
     return (await this.readAll([row]))[0];
   }
 
+  async openReport(key: string): Promise<ModerationReport | undefined> {
+    // The key is unique and only an open report has one.
+    const row = await this.db
+      .selectFrom('ModerationReport')
+      .selectAll()
+      .where('openKey', '=', key)
+      .where('status', '=', 'open')
+      .executeTakeFirst();
+    if (!row) return undefined;
+    return (await this.readAll([row]))[0];
+  }
+
   private async reportOrThrow(id: string): Promise<ModerationReport> {
     const found = await this.report(id);
     if (!found) throw new Error(`report ${id} cannot be read`);
diff --git a/src/discord/command.ts b/src/discord/command.ts
index 80cad0bb..1501b03c 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -73,6 +73,13 @@ export interface CommandHandler {
   throttle?:
     | Throttle
     | ((interaction: ChatInputCommandInteraction, ctx: AppContext) => Throttle | undefined);
+  /**
+   * For a command that opens a form whose submit counts (`/report`): the window that submit
+   * counts in (`as` its command, else this command's own). A use is refused, after the guards,
+   * while that window is full, so that nobody types into a form only to be refused; it counts
+   * nothing (plan 8S-3).
+   */
+  checks?: ControlThrottle;
   execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
   autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void>;
 }
@@ -168,6 +175,11 @@ export interface MessageCommand {
         ctx: AppContext,
       ) => 'ephemeral' | undefined);
   throttle?: Throttle;
+  /**
+   * The window of the form it opens (`CommandHandler.checks`): refused while it is full,
+   * counting nothing; `as` names the command whose window it is (`report`).
+   */
+  checks?: ControlThrottle;
   run(interaction: MessageContextMenuCommandInteraction, ctx: AppContext): Promise<void>;
 }
 
@@ -292,6 +304,16 @@ export interface ComponentHandler {
         interaction: MessageComponentInteraction | ModalSubmitInteraction,
         id: CustomId,
       ) => ControlThrottle | undefined);
+  /**
+   * For a control that opens a form (Ask the moderators, Appeal): the limit its form is counted
+   * by, as `throttle` gives it for the form (undefined for a control that opens none). The press
+   * is refused, after the guards and before its own count, while the form's window is full; it
+   * counts nothing there (plan 8S-3).
+   */
+  checks?: (
+    interaction: MessageComponentInteraction | ModalSubmitInteraction,
+    id: CustomId,
+  ) => ControlThrottle | undefined;
   button?: (interaction: ButtonInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   select?: (interaction: AnySelectMenuInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   modal?: (interaction: ModalSubmitInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index 2c2303b9..2b43b938 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -1030,6 +1030,83 @@ describe('InteractionRouter', () => {
     expect(sent(fourth.reply).content).toBe('You can use /test again in 1 minute.');
   });
 
+  it('refuses a command before its form when the window its form counts in is full, counting nothing', async () => {
+    const { ctx } = createTestContext();
+    const execute = ran();
+    const modal = ran();
+    const order: string[] = [];
+    const window = { uses: 2, perSeconds: 60, as: 'test' };
+    const router = new InteractionRouter(
+      ctx,
+      [
+        command({
+          guards: [() => void order.push('guard')],
+          checks: window,
+          execute,
+        }),
+      ],
+      [{ kind: 'p', throttle: () => window, modal }],
+    );
+    // Opening the form counts nothing: any number of times.
+    for (let n = 0; n < 3; n++) {
+      await router.handle(asInteraction(fakeChatInput({ commandName: 'test' })));
+    }
+    expect(execute).toHaveBeenCalledTimes(3);
+    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
+    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
+    const refused = fakeChatInput({ commandName: 'test' });
+    await router.handle(asInteraction(refused));
+    expect(execute).toHaveBeenCalledTimes(3);
+    expect(sent(refused.reply).content).toBe('You can use /test again in 1 minute.');
+    expect(order).toHaveLength(4);
+    // Another member's window is their own.
+    await router.handle(
+      asInteraction(fakeChatInput({ commandName: 'test', userId: '700000000000000002' })),
+    );
+    expect(execute).toHaveBeenCalledTimes(4);
+  });
+
+  it('checks a control before its form in the window the form counts in, after the guards', async () => {
+    const { ctx } = createTestContext();
+    const button = ran();
+    const modal = ran();
+    let refuse = false;
+    const form = { uses: 1, perSeconds: 60 };
+    const router = new InteractionRouter(
+      ctx,
+      [],
+      [
+        {
+          kind: 'p',
+          guards: [
+            () => {
+              if (refuse) throw new UserError('Not you.');
+            },
+          ],
+          // The press that opens the form counts as reading; the form counts in its own window.
+          throttle: (_interaction, id) =>
+            id.action === 'form' ? form : { uses: 30, perSeconds: 60 },
+          checks: (_interaction, id) => (id.action === 'open' ? form : undefined),
+          button,
+          modal,
+        },
+      ],
+    );
+    const press = async () => {
+      const i = fakeButton({ customId: 'p:abc:open' });
+      await router.handle(asInteraction(i));
+      return i;
+    };
+    await press();
+    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
+    const full = await press();
+    expect(sent(full.reply).content).toBe('That was a lot of clicks. Try again in 1 minute.');
+    refuse = true;
+    const guarded = await press();
+    expect(sent(guarded.reply).content).toBe('Not you.');
+    expect([button.mock.calls.length, modal.mock.calls.length]).toEqual([1, 1]);
+  });
+
   it('keeps the budget of a kind of control apart from a command of a like name', async () => {
     const { ctx } = createTestContext();
     const execute = ran();
@@ -1218,6 +1295,25 @@ describe('InteractionRouter and message commands', () => {
     });
   });
 
+  it('checks the window of the command its form counts in before it runs, counting nothing', async () => {
+    const { ctx } = createTestContext();
+    const run = ran();
+    const window = { uses: 1, perSeconds: 3600, as: 'report' };
+    const router = new InteractionRouter(
+      ctx,
+      [onMessage({ checks: window, run })],
+      [{ kind: 'report', throttle: () => window, modal: ran() }],
+    );
+    await router.handle(asInteraction(used()));
+    await router.handle(asInteraction(used()));
+    expect(run).toHaveBeenCalledTimes(2);
+    await router.handle(asInteraction(fakeModal({ customId: 'report:abc:party' })));
+    const full = used();
+    await router.handle(asInteraction(full));
+    expect(run).toHaveBeenCalledTimes(2);
+    expect(sent(full.reply).content).toBe('You can use /report again in 60 minutes.');
+  });
+
   it('acknowledges privately first when the command asks for it', async () => {
     const { ctx } = createTestContext();
     const i = used();
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 114013be..07be1272 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -269,6 +269,12 @@ export class InteractionRouter {
       }
       const { handler, name, counted: key } = found;
       await runGuards(found.guards, interaction, this.ctx);
+      const { checks } = handler;
+      if (checks) {
+        this.refuseWhileFull(checks.as ?? key, interaction.user.id, checks, (wait) =>
+          commandRefusal(checks.as ?? name, wait),
+        );
+      }
       const varies = typeof handler.throttle === 'function';
       const throttle =
         typeof handler.throttle === 'function'
@@ -278,9 +284,7 @@ export class InteractionRouter {
         // The limits of a command that has several are counted apart, each under what it is.
         const counted = varies ? variedThrottleKey(key, throttle) : key;
         const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
-        if (wait !== undefined) {
-          throw new UserError(`You can use /${name} again in ${waitText(wait)}.`);
-        }
+        if (wait !== undefined) throw new UserError(commandRefusal(name, waitText(wait)));
       }
       const defer =
         typeof handler.defer === 'function' ? handler.defer(interaction, this.ctx) : handler.defer;
@@ -336,9 +340,17 @@ export class InteractionRouter {
         throw new UserError(UNKNOWN_COMMAND);
       }
       await runGuards(command.guards ?? [], interaction, this.ctx);
-      const { throttle } = command;
+      const { throttle, checks } = command;
+      const name = command.data.name;
+      if (checks) {
+        // The window of the form it opens: a command's (`/report`), or its own.
+        this.refuseWhileFull(checks.as ?? name, interaction.user.id, checks, (wait) =>
+          checks.as === undefined
+            ? `You can use ${name} again in ${wait}.`
+            : commandRefusal(checks.as, wait),
+        );
+      }
       if (throttle) {
-        const name = command.data.name;
         const wait = this.throttles.use(name, interaction.user.id, throttle, this.now());
         if (wait !== undefined) {
           throw new UserError(`You can use ${name} again in ${waitText(wait)}.`);
@@ -435,28 +447,49 @@ export class InteractionRouter {
       }
       await runGuards(handler.guards ?? [], interaction, this.ctx);
       const varies = typeof handler.throttle === 'function';
+      // A limit shared with a command counts in that command's window, as the command's uses
+      // are counted; the others in the kind's own, each limit by itself where they vary.
+      const key = controlThrottleKey(handler.kind);
+      const windowOf = (limit: ControlThrottle) =>
+        limit.as ?? (varies ? variedThrottleKey(key, limit) : key);
+      // The window of the form this control opens, before the control counts.
+      const checks = handler.checks?.(interaction, id);
+      if (checks) {
+        this.refuseWhileFull(windowOf(checks), interaction.user.id, checks, (wait) =>
+          controlRefusal(checks, wait),
+        );
+      }
       const throttle: ControlThrottle | undefined =
         typeof handler.throttle === 'function'
           ? handler.throttle(interaction, id)
           : handler.throttle;
       if (throttle) {
-        // A limit shared with a command counts in that command's window, as the command's uses
-        // are counted; the others in the kind's own, each limit by itself where they vary.
-        const key = controlThrottleKey(handler.kind);
-        const counted = throttle.as ?? (varies ? variedThrottleKey(key, throttle) : key);
-        const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
-        if (wait !== undefined) {
-          throw new UserError(
-            throttle.as === undefined
-              ? `That was a lot of clicks. Try again in ${waitText(wait)}.`
-              : `You can use /${throttle.as} again in ${waitText(wait)}.`,
-          );
-        }
+        const wait = this.throttles.use(
+          windowOf(throttle),
+          interaction.user.id,
+          throttle,
+          this.now(),
+        );
+        if (wait !== undefined) throw new UserError(controlRefusal(throttle, waitText(wait)));
       }
       await run();
     });
   }
 
+  /**
+   * Refuses a use while the window `key` of `throttle` is full (a form's, before the form opens:
+   * `checks`); counts nothing.
+   */
+  private refuseWhileFull(
+    key: string,
+    userId: string,
+    throttle: Throttle,
+    refusal: (wait: string) => string,
+  ): void {
+    const wait = this.throttles.wait(key, userId, throttle, this.now());
+    if (wait !== undefined) throw new UserError(refusal(waitText(wait)));
+  }
+
   private async guarded(interaction: Answered, run: () => Promise<void>): Promise<void> {
     try {
       await run();
@@ -493,6 +526,18 @@ export class InteractionRouter {
   }
 }
 
+/** What a member is told who used a command too often: its name, as typed. */
+function commandRefusal(name: string, wait: string): string {
+  return `You can use /${name} again in ${wait}.`;
+}
+
+/** What a member is told who used a control too often: as a command's use where it counts as one. */
+function controlRefusal(throttle: ControlThrottle, wait: string): string {
+  return throttle.as === undefined
+    ? `That was a lot of clicks. Try again in ${wait}.`
+    : commandRefusal(throttle.as, wait);
+}
+
 /** What the handler does with this kind of control; undefined when it has nothing for it. */
 function runnerFor(
   handler: ComponentHandler,
diff --git a/src/discord/throttle.test.ts b/src/discord/throttle.test.ts
index 6fcaae85..5e4cc5ae 100644
--- a/src/discord/throttle.test.ts
+++ b/src/discord/throttle.test.ts
@@ -35,6 +35,20 @@ describe('Throttles', () => {
     expect(throttles.use('shout', ALICE, once, T0)).toBe(60);
   });
 
+  it('says how long a member would wait without counting a use', () => {
+    const throttles = new Throttles();
+    expect(throttles.wait('raid', ALICE, RAID, T0)).toBeUndefined();
+    for (let i = 0; i < 3; i++) {
+      expect(throttles.wait('raid', ALICE, RAID, T0)).toBeUndefined();
+      throttles.use('raid', ALICE, RAID, T0);
+    }
+    expect(throttles.wait('raid', ALICE, RAID, T0 + 3_000)).toBe(897);
+    expect(throttles.wait('raid', BOB, RAID, T0 + 3_000)).toBeUndefined();
+    expect(throttles.wait('raid', ALICE, RAID, T0 + 900_000)).toBeUndefined();
+    // Asking opened no window of its own.
+    expect(throttles.size).toBe(1);
+  });
+
   it('forgets closed windows when it holds many', () => {
     const throttles = new Throttles();
     const once = { uses: 1, perSeconds: 60 };
diff --git a/src/discord/throttle.ts b/src/discord/throttle.ts
index 9c346b40..ec5033cf 100644
--- a/src/discord/throttle.ts
+++ b/src/discord/throttle.ts
@@ -42,6 +42,16 @@ export class Throttles {
     return Math.ceil((window.closes - now) / 1000);
   }
 
+  /**
+   * How long the member would wait at time `now` for a use: undefined when one is allowed, else
+   * the seconds until it is. Counts nothing (a check before a form whose submit counts, plan 8S-3).
+   */
+  wait(command: string, userId: string, throttle: Throttle, now: number): number | undefined {
+    const window = this.windows.get(`${command}\n${userId}`);
+    if (!window || now >= window.closes || window.uses < throttle.uses) return undefined;
+    return Math.ceil((window.closes - now) / 1000);
+  }
+
   /** How many members' windows are held; for tests. */
   get size(): number {
     return this.windows.size;
diff --git a/src/domain/moderation/reports.ts b/src/domain/moderation/reports.ts
index 42d04aed..f086d439 100644
--- a/src/domain/moderation/reports.ts
+++ b/src/domain/moderation/reports.ts
@@ -188,7 +188,11 @@ export type ReasonAdded =
  * The key of what a report is about, which one open report at a time may have: `party <id>`,
  * `message <channel> <message>`.
  */
-export function reportTargetKey(subject: ReportSubject): string {
+export function reportTargetKey(
+  subject:
+    | Pick<PartySubject, 'kind' | 'partyId'>
+    | Pick<MessageSubject, 'kind' | 'channelId' | 'messageId'>,
+): string {
   return subject.kind === 'party'
     ? `party ${subject.partyId}`
     : `message ${subject.channelId} ${subject.messageId}`;
@@ -203,6 +207,11 @@ export interface ReportStore {
    */
   addReport(report: NewReport, reason: ReportReason): Promise<ReasonAdded>;
   report(id: string): Promise<ModerationReport | undefined>;
+  /**
+   * The open report of a subject by its key (`reportTargetKey`), with its reasons; undefined for
+   * none (whether a member reported it already, asked before the form opens: plan 8S-3).
+   */
+  openReport(key: string): Promise<ModerationReport | undefined>;
   setReportPost(id: string, channelId: string, messageId: string): Promise<void>;
   /** What the post shows of the subject, as it is now (a party changed since it was reported). */
   setSubject(id: string, subject: ReportSubject): Promise<void>;
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
index f976a1a3..abe1024d 100644
--- a/src/services/moderation-reports.ts
+++ b/src/services/moderation-reports.ts
@@ -154,6 +154,11 @@ export interface ModerationReportsOptions {
   settings: Settings;
   log: Logger;
   now?: () => number;
+  /**
+   * How long the read before a report's form may take (`reportedBefore`): a form must open within
+   * Discord's three seconds. A second by default.
+   */
+  checkTimeoutMs?: number;
 }
 
 /**
@@ -292,6 +297,42 @@ export class ModerationReports {
     );
   }
 
+  /**
+   * Whether this member's reason is on the open report of the party or message already: asked
+   * before the form opens (plan 8S-3), so that nobody types a reason only to hear "You already
+   * reported this." False where reports go into the party's post (no moderators' channel), for
+   * a report stranded without its post (the next reason opens it anew), and when the read fails
+   * or takes longer than `checkTimeoutMs` (logged): the form opens then, and its submit says it.
+   */
+  async reportedBefore(
+    subject:
+      | Pick<PartySubject, 'kind' | 'partyId'>
+      | Pick<MessageSubject, 'kind' | 'channelId' | 'messageId'>,
+    reporterId: string,
+  ): Promise<boolean> {
+    if (!this.on) return false;
+    const ms = this.options.checkTimeoutMs ?? 1_000;
+    let timer: NodeJS.Timeout | undefined;
+    const timeout = new Promise<never>((_, reject) => {
+      timer = setTimeout(() => reject(new Error(`no answer within ${String(ms)} ms`)), ms);
+      timer.unref();
+    });
+    try {
+      const open = await Promise.race([
+        this.options.storage.openReport(reportTargetKey(subject)),
+        timeout,
+      ]);
+      if (!open) return false;
+      const stranded = open.messageId === null && open.createdAt <= this.now() - STRANDED_MS;
+      return !stranded && open.reasons.some((one) => one.reporterId === reporterId);
+    } catch (err) {
+      this.options.log.warn({ err }, 'could not read whether a member reported this already');
+      return false;
+    } finally {
+      clearTimeout(timer);
+    }
+  }
+
   /**
    * Opens a report with the reason or adds the reason to the open one of the same subject, and
    * shows it in the moderators' channel. A report whose post was never made (stranded) is
diff --git a/test/support/report-cases.ts b/test/support/report-cases.ts
index 3fa829aa..c8d334ea 100644
--- a/test/support/report-cases.ts
+++ b/test/support/report-cases.ts
@@ -1,10 +1,11 @@
 import { expect, it } from 'vitest';
-import type {
-  MessageSubject,
-  NewReport,
-  PartySubject,
-  ReportReason,
-  ReportStore,
+import {
+  reportTargetKey,
+  type MessageSubject,
+  type NewReport,
+  type PartySubject,
+  type ReportReason,
+  type ReportStore,
 } from '../../src/domain/moderation/reports.js';
 import {
   LIBRARY,
@@ -209,6 +210,27 @@ export function reportCases(made: () => Promise<ReportStore>): void {
     expect((await store.report(requestId(201)))?.status).toBe('dismissed');
   });
 
+  it('finds the open report of a party or a message by its subject, with its reasons', async () => {
+    const store = await made();
+    const message = messageSubject();
+    await store.addReport(newReport(1), reason());
+    await store.addReport(newReport(2), reason(OTHER_REPORTER));
+    await store.addReport(newReport(3, message), reason());
+    expect(await store.openReport(reportTargetKey(partySubject()))).toMatchObject({
+      id: requestId(201),
+      reasons: [{ reporterId: REPORTER }, { reporterId: OTHER_REPORTER }],
+    });
+    expect((await store.openReport(reportTargetKey(message)))?.id).toBe(requestId(203));
+    expect(
+      await store.openReport(reportTargetKey(messageSubject({ messageId: '800000000000000009' }))),
+    ).toBeUndefined();
+    // Decided, it is no longer the open one; a new report is.
+    await store.decideReport(requestId(201), 'dismissed', null, MOD);
+    expect(await store.openReport(reportTargetKey(partySubject()))).toBeUndefined();
+    await store.addReport(newReport(4), reason(OTHER_REPORTER));
+    expect((await store.openReport(reportTargetKey(partySubject())))?.id).toBe(requestId(204));
+  });
+
   it('lists the open reports of a server and of a party, and those never posted', async () => {
     const store = await made();
     await store.addReport(newReport(1, partySubject(), { createdAt: SAFETY_NOW + 2 }), reason());
diff --git a/test/support/reports.ts b/test/support/reports.ts
index 15dedf33..2c6ee0d1 100644
--- a/test/support/reports.ts
+++ b/test/support/reports.ts
@@ -70,6 +70,14 @@ export class MemoryReports implements ReportStore {
     return found && this.copy(found);
   }
 
+  async openReport(key: string) {
+    await this.check('openReport');
+    const found = [...this.reports.values()].find(
+      (one) => one.status === 'open' && reportTargetKey(one.subject) === key,
+    );
+    return found && this.copy(found);
+  }
+
   async setReportPost(id: string, channelId: string, messageId: string) {
     await this.check('setReportPost');
     const found = this.reports.get(id);
````

### Task 2: Plan 8S-3 T2: Moderators' posts: a message in a post named once, a decided ask keeps its ruling

Prototype commit: `35758a30d5cdbd5c69a4adaa8731eb494b09fb41`

Staging of 8S-2:

- A reported message in a party's post read "Written by Tester in <post>, in
  the post of <title>". It now reads "Written by Tester in the post of
  **<title>** <time>": the title as it was when reported, without the post's
  mention, which named the post a second time and says nothing once the post
  is deleted (Go to message leads there). A message elsewhere keeps its
  channel's mention.
- Once an ask about a refused place was decided, its post's Ruling line
  showed the new ruling ("Allowed by ... from an ask"). `decideAsk` now reads
  the ruling before the decision and the post keeps showing it; Undo ruling
  shows the ruling it removed. No migration: the posts are redrawn only at
  those moments (and at an expiry, when the ruling is still the one asked
  about).

**Files:**

```
 src/commands/parties/report-message.test.ts |  3 ++-
 src/render/moderation.test.ts               | 14 ++++++++++----
 src/render/moderation.ts                    | 17 ++++++++++-------
 src/services/meetup-safety.asks.test.ts     | 20 ++++++++++++++++++++
 src/services/meetup-safety.ts               | 18 +++++++++++++-----
 5 files changed, 55 insertions(+), 17 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/report-message.test.ts src/render/moderation.test.ts src/services/meetup-safety.asks.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 35758a30d5cdbd5c69a4adaa8731eb494b09fb41 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-3 T2: Moderators' posts: a message in a post named once, a decided ask keeps its ruling`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/commands/parties/report-message.test.ts b/src/commands/parties/report-message.test.ts
index 4333b5aa..c0f28cc8 100644
--- a/src/commands/parties/report-message.test.ts
+++ b/src/commands/parties/report-message.test.ts
@@ -123,7 +123,8 @@ describe('Report to moderators (the Apps menu of a message)', () => {
     const submitted = await made.submit(used, 'A home address.');
     expect(sent(submitted.editReply).content).toBe(REPORT_SENT);
     const text = textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message);
-    expect(text).toContain(`Written by **Dave** (<@${DAVE}>) in <#${made.postId}>, in the post of`);
+    expect(text).toContain(`Written by **Dave** (<@${DAVE}>) in the post of **`);
+    expect(text).not.toContain(`<#${made.postId}>`);
     expect(text).toContain('Come to my house, 12 Elm Street.');
     expect(text).toContain('**Attachments**: door.jpg');
     // The form is used once.
diff --git a/src/render/moderation.test.ts b/src/render/moderation.test.ts
index 2185c6de..bed6a82d 100644
--- a/src/render/moderation.test.ts
+++ b/src/render/moderation.test.ts
@@ -204,11 +204,17 @@ describe('reportMessage of a message', () => {
     expect(textOf(message)).toContain('…');
   });
 
-  it('names the party whose post it is in, and says when there was no text', () => {
-    const text = textOf(
-      reportMessage(open(messageSubject({ partyTitle: 'Book swap', text: '', attachments: [] }))),
+  it('names the party whose post it is in once, and says when there was no text', () => {
+    const message = reportMessage(
+      open(messageSubject({ partyTitle: 'Book swap', text: '', attachments: [] })),
     );
-    expect(text).toContain('in the post of **Book swap**');
+    // The post's title as it was, not its mention beside it: the post is named once.
+    expect(textDisplays(message)[0]).toBe(
+      '### Reported message\n' +
+        'Written by **Bob** (<@200000000000000003>) in the post of **Book swap** ' +
+        `<t:${String((SAFETY_NOW - HOUR) / 1000)}:F>`,
+    );
+    const text = textOf(message);
     expect(text).toContain('**What it said**\n(no text)');
     expect(text).not.toContain('**Attachments**');
   });
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index 7f5c2891..af8ddc98 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -181,15 +181,18 @@ function partyHead(subject: PartySubject): string {
   ].join('\n');
 }
 
-/** The head of a message's report: who wrote it, where, when, in which party's post. */
+/**
+ * The head of a message's report: who wrote it, where (in a party's post, the post's title as it
+ * was when reported, once: its mention would name the post a second time, and says nothing once
+ * the post is deleted; Go to message leads there), and when.
+ */
 function messageHead(subject: MessageSubject): string {
   const author = memberText({ id: subject.authorId, name: subject.authorName ?? undefined });
-  const party =
-    subject.partyTitle === null ? '' : `, in the post of **${plain(subject.partyTitle)}**`;
-  return (
-    `### Reported message\nWritten by ${author} in <#${subject.channelId}>${party} ` +
-    timestamp(subject.sentAt, 'F')
-  );
+  const where =
+    subject.partyTitle === null
+      ? `<#${subject.channelId}>`
+      : `the post of **${plain(subject.partyTitle)}**`;
+  return `### Reported message\nWritten by ${author} in ${where} ` + timestamp(subject.sentAt, 'F');
 }
 
 /** The texts of a report's subject besides its head and its reasons. */
diff --git a/src/services/meetup-safety.asks.test.ts b/src/services/meetup-safety.asks.test.ts
index 3a7c2817..6ad095cc 100644
--- a/src/services/meetup-safety.asks.test.ts
+++ b/src/services/meetup-safety.asks.test.ts
@@ -114,6 +114,26 @@ describe('MeetupSafety: asks about a refused place', () => {
     );
   });
 
+  it('keeps showing the ruling asked about once the ask is decided or its ruling undone', async () => {
+    const asked = `Refused by **Mod** (<@${MODERATOR}>) <t:`;
+    const fromRequest = `[a meetup request](<https://discord.com/channels/${SERVER}/${MOD_CHANNEL}/600000000000000042>)`;
+    for (const end of ['allow', 'keep', 'undo'] as const) {
+      const made = await refused();
+      made.clock.now = made.ruledAt + 15 * DAY;
+      const sent = await made.ask();
+      if (sent.kind !== 'sent') throw new Error(sent.kind);
+      if (end === 'undo') await made.safety.undoRuling(SERVER, KEY, mod);
+      else await made.safety.decideAsk(sent.ask.id, end, mod, SERVER);
+      const text = textOf(made.askPost()?.message);
+      expect(text).toContain(
+        `**Ruling**\n${asked}${String(made.ruledAt / 1000)}:F>, from ${fromRequest}`,
+      );
+      // Not the ruling that came of the decision: the outcome line says what was decided.
+      expect(text).not.toContain('from [an ask]');
+      expect(text).not.toContain('kept refused <t:');
+    }
+  });
+
   it('expires an ask nobody decided in seven days, and the member may ask again', async () => {
     const made = await refused();
     made.clock.now = made.ruledAt + 15 * DAY;
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index c990bbc1..d59b7146 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -1105,6 +1105,9 @@ export class MeetupSafety {
     if (ask.status !== 'open') return { kind: 'decided-before', ask };
     const now = this.now();
     const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
+    // The ruling asked about, read before the decision changes it: the post keeps showing it
+    // (its last line says what was decided). Unread, the post shows the ruling as it is then.
+    const asked = await storage.rulingRecord(ask.serverId, ask.key).catch(() => undefined);
     const kept = decision === 'keep' ? await storage.keepOnAsk(ask, by) : undefined;
     // Undone or allowed meanwhile: nothing is kept refused, nobody told.
     if (kept === 'not-refused') return { kind: 'not-refused' };
@@ -1120,7 +1123,7 @@ export class MeetupSafety {
       decidedByName: by.name,
       decidedAt: by.at,
     };
-    await this.showAsk(decided);
+    await this.showAsk(decided, asked);
     dms.send({
       userId: ask.memberId,
       message: askOutcomeDm(decided, serverName ?? gateway.guildName(ask.serverId)),
@@ -1132,12 +1135,17 @@ export class MeetupSafety {
     return { kind: 'done', ask: decided };
   }
 
-  /** Shows an ask in its post as it is now, with its ruling; a failure is logged. */
-  private async showAsk(ask: PlaceAskRecord): Promise<void> {
+  /**
+   * Shows an ask in its post as it is now, with the ruling it asked about: `asked`, read before
+   * a decision or an Undo ruling changed it (plan 8S-3: Allow place made a new ruling, from the
+   * ask), else the ruling as it is kept (still the one asked about, at an expiry). A failure is
+   * logged.
+   */
+  private async showAsk(ask: PlaceAskRecord, asked?: PlaceRulingRecord): Promise<void> {
     const { storage, gateway, log } = this.options;
     if (ask.channelId === null || ask.messageId === null) return;
     try {
-      const ruling = await storage.rulingRecord(ask.serverId, ask.key);
+      const ruling = asked ?? (await storage.rulingRecord(ask.serverId, ask.key));
       await gateway.editMessage(
         ask.channelId,
         ask.messageId,
@@ -1253,7 +1261,7 @@ export class MeetupSafety {
       'a ruling of a place was undone',
     );
     // The place's open ask closed with it: its post says so; nobody is told.
-    if (undone.ask) await this.showAsk(undone.ask);
+    if (undone.ask) await this.showAsk(undone.ask, undone.ruling);
     return undone.ruling;
   }
 
````

### Task 3: Plan 8S-3 T3: The router gives back the use of a command or control that failed unexpectedly

Prototype commit: `b66a8e721c098ef81b905f19f41d745fee256ecd`

Staging of 8S-2: a /meetup whose forum post could not be made ("Something
went wrong", Discord's Missing Access) still counted, and the next try was
throttled.

- In the router, for every throttled command, message command and control:
  each use counted is noted with when it was counted, and an error that is
  no `UserError` gives it back (`Throttles.giveBack`), to the window it was
  counted in only: a window opened since gets nothing. At most as many uses
  a window as the limit allows are given back, so a use that keeps failing
  is held to twice the limit (it may cost a request to Discord each time). A
  refusal is the member's and stays counted; a guard's refusal counts
  nothing as before.
- A form whose command counted the use names that command's window and when
  the use was counted with `carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE`
  as `meetup`, kept with the form): its failure gives that use back, never
  to a later window (a form may stay open thirty minutes, the window is
  fifteen). When the use was counted is the router's own reading
  (`whenCounted(interaction)`, by `RouterOptions.now`), never a clock the
  handler reads again later.
- The live map's meetups and trains share `/meetup`'s and `/train`'s
  windows: one that fails there gives its use back too
  (`givenBackOnTheMap`).
- Two tests counted presses that failed on a fake's refusal (a v2 update of
  a message they left classic); they press a v2 answer now, as the bot's is.

**Files:**

```
 src/commands/meetups/meetup.test.ts       |  47 ++++++++++++++++++++++++++++++--
 src/commands/meetups/meetup.ts            |  23 +++++++++++++---
 src/commands/util/counters-dialog.test.ts |  11 +++++---
 src/commands/util/rank.test.ts            |   3 +++
 src/discord/command.ts                    |  11 ++++++++
 src/discord/router.test.ts                | 103 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/discord/router.ts                     |  74 ++++++++++++++++++++++++++++++++++++++++----------
 src/discord/throttle.test.ts              |  33 +++++++++++++++++++++++
 src/discord/throttle.ts                   |  34 +++++++++++++++++++++--
 src/web/acting.ts                         |  15 +++++++++++
 src/web/meetup-make.test.ts               |  13 +++++++++
 src/web/meetup-routes.ts                  |  39 ++++++++++++++++-----------
 src/web/train-routes.ts                   |  31 +++++++++++++--------
 src/web/train-start.test.ts               |  13 +++++++++
 14 files changed, 399 insertions(+), 51 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/meetups/meetup.test.ts src/commands/util/counters-dialog.test.ts src/commands/util/rank.test.ts src/discord/router.test.ts src/discord/throttle.test.ts src/web/meetup-make.test.ts src/web/train-start.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff b66a8e721c098ef81b905f19f41d745fee256ecd -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-3 T3: The router gives back the use of a command or control that failed unexpectedly`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index 38b7954a..6558a9ab 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -28,7 +28,7 @@ import { MemoryUsers } from '../../../test/support/users.js';
 import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../../test/support/wayspots.js';
 import type { AppContext } from '../../app-context.js';
-import { InteractionRouter } from '../../discord/router.js';
+import { InteractionRouter, type RouterOptions } from '../../discord/router.js';
 import { MAX_MEETUP_DESCRIPTION } from '../../domain/party/party.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { commands } from '../index.js';
@@ -63,6 +63,7 @@ afterEach(() => {
 async function setup(
   overrides: Partial<AppContext> = {},
   safety: SafetyOptions = { moderation: null },
+  routing: RouterOptions = {},
 ) {
   const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
   const made = await meetupSafetyWith(safety, [raid]);
@@ -75,7 +76,7 @@ async function setup(
     meetupSafety: made.safety,
     ...overrides,
   });
-  const router = new InteractionRouter(ctx, [meetup], [meetupFormControls]);
+  const router = new InteractionRouter(ctx, [meetup], [meetupFormControls], routing);
   /** `/meetup` by Alice in the channel of West, near the fountain, at six, unless `extra` says otherwise. */
   const command = async (name: string, extra: object = {}): Promise<FakeInteraction> => {
     const { options, ...rest } = extra as { options?: object };
@@ -287,6 +288,48 @@ describe('/meetup', () => {
     expect(made.meetups()).toHaveLength(2);
   });
 
+  it('gives the use back when the meetup could not be made for no fault of the member', async () => {
+    const made = await setup();
+    made.gateway.failing.set('createPost', new Error('Discord is away'));
+    for (let n = 0; n < 2; n++) {
+      expect((await made.run(`Try ${String(n)}`)).told).toMatch(/^Something went wrong/);
+    }
+    made.gateway.failing.delete('createPost');
+    expect((await made.run('First')).told).toMatch(/^Your meetup is made\./);
+    await made.run('Second');
+    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again/);
+    expect(made.meetups()).toHaveLength(2);
+  });
+
+  it('gives back nothing to a window opened after the failed form’s use was counted', async () => {
+    const made = await setup();
+    const old = await made.command('Old');
+    vi.setSystemTime(PARTY_NOW + 16 * MINUTE);
+    for (const name of ['New one', 'New two']) await made.command(name);
+    made.gateway.failing.set('createPost', new Error('Discord is away'));
+    expect(told((await made.submit(old)) ?? old)).toMatch(/^Something went wrong/);
+    made.gateway.failing.delete('createPost');
+    // The old form's use was counted in the window that closed: the new one stays full.
+    const third = await made.command('Third');
+    expect(third.showModal).not.toHaveBeenCalled();
+    expect(told(third)).toMatch(/^You can use \/meetup again/);
+  });
+
+  it('gives a failed form’s use back by when the router counted it, not by another clock', async () => {
+    // The router's clock runs an hour behind the one the form is checked by.
+    let routerNow = PARTY_NOW - HOUR;
+    const made = await setup({}, { moderation: null }, { now: () => routerNow });
+    const old = await made.command('Old');
+    routerNow += 16 * MINUTE;
+    for (const name of ['New one', 'New two']) await made.command(name);
+    made.gateway.failing.set('createPost', new Error('Discord is away'));
+    expect(told((await made.submit(old)) ?? old)).toMatch(/^Something went wrong/);
+    made.gateway.failing.delete('createPost');
+    // Counted at the router's hour, in the window that closed: the new one stays full.
+    const third = await made.command('Third');
+    expect(third.showModal).not.toHaveBeenCalled();
+  });
+
   it('does not count a use that was refused before the form', async () => {
     const made = await setup();
     const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index c00dd706..f27202ee 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -11,7 +11,7 @@ import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
-import { STALE_COMPONENT } from '../../discord/router.js';
+import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
 import type { Place } from '../../domain/geo/place.js';
 import { mayRequestReview, type MeetupVerdict } from '../../domain/meetups/safety.js';
@@ -85,6 +85,9 @@ const START_PASSED = 'That start has passed meanwhile. Use `/meetup` again with
 /** The custom-id kind of the form `/meetup` opens (`meetup:<token>:form`). */
 export const MEETUP_KIND = 'meetup';
 
+/** The name of `/meetup`, in whose window its form's use is counted (`meetupFormControls`). */
+const MEETUP_NAME = 'meetup';
+
 /** How long the form of `/meetup` may stay open: what it was opened with is kept that long. */
 const FORM_MS = 30 * 60_000;
 
@@ -95,6 +98,11 @@ interface PendingMeetup {
   name: string;
   place: Place;
   startTime: number;
+  /**
+   * When `/meetup` counted the use that opened the form (`whenCounted`): a failure gives it back
+   * to that window.
+   */
+  openedAt: number;
 }
 
 const pending = new PendingRequests<PendingMeetup>({ ttlMs: FORM_MS });
@@ -227,7 +235,7 @@ export function meetupForm(token: string): APIModalInteractionResponseCallbackDa
  */
 export const meetup: SimpleCommand = {
   data: new SlashCommandBuilder()
-    .setName('meetup')
+    .setName(MEETUP_NAME)
     .setDescription('Create a meetup in this region, with a post of its own')
     .addStringOption((option) =>
       option
@@ -286,6 +294,8 @@ export const meetup: SimpleCommand = {
       name: interaction.options.getString('name', true),
       place: asked.place,
       startTime: asked.startTime,
+      // When the router counted the use (its clock), not a reading of another.
+      openedAt: whenCounted(interaction) ?? Date.now(),
     });
     await interaction.showModal(meetupForm(token));
   },
@@ -301,11 +311,18 @@ export const meetup: SimpleCommand = {
 
 /**
  * The form of `/meetup`. It has no limit of its own: every form was opened by a use of
- * `/meetup`, which has the limit, and counted there.
+ * `/meetup`, which has the limit, and counted there; a form whose work fails unexpectedly (the
+ * post Discord refused) gives that use back (`carriesOn`, plan 8S-3).
  */
 export const meetupFormControls: ComponentHandler = {
   kind: MEETUP_KIND,
   guards: [requireGuild],
+  carriesOn: (interaction, id) => {
+    const asked = pending.peek(id.id, interaction.user.id);
+    return typeof asked === 'object'
+      ? { ...MEETUP_THROTTLE, as: MEETUP_NAME, countedAt: asked.value.openedAt }
+      : undefined;
+  },
 
   async modal(interaction, id, ctx) {
     if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
diff --git a/src/commands/util/counters-dialog.test.ts b/src/commands/util/counters-dialog.test.ts
index 5ea04cfc..652d5d84 100644
--- a/src/commands/util/counters-dialog.test.ts
+++ b/src/commands/util/counters-dialog.test.ts
@@ -380,9 +380,14 @@ describe('/counters: Change options…', () => {
     const made = await setup();
     // Alice's use of the command is one of her three.
     const { token } = await made.ask();
-    await made.submit(token, ALICE);
-    await made.submit(token, ALICE);
-    expect(sent((await made.submit(token, ALICE)).reply).content).toBe(
+    // Submits that work: the asker's change of the answer, a components-v2 message, in its place
+    // (one that failed would be given back).
+    const onAnswer = { v2Message: true };
+    for (let n = 0; n < 2; n++) {
+      const submitted = await made.submit(token, ALICE, {}, [], onAnswer);
+      expect(submitted.followUp).not.toHaveBeenCalled();
+    }
+    expect(sent((await made.submit(token, ALICE, {}, [], onAnswer)).reply).content).toBe(
       'You can use /counters again in 1 minute.',
     );
     const again = fakeChatInput({
diff --git a/src/commands/util/rank.test.ts b/src/commands/util/rank.test.ts
index 4391a7c4..5b6bcbec 100644
--- a/src/commands/util/rank.test.ts
+++ b/src/commands/util/rank.test.ts
@@ -337,6 +337,9 @@ describe('/rank: the buttons under an answer', () => {
         customId: 'rank:mewtwo:show:great:10-12-13:none:0',
         userId: member,
         askedBy: member,
+        // The answer of /rank is a components-v2 message: a press that worked (one that failed
+        // would be given back).
+        v2Message: true,
       });
       await own.handle(last as never);
     }
diff --git a/src/discord/command.ts b/src/discord/command.ts
index 1501b03c..03e168b4 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -314,6 +314,17 @@ export interface ComponentHandler {
     interaction: MessageComponentInteraction | ModalSubmitInteraction,
     id: CustomId,
   ) => ControlThrottle | undefined;
+  /**
+   * For a form whose command counted the use when it opened it (`/meetup`'s): that command's
+   * limit and window (`as`), and when the use was counted (`countedAt`, the form's opening).
+   * Nothing is counted here, but an unexpected error gives that use back, as the router gives
+   * back every use whose work failed (plan 8S-3), to the window it was counted in only.
+   * Undefined for a form it knows nothing of (expired, another member's): nothing goes back.
+   */
+  carriesOn?: (
+    interaction: MessageComponentInteraction | ModalSubmitInteraction,
+    id: CustomId,
+  ) => (ControlThrottle & { countedAt: number }) | undefined;
   button?: (interaction: ButtonInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   select?: (interaction: AnySelectMenuInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
   modal?: (interaction: ModalSubmitInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index 2b43b938..35c25d8f 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -30,7 +30,7 @@ import {
 } from './command.js';
 import { UserError } from './errors.js';
 import { answer } from './late-reply.js';
-import { controlThrottleKey, InteractionRouter, STALE_COMPONENT } from './router.js';
+import { controlThrottleKey, InteractionRouter, STALE_COMPONENT, whenCounted } from './router.js';
 import { Throttles } from './throttle.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import type { ChatInputCommandInteraction } from 'discord.js';
@@ -435,6 +435,50 @@ describe('InteractionRouter', () => {
     expect(execute).toHaveBeenCalledTimes(4);
   });
 
+  it('gives back the use of a command that failed unexpectedly, but not of one it refused', async () => {
+    const { ctx } = createTestContext();
+    let fail: Error | undefined = new Error('Missing Access');
+    const execute = vi.fn(() => (fail ? Promise.reject(fail) : Promise.resolve()));
+    const router = new InteractionRouter(
+      ctx,
+      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
+      [],
+    );
+    const use = async () => {
+      const i = fakeChatInput();
+      await router.handle(asInteraction(i));
+      return i;
+    };
+    // Failed, the use is given back: the member may try again at once.
+    expect(sent((await use()).reply).content).toMatch(/^Something went wrong/);
+    fail = new UserError('No such gym.');
+    expect(sent((await use()).reply).content).toBe('No such gym.');
+    // A refusal is the member's: it counted.
+    expect(sent((await use()).reply).content).toBe('You can use /test again in 1 minute.');
+    expect(execute).toHaveBeenCalledTimes(2);
+  });
+
+  it('tells the command when it counted its use, by its own clock', async () => {
+    const { ctx } = createTestContext();
+    let seen: number | undefined;
+    const execute = vi.fn((interaction: ChatInputCommandInteraction) => {
+      seen = whenCounted(interaction);
+      return Promise.resolve();
+    });
+    const router = new InteractionRouter(
+      ctx,
+      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
+      [],
+      { now: () => 5_000 },
+    );
+    await router.handle(asInteraction(fakeChatInput()));
+    expect(seen).toBe(5_000);
+    // A command without a limit counted nothing.
+    const free = new InteractionRouter(ctx, [command({ execute })], [], { now: () => 5_000 });
+    await free.handle(asInteraction(fakeChatInput()));
+    expect(seen).toBeUndefined();
+  });
+
   it('counts the uses of another name of a command as the command’s, and names the name typed', async () => {
     const { ctx } = createTestContext();
     const execute = ran();
@@ -1107,6 +1151,51 @@ describe('InteractionRouter', () => {
     expect([button.mock.calls.length, modal.mock.calls.length]).toEqual([1, 1]);
   });
 
+  it('gives back the use of a control that failed, and of the command whose use its form carries on', async () => {
+    const { ctx } = createTestContext();
+    let fails = true;
+    const execute = ran();
+    const modal = vi.fn(() =>
+      fails ? Promise.reject(new Error('Missing Access')) : Promise.resolve(),
+    );
+    const button = vi.fn(() => Promise.reject(new Error('Unknown interaction')));
+    const router = new InteractionRouter(
+      ctx,
+      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
+      [
+        {
+          kind: 'p',
+          throttle: (_interaction, id) =>
+            id.action === 'press' ? { uses: 1, perSeconds: 60 } : undefined,
+          // The form of `/test`: its command counted the use, which a failure here gives back.
+          carriesOn: (_interaction, id) =>
+            id.action === 'form'
+              ? { uses: 1, perSeconds: 60, as: 'test', countedAt: Date.now() }
+              : undefined,
+          button,
+          modal,
+        },
+      ],
+    );
+    const run = async () => {
+      const i = fakeChatInput();
+      await router.handle(asInteraction(i));
+      return i;
+    };
+    await run();
+    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
+    await run();
+    fails = false;
+    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
+    expect(sent((await run()).reply).content).toBe('You can use /test again in 1 minute.');
+    expect(execute).toHaveBeenCalledTimes(2);
+    // A press that failed is given back too.
+    for (let n = 0; n < 2; n++) {
+      await router.handle(asInteraction(fakeButton({ customId: 'p:abc:press' })));
+    }
+    expect(button).toHaveBeenCalledTimes(2);
+  });
+
   it('keeps the budget of a kind of control apart from a command of a like name', async () => {
     const { ctx } = createTestContext();
     const execute = ran();
@@ -1314,6 +1403,18 @@ describe('InteractionRouter and message commands', () => {
     expect(sent(full.reply).content).toBe('You can use /report again in 60 minutes.');
   });
 
+  it('gives back the use of a message command that failed unexpectedly', async () => {
+    const { ctx } = createTestContext();
+    const run = vi.fn(() => Promise.reject(new Error('Missing Access')));
+    const router = new InteractionRouter(
+      ctx,
+      [onMessage({ throttle: { uses: 1, perSeconds: 3600 }, run })],
+      [],
+    );
+    for (let n = 0; n < 2; n++) await router.handle(asInteraction(used()));
+    expect(run).toHaveBeenCalledTimes(2);
+  });
+
   it('acknowledges privately first when the command asks for it', async () => {
     const { ctx } = createTestContext();
     const i = used();
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 07be1272..94c07134 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -120,6 +120,19 @@ export function variedThrottleKey(key: string, throttle: Throttle): string {
   return `${key}\n${throttle.perSeconds}/${throttle.uses}`;
 }
 
+/** When the router counted the use of each command or control it runs, by the router's clock. */
+const counted = new WeakMap<object, number>();
+
+/**
+ * When the router counted this use of a command against its limit (`RouterOptions.now`), for a
+ * handler that hands the use on (`/meetup`'s form, `/raid`'s menu: `carriesOn`), so that a
+ * failure gives it back to the window it was counted in and no handler reads a clock of its own
+ * for it (plan 8S-3); undefined where nothing was counted.
+ */
+export function whenCounted(interaction: object): number | undefined {
+  return counted.get(interaction);
+}
+
 export class InteractionRouter {
   private readonly commands = new Map<string, CommandModule>();
   /** The message commands (Discord's Apps menu on a message), by the name the menu shows. */
@@ -262,7 +275,7 @@ export class InteractionRouter {
   ): Promise<number | undefined> {
     const found = this.find(interaction);
     let deferMs: number | undefined;
-    await this.guarded(interaction, async () => {
+    await this.guarded(interaction, async (spend) => {
       if (!found) {
         this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
         throw new UserError(UNKNOWN_COMMAND);
@@ -282,9 +295,12 @@ export class InteractionRouter {
           : handler.throttle;
       if (throttle) {
         // The limits of a command that has several are counted apart, each under what it is.
-        const counted = varies ? variedThrottleKey(key, throttle) : key;
-        const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
+        const window = varies ? variedThrottleKey(key, throttle) : key;
+        const now = this.now();
+        const wait = this.throttles.use(window, interaction.user.id, throttle, now);
         if (wait !== undefined) throw new UserError(commandRefusal(name, waitText(wait)));
+        spend({ key: window, throttle, countedAt: now });
+        counted.set(interaction, now);
       }
       const defer =
         typeof handler.defer === 'function' ? handler.defer(interaction, this.ctx) : handler.defer;
@@ -334,7 +350,7 @@ export class InteractionRouter {
   ): Promise<number | undefined> {
     const command = this.messageCommands.get(interaction.commandName);
     let deferMs: number | undefined;
-    await this.guarded(interaction, async () => {
+    await this.guarded(interaction, async (spend) => {
       if (!command) {
         this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
         throw new UserError(UNKNOWN_COMMAND);
@@ -351,10 +367,13 @@ export class InteractionRouter {
         );
       }
       if (throttle) {
-        const wait = this.throttles.use(name, interaction.user.id, throttle, this.now());
+        const now = this.now();
+        const wait = this.throttles.use(name, interaction.user.id, throttle, now);
         if (wait !== undefined) {
           throw new UserError(`You can use ${name} again in ${waitText(wait)}.`);
         }
+        spend({ key: name, throttle, countedAt: now });
+        counted.set(interaction, now);
       }
       const defer =
         typeof command.defer === 'function' ? command.defer(interaction, this.ctx) : command.defer;
@@ -433,7 +452,7 @@ export class InteractionRouter {
   ): Promise<void> {
     const id = decodeCustomId(interaction.customId);
     const handler = id ? this.components.get(id.kind) : undefined;
-    await this.guarded(interaction, async () => {
+    await this.guarded(interaction, async (spend) => {
       const run = id && handler ? runnerFor(handler, interaction, id, this.ctx) : undefined;
       if (!id || !handler || !run) {
         // Not a custom id of this bot (or of its legacy version), a kind nobody handles any more,
@@ -464,13 +483,16 @@ export class InteractionRouter {
           ? handler.throttle(interaction, id)
           : handler.throttle;
       if (throttle) {
-        const wait = this.throttles.use(
-          windowOf(throttle),
-          interaction.user.id,
-          throttle,
-          this.now(),
-        );
+        const now = this.now();
+        const wait = this.throttles.use(windowOf(throttle), interaction.user.id, throttle, now);
         if (wait !== undefined) throw new UserError(controlRefusal(throttle, waitText(wait)));
+        spend({ key: windowOf(throttle), throttle, countedAt: now });
+        counted.set(interaction, now);
+      }
+      // A form whose command counted the use (`/meetup`'s): a failure here gives it back there.
+      const carried = handler.carriesOn?.(interaction, id);
+      if (carried) {
+        spend({ key: windowOf(carried), throttle: carried, countedAt: carried.countedAt });
       }
       await run();
     });
@@ -490,9 +512,20 @@ export class InteractionRouter {
     if (wait !== undefined) throw new UserError(refusal(waitText(wait)));
   }
 
-  private async guarded(interaction: Answered, run: () => Promise<void>): Promise<void> {
+  /**
+   * Runs the work of an interaction and answers what it threw: a `UserError` as its text (or its
+   * message), anything else as "Something went wrong" with a reference, logged. `run` notes each
+   * use it counted (`spend`); an unexpected error gives them back (plan 8S-3: a `/meetup` whose
+   * post Discord refused did not count), at most as many in a window as it allows
+   * (`Throttles.giveBack`). A refusal is the member's and stays counted.
+   */
+  private async guarded(
+    interaction: Answered,
+    run: (spend: (spent: Spent) => void) => Promise<void>,
+  ): Promise<void> {
+    const spent: Spent[] = [];
     try {
-      await run();
+      await run((one) => spent.push(one));
     } catch (err) {
       let content: string;
       let ref: string | undefined;
@@ -515,6 +548,9 @@ export class InteractionRouter {
         ref = randomBytes(3).toString('hex');
         this.ctx.log.error({ err, ref, interaction: describe(interaction) }, 'interaction failed');
         content = genericError(ref);
+        for (const { key, throttle, countedAt } of spent) {
+          this.throttles.giveBack(key, interaction.user.id, throttle, this.now(), countedAt);
+        }
       }
       await replyEphemeral(interaction, content).catch((replyErr: unknown) =>
         this.ctx.log.warn(
@@ -526,6 +562,16 @@ export class InteractionRouter {
   }
 }
 
+/**
+ * A use counted in a window (`key`) by its limit, given back when its work fails; `countedAt`
+ * when it was counted, so that it goes back only to the window it was counted in.
+ */
+interface Spent {
+  key: string;
+  throttle: Throttle;
+  countedAt: number;
+}
+
 /** What a member is told who used a command too often: its name, as typed. */
 function commandRefusal(name: string, wait: string): string {
   return `You can use /${name} again in ${wait}.`;
diff --git a/src/discord/throttle.test.ts b/src/discord/throttle.test.ts
index 5e4cc5ae..a6493217 100644
--- a/src/discord/throttle.test.ts
+++ b/src/discord/throttle.test.ts
@@ -49,6 +49,39 @@ describe('Throttles', () => {
     expect(throttles.size).toBe(1);
   });
 
+  it('gives a use back, as many as the window allows at most, and only while it is open', () => {
+    const throttles = new Throttles();
+    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0);
+    throttles.giveBack('raid', ALICE, RAID, T0 + 1_000, T0);
+    expect(throttles.use('raid', ALICE, RAID, T0 + 2_000)).toBeUndefined();
+    expect(throttles.use('raid', ALICE, RAID, T0 + 2_000)).toBe(898);
+    // Three given back in all: a use that keeps failing is held to twice the limit.
+    throttles.giveBack('raid', ALICE, RAID, T0 + 3_000, T0);
+    throttles.giveBack('raid', ALICE, RAID, T0 + 3_000, T0);
+    throttles.giveBack('raid', ALICE, RAID, T0 + 3_000, T0);
+    expect(throttles.use('raid', ALICE, RAID, T0 + 4_000)).toBeUndefined();
+    expect(throttles.use('raid', ALICE, RAID, T0 + 4_000)).toBeUndefined();
+    expect(throttles.use('raid', ALICE, RAID, T0 + 4_000)).toBe(896);
+    // Nothing to give back to another member, nor to a window that has closed.
+    throttles.giveBack('raid', BOB, RAID, T0, T0);
+    expect(throttles.size).toBe(1);
+    throttles.giveBack('raid', ALICE, RAID, T0 + 900_000, T0);
+    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0 + 900_000);
+    expect(throttles.use('raid', ALICE, RAID, T0 + 900_000)).toBe(900);
+  });
+
+  it('gives back nothing to a window opened after the use was counted', () => {
+    const throttles = new Throttles();
+    throttles.use('raid', ALICE, RAID, T0);
+    // The use of T0 failed only once its window had closed and a new one was full.
+    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0 + 900_000);
+    throttles.giveBack('raid', ALICE, RAID, T0 + 900_500, T0);
+    expect(throttles.use('raid', ALICE, RAID, T0 + 901_000)).toBe(899);
+    // A use counted in the new window is given back there.
+    throttles.giveBack('raid', ALICE, RAID, T0 + 901_000, T0 + 900_000);
+    expect(throttles.use('raid', ALICE, RAID, T0 + 901_000)).toBeUndefined();
+  });
+
   it('forgets closed windows when it holds many', () => {
     const throttles = new Throttles();
     const once = { uses: 1, perSeconds: 60 };
diff --git a/src/discord/throttle.ts b/src/discord/throttle.ts
index ec5033cf..21ee0392 100644
--- a/src/discord/throttle.ts
+++ b/src/discord/throttle.ts
@@ -21,7 +21,10 @@ const PRUNE_ABOVE = 5_000;
  * restart forgets it.
  */
 export class Throttles {
-  private readonly windows = new Map<string, { closes: number; uses: number }>();
+  private readonly windows = new Map<
+    string,
+    { opened: number; closes: number; uses: number; givenBack: number }
+  >();
 
   /**
    * Records one use at time `now` (epoch milliseconds). Answers undefined when it is allowed,
@@ -32,7 +35,12 @@ export class Throttles {
     const window = this.windows.get(key);
     if (!window || now >= window.closes) {
       if (this.windows.size >= PRUNE_ABOVE) this.prune(now);
-      this.windows.set(key, { closes: now + throttle.perSeconds * 1000, uses: 1 });
+      this.windows.set(key, {
+        opened: now,
+        closes: now + throttle.perSeconds * 1000,
+        uses: 1,
+        givenBack: 0,
+      });
       return undefined;
     }
     if (window.uses < throttle.uses) {
@@ -52,6 +60,28 @@ export class Throttles {
     return Math.ceil((window.closes - now) / 1000);
   }
 
+  /**
+   * Gives back a use recorded in the member's window, while it is open: one whose work failed
+   * for no fault of the member (plan 8S-3; the router does it on an unexpected error).
+   * `countedAt` is when the use was counted: a window opened after it (the use's own closed
+   * meanwhile, as a `/meetup` form may outlive it) gets nothing back. At most `throttle.uses` a
+   * window, so that a use that keeps failing is held to twice the limit.
+   */
+  giveBack(
+    command: string,
+    userId: string,
+    throttle: Throttle,
+    now: number,
+    countedAt: number,
+  ): void {
+    const window = this.windows.get(`${command}\n${userId}`);
+    if (!window || now >= window.closes || window.uses === 0) return;
+    if (window.opened > countedAt) return;
+    if (window.givenBack >= throttle.uses) return;
+    window.uses -= 1;
+    window.givenBack += 1;
+  }
+
   /** How many members' windows are held; for tests. */
   get size(): number {
     return this.windows.size;
diff --git a/src/web/acting.ts b/src/web/acting.ts
index a5f67763..3676afbb 100644
--- a/src/web/acting.ts
+++ b/src/web/acting.ts
@@ -132,6 +132,21 @@ export function isMapBotStaff(
   return isBotManagement(standing?.roleNames ?? [], userId, ownerId);
 }
 
+/**
+ * Gives back a use `throttledOnTheMap` counted in a command's window, as the router gives back
+ * the use of a command whose work failed unexpectedly (plan 8S-3: a meetup whose post Discord
+ * refused), to the window open at `countedAt` (when it was counted) only.
+ */
+export function givenBackOnTheMap(
+  deps: WebDeps,
+  command: string,
+  userId: string,
+  throttle: Throttle,
+  countedAt: number,
+): void {
+  deps.parties.throttles.giveBack(command, userId, throttle, deps.now(), countedAt);
+}
+
 /**
  * Counts a write of the member in the router's window of a command (its name) or a control
  * (`controlThrottleKey`), as a use there counts: undefined when it may go on, or the answer sent
diff --git a/src/web/meetup-make.test.ts b/src/web/meetup-make.test.ts
index 801304d9..2216fdb9 100644
--- a/src/web/meetup-make.test.ts
+++ b/src/web/meetup-make.test.ts
@@ -293,6 +293,19 @@ describe('making a meetup on the map', () => {
     expect(map.meetups()).toEqual([]);
   });
 
+  it('gives the use back when the meetup could not be made for no fault of the member', async () => {
+    const map = await making();
+    web = map.web;
+    map.made.gateway.failing.set('createPost', new Error('Discord is away'));
+    for (let n = 0; n < 2; n++) {
+      expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(500);
+    }
+    map.made.gateway.failing.delete('createPost');
+    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
+    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(200);
+    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(429);
+  });
+
   it("says in /meetup's words that the moderators could not be asked, and keeps nothing", async () => {
     const map = await making({ channel: false });
     web = map.web;
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index 503ab302..c6843b91 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -54,6 +54,7 @@ import { problemText } from '../render/activity.js';
 import { MEETUP_PLACE_KINDS } from '../services/place-finder.js';
 import {
   actingOnTheMap,
+  givenBackOnTheMap,
   isMapBotStaff,
   isMapStaff,
   memberOrFailure,
@@ -328,21 +329,29 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       MEETUP_THROTTLE,
     );
     if (throttled) return throttled;
-    const answer = await makeMeetupAs(
-      ctx,
-      {
-        serverId: guild,
-        regionChannelId: region.channelId,
-        maker: acting.member,
-        place: where.place,
-        name: body.data.name,
-        startTime,
-        description: body.data.info,
-        staff,
-        source: 'map',
-      },
-      names,
-    );
+    const countedAt = deps.now();
+    let answer: Awaited<ReturnType<typeof makeMeetupAs>>;
+    try {
+      answer = await makeMeetupAs(
+        ctx,
+        {
+          serverId: guild,
+          regionChannelId: region.channelId,
+          maker: acting.member,
+          place: where.place,
+          name: body.data.name,
+          startTime,
+          description: body.data.info,
+          staff,
+          source: 'map',
+        },
+        names,
+      );
+    } catch (err) {
+      // No fault of the member's (a post Discord refused): the use is given back, as on Discord.
+      givenBackOnTheMap(deps, MEETUP_COMMAND, userId, MEETUP_THROTTLE, countedAt);
+      throw err;
+    }
     deps.log.info(
       { user: userId, guild, region: region.id, outcome: answer.kind },
       'a meetup was made on the map',
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index 4cb55eff..b5ceb1fd 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -67,6 +67,7 @@ import { timestamp } from '../render/text.js';
 import type { Member } from '../services/attendance-service.js';
 import {
   actingOnTheMap,
+  givenBackOnTheMap,
   isMapBotStaff,
   isMapStaff,
   memberOrFailure,
@@ -423,17 +424,25 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       TRAIN_THROTTLE,
     );
     if (throttled) return throttled;
-    const made = await startTrainAs(
-      ctx,
-      acting.member,
-      {
-        name: body.data.name,
-        regionChannelId: region.channelId,
-        ...(body.data.atEnd === undefined ? {} : { atEnd: body.data.atEnd }),
-        ...(start === undefined ? {} : { start }),
-      },
-      names,
-    );
+    const countedAt = deps.now();
+    let made: Awaited<ReturnType<typeof startTrainAs>>;
+    try {
+      made = await startTrainAs(
+        ctx,
+        acting.member,
+        {
+          name: body.data.name,
+          regionChannelId: region.channelId,
+          ...(body.data.atEnd === undefined ? {} : { atEnd: body.data.atEnd }),
+          ...(start === undefined ? {} : { start }),
+        },
+        names,
+      );
+    } catch (err) {
+      // No fault of the member's (a post Discord refused): the use is given back, as on Discord.
+      givenBackOnTheMap(deps, TRAIN_COMMAND, userId, TRAIN_THROTTLE, countedAt);
+      throw err;
+    }
     deps.log.info(
       { user: userId, guild, region: region.id, outcome: made.kind },
       'a train was started on the map',
diff --git a/src/web/train-start.test.ts b/src/web/train-start.test.ts
index 3cb587c0..157823be 100644
--- a/src/web/train-start.test.ts
+++ b/src/web/train-start.test.ts
@@ -175,6 +175,19 @@ describe('starting a train on the map', () => {
     expect(again.headers['retry-after']).toBeDefined();
   });
 
+  it('gives the use back when the train could not be started for no fault of the member', async () => {
+    const map = await starting();
+    web = map.web;
+    map.made.gateway.failing.set('createPost', new Error('Discord is away'));
+    for (let n = 0; n < 2; n++) {
+      expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(500);
+    }
+    map.made.gateway.failing.delete('createPost');
+    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(200);
+    expect((await map.start({ region: 1, name: 'Lake loop' })).status).toBe(200);
+    expect((await map.start({ region: 1, name: 'Hill loop' })).status).toBe(429);
+  });
+
   it('counts in the window of /train: two from the map and Discord together', async () => {
     const throttles = new Throttles();
     const map = await starting({ throttles });
````

### Task 4: Plan 8S-3 T4: Posts where the bot may not make them: said plainly, uncounted, logged once

Prototype commit: `220fa66f88346a81f6edbe3c1bb019e20b791c73`

Staging of 8S-2: where the bot lacked Manage Threads in a forum (Discord
shows it as "Manage Posts" there), making a party's post failed with
Missing Access (50001) and the member saw only "Something went wrong".
Discord's documentation: a moderated tag (Pine's tags are) can be applied
only with Manage Threads; archiving and locking a post at its end, its pin
and its tags need it as well, so a post made without its tag would still
break at its end. The post is therefore not made:

- `DiscordPartyGateway.createPost` refuses from the cache, before asking
  Discord, where the bot lacks what the post needs in the forum (`postNeeds`
  of `src/domain/party/post-permissions.ts`, names only, so the render needs
  no discord.js: View Channel, Create Posts, Send Messages in Posts, and
  Manage Posts only for a post with tags; a region's summary has none and is
  made as before, only its pin warns), and takes a Missing Access answer as
  the same refusal (`PostsRefusedError`, with what it lacks, none known for
  Discord's answer).
- `PartyService` keeps nothing, answers `no-post` with `refused` (raids,
  meetups, trains, a raid's move, a train's split) and logs a warning once
  per forum while it runs. `/admin setup-forums` says plainly what the bot
  lacks for a summary it may not make (`summaryRefusedWords`), and a summary
  it made but could not pin: "posted the list of active raids (I could not
  pin it: give me Manage Posts there)" (`ForumSetup.unpinned`).
- Members are told `noPostWords`: "I am not allowed to make posts in
  <forum>: I lack the permission Manage Posts there. Nothing was made. The
  server's staff must give it to me." (`/raid`, screenshots, `/meetup`,
  `/train`, the split, the map); a move names the forum and what is missing
  (`postsRefusedMoveWords`), and so does an approved meetup's failure
  (`postsRefusedFailure`).
- A refusal can say it is none of the member's doing (`UserError`
  `givesBack`): the router gives the use back. Every `no-post` is (refused,
  or a post lost while it was made): `/meetup` (also the moderators not
  reached), `/train` and `/raid` use it (`/raid`'s gym menu and buttons
  carry its use on, `carriesOn`), and so do the map's meetups, trains and
  raids (the map's raids also on an unexpected error); a screenshot's image
  gives its use of the trigger's throttle back, also once its gym question
  is answered. `/raid` says it once, in its own answer (in place of its
  menu, beside the screenshot's feedback button): `UserError` `said`, which
  the router answers no more.
- `cutover-check` names the permissions of a forum as the forum's settings
  do: "Manage Posts (Manage Threads)", "Create Posts (Send Messages)",
  "Send Messages in Posts (...)" (`inForum`).
- The fake gateway refuses a post in a forum of `refusePosts` (what the bot
  lacks there) as the gateway does, and a pin there without Manage Posts;
  `losePosts` loses every new post while it is made.

**Files:**

```
 src/commands/admin/setup-forums.test.ts          |  34 ++++++++++++++++++
 src/commands/admin/setup-forums.ts               |  10 +++++-
 src/commands/meetups/meetup.test.ts              |  15 ++++++++
 src/commands/meetups/meetup.ts                   |  21 +++++++----
 src/commands/raids/location.test.ts              |  20 +++++++++++
 src/commands/raids/location.ts                   |   3 +-
 src/commands/raids/raid-changes.ts               |  18 ++++++++--
 src/commands/raids/raid-screenshot.test.ts       |  13 ++++++-
 src/commands/raids/raid.test.ts                  |  81 ++++++++++++++++++++++++++++++++++++++++--
 src/commands/raids/raid.ts                       |  67 ++++++++++++++++++++++++++++-------
 src/commands/raids/report.ts                     |   4 +--
 src/commands/screenshots/mention.test.ts         |  54 ++++++++++++++++++++++++++++
 src/commands/screenshots/mention.ts              |  34 +++++++++++++++---
 src/commands/trains/train-changes.ts             |  16 ++++++---
 src/commands/trains/train.test.ts                |  16 +++++++++
 src/commands/trains/train.ts                     |   4 ++-
 src/discord/errors.ts                            |  15 ++++++--
 src/discord/party-gateway.test.ts                |  74 ++++++++++++++++++++++++++++++++++++++
 src/discord/party-gateway.ts                     |  70 ++++++++++++++++++++++++++++++------
 src/discord/router.test.ts                       |  18 ++++++++++
 src/discord/router.ts                            |  14 +++++---
 src/domain/party/party.ts                        |   2 ++
 src/domain/party/post-permissions.ts             |  34 ++++++++++++++++++
 src/ops/cutover-check.test.ts                    |   6 +++-
 src/ops/cutover-check.ts                         |  15 ++++++--
 src/ops/permissions.ts                           |  18 ++++++++++
 src/render/activity.test.ts                      |  44 ++++++++++++++++++++++-
 src/render/activity.ts                           | 103 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/meetup-safety.test.ts               |  21 +++++++++++
 src/services/meetup-safety.ts                    |   8 ++++-
 src/services/party-service.posts-refused.test.ts |  65 ++++++++++++++++++++++++++++++++++
 src/services/party-service.relocate.test.ts      |  13 +++++++
 src/services/party-service.ts                    | 122 +++++++++++++++++++++++++++++++++++++++++++++------------------
 src/services/raid-change-service.ts              |  10 ++++--
 src/web/meetup-make.test.ts                      |  22 ++++++++++++
 src/web/meetup-routes.ts                         |   4 +++
 src/web/raid-report.test.ts                      |  23 ++++++++++++
 src/web/raid-routes.ts                           |  26 ++++++++++----
 src/web/train-routes.ts                          |   8 ++++-
 src/web/train-start.test.ts                      |  16 +++++++++
 test/support/fake-gateway.ts                     |  33 ++++++++++++++++-
 41 files changed, 1088 insertions(+), 106 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/setup-forums.test.ts src/commands/meetups/meetup.test.ts src/commands/raids/location.test.ts src/commands/raids/raid-screenshot.test.ts src/commands/raids/raid.test.ts src/commands/screenshots/mention.test.ts src/commands/trains/train.test.ts src/discord/party-gateway.test.ts src/discord/router.test.ts src/ops/cutover-check.test.ts src/render/activity.test.ts src/services/meetup-safety.test.ts src/services/party-service.posts-refused.test.ts src/services/party-service.relocate.test.ts src/web/meetup-make.test.ts src/web/raid-report.test.ts src/web/train-start.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 220fa66f88346a81f6edbe3c1bb019e20b791c73 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-3 T4: Posts where the bot may not make them: said plainly, uncounted, logged once`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index 04ee8ccd..f5c494c9 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -271,6 +271,40 @@ describe('/admin setup-forums', () => {
     expect(entries.some((entry) => entry.level === 50 && entry.region === 3)).toBe(true);
   });
 
+  it('posts the summary where the bot lacks only Manage Posts, and says plainly what else it lacks', async () => {
+    const { run, gateway, regions } = await setup();
+    // The summary has no tags: Manage Posts is not needed to make it (only to pin it).
+    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    gateway.refusePosts.set(EAST_FORUM, ['Create Posts']);
+    const text = sent((await run()).editReply).content ?? '';
+    expect(text).toContain(
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
+        'list of active raids (I could not pin it: give me Manage Posts there).',
+    );
+    expect(
+      gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? ''),
+    ).toMatchObject({ pinned: false });
+    expect(text).toContain(
+      `<#${EAST_CHANNEL}>: I am not allowed to post the list of active raids in <#${EAST_FORUM}>: ` +
+        'I lack the permission Create Posts there. Give it to me and run this again.',
+    );
+    gateway.refusePosts.set(EAST_FORUM, []);
+    expect(sent((await run()).editReply).content).toContain(
+      `<#${EAST_CHANNEL}>: Discord does not let me post the list of active raids in <#${EAST_FORUM}>. ` +
+        'Check that I have View Channel, Create Posts, Send Messages in Posts and Manage Posts ' +
+        'there, and run this again.',
+    );
+  });
+
+  it('says so when the summary could not be pinned for another reason', async () => {
+    const { run, gateway } = await setup();
+    gateway.failing.set('pinPost', new Error('Discord is away'));
+    expect(sent((await run()).editReply).content).toContain(
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
+        'list of active raids (I could not pin it; see the log).',
+    );
+  });
+
   it('reports a forum that already belongs to another region', async () => {
     const { run, regions } = await setup();
     regions.setForum = () => Promise.resolve('forum-taken' as const);
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index a86954cd..c3cacab6 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -30,6 +30,14 @@ const HIDE_BY_HAND =
   '(my member or my own role), the staff roles (those settings.rehearsal.staffRoles names, and ' +
   'every role with Manage Server or Administrator) and the testers.';
 
+/** A new summary post, and whether it could be pinned (Discord refuses a pin without Manage Posts). */
+function summaryWords(unpinned: ForumSetup['unpinned']): string {
+  if (unpinned === undefined) return 'posted and pinned the list of active raids';
+  return unpinned === 'refused'
+    ? 'posted the list of active raids (I could not pin it: give me Manage Posts there)'
+    : 'posted the list of active raids (I could not pin it; see the log)';
+}
+
 function line(result: ForumSetup): string {
   const { region } = result;
   if (result.forum === 'no-channel') {
@@ -55,7 +63,7 @@ function line(result: ForumSetup): string {
       : []),
     ...(result.renamed ? ['renamed it'] : []),
     ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
-    ...(result.summary ? ['posted and pinned the list of active raids'] : []),
+    ...(result.summary ? [summaryWords(result.unpinned)] : []),
     ...(result.hidden === 'hidden'
       ? [
           result.refused === undefined
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index 6558a9ab..f76b2e11 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -301,6 +301,21 @@ describe('/meetup', () => {
     expect(made.meetups()).toHaveLength(2);
   });
 
+  it('says plainly that the bot may not make posts in the forum, and does not count it', async () => {
+    const made = await setup();
+    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    for (let n = 0; n < 2; n++) {
+      expect((await made.run(`Try ${String(n)}`)).told).toContain(
+        `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage Posts ` +
+          "there. Nothing was made. The server's staff must give it to me.",
+      );
+    }
+    made.gateway.refusePosts.delete(WEST_FORUM);
+    expect((await made.run('First')).told).toMatch(/^Your meetup is made\./);
+    await made.run('Second');
+    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again/);
+  });
+
   it('gives back nothing to a window opened after the failed form’s use was counted', async () => {
     const made = await setup();
     const old = await made.command('Old');
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index f27202ee..83aa5ce2 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -17,7 +17,7 @@ import type { Place } from '../../domain/geo/place.js';
 import { mayRequestReview, type MeetupVerdict } from '../../domain/meetups/safety.js';
 import { tidyDescription } from '../../domain/party/meetup.js';
 import { MAX_PARTY_NAME, type MeetupParty } from '../../domain/party/party.js';
-import { NO_POST_MADE, problemText } from '../../render/activity.js';
+import { noPostWords, problemText } from '../../render/activity.js';
 import { blockedAnswer } from '../../render/meetup-safety.js';
 import type { MakeAsk } from '../../services/meetup-safety.js';
 import { EXPIRED, PendingRequests } from '../../services/pending-requests.js';
@@ -346,7 +346,8 @@ async function submitted(
   asked: PendingMeetup,
   text: string,
 ): Promise<void> {
-  const refuse = (refusal: string): UserError => new UserError(refusedWithText(refusal, text));
+  const refuse = (refusal: string, givesBack = false): UserError =>
+    new UserError(refusedWithText(refusal, text), { givesBack });
   if (tidyDescription(text) === null) throw refuse(NO_INFORMATION);
   if (asked.startTime <= Date.now()) throw refuse(START_PASSED);
   await interaction.deferReply({ flags: MessageFlags.Ephemeral });
@@ -369,7 +370,7 @@ async function submitted(
     case 'blocked':
       throw blockedRefusal(asked.serverId);
     case 'refused':
-      throw refuse(answer.text);
+      throw refuse(answer.text, answer.givesBack === true);
     case 'held':
       await interaction.editReply({ content: answer.text });
       return;
@@ -391,7 +392,11 @@ export type MeetupMadeAnswer =
   | { kind: 'posted'; party: MeetupParty; text: string }
   | { kind: 'held'; text: string }
   | { kind: 'blocked'; text: string }
-  | { kind: 'refused'; text: string };
+  /**
+   * `givesBack`: none of the maker's doing (the post could not be made, the moderators could not
+   * be asked): the use is given back (plan 8S-3).
+   */
+  | { kind: 'refused'; text: string; givesBack?: true };
 
 /**
  * Makes a meetup as its maker asked, as the form of `/meetup` does (the live map calls it too,
@@ -417,7 +422,7 @@ export async function makeMeetupAs(
     case 'too-soon':
       return refused(MEETUP_TOO_SOON);
     case 'not-sent':
-      return refused(MEETUP_NOT_SENT);
+      return { kind: 'refused', text: MEETUP_NOT_SENT, givesBack: true };
     case 'bad-name':
       return refused(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
     case 'bad-description':
@@ -427,7 +432,11 @@ export async function makeMeetupAs(
     case 'no-forum':
       return refused(noForumWords(names.channel(outcome.region.channelId)));
     case 'no-post':
-      return refused(NO_POST_MADE);
+      return {
+        kind: 'refused',
+        text: noPostWords(outcome.refused, (id) => names.channel(id)),
+        givesBack: true,
+      };
     case 'held':
       return { kind: 'held', text: MEETUP_HELD };
     case 'posted': {
diff --git a/src/commands/raids/location.test.ts b/src/commands/raids/location.test.ts
index 59933893..cd0caeb3 100644
--- a/src/commands/raids/location.test.ts
+++ b/src/commands/raids/location.test.ts
@@ -258,6 +258,26 @@ describe('/location to a gym of another region', () => {
     expect(sent(over.editReply).content).toBe('This raid is over.');
   });
 
+  it('says what the bot lacks in the other region’s forum when it may not post there', async () => {
+    const made = await setup();
+    made.gateway.refusePosts.set(EAST_FORUM, ['Create Posts', 'Manage Posts']);
+    const asked = await made.run({ gym: 'g:7' });
+    const yes = await made.click(asked, 0);
+    expect(sent(yes.editReply).content).toBe(
+      `Nothing was moved. I am not allowed to make posts in <#${EAST_FORUM}>, the other ` +
+        "region's forum: I lack the permissions Create Posts and Manage Posts there. The " +
+        "server's staff must give them to me. The raid stays here.",
+    );
+    made.gateway.refusePosts.set(EAST_FORUM, []);
+    const again = await made.click(await made.run({ gym: 'g:7' }), 0);
+    expect(sent(again.editReply).content).toBe(
+      `Nothing was moved. Discord does not let me make posts in <#${EAST_FORUM}>, the other ` +
+        "region's forum. The server's staff must check that I have View Channel, Create Posts, " +
+        'Send Messages in Posts and Manage Posts there. The raid stays here.',
+    );
+    expect(made.current().gymId).toBe(1);
+  });
+
   it('takes the buttons away and reports the failure when the move fails', async () => {
     const made = await setup();
     const asked = await made.run({ gym: 'g:7' });
diff --git a/src/commands/raids/location.ts b/src/commands/raids/location.ts
index 71fc7f16..d22a1766 100644
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -15,6 +15,7 @@ import { plain, truncate } from '../../render/text.js';
 import { NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
 import { commandRaid, partyOver } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
+import { raidRefusalText } from './raid-changes.js';
 import { gymChoices, reportedGym } from './raid-input.js';
 
 /** The custom-id kind of the question `/location` asks before a move to another region. */
@@ -195,7 +196,7 @@ export const locationControls: ComponentHandler = {
     } else if (outcome.kind === 'refused') {
       const post = outcome.other?.forumPostId;
       await say(
-        `${NOT_MOVED} ${problemText(outcome.reason, ctx.attendance.limits(), 'raid')}` +
+        `${NOT_MOVED} ${raidRefusalText(outcome, ctx.attendance.limits())}` +
           (post ? ` Its post is <#${post}>.` : ''),
       );
     } else {
diff --git a/src/commands/raids/raid-changes.ts b/src/commands/raids/raid-changes.ts
index be85f3b4..658d961c 100644
--- a/src/commands/raids/raid-changes.ts
+++ b/src/commands/raids/raid-changes.ts
@@ -3,7 +3,7 @@ import { UserError } from '../../discord/errors.js';
 import type { RaidParty } from '../../domain/party/party.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { matchNamed } from '../../domain/search/word-match.js';
-import { problemText } from '../../render/activity.js';
+import { postsRefusedMoveWords, problemText } from '../../render/activity.js';
 import { isFarOff, plain, timestamp, truncate } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
@@ -48,6 +48,19 @@ export function timesText(party: RaidParty, now: number = Date.now()): string {
   );
 }
 
+/**
+ * Why a change of a raid was refused, in the posts' words; a move into a forum where the bot may
+ * not make posts names the forum and what it lacks there (plan 8S-3).
+ */
+export function raidRefusalText(
+  outcome: Extract<RaidChangeOutcome, { kind: 'refused' }>,
+  limits: { maxNumber: number },
+): string {
+  return outcome.refused === undefined
+    ? problemText(outcome.reason, limits, 'raid')
+    : postsRefusedMoveWords(outcome.refused, (id) => `<#${id}>`);
+}
+
 /**
  * The answer to a change of a raid: `said` when it changed, `same` when the raid already was so;
  * a refusal in the posts' words, for `gym-taken` with the post of the raid that holds the gym
@@ -67,8 +80,7 @@ export function raidChangeAnswer(
     return {
       kind: 'refused',
       text:
-        problemText(outcome.reason, limits, 'raid') +
-        (named === undefined ? '' : ` Its post is ${named}.`),
+        raidRefusalText(outcome, limits) + (named === undefined ? '' : ` Its post is ${named}.`),
     };
   }
   return {
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index 325849c0..fb2eac73 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -8,7 +8,7 @@ import {
   type FakeInteraction,
   type FakeOptions,
 } from '../../../test/support/fake-interactions.js';
-import { testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { testGym, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { textOf } from '../../../test/support/messages.js';
 import { at, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
@@ -116,6 +116,17 @@ describe('/raid with a screenshot', () => {
     expect(await screenshots.get(id)).toMatchObject({ record: { keepUntil: null } });
   });
 
+  it('says in its answer that the bot may not make the post, and keeps the feedback button', async () => {
+    const { report, gateway, store } = await setup();
+    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    expect(store.active()).toEqual([]);
+    const answer = sent(used.editReply);
+    expect(answer.content).toMatch(/^I am not allowed to make posts in /);
+    expect(rowsOf(answer)[0]?.components[0]).toMatchObject({ label: 'Screenshot feedback' });
+    expect(used.followUp).not.toHaveBeenCalled();
+  });
+
   it('offers the screenshot on the post to anybody, with what was read, while the raid lasts', async () => {
     const { report, store, service, gateway, handle } = await setup();
     await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
diff --git a/src/commands/raids/raid.test.ts b/src/commands/raids/raid.test.ts
index e1fb648e..7c162d6a 100644
--- a/src/commands/raids/raid.test.ts
+++ b/src/commands/raids/raid.test.ts
@@ -20,18 +20,19 @@ import { partyServiceWith } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
-import { InteractionRouter } from '../../discord/router.js';
+import { InteractionRouter, type RouterOptions } from '../../discord/router.js';
 import { Throttles } from '../../discord/throttle.js';
 import type { GymProvider } from '../../services/gym-directory.js';
 import type { GymLookup } from '../../domain/search/gym-lookup.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { NO_POST_MADE } from '../../render/activity.js';
 import { FORUM_TAGS } from '../../render/party-post.js';
 import { raid, raidControls } from './raid.js';
 import { REPORT_BARRED } from './report.js';
 
 const OTHER_MEMBER = '700000000000000002';
 
-async function setup(users?: Parameters<typeof createTestContext>[0]) {
+async function setup(users?: Parameters<typeof createTestContext>[0], routing: RouterOptions = {}) {
   const made = await partyServiceWith();
   const { ctx } = createTestContext({
     partyService: made.service,
@@ -39,7 +40,7 @@ async function setup(users?: Parameters<typeof createTestContext>[0]) {
     regions: made.regions,
     ...users,
   });
-  const router = new InteractionRouter(ctx, [raid], [raidControls]);
+  const router = new InteractionRouter(ctx, [raid], [raidControls], routing);
   const run = async (options: Record<string, string>, extra: object = {}) => {
     const interaction = fakeChatInput({
       commandName: 'raid',
@@ -65,6 +66,14 @@ function customId(interaction: FakeInteraction, index = 0): string {
   return row.toJSON().components[index]?.custom_id ?? '';
 }
 
+/** What a member was told last: a follow-up, else an edit of the deferred answer, else a reply. */
+function told(interaction: FakeInteraction): string | undefined {
+  for (const responder of [interaction.followUp, interaction.editReply, interaction.reply]) {
+    if (responder.mock.calls.length > 0) return sent(responder).content;
+  }
+  return undefined;
+}
+
 describe('/raid', () => {
   beforeEach(() => {
     vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
@@ -359,6 +368,72 @@ describe('/raid', () => {
     );
   });
 
+  it('says plainly when the bot may not make posts in the forum, and does not count it', async () => {
+    const { run, gateway, store } = await setup();
+    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    // More than the twenty a quarter of an hour: none of them counted.
+    for (let n = 0; n < 21; n++) {
+      const refused = await run({ boss: 'e:T5:0', gym: 'g:1' });
+      // Said once, in the answer itself: no second answer below it.
+      expect(sent(refused.editReply).content).toBe(
+        `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage ` +
+          "Posts there. Nothing was made. The server's staff must give it to me.",
+      );
+      expect(refused.followUp).not.toHaveBeenCalled();
+    }
+    gateway.refusePosts.delete(WEST_FORUM);
+    const made = await run({ boss: 'e:T5:0', gym: 'g:1' });
+    expect(sent(made.editReply).content).toMatch(/^Reported: T5 egg at /);
+    expect(store.active()).toHaveLength(1);
+  });
+
+  it('does not count a report from the gym menu whose post the bot may not make', async () => {
+    const { run, handle, gateway } = await setup();
+    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    for (let n = 0; n < 21; n++) {
+      const asked = await run({ boss: 'e:T5:0', gym: 'pinewood' });
+      expect(told(asked)).toBe('Several gyms fit "pinewood". Which one do you mean?');
+      const picked = await handle(fakeSelect({ customId: customId(asked), values: ['12'] }));
+      // The menu's message says it in place of the menu; nothing is said twice.
+      expect(sent(picked.editReply)).toEqual({
+        content: expect.stringMatching(/^I am not allowed to make posts in /) as unknown,
+        components: [],
+      });
+      expect(picked.followUp).not.toHaveBeenCalled();
+    }
+  });
+
+  it('gives a menu’s use back by when the router counted it, never to a later window', async () => {
+    // The router's clock runs an hour behind the one the handlers read.
+    let routerNow = PARTY_NOW - 60 * 60_000;
+    const { run, handle, gateway } = await setup(undefined, { now: () => routerNow });
+    const asked = await run({ boss: 'e:T5:0', gym: 'pinewood' });
+    routerNow += 16 * 60_000;
+    // A new window, full: twenty reports at a gym with a raid already.
+    for (let n = 0; n < 20; n++) await run({ boss: 'e:T5:0', gym: 'g:1' });
+    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    await handle(fakeSelect({ customId: customId(asked), values: ['12'] }));
+    // Counted in the window that closed: nothing goes back to the new one.
+    expect(sent((await run({ boss: 'e:T5:0', gym: 'g:1' })).reply).content).toMatch(
+      /^You can use \/raid again in /,
+    );
+  });
+
+  it('does not count a report whose post was lost while it was made', async () => {
+    const { run, gateway, store } = await setup();
+    gateway.losePosts = true;
+    for (let n = 0; n < 21; n++) {
+      const lost = await run({ boss: 'e:T5:0', gym: 'g:1' });
+      expect(sent(lost.editReply).content).toBe(NO_POST_MADE);
+      expect(lost.followUp).not.toHaveBeenCalled();
+    }
+    gateway.losePosts = false;
+    expect(sent((await run({ boss: 'e:T5:0', gym: 'g:1' })).editReply).content).toMatch(
+      /^Reported: T5 egg at /,
+    );
+    expect(store.active()).toHaveLength(1);
+  });
+
   it('says so when the gym lies in no region', async () => {
     const { run, store } = await setup();
     // Gym 10 lies in no region.
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index 93c400b9..00384ac9 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -16,6 +16,7 @@ import type { ComponentHandler } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, regionChannelOf, requireRegion } from '../../discord/guards.js';
+import { whenCounted } from '../../discord/router.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
 import { storedReport, type StoredReport } from '../../domain/ocr/screenshot-record.js';
@@ -41,6 +42,7 @@ import {
 import {
   DISCORD_NAMES,
   mayJoinAs,
+  RAID_COMMAND,
   RAID_THROTTLE,
   REPORT_BARRED,
   reportAccessOf,
@@ -83,10 +85,19 @@ interface PendingReport {
   screenshot?: FromScreenshot;
   /** Said before what came of the report. */
   note?: string;
+  /**
+   * When `/raid` counted the use (`whenCounted`): a report refused for none of the member's doing
+   * (no post made) gives it back to that window, also from the menu (`carriesOn`).
+   */
+  countedAt: number;
 }
 
 const pending = new PendingRequests<PendingReport>();
 
+/** When the router counted this use of `/raid` (`whenCounted`; now where it counted none). */
+const usedAt = (interaction: ChatInputCommandInteraction): number =>
+  whenCounted(interaction) ?? Date.now();
+
 type Answerable = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;
 
 const gymName = (gym: Gym): string => plain(gym.nickname ?? gym.name);
@@ -119,13 +130,19 @@ async function finish(
     shot && shot.doubts.length > 0
       ? ['', 'From the screenshot I was not sure of this:', ...doubtLines(shot.doubts, shot.clock)]
       : [];
+  const said = truncate(
+    [...(request.note ? [request.note] : []), content, ...unsure].join('\n'),
+    MESSAGE,
+  );
   await interaction.editReply({
-    content: truncate(
-      [...(request.note ? [request.note] : []), content, ...unsure].join('\n'),
-      MESSAGE,
-    ),
+    content: said,
     components: shot?.id === undefined ? [] : [showRow(shot.id)],
   });
+  // No post (the bot may not make posts in the forum, or it was lost while it was made): none of
+  // the member's doing, so that the router gives the use back, and says nothing more (plan 8S-3).
+  if (result.outcome.kind === 'no-post') {
+    throw new UserError(said, { givesBack: true, said: true });
+  }
 }
 
 /**
@@ -243,6 +260,7 @@ function screenshotRequest(
   typed: ReportedBoss | undefined,
   regionChannelId: string | undefined,
   screenshot: FromScreenshot,
+  countedAt: number,
 ): PendingReport {
   return {
     reported: typed ?? screenshotBoss(raid.tier, raid.boss, raid.hatched),
@@ -251,6 +269,7 @@ function screenshotRequest(
     gymIds: [raid.gymId],
     ...(typed === undefined && raid.hatched && raid.boss === null ? { hatched: true } : {}),
     screenshot,
+    countedAt,
   };
 }
 
@@ -279,6 +298,8 @@ async function reportFromScreenshot(
   // Several gyms fit what was typed: the one the screenshot names, if it is one of them.
   const typedHits = gymAnswer?.kind === 'several' ? gymAnswer.gyms : undefined;
   const now = Date.now();
+  // When the router counted the use, before the screenshot was read (which may take minutes).
+  const countedAt = usedAt(interaction);
   // Not read, or not a raid screen, but the member typed the boss and the gym: what they typed
   // is reported, or, when several gyms fit what they typed, they choose among those.
   const typedOnly = async (): Promise<boolean> => {
@@ -290,6 +311,7 @@ async function reportFromScreenshot(
       regionChannelId,
       gymIds: [],
       note: 'I could not read the screenshot, so I used what you typed.',
+      countedAt,
     };
     if (gymAnswer.kind === 'gym') {
       await withGym(interaction, ctx, { ...request, gymIds: [gymAnswer.gym.id] }, gymAnswer.gym);
@@ -407,12 +429,18 @@ async function reportFromScreenshot(
     });
     return;
   }
-  const request = screenshotRequest(assumed.raid, reported, regionChannelId, {
-    id,
-    timeUncertain: assumed.raid.timeUncertain,
-    doubts: assumed.doubts.filter((doubt) => doubt !== 'gym-unclear'),
-    clock: report.clock,
-  });
+  const request = screenshotRequest(
+    assumed.raid,
+    reported,
+    regionChannelId,
+    {
+      id,
+      timeUncertain: assumed.raid.timeUncertain,
+      doubts: assumed.doubts.filter((doubt) => doubt !== 'gym-unclear'),
+      clock: report.clock,
+    },
+    countedAt,
+  );
   if (decision.kind === 'report' && !mustAsk) {
     const gym = ctx.gyms.get(decision.raid.gymId);
     if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
@@ -567,7 +595,13 @@ function raidCommand(screenshots: boolean): SimpleCommand {
       const time = reportedTime(ctx, reported, interaction.options.getString('time'), Date.now());
       const typedGym = interaction.options.getString('gym', true);
       const answer = reportedGym(ctx, regionChannelId, typedGym);
-      const request: PendingReport = { reported, time, regionChannelId, gymIds: [] };
+      const request: PendingReport = {
+        reported,
+        time,
+        regionChannelId,
+        gymIds: [],
+        countedAt: usedAt(interaction),
+      };
       if (answer.kind === 'none') {
         throw new UserError(
           `I found no gym for "${plain(truncate(typedGym, 80))}". Type part of its name and pick it from the list.`,
@@ -630,7 +664,8 @@ async function claimed(
 
 /**
  * Runs what follows `deferUpdate` of a control. When that fails, the used-up controls are
- * removed from the message (best effort) before the error goes on to the router.
+ * removed from the message (best effort) before the error goes on to the router; a refusal the
+ * work said in the message already (`UserError.said`) stays as it was said.
  */
 async function afterDeferral(
   interaction: ButtonInteraction | StringSelectMenuInteraction,
@@ -639,6 +674,7 @@ async function afterDeferral(
   try {
     await work();
   } catch (err) {
+    if (err instanceof UserError && err.said) throw err;
     try {
       await interaction.editReply({ content: 'Nothing was reported.', components: [] });
     } catch {
@@ -651,6 +687,13 @@ async function afterDeferral(
 /** The gym menu and the confirmation buttons of `/raid`. */
 export const raidControls: ComponentHandler = {
   kind: KIND,
+  // The menu and the buttons go on with a use `/raid` counted: a failure gives it back there.
+  carriesOn: (interaction, id) => {
+    const asked = pending.peek(id.id, interaction.user.id);
+    return typeof asked === 'object'
+      ? { ...RAID_THROTTLE, as: RAID_COMMAND, countedAt: asked.value.countedAt }
+      : undefined;
+  },
 
   async select(interaction, id, ctx) {
     if (id.action !== 'gym' || !interaction.isStringSelectMenu()) throw new UserError(EXPIRED);
diff --git a/src/commands/raids/report.ts b/src/commands/raids/report.ts
index 7fad6721..37bd3460 100644
--- a/src/commands/raids/report.ts
+++ b/src/commands/raids/report.ts
@@ -3,7 +3,7 @@ import type { Gym } from '../../db/repositories/gym-repository.js';
 import type { MemberAccess } from '../../discord/party-gateway.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
-import { NO_POST_MADE } from '../../render/activity.js';
+import { noPostWords } from '../../render/activity.js';
 import { plain } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import { isRaid, type Party, type RaidScreenshot } from '../../domain/party/party.js';
@@ -234,7 +234,7 @@ export function reportWords(
         'A moderator can create it with `/admin setup-forums`.'
       );
     case 'no-post':
-      return NO_POST_MADE;
+      return noPostWords(outcome.refused, (id) => names.channel(id));
     case 'barred':
       return REPORT_BARRED;
   }
diff --git a/src/commands/screenshots/mention.test.ts b/src/commands/screenshots/mention.test.ts
index 9d51208e..518de29a 100644
--- a/src/commands/screenshots/mention.test.ts
+++ b/src/commands/screenshots/mention.test.ts
@@ -19,6 +19,7 @@ import type { Gym } from '../../db/repositories/gym-repository.js';
 import { InteractionRouter } from '../../discord/router.js';
 import type { GymProvider } from '../../services/gym-directory.js';
 import type { ScreenReading } from '../../ocr/screen-reader.js';
+import { NO_POST_MADE } from '../../render/activity.js';
 import type { OcrOutcome } from '../../services/ocr-service.js';
 import type { ScreenshotSource } from '../../services/screenshot-service.js';
 import { Rehearsal } from '../../services/rehearsal.js';
@@ -704,6 +705,59 @@ describe('screenshots posted with a mention of the bot', () => {
     expect(did).not.toContain('deleted');
   });
 
+  it('does not count a screenshot whose raid the bot may not post in the forum', async () => {
+    const { trigger, image, reader, gateway, store } = await setup();
+    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    const source = image('egg.png', egg());
+    for (let n = 0; n < 21; n++) {
+      const { message, replies } = posted([source]);
+      await trigger.handle(message);
+      expect(replies.at(-1)?.content).toMatch(/^I am not allowed to make posts in /);
+    }
+    expect(reader.reads).toBe(21);
+    gateway.refusePosts.delete(WEST_FORUM);
+    await trigger.handle(posted([source]).message);
+    expect(store.active()).toHaveLength(1);
+    await trigger.close();
+  });
+
+  it('does not count a screenshot whose raid’s post was lost while it was made', async () => {
+    const { trigger, image, reader, gateway, store } = await setup();
+    gateway.losePosts = true;
+    const source = image('egg.png', egg());
+    for (let n = 0; n < 21; n++) {
+      const { message, replies } = posted([source]);
+      await trigger.handle(message);
+      expect(replies.at(-1)?.content).toContain(NO_POST_MADE);
+    }
+    expect(reader.reads).toBe(21);
+    gateway.losePosts = false;
+    await trigger.handle(posted([source]).message);
+    expect(store.active()).toHaveLength(1);
+    await trigger.close();
+  });
+
+  it('does not count a screenshot answered by its gym question whose raid the bot may not post', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
+    const { trigger, image, router, gateway } = await setup({ gyms: [twin] });
+    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    const unclear = image('a.png', egg());
+    for (let n = 0; n < 21; n++) {
+      const { message, replies } = posted([unclear]);
+      await trigger.handle(message);
+      // The twenty-first is read too: none of the earlier ones counted.
+      expect(replies[0]?.content).toMatch(/Which gym is it\?/);
+      const picked = fakeSelect({
+        customId: menuOf(replies[0]).custom_id,
+        values: ['13'],
+        userId: AUTHOR,
+      });
+      await router.handle(picked as never);
+      expect(sent(picked.editReply).content).toMatch(/^I am not allowed to make posts in /);
+    }
+    await trigger.close();
+  });
+
   it('holds a member to twenty screenshots a quarter of an hour, an image a use', async () => {
     const { trigger, image, reader } = await setup();
     const source = image('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index 4bbba82b..eed91c5b 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -30,7 +30,7 @@ import {
 } from '../../services/screenshot-service.js';
 import { gymCandidates, gymMenuOptions, gymNamerOf } from './gym-question.js';
 import { SHOT_KIND } from './shot-kind.js';
-import { NO_POST_MADE } from '../../render/activity.js';
+import { noPostWords } from '../../render/activity.js';
 import { mayJoinNoting, REPORT_BARRED, reportAccessOf, reportBarred } from '../raids/report.js';
 
 /**
@@ -137,6 +137,8 @@ interface PendingShot {
   guildRow: number;
   member: MemberInfo;
   batch: Batch;
+  /** Gives back the image's use in its author's window: its raid was refused for none of their doing. */
+  giveBack: () => void;
   /** How long the question stays (set once it is sent): `ReplyKeep`. */
   keep?: ReplyKeep;
   /** What the question says, to be said again above `ASK_AGAIN` (set once it is made). */
@@ -249,11 +251,12 @@ export class ScreenshotTrigger {
         if (this.closed) return;
         // The reader cannot read just now: the rest of the message waits for nothing.
         if (stopped) break;
+        const countedAt = this.now();
         const until = this.throttles.use(
           'screenshot',
           message.authorId,
           MENTION_THROTTLE,
-          this.now(),
+          countedAt,
         );
         if (until !== undefined) {
           held++;
@@ -264,7 +267,17 @@ export class ScreenshotTrigger {
           reacted = true;
           await message.react(READING).catch(() => undefined);
         }
-        const result = await this.readOne(batch, image, guildRow, passive);
+        // A raid refused for none of the member's doing (the bot may not post in the forum) gives
+        // the image's use back, also once its gym question is answered (plan 8S-3).
+        const giveBack = (): void =>
+          this.throttles.giveBack(
+            'screenshot',
+            message.authorId,
+            MENTION_THROTTLE,
+            this.now(),
+            countedAt,
+          );
+        const result = await this.readOne(batch, image, guildRow, passive, giveBack);
         if (result.kind === 'made') {
           batch.made++;
           if (result.exists) existing.push(result.exists);
@@ -310,6 +323,7 @@ export class ScreenshotTrigger {
     image: ScreenshotSource,
     guildRow: number,
     passive: boolean,
+    giveBack: () => void,
   ): Promise<ImageResult> {
     const { ctx } = this.options;
     const { message } = batch;
@@ -346,6 +360,7 @@ export class ScreenshotTrigger {
       });
       if (reported.kind === 'exists') return { kind: 'made', exists: outcomeWords(reported, gym) };
       if (reported.kind === 'created') return { kind: 'made' };
+      if (noPostMade(reported)) giveBack();
       return refused(outcomeWords(reported, gym));
     }
     if (passive) return { kind: 'asked' };
@@ -364,6 +379,7 @@ export class ScreenshotTrigger {
       guildRow,
       member: message.member,
       batch,
+      giveBack,
     };
     const token = pendingShots.put(message.authorId, pending);
     // The gym is not named here: it is what is asked.
@@ -488,6 +504,15 @@ function gymQuestion(
  */
 type ShotOutcome = ReportOutcome | { kind: 'barred' } | { kind: 'unknown-access' };
 
+/**
+ * Whether the raid's post could not be made for none of the member's doing: the bot may not make
+ * posts in the forum, or the post was lost while it was made (plan 8S-3, as `/meetup`, `/train`
+ * and `/raid` give back every `no-post`).
+ */
+function noPostMade(outcome: ShotOutcome): boolean {
+  return outcome.kind === 'no-post';
+}
+
 /** What a screenshot's author is told when Discord cannot say whether they may see the forum. */
 const ACCESS_UNKNOWN =
   'Discord cannot be reached just now, so nothing was reported. Try again in a moment.';
@@ -578,7 +603,7 @@ function outcomeWords(outcome: ShotOutcome, gym: Gym): string {
     case 'no-forum':
       return `The region <#${outcome.region.channelId}> has no raid forum yet.`;
     case 'no-post':
-      return NO_POST_MADE;
+      return noPostWords(outcome.refused, (channelId) => `<#${channelId}>`);
     case 'barred':
       return REPORT_BARRED;
     case 'unknown-access':
@@ -675,6 +700,7 @@ export async function chooseShotGym(
   // Discord may answer in a moment: the question stays, its menu too, with a question's time
   // again, to be answered again; unless its time was up meanwhile and it is gone (then the
   // author is told as for any outcome, below).
+  if (noPostMade(outcome)) request.giveBack();
   if (outcome.kind === 'unknown-access' && request.keep?.askAgain()) {
     answeredShots.delete(token);
     pendingShots.put(interaction.user.id, request, token);
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index 63dad70f..c63ce646 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -15,7 +15,7 @@ import {
   type ConductorSeen,
   type TrainMove,
 } from '../../domain/party/train.js';
-import { NO_POST_MADE, problemText } from '../../render/activity.js';
+import { noPostWords, problemText } from '../../render/activity.js';
 import { groupWords } from '../../render/party-controls.js';
 import { gymName } from '../../render/raid-post.js';
 import { count, memberText, plain } from '../../render/text.js';
@@ -105,7 +105,9 @@ export interface TrainStart {
 
 /** What came of making a train: `made` with the train, or a refusal in `/train`'s words. */
 export type TrainStartAnswer =
-  { kind: 'made'; party: TrainParty; text: string } | { kind: 'refused'; text: string };
+  | { kind: 'made'; party: TrainParty; text: string }
+  /** `givesBack`: none of the maker's doing (the post could not be made; plan 8S-3). */
+  | { kind: 'refused'; text: string; givesBack?: true };
 
 /**
  * What `/train` and the map add for a maker who is not signed up for the train they made (their
@@ -151,7 +153,11 @@ export async function startTrainAs(
     case 'no-forum':
       return { kind: 'refused', text: noForumWords(names.channel(outcome.region.channelId)) };
     case 'no-post':
-      return { kind: 'refused', text: NO_POST_MADE };
+      return {
+        kind: 'refused',
+        text: noPostWords(outcome.refused, (id) => names.channel(id)),
+        givesBack: true,
+      };
     case 'created': {
       const postId = outcome.party.forumPostId;
       const post = postId === null ? undefined : names.post(postId);
@@ -463,7 +469,7 @@ export type SplitAnswer =
 export async function splitGroupAs(
   ctx: TrainSplitting,
   ask: SplitAsk,
-  names: Pick<ReportNames, 'post'>,
+  names: ReportNames,
 ): Promise<SplitAnswer> {
   const { party, member, group, staff, drawn } = ask;
   const settings = await ctx.users.get(member.id);
@@ -490,7 +496,7 @@ export async function splitGroupAs(
     case 'no-forum':
       return { kind: 'refused', text: 'The region of this train has no forum any more.' };
     case 'no-post':
-      return { kind: 'refused', text: NO_POST_MADE };
+      return { kind: 'refused', text: noPostWords(outcome.refused, (id) => names.channel(id)) };
     case 'split': {
       const postId = outcome.party.forumPostId;
       return {
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index 864f2ce3..d6ca8097 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -140,6 +140,22 @@ describe('/train', () => {
     expect(other.trains()).toEqual([]);
   });
 
+  it('says plainly that the bot may not make posts in the forum, and does not count it', async () => {
+    const made = await setup();
+    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    for (let n = 0; n < 2; n++) {
+      expect(await made.answer(`Loop ${String(n)}`)).toBe(
+        `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage Posts ` +
+          "there. Nothing was made. The server's staff must give it to me.",
+      );
+    }
+    made.gateway.refusePosts.delete(WEST_FORUM);
+    await made.run('First');
+    await made.run('Second');
+    expect(await made.answer('Third')).toMatch(/^You can use \/train again/);
+    expect(made.trains()).toHaveLength(2);
+  });
+
   it('refuses a text that is no name, and tidies what is one', async () => {
     const made = await setup();
     expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index 2f87b720..080a40e1 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -85,7 +85,9 @@ export const train: SimpleCommand = {
       DISCORD_NAMES,
     );
     // The guard has looked at all of the refusals; they are for what changed in between.
-    if (answer.kind === 'refused') throw new UserError(answer.text);
+    if (answer.kind === 'refused') {
+      throw new UserError(answer.text, { givesBack: answer.givesBack === true });
+    }
     // Who made it may lay its route and set its times without being signed up; moving it and
     // being its conductor take a sign-up.
     const signedUp = attendeeOf(answer.party, interaction.user.id) !== undefined;
diff --git a/src/discord/errors.ts b/src/discord/errors.ts
index 49a4cd55..085d37b2 100644
--- a/src/discord/errors.ts
+++ b/src/discord/errors.ts
@@ -5,14 +5,25 @@ import type { V2Message } from './party-gateway.js';
  * The router shows the message ephemerally and does not log it as an error. With `answer`, the
  * router shows that message instead of the text (a refusal with a control of its own: the
  * Appeal of a member blocked from making meetups), where the interaction can still be answered
- * privately; the text stays what the log and a public deferral's answer say.
+ * privately; the text stays what the log and a public deferral's answer say. With `givesBack`,
+ * the refusal is no doing of the member's (the bot may not make posts in a forum, the moderators
+ * could not be asked: plan 8S-3), and the router gives back the uses it counted, as for an
+ * unexpected error. With `said`, the handler has told the member already, in its own answer
+ * (`/raid`'s, with the screenshot's feedback button): the router answers nothing more.
  */
 export class UserError extends Error {
   override name = 'UserError';
   readonly answer: V2Message | undefined;
+  readonly givesBack: boolean;
+  readonly said: boolean;
 
-  constructor(message: string, options: { answer?: V2Message } = {}) {
+  constructor(
+    message: string,
+    options: { answer?: V2Message; givesBack?: boolean; said?: boolean } = {},
+  ) {
     super(message);
     this.answer = options.answer;
+    this.givesBack = options.givesBack ?? false;
+    this.said = options.said ?? false;
   }
 }
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index d406feb3..af0b132b 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -1,4 +1,5 @@
 import {
+  ChannelType,
   ComponentType,
   DiscordAPIError,
   MessageFlags,
@@ -28,6 +29,7 @@ import {
   isMissingPermission,
   isRefusedBody,
   isRefusedStarter,
+  PostsRefusedError,
   rateLimitWaitMs,
   refusedPart,
   type OutgoingMessage,
@@ -994,3 +996,75 @@ describe('DiscordPartyGateway: a reported message deleted', () => {
     await expect(hidden.deleteReported('c', 'm')).resolves.toBe('not-allowed');
   });
 });
+
+describe('DiscordPartyGateway: a post where the bot may not make one', () => {
+  const post = { title: 't', message: { content: 'x' }, tagIds: ['1'] };
+
+  /**
+   * A forum in which the bot has `has` (from the cache), making a post as `create` answers;
+   * `created` counts the requests that would reach Discord.
+   */
+  function forumWith(
+    has: bigint,
+    create: () => Promise<unknown> = () => Promise.resolve({ id: '9' }),
+  ) {
+    const me = { id: 'bot' };
+    let created = 0;
+    const forum = {
+      type: ChannelType.GuildForum,
+      guild: { members: { me } },
+      permissionsFor: (member: unknown) => (member === me ? new PermissionsBitField(has) : null),
+      threads: {
+        create: () => {
+          created++;
+          return create();
+        },
+      },
+    };
+    const gateway = new DiscordPartyGateway();
+    gateway.use({ channels: { fetch: () => Promise.resolve(forum) } } as unknown as Client);
+    return { gateway, created: () => created };
+  }
+  const ALL =
+    PermissionFlagsBits.ViewChannel |
+    PermissionFlagsBits.SendMessages |
+    PermissionFlagsBits.SendMessagesInThreads |
+    PermissionFlagsBits.ManageThreads;
+
+  it('refuses before asking Discord where it lacks Manage Posts (Manage Threads), by its name in a forum', async () => {
+    const { gateway, created } = forumWith(ALL & ~PermissionFlagsBits.ManageThreads);
+    const refusal = await gateway.createPost('f', post).catch((err: unknown) => err);
+    expect(refusal).toBeInstanceOf(PostsRefusedError);
+    expect(refusal).toMatchObject({ forumId: 'f', missing: ['Manage Posts'] });
+    expect(created()).toBe(0);
+    const none = await forumWith(0n)
+      .gateway.createPost('f', post)
+      .catch((err: unknown) => err);
+    expect(none).toMatchObject({
+      missing: ['View Channel', 'Create Posts', 'Send Messages in Posts', 'Manage Posts'],
+    });
+  });
+
+  it('asks Manage Posts only for a post with tags: a summary is made without it', async () => {
+    const lacking = forumWith(ALL & ~PermissionFlagsBits.ManageThreads);
+    await expect(lacking.gateway.createPost('f', { ...post, tagIds: [] })).resolves.toBe('9');
+    expect(lacking.created()).toBe(1);
+    const refusal = await forumWith(ALL & ~PermissionFlagsBits.SendMessages)
+      .gateway.createPost('f', { ...post, tagIds: [] })
+      .catch((err: unknown) => err);
+    expect(refusal).toMatchObject({ forumId: 'f', missing: ['Create Posts'] });
+  });
+
+  it('takes Missing Access of Discord as the same refusal, and makes the post where it may', async () => {
+    const denied = forumWith(ALL, () =>
+      Promise.reject(apiError(RESTJSONErrorCodes.MissingAccess, 403)),
+    );
+    const refusal = await denied.gateway.createPost('f', post).catch((err: unknown) => err);
+    expect(refusal).toBeInstanceOf(PostsRefusedError);
+    expect(refusal).toMatchObject({ forumId: 'f', missing: [] });
+    await expect(forumWith(ALL).gateway.createPost('f', post)).resolves.toBe('9');
+    // Another failure is no refusal of posts.
+    const away = forumWith(ALL, () => Promise.reject(new Error('Discord is away')));
+    await expect(away.gateway.createPost('f', post)).rejects.toThrow('Discord is away');
+  });
+});
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 0398dd0d..e2317f6d 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -23,6 +23,11 @@ import { readFile } from 'node:fs/promises';
 import path from 'node:path';
 import type { Logger } from '../log.js';
 import type { ServerChannel } from '../domain/regions/region-import.js';
+import {
+  postNeeds,
+  type PostPermission,
+  type PostsRefused,
+} from '../domain/party/post-permissions.js';
 import { BoundedMap } from '../bounded-map.js';
 import { channelPermissions, FORUM_NEEDS, SERVER_NEEDS } from '../ops/permissions.js';
 import { fetchGuildMember } from './member-directory.js';
@@ -516,6 +521,29 @@ export function isGone(err: unknown): boolean {
   return err instanceof DiscordAPIError && GONE.has(err.code);
 }
 
+/** The flag of each of `POST_PERMISSIONS`, which name them as a forum's settings do. */
+const POST_FLAGS: Record<PostPermission, bigint> = {
+  'View Channel': PermissionFlagsBits.ViewChannel,
+  'Create Posts': PermissionFlagsBits.SendMessages,
+  'Send Messages in Posts': PermissionFlagsBits.SendMessagesInThreads,
+  'Manage Posts': PermissionFlagsBits.ManageThreads,
+};
+
+/** `createPost` where the bot may not make posts in the forum (plan 8S-3). */
+export class PostsRefusedError extends Error implements PostsRefused {
+  override name = 'PostsRefusedError';
+
+  constructor(
+    readonly forumId: string,
+    readonly missing: readonly string[],
+  ) {
+    super(
+      `the bot may not make posts in the forum ${forumId}` +
+        (missing.length > 0 ? `: it lacks ${missing.join(', ')}` : ''),
+    );
+  }
+}
+
 /** Whether Discord refused because the bot lacks a permission, or cannot see the channel. */
 export function isMissingPermission(err: unknown): boolean {
   return (
@@ -1024,16 +1052,26 @@ export class DiscordPartyGateway implements PartyGateway {
   }
 
   async createPost(forumId: string, post: NewPost): Promise<string | undefined> {
-    const forum = await this.forum(forumId);
-    if (!forum) return undefined;
-    const thread = await this.unlessGone(() =>
-      forum.threads.create({
-        name: post.title,
-        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
-        message: discordPayload(post.message),
-        appliedTags: [...post.tagIds],
-      }),
-    );
+    let thread: AnyThreadChannel | undefined;
+    try {
+      const forum = await this.forum(forumId);
+      if (!forum) return undefined;
+      // Refused before Discord is asked: its answer would be Missing Access, which names nothing.
+      const missing = DiscordPartyGateway.lacksForPosts(forum, post.tagIds.length > 0);
+      if (missing.length > 0) throw new PostsRefusedError(forumId, missing);
+      thread = await this.unlessGone(() =>
+        forum.threads.create({
+          name: post.title,
+          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
+          message: discordPayload(post.message),
+          appliedTags: [...post.tagIds],
+        }),
+      );
+    } catch (err) {
+      // What the cache did not show (it lags, or the forum cannot be seen at all).
+      if (hasCode(err, RESTJSONErrorCodes.MissingAccess)) throw new PostsRefusedError(forumId, []);
+      throw err;
+    }
     // The first message of a forum post has the id of the post.
     this.noteSent(thread?.id, post.message);
     return thread?.id;
@@ -1150,6 +1188,18 @@ export class DiscordPartyGateway implements PartyGateway {
     return !post?.isThread() || DiscordPartyGateway.managesThreads(post);
   }
 
+  /**
+   * What the bot lacks in a forum to make and keep a post (`postNeeds`, by the names a forum's
+   * settings show: Manage Posts only for a post with tags), from the cache; nothing where the
+   * bot's member is not in it.
+   */
+  private static lacksForPosts(forum: ForumChannel, tagged: boolean): string[] {
+    const me = forum.guild.members.me;
+    if (me === null) return [];
+    const has = forum.permissionsFor(me)?.bitfield ?? 0n;
+    return postNeeds(tagged).filter((name) => (has & POST_FLAGS[name]) !== POST_FLAGS[name]);
+  }
+
   /** Whether the bot has Manage Threads in a post, from the cache: unknown counts as allowed. */
   private static managesThreads(post: AnyThreadChannel): boolean {
     const me = post.guild.members.me;
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index 35c25d8f..4ed92416 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -458,6 +458,24 @@ describe('InteractionRouter', () => {
     expect(execute).toHaveBeenCalledTimes(2);
   });
 
+  it('gives back the use of a refusal that says it is none of the member’s doing', async () => {
+    const { ctx } = createTestContext();
+    const execute = vi.fn(() =>
+      Promise.reject(new UserError('I may not make posts there.', { givesBack: true })),
+    );
+    const router = new InteractionRouter(
+      ctx,
+      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
+      [],
+    );
+    for (let n = 0; n < 2; n++) {
+      const i = fakeChatInput();
+      await router.handle(asInteraction(i));
+      expect(sent(i.reply).content).toBe('I may not make posts there.');
+    }
+    expect(execute).toHaveBeenCalledTimes(2);
+  });
+
   it('tells the command when it counted its use, by its own clock', async () => {
     const { ctx } = createTestContext();
     let seen: number | undefined;
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 94c07134..3ccde3f6 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -517,7 +517,9 @@ export class InteractionRouter {
    * message), anything else as "Something went wrong" with a reference, logged. `run` notes each
    * use it counted (`spend`); an unexpected error gives them back (plan 8S-3: a `/meetup` whose
    * post Discord refused did not count), at most as many in a window as it allows
-   * (`Throttles.giveBack`). A refusal is the member's and stays counted.
+   * (`Throttles.giveBack`). A refusal is the member's and stays counted, unless it says it is
+   * none of their doing (`UserError.givesBack`: the bot may not make posts in the forum); one the
+   * handler has said in its own answer (`UserError.said`) is answered no more.
    */
   private async guarded(
     interaction: Answered,
@@ -527,9 +529,16 @@ export class InteractionRouter {
     try {
       await run((one) => spent.push(one));
     } catch (err) {
+      if (!(err instanceof UserError) || err.givesBack) {
+        for (const { key, throttle, countedAt } of spent) {
+          this.throttles.giveBack(key, interaction.user.id, throttle, this.now(), countedAt);
+        }
+      }
       let content: string;
       let ref: string | undefined;
       if (err instanceof UserError) {
+        // Told already, in the handler's own answer.
+        if (err.said) return;
         content = err.message;
         // A refusal with a message of its own, where it can still be the member's alone.
         const apart =
@@ -548,9 +557,6 @@ export class InteractionRouter {
         ref = randomBytes(3).toString('hex');
         this.ctx.log.error({ err, ref, interaction: describe(interaction) }, 'interaction failed');
         content = genericError(ref);
-        for (const { key, throttle, countedAt } of spent) {
-          this.throttles.giveBack(key, interaction.user.id, throttle, this.now(), countedAt);
-        }
       }
       await replyEphemeral(interaction, content).catch((replyErr: unknown) =>
         this.ctx.log.warn(
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 65ebbde7..118302ac 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -477,6 +477,8 @@ export type PartyProblem =
   | 'other-region'
   /** The post of a raid in the region it moves to went while it was being made: it stays. */
   | 'post-not-made'
+  /** The bot may not make posts in the forum of the region it moves to (plan 8S-3): it stays. */
+  | 'posts-refused'
   /** The gym was deleted from the gym list meanwhile: nothing can be at it or go there. */
   | 'gym-gone'
   /** The boss of the raid does not have that move. */
diff --git a/src/domain/party/post-permissions.ts b/src/domain/party/post-permissions.ts
new file mode 100644
index 00000000..c0be99a5
--- /dev/null
+++ b/src/domain/party/post-permissions.ts
@@ -0,0 +1,34 @@
+/**
+ * What the bot needs in a forum to make its posts and keep them, by the names a forum's settings
+ * show (plan 8S-3): seeing it, making posts (Send Messages), writing in them, and Manage Posts
+ * (Manage Threads: the tags of a post, which members may not set, its pin, and archiving and
+ * locking it at the end). Names only, so that the words of a refusal need no `discord.js`; the
+ * gateway knows the flags (`DiscordPartyGateway`).
+ */
+export const POST_PERMISSIONS = [
+  'View Channel',
+  'Create Posts',
+  'Send Messages in Posts',
+  'Manage Posts',
+] as const;
+
+export type PostPermission = (typeof POST_PERMISSIONS)[number];
+
+/**
+ * Needed only for a post with tags: Pine's tags are moderated, and Discord refuses a post with
+ * such a tag as Missing Access without it. A post without tags (a region's summary) is made
+ * without it, as before plan 8S-3; only its pin then fails (a warning).
+ */
+export const TAGS_PERMISSION: PostPermission = 'Manage Posts';
+
+/** What a post needs in its forum: all of `POST_PERMISSIONS` with tags, else all but Manage Posts. */
+export function postNeeds(tagged: boolean): PostPermission[] {
+  return POST_PERMISSIONS.filter((name) => tagged || name !== TAGS_PERMISSION);
+}
+
+/** A forum where the bot may not make posts, and what it lacks there (none known: Discord said so). */
+export interface PostsRefused {
+  forumId: string;
+  /** The names of `POST_PERMISSIONS` the bot lacks; empty where Discord refused it all the same. */
+  missing: readonly string[];
+}
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index 7a0ad15c..6df6cdeb 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -583,8 +583,12 @@ describe('cutoverCheck', () => {
       expect(line(lines, 'forums')).toMatchObject({ status: 'pass' });
       expect(lines.find((one) => one.what === 'region')).toMatchObject({
         status: 'fail',
-        text: 'region #north: the bot lacks Manage Threads in the forum #north-meetups',
+        text: 'region #north: the bot lacks Manage Posts (Manage Threads) in the forum #north-meetups',
       });
+      // In a forum Discord names it Manage Posts: the line names it so.
+      expect(line(lines, 'reports').text).toContain(
+        'Manage Posts (Manage Threads) in the forum #north-meetups',
+      );
     });
 
     it('warns of the regions without a forum, by name', async () => {
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index 86da7f44..38380633 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -14,6 +14,7 @@ import {
   MODERATION_NEEDS,
   FORUM_NEEDS,
   HIDDEN_FORUM_NEEDS,
+  inForum,
   missingNeeds,
   REGION_CHANNEL_NEEDS,
   SERVER_NEEDS,
@@ -294,12 +295,22 @@ async function serverLines(
     }
     const forum = region.forumChannelId === null ? undefined : byId.get(region.forumChannelId);
     if (forum)
-      places.push({ place: `the forum #${forum.name}`, channel: forum, needs: FORUM_NEEDS });
+      places.push({
+        place: `the forum #${forum.name}`,
+        channel: forum,
+        needs: inForum(FORUM_NEEDS),
+      });
     else withoutForum.push(`#${channel.name}`);
     const reportPlaces = [
       { place: `#${channel.name}`, channel, needs: REPORT_CHANNEL_NEEDS },
       ...(forum
-        ? [{ place: `the forum #${forum.name}`, channel: forum, needs: REPORT_FORUM_NEEDS }]
+        ? [
+            {
+              place: `the forum #${forum.name}`,
+              channel: forum,
+              needs: inForum(REPORT_FORUM_NEEDS),
+            },
+          ]
         : []),
     ];
     for (const one of reportPlaces) {
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
index 6f66c14e..d69d645e 100644
--- a/src/ops/permissions.ts
+++ b/src/ops/permissions.ts
@@ -199,6 +199,24 @@ export const HIDDEN_FORUM_NEEDS: readonly Need[] = [
   REACT,
 ];
 
+/** What a forum's settings call a permission that a text channel's call otherwise (plan 8S-3). */
+const FORUM_NAMES = new Map<bigint, string>([
+  [P.SendMessages, 'Create Posts'],
+  [P.SendMessagesInThreads, 'Send Messages in Posts'],
+  [P.ManageThreads, 'Manage Posts'],
+]);
+
+/**
+ * The needs as a forum's settings name them, the usual name beside (`Manage Posts (Manage
+ * Threads)`): what an admin finds in the forum's permissions.
+ */
+export function inForum(needs: readonly Need[]): Need[] {
+  return needs.map((one) => {
+    const name = FORUM_NAMES.get(one.flag);
+    return name === undefined ? one : { ...one, name: `${name} (${one.name})` };
+  });
+}
+
 /** The needs that `permissions` lack, the required apart from the optional. */
 export function missingNeeds(
   permissions: bigint,
diff --git a/src/render/activity.test.ts b/src/render/activity.test.ts
index 3c7d41f9..17094bd5 100644
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -2,7 +2,15 @@ import { describe, expect, it } from 'vitest';
 import { ALICE, testRaid, withAttendees } from '../../test/support/parties.js';
 import type { Attendee, PartyProblem, RaidParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { archiveWarning, problemText, standing, standingLine, standingReply } from './activity.js';
+import {
+  archiveWarning,
+  NO_POST_MADE,
+  noPostWords,
+  problemText,
+  standing,
+  standingLine,
+  standingReply,
+} from './activity.js';
 
 const base: Attendee = { number: 1, status: PartyStatus.Coming, group: 'A', remote: false };
 const one = testRaid();
@@ -117,6 +125,11 @@ describe('problemText', () => {
       'I could not make the post in the other region: it was deleted while I was making it. ' +
         'The raid stays here; try again.',
     );
+    expect(problemText('posts-refused', { maxNumber: 21 }, 'raid')).toBe(
+      "I am not allowed to make posts in the other region's forum: the server's staff must " +
+        'give me Manage Posts there (and View Channel, Create Posts and Send Messages in Posts). ' +
+        'The raid stays here.',
+    );
   });
 
   it('says what a train refuses: its route, its moves, its conductor', () => {
@@ -145,6 +158,35 @@ describe('problemText', () => {
   });
 });
 
+describe('noPostWords', () => {
+  const channel = (id: string) => `<#${id}>`;
+
+  it('says the post went while it was being made, or what the bot lacks in the forum', () => {
+    expect(noPostWords(undefined, channel)).toBe(NO_POST_MADE);
+    expect(noPostWords({ forumId: '5', missing: ['Manage Posts'] }, channel)).toBe(
+      'I am not allowed to make posts in <#5>: I lack the permission Manage Posts there. ' +
+        "Nothing was made. The server's staff must give it to me.",
+    );
+    expect(
+      noPostWords(
+        { forumId: '5', missing: ['View Channel', 'Create Posts', 'Manage Posts'] },
+        (id) => (id === '5' ? '#west-raids' : '?'),
+      ),
+    ).toBe(
+      'I am not allowed to make posts in #west-raids: I lack the permissions View Channel, ' +
+        "Create Posts and Manage Posts there. Nothing was made. The server's staff must give " +
+        'them to me.',
+    );
+  });
+
+  it('names every permission a post needs where Discord refused without the bot seeing why', () => {
+    expect(noPostWords({ forumId: '5', missing: [] }, channel)).toBe(
+      "Discord does not let me make posts in <#5>. Nothing was made. The server's staff must " +
+        'check that I have View Channel, Create Posts, Send Messages in Posts and Manage Posts there.',
+    );
+  });
+});
+
 describe('archiveWarning', () => {
   const WHEN = 1_791_900_000_000;
   const archive = `I will archive this post <t:${WHEN / 1000}:R>; it stays readable afterwards.`;
diff --git a/src/render/activity.ts b/src/render/activity.ts
index fae22da3..526e7629 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -10,6 +10,7 @@ import {
   type Party,
   type PartyProblem,
 } from '../domain/party/party.js';
+import { POST_PERMISSIONS, type PostsRefused } from '../domain/party/post-permissions.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { groupWords } from './party-controls.js';
 import { memberText, timestamp, type NamedMember } from './text.js';
@@ -154,6 +155,12 @@ export function problemText(
         'I could not make the post in the other region: it was deleted while I was making it. ' +
         'The raid stays here; try again.'
       );
+    case 'posts-refused':
+      return (
+        "I am not allowed to make posts in the other region's forum: the server's staff must " +
+        'give me Manage Posts there (and View Channel, Create Posts and Send Messages in Posts). ' +
+        'The raid stays here.'
+      );
     case 'other-region':
       return (
         'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
@@ -220,6 +227,102 @@ export function problemText(
 export const NO_POST_MADE =
   'I could not finish the post: it was deleted while I was making it. Nothing was kept; try again.';
 
+/**
+ * What a member is told of a party's post that was not made (`NoPost`): it went while it was
+ * being made (`NO_POST_MADE`), or the bot may not make posts in the forum (plan 8S-3), named as
+ * the caller names a channel (a mention on Discord, `#name` on the live map), with what it lacks
+ * there by the names the forum's settings show; staff must give it.
+ */
+export function noPostWords(
+  refused: PostsRefused | undefined,
+  channel: (channelId: string) => string,
+): string {
+  if (refused === undefined) return NO_POST_MADE;
+  const forum = channel(refused.forumId);
+  const { missing } = refused;
+  if (missing.length === 0) {
+    return (
+      `Discord does not let me make posts in ${forum}. Nothing was made. The server's staff ` +
+      `must check that I have ${andList(POST_PERMISSIONS)} there.`
+    );
+  }
+  const one = missing.length === 1;
+  return (
+    `I am not allowed to make posts in ${forum}: I lack the permission${one ? '' : 's'} ` +
+    `${andList(missing)} there. Nothing was made. The server's staff must give ` +
+    `${one ? 'it' : 'them'} to me.`
+  );
+}
+
+/**
+ * Why a raid did not move into another region (`posts-refused`, plan 8S-3): the bot may not make
+ * posts in that region's forum (named as the caller names a channel), with what it lacks there.
+ */
+export function postsRefusedMoveWords(
+  refused: PostsRefused,
+  channel: (channelId: string) => string,
+): string {
+  const forum = `${channel(refused.forumId)}, the other region's forum`;
+  const { missing } = refused;
+  if (missing.length === 0) {
+    return (
+      `Discord does not let me make posts in ${forum}. The server's staff must check that I ` +
+      `have ${andList(POST_PERMISSIONS)} there. The raid stays here.`
+    );
+  }
+  const one = missing.length === 1;
+  return (
+    `I am not allowed to make posts in ${forum}: I lack the permission${one ? '' : 's'} ` +
+    `${andList(missing)} there. The server's staff must give ${one ? 'it' : 'them'} to me. ` +
+    'The raid stays here.'
+  );
+}
+
+/**
+ * Why an approved meetup could not be made where the bot may not make posts in its forum (plan
+ * 8S-3), as the moderator and the maker are told it after "but": what it lacks there.
+ */
+export function postsRefusedFailure(refused: PostsRefused): string {
+  if (refused.missing.length === 0) {
+    return (
+      "Discord does not let me make posts in its forum (the server's staff must check that I " +
+      `have ${andList(POST_PERMISSIONS)} there)`
+    );
+  }
+  return (
+    "I am not allowed to make posts in its forum (the server's staff must give me " +
+    `${andList(refused.missing)} there)`
+  );
+}
+
+/**
+ * What `/admin setup-forums` says of a region whose summary post the bot may not make (plan
+ * 8S-3): what it lacks in the forum (`<#id>`), by the names the forum's settings show.
+ */
+export function summaryRefusedWords(refused: PostsRefused): string {
+  const forum = `<#${refused.forumId}>`;
+  const { missing } = refused;
+  if (missing.length === 0) {
+    return (
+      `Discord does not let me post the list of active raids in ${forum}. Check that I have ` +
+      `${andList(POST_PERMISSIONS)} there, and run this again.`
+    );
+  }
+  const one = missing.length === 1;
+  return (
+    `I am not allowed to post the list of active raids in ${forum}: I lack the ` +
+    `permission${one ? '' : 's'} ${andList(missing)} there. Give ${one ? 'it' : 'them'} to me ` +
+    'and run this again.'
+  );
+}
+
+/** "a", "a and b", "a, b and c". */
+function andList(items: readonly string[]): string {
+  return items.length <= 1
+    ? (items[0] ?? '')
+    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
+}
+
 const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
 
 function numberWord(n: number): string {
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index 86d82004..86ae8b60 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -398,6 +398,27 @@ describe('MeetupSafety.decide', () => {
     );
   });
 
+  it('says so when the bot may not make posts in the forum of an approved meetup', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    made.gateway.refusePosts.set(WEST_FORUM, ['Create Posts', 'Manage Posts']);
+    const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
+    expect(outcome).toMatchObject({
+      kind: 'done',
+      failure:
+        "I am not allowed to make posts in its forum (the server's staff must give me Create " +
+        'Posts and Manage Posts there)',
+    });
+    made.gateway.refusePosts.set(WEST_FORUM, []);
+    const second = await made.held();
+    expect(await made.safety.decide(second.id, 'approve', MODERATOR_MEMBER, SERVER)).toMatchObject({
+      kind: 'done',
+      failure:
+        "Discord does not let me make posts in its forum (the server's staff must check that I " +
+        'have View Channel, Create Posts, Send Messages in Posts and Manage Posts there)',
+    });
+  });
+
   it('writes no ruling for an approval whose meetup could not be made', async () => {
     const made = await meetupSafetyWith();
     const request = await made.held();
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index d59b7146..108b0b24 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -40,6 +40,7 @@ import {
   requestMessage,
   requestOutcomeDm,
 } from '../render/meetup-safety.js';
+import { postsRefusedFailure } from '../render/activity.js';
 import { postLink } from '../render/notify-dm.js';
 import { ASK_OPEN_DAYS, askMessage, askOutcomeDm } from '../render/place-asks.js';
 import { DM_PRIORITY, type DmSender } from './dm-sender.js';
@@ -1436,7 +1437,12 @@ export class MeetupSafety {
         const postId = outcome.party.forumPostId;
         return { partyId: outcome.party.id, ...(postId === null ? {} : { postId }) };
       }
-      return { failure: FAILURES[outcome.kind] };
+      return {
+        failure:
+          outcome.kind === 'no-post' && outcome.refused !== undefined
+            ? postsRefusedFailure(outcome.refused)
+            : FAILURES[outcome.kind],
+      };
     } catch (err) {
       log.error({ err, request: request.id }, 'could not make an approved meetup');
       return { failure: FAILURE };
diff --git a/src/services/party-service.posts-refused.test.ts b/src/services/party-service.posts-refused.test.ts
new file mode 100644
index 00000000..6069e89f
--- /dev/null
+++ b/src/services/party-service.posts-refused.test.ts
@@ -0,0 +1,65 @@
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { ALICE, REPORTER } from '../../test/support/parties.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { PartyStatus } from '../domain/party/status.js';
+
+/** The party services over a fake gateway that refuses posts in West's forum (no Manage Posts). */
+async function refusing() {
+  const gateway = new FakePartyGateway();
+  gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+  const made = await partyServiceWith([], {}, { gateway });
+  const gym = gymsFixture().get(1);
+  if (!gym) throw new Error('no gym 1');
+  const report = () =>
+    made.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+  return { ...made, gateway, report };
+}
+
+const REFUSED = { kind: 'no-post', refused: { forumId: WEST_FORUM, missing: ['Manage Posts'] } };
+
+describe('PartyService: a forum where the bot may not make posts', () => {
+  it('keeps no raid, meetup or train there, and says what the bot lacks', async () => {
+    const made = await refusing();
+    expect(await made.report()).toEqual(REFUSED);
+    expect(
+      await made.service.createMeetup({
+        name: 'Picnic',
+        creatorId: ALICE,
+        regionChannelId: WEST_CHANNEL,
+      }),
+    ).toEqual(REFUSED);
+    expect(
+      await made.service.createTrain({
+        name: 'Loop',
+        creatorId: ALICE,
+        regionChannelId: WEST_CHANNEL,
+      }),
+    ).toEqual(REFUSED);
+    expect(made.store.active()).toEqual([]);
+    expect(made.gateway.posts.size).toBe(0);
+    // Asked once each: what was refused is not tried in other forms.
+    expect(made.gateway.calls.filter((call) => call.startsWith('createPost '))).toHaveLength(3);
+  });
+
+  it('logs it once per forum, for the owner to see, however often members try', async () => {
+    const made = await refusing();
+    await made.report();
+    await made.report();
+    const said = made.entries.filter(
+      (entry) =>
+        entry.msg === 'the bot may not make posts in a forum: staff must give it the permissions',
+    );
+    expect(said).toHaveLength(1);
+    expect(said[0]).toMatchObject({ level: 40, forum: WEST_FORUM, missing: ['Manage Posts'] });
+  });
+});
diff --git a/src/services/party-service.relocate.test.ts b/src/services/party-service.relocate.test.ts
index aa441d97..34722f1c 100644
--- a/src/services/party-service.relocate.test.ts
+++ b/src/services/party-service.relocate.test.ts
@@ -57,6 +57,19 @@ async function moved(made: Made, by?: Member): Promise<RaidParty> {
 const texts = (made: Made, channelId: string): string[] =>
   made.gateway.messagesIn(channelId).map((message) => message.message.content ?? '');
 
+describe('PartyService.relocate into a forum where the bot may not make posts', () => {
+  it('leaves the raid where it is and says what the bot lacks there', async () => {
+    const made = await reportedRaid(yveltal);
+    made.gateway.refusePosts.set(EAST_FORUM, ['Manage Posts']);
+    const outcome = await made.service.relocate(made.party.id, cafe(), east(made));
+    expect(outcome).toEqual({
+      kind: 'no-post',
+      refused: { forumId: EAST_FORUM, missing: ['Manage Posts'] },
+    });
+    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
+  });
+});
+
 describe('PartyService.relocate', () => {
   it('makes the raid a new party with a post in the other forum, as it was', async () => {
     const made = await reportedRaid({ ...yveltal, time: { end: at('2026-10-13T14:40') } });
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 698b66b6..22f42c40 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -7,6 +7,7 @@ import {
   isMissingPermission,
   isRefusedBody,
   isRefusedStarter,
+  PostsRefusedError,
   rateLimitWaitMs,
   type ForumAccess,
   type ForumHiding,
@@ -20,6 +21,7 @@ import type { PartyEnd } from '../domain/history/party-history.js';
 import type { PostRemoval } from '../domain/moderation/reports.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import { createMeetup, tidyDescription } from '../domain/party/meetup.js';
+import type { PostsRefused } from '../domain/party/post-permissions.js';
 import {
   asKindOf,
   isMeetup,
@@ -93,10 +95,12 @@ import {
   shownBoss,
   type RaidPostView,
 } from '../render/raid-post.js';
+import { summaryRefusedWords } from '../render/activity.js';
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
 import { memberText, plain, withMentions, type NamedMember } from '../render/text.js';
 import type { TimedPostView } from '../render/timed-post.js';
 import { renderTrainPost, trainTitle, type TrainPostView } from '../render/train-post.js';
+import { BoundedMap } from '../bounded-map.js';
 import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { KeyedLock } from './keyed-lock.js';
@@ -192,6 +196,15 @@ export interface RaidReport {
   mayJoin?: (forumId: string) => Promise<boolean>;
 }
 
+/**
+ * A party's post was not made, so nothing was kept: it went while it was being made, or the bot
+ * may not make posts in the forum (`refused`: what it lacks there; plan 8S-3).
+ */
+export interface NoPost {
+  kind: 'no-post';
+  refused?: PostsRefused;
+}
+
 export type ReportOutcome =
   /** A new raid with its post. */
   | { kind: 'created'; party: RaidParty }
@@ -203,8 +216,8 @@ export type ReportOutcome =
   | { kind: 'gym-gone' }
   /** The gym's region has no forum yet (`/admin setup-forums`). */
   | { kind: 'no-forum'; region: Region }
-  /** The post went while it was being made (`NO_POST_MADE`): nothing was kept. */
-  | { kind: 'no-post' }
+  /** The post could not be made (`noPostWords`): nothing was kept. */
+  | NoPost
   /**
    * The gym has such a raid already, in a forum the reporter may not be put in
    * (`RaidReport.mayJoin`): they were not signed up, nothing was done.
@@ -258,8 +271,8 @@ export type TimedOutcome<P extends TimedParty> =
   | { kind: 'no-region' }
   /** The region has no forum yet (`/admin setup-forums`). */
   | { kind: 'no-forum'; region: Region }
-  /** The post went while it was being made (`NO_POST_MADE`): nothing was kept. */
-  | { kind: 'no-post' };
+  /** The post could not be made (`noPostWords`): nothing was kept. */
+  | NoPost;
 
 export type MeetupOutcome =
   | TimedOutcome<MeetupParty>
@@ -275,8 +288,8 @@ export type RelocateOutcome =
   | { kind: 'taken'; other: RaidParty }
   /** The region has no forum (any more): the raid stays where it is. */
   | { kind: 'no-forum' }
-  /** The new post went while it was being made: the raid stays where it is. */
-  | { kind: 'no-post' }
+  /** The new post could not be made: the raid stays where it is. */
+  | NoPost
   /** The gym was deleted from the gym list meanwhile: the raid stays where it is. */
   | { kind: 'gym-gone' }
   /** `party` is the raid in its new place, `from` the party it was, which has ended. */
@@ -304,10 +317,10 @@ export type SplitOutcome =
   /** The region of the train has no forum (any more). */
   | { kind: 'no-forum' }
   /**
-   * The new post went while it was being made (`NO_POST_MADE`), or the new train ended before
-   * the old one lost the group (its post deleted): nothing was kept.
+   * The new post could not be made (`noPostWords`), or the new train ended before the old one
+   * lost the group (its post deleted): nothing was kept.
    */
-  | { kind: 'no-post' }
+  | NoPost
   /**
    * `party` is the new train with its post, `from` the old one without the group; `group` the
    * group as it was, `moved` the members who went with it, in the order they signed up.
@@ -345,6 +358,15 @@ class HiddenForumRefused extends Error {
   }
 }
 
+/** Whether a summary post was pinned (`refused`: the bot lacks Manage Posts; `failed`: else). */
+type SummaryPin = 'pinned' | 'refused' | 'failed';
+
+/** Whether a summary post was made, and why it is not pinned where it could not be. */
+interface SummaryMade {
+  made: boolean;
+  unpinned?: Exclude<SummaryPin, 'pinned'>;
+}
+
 /** What `/admin setup-forums` did for one region. */
 export interface ForumSetup {
   region: Region;
@@ -363,6 +385,11 @@ export interface ForumSetup {
   renamed?: boolean;
   /** Whether a new summary post was made. */
   summary: boolean;
+  /**
+   * Set when a new summary post could not be pinned: `refused` where the bot lacks Manage Posts
+   * in the forum, `failed` for anything else (logged). It is made and kept all the same.
+   */
+  unpinned?: Exclude<SummaryPin, 'pinned'>;
   /**
    * Whether the making of posts in the forum was left to the bot now (`reserved`), or could
    * not be (`not-allowed`: the bot may not change the permissions of the forum); absent when
@@ -497,6 +524,8 @@ export class PartyService {
   private readonly eggPictures: EggPictures;
   /** The forums, posts and channels of copies that refused files lately. */
   private readonly refusedFiles: RefusedFiles;
+  /** The forums where the bot was found not to be allowed to make posts, said once each. */
+  private readonly refusedForums = new BoundedMap<string, true>(1_000);
 
   constructor(private readonly options: PartyServiceOptions) {
     this.now = options.now ?? (() => Date.now());
@@ -1025,9 +1054,7 @@ export class PartyService {
     party: P,
     region: Region,
     rendered: RenderedPost,
-  ): Promise<
-    { kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | { kind: 'no-post' }
-  > {
+  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | NoPost> {
     const creation = this.createPostFor(party, region, rendered);
     this.creating.set(
       party.id,
@@ -1456,9 +1483,7 @@ export class PartyService {
     fresh: P,
     region: Region,
     rendered: RenderedPost,
-  ): Promise<
-    { kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | { kind: 'no-post' }
-  > {
+  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | NoPost> {
     const { store, gateway, log } = this.options;
     const forumId = region.forumChannelId ?? '';
     const word = partyWord(fresh);
@@ -1471,6 +1496,10 @@ export class PartyService {
       this.dropTags(forumId);
       await this.abandon(fresh.id, NO_POST);
       if (err instanceof PostLostError) return { kind: 'no-post' };
+      if (err instanceof PostsRefusedError) {
+        this.postsRefusedIn(err);
+        return { kind: 'no-post', refused: { forumId: err.forumId, missing: err.missing } };
+      }
       throw err;
     }
     if (postId === undefined) {
@@ -1524,6 +1553,19 @@ export class PartyService {
     return { kind: 'created', party };
   }
 
+  /**
+   * Logs, once per forum while the bot runs, that it may not make posts there (the owner reads
+   * the log; the member is told by the command): staff must give it what it lacks.
+   */
+  private postsRefusedIn(refusal: PostsRefusedError): void {
+    if (this.refusedForums.has(refusal.forumId)) return;
+    this.refusedForums.set(refusal.forumId, true);
+    this.options.log.warn(
+      { forum: refusal.forumId, missing: refusal.missing },
+      'the bot may not make posts in a forum: staff must give it the permissions',
+    );
+  }
+
   /**
    * Creates a post; when Discord refuses its files (an egg's picture), once more without them,
    * when it refuses an emoji of a button, with the plain ones, and when it refuses a picture (its
@@ -2470,18 +2512,20 @@ export class PartyService {
     if (!info.pinned) await this.pinSummary(regionId, failed);
   }
 
-  /** Pins a summary post; a failure is a warning, as a moderator can pin it by hand. */
-  private async pinSummary(regionId: number, postId: string): Promise<void> {
+  /**
+   * Pins a summary post; a failure is a warning, as a moderator can pin it by hand. Answers
+   * whether it was pinned: `refused` where the bot lacks the permission (Manage Posts), `failed`
+   * otherwise.
+   */
+  private async pinSummary(regionId: number, postId: string): Promise<SummaryPin> {
     const { gateway, log } = this.options;
     try {
-      if (!(await gateway.pinPost(postId))) {
-        log.warn(
-          { region: regionId, post: postId },
-          'the summary post is gone before it was pinned',
-        );
-      }
+      if (await gateway.pinPost(postId)) return 'pinned';
+      log.warn({ region: regionId, post: postId }, 'the summary post is gone before it was pinned');
+      return 'failed';
     } catch (err) {
       log.warn({ err, region: regionId, post: postId }, 'could not pin the summary post');
+      return isMissingPermission(err) ? 'refused' : 'failed';
     }
   }
 
@@ -2501,7 +2545,7 @@ export class PartyService {
         'could not delete a summary post that cannot be edited; it may keep the forum pin',
       );
     }
-    return this.createSummary(region);
+    return (await this.createSummary(region)).made;
   }
 
   /** Runs `work` after the earlier calls for the region are done. */
@@ -2516,24 +2560,29 @@ export class PartyService {
    * Makes sure the region's forum has its pinned summary post. Returns whether one was created.
    * The region must have a forum. Calls for one region run one after the other.
    */
-  ensureSummary(region: Region): Promise<boolean> {
+  async ensureSummary(region: Region): Promise<boolean> {
+    return (await this.summaryMade(region)).made;
+  }
+
+  /** `ensureSummary`, with whether a summary it made could be pinned. */
+  private summaryMade(region: Region): Promise<SummaryMade> {
     return this.inSummaryChain(region.id, () =>
       this.makeSummary(this.options.regions.byId(region.id) ?? region),
     );
   }
 
-  private async makeSummary(region: Region): Promise<boolean> {
+  private async makeSummary(region: Region): Promise<SummaryMade> {
     const { gateway } = this.options;
     if (region.forumChannelId === null) throw new Error(`Region ${region.id} has no forum`);
     if (region.summaryMessageId !== null && (await gateway.postInfo(region.summaryMessageId))) {
       this.summaries.request(region.id);
-      return false;
+      return { made: false };
     }
     return this.createSummary(region);
   }
 
   /** Makes the region's summary post with the current text, pins it and records it. */
-  private async createSummary(region: Region): Promise<boolean> {
+  private async createSummary(region: Region): Promise<SummaryMade> {
     const { gateway, regionStore, regions, log } = this.options;
     const forumId = region.forumChannelId;
     if (forumId === null) throw new Error(`Region ${region.id} has no forum`);
@@ -2547,7 +2596,7 @@ export class PartyService {
     });
     if (postId === undefined) throw new Error(`The forum of region ${region.id} is gone`);
     // A moderator can pin it by hand, so the post is recorded whether or not this works.
-    await this.pinSummary(region.id, postId);
+    const pin = await this.pinSummary(region.id, postId);
     if (!(await regionStore.setSummaryMessage(region.id, forumId, postId))) {
       log.warn({ region: region.id, post: postId }, 'the forum of a region changed meanwhile');
       try {
@@ -2555,11 +2604,11 @@ export class PartyService {
       } catch (err) {
         log.error({ err, region: region.id, post: postId }, 'could not delete a summary post');
       }
-      return false;
+      return { made: false };
     }
     this.summarySent.set(region.id, { postId, text: JSON.stringify(message) });
     await regions.load();
-    return true;
+    return pin === 'pinned' ? { made: true } : { made: true, unpinned: pin };
   }
 
   /** Forgets what is remembered about a forum's tags (after `/admin setup-forums` changed them). */
@@ -2642,9 +2691,11 @@ export class PartyService {
           reason:
             err instanceof HiddenForumRefused
               ? HIDDEN_FORUM_REFUSED
-              : isMissingPermission(err)
-                ? 'I need the Manage Channels and Manage Threads permissions here.'
-                : 'Something went wrong (see the log).',
+              : err instanceof PostsRefusedError
+                ? summaryRefusedWords(err)
+                : isMissingPermission(err)
+                  ? 'I need the Manage Channels and Manage Threads permissions here.'
+                  : 'Something went wrong (see the log).',
           tagsAdded: 0,
           summary: false,
         });
@@ -2772,13 +2823,14 @@ export class PartyService {
     }
     const renamed = forum === 'ready' && (await this.renameForum(region));
     const posting = await this.reservePosts(region);
-    const summary = await this.ensureSummary(region);
+    const { made: summary, unpinned } = await this.summaryMade(region);
     return {
       region: regions.byId(before.id) ?? region,
       forum,
       tagsAdded,
       ...(tagsRemoved > 0 ? { tagsRemoved } : {}),
       summary,
+      ...(unpinned === undefined ? {} : { unpinned }),
       ...(renamed ? { renamed } : {}),
       ...(posting === undefined ? {} : { posting }),
       ...(hiding === undefined ? {} : { hidden: hiding }),
diff --git a/src/services/raid-change-service.ts b/src/services/raid-change-service.ts
index 3e056e6d..9d88220c 100644
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -38,20 +38,22 @@ import type { GameDataProvider } from './game-data-service.js';
 import type { PartyNotifier } from './notify-service.js';
 import { storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
+import type { PostsRefused } from '../domain/party/post-permissions.js';
 import type { RelocateOutcome } from './party-service.js';
 import type { PartyStore } from './party-store.js';
 import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
 
 /**
  * What came of a change to a raid. `gone`: there is no such active raid. `refused`: the raid
- * stays as it was; for `gym-taken`, `other` is the raid that holds the gym. `ok`: the raid as it
+ * stays as it was; for `gym-taken`, `other` is the raid that holds the gym, for `posts-refused`
+ * `refused` what the bot lacks in the other region's forum. `ok`: the raid as it
  * is stored now; `changed` is false when it already was so. `from` is set when the raid moved to
  * another region: the party it was, which has ended; `party` is then a new party with a post of
  * its own.
  */
 export type RaidChangeOutcome =
   | { kind: 'gone' }
-  | { kind: 'refused'; reason: PartyProblem; other?: RaidParty }
+  | { kind: 'refused'; reason: PartyProblem; other?: RaidParty; refused?: PostsRefused }
   | { kind: 'ok'; party: RaidParty; changed: boolean; from?: RaidParty };
 
 export interface RaidChangeServiceOptions {
@@ -323,7 +325,9 @@ export class RaidChangeService {
       case 'no-forum':
         return { kind: 'refused', reason: 'other-region' };
       case 'no-post':
-        return { kind: 'refused', reason: 'post-not-made' };
+        return outcome.refused === undefined
+          ? { kind: 'refused', reason: 'post-not-made' }
+          : { kind: 'refused', reason: 'posts-refused', refused: outcome.refused };
       case 'gym-gone':
         return { kind: 'refused', reason: 'gym-gone' };
       case 'moved': {
diff --git a/src/web/meetup-make.test.ts b/src/web/meetup-make.test.ts
index 2216fdb9..dd365363 100644
--- a/src/web/meetup-make.test.ts
+++ b/src/web/meetup-make.test.ts
@@ -75,6 +75,7 @@ async function making(
   const acting = new FakeActingMembers().add(ALICE, 'Alice', 'mystic').add(BOB, 'Bob');
   const names = new Map([
     [WEST_CHANNEL, 'west'],
+    [WEST_FORUM, 'west-meetups'],
     [EAST_CHANNEL, 'east'],
     [UNBOUNDED_CHANNEL, 'unbounded'],
   ]);
@@ -306,6 +307,27 @@ describe('making a meetup on the map', () => {
     expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(429);
   });
 
+  it('says plainly that the bot may not make posts in the forum, the forum by its name, and does not count it', async () => {
+    const map = await making();
+    web = map.web;
+    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    for (let n = 0; n < 2; n++) {
+      expect(await map.make(asked({ kind: 'gym', id: '1' }))).toMatchObject({
+        status: 422,
+        json: {
+          ok: false,
+          text:
+            'I am not allowed to make posts in #west-meetups: I lack the permission Manage Posts ' +
+            "there. Nothing was made. The server's staff must give it to me.",
+        },
+      });
+    }
+    map.made.gateway.refusePosts.delete(WEST_FORUM);
+    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
+    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(200);
+    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(429);
+  });
+
   it("says in /meetup's words that the moderators could not be asked, and keeps nothing", async () => {
     const map = await making({ channel: false });
     web = map.web;
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index c6843b91..6f7b11e9 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -360,6 +360,10 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       case 'blocked':
         return refuse(reply, 403, MAP_BLOCKED);
       case 'refused':
+        // None of the member's doing (the post could not be made): given back, as on Discord.
+        if (answer.givesBack === true) {
+          givenBackOnTheMap(deps, MEETUP_COMMAND, userId, MEETUP_THROTTLE, countedAt);
+        }
         return refuse(reply, 422, answer.text);
       case 'held': {
         const held: MeetupAnswer = { ok: true, outcome: 'held', text: words(answer.text) };
diff --git a/src/web/raid-report.test.ts b/src/web/raid-report.test.ts
index a729e267..30237456 100644
--- a/src/web/raid-report.test.ts
+++ b/src/web/raid-report.test.ts
@@ -336,6 +336,29 @@ describe('reporting a raid on the map', () => {
     expect(sent(used.reply).content).toBe('You can use /raid again in 15 minutes.');
   });
 
+  it('does not count a report whose post the bot may not make, nor one that failed', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < RAID_THROTTLE.uses - 1; n++) {
+      throttles.use(RAID_COMMAND, ALICE, RAID_THROTTLE, PARTY_NOW);
+    }
+    const map = await reporting({ throttles });
+    web = map.web;
+    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    const refused = await map.report({ gym: 1, boss: 'e:T5:0' });
+    expect(refused.status).toBe(422);
+    expect(refused.json.text).toContain('I lack the permission Manage Posts there.');
+    map.made.gateway.refusePosts.delete(WEST_FORUM);
+    // A post lost while it was made is none of the member's doing either.
+    map.made.gateway.losePosts = true;
+    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(422);
+    map.made.gateway.losePosts = false;
+    map.made.gateway.failing.set('createPost', new Error('Discord is away'));
+    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(500);
+    map.made.gateway.failing.delete('createPost');
+    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(200);
+    expect((await map.report({ gym: 2, boss: 'e:T5:0' })).status).toBe(429);
+  });
+
   it('refuses before anything is counted: a gym of no region of the server, a forum the member is kept out of, somebody not a member', async () => {
     const throttles = new Throttles();
     const map = await reporting({ throttles });
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 9c17fba7..52a26447 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -39,6 +39,7 @@ import {
 import { gymRegionsInGuild } from '../services/region-directory.js';
 import {
   actingOnTheMap,
+  givenBackOnTheMap,
   isMapStaff,
   memberOrFailure as mapMemberOrFailure,
   throttledOnTheMap,
@@ -345,6 +346,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       RAID_THROTTLE,
     );
     if (throttled) return throttled;
+    const countedAt = deps.now();
     let reported: ReportedBoss;
     let time: ReturnType<typeof reportedTime>;
     try {
@@ -358,15 +360,27 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     // A raid reported at the gym since the check above, in a forum it did not see, is asked
     // about where the report would join it.
     const joining = mayJoinNoting(reportAccess(), userId);
-    const result = await reportRaidAs(ctx, acting.member, gym, {
-      reported,
-      time,
-      regionChannelId,
-      mayJoin: joining.mayJoin,
-    });
+    let result: Awaited<ReturnType<typeof reportRaidAs>>;
+    try {
+      result = await reportRaidAs(ctx, acting.member, gym, {
+        reported,
+        time,
+        regionChannelId,
+        mayJoin: joining.mayJoin,
+      });
+    } catch (err) {
+      // No fault of the member's (a post Discord refused): the use is given back, as on Discord.
+      givenBackOnTheMap(deps, RAID_COMMAND, userId, RAID_THROTTLE, countedAt);
+      throw err;
+    }
     const failed = joining.failure();
     if (failed) return unreachable(reply, failed.err, guild, userId, 'reported a raid');
     const { outcome } = result;
+    // None of the member's doing (the bot may not make posts in the forum, the post was lost
+    // while it was made): given back too.
+    if (outcome.kind === 'no-post') {
+      givenBackOnTheMap(deps, RAID_COMMAND, userId, RAID_THROTTLE, countedAt);
+    }
     let raid: MapRaid | undefined;
     if (outcome.kind === 'created' || outcome.kind === 'exists') {
       // A raid already there may be in another forum of the server: shown only when the
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index b5ceb1fd..0dc6b2bb 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -447,7 +447,13 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       { user: userId, guild, region: region.id, outcome: made.kind },
       'a train was started on the map',
     );
-    if (made.kind === 'refused') return refuse(reply, 422, made.text);
+    if (made.kind === 'refused') {
+      // None of the member's doing (the post could not be made): given back, as on Discord.
+      if (made.givesBack === true) {
+        givenBackOnTheMap(deps, TRAIN_COMMAND, userId, TRAIN_THROTTLE, countedAt);
+      }
+      return refuse(reply, 422, made.text);
+    }
     const party = parties.store.get(made.party.id);
     const train =
       party?.type === 'train' ? viewOf(guild, row, party, userId, acting.standing) : undefined;
diff --git a/src/web/train-start.test.ts b/src/web/train-start.test.ts
index 157823be..350a1d7c 100644
--- a/src/web/train-start.test.ts
+++ b/src/web/train-start.test.ts
@@ -175,6 +175,22 @@ describe('starting a train on the map', () => {
     expect(again.headers['retry-after']).toBeDefined();
   });
 
+  it('says plainly that the bot may not make posts in the forum, and does not count it', async () => {
+    const map = await starting();
+    web = map.web;
+    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    for (let n = 0; n < 2; n++) {
+      const refused = await map.start({ region: 1, name: 'Park loop' });
+      expect(refused.status).toBe(422);
+      expect(refused.json).toMatchObject({ ok: false });
+      expect(JSON.stringify(refused.json)).toContain('I lack the permission Manage Posts there.');
+    }
+    map.made.gateway.refusePosts.delete(WEST_FORUM);
+    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(200);
+    expect((await map.start({ region: 1, name: 'Lake loop' })).status).toBe(200);
+    expect((await map.start({ region: 1, name: 'Hill loop' })).status).toBe(429);
+  });
+
   it('gives the use back when the train could not be started for no fault of the member', async () => {
     const map = await starting();
     web = map.web;
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index ac7b93ad..c87bdca2 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -24,7 +24,9 @@ import {
   categoryOnlyPermissions,
   hiddenForumOverwrites,
   isHiddenForum,
+  PostsRefusedError,
 } from '../../src/discord/party-gateway.js';
+import { postNeeds } from '../../src/domain/party/post-permissions.js';
 import { Tally } from './tally.js';
 
 /** What Discord answers a change the bot lacks the permission for (50013). */
@@ -290,6 +292,12 @@ export class FakePartyGateway implements PartyGateway {
    * of the post's nested message and finds neither content nor an embed.
    */
   refuseV2Starter: boolean | 'empty' = false;
+  /**
+   * Makes every new post go the moment it is made, before its components-v2 message is edited in
+   * (its first message is refused as `refuseV2Starter` does): `PartyService` answers `no-post`
+   * with nothing refused, a post lost while it was made.
+   */
+  losePosts = false;
   /**
    * The characters a components-v2 message may have over its text displays; a test lowers it to
    * have the messages of a post refused as Discord would refuse one too long.
@@ -308,6 +316,15 @@ export class FakePartyGateway implements PartyGateway {
    * message there is not deleted (`deleteReported` answers `not-allowed`).
    */
   readonly noManaging = new Set<string>();
+  /**
+   * Forums where the bot lacks these permissions, by the names of `POST_PERMISSIONS` (plan
+   * 8S-3): `createPost` throws `PostsRefusedError` naming those the post needs
+   * (`postNeeds`: Manage Posts only for a post with tags), as `DiscordPartyGateway` refuses it;
+   * a post that needs none of them is made. An empty list: Discord refused all the same (Missing
+   * Access), whatever the post. Manage Posts listed also refuses `pinPost` of a post there
+   * (Missing Permissions), as Discord does.
+   */
+  readonly refusePosts = new Map<string, readonly string[]>();
   /** The forums in which only the bot makes posts (`reservePosts`). */
   readonly reserved = new Set<string>();
   /** The forums whose permissions the bot may not change. */
@@ -1021,9 +1038,18 @@ export class FakePartyGateway implements PartyGateway {
     return this.attempt('createPost', forumId, () => {
       const forum = this.forums.get(forumId);
       if (!forum || this.gone.has(forumId)) return undefined;
+      // Without what it needs there, as `DiscordPartyGateway` refuses it.
+      const lacking = this.refusePosts.get(forumId);
+      if (lacking !== undefined) {
+        const needs: readonly string[] = postNeeds(post.tagIds.length > 0);
+        const missing = lacking.filter((name) => needs.includes(name));
+        if (lacking.length === 0 || missing.length > 0) {
+          throw new PostsRefusedError(forumId, missing);
+        }
+      }
       FakePartyGateway.checkMessage(post.message, this.textLimit);
       if (this.refuseV2Starter === 'empty' && post.message.v2) throw emptyMessage();
-      if (this.refuseV2Starter === true && post.message.v2) {
+      if ((this.refuseV2Starter === true || this.losePosts) && post.message.v2) {
         throw refusedBody('a components-v2 message as the first message of a post');
       }
       this.checkPicture(post.message);
@@ -1046,6 +1072,7 @@ export class FakePartyGateway implements PartyGateway {
         renames: 0,
         retags: 0,
       });
+      if (this.losePosts) this.gone.add(id);
       return id;
     });
   }
@@ -1115,6 +1142,10 @@ export class FakePartyGateway implements PartyGateway {
     return this.attempt('pinPost', postId, () => {
       const post = this.posts.get(postId);
       if (!post || this.gone.has(postId)) return false;
+      // A pin needs Manage Posts (Manage Threads), as Discord refuses it without.
+      if (this.refusePosts.get(post.forumId)?.includes('Manage Posts')) {
+        throw missingPermissions('PUT');
+      }
       if (
         this.postsIn(post.forumId).some(
           (other) => other.pinned && other.id !== postId && !this.gone.has(other.id),
````

### Task 5: Plan 8S-3 T5: cutover-check and the guides: the moderators' channel seen by every staff role; the docs of 8S-3

Prototype commit: `c8a20942ab7973078a5308d7d139a2780c2658ee`

Staging of 8S-2: a member with the Moderator role but no View Channel on
#meetup-review got "You don't have access to this link" from every link of
/places and the reports.

- `cutover-check`'s `moderation` line warns of each staff role (a role
  named Admin or Moderator, `isManagementRoleName` beside `isStaffRoleName`
  in `src/discord/guards.ts`) that cannot see it, by name, in one warning
  with who may see the channel too widely; Administrator counts as seeing
  it.
- The guides (`new-instance.md`, `migrating-a-legacy-instance.md`) say the
  channel must be visible to every staff role, not only "staff-only", and
  that a forum calls Manage Threads "Manage Posts", without which the bot
  makes no post there.
- The conventions of every fix: `discord-framework.md` (the router's
  `checks`, uses given back to their own window, `carriesOn`,
  `UserError.givesBack`, and the trade-off of a use given back after its
  effect landed), `moderation.md`, `meetup-safety.md`,
  `parties-and-posts.md`, `screenshots.md`, `operations.md`, `testing.md`.
- A staging checklist draft: `docs/superpowers/plans/2026-10-18-phase-8s3-staging.md`.

**Files:**

```
 docs/architecture/discord-framework.md                 |  4 +++-
 docs/architecture/meetup-safety.md                     |  4 ++--
 docs/architecture/moderation.md                        |  4 ++--
 docs/architecture/operations.md                        |  2 +-
 docs/architecture/parties-and-posts.md                 |  2 +-
 docs/architecture/screenshots.md                       |  2 +-
 docs/architecture/testing.md                           |  2 +-
 docs/guides/migrating-a-legacy-instance.md             |  4 ++--
 docs/guides/new-instance.md                            |  6 +++---
 docs/superpowers/plans/2026-10-18-phase-8s3-staging.md | 30 ++++++++++++++++++++++++++++++
 src/discord/guards.ts                                  |  8 ++++++++
 src/ops/cutover-check.test.ts                          | 43 +++++++++++++++++++++++++++++++++++++++++++
 src/ops/cutover-check.ts                               | 51 ++++++++++++++++++++++++++++++++++++---------------
 13 files changed, 133 insertions(+), 29 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/ops/cutover-check.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c8a20942ab7973078a5308d7d139a2780c2658ee -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-3 T5: cutover-check and the guides: the moderators' channel seen by every staff role; the docs of 8S-3`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index b995e5d6..4889ac54 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -16,7 +16,9 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 ## The router and deferral
 
-- The router's order is guards, throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
+- The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
+- Plan 8S-3: between the guards and the throttle the router asks `checks`, the window a form's submit counts in, of a command (`CommandHandler.checks`, a `ControlThrottle`: `as` its command, else the command's own), a message command and a control (`ComponentHandler.checks(interaction, id)`, the limit `throttle` gives the form, counted where the form is): while that window is full the use is refused (the window's words: "You can use /report again in …", "That was a lot of clicks…"), and either way nothing is counted (`Throttles.wait`), so nobody types into a form only to be refused. `/report` and Report to moderators check `/report`'s window (`REPORT_WINDOW`), Ask the moderators and Appeal their form's (`APPEAL_THROTTLE`). A handler's own check before its form is a quick read (whether the member reported it already: `moderation.md`); when it fails the form opens as before, and the submit's checks stay (two forms open at once, a restart between).
+- Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
 
 ## Controls and how a press answers
 
diff --git a/docs/architecture/meetup-safety.md b/docs/architecture/meetup-safety.md
index 69e90f81..ca144886 100644
--- a/docs/architecture/meetup-safety.md
+++ b/docs/architecture/meetup-safety.md
@@ -12,7 +12,7 @@ A meetup at a place that might be private is held for a moderator before anythin
 
 ## `/meetup`
 
-- `/meetup name near start` (all required since 8S-1) is refused by its guards for everything that can be known before the form, so that a refusal does not count: no region or forum, a bad name, a member blocked in the server (`MeetupSafety.blocked`, asked before the place and the start are read, so that a blocked member hears of the block and not of a place or start they mistyped: `NO_MEETUPS_FOR_YOU`, with an Appeal button: `blockedRefusal`, a `UserError` with `answer`, which the router shows privately; the same before the form, on its submit and after a meetup made meanwhile), a place `namedPlace` cannot take, a start `typedTimedTime` cannot read for a meetup still to be made (`newPartyTimes('meetup', now)`), and the verdict (asked with `blocked: false`, the block not read twice): `refused` (`NO_MEETUP_HERE`, "A meetup can't be held there."), `review` with a start less than two hours ahead (`MEETUP_TOO_SOON`). Its throttle (`MEETUP_THROTTLE`, two a quarter of an hour) counts the command, so a form left unsent counts too, and requests count like meetups.
+- `/meetup name near start` (all required since 8S-1) is refused by its guards for everything that can be known before the form, so that a refusal does not count: no region or forum, a bad name, a member blocked in the server (`MeetupSafety.blocked`, asked before the place and the start are read, so that a blocked member hears of the block and not of a place or start they mistyped: `NO_MEETUPS_FOR_YOU`, with an Appeal button: `blockedRefusal`, a `UserError` with `answer`, which the router shows privately; the same before the form, on its submit and after a meetup made meanwhile), a place `namedPlace` cannot take, a start `typedTimedTime` cannot read for a meetup still to be made (`newPartyTimes('meetup', now)`), and the verdict (asked with `blocked: false`, the block not read twice): `refused` (`NO_MEETUP_HERE`, "A meetup can't be held there."), `review` with a start less than two hours ahead (`MEETUP_TOO_SOON`). Its throttle (`MEETUP_THROTTLE`, two a quarter of an hour) counts the command, so a form left unsent counts too, and requests count like meetups; a form whose work fails gives the use back (plan 8S-3: `carriesOn`; an unexpected error, a post the bot may not make, `MEETUP_NOT_SENT`: `discord-framework.md`), on the map too.
 - The guard keeps what it read for `execute` (a `WeakMap` by the interaction), so nothing is searched or checked twice before the form must open. The command then opens the form of the information (`meetupForm`, `infoInput` shared with `/info`: required here, at least one character; information of nothing but white space is refused, `NO_INFORMATION`), keeping what it was used with in a `PendingRequests` under the form's token for half an hour (`meetup:<token>:form`; a form open across a restart expires). On the submit (`meetupFormControls`) the reply is deferred privately and `MeetupSafety.make` does the rest, the one entry point for making a meetup with the safety (8M-5M's meetups from the web map call it too: the caller says whether the maker is `staff` and counts the use against its own throttle; a caller without Discord's answers has no Appeal button for a blocked maker and points them to `/meetup`). What the form does with the outcome is `makeMeetupAs` (each outcome in `/meetup`'s words), which the map calls too (`web.md`, "Meetups on the map"), and `refusalOf` is the verdict's refusal for `/meetup`'s guard and the map alike. It refuses a name or information a meetup cannot have (`bad-name`, `bad-description`, white space alone too), asks the verdict again (a ruling or block may have come meanwhile: `refused`, `blocked`), then: allowed, `PartyService.createMeetup` with the start and information (`MeetupRequest.startTime`, `.description`; the meetup is made with them, so one post and no line announcing a start), and `closeIfBlocked` after it (`posted`, with the party); review, `submit` (`held`, the member told `MEETUP_HELD`, never why; or `too-soon`, `not-sent`, `blocked`); `createMeetup`'s own refusals (`no-region`, `no-forum`, `no-post`) come out as they are. `MeetupSafety.closeIfBlocked({ serverId, makerId, partyId, staff })` looks for a block once more after a meetup is made (one that came after the check, whose sweep of the maker's meetups ran before this one was there; never for staff): it closes the meetup as Block member does (`closed`; `close-failed` when that fails, logged, the meetup still up; `false` when not blocked or the block cannot be read), and the member gets the blocked answer. Refusals of the form give the typed information back (`refusedWithText`).
 - A meetup is never at a power spot (Matt, 2026-10-17: they are poorly curated, and many are on private property such as home businesses): `/meetup near:` offers, finds and names a pin by gyms and PokéStops alone (`MEETUP_PLACE_KINDS`, `PlaceKindsOnly` in `src/commands/place-option.ts`) and refuses a picked power spot with `NO_POWER_SPOT`; `MeetupSafety.make` answers `power-spot` for one, staff too, before anything else, so the web map is held to it as well. A meetup stored before at a power spot stays as it is, and `meetupPlaceVerdict` still takes the kind.
 
@@ -32,7 +32,7 @@ A meetup at a place that might be private is held for a moderator before anythin
 
 ## Asks about refused places
 
-- A place refused for good (`NO_MEETUP_HERE`) gets **Ask the moderators** under `/meetup`'s refusal (`placeRefusal`, `src/commands/meetups/place-ask.ts`; the guard's refusal only, a ruling that came while the form was open is said plainly) once the refusal, or its last Keep refused, is `PLACE_ASK_WAIT_DAYS` (14) old (`askableAt`, counted per place, `keptAt`); while an ask of the place is open the refusal adds "It is with the moderators already."; a blocked member is refused by the block first (`askState` and `askAboutPlace` read the block before the place: `blocked`, the block's refusal with Appeal). The web map's refusal has no button: when the place may be asked about it says to ask with `/meetup` on Discord (`ASK_ON_DISCORD`). The button (`mplace:<kind>:open:<place id>`, stateless: the server the presser's, the place by its key, so that it works after a restart; read as reading) opens the form "Why should meetups be allowed here?" (`mplace:<kind>:form:<place id>`, the appeal's throttle) unless `askState` says otherwise (`wait`, `open`, `not-refused`); the place of the ask is the ruling's (a ruling of 8S-1 kept none: the gym or kept Wayspot as it is now, `MeetupSafetyOptions.wayspots`). `MeetupSafety.askAboutPlace` keeps the ask (`PlaceAskRecord`, one open per server and place: a unique `openKey`) and posts it (`askMessage`, `src/render/place-asks.ts`: the member, the place with its official name, the ruling (`rulingLine`: who, when, from which request, report or ask), their words) with Allow place and Keep refused (`mplace:<ask id>:allow|keep`, staff, first press wins; `allowOnAsk` decides and rules allow in one step, the ask the ruling's source, locking the ruling's row before the ask's as `undoRuling` and `keepOnAsk` do, so that they never deadlock; `keepOnAsk` decides and sets `keptAt` only while a refusal stands, locked: undone or allowed meanwhile it keeps nothing, `not-refused`, nobody told); the member is told by DM, the server named (`askOutcomeDm`). An ask nobody decides in `ASK_OPEN_DAYS` (7), or never posted, expires in the sweep of `expire()` (post edited, DM: they may ask again).
+- A place refused for good (`NO_MEETUP_HERE`) gets **Ask the moderators** under `/meetup`'s refusal (`placeRefusal`, `src/commands/meetups/place-ask.ts`; the guard's refusal only, a ruling that came while the form was open is said plainly) once the refusal, or its last Keep refused, is `PLACE_ASK_WAIT_DAYS` (14) old (`askableAt`, counted per place, `keptAt`); while an ask of the place is open the refusal adds "It is with the moderators already."; a blocked member is refused by the block first (`askState` and `askAboutPlace` read the block before the place: `blocked`, the block's refusal with Appeal). The web map's refusal has no button: when the place may be asked about it says to ask with `/meetup` on Discord (`ASK_ON_DISCORD`). The button (`mplace:<kind>:open:<place id>`, stateless: the server the presser's, the place by its key, so that it works after a restart; read as reading) opens the form "Why should meetups be allowed here?" (`mplace:<kind>:form:<place id>`, the appeal's throttle) unless `askState` says otherwise (`wait`, `open`, `not-refused`) or the member's asks of the hour are used up (the form's window, checked before it: `checks`, plan 8S-3; Appeal's form likewise); the place of the ask is the ruling's (a ruling of 8S-1 kept none: the gym or kept Wayspot as it is now, `MeetupSafetyOptions.wayspots`). `MeetupSafety.askAboutPlace` keeps the ask (`PlaceAskRecord`, one open per server and place: a unique `openKey`) and posts it (`askMessage`, `src/render/place-asks.ts`: the member, the place with its official name, the ruling (`rulingLine`: who, when, from which request, report or ask), their words) with Allow place and Keep refused (`mplace:<ask id>:allow|keep`, staff, first press wins; `allowOnAsk` decides and rules allow in one step, the ask the ruling's source, locking the ruling's row before the ask's as `undoRuling` and `keepOnAsk` do, so that they never deadlock; `keepOnAsk` decides and sets `keptAt` only while a refusal stands, locked: undone or allowed meanwhile it keeps nothing, `not-refused`, nobody told); the member is told by DM, the server named (`askOutcomeDm`). The ask's post keeps showing the ruling it asked about (plan 8S-3, staging of 8S-2: after Allow place it showed the new ruling, from the ask): `decideAsk` reads the ruling before the decision and draws the post with it, and Undo ruling with the ruling it removed; no migration, since the post is drawn only then and at an expiry (when the ruling is still the one asked about). An ask nobody decides in `ASK_OPEN_DAYS` (7), or never posted, expires in the sweep of `expire()` (post edited, DM: they may ask again).
 - A ruling keeps who made it by name, the place, the post it came from (`RulingSource`: a request's on Approve and Refuse from now on, a report's on Refuse place…, an ask's on Allow place) and `keptAt` (`PlaceRulingRecord`, `rulingRecord`); `/places` shows it and undoes it (`moderation.md`).
 
 ## Storage
diff --git a/docs/architecture/moderation.md b/docs/architecture/moderation.md
index 0846eb38..d0fb9605 100644
--- a/docs/architecture/moderation.md
+++ b/docs/architecture/moderation.md
@@ -4,8 +4,8 @@ Members report a party or a single message to the moderators privately, the mode
 
 ## Reporting
 
-- `/report` (every member, staff and the party's maker too; in a party's post, `requireParty`) opens a form for the reason (`partyReportForm`, "What is wrong?", required, at most `MAX_REPORT_REASON` 1,000; `report:<party id>:party`). "Report to moderators" is a message command (`reportMessageCommand`, `src/commands/parties/report-message.ts`; `discord-framework.md`): on a party's post, a copy of it (`mirrorMessages`) or its link line in the region's channel (`partyOfMessage`) it opens the same form; on any other message of the bot it answers `NOTHING_TO_REPORT` ("Nothing to report there."); on anybody else's message (a member's chat in a party's post too) it keeps what Discord sent of the message (of a forward, which has no text or files of its own, those of its first `messageSnapshots`, marked `forwarded`: "**What it said** (forwarded)") under a token for half an hour (`PendingRequests`) and opens `report:<token>:message`. The forms' handler is `reportControls` (`src/commands/parties/report.ts`): a reason of white space alone is refused by a guard, uncounted; every submit counts in `/report`'s window (`REPORT_THROTTLE`, five an hour, `as: 'report'`), whichever way the form was opened. A form of the member's old `/delete` (`party:<id>:delete`), open across the deploy, is taken as a report.
-- `ModerationReports` (`src/services/moderation-reports.ts`, `ctx.reports`) keeps reports in `ReportStore` (`ReportRepository`, migration 022; twin `MemoryReports`, both run `reportCases`). `reportParty` / `reportMessage`: one open report per party and per message (`reportTargetKey`, the unique `openKey`): a reason opens it, or joins the open one (`added`; its post edited, never sent again), unless the member has one there (`already`: "You already reported this."). A reason joins a report only while it is open: the repository finds the open report by its key and locks it by its id (a lock on the key's index too would deadlock with a decision, which changes the key), then inserts the reason (a second one of the same member is `already`); a report decided meanwhile is followed by a new one. A report opened is posted first, then recorded (`setReportPost`), then drawn anew when anything changed while the post was on its way (a reason more; its party ended, looked at once more); a post that fails takes the report back (`not-sent`). The post is always drawn from the report as it is kept: `show(reportId)` reads it just before each edit, one edit at a time per report (a promise tail in a `BoundedMap`), so that an older edit never lands after a newer one. A report left without its post for five minutes (the bot stopped in between) is opened anew by the next reason; the reasons of a report that is gone (stranded, its post failed, or forgotten by the sweep) are carried over to the next report of its subject (`orphans`, in memory: a restart loses them, which is accepted), so that nobody told "Sent" loses their reason while the bot runs. The sweep (`ModerationReports.sweep`, with the appeals' sweep of `PartySchedulerOptions.requests`, so also at start) forgets reports never posted for five minutes and ends the open reports of parties that are over (the bot stopped before the listener saw the end). The subject is checked against its schema before it is kept (`reportSubject`). The reporter is told "Sent to the moderators." and nothing more; nothing is said in the party's post and nobody is pinged. What the post shows of the party is a snapshot (`PartySubject`: the post's title, the brief's lines but its line of where, `PartyBrief.whereLine`, since the post's own **Where** says it with the official name; the region, the place, a gym's official name, the maker, a meetup's information), renewed with every reason and at a decision; of a message a copy (`MessageSubject`: author, channel, time, its text cut to `MESSAGE_COPY_ROOM`, its attachments' names, the party whose post it is in), the first report's, kept when the message is gone and when it is edited (a later report that finds its text or attachments changed marks it `edited`, `messageSeenAgain`, and the post says `EDITED_SINCE`), and shown cut after escaping (1,500 characters of text, a name 100 and all names 600). A member's message form keeps one message per member (a newer form expires the older), so that one member cannot push the others out of the store.
+- `/report` (every member, staff and the party's maker too; in a party's post, `requireParty`) opens a form for the reason (`partyReportForm`, "What is wrong?", required, at most `MAX_REPORT_REASON` 1,000; `report:<party id>:party`). "Report to moderators" is a message command (`reportMessageCommand`, `src/commands/parties/report-message.ts`; `discord-framework.md`): on a party's post, a copy of it (`mirrorMessages`) or its link line in the region's channel (`partyOfMessage`) it opens the same form; on any other message of the bot it answers `NOTHING_TO_REPORT` ("Nothing to report there."); on anybody else's message (a member's chat in a party's post too) it keeps what Discord sent of the message (of a forward, which has no text or files of its own, those of its first `messageSnapshots`, marked `forwarded`: "**What it said** (forwarded)") under a token for half an hour (`PendingRequests`) and opens `report:<token>:message`. The forms' handler is `reportControls` (`src/commands/parties/report.ts`): a reason of white space alone is refused by a guard, uncounted; every submit counts in `/report`'s window (`REPORT_THROTTLE`, five an hour, `as: 'report'`, `REPORT_WINDOW` in `report-limit.ts`, which both files read as they load), whichever way the form was opened. Before a form opens (plan 8S-3, staging of 8S-2: the reason typed was lost) `/report` and the Apps menu refuse what the submit would: that window full (`checks`, counting nothing: `discord-framework.md`), and a member whose reason is on the open report of the party or message already (`ModerationReports.reportedBefore` over `ReportStore.openReport(key)`, a quick read raced against `checkTimeoutMs`, a second by default, so that the form still opens within Discord's three seconds: false without the moderators' channel, for a report stranded without its post, and when the read fails or is slower, logged; `REPORT_ALREADY`); the submit's checks stay. A form of the member's old `/delete` (`party:<id>:delete`), open across the deploy, is taken as a report.
+- `ModerationReports` (`src/services/moderation-reports.ts`, `ctx.reports`) keeps reports in `ReportStore` (`ReportRepository`, migration 022; twin `MemoryReports`, both run `reportCases`). `reportParty` / `reportMessage`: one open report per party and per message (`reportTargetKey`, the unique `openKey`): a reason opens it, or joins the open one (`added`; its post edited, never sent again), unless the member has one there (`already`: "You already reported this."). A reason joins a report only while it is open: the repository finds the open report by its key and locks it by its id (a lock on the key's index too would deadlock with a decision, which changes the key), then inserts the reason (a second one of the same member is `already`); a report decided meanwhile is followed by a new one. A report opened is posted first, then recorded (`setReportPost`), then drawn anew when anything changed while the post was on its way (a reason more; its party ended, looked at once more); a post that fails takes the report back (`not-sent`). The post is always drawn from the report as it is kept: `show(reportId)` reads it just before each edit, one edit at a time per report (a promise tail in a `BoundedMap`), so that an older edit never lands after a newer one. A report left without its post for five minutes (the bot stopped in between) is opened anew by the next reason; the reasons of a report that is gone (stranded, its post failed, or forgotten by the sweep) are carried over to the next report of its subject (`orphans`, in memory: a restart loses them, which is accepted), so that nobody told "Sent" loses their reason while the bot runs. The sweep (`ModerationReports.sweep`, with the appeals' sweep of `PartySchedulerOptions.requests`, so also at start) forgets reports never posted for five minutes and ends the open reports of parties that are over (the bot stopped before the listener saw the end). The subject is checked against its schema before it is kept (`reportSubject`). The reporter is told "Sent to the moderators." and nothing more; nothing is said in the party's post and nobody is pinged. What the post shows of the party is a snapshot (`PartySubject`: the post's title, the brief's lines but its line of where, `PartyBrief.whereLine`, since the post's own **Where** says it with the official name; the region, the place, a gym's official name, the maker, a meetup's information), renewed with every reason and at a decision; of a message a copy (`MessageSubject`: author, channel, time, its text cut to `MESSAGE_COPY_ROOM`, its attachments' names, the party whose post it is in; in a party's post the head names the post once, by the title it had: "Written by **Tester** in the post of **Train · Whole Group (B)**", without the post's mention, plan 8S-3), the first report's, kept when the message is gone and when it is edited (a later report that finds its text or attachments changed marks it `edited`, `messageSeenAgain`, and the post says `EDITED_SINCE`), and shown cut after escaping (1,500 characters of text, a name 100 and all names 600). A member's message form keeps one message per member (a newer form expires the older), so that one member cannot push the others out of the store.
 - Without `settings.channels.moderation` a party's report goes into its post as a member's `/delete` did (`PartyService.requestDeletion`: the public line, the staff roles pinged by the first that is sent, the reason cut to 500 so that the message with its pings stays within 2,000), and a message cannot be reported (`NO_MODERATORS`).
 
 ## The moderators' post and its decisions
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index e2437a80..31b0f123 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -70,7 +70,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 The tools of the cutover, for every legacy instance (Pittsburgh's night: `docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md`).
 
 - `./pine convert-settings <legacy data folder> [--out <folder>] [--force]` (`npm run settings:convert -- …` on a checkout; `convertSettings` / `convertInstallation`, `src/ops/convert-settings.ts`): reads the legacy `settings.json` and `private-settings.json` and writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml` (or into `--out`), never `.env` itself, and neither file when either exists unless `--force`. The settings start from the repository's `data/settings.json` (the new keys' defaults: the timezone, the screen reader, the feeds), and every key the new bot reads takes the legacy value; renamed keys are mapped (`RENAMED`: `channels.ex-gym-raids` to `channels.elite-gym-raids`), help groups the new bot does not have are dropped from `helpGroups`, every key nothing reads (the EX durations, `commandPrefix`, the reactions) is dropped and named, and a feature flag the legacy file lacks is off (`offByAbsence`: the legacy bot read it as undefined); the result must pass the bot's own schema, or nothing is written. `regionMapLink` comes from the private settings. The private settings map to `.env` (`PRIVATE_TO_ENV`: the token, the owner, the database, the picture address (`POKEMON_IMAGE_BASE`, optional: nothing reads it any more, so it is never asked for by hand), Google, GitHub's token and repository); secrets are copied as written (never trimmed; a snowflake written as a JSON number is refused: it has lost digits); both files go to temporary files first (the fragment owner-only from its creation) and are renamed into place only when both were written; the fragment lists what the operator adds by hand (`DISCORD_APP_ID`, which the legacy bot never had, `DB_ROOT_PASSWORD`, `BACKUP_DIR`, written as `./backups` meanwhile, since a blank one switches the backups off; a `DB_USER` of `root`, which the stack cannot make). A file that starts with a byte order mark is read. It prints names and "set" / "empty", never a value. In the stack it runs without Compose (Compose refuses `compose.yaml` without `.env`): `docker build` under a tag of its own (`professor-pine:convert-settings`: under a stack's tag it would re-tag the image that stack runs), then `docker run` of that image as the operator's own user with the legacy folder mounted read-only and the output folder writable; a folder is handed to Docker as `docker_folder` makes it (`pwd -W` in Git Bash).
-- `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; in rehearsal mode the application's global commands (a warning: every member sees them; one that cannot be read is a warning too, and the rest is still checked) and, per server, what the bot's own roles must give it to make a hidden forum (`HIDDEN_FORUM_NEEDS`: Manage Channels, Manage Roles, View Channel, Send Messages, Read Message History, Send Messages in Threads and Add Reactions, all required; one FAIL line names those missing: a hidden forum's creation may give only what the bot has in the server, so a category's overwrite does not count; the server's warning of optional permissions leaves out what that line names, so one problem gives one line); the servers of `Guild` the bot is in (a FAIL when it is in none of them, and when a legacy or Pine database names no server or has no regions: the wrong copy; a warning for a new install); per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); meetup safety's moderators' channel (`moderation`, plan 8S-1: a warning when `settings.channels.moderation` is unset, so the safety is off, when the server has no text channel of that name, when the bot lacks what it needs there (`MODERATION_NEEDS`: View Channel, Send Messages, Embed Links), or when everyone can see it, or a role that is no staff role (neither named as one, `isStaffRoleName`, nor with Manage Server or Administrator; the bot's own roles left out) lets its holders see it, those roles named (it must be staff-only); a pass otherwise); with the moderators' channel set, whether the bot may delete what reports are about in every region (`reports`, plan 8S-2: Manage Messages in the region's channel and forum, Manage Threads in the forum; a warning, never a failure: the moderators then delete them themselves; it overlaps on purpose with the region line's optional Manage Messages, which says what the screenshots lack, and it looks at the regions alone: a message reported in another channel may still find the bot without Manage Messages, which Delete message then says); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
+- `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; in rehearsal mode the application's global commands (a warning: every member sees them; one that cannot be read is a warning too, and the rest is still checked) and, per server, what the bot's own roles must give it to make a hidden forum (`HIDDEN_FORUM_NEEDS`: Manage Channels, Manage Roles, View Channel, Send Messages, Read Message History, Send Messages in Threads and Add Reactions, all required; one FAIL line names those missing: a hidden forum's creation may give only what the bot has in the server, so a category's overwrite does not count; the server's warning of optional permissions leaves out what that line names, so one problem gives one line); the servers of `Guild` the bot is in (a FAIL when it is in none of them, and when a legacy or Pine database names no server or has no regions: the wrong copy; a warning for a new install); per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`; in a forum by the names its settings show beside the usual ones, `inForum`: Manage Posts (Manage Threads), Create Posts (Send Messages), Send Messages in Posts (Send Messages in Threads), plan 8S-3; the `moderation` line says in one warning who sees the moderators' channel that should not and which staff role does not), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); meetup safety's moderators' channel (`moderation`, plan 8S-1: a warning when `settings.channels.moderation` is unset, so the safety is off, when the server has no text channel of that name, when the bot lacks what it needs there (`MODERATION_NEEDS`: View Channel, Send Messages, Embed Links), or when everyone can see it, or a role that is no staff role (neither named as one, `isStaffRoleName`, nor with Manage Server or Administrator; the bot's own roles left out) lets its holders see it, those roles named (it must be staff-only), or when a staff role (`isManagementRoleName`: Admin, Moderator) cannot see it, those roles named (plan 8S-3: the links of `/places` and the reports do not open for their members); a pass otherwise); with the moderators' channel set, whether the bot may delete what reports are about in every region (`reports`, plan 8S-2: Manage Messages in the region's channel and forum, Manage Threads in the forum; a warning, never a failure: the moderators then delete them themselves; it overlaps on purpose with the region line's optional Manage Messages, which says what the screenshots lack, and it looks at the regions alone: a message reported in another channel may still find the bot without Manage Messages, which Delete message then says); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
 - `/admin cleanup-legacy` (staff, `defer: 'ephemeral'`; `src/commands/admin/cleanup-legacy.ts`, `LegacyCleanup` in `src/services/legacy-cleanup.ts`, the rules in `src/ops/legacy-cleanup.ts`) deletes the legacy bot's party channels in two steps. The list, read only through Discord's REST API (the client's own `rest`; `cleanupList`): the text channels the legacy `active/` files name (`readLegacyActive`, `src/ops/legacy-parties.ts`: only the channel, the kind and the region channel are taken, never the members), and orphans: text channels in a scanned category (those of the region channels and of the channels the files name; never the channels in no category, the server's own, where a region channel without a category also sits) whose name is a legacy party name (`legacyNameOf`: `train-…`, `meetup-…`, `egg-<tier>-…`, `boss-<tier>-…`, `expired-…`, `ex-raid-…`, `elite-raid-…` are sure) and whose oldest message (`GET /channels/{id}/messages?after=0&limit=1`) is the bot's. A hatched raid's `<pokemon>-<gym words>` is any name of two words: it is deleted only when its first message is the legacy bot's status (`LEGACY_STATUS`: "Use #region to return to this raid's regional channel.", as `getSourceChannelMessageHeader` of the legacy `app/raid.js`, `train.js`, `meetup.js` wrote it), and listed apart when the bot wrote something else first. Never listed, whatever a file says: a region channel, a region's forum, a channel the settings name (`settings.channels`). A channel with a sure name whose first message is not the bot's (a member's, none, unreadable), or one with the bot first and no legacy name, is listed apart as "Not deleted" for a person. The answer is a components-v2 message (the whole list as `legacy-cleanup.txt` when it does not fit), with "Delete these n channels" and Cancel, which only the one who asked may press within `CLEANUP_MINUTES` (10; `PendingRequests`); the deletion goes one channel at a time, a second apart (discord.js waits out a 429 besides; `LegacyCleanup` takes a `wait`, which tests pass), logs each, shows how far it is every ten channels in the answer (so that a long run says something before the interaction's quarter of an hour ends), counts what was gone already and says what failed (by whole lines, then "…and n more"); a second press meanwhile is only acknowledged. One press deletes at most `CLEANUP_PER_RUN` (400) channels, so that the run ends while the press's quarter of an hour still lets it say so: the button then reads "Delete 400 of these n" and the answer says to run the command again for the rest. The legacy files come from `LEGACY_PARTIES_DIR`, a folder the stack mounts read-only at `/legacy-parties` (blank: none; the list is then made of orphans alone, which the legacy active parties' channels also are when the bot wrote first); `./pine up`, `restart` and `update` refuse a `LEGACY_PARTIES_DIR` without `active/`. A folder rather than attachments: the same reading serves `cutover-check`, nineteen files need no upload, and the files' member ids never go to Discord. `./pine cutover-check --legacy-parties <folder>` mounts that folder for the check alone and counts the list without deleting.
 - **Rehearsal mode** (`settings.rehearsal`: `allowlist` of member ids, `regions` by their channels' names as written, a leading `#` refused, and those no region channel of the server has named in the answer of `/admin setup-forums` (a failure to compare them is a line of that answer and a warning in the log), `staffRoles` by name; `src/services/rehearsal.ts`) runs the bot with a production token against a copy of the production database while the legacy bot is off for a short while, and nothing of it may reach members (spec 2, anti-goals). While it is set: `RehearsalDms` passes direct messages to the allowlist only (the others are dropped, and one line a minute says how many); `rehearsalGateway` wraps the party gateway so that a message goes only into the post of a party in a rehearsed forum (meetup safety alone gets a gateway of its own over it, `rehearsalModeratorsGateway`, that lets its requests and appeals into the text channel `settings.channels.moderation` names, so that they reach the staff who rehearse; Matt, 2026-10-17; whatever else of the bot sends there goes through the rehearsal's gateway and is dropped, and the settings refuse a moderators' channel named as another of `settings.channels`), a post only into such a forum and a forum only beside a rehearsed region's channel (everything else is dropped and logged: the boss list's announcements and staleness warnings, the gym and Wayfarer announcements, the link to a new post in its region's channel, the copies in the remote and elite channels, spawn reports and their Unown copies, so also any announcement added later), no forum is made but a hidden one, no category or text channel is made (answered as a refused permission) and no channel is deleted but a forum made through it; the count of dropped direct messages is logged once more at shutdown, after the client is down (`RehearsalDms.flush`); the router answers only the allowlist and staff (Manage Server, Administrator or a role of `staffRoles`, a name compared trimmed and in any case, `staffRoleKey`, as the hidden forums compare it) and everybody else with `REHEARSAL_REFUSAL`; outside the posts of the rehearsed forums every answer is private (`answeredInRehearsal`: each reply, deferral and follow-up gets the Ephemeral flag), so that no channel shows a command's answer; `/request` is refused (`REQUEST_IN_REHEARSAL`: it would file a real GitHub issue); the screenshot trigger reads nothing (it reacts and answers in the channel; the testers use `/raid` with a screenshot); `/admin setup-forums` makes forums only for the rehearsed regions and hides them before anything is posted in them: a new forum is made hidden (`createForum` with `hidden`; a forum that cannot be made so is not made), one that is there gets its overwrites set as a whole (`PartyGateway.hideForum`, `hiddenForumOverwrites`: every overwrite it had, also those taken over from its category, replaced; View Channel and Send Messages denied to everyone, the bot allowed (and, on its own overwrite, every permission of a forum it has where Discord checks the set, but Manage Roles, which only an administrator may set in a channel and the bot keeps through its role: in the server for a new forum, whose creation may give only that, then in the category when `setupForum` hides the new forum once more; a forum Discord refuses to make hidden is said as `HIDDEN_FORUM_REFUSED`, which no other refusal is; a refusal of the second hide leaves the new forum hidden as it was made and set up all the same, with a warning in the log and a parenthesis in the answer that name what only the category would have given the bot (`categoryOnlyPermissions`); a forum that was there and whose hide is refused is set up the same way only when its own overwrites hide it already (`isHiddenForum`: View Channel denied to everyone, everyone's own server permissions counted, and allowed only to the bot (its member, or the role Discord made for it, `role.tags.botId`), the staff roles by the same rule and the allowlist), and its answer says "it was already hidden from members (Discord refused to set its permissions…)", without naming a cause; else it gets nothing posted: a refusal alone never counts as hidden, since production's forums are there too), the staff roles by name and every role that may manage the server allowed, and each allowlisted member with one permission more than an admission, so that `dismissMember` leaves it), and a forum that cannot be hidden gets nothing posted, its answer saying how to hide it by hand so that a second run accepts it: View Channel denied to @everyone, and allowed only to Professor Pine itself (its member or its own role), the staff roles (those `settings.rehearsal.staffRoles` names, and every role with Manage Server or Administrator) and the testers; the fake gateway computes who sees a forum from its overwrites and the members' roles (`src/ops/permissions.ts`); `/admin cleanup-legacy` only lists. `./pine deploy-commands --rehearsal` registers the commands as the commands of the servers of `Guild` that the bot is in (`GET /users/@me/guilds`; each named before anything is sent, those it is not in left out; a registration that fails is said and the others go on, `sendDeploy`), each command as it is (the staff commands with their Manage Server default); the admin restricts the application to staff and the testers under Server Settings > Integrations (@everyone off for the application as a whole) and adds a tester without Manage Server to `/admin`, `/gym` and `/region` one by one, since an allow for the application does not beat a command's default permission (staging 2026-10-16; runbook R1). It refuses `--global` / `--guild` while the mode is on; `--clear-guild` takes them away at the end (`deployPlan`, `src/discord/deploy.ts`). The start logs a warning, the heartbeat carries `rehearsal: true` and every health line (so `./pine status`) ends with "REHEARSAL MODE IS ON", and the owner gets an alert (`REHEARSAL_ALERT`) at a start (as every alert of a kind, not again within fifteen minutes: `minIntervalMs`). The web pages stay off (`servedSettings` drops `settings.web`, for the bot and for the commands `deploy-commands` registers; `configWarnings` says so): the rehearsal's `.env` sets no `COMPOSE_PROFILES=tunnel`. `/region` makes, renames, moves or deletes no channel (`REHEARSAL_CHANNELS`, `src/commands/regions/shared.ts`): an import that would create a channel, and a removal that would delete the forum, are refused with that sentence; outlines alone and a removal that keeps the forum go on. The Unown want a holder of the old role is given (`UnownWantService.noticed`) is still given to a member the rehearsal does not answer: it is written to the copy of the database only, which the night replaces with a fresh dump.
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index f06f758a..f63620e8 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -50,7 +50,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Discord: the gateway and the party service
 
-- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, Send Messages in Posts, and Manage Posts only for a post with tags, so that a region's summary, which has none, is made without it as before and only its pin warns), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
 - `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for trains and meetups, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 8b21a442..db680e88 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -19,5 +19,5 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 
 ## On Discord
 
-- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes; a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
 - `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 9ed7ec9a..10c726ac 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -39,7 +39,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Reports to the moderators
 
-- `ReportRepository` and `MemoryReports` (`test/support/reports.ts`, `failing` per method) run the same cases (`reportCases`, `test/support/report-cases.ts`, with `partySubject`, `messageSubject`, `newReport`, `reason`). The service, its decisions and the controls are tested over `reportsWith(options)` and `reportedMeetup()` (`test/support/reports-service.ts`; `moderation.md`); the fake gateway's `noManaging` refuses deleting posts and messages there, and a reported message deleted in an archived post counts a reopening of it. The edits of a report's post in their order are tested by holding the gateway's `sendMessage` or `editMessage` into the moderators' channel (`hold`, `moderation-reports.posts.test.ts`); a reason racing a decision against real MySQL waits for the row lock (`report-repository.db.test.ts`, a real-time wait, so this plan runs its changed test files ten times).
+- `ReportRepository` and `MemoryReports` (`test/support/reports.ts`, `failing` per method) run the same cases (`reportCases`, `test/support/report-cases.ts`, with `partySubject`, `messageSubject`, `newReport`, `reason`). The service, its decisions and the controls are tested over `reportsWith(options)` and `reportedMeetup()` (`test/support/reports-service.ts`; `moderation.md`); the fake gateway's `noManaging` refuses deleting posts and messages there, and its `refusePosts` (forum id to the names of `POST_PERMISSIONS` the bot lacks there, plan 8S-3) refuses making a post there as `DiscordPartyGateway` does (`PostsRefusedError` with those the post needs: Manage Posts only for a post with tags, so a summary is made without it; an empty list is Discord's Missing Access, whatever the post; Manage Posts listed also refuses `pinPost` there, Missing Permissions), its `losePosts` makes every new post go before its first message is edited in (`no-post` without a refusal), and a reported message deleted in an archived post counts a reopening of it. The edits of a report's post in their order are tested by holding the gateway's `sendMessage` or `editMessage` into the moderators' channel (`hold`, `moderation-reports.posts.test.ts`); a reason racing a decision against real MySQL waits for the row lock (`report-repository.db.test.ts`, a real-time wait, so this plan runs its changed test files ten times).
 
 ## The party history
 
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 8d074436..5d383b3b 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -126,7 +126,7 @@ Read what it prints, especially:
 - **"New settings at their defaults"**: settings the legacy bot did not have. The **`timezone`** is among them, and its default is `America/New_York`. Change it in `pine-settings.json` to yours (an IANA name such as `Europe/London` or `America/Chicago`): every time members type is read in it.
 - **"Off, because the legacy file lacks them"**: switches the legacy bot read as off. They stay off.
 - The **channel names** under `channels` (the bot lab, the moderators' channel, Unown sightings, the elite and remote raid channels, the PvP channel, bot updates) must be the names your server uses. `cutover-check` (4.7) tells you which it cannot find.
-- **Meetup safety** is new and off until you add `"moderation": "<channel>"` under `channels`: a staff-only channel (never bot updates) where meetups at a pin, or at a place whose name sounds private, wait for a moderator's approval, and blocked members' appeals arrive. Add it now or after the move; `cutover-check` warns while it is missing. During a rehearsal its posts go through (the testing staff see them); nothing else of the bot is posted there. `"meetupSafety": { "flaggedWords": [...] }` adds words to the names held for a moderator.
+- **Meetup safety** is new and off until you add `"moderation": "<channel>"` under `channels`: a staff-only channel (never bot updates), visible to every staff role (each role named `admin` or `moderator`: a moderator who cannot see it cannot open the links of `/places` and the reports), where meetups at a pin, or at a place whose name sounds private, wait for a moderator's approval, and blocked members' appeals arrive. Add it now or after the move; `cutover-check` warns while it is missing. During a rehearsal its posts go through (the testing staff see them); nothing else of the bot is posted there. `"meetupSafety": { "flaggedWords": [...] }` adds words to the names held for a moderator.
 
 ### 4.4 Fill in `.env`
 
@@ -225,7 +225,7 @@ It reads the database and, with the bot's token, Discord's API (reading only; it
 - **forums**: every region without a forum warns. That is expected: step 4.9 makes them.
 - **names**: channels, a category or a role the settings name that your server does not have. Fix `pine-settings.json` or the server.
 - **announcements**: whether the bot may post in the channels it announces in (bot updates, the moderators' channel, Unown sightings, the elite and remote raid channels).
-- **moderation**: meetup safety's channel: a warning while `channels.moderation` is not set (the safety is off), when the server has no such text channel, when the bot may not see it, send or embed links there, or when everyone can see it (make it staff-only).
+- **moderation**: meetup safety's channel: a warning while `channels.moderation` is not set (the safety is off), when the server has no such text channel, when the bot may not see it, send or embed links there, when everyone can see it (make it staff-only), or when a staff role (a role named `admin` or `moderator`) cannot see it (let every staff role see it). In a region's forum it names the permissions as the forum's settings do: Manage Posts (Manage Threads), without which the bot makes no post there, Create Posts (Send Messages), Send Messages in Posts.
 - **restrictions**: rows of the legacy `!require-role` restrictions. The new bot does not use them; `./pine role-auth-export` lists them as the new commands, and an admin sets the same under Server Settings → Integrations → Professor Pine.
 - **roles**: self-assigned roles at or above the bot's highest role, which the bot cannot give. Move the bot's role above them.
 - **cleanup**: how many legacy channels `/admin cleanup-legacy` would delete, and which it would leave to a person.
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index a00aab48..aaf8909c 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -28,7 +28,7 @@ In the [Discord Developer Portal](https://discord.com/developers/applications):
    - View Channels, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History
    - Manage Channels (the forums, and the channels `/region import` creates)
    - Manage Roles (self-assigned roles, and who may see a forum)
-   - Manage Threads (archiving, locking, renaming and pinning posts)
+   - Manage Threads (archiving, locking, renaming and pinning posts, and the tags of a post; in a forum's own permissions Discord calls it **Manage Posts**, and without it there the bot makes no post at all and tells the member so)
    - Add Reactions and Use External Emojis (optional)
    - Manage Messages (optional: taking a screenshot away once it became a raid, and deleting a message the moderators delete from a report)
 
@@ -36,7 +36,7 @@ In the [Discord Developer Portal](https://discord.com/developers/applications):
 
 The bot's role must sit above the roles members may give themselves with `/iam`.
 
-**Staff.** The staff commands (`/admin`, `/gym`, `/region`) are offered to members with **Manage Server**, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer` (any capitals), or who are the bot's owner (`OWNER_ID` below). Give your staff such a role. `/delete` and `/places` are offered to members with **Manage Messages** instead, so that moderators without Manage Server have them; members tell the moderators what is wrong with `/report`, or with **Report to moderators** in the Apps menu of a message, and the reports go to the moderators' channel (`channels.moderation`, staff-only). You can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry (an allowance for the application as a whole does not beat the Manage Server default); they still need one of those roles for the bot to answer.
+**Staff.** The staff commands (`/admin`, `/gym`, `/region`) are offered to members with **Manage Server**, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer` (any capitals), or who are the bot's owner (`OWNER_ID` below). Give your staff such a role. `/delete` and `/places` are offered to members with **Manage Messages** instead, so that moderators without Manage Server have them; members tell the moderators what is wrong with `/report`, or with **Report to moderators** in the Apps menu of a message, and the reports go to the moderators' channel (`channels.moderation`: hidden from everybody else, and visible to every staff role, Admin and Moderator alike, or the links of `/places` and of the reports do not open for a moderator who cannot see it). You can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry (an allowance for the application as a whole does not beat the Manage Server default); they still need one of those roles for the bot to answer.
 
 Note your own Discord user ID too (User Settings → Advanced → Developer Mode, then right-click your name → Copy User ID): it becomes `OWNER_ID`, who counts as an admin everywhere and gets the bot's alerts.
 
@@ -114,7 +114,7 @@ The settings that matter first:
 
 - `timezone`: yours, as an IANA name (`America/Chicago`, `Europe/London`). Every time members type is read in it. The file comes with `America/New_York`.
 - `channels`: the names of channels the bot uses in your server: `bot-lab` (where members try commands), `mod-bot-lab` (the moderators'), `unown` (Unown sightings), `elite-gym-raids` and `remote-raids` (copies of elite and remote raids), `pvp`, `bot-updates` (announcements). Make the channels or change the names.
-- Meetup safety (optional, and off until you set it): a meetup at a place that might be private (a pin from a maps link, or a gym or PokéStop whose name sounds like a front yard: a little free library, apartments) is held for a moderator, and posted only when one approves it. Make a text channel that only your staff can see (never the public bot updates channel), where the bot may view, send messages and embed links, and name it in `channels`, for example `"moderation": "meetup-review"` (the example settings have it blank, which is unset). The requests and the appeals of blocked members go there, with buttons for admins and moderators. Without it every meetup is posted at once, and the bot's log warns of it at every start. To hold more names for a moderator, add `"meetupSafety": { "flaggedWords": ["duplex", "cottage"] }` (whole words, any letter case).
+- Meetup safety (optional, and off until you set it): a meetup at a place that might be private (a pin from a maps link, or a gym or PokéStop whose name sounds like a front yard: a little free library, apartments) is held for a moderator, and posted only when one approves it. Make a text channel that only your staff can see (never the public bot updates channel), and that every staff role can see (each role named `admin` or `moderator`: a moderator who cannot see it gets "You don't have access to this link" from every link of `/places` and the reports), where the bot may view, send messages and embed links, and name it in `channels`, for example `"moderation": "meetup-review"` (the example settings have it blank, which is unset). The requests and the appeals of blocked members go there, with buttons for admins and moderators. Without it every meetup is posted at once, and the bot's log warns of it at every start. To hold more names for a moderator, add `"meetupSafety": { "flaggedWords": ["duplex", "cottage"] }` (whole words, any letter case).
 - `categories.pvp`: the category of your PvP channels: `/rank` and its short forms work only there and in a direct message with the bot.
 - `features`: `exGymChannel` and `remoteRaidChannel` (whether raids are copied into those channels), `notifications` (direct messages for wants and gym targets), `roles` (self-assigned roles with `/iam`).
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
diff --git a/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md b/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
new file mode 100644
index 00000000..0c37aa4a
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
@@ -0,0 +1,30 @@
+# Phase 8S-3 staging checklist: the small fixes from the 8S-2 staging (draft)
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member; for step 15 given a role "Moderator"). The moderators' channel `meetup-review` is set (`channels.moderation`). No migration: the dev database stays at 022. No new command: no deploy is needed. The conventions are `docs/architecture/moderation.md`, `meetup-safety.md`, `discord-framework.md` and `parties-and-posts.md`.
+
+## Checks before the form
+
+1. As Tester, `/report` in a meetup's post and send it. `/report` there again: "You already reported this." at once, no form. The Apps menu "Report to moderators" on the meetup's post and on its line in the region channel: the same, no form.
+2. As Tester, report a message of Googer's with the Apps menu, then use it on that message again: "You already reported this.", no form. As Googer on the same message: the form opens.
+3. As Tester, five reports within the hour (forms sent), then `/report` on a sixth party and the Apps menu on a sixth message: "You can use /report again in …" before any form. Opening forms and closing them unsent counts nothing (open six, send none, then a seventh still opens).
+4. An ask about a refused place (a place refused 15 days back, `var/stage/q.mjs`): after three asks of the hour (each refused or failed), Ask the moderators answers "That was a lot of clicks. Try again in …" before its form. The same for a blocked member's Appeal after three appeals.
+
+## The moderators' posts
+
+5. As Tester, report a member's message inside a train's post: the report's post reads "Written by **…** in the post of **Train · …** <time>", the post named once, with Go to message. A message in a region channel still reads "in #channel".
+6. An ask about a refused place, then Allow place: the ask's post still shows "**Ruling** Refused by … from a report" (or request), its last line "**Allowed** by …". Another ask, then Keep refused: the Ruling line shows the refusal as it was (no "kept refused" of now). Another ask, then `/places place:` → Undo ruling: the ask's post shows the ruling that was undone and "Ruling undone on /places".
+
+## Throttles given back
+
+7. Deny the bot Manage Threads ("Manage Posts") in a region's forum. As Tester, `/meetup` there twice in a row: each answers "I am not allowed to make posts in #…: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me." (the information given back), no "Something went wrong". The bot's log has one warning "the bot may not make posts in a forum: staff must give it the permissions" for that forum.
+8. Give the permission back: two `/meetup`s in a row work, the third is throttled (the refused ones did not count).
+9. With the permission denied again: `/raid` there answers the same sentence once, in its own answer (in place of the gym menu when the gym was picked from it; with a screenshot, beside its Screenshot feedback button; no second answer below), uncounted; `/train` too (two more `/train`s work once it is back); on the web map a raid, a meetup and a train there say it (the forum by its name), uncounted. A screenshot of a raid at a gym of that region, posted with a mention: the same sentence.
+10. With the permission denied in East's forum: `/location` moving a raid from West to a gym in East: "Nothing was moved. I am not allowed to make posts in #…, the other region's forum: I lack the permission Manage Posts there. The server's staff must give it to me. The raid stays here."
+11. A meetup held for the moderators in that forum, approved by Googer: the request's post and Tester's DM say "I am not allowed to make posts in its forum (the server's staff must give me Manage Posts there)". Put the permission back.
+12. With Manage Threads denied in a region's forum and its summary post deleted: `/admin setup-forums` posts the list of active raids there again, and its line says "posted the list of active raids (I could not pin it: give me Manage Posts there)" (the bot's log warns that it could not pin it). With Send Messages ("Create Posts") denied instead: its line reads "I am not allowed to post the list of active raids in #…: I lack the permission Create Posts there. Give it to me and run this again.", not "Something went wrong". Put it back and run it once more.
+
+## cutover-check and the guides
+
+13. Only on Matt's go-ahead (it reads Discord's REST API): `npm run cutover-check` with the forum's Manage Threads denied: the region line names "Manage Posts (Manage Threads) in the forum #…", and the `reports` line likewise. Put it back.
+14. With the Moderator role denied View Channel on `#meetup-review`: the `moderation` line warns "the role Moderator cannot see #meetup-review: the links of /places and of the reports there do not open for its members; let every staff role see it". If a role of members can see the channel as well, both are said in the one warning. Put it back: the line passes.
+15. Tester with the role "Moderator" and View Channel on `#meetup-review`: the links of `/places` and of the reports open.
diff --git a/src/discord/guards.ts b/src/discord/guards.ts
index 860c7c1d..e1ad31f8 100644
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -31,6 +31,14 @@ export function isStaffRoleName(name: string): boolean {
   return hasRole([name], BOT_MANAGEMENT_ROLES);
 }
 
+/**
+ * Whether a role of this name makes whoever holds it an admin or a moderator of the server (the
+ * staff of `isManagement`, who decide in the moderators' channel), by the guards' comparison.
+ */
+export function isManagementRoleName(name: string): boolean {
+  return hasRole([name], MANAGEMENT_ROLES);
+}
+
 export function isManagement(
   roleNames: Iterable<string>,
   userId: string,
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index 6df6cdeb..88596c01 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -381,6 +381,49 @@ describe('cutoverCheck', () => {
     });
   });
 
+  describe("the moderators' channel and the staff roles", () => {
+    it("warns of a staff role that cannot see the moderators' channel, by the bot's staff role names", async () => {
+      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
+      const admins = api.addRole(shape.guild, 'Admin');
+      api.addRole(shape.guild, 'moderator');
+      api.addRole(shape.guild, 'Bot Developer');
+      if (review) review.overwrites = [...review.overwrites, overwrite(admins, [P.ViewChannel])];
+      expect(line(await check(), 'moderation')).toEqual({
+        what: 'moderation',
+        status: 'warn',
+        text:
+          'moderation: in Pittsburgh the role moderator cannot see #meetup-review: the links of ' +
+          '/places and of the reports there do not open for its members; let every staff role ' +
+          'see it',
+      });
+    });
+
+    it('says in one warning both that members can see it and that a staff role cannot', async () => {
+      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
+      const trainers = api.addRole(shape.guild, 'Trainers');
+      api.addRole(shape.guild, 'Moderator');
+      if (review) review.overwrites = [...review.overwrites, overwrite(trainers, [P.ViewChannel])];
+      expect(line(await check(), 'moderation')).toEqual({
+        what: 'moderation',
+        status: 'warn',
+        text:
+          'moderation: in Pittsburgh the role Trainers can see #meetup-review and is no staff ' +
+          'role: its posts name members and where they meet; make it staff-only. And the role ' +
+          'Moderator cannot see #meetup-review: the links of /places and of the reports there ' +
+          'do not open for its members; let every staff role see it',
+      });
+    });
+
+    it('passes where every staff role sees it, by an overwrite or by Administrator', async () => {
+      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
+      const moderators = api.addRole(shape.guild, 'Moderator');
+      api.addRole(shape.guild, 'Admin', P.Administrator);
+      if (review)
+        review.overwrites = [...review.overwrites, overwrite(moderators, [P.ViewChannel])];
+      expect(line(await check(), 'moderation')).toMatchObject({ status: 'pass' });
+    });
+  });
+
   describe('the global commands', () => {
     it('warns in rehearsal mode of commands every member would see', async () => {
       api.globalCommands = ['raid', 'help'];
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index 38380633..adc8ee19 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -24,7 +24,7 @@ import {
   type Need,
 } from './permissions.js';
 import { exportText, roleAuthExport } from './role-auth.js';
-import { isStaffRoleName } from '../discord/guards.js';
+import { isManagementRoleName, isStaffRoleName } from '../discord/guards.js';
 
 /*
  * The cutover check (`./pine cutover-check`, `npm run cutover:check`): whether a legacy
@@ -380,7 +380,13 @@ async function serverLines(
       )
       .map((role) => role.name);
   };
-  lines.push(moderationLine(guild.name, channels, settings, permissionsIn, seenBy));
+  // The staff roles (Admin, Moderator: those who decide there) that cannot see it: the links of
+  // `/places` and of the reports do not open for their members (staging of 8S-2).
+  const unseenByStaff = (channel: ApiChannel): string[] =>
+    guild.roles
+      .filter((role) => isManagementRoleName(role.name) && !sees(holderOf([role.id]), channel))
+      .map((role) => role.name);
+  lines.push(moderationLine(guild.name, channels, settings, permissionsIn, seenBy, unseenByStaff));
   if (settings.channels.moderation !== undefined) lines.push(reportsLine(guild.name, reportGaps));
   const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
   if (rolesCheck) lines.push(rolesCheck);
@@ -431,9 +437,10 @@ function announceLine(
 
 /**
  * Meetup safety (plan 8S-1): whether the moderators' channel is set, the server has it (a text
- * channel, as the bot finds it), the bot may post in it (`MODERATION_NEEDS`) and it is
- * staff-only (`seenBy`: not seen by everyone, nor through a role that is no staff role). A
- * warning, never a failure: without it every meetup is posted at once, as before.
+ * channel, as the bot finds it), the bot may post in it (`MODERATION_NEEDS`), it is staff-only
+ * (`seenBy`: not seen by everyone, nor through a role that is no staff role), and every staff
+ * role sees it (`unseenByStaff`, plan 8S-3: Admin and Moderator by name). A warning, never a
+ * failure: without it every meetup is posted at once, as before.
  */
 function moderationLine(
   server: string,
@@ -441,6 +448,7 @@ function moderationLine(
   settings: Settings,
   permissionsIn: (channel: ApiChannel) => bigint,
   seenBy: (channel: ApiChannel) => 'everyone' | string[],
+  unseenByStaff: (channel: ApiChannel) => string[],
 ): CheckLine {
   const name = settings.channels.moderation;
   if (name === undefined) {
@@ -469,23 +477,36 @@ function moderationLine(
       text: `moderation: in ${server} the bot lacks ${needNames(missing)} in #${name}: ${cannot}`,
     };
   }
+  // Who sees it that should not, and which staff role does not: both in one warning (plan 8S-3).
+  const problems: string[] = [];
   const seen = seenBy(channel);
   const staffOnly = 'its posts name members and where they meet; make it staff-only';
   if (seen === 'everyone') {
-    return {
-      what: 'moderation',
-      status: 'warn',
-      text: `moderation: in ${server} everyone can see #${name}: ${staffOnly}`,
-    };
-  }
-  if (seen.length > 0) {
+    problems.push(`everyone can see #${name}: ${staffOnly}`);
+  } else if (seen.length > 0) {
     const roles = `the role${seen.length === 1 ? '' : 's'} ${seen.join(', ')}`;
+    problems.push(
+      `${roles} can see #${name} and ` +
+        `${seen.length === 1 ? 'is no staff role' : 'are no staff roles'}: ${staffOnly}`,
+    );
+  }
+  const unseen = unseenByStaff(channel);
+  if (unseen.length > 0) {
+    const one = unseen.length === 1;
+    problems.push(
+      `the role${one ? '' : 's'} ${unseen.join(', ')} cannot see #${name}: the links of ` +
+        `/places and of the reports there do not open for ${one ? 'its' : 'their'} members; ` +
+        'let every staff role see it',
+    );
+  }
+  if (problems.length > 0) {
+    const [first, ...more] = problems;
     return {
       what: 'moderation',
       status: 'warn',
-      text:
-        `moderation: in ${server} ${roles} can see #${name} and ` +
-        `${seen.length === 1 ? 'is no staff role' : 'are no staff roles'}: ${staffOnly}`,
+      text: [`moderation: in ${server} ${first ?? ''}`, ...more.map((one) => `And ${one}`)].join(
+        '. ',
+      ),
     };
   }
   return {
````

### Task 6: Plan 8S-3 T6: The web map: popups keep their clicks, refused reports logged, the login button's warning

Prototype commit: `3d1fe958e074fb92bacb4ec0fcc1de973e7ef996`

Staging of the web map plans (2026-10-18, follow-ups "From the staging run
of the web map plans"):

- Move… closed a train's popup within a second, and Cancel of a gym's
  report and spawn forms closed the whole popup. The cause: Leaflet 1.9
  leaves a click in a popup alone only by walking up from the click's
  target to the popup when the click reaches the map
  (`Map._isClickDisabled`); Move… (the panel drawn in place of the
  actions) and Cancel (the popup's buttons put back) take the clicked
  button out of the page in their own handler, so there was nothing to
  walk up from, Leaflet took the click for the map's, and its preclick
  closed the popup (`closePopupOnClick`). The popup's content was held
  as it should be. Now every popup keeps its clicks
  (`keepClicksInPopup`, on the map's `popupopen`): the panel stays open
  as 8M-5's staging describes, and Cancel puts the buttons back with the
  popup open, the hold let go. Tested with a model of Leaflet's rule and
  held content in `train-ui.isolated.test.ts` (Move…, and Cancel of the
  spawn, report and change forms; the fake's events now bubble along the
  path fixed when they start and can be stopped), and the map's
  `popupopen` of `showParties` adding the stop in
  `party-layer.isolated.test.ts`.
- A refused report on the map wrote no log line: the raids', spawns' and
  meetups' routes now log one line per request once who makes it is
  known, a refusal too, with what refused it (`no-gym`, `not-here`,
  `no-region`, `several-regions`, `barred`, `unreachable`, `blocked`,
  `refused`, `throttled`, or what came of it), never a text or a point.
- `/maps` and `/region edit` say under the login button not to share it:
  "It works once, within five minutes; do not share it: it logs in
  whoever opens it as you."
- web.md, trains.md, utilities.md and the 8S-3 staging draft (steps 16
  to 20).

**Files:**

```
 docs/architecture/trains.md                            |   2 +
 docs/architecture/utilities.md                         |   2 +-
 docs/architecture/web.md                               |  10 +--
 docs/superpowers/plans/2026-10-18-phase-8s3-staging.md |  10 +++
 src/commands/regions/edit.test.ts                      |   5 ++
 src/commands/regions/edit.ts                           |   4 +-
 src/commands/util/maps.test.ts                         |   5 ++
 src/commands/util/maps.ts                              |   4 +-
 src/web/client/party-layer.isolated.test.ts            | 148 +++++++++++++++++++++++++++++++++++-
 src/web/client/party-layer.ts                          |  11 ++-
 src/web/client/raid-forms.ts                           |  20 +++++
 src/web/client/train-ui.isolated.test.ts               | 234 +++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/meetup-make.test.ts                            |  24 ++++++
 src/web/meetup-routes.ts                               |  52 ++++++++-----
 src/web/raid-report.test.ts                            |  30 ++++++++
 src/web/raid-routes.ts                                 |  30 +++++---
 src/web/spawn-report.test.ts                           |  30 ++++++++
 src/web/spawn-routes.ts                                |  60 +++++++++------
 18 files changed, 607 insertions(+), 74 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/regions/edit.test.ts src/commands/util/maps.test.ts src/web/client/party-layer.isolated.test.ts src/web/client/train-ui.isolated.test.ts src/web/meetup-make.test.ts src/web/raid-report.test.ts src/web/spawn-report.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3d1fe958e074fb92bacb4ec0fcc1de973e7ef996 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-3 T6: The web map: popups keep their clicks, refused reports logged, the login button's warning`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 39c58fb9..0deb6b88 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -22,6 +22,8 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
 - A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Then a row (a `controls` block: a section's one accessory is the picture): the grey "Move train…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; also on a finished route: Previous and Reverse take a Finish back) and on a route longer than `WHOLE_ROUTE_STOPS` "Whole route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then. "Move train…" answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Move the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next, Previous and Skip also the gym they lead to), `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), a train without a route and one that ended get `panelNote` (no controls). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep the panel's `whereText`. The DM brief of a train is unchanged (`placeLine`).
 
+- On the live map the panel opens in the train's popup in place of its actions ("Move…") and stays open after each move, as the post's does (`web.md`, "Trains on the map"); the popup keeps the click that drew the panel (`keepClicksInPopup`: before plan 8S-3 Leaflet took it for a click on the map, the Move… button being out of the page by then, and closed the popup at once).
+
 ## Splitting a group off
 
 - A group of a train can become a train of its own (plan 8T; spec `2026-10-17-train-split-design.md`; Matt, 2026-10-17: faster players go on at their own pace instead of per-group positions on one train). Who may is `mayNotSplit` in `train.ts`, beside `mayNotArrange`: never a train of one group (`one-group`), one without a post yet (`unposted`: the new train links to it), the new train of a split not settled yet (`split-pending`, "This train is still being split off another: try again in a moment.": from its post until the paired write its members are on the old train too, and a group split off it would outlive the split's take-back; `splitsPossible` and `splittableGroups` offer nothing of it), a group it does not have (`no-such-group`), an empty one (`empty-group`) or one that everybody on the train is in (`whole-train`, Matt, 2026-10-17: the old train would be left empty; the words name the group, `Everybody on this train is in group B (Fast): there is nothing to split it from.`, `splitRefusal`); staff and the conductor any other group; a member of the group (any status) their own (`not-in-group`, "Only a group's members, the conductor and the moderators can split a group off.") unless the conductor is in it (`conductor-in-group`). `splittableGroups` is what the menu and the autocomplete offer; `splitsPossible` (two groups or more with somebody in them) whether the post shows the button.
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 97a834f9..bdd9e9f3 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -36,7 +36,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
 - Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`src/domain/geo/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `simulate` and `countersMessage` (a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
-- `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
+- `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`; its small print says not to share it: it logs in whoever opens it as the member), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
 
 ## /help
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 25b4d4d1..7d0ea9b2 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -28,7 +28,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 ## Logging in
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
-- With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
+- With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button logs you in as well. It works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
 - Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute; over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Move train panel in the window of the post's controls (as the post's panel counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
 
 ## The public map
@@ -50,16 +50,16 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - **One code path per command** (spec 3.5): what `/raid` does beyond its gym question is `reportRaidAs` and `reportWords` (`src/commands/raids/report.ts`: the report as the member, anonymous by their `raidPrivacy`, signed up by their `autoStatus` under their name and team; the command's words for each `ReportOutcome`, a post and a region channel named by the caller's `ReportNames`: mentions on Discord, on the map no post and a channel as `#name`); what `/hatch`, `/end`, `/boss` and `/moveset` do is `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` (`src/commands/raids/raid-changes.ts`: the command's reader, `RaidChangeService` as the member, the answer `raidChangeAnswer`, `ok` / `refused` / `gone`; a reader's refusal is thrown as a `UserError`). The commands reply with these or throw them; the map answers them. The readers (`reportedBoss`, `reportedTime`, `typedPartyTime`) take only what they read (`RaidReading`), so the web server is given exactly what the commands read and call (`RaidWebDeps.ctx`, `RaidWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
 - **The pick lists** `GET /s/<guild>/api/raid-options` (members, as `/api/parties`; 30 a minute per address): `raidOptions` (`src/web/raid-options.ts`, pure; types in `src/domain/web/raid-options-data.ts`, which imports no server code): the current bosses in the boss list's order, each with the value its choice of `/raid` has (`bossChoiceValue`: `b:yveltal:T5:0`; `/raid`'s own list uses it too, and `reportedBoss` reads it back), then an egg of every tier (`eggChoiceValue`, `e:T5:0`), tiers in the posts' words (`raidWords`), the posts' zone; nothing of gyms (no elite raid gym mark). An ETag of its JSON, `private, no-cache`, 304. A raid's moves `GET /s/<guild>/api/raids/<id>/moves` (members; the same limiter as the pick lists; an active raid of the server, 409 otherwise; its forum by `memberAccess` as a change asks it, `barred` 403, Discord unreachable 503; 422 without a boss whose moves are known): `bossMoves`, the moves of the boss the post shows, by id and name, as `/moveset` lists them.
-- **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum (`reportBarred`, `src/commands/raids/report.ts`, the check `/raid` makes too, plan 8M-6): `barred` from any of them 403 `{ error: REPORT_BARRED }`, "You cannot report a raid at this gym: you are kept out of the forum its raid would be in.", Discord unreachable 503 (a known limit, as for `/raid`: the check runs before `reportRaidAs`, outside `PartyStore.update`, so a raid another member reports at a gym of two regions moments earlier may appear in a forum that bars this member between the check and the report, which then joins it); only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is: `{ user, guild, gym, outcome }`, "a raid was reported on the map", never the text.
+- **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum (`reportBarred`, `src/commands/raids/report.ts`, the check `/raid` makes too, plan 8M-6): `barred` from any of them 403 `{ error: REPORT_BARRED }`, "You cannot report a raid at this gym: you are kept out of the forum its raid would be in.", Discord unreachable 503 (a known limit, as for `/raid`: the check runs before `reportRaidAs`, outside `PartyStore.update`, so a raid another member reports at a gym of two regions moments earlier may appear in a forum that bars this member between the check and the report, which then joins it); only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is, one line per report once who reports is known, a refusal too (plan 8S-3): `{ user, guild, gym, outcome }`, "a raid was reported on the map", the outcome the report's kind (`created`, `exists`, `no-post` …) or what refused it (`no-gym`, `several-regions`, `barred`, `unreachable`, `throttled`, `refused` for `/raid`'s readers), never the text.
 - **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403); whether the member may change it (`mayChangeRaid`: signed up for it, as `mayArrange` has it, or staff by the commands' `isManagement`, an admin or a moderator by role or the bot's owner, `isMapStaff` of the member fetched fresh; 403 "Only members signed up for this raid, and moderators, can change it here." otherwise); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. The commands themselves let anybody in the post change a raid; the map, which crosses forums (spec 2.5), asks a sign-up or staff (spec 3.6). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
-- **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, and after the raids in the popup of a gym that shows raids, `gymRaidsPopup`'s `extras`, since an elite raid can be beside a standard one), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go; once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise.
+- **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, and after the raids in the popup of a gym that shows raids, `gymRaidsPopup`'s `extras`, since an elite raid can be beside a standard one), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go; once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise. A click in a popup stays in it (`keepClicksInPopup`, `raid-forms.ts`, on the map's `popupopen`, a listener on the popup's element that stops the click): Leaflet 1.9 leaves a click in a popup alone only by walking up from the click's target to the popup when the click reaches the map (`Map._isClickDisabled`), and a control that takes its own button out of the page as it is clicked (Move… drawing the Move train panel in its place; Cancel of the report, change and spawn forms putting the popup's buttons back) left nothing to walk up from, so Leaflet took the click for the map's and closed the popup (staging of the web map plans, 2026-10-18; tested with a model of Leaflet's rule in `train-ui.isolated.test.ts`). Cancel therefore puts the popup's buttons back and lets the hold go, the popup open; a popup closed with a form in it lets its form go (`popupClosed`).
 - **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains are 8M-5 (below), meetups 8M-5M; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
 
 ## Spawns on the map (plan 8M-4S)
 
 - **One code path with `/wild`** (spec 3.5, 3.8): what `/wild` does beyond `SpawnService.report` is `readSpawn` (`src/commands/notifications/wild.ts`: the Pokémon by `wildPokemon`, `appearsInWild` with the settings' exceptions; then the details, which must say something, `SAY_WHERE`, trimmed and cut to `MAX_DETAILS`; a refusal thrown as a `UserError`) and `reportSpawnAs` (`src/commands/notifications/spawn-report.ts`: the report through `SpawnService`, the command's words, a report's link and a region's channel named by the caller's `SpawnNames`: the link and a mention on Discord, `DISCORD_SPAWN_NAMES`; on the map no link and a channel as `#name`; `no-channel`, `refused` and `closed` thrown in `/wild`'s words as a `SpawnNotMade`, a `UserError` with that `kind`). The command's guard and handler and the map call them; the web server is given what `/wild` reads and calls (`SpawnWebDeps.ctx`, `SpawnWebContext`: the bot's context in `src/app.ts`), the channel names the bot sees (`channelName`) and the gateway's `ownViewDenied` (`channels`).
 - **The pick list** `GET /s/<guild>/api/wild-options` (members, as `/api/raid-options`: 401, 403, 503; 30 a minute per address): `wildOptions` (`src/web/wild-options.ts`, pure; types in `src/domain/web/spawn-data.ts`, without imports): every catalogue entry `/wild` takes (`appearsInWild` with `wildExceptionsOf(ctx).species`), a form as that form, in the catalogue's order, as `[key, name]` (about 1,180, 33 KB); kept per catalogue and settings (a `WeakMap` by the `WildExceptions` read), an ETag of its JSON, `private, no-cache`, 304.
-- **A report** `POST /s/<guild>/api/spawns`, body `{ pokemon, details, iv?, lat, lon, region? }` (strict: `pokemon` as `/wild` takes it, a key of the list or typed, 1 to 100 characters; `details` up to 200, blanks allowed so that they are refused in `/wild`'s words; `iv` `perfect` or `zero`; the point, latitude and longitude in range, kept to six decimals; the region's id when the point lies in several). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); where: the regions of this server whose outlines hold the point (`regionsAtPoint`, `src/services/region-directory.ts`: one per channel, in the regions' order), none 422 in `/wild`'s words for a pin outside them (`PIN_NOT_HERE`), several without one of them picked 422 `{ ok: false, text: "This point lies in several regions: pick the one to report the spawn in.", regions: [{ id, name }] }` (any region of the server, spec 2.5; names as the raids' list names them); the region by an id the body names counts only where the point lies in several (a point in one region is reported there whatever it names); the forum of the region picked (`memberAccess`: `barred` 403, as for a raid there; a region without a forum is not asked) and its text channel, where the report goes (`PartyGateway.ownViewDenied`: an overwrite of the member's own that denies View Channel 403, with a forum or without one; not asked of an administrator, whom Discord shows every channel, the server's owner included (`MemberStanding.administrator`); Discord unreachable 503 for either); the limit: a role's overwrite that denies View Channel on the text channel is not looked at, as the raids' checks look at none on the region's channel; `/wild`'s readers (`readSpawn`: 422 in its words as `pageWords` text, "Mewtwo does not appear in the wild.", "Say in details where …") and the pin (`PlaceFinder.pin(row, point, null)`: named by the nearest gym, PokéStop or power spot within 50 m, else a dropped pin), as `/wild`'s guard reads them; only then `/wild`'s throttle in its window (`throttledOnTheMap`, `WILD_COMMAND`, `WILD_THROTTLE`: five in half an hour from Discord and the map together, 429 "You can use /wild again in 30 minutes."), so that a report refused for who reports, where or what is not counted; then `reportSpawnAs` as the member (named by the name Discord has now, `ActingMembers`, as `/wild` names the member who uses it: spawns have no privacy setting), the point as the report's `near` (a `DroppedPin`: the region's message, the Unown copy and the DMs show it as `/wild near:` with a pin shows it), and who wants the Pokémon is told (`NotifyService.spawnReported`, through `DmSender`). The answer (`SpawnAnswer`): 200 `{ ok: true, text: "Reported: a wild Dratini near The Stacks.\nThe report is removed in 30 minutes." }` (`/wild`'s words without the report's link; a pin named by nothing is "at your pin"), 422 `{ ok: false, text }` for a report that was not made (the channel gone, the bot not allowed to post there: "I am not allowed to post in #west, …", a channel the bot sees no name of as `Region 1`), 503 with `Retry-After: 60` and `{ error: "I am restarting just now, so the report was not made. Report it again in a minute." }` for one that came while the bot shuts down (`kind` `closed`: no refusal, the page may try again). Nobody is named in an answer. Logged at info as a command is: `{ user, guild, region, outcome }` (`posted`, `not-made` or `closed`), "a spawn was reported on the map", never a text or the point.
+- **A report** `POST /s/<guild>/api/spawns`, body `{ pokemon, details, iv?, lat, lon, region? }` (strict: `pokemon` as `/wild` takes it, a key of the list or typed, 1 to 100 characters; `details` up to 200, blanks allowed so that they are refused in `/wild`'s words; `iv` `perfect` or `zero`; the point, latitude and longitude in range, kept to six decimals; the region's id when the point lies in several). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); where: the regions of this server whose outlines hold the point (`regionsAtPoint`, `src/services/region-directory.ts`: one per channel, in the regions' order), none 422 in `/wild`'s words for a pin outside them (`PIN_NOT_HERE`), several without one of them picked 422 `{ ok: false, text: "This point lies in several regions: pick the one to report the spawn in.", regions: [{ id, name }] }` (any region of the server, spec 2.5; names as the raids' list names them); the region by an id the body names counts only where the point lies in several (a point in one region is reported there whatever it names); the forum of the region picked (`memberAccess`: `barred` 403, as for a raid there; a region without a forum is not asked) and its text channel, where the report goes (`PartyGateway.ownViewDenied`: an overwrite of the member's own that denies View Channel 403, with a forum or without one; not asked of an administrator, whom Discord shows every channel, the server's owner included (`MemberStanding.administrator`); Discord unreachable 503 for either); the limit: a role's overwrite that denies View Channel on the text channel is not looked at, as the raids' checks look at none on the region's channel; `/wild`'s readers (`readSpawn`: 422 in its words as `pageWords` text, "Mewtwo does not appear in the wild.", "Say in details where …") and the pin (`PlaceFinder.pin(row, point, null)`: named by the nearest gym, PokéStop or power spot within 50 m, else a dropped pin), as `/wild`'s guard reads them; only then `/wild`'s throttle in its window (`throttledOnTheMap`, `WILD_COMMAND`, `WILD_THROTTLE`: five in half an hour from Discord and the map together, 429 "You can use /wild again in 30 minutes."), so that a report refused for who reports, where or what is not counted; then `reportSpawnAs` as the member (named by the name Discord has now, `ActingMembers`, as `/wild` names the member who uses it: spawns have no privacy setting), the point as the report's `near` (a `DroppedPin`: the region's message, the Unown copy and the DMs show it as `/wild near:` with a pin shows it), and who wants the Pokémon is told (`NotifyService.spawnReported`, through `DmSender`). The answer (`SpawnAnswer`): 200 `{ ok: true, text: "Reported: a wild Dratini near The Stacks.\nThe report is removed in 30 minutes." }` (`/wild`'s words without the report's link; a pin named by nothing is "at your pin"), 422 `{ ok: false, text }` for a report that was not made (the channel gone, the bot not allowed to post there: "I am not allowed to post in #west, …", a channel the bot sees no name of as `Region 1`), 503 with `Retry-After: 60` and `{ error: "I am restarting just now, so the report was not made. Report it again in a minute." }` for one that came while the bot shuts down (`kind` `closed`: no refusal, the page may try again). Nobody is named in an answer. Logged at info as a command is, one line per report once who reports is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once one is picked; `posted`, `not-made` or `closed`, or what refused it: `not-here`, `several-regions`, `barred`, `unreachable`, `refused` for `/wild`'s readers, `throttled`), "a spawn was reported on the map", never a text or the point.
 - **The page** (`src/web/client/spawn-forms.ts`, pure: "Report spawn here" (`spawnBox`), the regions a point lies in by the outlines of `/api/geo` (`regionsAt`, `ringContains`), the form as a tree of nodes, its body, reading an answer, `sendSpawnForm` over `pressParty`; the DOM side `spawn-ui.ts`): for a member while the map is not read-only (`reportOffered`, as "Report raid"), a long press or a right click on the map (Leaflet's `contextmenu`, which it also fires for a long press on a phone; also on a raid's picture or dot, at the pointer: Leaflet makes a layer the target of a mouse event only when the layer listens for it (`Map._findEventTargets`), else the map, so no layer of the map may listen for `contextmenu`; one that did would take it, at its own position for a marker; a gym's raids marker is `raidsMarker` of `party-layer.ts`, and `party-layer-contextmenu.isolated.test.ts` runs the real Leaflet's routing over it, plan 8W-3) opens the form in a popup of its own at that point (`spawnAt`; with another form open it says "Close the form that is open first." and opens nothing; at a point in no region of the map's outlines it says "That point is not in a region of this server." at once and opens nothing, `pressedWhere`: the server still decides by its own outlines, at their edges too), and "Report spawn here" in a gym's popup (its own, and that of a gym that shows raids, after "Report raid") opens it in place of its button, the gym's place being the point (the map shows no Wayspots, so no Wayspot popup has it). The form (`spawnForm`): the Pokémon, typed and picked by name from a `datalist` of the pick list (the browser filters it), sent as its key when the name is one of the list's (whatever its letter case), else as typed for the server to read; "Where it is" (required: "Say where it is first: …", the page's own); the IVs, "Not checked" by default; the region where the point lies in several of the map's outlines; whenever the server's answer names regions, the form is drawn again with those, keeping what was filled in (`redrawnAfter`: a region picked stays picked only while it is among them). It is held like the raid forms (`FormHold`: the hold taken before the list is asked for, the controls that open a form, `data-spawn` among them, off meanwhile, a popup's content held, `ready` before it is drawn); a success is said in the notice and closes the form; a refusal is said under the form and in the notice. Spawns are not drawn on the map.
 
 ## Trains on the map (plan 8M-5)
@@ -76,7 +76,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - **One code path per command** (spec 3.5, 3.7): what `/meetup`'s form does with `MeetupSafety.make`'s outcome is `makeMeetupAs` (`src/commands/meetups/meetup.ts`: the check of the place, the meetup or the moderators' request, each outcome in `/meetup`'s words, the post and a region's channel named by the caller's `ReportNames`); what `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, `TimedAnswer`: `ok`, `refused` with the reason, `gone`) and `describeAs` (`src/commands/meetups/info.ts`). The commands reply with them (`replyTimed`) or throw them; the map answers them. The web server is given what those commands read and call (`MeetupWebDeps.ctx`, `MeetupWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
 - **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). Nobody is named.
-- **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a power spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a power spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info: `{ user, guild, region, outcome }`, "a meetup was made on the map", never a text or the place.
+- **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a power spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a power spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info, one line per request once who makes it is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once it is one of the server's; `makeMeetupAs`'s kind, or what refused it: `no-region`, `no-forum`, `barred`, `unreachable`, `blocked`, `refused` for `/meetup`'s guards and form, `throttled`), "a meetup was made on the map", never a text or the place.
 - **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 021 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
 - **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power spots and other Wayspots are never offered; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
 - **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end, the map, which crosses forums, asks more, as for raids); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
diff --git a/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md b/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
index 0c37aa4a..cf9106a5 100644
--- a/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
+++ b/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
@@ -28,3 +28,13 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 13. Only on Matt's go-ahead (it reads Discord's REST API): `npm run cutover-check` with the forum's Manage Threads denied: the region line names "Manage Posts (Manage Threads) in the forum #…", and the `reports` line likewise. Put it back.
 14. With the Moderator role denied View Channel on `#meetup-review`: the `moderation` line warns "the role Moderator cannot see #meetup-review: the links of /places and of the reports there do not open for its members; let every staff role see it". If a role of members can see the channel as well, both are said in the one warning. Put it back: the line passes.
 15. Tester with the role "Moderator" and View Channel on `#meetup-review`: the links of `/places` and of the reports open.
+
+## The web map's findings (task 6)
+
+Needs the web pages on (`settings.web`, the stage tunnel) and the page reloaded after the build (`npm run build` builds the map's page too). Tester signed up for a train with a route of three stops or more.
+
+16. Tester opens a train's popup (its dot, then its route line) and presses "Move…": the Move train panel takes the place of the actions and the popup stays open (before: it closed within a second). Next: the train moves, the panel is drawn anew under "The train is at stop …" and stays; Done: the popup is drawn again with the train's actions. 8M-5's steps 13 to 15 run as written. Googer, staff, the same.
+17. In a gym's popup (one without raids, and one whose marker shows raids), "Report spawn here", then Cancel: the popup stays open with its buttons back ("Report raid", "Report spawn here", "Meetup here"), and "Report raid", then Cancel, the same; a raid's "Change…", then Cancel, the same. 8M-4S's step 7 passes. Closing the popup (×, or a click on the map) with a form open still closes it, and the other forms open again (the hold let go).
+18. A click on the map outside a popup still closes it; a click inside a popup on its text (not a button) leaves it open, as before.
+19. The bot's log has one info line per map report, refusals too: a raid at a gym of no region of the server (a request sent by hand) "a raid was reported on the map" with `outcome: "no-gym"`; with Tester kept out of West's forum `barred`; the twenty-first report of a quarter of an hour `throttled`; an unknown boss sent by hand `refused`; the same for a spawn ("a spawn was reported on the map": a point outside the regions `not-here`, `barred`, `throttled`) and a meetup ("a meetup was made on the map": `no-region`, `barred`, a start that is no time `refused`, `blocked`, `throttled`). No line holds a typed text, a name or a point.
+20. `/maps` and, as Googer, `/region edit`: the small print under the button reads "The button logs you in as well. It works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (`/region edit again` for the editor), in one line on a phone.
diff --git a/src/commands/regions/edit.test.ts b/src/commands/regions/edit.test.ts
index 4263c314..ce63baa0 100644
--- a/src/commands/regions/edit.test.ts
+++ b/src/commands/regions/edit.test.ts
@@ -57,6 +57,11 @@ describe('/region edit', () => {
     expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
     const message = asV2(payload);
     expect(textOf(message)).toContain(`https://map.example.test/s/${FAKE_GUILD_ID}/regions/edit`);
+    // The button is the member's own: shared, it would log somebody else in as them.
+    expect(textOf(message)).toContain(
+      '-# The button logs you in as well. It works once, within five minutes; do not share ' +
+        'it: it logs in whoever opens it as you. Use /region edit again for another.',
+    );
     const [button] = buttonsOf(message);
     expect(button?.label).toBe('Open the region editor (logs you in)');
     const url = new URL(button?.url ?? '');
diff --git a/src/commands/regions/edit.ts b/src/commands/regions/edit.ts
index 6ea5cb30..b87d0ea5 100644
--- a/src/commands/regions/edit.ts
+++ b/src/commands/regions/edit.ts
@@ -50,8 +50,8 @@ export const editRegions: SubcommandPart = {
           REGION_COLOUR,
           [
             `### The region editor of this server\n${editor}`,
-            '-# The button logs you in as well. It works once, within five minutes; use ' +
-              '/region edit again for another.',
+            '-# The button logs you in as well. It works once, within five minutes; do not ' +
+              'share it: it logs in whoever opens it as you. Use /region edit again for another.',
           ],
           [
             actionRow([
diff --git a/src/commands/util/maps.test.ts b/src/commands/util/maps.test.ts
index fb4eee2c..905d474c 100644
--- a/src/commands/util/maps.test.ts
+++ b/src/commands/util/maps.test.ts
@@ -64,6 +64,11 @@ describe('/maps', () => {
     expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
     const message = asV2(payload);
     expect(textOf(message)).toContain(`https://map.example.test/s/${FAKE_GUILD_ID}/map`);
+    // The button is the member's own: shared, it would log somebody else in as them.
+    expect(textOf(message)).toContain(
+      '-# The button logs you in as well. It works once, within five minutes; do not share ' +
+        'it: it logs in whoever opens it as you. Use /maps again for another.',
+    );
     const [button] = buttonsOf(message);
     expect(button?.label).toBe('Open the map (logs you in)');
     const url = new URL(button?.url ?? '');
diff --git a/src/commands/util/maps.ts b/src/commands/util/maps.ts
index 16176921..208bf4a5 100644
--- a/src/commands/util/maps.ts
+++ b/src/commands/util/maps.ts
@@ -52,8 +52,8 @@ export const maps: SimpleCommand = {
             LIST_COLOUR,
             [
               `### The map of this server\nIts regions and gyms: ${map}`,
-              '-# The button logs you in as well. It works once, within five minutes; ' +
-                'use /maps again for another.',
+              '-# The button logs you in as well. It works once, within five minutes; do not ' +
+                'share it: it logs in whoever opens it as you. Use /maps again for another.',
             ],
             [
               actionRow([
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index 348019e0..4a5697c7 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -1,8 +1,9 @@
-import { describe, expect, it, vi } from 'vitest';
-import { gymClicks } from './party-layer.js';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { gymClicks, showParties } from './party-layer.js';
 
 // Leaflet reads the browser's `window` as it loads: what `gymClicks` uses of it is how an event
-// is stopped, recorded here. Isolated: a mocked module needs a module graph of its own.
+// is stopped, recorded here; what `showParties` uses of it as it starts is a layer group added to
+// the map. Isolated: a mocked module needs a module graph of its own.
 const stopped = vi.hoisted(() => [] as unknown[]);
 vi.mock('leaflet', () => ({
   DomEvent: {
@@ -10,6 +11,10 @@ vi.mock('leaflet', () => ({
       stopped.push(event);
     },
   },
+  layerGroup: () => {
+    const group = { addTo: () => group, clearLayers: () => group };
+    return group;
+  },
 }));
 
 /** A gym's layer: its handlers by event, and how often its popup was opened. */
@@ -66,3 +71,140 @@ describe("a gym's clicks (gymClicks)", () => {
     expect(stopped).toEqual([click]);
   });
 });
+
+type Listener = (event: { target: PageElement; stopPropagation(): void }) => void;
+
+/**
+ * Just enough of an element for `showParties` to start (what `renderNode` sets, a tree) and for a
+ * click to bubble up the tree as it was when the click began, until a listener stops it.
+ */
+class PageElement {
+  className = '';
+  textContent: string | null = '';
+  hidden = false;
+  disabled = false;
+  readonly dataset: Record<string, string> = {};
+  childNodes: PageElement[] = [];
+  parent: PageElement | undefined;
+  private readonly listeners = new Map<string, Listener[]>();
+
+  constructor(readonly tag: string) {}
+
+  setAttribute(): void {}
+
+  append(...children: PageElement[]): void {
+    for (const child of children) {
+      child.remove();
+      child.parent = this;
+      this.childNodes.push(child);
+    }
+  }
+
+  remove(): void {
+    if (!this.parent) return;
+    this.parent.childNodes = this.parent.childNodes.filter((child) => child !== this);
+    this.parent = undefined;
+  }
+
+  /** No buttons that open a form: `formControls` has nothing to turn on or off. */
+  querySelectorAll(): PageElement[] {
+    return [];
+  }
+
+  addEventListener(type: string, listener: Listener): void {
+    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+  }
+
+  /** A click here, along the way up fixed as it begins (as a browser fixes it). */
+  dispatch(type: string): void {
+    const path: PageElement[] = [this];
+    for (let at = this.parent; at; at = at.parent) path.push(at);
+    let stop = false;
+    const event = {
+      target: this,
+      stopPropagation: () => {
+        stop = true;
+      },
+    };
+    for (const at of path) {
+      for (const listener of at.listeners.get(type) ?? []) listener(event);
+      if (stop) return;
+    }
+  }
+}
+
+describe("the map's popups (showParties)", () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  /**
+   * `showParties` started on a map that records its handlers; the page a document of
+   * `PageElement`s, hidden, whose list is never answered (the poller waits for good).
+   */
+  const started = () => {
+    vi.stubGlobal('document', {
+      createElement: (tag: string) => new PageElement(tag),
+      getElementById: (id: string) => new PageElement(id),
+      addEventListener: () => undefined,
+      querySelectorAll: () => [],
+      visibilityState: 'hidden',
+    });
+    vi.stubGlobal('window', {
+      setTimeout: () => 0,
+      clearTimeout: () => undefined,
+      setInterval: () => 0,
+    });
+    vi.stubGlobal('fetch', () => new Promise(() => undefined));
+    const handlers = new Map<string, ((event: unknown) => void)[]>();
+    const map = {
+      on(type: string, handler: (event: unknown) => void) {
+        handlers.set(type, [...(handlers.get(type) ?? []), handler]);
+        return map;
+      },
+      createPane: () => ({ style: {} }),
+    };
+    showParties(
+      map as unknown as Parameters<typeof showParties>[0],
+      '100000000000000001',
+      { loggedIn: true, csrf: 'token' } as unknown as Parameters<typeof showParties>[2],
+      new Map(),
+      new Map(),
+      [],
+      false,
+    );
+    /** Leaflet fires an event on the map. */
+    const fire = (type: string, event: unknown) => {
+      for (const handler of handlers.get(type) ?? []) handler(event);
+    };
+    return { fire };
+  };
+
+  it("keeps a click from the map's container once the popup opened, though its button was taken out of the page", () => {
+    const { fire } = started();
+    // The map's container, the popup's element in it, and a button the click takes out of the
+    // page in its own handler (Cancel putting a gym's buttons back, Move… drawing its panel).
+    const container = new PageElement('div');
+    const element = new PageElement('div');
+    container.append(element);
+    let reached = 0;
+    container.addEventListener('click', () => {
+      reached += 1;
+    });
+    const button = () => {
+      const made = new PageElement('button');
+      made.addEventListener('click', () => {
+        made.remove();
+      });
+      element.append(made);
+      return made;
+    };
+    // Before the popup opened on the map, such a click reaches the container (Leaflet's own
+    // walk up from the detached button would find no popup, and close it).
+    button().dispatch('click');
+    expect(reached).toBe(1);
+    fire('popupopen', { popup: { getElement: () => element } });
+    button().dispatch('click');
+    expect(reached).toBe(1);
+  });
+});
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index bc5f78aa..90710400 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -20,7 +20,7 @@ import {
   type ShowContext,
 } from './parties.js';
 import { renderNode, type MapGym, type PageNode } from './popup.js';
-import { FormHold, OpenPopup, reportBox, reportOffered } from './raid-forms.js';
+import { FormHold, keepClicksInPopup, OpenPopup, reportBox, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
 import { spawnBox, spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
@@ -391,11 +391,16 @@ export function showParties(
   };
 
   // Leaflet tells the map first, then the layer (`OpenPopup`).
-  // A popup opened while a form is open elsewhere (the side panel's) shows its controls off.
+  // A popup opened while a form is open elsewhere (the side panel's) shows its controls off. Its
+  // clicks stay in it (`keepClicksInPopup`): a button a click takes out of the page would
+  // otherwise close the popup.
   map.on('popupopen', (event) => {
     showing.opened(event.popup);
     const element = event.popup.getElement();
-    if (element) formControls(element, !hold.editing);
+    if (element) {
+      keepClicksInPopup(element);
+      formControls(element, !hold.editing);
+    }
   });
   // A popup closed with a form in it: the form is gone with it, and what came meanwhile is drawn
   // once Leaflet is through (a redraw inside its close would open the popup again).
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
index fd9e5724..0f075772 100644
--- a/src/web/client/raid-forms.ts
+++ b/src/web/client/raid-forms.ts
@@ -325,6 +325,26 @@ export function heldContent<T>(draw: () => T, editing: () => boolean): () => T {
   };
 }
 
+/** Stops a click where it is: on a popup, before the map sees it (`keepClicksInPopup`). */
+const stopClick = (event: { stopPropagation(): void }): void => {
+  event.stopPropagation();
+};
+
+/**
+ * Keeps the clicks in a popup from the map. Leaflet (1.9) leaves a click in a popup alone by
+ * walking up from the click's target to the popup when the click reaches the map
+ * (`Map._isClickDisabled`); a control that takes its own button out of the page as it is clicked
+ * (Move… drawing the Move train panel in its place, Cancel putting a gym's buttons back) leaves
+ * nothing to walk up from, so Leaflet took it for a click on the map and closed the popup
+ * (staging of the web map plans, 2026-10-18). Stopped at the popup's element, a click never
+ * reaches the map. Safe to call on every opening: the listener is added once.
+ */
+export function keepClicksInPopup(element: {
+  addEventListener(type: 'click', listener: (event: { stopPropagation(): void }) => void): void;
+}): void {
+  element.addEventListener('click', stopClick);
+}
+
 /**
  * Which popup is open and the key that names it across redraws (`gym:<id>`, `train:<id>`,
  * `route:<id>`), as Leaflet tells it: on opening the map's `popupopen` (`opened`) and then the
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index c3e516a4..18f32bad 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -1,14 +1,17 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
 import type { MapTrain } from '../../domain/web/party-data.js';
+import type { RaidOptionsView } from '../../domain/web/raid-options-data.js';
 import type { MapGym } from './popup.js';
-import { FormHold } from './raid-forms.js';
+import { FormHold, keepClicksInPopup } from './raid-forms.js';
+import { raidUi } from './raid-ui.js';
+import { spawnUi } from './spawn-ui.js';
 import { trainUi } from './train-ui.js';
 
 // Leaflet reads the browser's `window` as it loads; the page's helpers it comes in with are not
 // used here. Isolated: a mocked module needs a module graph of its own (testing.md).
 vi.mock('leaflet', () => ({}));
 
-type Listener = (event: { target: FakeElement }) => void;
+type Listener = (event: { target: FakeElement; stopPropagation(): void }) => void;
 
 /**
  * Just enough of an element for the trains' side of the page: attributes and `dataset`, the
@@ -92,6 +95,10 @@ class FakeElement {
     this.parent = undefined;
   }
 
+  get parentElement(): FakeElement | null {
+    return this.parent ?? null;
+  }
+
   get firstElementChild(): FakeElement | null {
     return this.childNodes[0] ?? null;
   }
@@ -104,10 +111,22 @@ class FakeElement {
     this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
   }
 
-  /** An event at this element, bubbling up the tree. */
+  /**
+   * An event at this element, bubbling up the tree as it was when the event began (a browser
+   * fixes the way up first: an element taken out of the page meanwhile still has its event go up
+   * to its old ancestors), until a listener stops it.
+   */
   dispatch(type: string): void {
+    let stopped = false;
+    const event = {
+      target: this,
+      stopPropagation: () => {
+        stopped = true;
+      },
+    };
     for (const at of upward(this)) {
-      for (const listener of at.listeners.get(type) ?? []) listener({ target: this });
+      for (const listener of at.listeners.get(type) ?? []) listener(event);
+      if (stopped) return;
     }
   }
 
@@ -247,6 +266,13 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   ...more,
 });
 
+/** The raids' pick lists as `/api/raid-options` gives them. */
+const RAID_OPTIONS: RaidOptionsView = {
+  zone: 'America/New_York',
+  bosses: [{ value: 'b:yveltal:T5:0', name: 'Yveltal', tier: 'Level 5 raid' }],
+  eggs: [{ value: 'e:T5:0', tier: 'Level 5 raid' }],
+};
+
 /** What the server answers a request of the page. */
 type Answer = { status: number; body: unknown };
 
@@ -299,9 +325,11 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
   body.page = true;
   const tools = make('div');
   body.append(tools);
+  /** The popup open on the map, which a form drawn into it is fitted to (`leafletPopup`). */
+  const popups: { open?: { update(): void } } = {};
   const hold = new FormHold<unknown>({
     draw: () => undefined,
-    popup: () => undefined,
+    popup: () => popups.open,
     later: (run) => {
       run();
     },
@@ -352,6 +380,7 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
     tools,
     body,
     hold,
+    popups,
     sent,
     requests,
     said,
@@ -501,3 +530,198 @@ describe('the Move train panel (trainUi)', () => {
     expect(shown.hold.editing).toBe(false);
   });
 });
+
+describe('a form in a popup on the map, as Leaflet takes its clicks', () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  /** Whether Leaflet marked an element as one whose clicks are not the map's. */
+  const marked = (element: FakeElement): boolean =>
+    (element as unknown as Record<string, unknown>)._leaflet_disable_click === true;
+
+  /**
+   * A popup open on the map as Leaflet 1.9.4 makes it: the map's element; the popup's, which
+   * `DomEvent.disableClickPropagation` marks `_leaflet_disable_click`, around its content's; the
+   * content a function held while a form is open (`FormHold.content`), which `update()` asks
+   * again and puts in anew (`DivOverlay._updateContent`); and the map's click as
+   * `Map._handleDOMEvent` takes it: the map's own unless a marked element is found walking up from
+   * the click's target (`_isClickDisabled`), and a click of the map's closes the popup that is
+   * open (`closePopupOnClick`, by the `preclick` it fires first). The page keeps the clicks in a
+   * popup as it opens (`keepClicksInPopup`, the map's `popupopen` in `party-layer.ts`).
+   */
+  const leafletPopup = (shown: ReturnType<typeof page>, draw: () => FakeElement) => {
+    const map = make('div');
+    shown.body.append(map);
+    const element = make('div');
+    element.className = 'leaflet-popup';
+    (element as unknown as Record<string, unknown>)._leaflet_disable_click = true;
+    const content = make('div');
+    element.append(content);
+    map.append(element);
+    const held = shown.hold.content(draw);
+    const updates = new Count();
+    const popup = {
+      update: () => {
+        content.replaceChildren(held());
+        updates.add();
+      },
+    };
+    let closed = false;
+    map.addEventListener('click', (event) => {
+      for (let at: FakeElement | undefined = event.target; at && at !== map; at = at.parent) {
+        if (marked(at)) return;
+      }
+      closed = true;
+      element.remove();
+      shown.popups.open = undefined;
+      shown.hold.popupClosed();
+    });
+    popup.update();
+    shown.popups.open = popup;
+    keepClicksInPopup(element);
+    return { updates, closed: () => closed };
+  };
+
+  it("keeps a train's popup open when Move… draws the Move train panel into it, and Done closes the panel", async () => {
+    const shown = page();
+    const box = make('div');
+    box.className = 'train-actions';
+    const move = shown.action('data-move-train', 't1', box) as unknown as FakeElement;
+    const popup = leafletPopup(shown, () => {
+      const drawn = make('div');
+      drawn.append(box);
+      // As the party layer hands a train's action to the trains' side (`draw`).
+      drawn.addEventListener('click', (event) => {
+        if (event.target.dataset.moveTrain !== undefined) {
+          shown.ui.actionClicked(event.target as unknown as HTMLButtonElement, train());
+        }
+      });
+      return drawn;
+    });
+    move.dispatch('click');
+    expect(popup.closed()).toBe(false);
+    const panel = box.firstElementChild;
+    expect(panel?.dataset.form).toBe('move');
+    expect(shown.hold.editing).toBe(true);
+    panel?.querySelector('button[data-cancel]')?.dispatch('click');
+    await shown.finished.reached(1);
+    expect(popup.closed()).toBe(false);
+    expect(box.childNodes).toEqual([move]);
+    expect(shown.hold.editing).toBe(false);
+  });
+
+  it("puts a gym's button back when the spawn form in its popup is cancelled, the popup open", async () => {
+    const shown = page((url) =>
+      url.endsWith('/wild-options')
+        ? { status: 200, body: { pokemon: [['pikachu', 'Pikachu']] } }
+        : undefined,
+    );
+    const spawns = spawnUi({
+      guild: GUILD,
+      csrf: { get: () => 'token', set: () => undefined },
+      regions: [],
+      hold: shown.hold,
+      popupAt: () => {
+        throw new Error('the form opens in the gym’s popup');
+      },
+    });
+    const stacks = GYMS.get(1);
+    if (!stacks) throw new Error('no Stacks');
+    const control = spawns.spawnControl(stacks) as unknown as FakeElement;
+    const button = control.querySelector('button');
+    const popup = leafletPopup(shown, () => {
+      const drawn = make('div');
+      drawn.append(control);
+      return drawn;
+    });
+    button?.dispatch('click');
+    // Fitted to the form once the list of Pokémon came.
+    await popup.updates.reached(2);
+    control.querySelector('button[data-cancel]')?.dispatch('click');
+    expect(popup.closed()).toBe(false);
+    expect(control.childNodes).toEqual([button]);
+    expect(shown.hold.editing).toBe(false);
+  });
+
+  /** The raids' side of the page (`raidUi`) over `shown`'s page; `done` records what it opened. */
+  const raidsOf = (shown: ReturnType<typeof page>) => {
+    const done: unknown[] = [];
+    const raids = raidUi({
+      guild: GUILD,
+      csrf: { get: () => 'token', set: () => undefined },
+      regionNames: new Map([[1, 'downtown']]),
+      hold: shown.hold,
+      done: (raid) => {
+        done.push(raid);
+        return Promise.resolve();
+      },
+    });
+    return { raids, done };
+  };
+
+  /** The pick lists (`/raid-options`); a raid's moves are not known (404). */
+  const raidLists = (url: string): Answer | undefined =>
+    url.endsWith('/raid-options')
+      ? { status: 200, body: RAID_OPTIONS }
+      : url.endsWith('/moves')
+        ? { status: 404, body: {} }
+        : undefined;
+
+  it("puts a gym's Report raid button back when the report form in its popup is cancelled, the popup open", async () => {
+    const shown = page(raidLists);
+    const { raids } = raidsOf(shown);
+    const stacks = GYMS.get(1);
+    if (!stacks) throw new Error('no Stacks');
+    const control = raids.reportControl(stacks) as unknown as FakeElement;
+    const button = control.querySelector('button');
+    const popup = leafletPopup(shown, () => {
+      const drawn = make('div');
+      drawn.append(control);
+      return drawn;
+    });
+    button?.dispatch('click');
+    // Fitted to the form once the pick lists came.
+    await popup.updates.reached(2);
+    expect(control.querySelector('select[name]')).not.toBeNull();
+    expect(shown.hold.editing).toBe(true);
+    control.querySelector('button[data-cancel]')?.dispatch('click');
+    expect(popup.closed()).toBe(false);
+    expect(control.childNodes).toEqual([button]);
+    expect(shown.hold.editing).toBe(false);
+  });
+
+  it("puts a raid's section back when the change form in its popup is cancelled, the popup open", async () => {
+    const shown = page(raidLists);
+    const { raids, done } = raidsOf(shown);
+    const section = make('div');
+    section.className = 'raid';
+    const title = make('div');
+    title.textContent = 'Yveltal';
+    const change = make('button');
+    change.setAttribute('data-change-raid', 'r1');
+    section.append(title, change);
+    const popup = leafletPopup(shown, () => {
+      const drawn = make('div');
+      drawn.append(section);
+      // As the party layer hands "Change…" to the raids' side (`draw`).
+      drawn.addEventListener('click', (event) => {
+        if (event.target.dataset.changeRaid !== undefined) {
+          raids.changeClicked(event.target as unknown as HTMLButtonElement);
+        }
+      });
+      return drawn;
+    });
+    change.dispatch('click');
+    // Fitted to the form once the pick lists and the moves were asked for.
+    await popup.updates.reached(2);
+    expect(section.childNodes.includes(title)).toBe(false);
+    expect(section.querySelector('button[data-cancel]')).not.toBeNull();
+    expect(shown.hold.editing).toBe(true);
+    section.querySelector('button[data-cancel]')?.dispatch('click');
+    expect(popup.closed()).toBe(false);
+    expect(section.childNodes).toEqual([title, change]);
+    expect(shown.hold.editing).toBe(false);
+    expect(done).toEqual([undefined]);
+  });
+});
diff --git a/src/web/meetup-make.test.ts b/src/web/meetup-make.test.ts
index dd365363..2a6a9aeb 100644
--- a/src/web/meetup-make.test.ts
+++ b/src/web/meetup-make.test.ts
@@ -414,6 +414,30 @@ describe('making a meetup on the map', () => {
     expect(answer.statusCode).toBe(403);
     expect(map.meetups()).toEqual([]);
   });
+
+  it('logs a refused meetup too, one line with what refused it; never a text or the place', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < MEETUP_THROTTLE.uses; n++) {
+      throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW);
+    }
+    const map = await making({}, { throttles });
+    web = map.web;
+    await map.make(asked({ kind: 'gym', id: '1' }, { region: 99 }));
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    await map.make(asked({ kind: 'gym', id: '1' }));
+    map.made.gateway.barred.delete(WEST_FORUM);
+    await map.make(asked({ kind: 'gym', id: '1' }, { start: 'whenever suits us' }));
+    await map.make(asked({ kind: 'gym', id: '1' }));
+    const logged = map.web.entries.filter((entry) => entry.msg === 'a meetup was made on the map');
+    expect(logged.map((entry) => (entry as { outcome?: unknown }).outcome)).toEqual([
+      'no-region',
+      'barred',
+      'refused',
+      'throttled',
+    ]);
+    expect(logged[1]).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, region: 1 });
+    expect(JSON.stringify(map.web.entries)).not.toContain('whenever suits us');
+  });
 });
 
 describe('the PokéStops of a box of the map', () => {
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index 6f7b11e9..bf723dd1 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -264,42 +264,63 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
     const doing = 'made a meetup';
     const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
     if ('sent' in acting) return acting.sent;
+    /**
+     * What came of the request, logged as a command is, a refusal too (plan 8S-3), with the
+     * region once it is one of the server's; never a text or the place.
+     */
+    const note = (outcome: string, region?: number): void => {
+      deps.log.info(
+        { user: userId, guild, ...(region === undefined ? {} : { region }), outcome },
+        'a meetup was made on the map',
+      );
+    };
+    const noted = <T>(outcome: string, sent: T, region?: number): T => {
+      note(outcome, region);
+      return sent;
+    };
     const row = await parties.guilds.idFor(guild);
     const region = ctx.regions.byId(body.data.region);
     if (row === undefined || region === undefined || region.guildId !== row) {
-      return sendFailure(request, reply, 404);
+      return noted('no-region', sendFailure(request, reply, 404));
     }
+    /** A refusal in `/meetup`'s words, logged as `refused` (or `outcome`). */
+    const refused = (status: number, text: string, outcome = 'refused') =>
+      noted(outcome, refuse(reply, status, text), region.id);
     if (region.forumChannelId === null) {
-      return refuse(reply, 422, noForumWords(regionInWords(region)));
+      return refused(422, noForumWords(regionInWords(region)), 'no-forum');
     }
     try {
       if ((await accessTo(region.forumChannelId, userId)) === 'barred') {
-        return sendFailure(request, reply, 403);
+        return noted('barred', sendFailure(request, reply, 403), region.id);
       }
     } catch (err) {
-      return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
+      return noted(
+        'unreachable',
+        unreachableOnTheMap(deps, reply, err, guild, userId, doing),
+        region.id,
+      );
     }
     if (tidyName(body.data.name) === undefined) {
-      return refuse(reply, 422, problemText('bad-name', ctx.attendance.limits(), 'meetup'));
+      return refused(422, problemText('bad-name', ctx.attendance.limits(), 'meetup'));
     }
     const staff = isMapStaff(acting.standing, userId, parties.ownerId);
     // Before the place and the start, as `/meetup` asks it: a blocked member hears of the block.
     if (await ctx.meetupSafety.blocked(guild, userId, staff)) {
-      return refuse(reply, 403, MAP_BLOCKED);
+      return refused(403, MAP_BLOCKED, 'blocked');
     }
     const where = placeOf(row, body.data.place);
-    if ('refusal' in where) return refuse(reply, 422, where.refusal);
+    if ('refusal' in where) return refused(422, where.refusal);
     const now = deps.now();
     let startTime: number;
     try {
       const typed = typedTimedTime(ctx, newPartyTimes('meetup', now), 'meet', body.data.start, now);
       if (typed === 'unset') {
-        return refuse(reply, 422, `Give the time the meetup starts. ${TIMED_TIME_HINT}`);
+        return refused(422, `Give the time the meetup starts. ${TIMED_TIME_HINT}`);
       }
       startTime = typed.at;
     } catch (err) {
       if (!(err instanceof UserError)) throw err;
-      return refuse(reply, 422, err.message);
+      return refused(422, err.message);
     }
     // The block is read above: not again.
     const verdict = await ctx.meetupSafety.verdict({
@@ -317,10 +338,10 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
         key === undefined
           ? undefined
           : await ctx.meetupSafety.askState(guild, key, userId).catch(() => undefined);
-      return refuse(reply, 422, state?.kind === 'may' ? `${refusal} ${ASK_ON_DISCORD}` : refusal);
+      return refused(422, state?.kind === 'may' ? `${refusal} ${ASK_ON_DISCORD}` : refusal);
     }
-    if (refusal !== undefined) return refuse(reply, 422, refusal);
-    if (tidyDescription(body.data.info) === null) return refuse(reply, 422, NO_INFORMATION);
+    if (refusal !== undefined) return refused(422, refusal);
+    if (tidyDescription(body.data.info) === null) return refused(422, NO_INFORMATION);
     const throttled = throttledOnTheMap(
       deps,
       reply,
@@ -328,7 +349,7 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       userId,
       MEETUP_THROTTLE,
     );
-    if (throttled) return throttled;
+    if (throttled) return noted('throttled', throttled, region.id);
     const countedAt = deps.now();
     let answer: Awaited<ReturnType<typeof makeMeetupAs>>;
     try {
@@ -352,10 +373,7 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       givenBackOnTheMap(deps, MEETUP_COMMAND, userId, MEETUP_THROTTLE, countedAt);
       throw err;
     }
-    deps.log.info(
-      { user: userId, guild, region: region.id, outcome: answer.kind },
-      'a meetup was made on the map',
-    );
+    note(answer.kind, region.id);
     switch (answer.kind) {
       case 'blocked':
         return refuse(reply, 403, MAP_BLOCKED);
diff --git a/src/web/raid-report.test.ts b/src/web/raid-report.test.ts
index 30237456..5d6ba7ee 100644
--- a/src/web/raid-report.test.ts
+++ b/src/web/raid-report.test.ts
@@ -413,4 +413,34 @@ describe('reporting a raid on the map', () => {
       expect(everything).not.toContain(text);
     }
   });
+
+  it('logs a refused report too, one line with what refused it; never a text', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < RAID_THROTTLE.uses - 1; n++) {
+      throttles.use(RAID_COMMAND, ALICE, RAID_THROTTLE, PARTY_NOW);
+    }
+    const map = await reporting({ throttles });
+    web = map.web;
+    const logged = () =>
+      map.web.entries.filter((entry) => entry.msg === 'a raid was reported on the map');
+    await map.report({ gym: 10, boss: 'e:T5:0' });
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    await map.report({ gym: 1, boss: 'e:T5:0' });
+    map.made.gateway.barred.delete(WEST_FORUM);
+    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
+    await map.report({ gym: 1, boss: 'e:T5:0' });
+    map.made.gateway.failing.delete('memberAccess');
+    // Refused by `/raid`'s reader, counted: the window is full after it.
+    await map.report({ gym: 1, boss: 'not a boss at all' });
+    await map.report({ gym: 1, boss: 'e:T5:0' });
+    expect(logged().map((entry) => (entry as { outcome?: unknown }).outcome)).toEqual([
+      'no-gym',
+      'barred',
+      'unreachable',
+      'refused',
+      'throttled',
+    ]);
+    expect(logged()[3]).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, gym: 1 });
+    expect(JSON.stringify(map.web.entries)).not.toContain('not a boss at all');
+  });
 });
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 52a26447..96735522 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -307,6 +307,14 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     const { userId } = session;
     const acting = await actingOnTheMap(deps, request, reply, guild, userId, 'reported a raid');
     if ('sent' in acting) return acting.sent;
+    /** What came of the report, logged as a command is, a refusal too (plan 8S-3); never a text. */
+    const noted = <T>(outcome: string, sent: T): T => {
+      deps.log.info(
+        { user: userId, guild, gym: body.data.gym, outcome },
+        'a raid was reported on the map',
+      );
+      return sent;
+    };
     const row = await parties.guilds.idFor(guild);
     const gym = ctx.gyms.get(body.data.gym);
     const lying =
@@ -315,7 +323,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
         : gymRegionsInGuild(ctx.gyms, ctx.regions, gym.id, row);
     const [first] = lying;
     if (gym === undefined || row === undefined || first === undefined) {
-      return sendFailure(request, reply, 404);
+      return noted('no-gym', sendFailure(request, reply, 404));
     }
     const picked =
       lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
@@ -325,7 +333,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
         text: SEVERAL_REGIONS,
         regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
       };
-      return reply.code(422).send(ask);
+      return noted('several-regions', reply.code(422).send(ask));
     }
     const regionChannelId = picked.channelId;
     const forum = ctx.partyService.regionFor(gym, regionChannelId).region?.forumChannelId ?? null;
@@ -333,10 +341,10 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     // would join and which may stand in another forum of the server: `/raid`'s own check.
     try {
       if (await reportBarred(reportAccess(), gym, regionChannelId, row, userId)) {
-        return reply.code(403).send({ error: REPORT_BARRED });
+        return noted('barred', reply.code(403).send({ error: REPORT_BARRED }));
       }
     } catch (err) {
-      return unreachable(reply, err, guild, userId, 'reported a raid');
+      return noted('unreachable', unreachable(reply, err, guild, userId, 'reported a raid'));
     }
     const throttled = throttledOnTheMap(
       deps,
@@ -345,7 +353,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       userId,
       RAID_THROTTLE,
     );
-    if (throttled) return throttled;
+    if (throttled) return noted('throttled', throttled);
     const countedAt = deps.now();
     let reported: ReportedBoss;
     let time: ReturnType<typeof reportedTime>;
@@ -355,7 +363,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     } catch (err) {
       if (!(err instanceof UserError)) throw err;
       const refused: RaidAnswer = { ok: false, text: words(err.message) };
-      return reply.code(422).send(refused);
+      return noted('refused', reply.code(422).send(refused));
     }
     // A raid reported at the gym since the check above, in a forum it did not see, is asked
     // about where the report would join it.
@@ -374,7 +382,9 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       throw err;
     }
     const failed = joining.failure();
-    if (failed) return unreachable(reply, failed.err, guild, userId, 'reported a raid');
+    if (failed) {
+      return noted('unreachable', unreachable(reply, failed.err, guild, userId, 'reported a raid'));
+    }
     const { outcome } = result;
     // None of the member's doing (the bot may not make posts in the forum, the post was lost
     // while it was made): given back too.
@@ -396,10 +406,6 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const staff = isMapStaff(acting.standing, userId, parties.ownerId);
       if (shown) raid = viewOf(guild, row, outcome.party, userId, staff);
     }
-    deps.log.info(
-      { user: userId, guild, gym: gym.id, outcome: outcome.kind },
-      'a raid was reported on the map',
-    );
     // The region picked has no forum: the raid went to another region of the gym, said by name.
     const postedIn =
       outcome.kind === 'created' &&
@@ -414,7 +420,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
         (postedIn ? ` It was posted in ${regionInWords(postedIn)}.` : ''),
       ...(raid ? { raid } : {}),
     };
-    return reply.code(REPORT_STATUS[outcome.kind]).send(answer);
+    return noted(outcome.kind, reply.code(REPORT_STATUS[outcome.kind]).send(answer));
   });
 
   // The moves the raid's boss can have, for the form of a change (as `/moveset` lists them):
diff --git a/src/web/spawn-report.test.ts b/src/web/spawn-report.test.ts
index abf45cf7..2b924edd 100644
--- a/src/web/spawn-report.test.ts
+++ b/src/web/spawn-report.test.ts
@@ -433,6 +433,36 @@ describe('reporting a wild Pokémon on the map', () => {
       expect(everything).not.toContain(text);
     }
   });
+
+  it('logs a refused report too, one line with what refused it; never a text or the point', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < WILD_THROTTLE.uses; n++) {
+      throttles.use(WILD_COMMAND, ALICE, WILD_THROTTLE, PARTY_NOW);
+    }
+    const map = await reporting({ throttles });
+    web = map.web;
+    await map.report({ pokemon: 'dratini', details: 'here', lat: 10, lon: 10 });
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    map.made.gateway.barred.delete(WEST_FORUM);
+    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
+    await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    map.made.gateway.failing.delete('memberAccess');
+    await map.report({ pokemon: 'mewtwo', details: 'here', ...IN_WEST });
+    await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    const logged = map.web.entries.filter(
+      (entry) => entry.msg === 'a spawn was reported on the map',
+    );
+    expect(logged.map((entry) => (entry as { outcome?: unknown }).outcome)).toEqual([
+      'not-here',
+      'barred',
+      'unreachable',
+      'refused',
+      'throttled',
+    ]);
+    expect(logged[1]).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, region: 1 });
+    expect(JSON.stringify(map.web.entries)).not.toContain('40.02');
+  });
 });
 
 describe('the Pokémon a member may report on the map', () => {
diff --git a/src/web/spawn-routes.ts b/src/web/spawn-routes.ts
index 39583a46..0628e86f 100644
--- a/src/web/spawn-routes.ts
+++ b/src/web/spawn-routes.ts
@@ -180,11 +180,24 @@ export function spawnRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const refused: SpawnAnswer = { ok: false, text: words(text) };
       return reply.code(422).send(refused);
     };
+    /**
+     * What came of the report, logged as a command is, a refusal too (plan 8S-3), with the
+     * region once it is known; never a text or the point.
+     */
+    const noted = <T>(outcome: string, sent: T, region?: number): T => {
+      deps.log.info(
+        { user: userId, guild, ...(region === undefined ? {} : { region }), outcome },
+        'a spawn was reported on the map',
+      );
+      return sent;
+    };
     const row = await parties.guilds.idFor(guild);
     const point = { lat: sixDecimals(body.data.lat), lon: sixDecimals(body.data.lon) };
     const lying = row === undefined ? [] : regionsAtPoint(ctx.regions.all(), row, point);
     const [first] = lying;
-    if (row === undefined || first === undefined) return refusal(PIN_NOT_HERE);
+    if (row === undefined || first === undefined) {
+      return noted('not-here', refusal(PIN_NOT_HERE));
+    }
     const picked =
       lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
     if (picked === undefined) {
@@ -193,12 +206,12 @@ export function spawnRoutes(scope: FastifyInstance, deps: WebDeps): void {
         text: SEVERAL_REGIONS_HERE,
         regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
       };
-      return reply.code(422).send(ask);
+      return noted('several-regions', reply.code(422).send(ask));
     }
     try {
       const forum = picked.forumChannelId;
       if (forum !== null && (await parties.forums.memberAccess(forum, userId)) === 'barred') {
-        return sendFailure(request, reply, 403);
+        return noted('barred', sendFailure(request, reply, 403), picked.id);
       }
       // The report goes into the region's channel: somebody kept out of it by an overwrite of
       // their own is not to post there from the map (a role's denial is not looked at). Discord
@@ -208,20 +221,24 @@ export function spawnRoutes(scope: FastifyInstance, deps: WebDeps): void {
         !acting.standing.administrator &&
         (await spawns.channels.ownViewDenied(picked.channelId, userId))
       ) {
-        return sendFailure(request, reply, 403);
+        return noted('barred', sendFailure(request, reply, 403), picked.id);
       }
     } catch (err) {
-      return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
+      return noted(
+        'unreachable',
+        unreachableOnTheMap(deps, reply, err, guild, userId, doing),
+        picked.id,
+      );
     }
     let read: ReturnType<typeof readSpawn>;
     try {
       read = readSpawn(ctx, body.data.pokemon, body.data.details);
     } catch (err) {
       if (!(err instanceof UserError)) throw err;
-      return refusal(err.message);
+      return noted('refused', refusal(err.message), picked.id);
     }
     const pin = ctx.placeFinder.pin(row, point, null);
-    if (!pin) return refusal(PIN_NOT_HERE);
+    if (!pin) return noted('not-here', refusal(PIN_NOT_HERE), picked.id);
     const throttled = throttledOnTheMap(
       deps,
       reply,
@@ -229,7 +246,7 @@ export function spawnRoutes(scope: FastifyInstance, deps: WebDeps): void {
       userId,
       WILD_THROTTLE,
     );
-    if (throttled) return throttled;
+    if (throttled) return noted('throttled', throttled, picked.id);
     let text: string;
     try {
       text = await reportSpawnAs(
@@ -246,25 +263,20 @@ export function spawnRoutes(scope: FastifyInstance, deps: WebDeps): void {
       );
     } catch (err) {
       if (!(err instanceof SpawnNotMade)) throw err;
-      const closed = err.kind === 'closed';
-      deps.log.info(
-        { user: userId, guild, region: picked.id, outcome: closed ? 'closed' : 'not-made' },
-        'a spawn was reported on the map',
-      );
       // The bot shutting down is no refusal: the page may try again once it is back.
-      if (closed) {
-        return reply
-          .code(503)
-          .header('retry-after', String(RESTART_RETRY_SECONDS))
-          .send({ error: words(err.message) });
+      if (err.kind === 'closed') {
+        return noted(
+          'closed',
+          reply
+            .code(503)
+            .header('retry-after', String(RESTART_RETRY_SECONDS))
+            .send({ error: words(err.message) }),
+          picked.id,
+        );
       }
-      return refusal(err.message);
+      return noted('not-made', refusal(err.message), picked.id);
     }
-    deps.log.info(
-      { user: userId, guild, region: picked.id, outcome: 'posted' },
-      'a spawn was reported on the map',
-    );
     const answer: SpawnAnswer = { ok: true, text: words(text) };
-    return answer;
+    return noted('posted', answer, picked.id);
   });
 }
````

