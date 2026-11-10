# Phase 8X-S: Max Battle Screenshots: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a max battle's screenshot a flow on Discord (design `docs/superpowers/specs/2026-10-22-max-battle-screenshots-design.md`), where today every flow refuses it:

- **Passive reading of a clear gym in another region** (raids first, then max battles alike): a party already there is joined unasked; otherwise the passive reply asks "<place> is in <#region>. Report it there?" with Yes / No, only where that region can take it.
- **The reading and the max report:** the Power Spot line's confidence and the form `eternamax`; a Power Spot matcher (letters and digits only, exact before a name cut short, then 80% alike); the max report and decision: boss and tier from the max list or the heads, the end from the countdown capped at 21:00 of the day taken, refused over for today, ended, or ending at or before 06:00.
- **Party state version 15:** a max battle's `bossSince` and `screenshot`; `/end` and `/hatch` that keep the time say "confirmed"; the screenshot kept while the battle lasts.
- **A battle already at the spot:** one change: the same boss joins (the end moved only later, only on a clean read), another boss of the same kind on a sure, newer screenshot changes the boss, anything else is refused.
- **`ScreenshotService`'s max path**, a record of its own beside the raid report, mentions and passive reading of max screens (the spot asked with a menu, the moderators told of a Power Spot Pine does not know), `/max screenshot:`, `/raid` refusing a max screen and `/max` a raid screen, `/read-screenshot` and feedback for max screens, `ocr:review` counting them apart.
- **"Power Spot" capitalized** everywhere members read it, except the pin "Unlisted power spot".
- **Docs and the staging checklist** `2026-10-23-phase-8xs-staging.md`.

**Architecture:** `src/domain/ocr/raid-screen.ts` (`MaxText`), `power-spot-match.ts`, `max-report.ts`, `max-decision.ts`; `src/domain/party/max.ts` (`screenshotAtBattle`), `party.ts`, `party-state.ts` (version 15); `src/services/max-change-service.ts` (`fromScreenshot`), `raid-change-service.ts`, `party-service.ts` (`joinOnly`), `party-store.ts` (`mayAdd`), `screenshot-service.ts`, `screenshot-context.ts` (`maxReportContext`), `screenshot-store.ts`, `moderation-reports.ts` (`missingSpot`); `src/commands/max/max-shot.ts` (`reportMaxShotAs`), `max-screenshot.ts`, `max.ts`; `src/commands/screenshots/mention.ts`, `feedback.ts`, `read-screenshot.ts`; `src/commands/raids/raid.ts`; `src/render/screenshot-reading.ts`; `scripts/ocr/review.ts`; `src/app.ts`.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely, Vitest. No new dependency, no migration. **Party state version 15** (versions 13 and 14 read with `bossSince` = the row's creation and no screenshot). **Commands change** (`/max` gets `screenshot:` with `boss:` and `spot:` optional where screenshots are read, texts of `/max`, `/raid`, `/read-screenshot`): deploy the commands before staging.

**Spec:** the design above (agreed with Matt and reviewed on 2026-10-22); the brief `.superpowers/sdd/8x-s-max-screenshots/design.md` (its review R1–R15 and Matt's answers) and the ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8xs`, tip `cd11c5a8`), one commit per task, on typescript-migration e0e9eaee. Each commit typechecks and its tests pass; on the tip the full check (9,280 tests), the build and the database suite (595) are clean. The reader's scores (`ocr:check` on every labelled folder, ten real max screens among them) went from right to wrong nowhere.

**Reviews:** a fresh Opus reviewer read the brief before any code (eight Important: `/max` assuming `boss:` and `spot:`, two store changes where one was meant, a max screenshot not kept while its battle lasts, the record's readers assuming a raid, feedback blind to max, the new controls without handlers, the commits not compiling as split; all folded in as R1–R15). Three Opus reviewers went through the prototype (numbered from 0 there, so one less than the tasks below: tasks 0–2: one Important, Eternatus and form-listed Gigantamax bosses refused, six Minor; tasks 3–4: five Minor; tasks 5–7: one Important, `tier:` beside a screenshot ignored, seven Minor), all folded in.

## Decisions in this plan

Matt's (2026-10-22 and 23):

1. **Passive reading of a clear place in another region**, raids and max battles alike (legacy Pine asked): a party there is joined unasked; none there, a Yes / No question in the passive reply, no dialog (a message has no interaction to open one from).
2. **A capped end already past** when the screenshot is posted (taken 20:50, posted 21:05): "Max battles are over for today …", `/max`'s words.
3. **Passive reading** never asks which Power Spot and never tells the moderators; an unclear or unknown spot gets one short public reply pinging the member.
4. **The same boss joins** and moves the end only later and only on a clean read (a sure moment and a countdown that ends at a rotation); **the same boss at another tier joins** too, the tier left to `/boss`. **The other kind** is refused, without the `/boss` hint.
5. **"Confirmed the end time" / "confirmed the hatch time"** when `/end` or `/hatch` keeps the time, raids and max battles.
6. **"Power Spot"** capitalized everywhere, except the pin "Unlisted power spot".

The prototype's and reviews' (for Matt to look at):

7. **"The end is a guess"** only when the moment the screenshot was taken is not sure (guessed, or file and clock disagree); a dated file name or a clock read surely is exact however old (review A5).
8. **A countdown ending at 06:00** is refused like one ending earlier (review A6).
9. **The Power Spot matcher:** an exact title first (the region, then the server), a name cut short only from six letters or digits, then every title 80% alike as the menu's choices.
10. **A boss change** signs the reporter up by their automatic status, gives the new end in the post's line, and makes the screenshot the post's; a moved end or a confirmed time makes it the post's too; a screenshot that could not be kept never replaces the one shown.
11. **A battle whose post is still being made** goes through `/max`'s own report (which waits for the post), never changed blind.
12. **A typed `end:`** never moves an existing battle's end but lifts the countdown's refusals; **`tier:` alone** counts for a boss on no list.
13. **The moderators' note** at most once per name and server in seven days, forgotten when Discord refuses it; the log line names the server and channel, never the name read.
14. **Words:** "could not", "does not", "That is", "I have", as the raid flow says them.

**Left for later (follow-ups):** a double press on `/max`'s or `/raid`'s menu can overwrite the answer with "That choice has expired" (an old pattern of `/raid`); corrections through a screenshot and merging duplicates (to design, Matt 2026-10-22); the Eternamax label in posts (8X's next small fixes).

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`). Tests use invented gym and Power Spot names only.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8xs`). Apply it exactly with `git apply`, never retype; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **One change per screenshot:** the look, the change and the report; a battle whose post is being made; `bossSince` and the sure moment.
2. **The end:** the cap at 21:00 of the day taken, the 06:00 edge, the re-check when reporting, the clean read that moves an end.
3. **The flows:** the raid and max paths parting in mentions, passive reading's silence, the questions and their give-backs, `/max screenshot:` with and without typed values.
4. **The record:** what is kept, the review folder, `ocr:check` and `ocr:review` on old and new records, feedback on old and new buttons.
5. **Words** members see, and the checklist against every change.

## Tasks

### Task 1: 8X-S 1: passive reading of a clear gym in another region

Prototype commit: `cc9b1acb201017d933647bbbbf2cdbda64d06eaa`

Read passively, a screenshot of a clear gym that lies in another region no
longer goes silent (Matt, 2026-10-22, as legacy Pine asked): a raid already
there is joined unasked, said in the reply that pings the author; with none
there yet, that reply asks "<gym> is in <#region>. Report it there?" with Yes
and No buttons only the author can answer. Yes reports it as a gym picked in
the mention's question does (forum bar, the use given back, the question
becoming the answer); No or no answer makes nothing.

The question's words (elsewhereQuestion) are written for any place, so that
the max path can ask the same of a Power Spot.

**Files:**

```
 docs/architecture/screenshots.md         |   2 +-
 src/commands/raids/report.ts             |   2 +
 src/commands/screenshots/feedback.ts     |   4 +-
 src/commands/screenshots/mention.test.ts | 138 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/screenshots/mention.ts      | 160 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/commands/screenshots/shot-kind.ts    |   3 +-
 src/services/party-service.test.ts       |  12 ++++++
 src/services/party-service.ts            |  20 +++++++--
 src/services/party-store.ts              |   7 +++-
 src/web/raid-routes.ts                   |   1 +
 10 files changed, 335 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/screenshots/mention.test.ts src/services/party-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cc9b1acb201017d933647bbbbf2cdbda64d06eaa -- docs/architecture/screenshots.md src/commands/raids/report.ts src/commands/screenshots/feedback.ts src/commands/screenshots/mention.test.ts src/commands/screenshots/mention.ts src/commands/screenshots/shot-kind.ts src/services/party-service.test.ts src/services/party-service.ts src/services/party-store.ts src/web/raid-routes.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 1: passive reading of a clear gym in another region`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 9e4b359d2d0ff4b12d8f9e1889638f2409db26ee..1df669730edd8a6a560eeae343d623d75aeb0a6f 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -19,5 +19,5 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 
 ## On Discord
 
-- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question; the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
 - `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
diff --git a/src/commands/raids/report.ts b/src/commands/raids/report.ts
index 8c5e20516671c3d273523aa153af49b0dbf5497c..06c9ab2863c17fea6c8b41252f3facc3f762eccb 100644
--- a/src/commands/raids/report.ts
+++ b/src/commands/raids/report.ts
@@ -240,5 +240,7 @@ export function reportWords(
       return noPostWords(outcome.refused, (id) => names.channel(id));
     case 'barred':
       return REPORT_BARRED;
+    case 'none-there':
+      return `There is no raid at ${gymName(gym)} to join.`;
   }
 }
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index 5710fb475c78487c8d0523644a33398e272d5348..0c7afe270235a0b8303c82f22c5e76d11b7bdbfa 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -27,7 +27,7 @@ import {
 import { refusalWords, screenshotMessage } from '../../render/screenshot-reading.js';
 import { SCREENSHOT_FEEDBACK } from '../../render/party-controls.js';
 import { gymNamerOf } from './gym-question.js';
-import { cancelShot, chooseShotGym } from './mention.js';
+import { cancelShot, chooseShotGym, confirmShot } from './mention.js';
 import { SHOT_KIND } from './shot-kind.js';
 
 /** The ids of the form's two inputs. */
@@ -210,6 +210,8 @@ export const screenshotControls: ComponentHandler = {
         return;
       case 'cancel':
         return cancelShot(interaction, id.id);
+      case 'yes':
+        return confirmShot(interaction, id.id, ctx);
       default:
         throw new UserError(STALE_COMPONENT);
     }
diff --git a/src/commands/screenshots/mention.test.ts b/src/commands/screenshots/mention.test.ts
index 518de29a5de28477559ee94fb46ed1b5219f03b8..83f3bcb86fad967556f6aa3bc6c85967c303146b 100644
--- a/src/commands/screenshots/mention.test.ts
+++ b/src/commands/screenshots/mention.test.ts
@@ -690,6 +690,144 @@ describe('screenshots posted with a mention of the bot', () => {
     expect(files('held')).toHaveLength(kept);
   });
 
+  describe('read passively, a clear gym of another region (Matt, 2026-10-22)', () => {
+    const lighthouse = () => eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60);
+    /** The Yes and No buttons of a reply. */
+    const buttonsOf = (reply: ReplyPayload | undefined) =>
+      (reply?.components?.[0]?.components ?? []) as { custom_id: string; label: string }[];
+    const press = (reply: ReplyPayload | undefined, label: string, userId = AUTHOR) => {
+      const button = buttonsOf(reply).find((b) => b.label === label);
+      return fakeButton({ customId: button?.custom_id ?? 'missing', userId });
+    };
+
+    it('asks its author, pinging them, whether to report it there, and Yes reports it', async () => {
+      const { trigger, image, store, router } = await setup({ passive: true });
+      const { message, replies, did } = posted([image('a.png', lighthouse())], {
+        mentionsBot: false,
+      });
+      await trigger.handle(message);
+      expect(store.active()).toEqual([]);
+      expect(replies).toHaveLength(1);
+      expect(replies[0]?.content).toBe(
+        `<@${AUTHOR}> Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>. Report it there?`,
+      );
+      expect(replies[0]?.ping).toBe(AUTHOR);
+      expect(buttonsOf(replies[0]).map((b) => b.label)).toEqual(['Yes', 'No']);
+      expect(did).not.toContain('deleted');
+
+      const stranger = press(replies[0], 'Yes', OTHER);
+      await router.handle(stranger as never);
+      expect(sent(stranger.reply).content).toBe('That is somebody else’s screenshot.');
+      expect(store.active()).toEqual([]);
+
+      const yes = press(replies[0], 'Yes');
+      await router.handle(yes as never);
+      const answer = sent(yes.editReply);
+      expect(answer.content).toMatch(/^Reported the raid at Harbor Lighthouse Mural: <#\d+>\.$/);
+      expect(answer.components).toEqual([]);
+      expect(store.active()[0]).toMatchObject({ gymId: 7, regionId: 2, createdById: AUTHOR });
+      expect(did).toContain('deleted');
+    });
+
+    it('says nothing when that region has no forum to report it in', async () => {
+      const { trigger, image, store, regions } = await setup({ passive: true });
+      regions.rows = regions.rows.map((row) =>
+        row.channelId === EAST_CHANNEL ? { ...row, forumChannelId: null } : row,
+      );
+      const { message, replies, did } = posted([image('a.png', lighthouse())], {
+        mentionsBot: false,
+      });
+      await trigger.handle(message);
+      expect(store.active()).toEqual([]);
+      expect(replies).toEqual([]);
+      expect(did).not.toContain('deleted');
+    });
+
+    it('makes nothing when its author answers No, and the question goes', async () => {
+      const { trigger, image, store, router } = await setup({ passive: true });
+      const { message, replies, did } = posted([image('a.png', lighthouse())], {
+        mentionsBot: false,
+      });
+      await trigger.handle(message);
+      const no = press(replies[0], 'No');
+      await router.handle(no as never);
+      expect(no.deleteReply).toHaveBeenCalledTimes(1);
+      expect(store.active()).toEqual([]);
+      expect(did).not.toContain('deleted');
+    });
+
+    it('makes nothing when nobody answers, and the question goes at its time', async () => {
+      const { trigger, image, store, router } = await setup({ passive: true, questionMs: 10 });
+      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
+      const { message, replies, did } = posted([image('a.png', lighthouse())], {
+        mentionsBot: false,
+      });
+      await trigger.handle(message);
+      vi.advanceTimersByTime(10);
+      expect(did).toContain('reply deleted');
+      const late = press(replies[0], 'Yes');
+      await router.handle(late as never);
+      expect(sent(late.update).content).toMatch(/^That question has expired/);
+      expect(store.active()).toEqual([]);
+    });
+
+    it('joins a raid already there unasked, as one of this region', async () => {
+      const { trigger, image, store, service } = await setup({ passive: true });
+      await trigger.handle(
+        posted([image('a.png', lighthouse())], { authorId: OTHER, channelId: EAST_CHANNEL })
+          .message,
+      );
+      await service.flush();
+      const { message, replies, did } = posted([image('b.png', lighthouse())], {
+        mentionsBot: false,
+      });
+      await trigger.handle(message);
+      expect(store.active()).toHaveLength(1);
+      expect(store.active()[0]?.attendees[AUTHOR]).toBeDefined();
+      expect(replies).toEqual([
+        {
+          content: expect.stringMatching(
+            new RegExp(
+              `^<@${AUTHOR}> There is already a raid at Harbor Lighthouse Mural: <#\\d+>\\. You have been signed up for it\\.$`,
+            ),
+          ) as unknown,
+          ping: AUTHOR,
+        },
+      ]);
+      expect(did).toContain('deleted');
+    });
+
+    it('refuses Yes when its author is kept out of that region’s forum', async () => {
+      const { trigger, image, store, router, gateway } = await setup({ passive: true });
+      const { message, replies, did } = posted([image('a.png', lighthouse())], {
+        mentionsBot: false,
+      });
+      await trigger.handle(message);
+      gateway.barred.set(EAST_FORUM, new Set([AUTHOR]));
+      const yes = press(replies[0], 'Yes');
+      await router.handle(yes as never);
+      expect(sent(yes.editReply)).toMatchObject({ content: REPORT_BARRED, components: [] });
+      expect(store.active()).toEqual([]);
+      expect(did).not.toContain('deleted');
+    });
+
+    it('does not count an image whose Yes the bot may not post in the forum', async () => {
+      const { trigger, image, router, gateway } = await setup({ passive: true });
+      gateway.refusePosts.set(EAST_FORUM, ['Manage Posts']);
+      const source = image('a.png', lighthouse());
+      for (let n = 0; n < 21; n++) {
+        const { message, replies } = posted([source], { mentionsBot: false });
+        await trigger.handle(message);
+        // The twenty-first is read too: none of the earlier ones counted.
+        expect(replies[0]?.content).toMatch(/Report it there\?$/);
+        const yes = press(replies[0], 'Yes');
+        await router.handle(yes as never);
+        expect(sent(yes.editReply).content).toMatch(/^I am not allowed to make posts in /);
+      }
+      await trigger.close();
+    });
+  });
+
   it('reads every image of a message as a report of its own, one after the other', async () => {
     const twin = testGym(13, 'Starbucks', 40.021, -80.081);
     const { trigger, image, store, reader } = await setup({ gyms: [twin] });
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index f77a9c3083a47f717afdc5da2dd264f12c95dcf2..41951769438836a0908ca0340c6894dda739f51d 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -48,8 +48,9 @@ import { mayJoinNoting, REPORT_BARRED, reportAccessOf, reportBarred } from '../r
  * the whole message. Once every image made or
  * joined a raid the message has done its work: it is deleted when it says nothing but the
  * mention (or, read passively, nothing at all), and marked ✅ otherwise. Replies go after a while (a question after two minutes,
- * and as soon as it is answered). Passive reading answers nothing but the raids that exist
- * (pinging the author, whose message may be gone): ordinary pictures draw no answer.
+ * and as soon as it is answered). Passive reading answers nothing but the raids that exist and
+ * a clear gym of another region, which it asks Yes or No about (pinging the author, whose
+ * message may be gone): ordinary pictures draw no answer.
  */
 
 /** The emoji the bot reacts with while it reads. */
@@ -143,6 +144,8 @@ interface PendingShot {
   keep?: ReplyKeep;
   /** What the question says, to be said again above `ASK_AGAIN` (set once it is made). */
   question?: string;
+  /** What is said below it then: `ASK_AGAIN` for the gym menu, `ASK_AGAIN_YES` for Yes / No. */
+  again?: string;
 }
 
 /**
@@ -157,6 +160,38 @@ const QUESTION_ROOM = 1_800;
  */
 const ASK_AGAIN =
   'Discord cannot be reached just now, so nothing was reported. Pick the gym again in a moment.';
+/** `ASK_AGAIN` below the question whether to report a place in another region. */
+const ASK_AGAIN_YES =
+  'Discord cannot be reached just now, so nothing was reported. Press Yes again in a moment.';
+
+/**
+ * The question of a passive reading whose place (a gym; a Power Spot once max battles are read)
+ * is clear but lies in another region (Matt, 2026-10-22).
+ */
+export function elsewhereQuestion(place: string, regionChannelId: string): string {
+  return `${place} is in <#${regionChannelId}>. Report it there?`;
+}
+
+/** Yes and No under `elsewhereQuestion`: `shot:<token>:yes`, and No as the gym question's Cancel. */
+function yesNoRow(token: string): Row {
+  return {
+    type: ComponentType.ActionRow,
+    components: [
+      {
+        type: ComponentType.Button,
+        custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'yes' }),
+        label: 'Yes',
+        style: ButtonStyle.Primary,
+      },
+      {
+        type: ComponentType.Button,
+        custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'cancel' }),
+        label: 'No',
+        style: ButtonStyle.Secondary,
+      },
+    ],
+  };
+}
 
 /**
  * How long a reply stays, once sent (`ScreenshotTrigger.say`): `answered` keeps it as long as a
@@ -363,7 +398,12 @@ export class ScreenshotTrigger {
       if (noPostMade(reported)) giveBack();
       return refused(outcomeWords(reported, gym));
     }
-    if (passive) return { kind: 'asked' };
+    if (passive) {
+      // Read passively, a clear gym of another region (Matt, 2026-10-22): a raid there is joined
+      // unasked; else its author is asked, Yes or No, whether to report it there.
+      if (decision.kind !== 'report') return { kind: 'asked' };
+      return this.elsewhere(batch, guildRow, decision.raid, id, giveBack);
+    }
     const gyms = gymCandidates(ctx, message.channelId, guildRow, report.gym);
     const [first] = gyms;
     const assumed =
@@ -398,6 +438,72 @@ export class ScreenshotTrigger {
     return { kind: 'asked' };
   }
 
+  /**
+   * A clear gym of another region, read passively (Matt, 2026-10-22; legacy Pine asked too): a
+   * raid already there is joined as one of this region would be, said in the reply that pings
+   * the author; none there yet, the author is asked in a reply only they can answer whether to
+   * report it there, Yes or No. Nothing is said when the gym lies in no region of the server
+   * that has a forum.
+   */
+  private async elsewhere(
+    batch: Batch,
+    guildRow: number,
+    raid: ScreenshotRaid,
+    screenshotId: string | undefined,
+    giveBack: () => void,
+  ): Promise<ImageResult> {
+    const { ctx } = this.options;
+    const { message } = batch;
+    const gym = ctx.gyms.get(raid.gymId);
+    if (!gym) return refused(refusalWords('no-gym'));
+    // Joined only, decided under the gym's lock: a raid reported there meanwhile is joined, and
+    // none is made unasked (review A2).
+    const reported = await reportShot(ctx, {
+      gym,
+      memberId: message.authorId,
+      member: message.member,
+      regionChannelId: message.channelId,
+      guildRow,
+      raid,
+      screenshotId,
+      joinOnly: true,
+    });
+    if (reported.kind === 'exists' || reported.kind === 'created') {
+      return { kind: 'made', exists: outcomeWords(reported, gym) };
+    }
+    if (reported.kind !== 'none-there') {
+      if (noPostMade(reported)) giveBack();
+      return refused(outcomeWords(reported, gym));
+    }
+    // Asked only where a raid could be reported: a region of the server with a forum (review A3).
+    const { region: there } = ctx.partyService.regionFor(gym, message.channelId);
+    if (!there) return refused(refusalWords('no-gym'));
+    const pending: PendingShot = {
+      raid,
+      screenshotId,
+      gymIds: [gym.id],
+      regionChannelId: message.channelId,
+      guildRow,
+      member: message.member,
+      batch,
+      giveBack,
+    };
+    const token = pendingShots.put(message.authorId, pending);
+    pending.question = `<@${message.authorId}> ${elsewhereQuestion(plain(gym.nickname || gym.name), there.channelId)}`;
+    pending.again = ASK_AGAIN_YES;
+    pending.keep = await this.say(
+      message,
+      {
+        content: pending.question,
+        components: [yesNoRow(token)],
+        ping: message.authorId,
+      },
+      this.options.questionMs ?? QUESTION_MS,
+      () => pendingShots.take(token, message.authorId),
+    );
+    return { kind: 'asked' };
+  }
+
   /**
    * Once every image of a message made or joined a raid, the message has done its work: it
    * goes when it says nothing but the mention, and is marked ✅ otherwise.
@@ -531,6 +637,8 @@ async function reportShot(
     guildRow: number;
     raid: ScreenshotRaid;
     screenshotId: string | undefined;
+    /** Only a raid already at the gym is joined (`RaidReport.joinOnly`). */
+    joinOnly?: true;
   },
 ): Promise<ShotOutcome> {
   let barred: boolean;
@@ -568,6 +676,7 @@ async function reportShot(
     screenshot: { id: shot.screenshotId ?? null, timeUncertain: raid.timeUncertain },
     regionChannelId: shot.regionChannelId,
     ...(raid.time ? { time: raid.time } : {}),
+    ...(shot.joinOnly ? { joinOnly: true } : {}),
   });
   const failed = joining.failure();
   if (failed) {
@@ -608,6 +717,8 @@ function outcomeWords(outcome: ShotOutcome, gym: Gym): string {
       return REPORT_BARRED;
     case 'unknown-access':
       return ACCESS_UNKNOWN;
+    case 'none-there':
+      return `There is no raid at ${name} to join.`;
   }
 }
 
@@ -664,7 +775,42 @@ export async function chooseShotGym(
     return;
   }
   const gymId = Number(interaction.values[0]);
-  const gym = request.gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
+  await answerShot(interaction, token, ctx, request, gymId, true);
+}
+
+/**
+ * Yes under the question whether to report a clear gym of another region, read passively: the
+ * raid is reported there as its author, with the checks of the gym question (Matt, 2026-10-22).
+ */
+export async function confirmShot(
+  interaction: ButtonInteraction,
+  token: string,
+  ctx: AppContext,
+): Promise<void> {
+  if (await answeredAlready(interaction, token)) return;
+  const request = peeked(interaction, token);
+  if (!request) {
+    await interaction.update({ content: EXPIRED, components: [] });
+    return;
+  }
+  await answerShot(interaction, token, ctx, request, request.gymIds[0], false);
+}
+
+/**
+ * Reports the raid of an answered question at the gym answered (`picked`: chosen in the menu,
+ * which the record keeps), and has the question say what came of it until its time is up; the
+ * message goes once every image made a raid.
+ */
+async function answerShot(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  token: string,
+  ctx: AppContext,
+  request: PendingShot,
+  gymId: number | undefined,
+  picked: boolean,
+): Promise<void> {
+  const gym =
+    gymId !== undefined && request.gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
   if (!gym) {
     await interaction.update({ content: 'That gym no longer exists.', components: [] });
     return;
@@ -705,7 +851,9 @@ export async function chooseShotGym(
     answeredShots.delete(token);
     pendingShots.put(interaction.user.id, request, token);
     const asked = await interaction
-      .editReply({ content: [request.question, ASK_AGAIN].filter(Boolean).join('\n') })
+      .editReply({
+        content: [request.question, request.again ?? ASK_AGAIN].filter(Boolean).join('\n'),
+      })
       .then(() => true)
       .catch(() => false);
     if (asked) return;
@@ -714,7 +862,7 @@ export async function chooseShotGym(
     pendingShots.take(token, interaction.user.id);
     answeredShots.set(token, true);
   }
-  if (request.screenshotId !== undefined)
+  if (picked && request.screenshotId !== undefined)
     await ctx.screenshots.picked(request.screenshotId, gym.id);
   // The question becomes the answer and goes at its time: a private follow-up would stand under
   // "Message could not be loaded" once the question it answers was deleted.
diff --git a/src/commands/screenshots/shot-kind.ts b/src/commands/screenshots/shot-kind.ts
index 78e506c4e5bab480eca781ebc367987eadbe8d01..0cba701c735ec3c1c33cc4df10c3d91bba892690 100644
--- a/src/commands/screenshots/shot-kind.ts
+++ b/src/commands/screenshots/shot-kind.ts
@@ -5,6 +5,7 @@
  * reporter's "Screenshot feedback", which shows the screenshot and what was read). With the
  * token of a pending question (`PendingRequests`, 16 characters): the question about the gym of
  * a screenshot posted with a mention of the bot, `shot:<token>:gym` (the menu) and
- * `shot:<token>:cancel`.
+ * `shot:<token>:cancel`; the question of a passive reading whether to report a clear gym of
+ * another region there, `shot:<token>:yes` and `shot:<token>:cancel` (No).
  */
 export const SHOT_KIND = 'shot';
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index 078227dfb92723c3170261dceac3f09fd264a791..f430ae55ba74cb3d56201f989f9352da61bc29ba 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -131,6 +131,18 @@ describe('PartyService.reportRaid', () => {
     expect(store.get(id)?.attendees[BOB]).toBeUndefined();
   });
 
+  it('makes no raid of a report that may only join one, and joins one that is there', async () => {
+    const { service, store, gateway } = await partyServiceWith();
+    expect(await service.reportRaid(report({ joinOnly: true }))).toEqual({ kind: 'none-there' });
+    expect(store.active()).toEqual([]);
+    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
+    const first = await service.reportRaid(report());
+    if (first.kind !== 'created') throw new Error(first.kind);
+    const joined = await service.reportRaid(report({ reporterId: ALICE, joinOnly: true }));
+    expect(joined).toMatchObject({ kind: 'exists', joined: true });
+    expect(store.active()).toHaveLength(1);
+  });
+
   it('keeps the name of a reporter who is not signed up, and the post names them by it', async () => {
     const { service, store, gateway } = await partyServiceWith();
     const outcome = await service.reportRaid(
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index d74d4c837ef3dda20330474f647af4ef844ee238..377e619ebb100eb86ee640f8acaf2d326e9e0c62 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -226,6 +226,12 @@ export interface RaidReport {
    * every forum is fine.
    */
   mayJoin?: (forumId: string) => Promise<boolean>;
+  /**
+   * Only a raid already at the gym is joined: a free gym gets none (`none-there`), decided under
+   * the gym's lock (plan 8X-S: a passive screenshot of a gym in another region, whose author is
+   * asked before a raid is made there).
+   */
+  joinOnly?: true;
 }
 
 /**
@@ -316,7 +322,9 @@ export type ReportOutcome =
    * The gym has such a raid already, in a forum the reporter may not be put in
    * (`RaidReport.mayJoin`): they were not signed up, nothing was done.
    */
-  | { kind: 'barred' };
+  | { kind: 'barred' }
+  /** A report that may only join (`RaidReport.joinOnly`) found no raid at the gym: none was made. */
+  | { kind: 'none-there' };
 
 /** A timed party that a member makes: a meetup with `/meetup`, a train with `/train`. */
 export interface TimedRequest {
@@ -1225,14 +1233,20 @@ export class PartyService {
 
     let stored: Awaited<ReturnType<PartyStore['addRaidUnlessTaken']>>;
     try {
-      stored = await store.addRaidUnlessTaken(raid, now, () => this.gymExists(gym.id));
+      stored = await store.addRaidUnlessTaken(raid, now, () => this.gymExists(gym.id), {
+        ...(report.joinOnly ? { mayAdd: false } : {}),
+      });
     } catch (err) {
       // The region was removed while the report was on its way: it is no region any more.
       if (err instanceof RegionClosedError) return { kind: 'no-region' };
       throw err;
     }
     if (!stored.added) {
-      if (!stored.existing) return { kind: 'gym-gone' };
+      if (!stored.existing) {
+        return report.joinOnly && this.gymExists(gym.id)
+          ? { kind: 'none-there' }
+          : { kind: 'gym-gone' };
+      }
       const existingId = stored.existing.id;
       const inFlight = this.creating.get(existingId);
       if (inFlight) {
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index ee1b3509094b009220b7e976351db200f308f30e..a09091ead0c229a342c138aad79f7567ea5963ac 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -443,13 +443,15 @@ export class PartyStore implements PartyProvider {
    * `gymExists` is asked under the same lock, before anything else: the deletion of a gym
    * (`GymAdminService.delete`) holds that lock from its check for a raid there until the gym is
    * gone, so a report that waited for it finds no gym and stores nothing (`existing` is then
-   * undefined), instead of a row that names a gym the database no longer has.
+   * undefined), instead of a row that names a gym the database no longer has. With `mayAdd` false
+   * only the raid there is returned: a free gym stores nothing (`existing` undefined; a report
+   * that may only join, plan 8X-S).
    */
   async addRaidUnlessTaken(
     party: RaidParty,
     now: number,
     gymExists: () => boolean = () => true,
-    options: { movedFrom?: string } = {},
+    options: { movedFrom?: string; mayAdd?: boolean } = {},
   ): Promise<
     | { added: true; party: RaidParty }
     | { added: false; existing: RaidParty }
@@ -461,6 +463,7 @@ export class PartyStore implements PartyProvider {
       if (!gymExists()) return { added: false, existing: undefined };
       const existing = this.raidAt(gymId, raidKindOf(party), now);
       if (existing) return { added: false, existing };
+      if (options.mayAdd === false) return { added: false, existing: undefined };
       await this.add(party, options);
       return { added: true, party };
     });
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index d65d1f0f716e29e6dae1a32c13bd8a7878ae1449..96dcfecaad4de7df52889ba5f47d18b63acb2c1c 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -101,6 +101,7 @@ const REPORT_STATUS = {
   'no-forum': 422,
   'no-post': 422,
   barred: 403,
+  'none-there': 404,
 } as const;
 
 /** A text a command's option takes: trimmed, not empty, within the option's length. */
````

### Task 2: 8X-S 2: the reading and the max report

Prototype commit: `fe4fb315ad0c07cfd48bb3fdbc0a33946177bf45`

The reader keeps the Power Spot line's own confidence (MaxText.spotConfidence)
and reads "Eternamax" as a form of its own, a Gigantamax battle in all but its
label.

A max battle's screen gets a report and a decision of their own, pure:

- matchPowerSpot: letters and digits only (a lost space, punctuation and case
  do not matter), a title equal to the name or starting with it (a name cut
  short); exactly one in the channel's region, else in the server, is clear;
  otherwise every title 80% alike is a candidate, the region's first.
- maxScreenshotReport: the boss of the max list in the form's kind (the
  list's tier kept against the heads, with a doubt), else a Pokemon that
  battles so with the tier of its heads or its form; the spot and whether its
  name was read surely; the moment as a raid's (screenshotMoment, now shared
  with screenshotReport) and whether it is sure (R9); the end, the countdown
  capped at the day's last battle (rotationEnd when it ends before it), or
  /max's default end without a countdown.
- decideMax: refuses not-a-max-screen, over-for-today (also a capped end
  passed by the upload, Matt's M2), battle-over, before-first, no-spot (with
  the name and whether it was read surely) and no-boss; asks the spot or the
  tier; else reports. withSpot puts in a spot chosen.

ocr:check on every labelled folder and the research samples: nothing went
from right to wrong.

**Files:**

```
 docs/architecture/screenshots.md         |   4 +-
 src/domain/ocr/max-decision.ts           | 108 +++++++++++++++++++
 src/domain/ocr/max-report.test.ts        | 416 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/ocr/max-report.ts             | 291 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/ocr/power-spot-match.test.ts  |  72 +++++++++++++
 src/domain/ocr/power-spot-match.ts       |  81 ++++++++++++++
 src/domain/ocr/raid-screen.test.ts       |  42 ++++++++
 src/domain/ocr/raid-screen.ts            |  27 +++--
 src/domain/ocr/screenshot-report.test.ts |   1 +
 src/domain/ocr/screenshot-report.ts      |  78 ++++++++++----
 src/domain/ocr/tier-heads.test.ts        |   1 +
 src/domain/time/max-end.ts               |   5 +
 12 files changed, 1097 insertions(+), 29 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/ocr/max-report.test.ts src/domain/ocr/power-spot-match.test.ts src/domain/ocr/raid-screen.test.ts src/domain/ocr/screenshot-report.test.ts src/domain/ocr/tier-heads.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff fe4fb315ad0c07cfd48bb3fdbc0a33946177bf45 -- docs/architecture/screenshots.md src/domain/ocr/max-decision.ts src/domain/ocr/max-report.test.ts src/domain/ocr/max-report.ts src/domain/ocr/power-spot-match.test.ts src/domain/ocr/power-spot-match.ts src/domain/ocr/raid-screen.test.ts src/domain/ocr/raid-screen.ts src/domain/ocr/screenshot-report.test.ts src/domain/ocr/screenshot-report.ts src/domain/ocr/tier-heads.test.ts src/domain/time/max-end.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 2: the reading and the max report`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 1df669730edd8a6a560eeae343d623d75aeb0a6f..7a6161c4bc77b47518080bda6e22c17d7f1c7557 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -6,13 +6,15 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 
 - Screenshots are read through `ScreenshotReader` (`OcrService`, `src/services/ocr-service.ts`): `read(bytes, { onQueued })` never throws and answers `read` (with the `ScreenReading`), `not-an-image`, `failed`, `busy` (beyond `settings.ocr.queue`; `full()` says so beforehand, and `ScreenshotService` asks it before it downloads) or `unavailable`; more than `MAX_SCREENSHOT_BYTES` is no image. It reads in a child process (`src/ocr/worker.ts`, protocol in `src/ocr/protocol.ts`): forked on first use with a minimal environment (`workerEnvironment`: exact names, none of the bot's secrets), lowered priority (every thread on Linux), one screenshot at a time, killed after `ocr.timeoutSeconds`, ended after ten minutes idle; it answers `received` first, and only a process that died before that is given the screenshot again. A start that fails is not tried again for ten minutes; a device the platform lacks (`deviceProblem`) is refused once. `close()` at shutdown leaves no process behind. The bot's own process never decodes an image (it imports `sharp` as a type only). Tests use the fake worker `test/support/ocr-worker.ts`; only `npm run ocr:check` runs the real models.
 - The model files and the game's head icon (`OCR_ASSETS`, `src/domain/ocr/assets.ts`) are downloaded into `var/ocr/` by `OcrAssets` (`src/services/ocr-assets.ts`) and checked by size and SHA-256 before every start of the reading process; a file that differs is downloaded again, a download that still differs is refused. A new model version is a change of that list, measured with `ocr:check` first.
-- What the reader does with an image is pure (`src/domain/ocr/`): `text-model.ts` (detector boxes, CTC decoding, lines; caps `DETECTOR_PIXELS`, `MAX_LINE_WIDTH`), `raid-screen.ts` (the elements found from the text and its boxes, no fixed layout; the clock read again from the status bar; `clockIn`'s rules, a word also ending after a percent sign, an iPhone's location arrow read as a `1` after the minutes left out; a max battle's screen read as `max` (`MaxText`: Dynamax or Gigantamax, the species, the Power Spot's line under it, the heads looked for just above the boss's line; the report makes no raid of it, so it is refused as no raid screen until a plan gives max battle screenshots a flow); the badge "Elite raid gym" or an older screen's "EX raid gym"; on a hatched raid the countdown that ends farthest right, not a nearby raid's timer; the CP's digits after at most three other characters, the icon beside it and a faint "CP" being read as `O`, `c`, `ce`; words left of the gym name's column, `PICTURE_EDGE` line heights from the edge, are the gym's picture and left out), `tier-heads.ts` (masked template matching against the game's icon), `shadow.ts` (the purple). Images are PNG, JPEG or WebP by their first bytes, at most `MAX_PIXELS`, of a screen's proportions (`src/ocr/screen-reader.ts`). Nothing the reader saw is logged.
+- What the reader does with an image is pure (`src/domain/ocr/`): `text-model.ts` (detector boxes, CTC decoding, lines; caps `DETECTOR_PIXELS`, `MAX_LINE_WIDTH`), `raid-screen.ts` (the elements found from the text and its boxes, no fixed layout; the clock read again from the status bar; `clockIn`'s rules, a word also ending after a percent sign, an iPhone's location arrow read as a `1` after the minutes left out; a max battle's screen read as `max` (`MaxText`: Dynamax, Gigantamax or Eternamax (Eternatus's label, a Gigantamax battle in all else), the species, the Power Spot's line under it with that line's own confidence `spotConfidence`, the heads looked for just above the boss's line; the raid report makes no raid of it, so it is refused as no raid screen; plan 8X-S gives it a report of its own, below); the badge "Elite raid gym" or an older screen's "EX raid gym"; on a hatched raid the countdown that ends farthest right, not a nearby raid's timer; the CP's digits after at most three other characters, the icon beside it and a faint "CP" being read as `O`, `c`, `ce`; words left of the gym name's column, `PICTURE_EDGE` line heights from the edge, are the gym's picture and left out), `tier-heads.ts` (masked template matching against the game's icon), `shadow.ts` (the purple). Images are PNG, JPEG or WebP by their first bytes, at most `MAX_PIXELS`, of a screen's proportions (`src/ocr/screen-reader.ts`). Nothing the reader saw is logged.
 
 ## The report and the decision
 
 - `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain; a CP that fits no boss takes the one boss of the heads' tier one digit off when the name read is clearly its), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). What is done with it is `decide` (below); its doubts are what the "Screenshot feedback" button shows.
 - Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed`; `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
+- A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, a Pokémon search of what can Dynamax or Gigantamax (of every Pokémon on an Eternamax screen, `anyPokemon`: the game data lists Eternatus for no max battle) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon the game lets battle so with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old), with no ending-soon question. `withSpot(report, spot)` puts in the spot a member chose.
+
 ## Keeping screenshots
 
 - Screenshots are kept by `ScreenshotStore` (`src/services/screenshot-store.ts`, `var/ocr/held/` and `var/ocr/review/`): every one read, with a record (`ScreenshotRecord`: the reading with only clock-like or short status-bar lines, the reader's own report and apart from it what the member typed, the decision, the boss list of the moment, where the time came from, the gym picked when asked, feedback; the ids of the sender and of who gave feedback, for staff and development only, never in a commit or a printout) for a day, a raid's while the raid is active and a day after (an active raid's is never deleted); one refused or asked about, one the reader itself had a doubt about (its own report's `doubts`, not what was typed), or one with feedback, is copied to review for `ocr.reviewDays`, at most `ocr.reviewPerDay` of a server a day; the hourly upkeep sweeps both, also stray and unreadable files after a day. A review copy is a hard link where the file system allows one, so a pair counts once. Both folders hold at most `ocr.keepMegabytes` (a start warns when `reviewPerDay` × `reviewDays` × 2 MB exceeds it): over it the oldest held screenshots without an issue (`hasIssue`: not reported unasked, a doubt, or "Something is wrong"; kept in an index built by the sweep, each read again before it goes) make room, then the oldest review copies that free bytes (not one hard-linked to its held screenshot), and when that is not enough the screenshot is read but not kept (a record kept alone counts its own bytes too). A passive read that was refused is not kept; a picture that is no raid screen keeps its record alone, with its lines' boxes and confidences but no text. "All right" makes the record's `label` (`memberLabel`: what the reader decided by itself; the gym the member picked, or else one read clearly, by its own name), "Something is wrong" by anybody takes it away.
diff --git a/src/domain/ocr/max-decision.ts b/src/domain/ocr/max-decision.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3ece78abd78bdd224cf346f61ec0802dae62b97e
--- /dev/null
+++ b/src/domain/ocr/max-decision.ts
@@ -0,0 +1,108 @@
+import type { RaidBossRef } from '../party/party.js';
+import type { MaxTier } from '../pogo/max-tier.js';
+import type { MaxDoubt, MaxScreenshotReport } from './max-report.js';
+import type { SpotTitle } from './power-spot-match.js';
+
+/**
+ * What Pine does with a max battle's screenshot (design `2026-10-22-max-battle-screenshots-design.md`,
+ * sections 3 to 6; beside the raid's `decide`). Refused: a screen that is no max battle's
+ * (`not-a-max-screen`), one taken at or after the day's last battle, or whose end capped at it has
+ * passed by the upload (`over-for-today`: `/max`'s words; Matt's M2), a countdown that is over
+ * (`battle-over`), one that ends at or before the first battle (`before-first`: yesterday's
+ * battle seen in the small hours), a Power Spot Pine does not know (`no-spot`, with the name and whether it
+ * was read surely, for the moderators' note) and a boss it cannot tell (`no-boss`). Asked: which
+ * Power Spot, when several may be it; the tier, when only the tier is missing (as `/max` asks).
+ * Otherwise reported. No ending-soon question for a screenshot (design 5).
+ */
+export type MaxDecision =
+  | {
+      kind: 'refuse';
+      reason: 'not-a-max-screen' | 'over-for-today' | 'battle-over' | 'before-first' | 'no-boss';
+    }
+  | { kind: 'refuse'; reason: 'no-spot'; read: string | null; readSurely: boolean }
+  | { kind: 'ask'; about: 'spot'; spots: SpotTitle[]; doubts: MaxDoubt[] }
+  | { kind: 'ask'; about: 'tier'; doubts: MaxDoubt[] }
+  | { kind: 'report'; battle: ScreenshotMax; doubts: MaxDoubt[] };
+
+/** The max battle a screenshot is reported as. */
+export interface ScreenshotMax {
+  /** The Power Spot's Wayfarer id. */
+  spotId: string;
+  boss: RaidBossRef;
+  tier: MaxTier;
+  end: number;
+  /** When the screenshot was taken (`MaxScreenshotReport.takenAt`). */
+  takenAt: number;
+  /** The moment is known: a file's name or a clock read surely (`MaxScreenshotReport.sureMoment`). */
+  sureMoment: boolean;
+  /** The countdown ends at a rotation, not the all-day kind (`MaxScreenshotReport.rotationEnd`). */
+  rotationEnd: boolean;
+  /**
+   * The moment is no sure one (`!sureMoment`: guessed, or its sources disagree): said in the post
+   * until `/end`. A dated file name or a clock read surely is exact however old (review A5).
+   */
+  timeUncertain: boolean;
+}
+
+export interface MaxDecideContext {
+  /** When the screenshot was posted: what is over by then is over. */
+  now: number;
+}
+
+export function decideMax(report: MaxScreenshotReport, context: MaxDecideContext): MaxDecision {
+  const { now } = context;
+  const { doubts } = report;
+  if (report.form === null) return { kind: 'refuse', reason: 'not-a-max-screen' };
+  if (report.takenAt >= report.lastBattle || report.end === null) {
+    return { kind: 'refuse', reason: 'over-for-today' };
+  }
+  if (report.countdownEnd !== null) {
+    if (report.countdownEnd <= now) return { kind: 'refuse', reason: 'battle-over' };
+    // Its countdown runs on, but the day's battles ended at the cap before it was posted (M2).
+    if (report.end <= now) return { kind: 'refuse', reason: 'over-for-today' };
+    // A battle that ends at the first battle time ended with yesterday's (review A6).
+    if (report.countdownEnd <= report.firstBattle)
+      return { kind: 'refuse', reason: 'before-first' };
+  } else if (report.end <= now) {
+    return { kind: 'refuse', reason: 'battle-over' };
+  }
+  const { match } = report.spot;
+  if (match.kind === 'unknown') {
+    return {
+      kind: 'refuse',
+      reason: 'no-spot',
+      read: report.spot.read,
+      readSurely: report.spot.readSurely,
+    };
+  }
+  if (report.boss === null) return { kind: 'refuse', reason: 'no-boss' };
+  if (match.kind === 'candidates')
+    return { kind: 'ask', about: 'spot', spots: match.spots, doubts };
+  if (report.tier === null) return { kind: 'ask', about: 'tier', doubts };
+  return {
+    kind: 'report',
+    battle: {
+      spotId: match.spot.id,
+      boss: report.boss.ref,
+      tier: report.tier,
+      end: report.end,
+      takenAt: report.takenAt,
+      sureMoment: report.sureMoment,
+      rotationEnd: report.rotationEnd,
+      timeUncertain: !report.sureMoment,
+    },
+    doubts,
+  };
+}
+
+/**
+ * The report with the Power Spot a member chose (the menu of `ask` `spot`, or `/max spot:`): the
+ * spot is clear, and the doubts about it go; decide again with `decideMax`.
+ */
+export function withSpot(report: MaxScreenshotReport, spot: SpotTitle): MaxScreenshotReport {
+  return {
+    ...report,
+    spot: { ...report.spot, match: { kind: 'clear', spot } },
+    doubts: report.doubts.filter((doubt) => doubt !== 'no-spot' && doubt !== 'spot-unclear'),
+  };
+}
diff --git a/src/domain/ocr/max-report.test.ts b/src/domain/ocr/max-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4d37f27141d80690cd6a7ee716428493ab3ec4d8
--- /dev/null
+++ b/src/domain/ocr/max-report.test.ts
@@ -0,0 +1,416 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import {
+  MAX_FEED_READ_AT,
+  pokebattlerFeed,
+  readPokebattlerFeed,
+} from '../../../test/support/max-bosses.js';
+import { pokemonFixture } from '../../../test/support/providers.js';
+import type { PokemonEntry } from '../pogo/game-master.js';
+import { maxBossesAt, parseMaxBossFeed, type MaxBoss } from '../pogo/max-bosses.js';
+import { decideMax, withSpot } from './max-decision.js';
+import { maxScreenshotReport, type MaxReportContext } from './max-report.js';
+import type { SpotTitle } from './power-spot-match.js';
+import type { MaxText, ScreenText } from './raid-screen.js';
+
+const ZONE = 'America/New_York';
+const at = (text: string) => DateTime.fromISO(text, { zone: ZONE }).toMillis();
+const catalogue = catalogueFixture();
+const pokemon = pokemonFixture();
+/** The recorded max bosses (a Dynamax 2★ Machop), with a Gigantamax Machamp as staff would add. */
+const BOSSES: MaxBoss[] = maxBossesAt(
+  parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
+    now: MAX_FEED_READ_AT,
+    zone: ZONE,
+  }).bosses.map((boss) => ({ ...boss, firstSeen: MAX_FEED_READ_AT })),
+  [
+    {
+      id: 1,
+      action: 'add',
+      pokemonId: 'MACHAMP',
+      form: null,
+      tier: 'G',
+      shiny: false,
+      expiresAt: null,
+      createdBy: '123456789012345678',
+      createdAt: MAX_FEED_READ_AT,
+    },
+  ],
+  catalogue,
+  MAX_FEED_READ_AT,
+);
+/** The Pokémon search over what can Dynamax or Gigantamax, as `/max` accepts typed. */
+const species = (read: string): PokemonEntry | undefined => {
+  const entry = pokemon.exact(read);
+  return entry && (catalogue.canDynamax(entry) || catalogue.canGigantamax(entry))
+    ? entry
+    : undefined;
+};
+/** Invented Power Spots. */
+const SPOTS: SpotTitle[] = [
+  { id: 'w1', title: "Juniper's Swing Corner", local: true },
+  { id: 'w2', title: 'Maple Bench East', local: true },
+  { id: 'w3', title: 'Maple Bench West', local: true },
+  { id: 'e1', title: 'Copperleaf Mural', local: false },
+];
+
+const NO_TEXT: ScreenText = {
+  clock: null,
+  countdown: null,
+  gym: null,
+  eliteBadge: false,
+  cp: null,
+  bossName: null,
+  countdownBox: null,
+  countdownPlace: null,
+  cpBox: null,
+};
+
+function maxText(overrides: Partial<MaxText> = {}): MaxText {
+  return {
+    form: 'dynamax',
+    species: 'Machop',
+    powerSpot: "JUNIPER'SSWING CORNER",
+    spotConfidence: 0.97,
+    box: { x0: 135, y0: 1500, x1: 950, y1: 1600 },
+    ...overrides,
+  };
+}
+
+/** A max screen read: its countdown in seconds (null for none), heads, clock. */
+function screen(
+  options: {
+    max?: Partial<MaxText> | null;
+    countdown?: number | null;
+    heads?: number | null;
+    clock?: ScreenText['clock'];
+  } = {},
+) {
+  const heads = options.heads === undefined ? 2 : options.heads;
+  return {
+    text: {
+      ...NO_TEXT,
+      clock: options.clock ?? null,
+      countdown: options.countdown === undefined ? 30 * 60 : options.countdown,
+      max: options.max === null ? null : maxText(options.max ?? {}),
+    },
+    heads: heads === null ? null : { count: heads, score: 0.7, scale: 1, outside: 0.2 },
+    purple: 0,
+  };
+}
+
+/** Uploaded at `uploaded`, taken at `taken` by the name of its file (unless null). */
+function context(
+  uploaded: string,
+  taken: string | null = uploaded,
+  overrides: Partial<MaxReportContext> = {},
+): MaxReportContext {
+  return {
+    bosses: BOSSES,
+    species,
+    anyPokemon: (read) => pokemon.exact(read),
+    catalogue,
+    spots: SPOTS,
+    uploadedAt: at(uploaded),
+    zone: ZONE,
+    guessOffsetSeconds: 45,
+    ...(taken === null ? {} : { fileTakenAt: at(taken) }),
+    hours: { firstBattle: '06:00', lastBattle: '21:00' },
+    events: [],
+    big: [],
+    ...overrides,
+  };
+}
+
+const THURSDAY = '2026-10-22T14:00:00';
+
+describe('maxScreenshotReport', () => {
+  it('reads a listed boss at a clear spot, its end the countdown from a moment it is sure of', () => {
+    const report = maxScreenshotReport(screen(), context(THURSDAY));
+    expect(report).toMatchObject({
+      form: 'dynamax',
+      boss: { ref: { key: 'machop' }, name: 'Machop', listed: true },
+      tier: 'D2',
+      tierFrom: 'list',
+      spot: { read: "JUNIPER'SSWING CORNER", readSurely: true, match: { kind: 'clear' } },
+      timeFrom: 'file',
+      sureMoment: true,
+      end: at('2026-10-22T14:30:00'),
+      endFrom: 'countdown',
+      rotationEnd: true,
+      doubts: [],
+    });
+  });
+
+  it('keeps the list’s tier when the heads disagree, and says so', () => {
+    const report = maxScreenshotReport(screen({ heads: 3 }), context(THURSDAY));
+    expect(report.tier).toBe('D2');
+    expect(report.doubts).toContain('heads-boss-conflict');
+  });
+
+  it('takes the tier of a boss on no list from the heads, or from the form for Gigantamax', () => {
+    const dynamax = maxScreenshotReport(
+      screen({ max: { species: 'Kingler' }, heads: 3 }),
+      context(THURSDAY),
+    );
+    expect(dynamax).toMatchObject({
+      boss: { ref: { key: 'kingler' }, listed: false },
+      tier: 'D3',
+      tierFrom: 'heads',
+    });
+    expect(dynamax.doubts).toContain('boss-unlisted');
+    // The form decides when the heads were not read, and must agree when they were.
+    const giant = maxScreenshotReport(
+      screen({ max: { form: 'gigantamax', species: 'Kingler' }, heads: null }),
+      context(THURSDAY),
+    );
+    expect(giant).toMatchObject({ tier: 'G', tierFrom: 'form' });
+    const noHeads = maxScreenshotReport(
+      screen({ max: { species: 'Kingler' }, heads: null }),
+      context(THURSDAY),
+    );
+    expect(noHeads).toMatchObject({ tier: null, boss: { ref: { key: 'kingler' } } });
+    expect(noHeads.doubts).toContain('tier-unknown');
+    const sixHeads = maxScreenshotReport(
+      screen({ max: { species: 'Kingler' }, heads: 6 }),
+      context(THURSDAY),
+    );
+    expect(sixHeads.tier).toBeNull();
+    expect(sixHeads.doubts).toContain('heads-form-conflict');
+  });
+
+  it('takes Eternamax as a Gigantamax battle in all but its name', () => {
+    const report = maxScreenshotReport(
+      screen({ max: { form: 'eternamax', species: 'Machamp' }, heads: 6 }),
+      context(THURSDAY),
+    );
+    expect(report).toMatchObject({
+      form: 'eternamax',
+      boss: { ref: { key: 'machamp' }, listed: true },
+      tier: 'G',
+      tierFrom: 'list',
+    });
+    expect(report.doubts).not.toContain('heads-boss-conflict');
+  });
+
+  describe('a boss the list has by its form, and Eternamax (review A1)', () => {
+    /** The feed's ids for Gigantamax Toxtricity and Eternatus, with a Dynamax 4★ Toxtricity. */
+    const FORMS: MaxBoss[] = maxBossesAt(
+      parseMaxBossFeed(
+        pokebattlerFeed({
+          RAID_LEVEL_6_MAX: [
+            { pokemonId: 'TOXTRICITY_AMPED_GIGANTAMAX' },
+            { pokemonId: 'ETERNATUS' },
+            { pokemonId: 'ETERNATUS_ETERNAMAX_FORM' },
+          ],
+          RAID_LEVEL_4_MAX: [{ pokemonId: 'TOXTRICITY' }],
+        }),
+        catalogue,
+        { now: MAX_FEED_READ_AT, zone: ZONE },
+      ).bosses.map((boss) => ({ ...boss, firstSeen: MAX_FEED_READ_AT })),
+      [],
+      catalogue,
+      MAX_FEED_READ_AT,
+    );
+    const read = (max: Partial<MaxText>, heads: number | null) =>
+      maxScreenshotReport(screen({ max, heads }), context(THURSDAY, THURSDAY, { bosses: FORMS }));
+
+    it('takes the listed form of the species read, of the screen’s kind', () => {
+      const giant = read({ form: 'gigantamax', species: 'Toxtricity' }, 6);
+      expect(giant).toMatchObject({
+        boss: { ref: { key: 'toxtricity_amped' }, listed: true },
+        tier: 'G',
+        tierFrom: 'list',
+      });
+      expect(giant.doubts).toEqual([]);
+      expect(read({ form: 'dynamax', species: 'Toxtricity' }, 4)).toMatchObject({
+        boss: { ref: { key: 'toxtricity' }, listed: true },
+        tier: 'D4',
+      });
+    });
+
+    it('finds Eternatus, which the game data lists for no max battle, as its Eternamax form', () => {
+      for (const heads of [6, null]) {
+        const eternamax = read({ form: 'eternamax', species: 'Eternatus' }, heads);
+        expect(eternamax).toMatchObject({
+          boss: { ref: { key: 'eternatus_eternamax' }, listed: true },
+          tier: 'G',
+          tierFrom: 'list',
+        });
+        expect(eternamax.doubts).not.toContain('no-boss');
+      }
+    });
+  });
+
+  it('caps a countdown that runs into the small hours at the day’s last battle', () => {
+    // Taken at 20:30 with a countdown to 04:59: the all-day kind.
+    const report = maxScreenshotReport(
+      screen({ countdown: 8 * 3600 + 29 * 60 }),
+      context('2026-10-22T20:30:30', '2026-10-22T20:30:00'),
+    );
+    expect(report).toMatchObject({
+      end: at('2026-10-22T21:00:00'),
+      countdownEnd: at('2026-10-23T04:59:00'),
+      rotationEnd: false,
+    });
+    // An event's countdown to 15:00 is kept: it ends at a rotation.
+    const event = maxScreenshotReport(screen({ countdown: 40 * 60 }), context('2026-10-22T14:20'));
+    expect(event).toMatchObject({ end: at('2026-10-22T15:00'), rotationEnd: true });
+  });
+
+  it('takes the default end of /max when the screen shows no countdown', () => {
+    const report = maxScreenshotReport(screen({ countdown: null }), context(THURSDAY));
+    expect(report).toMatchObject({
+      end: at('2026-10-22T21:00'),
+      endFrom: 'default',
+      rotationEnd: false,
+    });
+    expect(report.doubts).toContain('no-time');
+  });
+
+  it('is sure of the moment by a file name or a clock read surely, never a guess', () => {
+    const sure = (clock: ScreenText['clock'], taken: string | null) =>
+      maxScreenshotReport(screen({ clock }), context(THURSDAY, taken)).sureMoment;
+    expect(sure(null, THURSDAY)).toBe(true);
+    expect(sure({ hour: 1, minute: 59, confidence: 0.9 }, null)).toBe(true);
+    expect(sure({ hour: 1, minute: 59, confidence: 0.5 }, null)).toBe(false);
+    expect(sure(null, null)).toBe(false);
+    // The file and a clock read surely disagree: the clock is used, but not sure.
+    expect(sure({ hour: 1, minute: 50, confidence: 0.9 }, THURSDAY)).toBe(false);
+  });
+
+  it('says whether the Power Spot’s name was read surely', () => {
+    const poorly = maxScreenshotReport(screen({ max: { spotConfidence: 0.7 } }), context(THURSDAY));
+    expect(poorly.spot.readSurely).toBe(false);
+    expect(poorly.doubts).toContain('spot-read-poorly');
+  });
+});
+
+describe('decideMax', () => {
+  const decided = (
+    shot: ReturnType<typeof screen>,
+    uploaded: string,
+    taken: string | null = uploaded,
+  ) => decideMax(maxScreenshotReport(shot, context(uploaded, taken)), { now: at(uploaded) });
+
+  it('reports a clear battle with what it knows', () => {
+    expect(decided(screen(), THURSDAY)).toEqual({
+      kind: 'report',
+      battle: {
+        spotId: 'w1',
+        boss: { key: 'machop' },
+        tier: 'D2',
+        end: at('2026-10-22T14:30'),
+        takenAt: at(THURSDAY),
+        sureMoment: true,
+        rotationEnd: true,
+        timeUncertain: false,
+      },
+      doubts: [],
+    });
+    const guessed = decided(screen(), THURSDAY, null);
+    expect(guessed).toMatchObject({ kind: 'report', battle: { timeUncertain: true } });
+  });
+
+  it('takes a dated file as the moment however old it is: stale, but no guess (A5)', () => {
+    // Taken at 12:00 by its name, posted at 14:00, its countdown to 15:00.
+    const old = maxScreenshotReport(
+      screen({ countdown: 3 * 3600 }),
+      context('2026-10-22T14:00', '2026-10-22T12:00'),
+    );
+    expect(old.doubts).toContain('time-stale');
+    expect(decideMax(old, { now: at('2026-10-22T14:00') })).toMatchObject({
+      kind: 'report',
+      battle: { sureMoment: true, timeUncertain: false, end: at('2026-10-22T15:00') },
+    });
+  });
+
+  it('refuses a screen that is no max battle’s', () => {
+    expect(decided(screen({ max: null }), THURSDAY)).toEqual({
+      kind: 'refuse',
+      reason: 'not-a-max-screen',
+    });
+  });
+
+  it('refuses a screenshot taken at or after the last battle, not one a minute before', () => {
+    expect(decided(screen(), '2026-10-22T21:00:00')).toEqual({
+      kind: 'refuse',
+      reason: 'over-for-today',
+    });
+    expect(decided(screen(), '2026-10-22T21:05:30', '2026-10-22T21:05:00')).toMatchObject({
+      reason: 'over-for-today',
+    });
+    expect(decided(screen(), '2026-10-22T20:59:00')).toMatchObject({
+      kind: 'report',
+      battle: { end: at('2026-10-22T21:00') },
+    });
+  });
+
+  it('refuses a capped end that passed before the upload with the over-for-today words (M2)', () => {
+    // Taken at 20:50, posted at 21:05, its countdown to 04:59.
+    expect(
+      decided(screen({ countdown: 8 * 3600 + 9 * 60 }), '2026-10-22T21:05', '2026-10-22T20:50'),
+    ).toEqual({ kind: 'refuse', reason: 'over-for-today' });
+  });
+
+  it('refuses a battle its countdown says is over', () => {
+    expect(decided(screen({ countdown: 10 * 60 }), '2026-10-22T14:15', '2026-10-22T14:00')).toEqual(
+      { kind: 'refuse', reason: 'battle-over' },
+    );
+  });
+
+  it('refuses a countdown that ends before the first battle or at it, not one that ends after', () => {
+    for (const minutes of [29, 30]) {
+      expect(decided(screen({ countdown: minutes * 60 }), '2026-10-22T05:30')).toEqual({
+        kind: 'refuse',
+        reason: 'before-first',
+      });
+    }
+    expect(decided(screen({ countdown: 31 * 60 }), '2026-10-22T05:30')).toMatchObject({
+      kind: 'report',
+      battle: { end: at('2026-10-22T06:01') },
+    });
+  });
+
+  it('refuses a spot it does not know, saying whether the name was read surely', () => {
+    expect(decided(screen({ max: { powerSpot: 'HARBOR SIGNAL TOWER' } }), THURSDAY)).toEqual({
+      kind: 'refuse',
+      reason: 'no-spot',
+      read: 'HARBOR SIGNAL TOWER',
+      readSurely: true,
+    });
+    expect(
+      decided(screen({ max: { powerSpot: 'HARBOR SIGNAL TOWER', spotConfidence: 0.6 } }), THURSDAY),
+    ).toMatchObject({ reason: 'no-spot', readSurely: false });
+  });
+
+  it('refuses a boss it cannot tell', () => {
+    expect(decided(screen({ max: { species: 'Qwxyz' } }), THURSDAY)).toEqual({
+      kind: 'refuse',
+      reason: 'no-boss',
+    });
+  });
+
+  it('asks which spot when it is not clear, then decides again with the one chosen', () => {
+    const report = maxScreenshotReport(
+      screen({ max: { powerSpot: 'MAPLE BENCH' } }),
+      context(THURSDAY),
+    );
+    const asked = decideMax(report, { now: at(THURSDAY) });
+    expect(asked).toMatchObject({ kind: 'ask', about: 'spot' });
+    expect(asked.kind === 'ask' && asked.about === 'spot' && asked.spots.map((s) => s.id)).toEqual([
+      'w2',
+      'w3',
+    ]);
+    const chosen = decideMax(withSpot(report, SPOTS[2] as SpotTitle), { now: at(THURSDAY) });
+    expect(chosen).toMatchObject({ kind: 'report', battle: { spotId: 'w3' } });
+  });
+
+  it('asks the tier when only the tier is missing', () => {
+    expect(decided(screen({ max: { species: 'Kingler' }, heads: null }), THURSDAY)).toMatchObject({
+      kind: 'ask',
+      about: 'tier',
+    });
+  });
+});
diff --git a/src/domain/ocr/max-report.ts b/src/domain/ocr/max-report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d6ac1777f1ef58444e95cd25d7516b2e6ac53519
--- /dev/null
+++ b/src/domain/ocr/max-report.ts
@@ -0,0 +1,291 @@
+import type { RaidBossRef } from '../party/party.js';
+import type { PokemonCatalogue } from '../pogo/catalogue.js';
+import type { PokemonEntry } from '../pogo/game-master.js';
+import type { MaxBoss } from '../pogo/max-bosses.js';
+import type { MaxTier } from '../pogo/max-tier.js';
+import type { BigEvent, MaxEvent } from '../time/max-events.js';
+import { defaultMaxEnd, firstBattleOn, lastBattleOn, type BattleHours } from '../time/max-end.js';
+import { matchPowerSpot, type SpotMatch, type SpotTitle } from './power-spot-match.js';
+import type { MaxForm } from './raid-screen.js';
+import {
+  CLOCK_SURE,
+  nameSimilarity,
+  screenshotMoment,
+  type MomentContext,
+  type ReadScreen,
+  type ScreenshotMoment,
+} from './screenshot-report.js';
+
+/**
+ * What Pine makes of a max battle's screenshot (design `2026-10-22-max-battle-screenshots-design.md`,
+ * sections 3 to 5): the form, the boss and its tier, the Power Spot, the moment it was taken and
+ * the battle's end, each beside what it was made from, and the doubts. A report of its own beside
+ * the raid's (`ScreenshotReport`), whose decision is `decideMax` (`max-decision.ts`). Pure: the
+ * boss list, the Pokémon search, the Power Spots and the clock are given.
+ */
+
+/**
+ * Why a member should look at a max report:
+ * - `not-a-max-screen`: the reader found no max battle's boss line;
+ * - `no-spot`: no Power Spot is even 80% alike the name read (or none was read); `spot-unclear`:
+ *   several may be it; `spot-read-poorly`: its line was read with less than `SPOT_SURE`;
+ * - `no-boss`: no Pokémon that battles so was found by the name read;
+ * - `boss-unlisted`: a Pokémon the boss list does not have in that kind, its tier from the heads
+ *   or the form; `tier-unknown`: a Dynamax boss on no list whose heads were not read;
+ * - `heads-boss-conflict`: the listed boss has another tier than the heads say (the list's kept);
+ * - `heads-form-conflict`: six heads on a Dynamax screen, or one to five on a Gigantamax one;
+ * - `no-time`: no countdown (the end is `/max`'s default); the moment's doubts as a raid's.
+ */
+export type MaxDoubt =
+  | 'not-a-max-screen'
+  | 'no-spot'
+  | 'spot-unclear'
+  | 'spot-read-poorly'
+  | 'no-boss'
+  | 'boss-unlisted'
+  | 'tier-unknown'
+  | 'heads-boss-conflict'
+  | 'heads-form-conflict'
+  | 'no-time'
+  | 'time-guessed'
+  | 'time-stale'
+  | 'time-sources-differ';
+
+export interface MaxReportContext extends MomentContext {
+  /** The max bosses in effect (`ctx.maxBosses.bosses()`; Gigantamax listed apart, tier `G`). */
+  bosses: readonly MaxBoss[];
+  /**
+   * The Pokémon of a name read: a fuzzy search over what can Dynamax or Gigantamax, as `/max`
+   * accepts typed; undefined for none.
+   */
+  species: (read: string) => PokemonEntry | undefined;
+  /**
+   * The Pokémon of a name read among every Pokémon: for an Eternamax screen, since the game data
+   * lists Eternatus for no max battle (`BREAD_SPECIAL_MODE`, review A1); undefined for none.
+   */
+  anyPokemon: (read: string) => PokemonEntry | undefined;
+  /** Whether the game lets a Pokémon off the list battle so. */
+  catalogue: Pick<PokemonCatalogue, 'canDynamax' | 'canGigantamax'>;
+  /** The server's Power Spots, those of the channel's region marked `local`. */
+  spots: readonly SpotTitle[];
+  /** `settings.maxBattles`. */
+  hours: BattleHours;
+  /** The max and big events known, for `/max`'s default end of a screen without a countdown. */
+  events: readonly MaxEvent[];
+  big: readonly BigEvent[];
+}
+
+export interface MaxScreenshotReport {
+  /** Null on a screen that is no max battle's. */
+  form: MaxForm | null;
+  /** The species as read. */
+  speciesRead: string | null;
+  /** The boss: of the list (`listed`), else the Pokémon found that battles so; null for neither. */
+  boss: { ref: RaidBossRef; name: string; listed: boolean } | null;
+  heads: number | null;
+  tier: MaxTier | null;
+  /** The tier came from the boss list, the heads, or the form (Gigantamax has one tier). */
+  tierFrom: 'list' | 'heads' | 'form' | null;
+  spot: {
+    /** The Power Spot's name as read. */
+    read: string | null;
+    /** Its line was read with at least `SPOT_SURE`: a name Pine does not know is worth a note. */
+    readSurely: boolean;
+    match: SpotMatch;
+  };
+  clock: { hour: number; minute: number } | null;
+  countdown: number | null;
+  takenAt: number;
+  timeFrom: ScreenshotMoment['timeFrom'];
+  /**
+   * The moment is known (review R9): by the file's name, or a clock read surely
+   * (`CLOCK_SURE`), and they do not disagree; never guessed.
+   */
+  sureMoment: boolean;
+  /** When the countdown ends, `takenAt` + `countdown`, uncapped; null without a countdown. */
+  countdownEnd: number | null;
+  /**
+   * The battle's end: the countdown's capped at the last battle time of the day it was taken, or
+   * without a countdown `/max`'s default end (`defaultMaxEnd`); null when that day's battles are
+   * over by the moment it was taken.
+   */
+  end: number | null;
+  endFrom: 'countdown' | 'default' | null;
+  /**
+   * The countdown ends at a rotation: before the last battle time of the day it was taken (an
+   * event's, say 15:00), not the all-day kind that runs to about 05:00 the next day.
+   */
+  rotationEnd: boolean;
+  /** The first and the last battle time of the day it was taken. */
+  firstBattle: number;
+  lastBattle: number;
+  doubts: MaxDoubt[];
+}
+
+/** A Power Spot's line read with at least this confidence was read surely (design 3: about 0.9). */
+export const SPOT_SURE = 0.9;
+
+/**
+ * How far before the upload a clock is looked for, and beyond which a file's time is doubted as
+ * stale: as a standard raid's egg and battle (60 and 45 minutes) with a margin, an hour and a half.
+ */
+export const MAX_SCREENSHOT_AGE_MS = 90 * 60_000;
+
+/** A boss of the list that is not known to the catalogue is named so alike at least. */
+const LISTED_NAME_ALIKE = 0.9;
+
+/** Gigantamax and Eternamax battles are tier `G`; Dynamax battles have stars. */
+const isGiant = (form: MaxForm): boolean => form !== 'dynamax';
+
+/** A boss of the list in its Eternamax form (`ETERNATUS_ETERNAMAX`). */
+const isEternamax = (boss: MaxBoss): boolean => boss.entry?.form?.endsWith('_ETERNAMAX') === true;
+
+/**
+ * The listed boss of a screen among those of its kind and species (`ofKind`, review A1): the read
+ * name says the species only, so the list's form of it is taken. Each step keeps those that pass
+ * it, unless none does: the Eternamax form on an Eternamax screen and on no other, then the tier
+ * the heads say, then the very entry read; the first of what is left.
+ */
+function listedBoss(
+  ofKind: readonly MaxBoss[],
+  form: MaxForm,
+  headsTier: MaxTier | undefined,
+  entry: PokemonEntry | undefined,
+): MaxBoss | undefined {
+  let left = ofKind;
+  const narrow = (keep: (boss: MaxBoss) => boolean): void => {
+    const kept = left.filter(keep);
+    if (kept.length > 0) left = kept;
+  };
+  narrow((boss) => isEternamax(boss) === (form === 'eternamax'));
+  if (headsTier) narrow((boss) => boss.tier === headsTier);
+  if (entry) narrow((boss) => boss.entry?.key === entry.key);
+  return left[0];
+}
+
+/** The tier the heads say for the form; undefined for a count the form cannot have. */
+function tierOfHeads(heads: number, form: MaxForm): MaxTier | undefined {
+  if (isGiant(form)) return heads === 6 ? 'G' : undefined;
+  return heads >= 1 && heads <= 5 ? (`D${String(heads)}` as MaxTier) : undefined;
+}
+
+export function maxScreenshotReport(
+  reading: ReadScreen,
+  context: MaxReportContext,
+): MaxScreenshotReport {
+  const { text } = reading;
+  const max = text.max ?? null;
+  const doubts = new Set<MaxDoubt>();
+  if (!max) doubts.add('not-a-max-screen');
+  const heads = reading.heads && reading.heads.count > 0 ? reading.heads.count : null;
+  const form = max?.form ?? null;
+
+  // The boss: the list's of the form's kind first, else a Pokémon the game lets battle so.
+  let boss: MaxScreenshotReport['boss'] = null;
+  let tier: MaxTier | null = null;
+  let tierFrom: MaxScreenshotReport['tierFrom'] = null;
+  if (max && form) {
+    const giant = isGiant(form);
+    const headsTier = heads === null ? undefined : tierOfHeads(heads, form);
+    if (heads !== null && !headsTier) doubts.add('heads-form-conflict');
+    const entry =
+      form === 'eternamax' ? context.anyPokemon(max.species) : context.species(max.species);
+    // Of the species read, whichever form the list has (a Gigantamax Toxtricity listed as Amped).
+    const ofKind = context.bosses.filter(
+      (one) =>
+        (one.tier === 'G') === giant &&
+        (entry
+          ? one.entry?.dex === entry.dex
+          : !one.entry && nameSimilarity(one.name, max.species) >= LISTED_NAME_ALIKE),
+    );
+    const listed = listedBoss(ofKind, form, headsTier, entry);
+    if (listed) {
+      boss = {
+        ref: listed.entry ? { key: listed.entry.key } : { name: listed.name },
+        name: listed.name,
+        listed: true,
+      };
+      tier = listed.tier;
+      tierFrom = 'list';
+      if (heads !== null && headsTier !== listed.tier) doubts.add('heads-boss-conflict');
+    } else if (
+      entry &&
+      (giant ? context.catalogue.canGigantamax(entry) : context.catalogue.canDynamax(entry))
+    ) {
+      boss = { ref: { key: entry.key }, name: entry.name, listed: false };
+      doubts.add('boss-unlisted');
+      if (giant) {
+        tier = 'G';
+        tierFrom = 'form';
+      } else if (headsTier) {
+        tier = headsTier;
+        tierFrom = 'heads';
+      } else doubts.add('tier-unknown');
+    } else doubts.add('no-boss');
+  }
+
+  // The Power Spot.
+  const spotRead = max?.powerSpot ?? null;
+  const readSurely = (max?.spotConfidence ?? 0) >= SPOT_SURE;
+  const match = matchPowerSpot(spotRead, context.spots);
+  if (max) {
+    if (match.kind === 'unknown') doubts.add('no-spot');
+    if (match.kind === 'candidates') doubts.add('spot-unclear');
+    if (spotRead !== null && !readSurely) doubts.add('spot-read-poorly');
+  }
+
+  // The moment, as a raid's, and the end.
+  const moment = screenshotMoment(text.clock, context, MAX_SCREENSHOT_AGE_MS);
+  for (const doubt of moment.doubts) doubts.add(doubt);
+  const sureMoment =
+    (moment.timeFrom === 'file' ||
+      (moment.timeFrom === 'clock' && (text.clock?.confidence ?? 0) >= CLOCK_SURE)) &&
+    !moment.doubts.includes('time-sources-differ');
+  const { takenAt } = moment;
+  const firstBattle = firstBattleOn(takenAt, context.hours, context.zone);
+  const lastBattle = lastBattleOn(takenAt, context.hours, context.zone);
+  let countdownEnd: number | null = null;
+  let end: number | null = null;
+  let endFrom: MaxScreenshotReport['endFrom'] = null;
+  if (text.countdown !== null) {
+    countdownEnd = takenAt + text.countdown * 1000;
+    end = Math.min(countdownEnd, lastBattle);
+    endFrom = 'countdown';
+  } else {
+    doubts.add('no-time');
+    const byDefault = defaultMaxEnd({
+      tier: tier ?? (form && isGiant(form) ? 'G' : 'D1'),
+      at: takenAt,
+      events: context.events,
+      big: context.big,
+      hours: context.hours,
+      zone: context.zone,
+    });
+    if (byDefault.kind === 'end') {
+      end = byDefault.end;
+      endFrom = 'default';
+    }
+  }
+
+  return {
+    form,
+    speciesRead: max?.species ?? null,
+    boss,
+    heads,
+    tier,
+    tierFrom,
+    spot: { read: spotRead, readSurely, match },
+    clock: text.clock ? { hour: text.clock.hour, minute: text.clock.minute } : null,
+    countdown: text.countdown,
+    takenAt,
+    timeFrom: moment.timeFrom,
+    sureMoment,
+    countdownEnd,
+    end,
+    endFrom,
+    rotationEnd: countdownEnd !== null && countdownEnd < lastBattle,
+    firstBattle,
+    lastBattle,
+    doubts: [...doubts],
+  };
+}
diff --git a/src/domain/ocr/power-spot-match.test.ts b/src/domain/ocr/power-spot-match.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8e3f6c318860c34c8a136d97700d25d9a027dae1
--- /dev/null
+++ b/src/domain/ocr/power-spot-match.test.ts
@@ -0,0 +1,72 @@
+import { describe, expect, it } from 'vitest';
+import { matchPowerSpot, type SpotTitle } from './power-spot-match.js';
+
+/** Invented Power Spots: three in the channel's region, two elsewhere in the server. */
+const SPOTS: SpotTitle[] = [
+  { id: 'a1', title: "Juniper's Swing Corner", local: true },
+  { id: 'a2', title: 'Old Lantern Fountain', local: true },
+  { id: 'a3', title: 'Bramble Creek Trailhead Kiosk and Map Board', local: true },
+  { id: 'b1', title: 'Old Lantern Fountains', local: false },
+  { id: 'b2', title: 'Copperleaf Mural', local: false },
+];
+const ids = (match: ReturnType<typeof matchPowerSpot>) =>
+  match.kind === 'candidates' ? match.spots.map((spot) => spot.id) : [];
+
+describe('matchPowerSpot', () => {
+  it('matches a name whose space was lost, in capitals, without minding punctuation', () => {
+    expect(matchPowerSpot("JUNIPER'SSWING CORNER", SPOTS)).toEqual({
+      kind: 'clear',
+      spot: SPOTS[0],
+    });
+    expect(matchPowerSpot('COPPERLEAF MURAL', SPOTS)).toEqual({ kind: 'clear', spot: SPOTS[4] });
+  });
+
+  it('matches a name the screen cut short as the start of a title', () => {
+    expect(matchPowerSpot('BRAMBLE CREEK TRAILHEAD KIOSK AND', SPOTS)).toEqual({
+      kind: 'clear',
+      spot: SPOTS[2],
+    });
+    // Too short a start says nothing: six letters and digits are the least.
+    expect(matchPowerSpot('OLD', SPOTS).kind).toBe('unknown');
+    expect(matchPowerSpot('COPPER', SPOTS)).toEqual({ kind: 'clear', spot: SPOTS[4] });
+    expect(matchPowerSpot('COPPE', SPOTS).kind).toBe('unknown');
+  });
+
+  it('takes a title equal to the name before titles it is the start of', () => {
+    const bench: SpotTitle = { id: 'd1', title: 'Maple Bench', local: true };
+    const east: SpotTitle = { id: 'd2', title: 'Maple Bench East', local: true };
+    expect(matchPowerSpot('MAPLE BENCH', [east, bench])).toEqual({ kind: 'clear', spot: bench });
+    // Equal elsewhere in the server, the start of one in the region: still the equal one.
+    const away = { ...bench, local: false };
+    expect(matchPowerSpot('MAPLE BENCH', [east, away])).toEqual({ kind: 'clear', spot: away });
+    // Two equal titles in the region: neither is taken.
+    const twin: SpotTitle = { id: 'd3', title: 'MAPLE BENCH', local: true };
+    expect(ids(matchPowerSpot('MAPLE BENCH', [east, bench, twin]))).toEqual(['d1', 'd3', 'd2']);
+  });
+
+  it('takes the one match in the channel’s region before one elsewhere in the server', () => {
+    // "Old Lantern Fountain" is the start of "Old Lantern Fountains" too, which lies elsewhere.
+    expect(matchPowerSpot('OLD LANTERN FOUNTAIN', SPOTS)).toEqual({
+      kind: 'clear',
+      spot: SPOTS[1],
+    });
+  });
+
+  it('offers every title at least 80% alike when none matches outright, the region’s first', () => {
+    const match = matchPowerSpot('OLD LANTERN FOUNTIAN', SPOTS);
+    expect(match.kind).toBe('candidates');
+    expect(ids(match)).toEqual(['a2', 'b1']);
+    // Two alike in the region: both offered, neither taken.
+    const twins: SpotTitle[] = [
+      { id: 'c1', title: 'Maple Bench East', local: true },
+      { id: 'c2', title: 'Maple Bench West', local: true },
+    ];
+    expect(ids(matchPowerSpot('MAPLE BENCH', twins))).toEqual(['c1', 'c2']);
+  });
+
+  it('knows no spot that is not even 80% alike, nor a name that was not read', () => {
+    expect(matchPowerSpot('HARBOR SIGNAL TOWER', SPOTS)).toEqual({ kind: 'unknown' });
+    expect(matchPowerSpot(null, SPOTS)).toEqual({ kind: 'unknown' });
+    expect(matchPowerSpot('...', SPOTS)).toEqual({ kind: 'unknown' });
+  });
+});
diff --git a/src/domain/ocr/power-spot-match.ts b/src/domain/ocr/power-spot-match.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6690bc823f2123451eb90a0c856c935fab96c9db
--- /dev/null
+++ b/src/domain/ocr/power-spot-match.ts
@@ -0,0 +1,81 @@
+import { nameSimilarity } from './screenshot-report.js';
+
+/**
+ * Which Power Spot the name on a max battle's screen is (design
+ * `2026-10-22-max-battle-screenshots-design.md`, sections 3 and 9): pure, over the titles it is
+ * given. The game shows the name in capitals, and the reader may lose a space
+ * (`JUNIPER'SSWING CORNER`) or get a name the screen cut short.
+ */
+
+/** A Power Spot the name may be: its Wayfarer id, its title, and whether it lies in the channel's region. */
+export interface SpotTitle {
+  id: string;
+  title: string;
+  /** In the region of the channel the screenshot was posted in (else elsewhere in the server). */
+  local: boolean;
+}
+
+/**
+ * `clear`: the one spot it is. `candidates`: the spots it may be, the region's first, then the
+ * most alike (a menu asks which). `unknown`: no title is even 80% alike (`SPOT_ALIKE`), or no
+ * name was read.
+ */
+export type SpotMatch =
+  | { kind: 'clear'; spot: SpotTitle }
+  | { kind: 'candidates'; spots: SpotTitle[] }
+  | { kind: 'unknown' };
+
+/** A title at least this alike to the name read (`nameSimilarity`) is offered (design 9). */
+export const SPOT_ALIKE = 0.8;
+
+/**
+ * A name read is taken as the start of a longer title (cut short by the screen) only with at
+ * least this many letters and digits: a word or two say nothing.
+ */
+const CUT_NAME_MIN = 6;
+
+/** Letters and digits only, without case or accents: `Juniper's Swing` → `juniperswing`. */
+function letters(text: string): string {
+  return text
+    .normalize('NFKD')
+    .replace(/\p{M}/gu, '')
+    .toLowerCase()
+    .replace(/[^\p{L}\p{N}]/gu, '');
+}
+
+/**
+ * The one spot of `found`: the only one in the channel's region, or failing any there, the only
+ * one in the server; undefined otherwise.
+ */
+function onlyOne(found: readonly SpotTitle[]): SpotTitle | undefined {
+  const local = found.filter((spot) => spot.local);
+  if (local.length > 0) return local.length === 1 ? local[0] : undefined;
+  return found.length === 1 ? found[0] : undefined;
+}
+
+/**
+ * The Power Spot of a name read (design 9): a title equal to it, letters and digits only, or one
+ * it is the start of (a name cut short), matches. Equal titles come first (review A4: "MAPLE
+ * BENCH" is "Maple Bench", not "Maple Bench East"): exactly one in the channel's region, or
+ * failing any there, exactly one in the server, is clear; only without an equal title are the
+ * titles it is the start of looked at so. Otherwise every match and every title at least 80%
+ * alike is a candidate, the region's first; none: unknown.
+ */
+export function matchPowerSpot(read: string | null, spots: readonly SpotTitle[]): SpotMatch {
+  const name = read === null ? '' : letters(read);
+  if (name.length === 0) return { kind: 'unknown' };
+  const equal = spots.filter((spot) => letters(spot.title) === name);
+  const starts =
+    name.length >= CUT_NAME_MIN
+      ? spots.filter((spot) => !equal.includes(spot) && letters(spot.title).startsWith(name))
+      : [];
+  const clear = equal.length > 0 ? onlyOne(equal) : onlyOne(starts);
+  if (clear) return { kind: 'clear', spot: clear };
+  const matches = [...equal, ...starts];
+  const alike = spots
+    .map((spot) => ({ spot, score: nameSimilarity(read ?? '', spot.title) }))
+    .filter(({ spot, score }) => score >= SPOT_ALIKE || matches.includes(spot))
+    .sort((a, b) => Number(b.spot.local) - Number(a.spot.local) || b.score - a.score)
+    .map(({ spot }) => spot);
+  return alike.length === 0 ? { kind: 'unknown' } : { kind: 'candidates', spots: alike };
+}
diff --git a/src/domain/ocr/raid-screen.test.ts b/src/domain/ocr/raid-screen.test.ts
index 7362a845c3792827805438117be9131965ee0592..461df99c4397b833515517f89b8d7623a66c050f 100644
--- a/src/domain/ocr/raid-screen.test.ts
+++ b/src/domain/ocr/raid-screen.test.ts
@@ -183,6 +183,48 @@ describe('readScreenText', () => {
     });
   });
 
+  it('keeps the confidence of the Power Spot’s own line', () => {
+    const lines = [
+      line('0:24:00', 820, 1380, 980, 1430),
+      line('Dynamax Machop', 135, 1500, 950, 1600),
+      { ...line('BRAMBLE CREEK KIOSK', 180, 1710, 905, 1750), confidence: 0.81 },
+    ];
+    expect(readScreenText(lines, [], SIZE).max).toMatchObject({
+      powerSpot: 'BRAMBLE CREEK KIOSK',
+      spotConfidence: 0.81,
+    });
+    // No Power Spot line: no confidence.
+    expect(readScreenText(lines.slice(0, 2), [], SIZE).max).toMatchObject({
+      powerSpot: null,
+      spotConfidence: null,
+    });
+  });
+
+  it('reads an Eternamax battle as a form of its own, on one line or two', () => {
+    expect(
+      readScreenText(
+        [
+          line('0:24:00', 820, 1380, 980, 1430),
+          line('Eternamax Eternatus', 135, 1500, 950, 1600),
+          line('BRAMBLE CREEK KIOSK', 180, 1710, 905, 1750),
+        ],
+        [],
+        SIZE,
+      ).max,
+    ).toMatchObject({ form: 'eternamax', species: 'Eternatus' });
+    expect(
+      readScreenText(
+        [
+          line('Eternamax', 271, 1395, 826, 1494),
+          line('Eternatus', 367, 1523, 718, 1613),
+          line('BRAMBLE CREEK KIOSK', 211, 1664, 872, 1709),
+        ],
+        [],
+        SIZE,
+      ).max,
+    ).toMatchObject({ form: 'eternamax', species: 'Eternatus', powerSpot: 'BRAMBLE CREEK KIOSK' });
+  });
+
   it('takes the badge of an EX raid gym, as older screens show it, for the badge and not the name', () => {
     for (const badge of ['EX RAID GYM', 'EXRAID GYM', 'EXRAIDGYM', 'EUTE RAID GYM']) {
       const text = readScreenText(
diff --git a/src/domain/ocr/raid-screen.ts b/src/domain/ocr/raid-screen.ts
index d1ff28a1a5b9fb72d675276af1cda35ec67c0fcd..ff08b340b5c9b6930f7d0b5984cf74e95305bc90 100644
--- a/src/domain/ocr/raid-screen.ts
+++ b/src/domain/ocr/raid-screen.ts
@@ -33,13 +33,25 @@ export interface ScreenText {
   max?: MaxText | null;
 }
 
+/** The label of a max battle's boss line. */
+export type MaxForm = 'dynamax' | 'gigantamax' | 'eternamax';
+
 /** A max battle's screen: the boss's line ("Dynamax Sneasel") and the Power Spot's under it. */
 export interface MaxText {
-  form: 'dynamax' | 'gigantamax';
-  /** The boss's name as read, without "Dynamax" or "Gigantamax". */
+  /**
+   * `eternamax`: Eternatus's screen says "Eternamax", a Gigantamax battle in everything but the
+   * label (design `2026-10-22-max-battle-screenshots-design.md`, section 4).
+   */
+  form: MaxForm;
+  /** The boss's name as read, without "Dynamax", "Gigantamax" or "Eternamax". */
   species: string;
   /** The Power Spot's name as read (the game shows it in capitals). */
   powerSpot: string | null;
+  /**
+   * The reader's confidence (0 to 1) of the Power Spot's own line; null without one (absent in
+   * records read before it was kept: taken as not sure).
+   */
+  spotConfidence: number | null;
   /** The boss's line: the heads stand just above it. */
   box: Box;
 }
@@ -62,10 +74,10 @@ const NAME_WORD = /^(?:[A-Z][a-z]|\d)/;
 /** The CP is the tallest text on a hatched raid: taller than this share of the screen. */
 const CP_MIN_HEIGHT = 0.04;
 /**
- * A max battle's boss line: "Dynamax" or "Gigantamax" and the species, in large letters (the space
- * may be lost; an older screen puts the species on the next line).
+ * A max battle's boss line: "Dynamax", "Gigantamax" or "Eternamax" and the species, in large
+ * letters (the space may be lost; an older screen puts the species on the next line).
  */
-const MAX_BOSS = /^(dynamax|gigantamax)\s*(\S.*)?$/i;
+const MAX_BOSS = /^(dynamax|gigantamax|eternamax)\s*(\S.*)?$/i;
 /** The boss's line is 0.023 (in a split screen's half) to 0.05 of the screen's height. */
 const MAX_BOSS_MIN_HEIGHT = 0.018;
 
@@ -158,7 +170,7 @@ export function clockIn(lines: readonly TextLine[]): ScreenText['clock'] {
 }
 
 /**
- * What a max battle's screen says: the boss's line, large, "Dynamax" or "Gigantamax" and the
+ * What a max battle's screen says: the boss's line, large, "Dynamax", "Gigantamax" or "Eternamax" and the
  * species; the Power Spot is the first line of letters under it, within two of its heights.
  */
 function maxText(body: readonly TextLine[], height: number): MaxText | null {
@@ -178,9 +190,10 @@ function maxText(body: readonly TextLine[], height: number): MaxText | null {
     if (!speciesLine) continue;
     const spot = under(speciesLine);
     return {
-      form: hit[1].toLowerCase() === 'gigantamax' ? 'gigantamax' : 'dynamax',
+      form: hit[1].toLowerCase() as MaxForm,
       species: hit[2] ? hit[2].trim() : speciesLine.text.trim(),
       powerSpot: spot ? spot.text.trim() : null,
+      spotConfidence: spot ? spot.confidence : null,
       box: line.box,
     };
   }
diff --git a/src/domain/ocr/screenshot-report.test.ts b/src/domain/ocr/screenshot-report.test.ts
index 8db3a832f194cb55d8547a30fcc7b9b5102d3a55..32351ed105f8ffbac6b0166595dfaecffda5ae28 100644
--- a/src/domain/ocr/screenshot-report.test.ts
+++ b/src/domain/ocr/screenshot-report.test.ts
@@ -171,6 +171,7 @@ describe('screenshotReport', () => {
       form: 'dynamax' as const,
       species: 'Sneasel',
       powerSpot: 'HOLLOWAY BROTHERS, PRINTERS',
+      spotConfidence: 0.95,
       box: { x0: 135, y0: 1500, x1: 950, y1: 1600 },
     };
     for (const heads of [1, 3, 5]) {
diff --git a/src/domain/ocr/screenshot-report.ts b/src/domain/ocr/screenshot-report.ts
index efae6ba12dd0f59af3e77537923ba033877ea8b0..641f7bc7bea6006a038b1436949bfdade98bddd5 100644
--- a/src/domain/ocr/screenshot-report.ts
+++ b/src/domain/ocr/screenshot-report.ts
@@ -394,7 +394,7 @@ export const CLOCK_SURE = 0.6;
  * clock wins if it was read surely (`CLOCK_SURE`), and the file otherwise.
  */
 function fileTime(
-  context: ReportContext,
+  context: MomentContext,
   clock: ScreenText['clock'],
 ): { at: number | undefined; differs: boolean } {
   const { fileTakenAt } = context;
@@ -415,6 +415,55 @@ function fileTime(
   return { at: sure ? undefined : fileTakenAt, differs: true };
 }
 
+/** What the moment of a screenshot is told from (`ReportContext`'s fields of the same names). */
+export type MomentContext = Pick<
+  ReportContext,
+  'uploadedAt' | 'zone' | 'guessOffsetSeconds' | 'fileTakenAt'
+>;
+
+/** The doubts about the moment of a screenshot (`ReportDoubt`). */
+export type MomentDoubt = 'time-guessed' | 'time-stale' | 'time-sources-differ';
+
+/** When a screenshot was taken, what that was taken from, and the doubts about it. */
+export interface ScreenshotMoment {
+  takenAt: number;
+  timeFrom: 'file' | 'clock' | 'upload';
+  doubts: MomentDoubt[];
+}
+
+/**
+ * When a screenshot was taken (a raid's and a max battle's alike): the file's name, to the second
+ * and dated, when it agrees with the clock read (within a phone's two minutes, by the time of
+ * day) or there is no clock: within `maxAgeMs` it is the time; older, it is still the time,
+ * doubted as stale (a screenshot posted again later). A name ahead of the upload by more than a
+ * phone's clock may be, or one the clock contradicts, is not used. Else the clock (`clockTime`,
+ * within `maxAgeMs`), else guessed from the upload.
+ */
+export function screenshotMoment(
+  clock: ScreenText['clock'],
+  context: MomentContext,
+  maxAgeMs: number,
+): ScreenshotMoment {
+  const doubts: MomentDoubt[] = [];
+  const byClock = clock ? clockTime(clock, context.uploadedAt, context.zone, maxAgeMs) : undefined;
+  const file = fileTime(context, clock);
+  if (file.differs) doubts.push('time-sources-differ');
+  const fileTakenAt = file.at;
+  const fileAge = fileTakenAt === undefined ? undefined : context.uploadedAt - fileTakenAt;
+  const takenAt = fileTakenAt ?? byClock ?? context.uploadedAt - context.guessOffsetSeconds * 1000;
+  if (fileAge !== undefined) {
+    if (fileAge > maxAgeMs) doubts.push('time-stale');
+  } else {
+    if (byClock === undefined) doubts.push('time-guessed');
+    else if (context.uploadedAt - byClock > STALE_MS) doubts.push('time-stale');
+  }
+  return {
+    takenAt,
+    timeFrom: fileTakenAt !== undefined ? 'file' : byClock !== undefined ? 'clock' : 'upload',
+    doubts,
+  };
+}
+
 export function screenshotReport(reading: ReadScreen, context: ReportContext): ScreenshotReport {
   const { text } = reading;
   const doubts = new Set<ReportDoubt>();
@@ -479,25 +528,12 @@ export function screenshotReport(reading: ReadScreen, context: ReportContext): S
   if (stage === null) doubts.add('stage-unknown');
 
   const maxAgeMs = (context.standardIncubate + context.standardHatched) * 60_000;
-  const byClock = text.clock
-    ? clockTime(text.clock, context.uploadedAt, context.zone, maxAgeMs)
-    : undefined;
-  // The file's name, to the second and dated, wins when it agrees with the clock read (within a
-  // phone's two minutes, by the time of day) or there is no clock: within the window it is the
-  // time; older, it is still the time, doubted as stale (a screenshot posted again later). A
-  // name ahead of the upload by more than a phone's clock may be, or one the clock contradicts,
-  // is not used.
-  const file = fileTime(context, text.clock);
-  if (file.differs) doubts.add('time-sources-differ');
-  const fileTakenAt = file.at;
-  const fileAge = fileTakenAt === undefined ? undefined : context.uploadedAt - fileTakenAt;
-  const takenAt = fileTakenAt ?? byClock ?? context.uploadedAt - context.guessOffsetSeconds * 1000;
-  if (fileAge !== undefined) {
-    if (fileAge > maxAgeMs) doubts.add('time-stale');
-  } else {
-    if (byClock === undefined) doubts.add('time-guessed');
-    else if (context.uploadedAt - byClock > STALE_MS) doubts.add('time-stale');
-  }
+  const {
+    takenAt,
+    timeFrom,
+    doubts: momentDoubts,
+  } = screenshotMoment(text.clock, context, maxAgeMs);
+  for (const doubt of momentDoubts) doubts.add(doubt);
   let time: ScreenshotReport['time'] = null;
   if (text.countdown === null) {
     doubts.add('no-time');
@@ -539,7 +575,7 @@ export function screenshotReport(reading: ReadScreen, context: ReportContext): S
     clock: text.clock,
     countdown: text.countdown,
     takenAt,
-    timeFrom: fileTakenAt !== undefined ? 'file' : byClock !== undefined ? 'clock' : 'upload',
+    timeFrom,
     time,
     doubts: [...doubts],
   };
diff --git a/src/domain/ocr/tier-heads.test.ts b/src/domain/ocr/tier-heads.test.ts
index 73e89d4d19df5ac41ec632c61abd2d0b6edcf51c..988018c13be8b0464be65331a59339c69830a7fd 100644
--- a/src/domain/ocr/tier-heads.test.ts
+++ b/src/domain/ocr/tier-heads.test.ts
@@ -111,6 +111,7 @@ describe('headBand', () => {
       form: 'dynamax' as const,
       species: 'Sneasel',
       powerSpot: null,
+      spotConfidence: null,
       box: { x0: 135, y0: 1500, x1: 950, y1: 1600 },
     };
     const countdownBox = { x0: 820, y0: 1380, x1: 980, y1: 1430 };
diff --git a/src/domain/time/max-end.ts b/src/domain/time/max-end.ts
index 97d7127758d1dfacc3860e624e7abd85902b1964..f17c60e2344e5310a338b929a1e20bc53823ad27 100644
--- a/src/domain/time/max-end.ts
+++ b/src/domain/time/max-end.ts
@@ -81,6 +81,11 @@ function clockOn(time: number, clock: string, zone: string): number {
     .toMillis();
 }
 
+/** The first battle time of the day of `time` (`settings.maxBattles.firstBattle`). */
+export function firstBattleOn(time: number, hours: BattleHours, zone: string): number {
+  return clockOn(time, hours.firstBattle, zone);
+}
+
 /** The last battle time of the day of `time` (`settings.maxBattles.lastBattle`). */
 export function lastBattleOn(time: number, hours: BattleHours, zone: string): number {
   return clockOn(time, hours.lastBattle, zone);
````

### Task 3: 8X-S 3: party state version 15, a max battle's bossSince and screenshot

Prototype commit: `4449054087a1122851358f899f1e244bba61fd72`

A max battle keeps since when it has its boss (bossSince: when it was made,
the moment a report gave, or a /boss change) and the screenshot it was
reported from, as a raid does. Party state version 15; versions 13 and 14 read
a max battle as having its boss since its row's createdAt, without a
screenshot.

- /boss (setMaxBoss) sets bossSince to the change's moment.
- /end confirms a screenshot's guessed time, also when the end stays
  (maxTimeConfirmed).
- A raid's /end that keeps the end says so in the post too: "confirmed the
  end time" (anonymous: "The end time was confirmed"; Matt, 2026-10-23).
- A raid's /hatch that keeps the hatch time says "confirmed the hatch time"
  (anonymous: "The hatch time was confirmed"; Matt, 2026-10-23).
- The max post says an end guessed from a screenshot is a guess, naming /end
  only (UNCERTAIN_MAX_TIME), while the battle is on.
- The store keeps a max battle's screenshot while it is active
  (screenshotIdOf in shown()).
- reportMax and createMax take an optional screenshot and bossSince.

**Files:**

```
 docs/architecture/parties-and-posts.md   |  6 ++---
 docs/architecture/screenshots.md         |  2 +-
 src/app.ts                               | 14 +++++------
 src/domain/party/max.test.ts             | 91 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------
 src/domain/party/max.ts                  | 37 +++++++++++++++++++++++++----
 src/domain/party/party-state.test.ts     | 10 ++++----
 src/domain/party/party-state.ts          | 92 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------------
 src/domain/party/party.ts                | 20 ++++++++++++++++
 src/domain/party/train-kind.test.ts      |  4 ++--
 src/render/max-post.test.ts              | 22 ++++++++++++++++-
 src/render/max-post.ts                   | 15 +++++++++++-
 src/services/max-change-service.test.ts  | 47 ++++++++++++++++++++++++++++++++++++-
 src/services/max-change-service.ts       | 13 +++++++----
 src/services/party-service.max.test.ts   | 19 +++++++++++++++
 src/services/party-service.ts            | 12 ++++++++++
 src/services/raid-change-service.test.ts | 33 ++++++++++++++++++++++++++
 src/services/raid-change-service.ts      | 36 ++++++++++++++++++----------
 17 files changed, 401 insertions(+), 72 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/party/max.test.ts src/domain/party/party-state.test.ts src/domain/party/train-kind.test.ts src/render/max-post.test.ts src/services/max-change-service.test.ts src/services/party-service.max.test.ts src/services/raid-change-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4449054087a1122851358f899f1e244bba61fd72 -- docs/architecture/parties-and-posts.md docs/architecture/screenshots.md src/app.ts src/domain/party/max.test.ts src/domain/party/max.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/train-kind.test.ts src/render/max-post.test.ts src/render/max-post.ts src/services/max-change-service.test.ts src/services/max-change-service.ts src/services/party-service.max.test.ts src/services/party-service.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 3: party state version 15, a max battle's bossSince and screenshot`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 544ca6354702dc6c0dca3a599cf35f81db79b35c..d2532b7a317d48908936849481c99d66085d8aeb 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -35,8 +35,8 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 - A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
 - One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status; answered "There is already a max battle against <the battle's boss> at this spot: <post>." whatever the report named, "…: its post is being made." without a post, and on the map without the post, plan 8X-F), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the power spots that fit what is typed (`nearChoices`), and with nothing typed the region's power spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
-- How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
-- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …`, the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
+- How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax, `bossSince` set to the change's moment; `setEnd` also confirms a screenshot's guessed time, `maxTimeConfirmed`, even when the end stays, said in the post as "confirmed the end time"). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
+- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …` (under it, while it is on and its end was guessed from a screenshot, `UNCERTAIN_MAX_TIME`, which names `/end` only; a max battle's kept screenshot stays while it is active, `screenshotIdOf` in `shown()`), the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
 - A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known power spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
 
 ## Meetups and timed parties
@@ -74,7 +74,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup` (with a label, Group…), `labelGroup`; `joinChosen` and `joinStamped` (the Submits of the dialogs about groups), `lobbyOf` (a party's lobby size). Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, and the letter Join, "Join B", of a post drawn before plan 8X-1B, which still joins its letter, `joinInto`, or is refused as no such group once the letter is gone) are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`). The live map presses Remote too (plan 8X-5): `setRemote(…, 'toggle')` answered in `remoteWords`, as the post's Remote button.
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
-- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 14 (plan 8X-4: a train's `kind`, and its `route` and `finishedFrom` as stops, `StopRef`; plan 8X-3, version 13: the part `max`, a max battle's tier, boss and spot; plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; version 12 (plan 8X-1B): a group's `opened`, also kept with a `splitOff` entry; exactly the parts that fit the type must be present); versions 1 to 13 are still read (none of them before 13 a max battle; a train of them before 14 a raid train whose route and `finishedFrom` are gyms; a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another, their groups before 12 opened with the party).
+- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 15 (plan 8X-S: a max battle's `bossSince`, since when it has its boss, and its `screenshot`, as a raid's; plan 8X-4, version 14: a train's `kind`, and its `route` and `finishedFrom` as stops, `StopRef`; plan 8X-3, version 13: the part `max`, a max battle's tier, boss and spot; plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; version 12 (plan 8X-1B): a group's `opened`, also kept with a `splitOff` entry; exactly the parts that fit the type must be present); versions 1 to 14 are still read (none of them before 13 a max battle; a max battle of 13 or 14 has had its boss since it was made, the row's `createdAt`, and has no screenshot; a train of them before 14 a raid train whose route and `finishedFrom` are gyms; a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another, their groups before 12 opened with the party).
 
 ## The clock
 
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 7a6161c4bc77b47518080bda6e22c17d7f1c7557..55134c51660292a5389c99cf0659472d4b1069be 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -11,7 +11,7 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 ## The report and the decision
 
 - `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain; a CP that fits no boss takes the one boss of the heads' tier one digit off when the name read is clearly its), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). What is done with it is `decide` (below); its doubts are what the "Screenshot feedback" button shows.
-- Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed`; `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
+- Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
 - A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, a Pokémon search of what can Dynamax or Gigantamax (of every Pokémon on an Eternamax screen, `anyPokemon`: the game data lists Eternatus for no max battle) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon the game lets battle so with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old), with no ending-soon question. `withSpot(report, spot)` puts in the spot a member chose.
 
diff --git a/src/app.ts b/src/app.ts
index 2c64a8ddbf69ef4af33f31ac7083fce17085ff3a..5d00f4ff427c73f18274d341c7bb48f163405925 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -55,7 +55,7 @@ import { DiscordApplicationEmoji } from './discord/application-emoji.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
-import { isRaid } from './domain/party/party.js';
+import { screenshotIdOf } from './domain/party/party.js';
 import { formReader } from './domain/pogo/wants.js';
 import { createLogger, type Logger } from './log.js';
 import { AccessService } from './services/access-service.js';
@@ -650,14 +650,14 @@ export async function startApp(
     keepMegabytes: config.settings.ocr.keepMegabytes,
     reviewPerDay: config.settings.ocr.reviewPerDay,
     gymName: (id) => gyms.get(id)?.name,
-    // A raid's screenshot is kept while the raid is active, for its "Screenshot feedback" button.
+    // A raid's screenshot is kept while the raid is active, for its "Screenshot feedback" button;
+    // a max battle's while it lasts (plan 8X-S, review R4), or the sweep would undo `inUse`.
     shown: () =>
       new Set(
-        parties
-          .active()
-          .flatMap((party) =>
-            isRaid(party) && party.raid.screenshot?.id ? [party.raid.screenshot.id] : [],
-          ),
+        parties.active().flatMap((party) => {
+          const id = screenshotIdOf(party);
+          return id === undefined ? [] : [id];
+        }),
       ),
     log,
   });
diff --git a/src/domain/party/max.test.ts b/src/domain/party/max.test.ts
index cb143e0718b4fba4035f6e787fc230157e30fdba..ccece5b2ed4987079d7b01b8c2df013c2c71cdb8 100644
--- a/src/domain/party/max.test.ts
+++ b/src/domain/party/max.test.ts
@@ -29,7 +29,7 @@ import {
   UNLISTED_SPOT,
 } from './max.js';
 import { partyFromStored, partyState, type PartyColumns } from './party-state.js';
-import { endParty, isBattle, isTimed, type MaxParty, type Party } from './party.js';
+import { endParty, isBattle, isTimed, screenshotIdOf, type MaxParty, type Party } from './party.js';
 import { PartyStatus } from './status.js';
 import { partyTick } from './tick.js';
 
@@ -137,23 +137,71 @@ describe('its times', () => {
     expect(sooner.removed).toEqual(['A']);
     expect(setMaxEnd(battle, battle.endTime ?? 0, PARTY_NOW).party).toBe(battle);
   });
+
+  it('keeps the screenshot it was reported from, and takes an end as confirming its time', () => {
+    expect(testMax().max.screenshot).toBeNull();
+    const shot = { id: 'abcdefghijkl', timeUncertain: true };
+    const battle = testMax({ screenshot: shot });
+    expect(battle.max.screenshot).toEqual(shot);
+    // `/end` says the time is right, also when it gives the end the battle has.
+    const same = setMaxEnd(battle, battle.endTime ?? 0, PARTY_NOW);
+    expect(same.party.max.screenshot).toEqual({ id: 'abcdefghijkl', timeUncertain: false });
+    expect(same.party.endTime).toBe(battle.endTime);
+    const later = setMaxEnd(battle, at('2026-10-13T16:00'), PARTY_NOW);
+    expect(later.party.max.screenshot?.timeUncertain).toBe(false);
+  });
+
+  it('keeps its screenshot while it lasts, as a raid keeps its own', () => {
+    expect(
+      screenshotIdOf(testMax({ screenshot: { id: 'abcdefghijkl', timeUncertain: false } })),
+    ).toBe('abcdefghijkl');
+    expect(screenshotIdOf(testMax())).toBeUndefined();
+    expect(screenshotIdOf(testMax({ screenshot: { id: null, timeUncertain: true } }))).toBe(
+      undefined,
+    );
+    const raid = testRaid();
+    expect(
+      screenshotIdOf({
+        ...raid,
+        raid: { ...raid.raid, screenshot: { id: 'mnopqrstuvwx', timeUncertain: false } },
+      }),
+    ).toBe('mnopqrstuvwx');
+    expect(screenshotIdOf(testMeetup())).toBeUndefined();
+  });
 });
 
 describe('its boss', () => {
   it('follows the boss within Dynamax, the tier with it', () => {
-    const changed = setMaxBoss(testMax(), { key: 'sneasel' }, 'D1');
+    const changed = setMaxBoss(testMax(), { key: 'sneasel' }, 'D1', PARTY_NOW);
     expect(changed).toMatchObject({ ok: true, changed: true });
     expect(changed.party?.max).toMatchObject({ boss: { key: 'sneasel' }, tier: 'D1' });
-    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'D2')).toMatchObject({ changed: false });
+    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'D2', PARTY_NOW)).toMatchObject({
+      changed: false,
+    });
+  });
+
+  it('keeps since when it has its boss: from its making, or the moment a report gave', () => {
+    expect(testMax().max.bossSince).toBe(PARTY_NOW);
+    expect(testMax({ bossSince: PARTY_NOW - 5 * MINUTE }).max.bossSince).toBe(
+      PARTY_NOW - 5 * MINUTE,
+    );
+    const later = PARTY_NOW + 10 * MINUTE;
+    const changed = setMaxBoss(testMax(), { key: 'sneasel' }, 'D1', later);
+    expect(changed.party?.max.bossSince).toBe(later);
+    // The same boss again is no change: it has had it since before.
+    const same = testMax();
+    expect(setMaxBoss(same, { key: 'machamp' }, 'D2', later).party).toBe(same);
   });
 
   it('never goes between Dynamax and Gigantamax', () => {
-    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'G')).toEqual({
+    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'G', PARTY_NOW)).toEqual({
       ok: false,
       reason: 'max-kind-change',
     });
     const giga = testMax({ tier: 'G' });
-    expect(setMaxBoss(giga, { key: 'sneasel' }, 'D1')).toMatchObject({ reason: 'max-kind-change' });
+    expect(setMaxBoss(giga, { key: 'sneasel' }, 'D1', PARTY_NOW)).toMatchObject({
+      reason: 'max-kind-change',
+    });
   });
 });
 
@@ -187,11 +235,18 @@ describe('its clock (maxTick)', () => {
   });
 });
 
-describe('the state of a max battle (version 13)', () => {
+describe('the state of a max battle (version 13, and 15)', () => {
   const full = (): MaxParty => ({
-    ...withAttendees(testMax({ anonymous: true }), {
-      [ALICE]: { status: Present, number: 2, remote: true, name: 'Alice', team: 'mystic' },
-    }),
+    ...withAttendees(
+      testMax({
+        anonymous: true,
+        bossSince: PARTY_NOW - 3 * MINUTE,
+        screenshot: { id: 'abcdefghijkl', timeUncertain: true },
+      }),
+      {
+        [ALICE]: { status: Present, number: 2, remote: true, name: 'Alice', team: 'mystic' },
+      },
+    ),
     groups: [
       { id: 'A' },
       { id: 'B', opened: PARTY_NOW + MINUTE, startTime: PARTY_NOW + 30 * MINUTE },
@@ -201,7 +256,7 @@ describe('the state of a max battle (version 13)', () => {
 
   it('comes back from storage exactly as it went in, at a power spot and at a pin', () => {
     const battle = full();
-    expect(partyState(battle)).toMatchObject({ v: 14, max: battle.max });
+    expect(partyState(battle)).toMatchObject({ v: 15, max: battle.max });
     expect(partyFromStored(columnsOf(battle), stored(partyState(battle)), [])).toEqual({
       ok: true,
       party: battle,
@@ -213,6 +268,22 @@ describe('the state of a max battle (version 13)', () => {
     });
   });
 
+  it('reads a document of versions 13 and 14 as having its boss since it was made, and no screenshot', () => {
+    const battle = full();
+    const { bossSince: _since, screenshot: _shot, ...older } = battle.max;
+    for (const v of [13, 14]) {
+      const state = { ...(stored(partyState(battle)) as object), v, max: stored(older) };
+      expect(partyFromStored(columnsOf(battle), state, [])).toEqual({
+        ok: true,
+        party: { ...battle, max: { ...battle.max, bossSince: battle.createdAt, screenshot: null } },
+      });
+    }
+    // Version 15 needs both.
+    const state = stored(partyState(battle)) as Record<string, unknown>;
+    const read = partyFromStored(columnsOf(battle), { ...state, max: stored(older) }, []);
+    expect(read.ok ? 'read' : read.problem).toMatch(/^state: /);
+  });
+
   it('refuses a max battle at a gym or a PokéStop, of an unknown tier, or of a document before 13', () => {
     const battle = full();
     const state = stored(partyState(battle)) as Record<string, unknown>;
diff --git a/src/domain/party/max.ts b/src/domain/party/max.ts
index 2f8e120511fd8cf9094cace0a36ba8c1babe0d00..993147d17235fa6c3e195a0cb8159cebd5792d92 100644
--- a/src/domain/party/max.ts
+++ b/src/domain/party/max.ts
@@ -11,6 +11,7 @@ import {
   type MaxParty,
   type MaxSpot,
   type RaidBossRef,
+  type RaidScreenshot,
 } from './party.js';
 import { PartyStatus } from './status.js';
 
@@ -33,6 +34,10 @@ export interface NewMax {
   /** When it ends: the default end of its tier and event, or the end the report gave. */
   endTime: number;
   now: number;
+  /** Since when it has its boss (`MaxDetails.bossSince`): a screenshot's sure moment; else `now`. */
+  bossSince?: number;
+  /** The screenshot it was reported from (`MaxDetails.screenshot`); none when left out. */
+  screenshot?: RaidScreenshot | null;
 }
 
 /**
@@ -112,7 +117,13 @@ export function createMax(input: NewMax): MaxParty {
     groups: [{ id: 'A' }],
     defaultGroupId: 'A',
     prompts: NO_PROMPTS,
-    max: { tier: input.tier, boss, spot: input.spot },
+    max: {
+      tier: input.tier,
+      boss,
+      spot: input.spot,
+      bossSince: input.bossSince ?? now,
+      screenshot: input.screenshot ? { ...input.screenshot } : null,
+    },
   };
   return withLastPossibleTime(party, endTime, now);
 }
@@ -121,6 +132,8 @@ export function createMax(input: NewMax): MaxParty {
  * Sets when the max battle ends (`/end`), floored to the minute; the caller has checked the time
  * (within the day, never past the last battle time). The very same party when nothing changes. A
  * meeting time after the new end is removed (`removed`): the group would meet after the battle.
+ * An end given confirms a screenshot's guessed time, also when it is the end the battle has
+ * (`maxTimeConfirmed`, as a raid's `/end`).
  */
 export function setMaxEnd(
   party: MaxParty,
@@ -128,7 +141,8 @@ export function setMaxEnd(
   now: number,
 ): { party: MaxParty; removed: string[] } {
   const endTime = minute(time);
-  if (endTime === party.endTime) return { party, removed: [] };
+  if (endTime === party.endTime) return { party: maxTimeConfirmed(party), removed: [] };
+  party = maxTimeConfirmed(party);
   const removed: string[] = [];
   const groups = party.groups.map((group) => {
     if (group.startTime === undefined || group.startTime <= endTime) return group;
@@ -139,22 +153,35 @@ export function setMaxEnd(
   return { party: withLastPossibleTime({ ...party, endTime, groups }, endTime, now), removed };
 }
 
+/** The battle with its screenshot's time no longer a guess (`/end`); the same one if it was not. */
+export function maxTimeConfirmed(party: MaxParty): MaxParty {
+  const { screenshot } = party.max;
+  if (!screenshot?.timeUncertain) return party;
+  return { ...party, max: { ...party.max, screenshot: { ...screenshot, timeUncertain: false } } };
+}
+
 /**
  * Sets the boss of a max battle (`/boss`, a rotation within an event; design 3.1): the tier
- * follows the boss; a change between Dynamax and Gigantamax is refused (`max-kind-change`: the
- * lobby size would jump; report anew). `changed` is false when boss and tier are what they were.
+ * follows the boss, and it has the boss since `since` (`MaxDetails.bossSince`); a change between
+ * Dynamax and Gigantamax is refused (`max-kind-change`: the lobby size would jump; report anew).
+ * `changed` is false when boss and tier are what they were.
  */
 export function setMaxBoss(
   party: MaxParty,
   boss: RaidBossRef,
   tier: MaxTier,
+  since: number,
 ): Change<MaxParty, { changed: boolean }> {
   if (battleKindOf(tier) !== battleKindOf(party.max.tier)) return refused('max-kind-change');
   if (sameBoss(party.max.boss, boss) && party.max.tier === tier) {
     return { ok: true, party, changed: false };
   }
   const ref: RaidBossRef = 'key' in boss ? { key: boss.key } : { name: boss.name };
-  return { ok: true, party: { ...party, max: { ...party.max, boss: ref, tier } }, changed: true };
+  return {
+    ok: true,
+    party: { ...party, max: { ...party.max, boss: ref, tier, bossSince: since } },
+    changed: true,
+  };
 }
 
 /** What a pin of a max battle is called (design 3.2, Q7): a power spot Pine does not know. */
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index 6a50d84d7dff5e347787b700f76958ee8788d9b6..78a33f5325f09f78e74682ba08575fbbae5f8642 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -190,7 +190,7 @@ describe('party state', () => {
       party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
     });
     // Nothing was added to the document for it: the version is what it was.
-    expect(document.v).toBe(14);
+    expect(document.v).toBe(15);
     // There were no shadow EX raids, and there are no shadow elite raids: still refused.
     const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
     expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
@@ -205,7 +205,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(14);
+    expect(state.v).toBe(15);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -266,7 +266,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 15 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 16 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -1017,7 +1017,7 @@ describe('the state of a train', () => {
         ],
       },
     };
-    expect(partyState(split).v).toBe(14);
+    expect(partyState(split).v).toBe(15);
     expect(partyFromStored(columnsOf(split), stored(partyState(split)), [])).toEqual({
       ok: true,
       party: split,
@@ -1091,7 +1091,7 @@ describe('the state of a train', () => {
       attendees: {},
       mirrorMessages: [],
     };
-    expect(partyState(raid).v).toBe(14);
+    expect(partyState(raid).v).toBe(15);
     expect(partyFromStored(columnsOf(raid), stored(partyState(raid)), [])).toEqual({
       ok: true,
       party: raid,
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index c6fa32ac8f52d0774d90c74eb54aa6f7615123ca..f13ae6e5af9aafb3ccc92d84773d7dcd3c689717 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -56,11 +56,13 @@ import { gymStop, stopKey, type StopRef } from './stops.js';
  * (plan 8X-3) added `max` (a max battle's tier, boss and spot), the details of a fourth kind of
  * party; a document of an earlier version is never one of a max battle. Version 14 (plan 8X-4)
  * added a train's `kind` (raid, Dynamax, Gigantamax); a train of an earlier document is a raid
- * train.
+ * train. Version 15 (plan 8X-S) added a max battle's `bossSince` (since when it has its boss)
+ * and `screenshot` (as a raid's); a max battle of an earlier document has had its boss since it
+ * was made (its row's `createdAt`) and has no screenshot.
  * Documents of versions 1 to 3 are those of raids, and one of version 4 is that of a raid or a
  * meetup.
  */
-export const PARTY_STATE_VERSION = 14;
+export const PARTY_STATE_VERSION = 15;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -143,17 +145,18 @@ const raidV7 = z.object({
   stageSeen: z.enum(['egg', 'hatched', 'ended']),
 });
 
-const raid = raidV7.extend({
-  screenshot: z
-    .object({
-      id: z
-        .string()
-        .regex(/^[A-Za-z0-9_-]{12}$/)
-        .nullable(),
-      timeUncertain: z.boolean(),
-    })
-    .nullable(),
-});
+/** The screenshot a raid (version 8) or a max battle (version 15) was reported from. */
+const screenshot = z
+  .object({
+    id: z
+      .string()
+      .regex(/^[A-Za-z0-9_-]{12}$/)
+      .nullable(),
+    timeUncertain: z.boolean(),
+  })
+  .nullable();
+
+const raid = raidV7.extend({ screenshot });
 
 const timed = z.object({
   name: z.string().min(1).max(MAX_PARTY_NAME),
@@ -200,7 +203,7 @@ const meetup = meetupV9.extend({
  * A max battle's details (version 13): its tier, its boss (always known) and its spot, a power
  * spot as it was named or a pin (`MaxSpot`): a known place of another kind is none.
  */
-const max = z.object({
+const maxV14 = z.object({
   tier: z.enum(MAX_TIERS),
   boss: bossRef,
   spot: placeDocument.refine((spot) => spot.kind === 'pin' || spot.kind === 'powerspot', {
@@ -208,6 +211,12 @@ const max = z.object({
   }),
 });
 
+/**
+ * A max battle's details of version 15 (plan 8X-S): since when it has its boss, and the
+ * screenshot it was reported from.
+ */
+const max = maxV14.extend({ bossSince: time, screenshot });
+
 const gymId = z.number().int().positive();
 
 /**
@@ -410,6 +419,28 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/**
+ * Version 14, as plans 8X-4 to 8R-4 wrote it: read only. It is version 15 without a max battle's
+ * `bossSince` and `screenshot`.
+ */
+const stateV14 = z
+  .object({
+    v: z.literal(14),
+    ...shared,
+    groups: z.array(group).min(1).max(GROUP_IDS.length),
+    raid: raid.optional(),
+    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    train: train.optional(),
+    max: maxV14.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 13, as plans 8X-3 and 8X-6 wrote it: read only. It is version 14 without a train's kind. */
 const stateV13 = z
   .object({
@@ -421,7 +452,7 @@ const stateV13 = z
     timed: timed.optional(),
     meetup: meetup.optional(),
     train: trainV13.optional(),
-    max: max.optional(),
+    max: maxV14.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
   })
@@ -652,16 +683,37 @@ function withKind<T extends { train?: z.output<typeof trainV13> | undefined }>(o
 }
 
 /**
- * Reads a stored document of any version this code knows, as the current version. A document
- * before version 13 is never a max battle's; a train of one before version 14 is a raid train.
+ * A max battle of a document before version 15 has had its boss since it was made (`createdAt`,
+ * a column of its row), and was reported from no screenshot.
+ */
+function withBossSince<T extends { max?: z.output<typeof maxV14> | undefined }>(
+  old: T,
+  createdAt: number,
+) {
+  return old.max ? { ...old, max: { ...old.max, bossSince: createdAt, screenshot: null } } : old;
+}
+
+/**
+ * Reads a stored document of any version this code knows, as the current version; `createdAt`
+ * is the party's own (its row's), which a max battle of a document before version 15 has had its
+ * boss since. A document before version 13 is never a max battle's; a train of one before
+ * version 14 is a raid train.
  */
-function readState(stored: unknown) {
+function readState(stored: unknown, createdAt: number) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
   if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
+  const older = readStateV14(stored, version);
+  if (!older.success) return older;
+  return state.safeParse({ ...withBossSince(older.data, createdAt), v: PARTY_STATE_VERSION });
+}
+
+/** Reads a document of versions 1 to 14, upgraded to the shape of version 14. */
+function readStateV14(stored: unknown, version: unknown) {
+  if (version === 14) return stateV14.safeParse(stored);
   const older = readStateV13(stored, version);
   if (!older.success) return older;
-  return state.safeParse({ ...withKind(older.data), v: PARTY_STATE_VERSION });
+  return stateV14.safeParse({ ...withKind(older.data), v: 14 });
 }
 
 /** Reads a document of versions 1 to 13, upgraded to the shape of version 13. */
@@ -860,7 +912,7 @@ export function partyFromStored(
   const fail = (problem: string): StoredParty => ({ ok: false, id: columns.id, problem });
   const { type } = columns;
   if (!isPartyType(type)) return fail(`a party of type "${type}"`);
-  const parsed = readState(storedState);
+  const parsed = readState(storedState, columns.createdAt);
   if (!parsed.success) return fail(`state: ${z.prettifyError(parsed.error)}`);
   const mirrorMessages = mirrors.safeParse(storedMirrors);
   if (!mirrorMessages.success)
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 91448fb41a6c8440aa78a637af2ec76493d79668..17bf7f6c5b7818d84d2f850a9edb3b72b0677a90 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -477,6 +477,17 @@ export interface MaxDetails {
   /** Always known: there is no egg (design 1). */
   boss: RaidBossRef;
   spot: MaxSpot;
+  /**
+   * Since when it has its boss (plan 8X-S, state version 15): when it was made, or the moment of
+   * the screenshot it was made from when that moment is sure; when `/boss` changed it, or a
+   * clearly newer screenshot. A screenshot of another boss changes it only when taken after this.
+   */
+  bossSince: number;
+  /**
+   * The screenshot it was reported from, as a raid's (`RaidDetails.screenshot`): kept while it
+   * lasts; `timeUncertain` says the end is a guess, until `/end` sets it.
+   */
+  screenshot: RaidScreenshot | null;
 }
 
 /**
@@ -530,6 +541,15 @@ export function isMax(party: Party): party is MaxParty {
   return party.type === 'max';
 }
 
+/**
+ * The kept screenshot a party was reported from (a raid's or a max battle's), which the store
+ * keeps while the party is active (`ScreenshotStore`'s `shown`); undefined for none.
+ */
+export function screenshotIdOf(party: Party): string | undefined {
+  const shot = isRaid(party) ? party.raid.screenshot : isMax(party) ? party.max.screenshot : null;
+  return shot?.id ?? undefined;
+}
+
 export function isMeetup(party: Party): party is MeetupParty {
   return party.type === 'meetup';
 }
diff --git a/src/domain/party/train-kind.test.ts b/src/domain/party/train-kind.test.ts
index 90bfaf74c2249782c0ed98405b97f9851a93a4e2..ef1a73909416dbe1a5b7a3b124fd7ce15cf4988e 100644
--- a/src/domain/party/train-kind.test.ts
+++ b/src/domain/party/train-kind.test.ts
@@ -100,11 +100,11 @@ describe('the kind of a train (plan 8X-4; design 6.1)', () => {
     expect(splitLobby(ofKind('gigantamax'), DEFAULT_LOBBIES)).toBeUndefined();
   });
 
-  it('is kept in the state document (version 14), and a train of an older one is a raid train', () => {
+  it('is kept in the state document (since version 14), and a train of an older one is a raid train', () => {
     const train = ofKind('dynamax');
     const columns = columnsOf(train);
     const state = partyState(train);
-    expect(state.v).toBe(14);
+    expect(state.v).toBe(15);
     expect(state.train?.kind).toBe('dynamax');
     const stored = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
     expect(partyFromStored(columns, stored, [])).toEqual({ ok: true, party: train });
diff --git a/src/render/max-post.test.ts b/src/render/max-post.test.ts
index cf0ac77e52c795a92343443220f4daaa27d6578c..7a2410b423720e68c7fa8a13ad88f3ed9e778c94 100644
--- a/src/render/max-post.test.ts
+++ b/src/render/max-post.test.ts
@@ -24,7 +24,14 @@ import { expectSendable } from '../../test/support/post-limits.js';
 import { keptRow } from '../../test/support/wayspot-cases.js';
 import { endParty, type MaxParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { maxLook, maxTags, maxTitle, renderMaxPost, type MaxPostView } from './max-post.js';
+import {
+  maxLook,
+  maxTags,
+  maxTitle,
+  renderMaxPost,
+  UNCERTAIN_MAX_TIME,
+  type MaxPostView,
+} from './max-post.js';
 import { ENDED_COLOUR, KEPT_OPEN } from './party-post.js';
 import { renderRegionLink } from './summary.js';
 
@@ -86,6 +93,19 @@ describe('renderMaxPost: the heading (design 3.3)', () => {
     expect(post(testMax()).tags).toEqual(['Max battle']);
   });
 
+  it('says that an end from a screenshot is a guess, naming /end alone, until it is over', () => {
+    const guessed = testMax({ screenshot: { id: 'abcdefghijkl', timeUncertain: true } });
+    const lines = textDisplays(post(guessed).message)[0]?.split('\n') ?? [];
+    expect(lines[1]).toBe(`Until ${stamp(END)} (${stamp(END, 'R')}).`);
+    expect(lines[2]).toBe(UNCERTAIN_MAX_TIME);
+    expect(UNCERTAIN_MAX_TIME).toContain('`/end`');
+    expect(UNCERTAIN_MAX_TIME).not.toContain('/hatch');
+    // Confirmed, or over: not said.
+    const sure = testMax({ screenshot: { id: 'abcdefghijkl', timeUncertain: false } });
+    expect(textOf(post(sure).message)).not.toContain(UNCERTAIN_MAX_TIME);
+    expect(textOf(post(guessed, { now: END }).message)).not.toContain(UNCERTAIN_MAX_TIME);
+  });
+
   it('says why when staff closed it, and that a moderator keeps it open', () => {
     const closed = post(testMax(), { closed: 'Closed by a moderator.' });
     expect(textDisplays(closed.message)[0]?.split('\n')[1]).toBe('Closed by a moderator.');
diff --git a/src/render/max-post.ts b/src/render/max-post.ts
index 5fdc19c1a89b3db73ef69714d7626d2fd39bb2fd..77a7ac73a8bfa1626ca02dfdebe3f798a2d24810 100644
--- a/src/render/max-post.ts
+++ b/src/render/max-post.ts
@@ -146,6 +146,19 @@ function timesOf(view: MaxPostView): string {
     : `Until ${timestamp(end)} (${timestamp(end, 'R')}).`;
 }
 
+/**
+ * What the post says under the end of a max battle whose end was guessed from a screenshot (as
+ * a raid's `UNCERTAIN_TIME`; only `/end` sets a max battle's time, review R14).
+ */
+export const UNCERTAIN_MAX_TIME =
+  'This end is a guess from the screenshot (no clock on it, or taken a while before it was posted). `/end` sets it right.';
+
+/** The end, and under it that it is a guess while the battle is on (`UNCERTAIN_MAX_TIME`). */
+function describeEnd(view: MaxPostView): string[] {
+  const uncertain = view.party.max.screenshot?.timeUncertain === true && !shownOver(view);
+  return [timesOf(view), ...(uncertain ? [UNCERTAIN_MAX_TIME] : [])];
+}
+
 /** The lines about the boss: its types and what it is weak to (no catch CP, no moves). */
 function bossLines(view: MaxPostView): string[] {
   const { entry } = view.boss;
@@ -225,7 +238,7 @@ function maxLayout(view: MaxPostView): PostLayout {
   const shiny = boss.shiny ? ` ${view.emoji.shiny}` : '';
   const header = [
     `### ${plain(what(view))}${shiny}`,
-    timesOf(view),
+    ...describeEnd(view),
     // Not in the last showing of one that was closed: that post is archived.
     ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
     ...bossLines(view),
diff --git a/src/services/max-change-service.test.ts b/src/services/max-change-service.test.ts
index 22420cd78d66a056febd5f66434222642fbeba76..4d5575663055404c721140487c8a686bc1059de7 100644
--- a/src/services/max-change-service.test.ts
+++ b/src/services/max-change-service.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { at, PARTY_NOW, REPORTER, TEST_SPOT, testMax } from '../../test/support/parties.js';
+import { asMax, at, PARTY_NOW, REPORTER, TEST_SPOT, testMax } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { blocksNewMax, sameSpot } from '../domain/party/max.js';
 import { isMax } from '../domain/party/party.js';
@@ -71,4 +71,49 @@ describe('MaxChangeService (plan 8X-3)', () => {
       `**Rita** (<@${REPORTER}>) set the end time: <t:${at('2026-10-13T15:00') / 1000}:t>.`,
     ]);
   });
+
+  it('takes an end as confirming a screenshot’s guessed time, also the end it already has', async () => {
+    const battle = testMax({ id: ID(1), screenshot: { id: 'abcdefghijkl', timeUncertain: true } });
+    const made = await partyServiceWith([battle]);
+    const outcome = await made.maxes.setEnd(ID(1), { id: REPORTER }, battle.endTime ?? 0);
+    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
+    expect(asMax(made.store.get(ID(1))).max.screenshot).toEqual({
+      id: 'abcdefghijkl',
+      timeUncertain: false,
+    });
+  });
+
+  it('says an end that stays was confirmed, not set, by name or for an anonymous reporter', async () => {
+    const end = at('2026-10-13T21:00');
+    const lines = async (anonymous: boolean) => {
+      const battle = testMax({
+        id: ID(1),
+        anonymous,
+        screenshot: { id: 'abcdefghijkl', timeUncertain: true },
+      });
+      const made = await partyServiceWith([{ ...battle, forumPostId: '300000000000000201' }]);
+      await made.maxes.setEnd(ID(1), { id: REPORTER, name: 'Rita' }, end);
+      await made.attendance.flush();
+      return made.gateway.messagesIn('300000000000000201').map((m) => m.message.content);
+    };
+    expect(await lines(false)).toEqual([
+      `**Rita** (<@${REPORTER}>) confirmed the end time: <t:${end / 1000}:t>.`,
+    ]);
+    expect(await lines(true)).toEqual([`The end time was confirmed: <t:${end / 1000}:t>.`]);
+  });
+
+  it('notes since when the battle has the boss /boss gave it', async () => {
+    const made = await partyServiceWith(
+      [testMax({ id: ID(1) })],
+      {},
+      { clock: { now: PARTY_NOW + 20 * 60_000 } },
+    );
+    const outcome = await made.maxes.setBoss(
+      ID(1),
+      { id: REPORTER },
+      { boss: { key: 'sneasel' }, tier: 'D1', label: 'Dynamax Sneasel (1★)' },
+    );
+    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
+    expect(asMax(made.store.get(ID(1))).max.bossSince).toBe(PARTY_NOW + 20 * 60_000);
+  });
 });
diff --git a/src/services/max-change-service.ts b/src/services/max-change-service.ts
index d9a343735479fd1cc43d6adb20ebde56907b2fa6..aa9976cc7eef0eafc6ecaccfea902bfc1b3a67ec 100644
--- a/src/services/max-change-service.ts
+++ b/src/services/max-change-service.ts
@@ -64,13 +64,15 @@ export class MaxChangeService {
 
   /**
    * When the battle ends; the caller has checked the time (within the day, never past the last
-   * battle time: `typedMaxTime`). A meeting time after it is cancelled, said in the post.
+   * battle time: `typedMaxTime`). A meeting time after it is cancelled, said in the post. The
+   * end it has already only confirms a screenshot's guessed time: said as confirmed (review A7).
    */
   async setEnd(partyId: string, member: Member, time: number): Promise<MaxChangeOutcome> {
     const { store } = this.options;
     const before = store.get(partyId);
     if (!before || !isMax(before)) return { kind: 'gone' };
     let removed: string[] = [];
+    let confirmed = false;
     return store.withSpotLock(before.max.spot, () =>
       this.apply(
         partyId,
@@ -78,6 +80,7 @@ export class MaxChangeService {
         (party, now) => {
           const set = setMaxEnd(party, time, now);
           removed = set.removed;
+          confirmed = set.party.endTime === party.endTime;
           if (set.party === party) return { ok: true, party };
           const other = this.inTheWay(party, set.party, now);
           return other ? { ...refused('spot-taken'), other } : { ok: true, party: set.party };
@@ -86,7 +89,9 @@ export class MaxChangeService {
           ...(party.endTime === null
             ? []
             : [
-                said(party, member, 'set the end time', 'The end time was set') +
+                (confirmed
+                  ? said(party, member, 'confirmed the end time', 'The end time was confirmed')
+                  : said(party, member, 'set the end time', 'The end time was set')) +
                   `: ${timestamp(party.endTime)}.`,
               ]),
           ...removed.map(
@@ -112,8 +117,8 @@ export class MaxChangeService {
     return this.apply(
       partyId,
       member,
-      (party) => {
-        const set = setMaxBoss(party, change.boss, change.tier);
+      (party, now) => {
+        const set = setMaxBoss(party, change.boss, change.tier, now);
         return set.ok ? { ok: true, party: set.party } : set;
       },
       (party) => [
diff --git a/src/services/party-service.max.test.ts b/src/services/party-service.max.test.ts
index 167a4f7e9b1bdb50270480ec417b2e92b40473ec..19f7c5693e284a5a3dc1864ec92427d895da30a0 100644
--- a/src/services/party-service.max.test.ts
+++ b/src/services/party-service.max.test.ts
@@ -45,6 +45,25 @@ describe('PartyService.reportMax (plan 8X-3)', () => {
     expect(made.current()).toMatchObject({ endTime: END, regionId: 1 });
   });
 
+  it('keeps the screenshot a battle was reported from, and since when it has its boss', async () => {
+    const made = await partyServiceWith();
+    const since = at('2026-10-13T13:58');
+    const outcome = await made.service.reportMax(
+      report({ screenshot: { id: 'abcdefghijkl', timeUncertain: true }, bossSince: since }),
+    );
+    expect(outcome).toMatchObject({ kind: 'created' });
+    expect(asMax(made.store.active()[0]).max).toMatchObject({
+      bossSince: since,
+      screenshot: { id: 'abcdefghijkl', timeUncertain: true },
+    });
+    // Without them: since it was made, and no screenshot.
+    const plain = await reportedMax();
+    expect(plain.current().max).toMatchObject({
+      bossSince: plain.current().createdAt,
+      screenshot: null,
+    });
+  });
+
   it('signs a second reporter of the same boss up for the battle there', async () => {
     const made = await reportedMax();
     const again = await made.service.reportMax(
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 377e619ebb100eb86ee640f8acaf2d326e9e0c62..5c8751dec1ca22fc02436303708c0507543a105f 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -264,6 +264,16 @@ export interface MaxReport {
    * gets none (`pin-blocked`) while the battle there may still be joined. Left out: they may.
    */
   mayCreateAtPin?: () => Promise<boolean>;
+  /**
+   * The screenshot the battle was reported from (plan 8X-S), kept in a new battle as a raid's
+   * (`MaxDetails.screenshot`); a battle joined is not changed by it.
+   */
+  screenshot?: RaidScreenshot;
+  /**
+   * Since when a new battle has its boss (`MaxDetails.bossSince`): a screenshot's sure moment
+   * (review R10). Left out: when it is made.
+   */
+  bossSince?: number;
 }
 
 /** What `reportMax` decided inside the store about the battle a report joins (review B, B2). */
@@ -1008,6 +1018,8 @@ export class PartyService {
       spot: report.spot,
       endTime: report.endTime,
       now,
+      ...(report.bossSince === undefined ? {} : { bossSince: report.bossSince }),
+      ...(report.screenshot ? { screenshot: report.screenshot } : {}),
     });
     battle = noteMember(battle, report.reporterId, report.reporter ?? {});
     // The view does not depend on the stored row, so a renderer that fails stores nothing.
diff --git a/src/services/raid-change-service.test.ts b/src/services/raid-change-service.test.ts
index 6db092d3bca80de5eb451e40c68920f07466f4b4..0a6687e54fcc4d0b13205f01d3a285b9199ef1af 100644
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -99,6 +99,39 @@ describe('RaidChangeService: times', () => {
     ]);
   });
 
+  it('says an end that stays was confirmed, not set, by name or for an anonymous reporter', async () => {
+    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
+    // Named by name when the raid is not anonymous; the anonymous reporter confirms unnamed.
+    const confirming = async (anonymous: boolean) => {
+      const made = await reportedRaid({ time: { hatch: HATCH }, screenshot, anonymous });
+      expect(made.current()).toMatchObject({ endTime: END });
+      const who = anonymous ? { id: REPORTER, name: 'Rhea' } : alice;
+      await made.raids.setEndTime(made.party.id, who, END);
+      return lines(made);
+    };
+    expect(await confirming(false)).toEqual([
+      `**Alice** (<@${ALICE}>) confirmed the end time: <t:${END / 1000}:t>.`,
+    ]);
+    expect(await confirming(true)).toEqual([`The end time was confirmed: <t:${END / 1000}:t>.`]);
+  });
+
+  it('says a hatch time that stays was confirmed, not set, by name or for an anonymous reporter', async () => {
+    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
+    const confirming = async (anonymous: boolean) => {
+      const made = await reportedRaid({ time: { hatch: HATCH }, screenshot, anonymous });
+      expect(made.current()).toMatchObject({ hatchTime: HATCH });
+      const who = anonymous ? { id: REPORTER, name: 'Rhea' } : alice;
+      await made.raids.setHatchTime(made.party.id, who, HATCH);
+      return lines(made);
+    };
+    expect(await confirming(false)).toEqual([
+      `**Alice** (<@${ALICE}>) confirmed the hatch time: <t:${HATCH / 1000}:t>.`,
+    ]);
+    expect(await confirming(true)).toEqual([
+      `The hatch time was confirmed: <t:${HATCH / 1000}:t>.`,
+    ]);
+  });
+
   it('makes a time guessed from a screenshot sure by a time set, also the same, not by a length', async () => {
     const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
     const made = await reportedRaid({ time: { hatch: HATCH }, screenshot });
diff --git a/src/services/raid-change-service.ts b/src/services/raid-change-service.ts
index a13e8563fa056100443beba77648a5adc041f746..fd74bb474676988324e4280dd8e66d27b18c4866 100644
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -161,37 +161,49 @@ export class RaidChangeService {
 
   /**
    * When the egg hatches (or hatched); the end follows. The caller has checked the time. A time
-   * guessed from a screenshot is then no guess (also for the end).
+   * guessed from a screenshot is then no guess (also for the end); a hatch time that stays only
+   * confirms it, and the post says so.
    */
   setHatchTime(partyId: string, member: Member, time: number): Promise<RaidChangeOutcome> {
+    let confirmed = false;
     return this.apply(
       partyId,
       member,
-      (party, rules, now) => ({
-        ok: true,
-        party: unlessSame(party, setHatchTime(timeConfirmed(party), time, rules, now)),
-      }),
+      (party, rules, now) => {
+        const set = setHatchTime(timeConfirmed(party), time, rules, now);
+        confirmed = set.hatchTime === party.hatchTime;
+        return { ok: true, party: unlessSame(party, set) };
+      },
       (party) =>
         party.hatchTime === null
           ? undefined
-          : said(party, member, 'set the hatch time', 'The hatch time was set') +
+          : (confirmed
+              ? said(party, member, 'confirmed the hatch time', 'The hatch time was confirmed')
+              : said(party, member, 'set the hatch time', 'The hatch time was set')) +
             `: ${this.when(party.hatchTime)}.`,
     );
   }
 
-  /** When the raid ends; the hatch time follows. The caller has checked the time. */
+  /**
+   * When the raid ends; the hatch time follows. The caller has checked the time. An end that
+   * stays only confirms a time guessed from a screenshot, and the post says so.
+   */
   setEndTime(partyId: string, member: Member, time: number): Promise<RaidChangeOutcome> {
+    let confirmed = false;
     return this.apply(
       partyId,
       member,
-      (party, rules, now) => ({
-        ok: true,
-        party: unlessSame(party, setEndTime(timeConfirmed(party), time, rules, now)),
-      }),
+      (party, rules, now) => {
+        const set = setEndTime(timeConfirmed(party), time, rules, now);
+        confirmed = set.endTime === party.endTime;
+        return { ok: true, party: unlessSame(party, set) };
+      },
       (party) =>
         party.endTime === null
           ? undefined
-          : said(party, member, 'set the end time', 'The end time was set') +
+          : (confirmed
+              ? said(party, member, 'confirmed the end time', 'The end time was confirmed')
+              : said(party, member, 'set the end time', 'The end time was set')) +
             `: ${this.when(party.endTime)}.`,
     );
   }
````

### Task 4: 8X-S 4: a battle already at the spot

Prototype commit: `1ea33e31956a46b2510d22c31f75ab0b8d8cf0ab`

A screenshot of a max battle whose spot holds a battle already is decided in
one change of the store (design 6, review R2, Matt's answers of 2026-10-22):

- screenshotAtBattle (domain/party/max.ts, pure): the same boss and tier
  joins, its end moved only later and only on a clean read (a sure moment
  and a countdown that ends at a rotation), the screenshot then the post's;
  another boss of the kind on a sure moment newer than bossSince changes
  boss, tier and end together, bossSince the moment, meeting times after the
  new end cancelled (R3); another boss otherwise is refused (max-other-boss),
  the other kind always (max-kind-change, no /boss hint).
- MaxChangeService.fromScreenshot runs it through apply: the member signed
  up by their automatic status in a group of the lobby size (new option
  lobbySize), the lines "set the end time from a screenshot" and "Boss
  changed to <boss> from a screenshot by <member>, until <end>." (doer: an
  anonymous reporter unnamed), the notifier told as for /boss; a battle whose
  end came meanwhile is gone.
- reportMaxShotAs (commands/max/max-shot.ts), what mentions and
  /max screenshot: will share: the end checked against the clock first
  (R11: over-for-today for an end capped at the last battle, else
  battle-over), the battle at the spot looked at (maxAt), mayJoin asked
  before the change, a free or freed spot reported once through reportMaxAs
  with the screenshot and, on a sure moment, the boss since then (R10).

**Files:**

```
 docs/architecture/parties-and-posts.md  |   2 +-
 src/app.ts                              |   2 +
 src/commands/max/max-report.ts          |  13 ++++-
 src/commands/max/max-shot.test.ts       | 201 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/max/max-shot.ts            | 120 +++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/max.test.ts            | 128 ++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/max.ts                 |  95 ++++++++++++++++++++++++++++++++++
 src/domain/party/party.ts               |   5 ++
 src/render/activity.ts                  |   2 +
 src/services/max-change-service.test.ts | 177 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/max-change-service.ts      | 124 +++++++++++++++++++++++++++++++++++++++++---
 test/support/party-service.ts           |  12 ++++-
 12 files changed, 869 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/max-shot.test.ts src/domain/party/max.test.ts src/services/max-change-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1ea33e31956a46b2510d22c31f75ab0b8d8cf0ab -- docs/architecture/parties-and-posts.md src/app.ts src/commands/max/max-report.ts src/commands/max/max-shot.test.ts src/commands/max/max-shot.ts src/domain/party/max.test.ts src/domain/party/max.ts src/domain/party/party.ts src/render/activity.ts src/services/max-change-service.test.ts src/services/max-change-service.ts test/support/party-service.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 4: a battle already at the spot`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index d2532b7a317d48908936849481c99d66085d8aeb..e52e68662568f57bdfc60dd125764f0209356847 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -35,7 +35,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 - A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
 - One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status; answered "There is already a max battle against <the battle's boss> at this spot: <post>." whatever the report named, "…: its post is being made." without a post, and on the map without the post, plan 8X-F), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the power spots that fit what is typed (`nearChoices`), and with nothing typed the region's power spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
-- How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax, `bossSince` set to the change's moment; `setEnd` also confirms a screenshot's guessed time, `maxTimeConfirmed`, even when the end stays, said in the post as "confirmed the end time"). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
+- How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax, `bossSince` set to the change's moment; `setEnd` also confirms a screenshot's guessed time, `maxTimeConfirmed`, even when the end stays, said in the post as "confirmed the end time"; `fromScreenshot`, plan 8X-S: a screenshot of the battle at its spot, decided by the pure `screenshotAtBattle` (`src/domain/party/max.ts`) inside one change without the spot's lock: the same boss joins by the automatic status in a group of the lobby size (`lobbySize` option), at whatever tier of its kind (the tier is `/boss`'s; Matt, review r4 A2), its end moved only later and only on a clean read (a sure moment and a countdown that ends at a rotation), "set the end time from a screenshot"; a clean read of the end it has confirms its time (`maxTimeConfirmed`, without a line; A3), and a moved or confirmed end makes the screenshot the post's, unless it was not kept (its id null: the post's own stays, its time no guess any more; A4); another boss of the kind on a sure moment newer than `bossSince` changes boss, tier and end, "Boss changed to <boss> from a screenshot by <member>, until <end>." (`doer`; meeting times after the new end cancelled), told to the notifier as `/boss`; anything else refused, `max-other-boss` or `max-kind-change`, the battle named; a battle whose end came meanwhile is `gone`. The look first and the report of a free spot are `reportMaxShotAs` (`src/commands/max/max-shot.ts`): the end checked against the clock first (review R11), a battle there whose post is still being made left to `reportMaxAs`, which waits for the post (review r4 A1), `mayJoin` before the change, `reportMaxAs` once with the screenshot and the boss since its sure moment (R10)). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
 - Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …` (under it, while it is on and its end was guessed from a screenshot, `UNCERTAIN_MAX_TIME`, which names `/end` only; a max battle's kept screenshot stays while it is active, `screenshotIdOf` in `shown()`), the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
 - A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known power spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
 
diff --git a/src/app.ts b/src/app.ts
index 5d00f4ff427c73f18274d341c7bb48f163405925..618bb5db8bab4294dcbe12dc6b0efd770bb7502b 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -55,6 +55,7 @@ import { DiscordApplicationEmoji } from './discord/application-emoji.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
+import { lobbySize } from './domain/party/lobby.js';
 import { screenshotIdOf } from './domain/party/party.js';
 import { formReader } from './domain/pogo/wants.js';
 import { createLogger, type Logger } from './log.js';
@@ -537,6 +538,7 @@ export async function startApp(
     posts: partyService,
     lines,
     notify,
+    lobbySize: (party) => lobbySize(party, config.settings.lobbies),
     log,
   });
   const timedParties = new TimedPartyService({
diff --git a/src/commands/max/max-report.ts b/src/commands/max/max-report.ts
index c0cd96f8bdf75473a056f5bf0f406988cbc887ba..6770d7dadfc33ca1c3bc0e95d4c1f5e733c7d48a 100644
--- a/src/commands/max/max-report.ts
+++ b/src/commands/max/max-report.ts
@@ -2,7 +2,12 @@ import type { AppContext } from '../../app-context.js';
 import type { MemberAccess } from '../../discord/party-gateway.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { maxSpotName } from '../../domain/party/max.js';
-import { sameBoss, type MaxParty, type MaxSpot } from '../../domain/party/party.js';
+import {
+  sameBoss,
+  type MaxParty,
+  type MaxSpot,
+  type RaidScreenshot,
+} from '../../domain/party/party.js';
 import { battleKindOf, maxBossTitle, type MaxTier } from '../../domain/pogo/max-tier.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { noPostWords } from '../../render/activity.js';
@@ -57,6 +62,10 @@ export interface MaxReportRequest {
   end: number;
   /** The region channel the report was made in (the map: the region the member picked). */
   regionChannelId: string;
+  /** The screenshot a new battle is reported from (plan 8X-S, `MaxReport.screenshot`). */
+  screenshot?: RaidScreenshot;
+  /** Since when a new battle has its boss: a screenshot's sure moment (`MaxReport.bossSince`). */
+  bossSince?: number;
 }
 
 /**
@@ -110,6 +119,8 @@ export async function reportMaxAs(
     boss: request.boss.boss,
     endTime: request.end,
     regionChannelId: request.regionChannelId,
+    ...(request.screenshot ? { screenshot: request.screenshot } : {}),
+    ...(request.bossSince === undefined ? {} : { bossSince: request.bossSince }),
     mayJoin,
     mayCreateAtPin: async () => !(await blockedAtPin(ctx, serverId, id, staff, request.spot)),
   });
diff --git a/src/commands/max/max-shot.test.ts b/src/commands/max/max-shot.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a5706eb3678b6eb153e537bfcc89761c3fa03942
--- /dev/null
+++ b/src/commands/max/max-shot.test.ts
@@ -0,0 +1,201 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
+import { ALICE, asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { reportMaxAs } from './max-report.js';
+import { reportMaxShotAs, type MaxShotRequest } from './max-shot.js';
+
+const MINUTE = 60_000;
+const MACHAMP = { boss: { key: 'machamp' }, tier: 'D2' as const, label: 'Dynamax Machamp (2★)' };
+const MACHOP = { boss: { key: 'machop' }, tier: 'D1' as const, label: 'Dynamax Machop (1★)' };
+const THREE = at('2026-10-22T15:00');
+const NINE = at('2026-10-22T21:00');
+const SHOT = { id: 'Ab3_-xY9zQ12', timeUncertain: false };
+const ALLOWED = { mayJoin: () => Promise.resolve(true), staff: false };
+
+/** A sure screenshot of Machamp (2★) at the test spot, taken two minutes ago, until 15:00. */
+function request(overrides: Partial<MaxShotRequest> = {}): MaxShotRequest {
+  return {
+    boss: MACHAMP,
+    spot: TEST_SPOT,
+    end: THREE,
+    regionChannelId: WEST_CHANNEL,
+    takenAt: Date.now() - 2 * MINUTE,
+    sureMoment: true,
+    rotationEnd: true,
+    capped: false,
+    screenshot: SHOT,
+    ...overrides,
+  };
+}
+
+describe('reporting a max battle from a screenshot (reportMaxShotAs, plan 8X-S)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  /** Bob's Machamp (2★) at the test spot, reported at 14:00 until 15:00; then five minutes on. */
+  async function withBattle() {
+    const made = await maxReportingWith();
+    await reportMaxAs(
+      made.ctx,
+      { id: BOB, name: 'Bob' },
+      FAKE_GUILD_ID,
+      { boss: MACHAMP, spot: TEST_SPOT, end: THREE, regionChannelId: WEST_CHANNEL },
+      ALLOWED,
+    );
+    vi.setSystemTime(MAX_THURSDAY + 5 * MINUTE);
+    return { made, battle: asMax(made.store.active()[0]) };
+  }
+
+  it('reports a free spot anew, with its screenshot and the boss since the sure moment', async () => {
+    const made = await maxReportingWith();
+    const result = await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      request(),
+      ALLOWED,
+    );
+    expect(result).toMatchObject({ kind: 'reported', result: { outcome: { kind: 'created' } } });
+    const battle = asMax(made.store.active()[0]);
+    expect(battle.endTime).toBe(THREE);
+    expect(battle.max).toMatchObject({ screenshot: SHOT, bossSince: MAX_THURSDAY - 2 * MINUTE });
+  });
+
+  it('gives a battle reported on a moment not sure the boss since it was made', async () => {
+    const made = await maxReportingWith();
+    const unsure = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
+    await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      request({ sureMoment: false, screenshot: unsure }),
+      ALLOWED,
+    );
+    expect(asMax(made.store.active()[0]).max).toMatchObject({
+      screenshot: unsure,
+      bossSince: MAX_THURSDAY,
+    });
+  });
+
+  it('joins the battle of the same boss there by the automatic status, in one change', async () => {
+    const { made, battle } = await withBattle();
+    made.userSettings.set(ALICE, { autoStatus: PartyStatus.Coming });
+    const result = await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      request(),
+      ALLOWED,
+    );
+    expect(result).toMatchObject({
+      kind: 'at-battle',
+      outcome: { kind: 'joined', joined: true, endMoved: false },
+      autoStatus: PartyStatus.Coming,
+    });
+    expect(made.store.active()).toHaveLength(1);
+    expect(asMax(made.store.get(battle.id)).attendees[ALICE]?.status).toBe(PartyStatus.Coming);
+  });
+
+  // Review r4 A5.
+  it('joins the battle there in exactly one change of the store', async () => {
+    const { made } = await withBattle();
+    const update = vi.spyOn(made.store, 'update');
+    await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      request(),
+      ALLOWED,
+    );
+    expect(update).toHaveBeenCalledOnce();
+  });
+
+  // Review r4 A5: the battle looked at ended between the look and the change.
+  it('reports anew, once, where the battle looked at has ended meanwhile', async () => {
+    const { made, battle } = await withBattle();
+    // Bob's battle ends at 15:00; the look still saw it, the change finds its end come.
+    vi.setSystemTime(THREE + MINUTE);
+    vi.spyOn(made.store, 'maxAt').mockReturnValueOnce(battle);
+    const later = request({ end: at('2026-10-22T16:00'), takenAt: THREE });
+    const result = await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      later,
+      ALLOWED,
+    );
+    expect(result).toMatchObject({ kind: 'reported', result: { outcome: { kind: 'created' } } });
+    expect(made.store.active().filter((party) => party.id !== battle.id)).toHaveLength(1);
+  });
+
+  // Review r4 A1: a battle whose post is still being made is joined as `/max` joins it.
+  it('reports through /max’s way a battle there whose post is not made yet', async () => {
+    const { made, battle } = await withBattle();
+    vi.spyOn(made.store, 'maxAt').mockReturnValueOnce({ ...battle, forumPostId: null });
+    const fromScreenshot = vi.spyOn(made.maxes, 'fromScreenshot');
+    const result = await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      request(),
+      ALLOWED,
+    );
+    expect(fromScreenshot).not.toHaveBeenCalled();
+    expect(result).toMatchObject({ kind: 'reported', result: { outcome: { kind: 'exists' } } });
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('changes the boss there on a newer sure screenshot', async () => {
+    const { made, battle } = await withBattle();
+    const result = await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      request({ boss: MACHOP }),
+      ALLOWED,
+    );
+    expect(result).toMatchObject({ kind: 'at-battle', outcome: { kind: 'changed' } });
+    expect(asMax(made.store.get(battle.id)).max).toMatchObject({ boss: { key: 'machop' } });
+  });
+
+  it('refuses a member kept out of the forum of the battle there, and changes nothing', async () => {
+    const { made, battle } = await withBattle();
+    const result = await reportMaxShotAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      request({ boss: MACHOP }),
+      { mayJoin: () => Promise.resolve(false), staff: false },
+    );
+    expect(result).toEqual({ kind: 'barred' });
+    expect(asMax(made.store.get(battle.id)).max.boss).toEqual({ key: 'machamp' });
+  });
+
+  it('refuses an end that has passed by the time of reporting, in the words of its kind (R11)', async () => {
+    const made = await maxReportingWith();
+    const member = { id: ALICE, name: 'Alice' };
+    const passed = MAX_THURSDAY - MINUTE;
+    expect(
+      await reportMaxShotAs(made.ctx, member, FAKE_GUILD_ID, request({ end: passed }), ALLOWED),
+    ).toEqual({ kind: 'over', reason: 'battle-over' });
+    // The countdown runs on, but the day's battles ended at the cap (Matt's M2).
+    vi.setSystemTime(NINE + MINUTE);
+    expect(
+      await reportMaxShotAs(
+        made.ctx,
+        member,
+        FAKE_GUILD_ID,
+        request({ end: NINE, capped: true, rotationEnd: false }),
+        ALLOWED,
+      ),
+    ).toEqual({ kind: 'over', reason: 'over-for-today' });
+    expect(made.store.active()).toEqual([]);
+  });
+});
diff --git a/src/commands/max/max-shot.ts b/src/commands/max/max-shot.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f200e4d0e8a5e9cfa6fb72c1468ab9bbf708ed6a
--- /dev/null
+++ b/src/commands/max/max-shot.ts
@@ -0,0 +1,120 @@
+import type { AppContext } from '../../app-context.js';
+import type { MaxSpot, RaidScreenshot } from '../../domain/party/party.js';
+import type { PartyStatus } from '../../domain/party/status.js';
+import type { Member } from '../../services/attendance-service.js';
+import type { MaxShotOutcome } from '../../services/max-change-service.js';
+import type { ReadMaxBoss } from './max-input.js';
+import {
+  reportMaxAs,
+  type MaxReporter,
+  type MaxReporting,
+  type MaxReportResult,
+} from './max-report.js';
+
+/*
+ * A max battle reported from a screenshot (plan 8X-S; design 6): what a mention, passive reading
+ * and `/max screenshot:` share. The battle at the spot is looked at first (`PartyStore.maxAt`):
+ * one there is joined, has its boss changed, or refuses the screenshot, in one change of the
+ * store (`MaxChangeService.fromScreenshot`); a free spot is reported as `/max` reports it
+ * (`reportMaxAs`), once, also where the battle there ended between the look and the change.
+ */
+
+/** A max battle as a screenshot gives it, with what was typed over it already put in. */
+export interface MaxShotRequest {
+  boss: ReadMaxBoss;
+  /** A Power Spot: a screenshot makes no pin. */
+  spot: MaxSpot;
+  end: number;
+  /** The region channel it was posted in. */
+  regionChannelId: string;
+  /** When the screenshot was taken, whether that moment is sure, and the countdown's kind. */
+  takenAt: number;
+  sureMoment: boolean;
+  rotationEnd: boolean;
+  /** The end is the day's last battle time the countdown was capped at (Matt's M2). */
+  capped: boolean;
+  screenshot: RaidScreenshot;
+}
+
+/**
+ * What came of it. `over`: the end had passed by the time of reporting (the reading may have
+ * waited in the queue; review R11): `over-for-today` for an end capped at the last battle time,
+ * else `battle-over`; nothing was done. `barred`: the battle there stands in a forum the member
+ * is kept out of. `at-battle`: the battle there was joined, changed or refused the screenshot
+ * (the member's automatic status for the answer). `reported`: as `/max` reports it.
+ */
+export type MaxShotResult =
+  | { kind: 'over'; reason: 'battle-over' | 'over-for-today' }
+  | { kind: 'barred' }
+  | {
+      kind: 'at-battle';
+      outcome: Exclude<MaxShotOutcome, { kind: 'gone' }>;
+      autoStatus: PartyStatus;
+    }
+  | { kind: 'reported'; result: MaxReportResult };
+
+/** What reporting from a screenshot needs beyond `/max`'s reporting. */
+export type MaxShotReporting = MaxReporting & Pick<AppContext, 'guilds' | 'parties' | 'maxBattles'>;
+
+/**
+ * Reports the screenshot's battle as the member in the server `serverId` (a snowflake): checks
+ * its end against the clock first (R11), then looks at the spot. `mayJoin` is asked before the
+ * battle there is changed or joined; a new battle gets the screenshot, and the boss since its
+ * moment when that is sure (review R10). A battle there whose post is still being made is reported
+ * as `/max` reports it (joined once its post is made).
+ */
+export async function reportMaxShotAs(
+  ctx: MaxShotReporting,
+  member: Member,
+  serverId: string,
+  request: MaxShotRequest,
+  reporter: MaxReporter,
+): Promise<MaxShotResult> {
+  const now = Date.now();
+  if (request.end <= now) {
+    return { kind: 'over', reason: request.capped ? 'over-for-today' : 'battle-over' };
+  }
+  const guild = await ctx.guilds.idFor(serverId);
+  const there = guild === undefined ? undefined : ctx.parties.maxAt(guild, request.spot, now);
+  // A battle whose post is still being made is `/max`'s to join: `reportMaxAs` waits for the
+  // post and decides again (review r4 A1).
+  if (there && there.forumPostId !== null) {
+    const forum = there.forumChannelId;
+    if (forum !== null && !(await reporter.mayJoin(forum))) return { kind: 'barred' };
+    const settings = await ctx.users.get(member.id);
+    const outcome = await ctx.maxBattles.fromScreenshot(
+      there.id,
+      member,
+      {
+        boss: request.boss.boss,
+        tier: request.boss.tier,
+        label: request.boss.label,
+        end: request.end,
+        takenAt: request.takenAt,
+        sureMoment: request.sureMoment,
+        rotationEnd: request.rotationEnd,
+        screenshot: request.screenshot,
+      },
+      settings.autoStatus,
+    );
+    if (outcome.kind !== 'gone') {
+      return { kind: 'at-battle', outcome, autoStatus: settings.autoStatus };
+    }
+    // Its end came meanwhile: the spot is free, and reported anew below.
+  }
+  const result = await reportMaxAs(
+    ctx,
+    member,
+    serverId,
+    {
+      boss: request.boss,
+      spot: request.spot,
+      end: request.end,
+      regionChannelId: request.regionChannelId,
+      screenshot: request.screenshot,
+      ...(request.sureMoment ? { bossSince: request.takenAt } : {}),
+    },
+    reporter,
+  );
+  return { kind: 'reported', result };
+}
diff --git a/src/domain/party/max.test.ts b/src/domain/party/max.test.ts
index ccece5b2ed4987079d7b01b8c2df013c2c71cdb8..3a16dd17e89b73fd289b1fb99d2ca64aedcc99b8 100644
--- a/src/domain/party/max.test.ts
+++ b/src/domain/party/max.test.ts
@@ -23,6 +23,7 @@ import {
   maxEnded,
   maxSpotName,
   sameSpot,
+  screenshotAtBattle,
   setMaxBoss,
   setMaxEnd,
   spotKey,
@@ -312,3 +313,130 @@ describe('the state of a max battle (version 13, and 15)', () => {
     );
   });
 });
+
+describe('a screenshot of the battle at its spot (screenshotAtBattle, plan 8X-S)', () => {
+  const SHOT = { id: 'Ab3_-xY9zQ12', timeUncertain: false };
+  /** A screenshot of the battle's own boss, taken at 14:00 surely, its countdown to 15:00. */
+  const shot = (overrides: Partial<Parameters<typeof screenshotAtBattle>[1]> = {}) => ({
+    boss: { key: 'machamp' },
+    tier: 'D2' as const,
+    end: at('2026-10-13T15:00'),
+    takenAt: PARTY_NOW,
+    sureMoment: true,
+    rotationEnd: true,
+    screenshot: SHOT,
+    ...overrides,
+  });
+  /** Machamp (2★) until 14:30, its boss since 13:00. */
+  const battle = testMax({ endTime: at('2026-10-13T14:30'), bossSince: at('2026-10-13T13:00') });
+
+  it('joins the same boss, its end moved later by a clean read, and the screenshot the post’s', () => {
+    const step = screenshotAtBattle(battle, shot(), PARTY_NOW);
+    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: true, removed: [] });
+    if (!step.ok) return;
+    expect(step.party.endTime).toBe(at('2026-10-13T15:00'));
+    expect(step.party.max.screenshot).toEqual(SHOT);
+    expect(step.party.max.bossSince).toBe(at('2026-10-13T13:00'));
+  });
+
+  it('keeps the end of the same boss unless the read is clean and the end later', () => {
+    const kept = (overrides: Parameters<typeof shot>[0]) => {
+      const step = screenshotAtBattle(battle, shot(overrides), PARTY_NOW);
+      expect(step).toMatchObject({ ok: true, did: 'join', endMoved: false });
+      return step.ok ? step.party : undefined;
+    };
+    // Never earlier.
+    expect(kept({ end: at('2026-10-13T14:15') })).toBe(battle);
+    // A moment not sure, an all-day countdown capped at 21:00: the end stays.
+    expect(kept({ sureMoment: false })).toBe(battle);
+    expect(kept({ rotationEnd: false, end: at('2026-10-13T21:00') })).toBe(battle);
+  });
+
+  it('changes another boss of the kind on a newer sure screenshot: boss, tier, end and screenshot', () => {
+    const met = withAttendees(
+      {
+        ...battle,
+        endTime: at('2026-10-13T16:00'),
+        groups: [{ id: 'A', startTime: at('2026-10-13T15:30') }],
+      },
+      { [ALICE]: {} },
+    );
+    const step = screenshotAtBattle(
+      met,
+      shot({ boss: { key: 'machop' }, tier: 'D1', end: at('2026-10-13T15:00') }),
+      PARTY_NOW,
+    );
+    expect(step).toMatchObject({ ok: true, did: 'change', removed: ['A'] });
+    if (!step.ok) return;
+    expect(step.party.max).toMatchObject({
+      boss: { key: 'machop' },
+      tier: 'D1',
+      bossSince: PARTY_NOW,
+      screenshot: SHOT,
+    });
+    expect(step.party.endTime).toBe(at('2026-10-13T15:00'));
+    // The meeting time after the new end goes; the members stay.
+    expect(step.party.groups).toEqual([{ id: 'A' }]);
+    expect(Object.keys(step.party.attendees)).toContain(ALICE);
+  });
+
+  it('refuses another boss on a moment not sure, or no newer than the boss the battle has', () => {
+    const other = { boss: { key: 'machop' }, tier: 'D1' as const };
+    expect(screenshotAtBattle(battle, shot({ ...other, sureMoment: false }), PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'max-other-boss',
+    });
+    expect(
+      screenshotAtBattle(battle, shot({ ...other, takenAt: at('2026-10-13T13:00') }), PARTY_NOW),
+    ).toEqual({ ok: false, reason: 'max-other-boss' });
+  });
+
+  // Matt, 2026-10-23 (review r4 A2): the tier is left to `/boss`.
+  it('joins the same boss at another tier of the kind, its tier kept', () => {
+    const step = screenshotAtBattle(battle, shot({ tier: 'D3', sureMoment: false }), PARTY_NOW);
+    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: false });
+    if (!step.ok) return;
+    expect(step.party).toBe(battle);
+  });
+
+  // Review r4 A3.
+  it('confirms a guessed end that a clean read of the same minute shows, the screenshot the post’s', () => {
+    const guessed = {
+      ...battle,
+      max: { ...battle.max, screenshot: { id: 'Old_shot_123', timeUncertain: true } },
+    };
+    const step = screenshotAtBattle(
+      guessed,
+      shot({ end: at('2026-10-13T14:30') + 40_000 }),
+      PARTY_NOW,
+    );
+    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: false, confirmed: true });
+    if (!step.ok) return;
+    expect(step.party.endTime).toBe(at('2026-10-13T14:30'));
+    expect(step.party.max.screenshot).toEqual(SHOT);
+  });
+
+  // Review r4 A4.
+  it('keeps the screenshot the post has when the new one was not kept', () => {
+    const kept = {
+      ...battle,
+      max: { ...battle.max, screenshot: { id: 'Old_shot_123', timeUncertain: true } },
+    };
+    const step = screenshotAtBattle(
+      kept,
+      shot({ screenshot: { id: null, timeUncertain: false } }),
+      PARTY_NOW,
+    );
+    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: true });
+    if (!step.ok) return;
+    expect(step.party.max.screenshot).toEqual({ id: 'Old_shot_123', timeUncertain: false });
+  });
+
+  it('refuses the other kind even on a newer sure screenshot', () => {
+    const giga = shot({ boss: { key: 'machamp' }, tier: 'G' });
+    expect(screenshotAtBattle(battle, giga, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'max-kind-change',
+    });
+  });
+});
diff --git a/src/domain/party/max.ts b/src/domain/party/max.ts
index 993147d17235fa6c3e195a0cb8159cebd5792d92..5e2aeccda5e225202a2845fb00e13c8dc49d246d 100644
--- a/src/domain/party/max.ts
+++ b/src/domain/party/max.ts
@@ -12,6 +12,7 @@ import {
   type MaxSpot,
   type RaidBossRef,
   type RaidScreenshot,
+  type Refusal,
 } from './party.js';
 import { PartyStatus } from './status.js';
 
@@ -184,6 +185,100 @@ export function setMaxBoss(
   };
 }
 
+/**
+ * What a max battle's screenshot says of the battle at its spot (plan 8X-S; `decideMax`'s
+ * `ScreenshotMax` with the screenshot kept): its boss and tier, its end (the countdown's, capped
+ * at the day's last battle), when it was taken and whether that moment is sure, and whether the
+ * countdown ends at a rotation.
+ */
+export interface MaxShot {
+  boss: RaidBossRef;
+  tier: MaxTier;
+  end: number;
+  takenAt: number;
+  sureMoment: boolean;
+  rotationEnd: boolean;
+  screenshot: RaidScreenshot;
+}
+
+/**
+ * What a screenshot does to the battle at its spot (design 6, Matt's answers of 2026-10-22):
+ * - the same boss (`join`), at whatever tier of the kind (the tier is `/boss`'s; Matt, review r4
+ *   A2): the battle is joined; its end moves only later, and only on a clean read (a sure moment
+ *   and a countdown that ends at a rotation, not the all-day kind), the screenshot then the
+ *   post's (`endMoved`); a clean read of the end it has confirms its time (`confirmed`,
+ *   `maxTimeConfirmed`), the screenshot then the post's too; a screenshot that was not kept
+ *   (`id` null) leaves the post the one it has, its time no guess any more;
+ * - another boss of the same kind on a sure moment newer than the battle's boss (`change`): boss,
+ *   tier and end change together, it has the boss since the screenshot was taken, the screenshot
+ *   is the post's; a meeting time after the new end is removed (`removed`, as `setMaxEnd`);
+ * - another boss otherwise: refused (`max-other-boss`), and the other kind always
+ *   (`max-kind-change`).
+ * The very same party when nothing changes. Attendance is the caller's.
+ */
+export function screenshotAtBattle(
+  party: MaxParty,
+  shot: MaxShot,
+  now: number,
+):
+  | {
+      ok: true;
+      party: MaxParty;
+      did: 'join';
+      endMoved: boolean;
+      confirmed: boolean;
+      removed: string[];
+    }
+  | { ok: true; party: MaxParty; did: 'change'; removed: string[] }
+  | Refusal {
+  // A screenshot that was not kept leaves the post the one it shows (review r4 A4).
+  const withShot = (changed: MaxParty): MaxParty => ({
+    ...changed,
+    max: {
+      ...changed.max,
+      screenshot:
+        shot.screenshot.id === null
+          ? { id: changed.max.screenshot?.id ?? null, timeUncertain: false }
+          : { ...shot.screenshot },
+    },
+  });
+  if (battleKindOf(shot.tier) !== battleKindOf(party.max.tier)) return refused('max-kind-change');
+  // The same boss at another tier of the kind is joined: the tier is `/boss`'s (Matt, A2).
+  if (sameBoss(party.max.boss, shot.boss)) {
+    const clean = shot.sureMoment && shot.rotationEnd;
+    const end = minute(shot.end);
+    if (clean && end === party.endTime) {
+      // The end the battle has, read surely: its time is no guess any more (review r4 A3).
+      const confirmed = withShot(maxTimeConfirmed(party));
+      return {
+        ok: true,
+        party: confirmed,
+        did: 'join',
+        endMoved: false,
+        confirmed: true,
+        removed: [],
+      };
+    }
+    if (!clean || end <= (party.endTime ?? Infinity)) {
+      return { ok: true, party, did: 'join', endMoved: false, confirmed: false, removed: [] };
+    }
+    const set = setMaxEnd(party, shot.end, now);
+    return {
+      ok: true,
+      party: withShot(set.party),
+      did: 'join',
+      endMoved: true,
+      confirmed: false,
+      removed: [],
+    };
+  }
+  if (!shot.sureMoment || shot.takenAt <= party.max.bossSince) return refused('max-other-boss');
+  const changed = setMaxBoss(party, shot.boss, shot.tier, shot.takenAt);
+  if (!changed.ok) return changed;
+  const set = setMaxEnd(changed.party, shot.end, now);
+  return { ok: true, party: withShot(set.party), did: 'change', removed: set.removed };
+}
+
 /** What a pin of a max battle is called (design 3.2, Q7): a power spot Pine does not know. */
 export const UNLISTED_SPOT = 'Unlisted power spot';
 
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 17bf7f6c5b7818d84d2f850a9edb3b72b0677a90..0fb0d1803867a063dffb2ba301e07e90d1588a36 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -662,6 +662,11 @@ export type PartyProblem =
    * jump; it is reported anew.
    */
   | 'max-kind-change'
+  /**
+   * A screenshot showed another boss at a max battle's spot, its moment not sure or no newer than
+   * the battle's boss (plan 8X-S, design 6): `/boss` there changes it.
+   */
+  | 'max-other-boss'
   /** The gym lies in no region of the raid's server that has a forum for its post. */
   | 'other-region'
   /** The post of a raid in the region it moves to went while it was being made: it stays. */
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 3094c58b1a36ac33f981dd31b8c4b688a3495a19..db64fe682577a5f9a8d8cd3f036ff507f7ef680b 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -140,6 +140,8 @@ export function problemText(
         'A Dynamax battle cannot become a Gigantamax one, nor the other way round (the lobby ' +
         'size would change). Report the new battle with `/max`.'
       );
+    case 'max-other-boss':
+      return 'That spot has a max battle against another boss: `/boss` there changes its boss.';
     case 'not-a-move':
       return 'The boss of this raid does not have that move.';
     case 'bad-name':
diff --git a/src/services/max-change-service.test.ts b/src/services/max-change-service.test.ts
index 4d5575663055404c721140487c8a686bc1059de7..2e8c8322f50f141c3484fd040e50713d55e9328b 100644
--- a/src/services/max-change-service.test.ts
+++ b/src/services/max-change-service.test.ts
@@ -1,8 +1,19 @@
-import { describe, expect, it } from 'vitest';
-import { asMax, at, PARTY_NOW, REPORTER, TEST_SPOT, testMax } from '../../test/support/parties.js';
+import { describe, expect, it, vi } from 'vitest';
+import {
+  ALICE,
+  asMax,
+  at,
+  BOB,
+  PARTY_NOW,
+  REPORTER,
+  TEST_SPOT,
+  testMax,
+  withAttendees,
+} from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { blocksNewMax, sameSpot } from '../domain/party/max.js';
 import { isMax } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
 
 const ID = (n: number): string => `00000000-0000-4000-8000-00000000020${String(n)}`;
 
@@ -117,3 +128,165 @@ describe('MaxChangeService (plan 8X-3)', () => {
     expect(asMax(made.store.get(ID(1))).max.bossSince).toBe(PARTY_NOW + 20 * 60_000);
   });
 });
+
+describe('MaxChangeService: a screenshot of the battle at its spot (plan 8X-S)', () => {
+  const POST = '300000000000000201';
+  const SHOT = { id: 'Ab3_-xY9zQ12', timeUncertain: false };
+  const ALICE_M = { id: ALICE, name: 'Alice' };
+  /** Of the battle's own boss, taken surely at 14:00, its countdown to 15:00. */
+  const shot = (overrides: object = {}) => ({
+    boss: { key: 'machamp' },
+    tier: 'D2' as const,
+    end: at('2026-10-13T15:00'),
+    takenAt: PARTY_NOW,
+    sureMoment: true,
+    rotationEnd: true,
+    screenshot: SHOT,
+    label: 'Dynamax Machamp (2★)',
+    ...overrides,
+  });
+  /** Machamp (2★) until 14:30, its boss since 13:00, with a post. */
+  const battle = (overrides: Parameters<typeof testMax>[0] = {}) => ({
+    ...testMax({
+      id: ID(1),
+      endTime: at('2026-10-13T14:30'),
+      bossSince: at('2026-10-13T13:00'),
+      ...overrides,
+    }),
+    forumPostId: POST,
+  });
+  const said = async (made: Awaited<ReturnType<typeof partyServiceWith>>) => {
+    await made.attendance.flush();
+    return made.gateway.messagesIn(POST).map((m) => m.message.content);
+  };
+
+  it('joins the same boss by the automatic status, its end kept, without a line', async () => {
+    const made = await partyServiceWith([battle()]);
+    const outcome = await made.maxes.fromScreenshot(
+      ID(1),
+      ALICE_M,
+      shot({ end: at('2026-10-13T14:15') }),
+      PartyStatus.Coming,
+    );
+    expect(outcome).toMatchObject({ kind: 'joined', joined: true, endMoved: false });
+    const stored = asMax(made.store.get(ID(1)));
+    expect(stored.attendees[ALICE]?.status).toBe(PartyStatus.Coming);
+    expect(stored.endTime).toBe(at('2026-10-13T14:30'));
+    expect(await said(made)).toEqual([]);
+  });
+
+  it('puts the member joining in a group of the lobby size, as Join does', async () => {
+    const full = withAttendees(battle(), {
+      [BOB]: { number: 4, group: 'A' },
+    });
+    const made = await partyServiceWith([full]);
+    await made.maxes.fromScreenshot(ID(1), ALICE_M, shot(), PartyStatus.Coming);
+    // Bob, coming with three more, fills group A's lobby of 4: Alice opens group B.
+    expect(asMax(made.store.get(ID(1))).attendees[ALICE]?.group).toBe('B');
+  });
+
+  it('moves the end of the same boss later on a clean read, and says so', async () => {
+    const made = await partyServiceWith([battle()]);
+    const outcome = await made.maxes.fromScreenshot(ID(1), ALICE_M, shot(), PartyStatus.Coming);
+    expect(outcome).toMatchObject({ kind: 'joined', endMoved: true });
+    expect(asMax(made.store.get(ID(1))).endTime).toBe(at('2026-10-13T15:00'));
+    expect(await said(made)).toEqual([
+      `**Alice** (<@${ALICE}>) set the end time from a screenshot: <t:${at('2026-10-13T15:00') / 1000}:t>.`,
+    ]);
+  });
+
+  // Review r4 A3.
+  it('confirms the guessed end a clean read of the same end shows, without a line', async () => {
+    const guessed = battle();
+    const made = await partyServiceWith([
+      {
+        ...guessed,
+        max: { ...guessed.max, screenshot: { id: 'Old_shot_123', timeUncertain: true } },
+      },
+    ]);
+    const outcome = await made.maxes.fromScreenshot(
+      ID(1),
+      ALICE_M,
+      shot({ end: at('2026-10-13T14:30') }),
+      PartyStatus.Coming,
+    );
+    expect(outcome).toMatchObject({ kind: 'joined', endMoved: false, confirmed: true });
+    expect(asMax(made.store.get(ID(1))).max.screenshot).toEqual(SHOT);
+    expect(await said(made)).toEqual([]);
+  });
+
+  it('changes another boss on a newer sure screenshot, says so, and tells the notifier', async () => {
+    const made = await partyServiceWith([battle({ endTime: at('2026-10-13T16:00') })]);
+    const changed = vi.spyOn(made.notify, 'maxChanged');
+    const machop = { boss: { key: 'machop' }, tier: 'D1', label: 'Dynamax Machop (1★)' };
+    const outcome = await made.maxes.fromScreenshot(
+      ID(1),
+      ALICE_M,
+      shot(machop),
+      PartyStatus.Coming,
+    );
+    expect(outcome).toMatchObject({ kind: 'changed' });
+    const stored = asMax(made.store.get(ID(1)));
+    expect(stored.max).toMatchObject({ boss: { key: 'machop' }, tier: 'D1', bossSince: PARTY_NOW });
+    expect(stored.endTime).toBe(at('2026-10-13T15:00'));
+    expect(changed).toHaveBeenCalledOnce();
+    expect(await said(made)).toEqual([
+      `Boss changed to **Dynamax Machop (1★)** from a screenshot by **Alice** (<@${ALICE}>), ` +
+        `until <t:${at('2026-10-13T15:00') / 1000}:t>.`,
+    ]);
+  });
+
+  it('says a change by an anonymous reporter without their name, and the meeting time it ends', async () => {
+    const made = await partyServiceWith([
+      {
+        ...battle({ anonymous: true, endTime: at('2026-10-13T16:00') }),
+        groups: [{ id: 'A' as const, startTime: at('2026-10-13T15:30') }],
+      },
+    ]);
+    const machop = { boss: { key: 'machop' }, tier: 'D1', label: 'Dynamax Machop (1★)' };
+    await made.maxes.fromScreenshot(ID(1), { id: REPORTER }, shot(machop), PartyStatus.Coming);
+    expect(await said(made)).toEqual([
+      `Boss changed to **Dynamax Machop (1★)** from a screenshot, until <t:${at('2026-10-13T15:00') / 1000}:t>.`,
+      'The meeting time no longer fits the battle and is cancelled.',
+    ]);
+  });
+
+  it('refuses another boss no newer than the battle’s, naming the battle, and changes nothing', async () => {
+    const made = await partyServiceWith([battle()]);
+    const outcome = await made.maxes.fromScreenshot(
+      ID(1),
+      ALICE_M,
+      shot({ boss: { key: 'machop' }, tier: 'D1', takenAt: at('2026-10-13T12:00') }),
+      PartyStatus.Coming,
+    );
+    expect(outcome).toMatchObject({
+      kind: 'refused',
+      reason: 'max-other-boss',
+      party: { id: ID(1) },
+    });
+    expect(asMax(made.store.get(ID(1))).attendees[ALICE]).toBeUndefined();
+  });
+
+  it('refuses the other kind, naming the battle', async () => {
+    const made = await partyServiceWith([battle()]);
+    const outcome = await made.maxes.fromScreenshot(
+      ID(1),
+      ALICE_M,
+      shot({ tier: 'G' }),
+      PartyStatus.Coming,
+    );
+    expect(outcome).toMatchObject({
+      kind: 'refused',
+      reason: 'max-kind-change',
+      party: { id: ID(1) },
+    });
+  });
+
+  it('is gone when the battle there ended meanwhile, and changes nothing', async () => {
+    const over = battle({ endTime: at('2026-10-13T13:30'), now: at('2026-10-13T13:00') });
+    const made = await partyServiceWith([over]);
+    const outcome = await made.maxes.fromScreenshot(ID(1), ALICE_M, shot(), PartyStatus.Coming);
+    expect(outcome).toEqual({ kind: 'gone' });
+    expect(asMax(made.store.get(ID(1))).attendees[ALICE]).toBeUndefined();
+  });
+});
diff --git a/src/services/max-change-service.ts b/src/services/max-change-service.ts
index aa9976cc7eef0eafc6ecaccfea902bfc1b3a67ec..7e773659c8f686630b2b5fe4edb3bbae8d3a94f1 100644
--- a/src/services/max-change-service.ts
+++ b/src/services/max-change-service.ts
@@ -1,5 +1,12 @@
-import { noteMember } from '../domain/party/attendance.js';
-import { blocksNewMax, sameSpot, setMaxBoss, setMaxEnd } from '../domain/party/max.js';
+import { applyAutoStatus, noteMember } from '../domain/party/attendance.js';
+import {
+  blocksNewMax,
+  sameSpot,
+  screenshotAtBattle,
+  setMaxBoss,
+  setMaxEnd,
+  type MaxShot,
+} from '../domain/party/max.js';
 import {
   isMax,
   refused,
@@ -9,6 +16,7 @@ import {
   type RaidBossRef,
   type Refusal,
 } from '../domain/party/party.js';
+import type { PartyStatus } from '../domain/party/status.js';
 import type { MaxTier } from '../domain/pogo/max-tier.js';
 import type { Logger } from '../log.js';
 import { doer } from '../render/activity.js';
@@ -29,6 +37,20 @@ export type MaxChangeOutcome =
   | { kind: 'refused'; reason: PartyProblem; other?: MaxParty }
   | { kind: 'ok'; party: MaxParty; changed: boolean };
 
+/**
+ * What came of a screenshot of the battle at its spot (`fromScreenshot`, plan 8X-S). `gone`: no
+ * such active battle, or its end came meanwhile and the spot is free (report it anew). `joined`:
+ * the same boss; `joined` whether the member was signed up, `endMoved` whether its end moved
+ * later, `confirmed` whether a clean read of the end it has confirmed its time (the screenshot
+ * then the post's, as for a moved end). `changed`: its boss, tier and end are the screenshot's. `refused`: another boss
+ * (`max-other-boss`) or the other kind (`max-kind-change`); `party` is the battle there.
+ */
+export type MaxShotOutcome =
+  | { kind: 'gone' }
+  | { kind: 'joined'; party: MaxParty; joined: boolean; endMoved: boolean; confirmed: boolean }
+  | { kind: 'changed'; party: MaxParty }
+  | { kind: 'refused'; reason: PartyProblem; party: MaxParty };
+
 export interface MaxChangeServiceOptions {
   store: PartyStore;
   /** Told after every stored change. */
@@ -36,6 +58,11 @@ export interface MaxChangeServiceOptions {
   lines: Pick<PartyLines, 'say'>;
   /** Told of every stored change of a max battle, with the member who made it. */
   notify?: Pick<PartyNotifier, 'maxChanged'>;
+  /**
+   * How many trainers one group of a battle holds (`lobbySize` of the settings): a member a
+   * screenshot signs up is put in a group as Join puts them.
+   */
+  lobbySize: (party: MaxParty) => number | undefined;
   log: Logger;
   now?: () => number;
 }
@@ -48,6 +75,15 @@ function said(party: MaxParty, member: Member, did: string, happened: string): s
   return who === undefined ? happened : `${who} ${did}`;
 }
 
+/** What the post is told of the meeting times a new end cancelled (`setMaxEnd`'s `removed`). */
+function cancelledLines(party: MaxParty, removed: readonly string[]): string[] {
+  return removed.map(
+    (id) =>
+      `The meeting time${party.groups.length > 1 ? ` of group ${id as GroupId}` : ''} ` +
+      'no longer fits the battle and is cancelled.',
+  );
+}
+
 /**
  * What members change about a max battle itself (plan 8X-3): its end (`/end`) and its boss
  * (`/boss`, a rotation within an event; design 3.1). Each decides inside the store, has the post
@@ -94,11 +130,7 @@ export class MaxChangeService {
                   : said(party, member, 'set the end time', 'The end time was set')) +
                   `: ${timestamp(party.endTime)}.`,
               ]),
-          ...removed.map(
-            (id) =>
-              `The meeting time${party.groups.length > 1 ? ` of group ${id as GroupId}` : ''} ` +
-              'no longer fits the battle and is cancelled.',
-          ),
+          ...cancelledLines(party, removed),
         ],
       ),
     );
@@ -127,6 +159,84 @@ export class MaxChangeService {
     );
   }
 
+  /**
+   * A screenshot of the battle at its spot (plan 8X-S; design 6, Matt's answers of 2026-10-22),
+   * decided inside the store by `screenshotAtBattle`: the same boss signs the member up by their
+   * automatic status (`autoStatus`, in a group of the lobby size), its end moved later on a clean
+   * read; another boss of the kind on a newer sure screenshot changes boss, tier and end, said in
+   * the post as "Boss changed to <label> from a screenshot by <member>" (`doer`), and told to the
+   * notifier as `/boss` is; anything else is refused, the battle named. A battle whose end came
+   * meanwhile is `gone`: its spot is free. No spot's lock: the battle holds the spot until its
+   * end, and a change is refused once that has come. `mayJoin` is the caller's, before.
+   */
+  async fromScreenshot(
+    partyId: string,
+    member: Member,
+    shot: MaxShot & { label: string },
+    autoStatus: PartyStatus,
+  ): Promise<MaxShotOutcome> {
+    let over = false;
+    let step: ReturnType<typeof screenshotAtBattle> | undefined;
+    let joined = false;
+    const outcome = await this.apply(
+      partyId,
+      member,
+      (party, now) => {
+        if (!blocksNewMax(party, now)) {
+          over = true;
+          return { ok: true, party };
+        }
+        step = screenshotAtBattle(party, shot, now);
+        if (!step.ok) return step;
+        const applied = applyAutoStatus(
+          step.party,
+          member.id,
+          autoStatus,
+          this.options.lobbySize(step.party),
+          now,
+        );
+        joined = applied.joined;
+        return { ok: true, party: applied.party };
+      },
+      (party) => {
+        if (!step?.ok) return [];
+        if (step.did === 'change') {
+          const who = doer(party, member);
+          const by = who === undefined ? '' : ` by ${who}`;
+          return [
+            `Boss changed to **${shot.label}** from a screenshot${by}, until ` +
+              `${timestamp(party.endTime ?? shot.end)}.`,
+            ...cancelledLines(party, step.removed),
+          ];
+        }
+        return step.endMoved && party.endTime !== null
+          ? [
+              said(
+                party,
+                member,
+                'set the end time from a screenshot',
+                'The end time was set from a screenshot',
+              ) + `: ${timestamp(party.endTime)}.`,
+            ]
+          : [];
+      },
+    );
+    if (outcome.kind === 'gone' || over) return { kind: 'gone' };
+    if (outcome.kind === 'refused') {
+      const there = this.options.store.get(partyId);
+      if (!there || !isMax(there)) return { kind: 'gone' };
+      return { kind: 'refused', reason: outcome.reason, party: there };
+    }
+    if (step?.ok && step.did === 'change') return { kind: 'changed', party: outcome.party };
+    return {
+      kind: 'joined',
+      party: outcome.party,
+      joined,
+      endMoved: step?.ok === true && step.did === 'join' && step.endMoved,
+      confirmed: step?.ok === true && step.did === 'join' && step.confirmed,
+    };
+  }
+
   /** Runs one change of a max battle inside the store, and tells of it when it was written. */
   private async apply(
     partyId: string,
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index 1470e606cc30dc6410cda1a4c073d9968f4f890c..66735f641703e6ee8e37c2c202f6a8f7630dd1e5 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -28,6 +28,7 @@ import {
   type TrainParty,
 } from '../../src/domain/party/party.js';
 import { FORUM_TAGS } from '../../src/render/party-post.js';
+import { lobbySize } from '../../src/domain/party/lobby.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import {
   PartyService,
@@ -479,7 +480,16 @@ export async function partyServiceWith(
     log,
     now,
   });
-  const maxes = new MaxChangeService({ store, posts: service, lines, notify, log, now });
+  const maxes = new MaxChangeService({
+    store,
+    posts: service,
+    lines,
+    notify,
+    // A size given to the party service (a test of lobbies) is the max changes' too.
+    lobbySize: forService.lobbySize ?? ((party) => lobbySize(party, settings.lobbies)),
+    log,
+    now,
+  });
   const timed = new TimedPartyService({
     store,
     gateway,
````

### Task 5: 8X-S 5: ScreenshotService's max path

Prototype commit: `e5f2584b52500449115733bcc91eff9439f70a56`

ScreenshotService.read tells the kind of screen by the reading: a max
battle's screen gets its max report and decision, over maxReportContext
(the max bosses, the Pokemon search restricted to what can Dynamax or
Gigantamax, every Pokemon for Eternamax, the server's Power Spots from the
kept Wayspots with the channel's region first and marked local, the max and
big events, the battle hours). The outcome says screen 'raid' (withGym) or
'max' (withSpot by Wayfarer id); /raid screenshot:, the mention and
/read-screenshot narrow it and still refuse a max screen as no raid screen
until the max flows come (tasks 5 to 7). The context of the service gains
maxBosses, wayspots, pokemon and gameData (app.ts, screenshotsWith).

The record keeps the raid report and raid bosses as before and gains max
(the max report), maxBosses and pickedSpotId (pickedSpot); a max record is
judged by its own max doubts (hasIssue, the review copy), keeps its picture
and text, and gets no answer key on "All right" (review R5). A passive
refusal keeps nothing, as for raids.

decideMax says whether the end is the day's last battle time (capped), for
the check just before reporting (review R11, reportMaxShotAs); a default end
passed by the upload is over-for-today too.

**Files:**

```
 docs/architecture/screenshots.md            |   5 ++-
 src/app.ts                                  |  12 +++++-
 src/commands/raids/raid.ts                  |   9 +++++
 src/commands/screenshots/mention.ts         |   2 +
 src/commands/screenshots/read-screenshot.ts |   9 ++++-
 src/domain/ocr/max-decision.ts              |  12 +++++-
 src/domain/ocr/max-report.test.ts           |  22 ++++++++++
 src/domain/ocr/screenshot-record.ts         |  15 +++++++
 src/services/screenshot-context.ts          |  54 +++++++++++++++++++++++++
 src/services/screenshot-service.test.ts     | 149 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/services/screenshot-service.ts          | 112 ++++++++++++++++++++++++++++++++++++++++++++++++---
 src/services/screenshot-store.test.ts       |  68 ++++++++++++++++++++++++++++++-
 src/services/screenshot-store.ts            |  47 ++++++++++++++++++----
 test/support/screenshot-service.ts          |  15 +++----
 14 files changed, 502 insertions(+), 29 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/ocr/max-report.test.ts src/services/screenshot-service.test.ts src/services/screenshot-store.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e5f2584b52500449115733bcc91eff9439f70a56 -- docs/architecture/screenshots.md src/app.ts src/commands/raids/raid.ts src/commands/screenshots/mention.ts src/commands/screenshots/read-screenshot.ts src/domain/ocr/max-decision.ts src/domain/ocr/max-report.test.ts src/domain/ocr/screenshot-record.ts src/services/screenshot-context.ts src/services/screenshot-service.test.ts src/services/screenshot-service.ts src/services/screenshot-store.test.ts src/services/screenshot-store.ts test/support/screenshot-service.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 5: ScreenshotService's max path`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 55134c51660292a5389c99cf0659472d4b1069be..42029eb27fcbc3f36b68d35a87c81a82091ca524 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -13,11 +13,12 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 - `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain; a CP that fits no boss takes the one boss of the heads' tier one digit off when the name read is clearly its), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). What is done with it is `decide` (below); its doubts are what the "Screenshot feedback" button shows.
 - Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
-- A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, a Pokémon search of what can Dynamax or Gigantamax (of every Pokémon on an Eternamax screen, `anyPokemon`: the game data lists Eternatus for no max battle) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon the game lets battle so with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old), with no ending-soon question. `withSpot(report, spot)` puts in the spot a member chose.
+- A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, a Pokémon search of what can Dynamax or Gigantamax (of every Pokémon on an Eternamax screen, `anyPokemon`: the game data lists Eternatus for no max battle) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon the game lets battle so with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `capped`: the end is the day's last battle time, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old), with no ending-soon question; a default end (no countdown) passed by the upload is `over-for-today` too. `withSpot(report, spot)` puts in the spot a member chose.
+- `ScreenshotService.read` tells the kind of screen by the reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search restricted to what can Dynamax or Gigantamax (`ctx.pokemon.find` with a filter; every Pokémon for `anyPokemon`), the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:`, the mention and `/read-screenshot` refuse a max screen as no raid screen until the max flows come (plan 8X-S, tasks 5 to 7). Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
 
 ## Keeping screenshots
 
-- Screenshots are kept by `ScreenshotStore` (`src/services/screenshot-store.ts`, `var/ocr/held/` and `var/ocr/review/`): every one read, with a record (`ScreenshotRecord`: the reading with only clock-like or short status-bar lines, the reader's own report and apart from it what the member typed, the decision, the boss list of the moment, where the time came from, the gym picked when asked, feedback; the ids of the sender and of who gave feedback, for staff and development only, never in a commit or a printout) for a day, a raid's while the raid is active and a day after (an active raid's is never deleted); one refused or asked about, one the reader itself had a doubt about (its own report's `doubts`, not what was typed), or one with feedback, is copied to review for `ocr.reviewDays`, at most `ocr.reviewPerDay` of a server a day; the hourly upkeep sweeps both, also stray and unreadable files after a day. A review copy is a hard link where the file system allows one, so a pair counts once. Both folders hold at most `ocr.keepMegabytes` (a start warns when `reviewPerDay` × `reviewDays` × 2 MB exceeds it): over it the oldest held screenshots without an issue (`hasIssue`: not reported unasked, a doubt, or "Something is wrong"; kept in an index built by the sweep, each read again before it goes) make room, then the oldest review copies that free bytes (not one hard-linked to its held screenshot), and when that is not enough the screenshot is read but not kept (a record kept alone counts its own bytes too). A passive read that was refused is not kept; a picture that is no raid screen keeps its record alone, with its lines' boxes and confidences but no text. "All right" makes the record's `label` (`memberLabel`: what the reader decided by itself; the gym the member picked, or else one read clearly, by its own name), "Something is wrong" by anybody takes it away.
+- Screenshots are kept by `ScreenshotStore` (`src/services/screenshot-store.ts`, `var/ocr/held/` and `var/ocr/review/`): every one read, with a record (`ScreenshotRecord`: the reading with only clock-like or short status-bar lines, the reader's own report and apart from it what the member typed, the decision, the boss list of the moment, where the time came from, the gym picked when asked, feedback; the ids of the sender and of who gave feedback, for staff and development only, never in a commit or a printout) for a day, a raid's while the raid is active and a day after (an active raid's is never deleted); one refused or asked about, one the reader itself had a doubt about (its own report's `doubts`, not what was typed), or one with feedback, is copied to review for `ocr.reviewDays`, at most `ocr.reviewPerDay` of a server a day; the hourly upkeep sweeps both, also stray and unreadable files after a day. A review copy is a hard link where the file system allows one, so a pair counts once. Both folders hold at most `ocr.keepMegabytes` (a start warns when `reviewPerDay` × `reviewDays` × 2 MB exceeds it): over it the oldest held screenshots without an issue (`hasIssue`: not reported unasked, a doubt, or "Something is wrong"; kept in an index built by the sweep, each read again before it goes) make room, then the oldest review copies that free bytes (not one hard-linked to its held screenshot), and when that is not enough the screenshot is read but not kept (a record kept alone counts its own bytes too). A passive read that was refused is not kept; a picture that is no raid screen keeps its record alone, with its lines' boxes and confidences but no text. A max battle's screen is kept as a raid's, picture and text (plan 8X-S, review R5): its record keeps the raid report of it (`not-a-raid-screen`) and the raid bosses as before, and beside them `max` (the max report, `StoredMaxReport`), `maxBosses` and, when asked, `pickedSpotId` (`pickedSpot`); such a record is judged by its max report's doubts (`ownDoubts`: `hasIssue` and the review copy) and gets no answer key on "All right". "All right" makes the record's `label` (`memberLabel`: what the reader decided by itself; the gym the member picked, or else one read clearly, by its own name), "Something is wrong" by anybody takes it away.
 
 ## On Discord
 
diff --git a/src/app.ts b/src/app.ts
index 618bb5db8bab4294dcbe12dc6b0efd770bb7502b..be3f0dddb2337ae24b67ce8bacca32a8e5f546f9 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -890,7 +890,17 @@ export async function startApp(
       attachments,
       reader: screenshotReader,
       store: screenshotStore,
-      context: { raidBosses, raidEvents, gyms, regions, config },
+      context: {
+        raidBosses,
+        raidEvents,
+        gyms,
+        regions,
+        config,
+        maxBosses,
+        wayspots,
+        pokemon,
+        gameData,
+      },
     }),
     emoji: emojiFinder(appEmoji, appEmojiSource),
     features: requested,
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index 00384ac93f5c17203d5efcab1b92bbd52835f07a..c0721ed7b4d0c94b2ee22c9a3b649f7c00f722ca 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -357,6 +357,15 @@ async function reportFromScreenshot(
     if (await typedOnly()) return;
     throw new UserError(unreadWords(outcome));
   }
+  if (outcome.screen === 'max') {
+    // A max battle's screen is no raid's: what was typed beside it is reported, else nothing.
+    if (await typedOnly()) return;
+    await interaction.editReply({
+      content: `${refusalWords('not-a-raid-screen')} Nothing was reported.`,
+      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
+    });
+    return;
+  }
   const { report, decision, id } = outcome;
   const read = readingLines(storedReport(report), gymNamerOf(ctx));
   const feedback = id === undefined ? [] : [feedbackRow(id)];
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index 41951769438836a0908ca0340c6894dda739f51d..15708a20625a63acaaa33e6f5cbdb31f115e1528 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -374,6 +374,8 @@ export class ScreenshotTrigger {
       return { kind: 'stopped', outcome };
     }
     if (outcome.kind !== 'read') return refused(unreadWords(outcome));
+    // A max battle's screen is no raid's.
+    if (outcome.screen === 'max') return refused(refusalWords('not-a-raid-screen'));
     const { report, decision, id } = outcome;
     if (decision.kind === 'refuse') return refused(refusalWords(decision.reason));
     // A clear gym that lies in this region is reported unasked; one in another region is asked
diff --git a/src/commands/screenshots/read-screenshot.ts b/src/commands/screenshots/read-screenshot.ts
index 57335b52d600b90ecd7cf46f3f578f2eb2eecdb4..0a838c70d1a281fdf7c3e5f98de1b7c4b870f277 100644
--- a/src/commands/screenshots/read-screenshot.ts
+++ b/src/commands/screenshots/read-screenshot.ts
@@ -5,7 +5,7 @@ import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { storedReport } from '../../domain/ocr/screenshot-record.js';
-import { screenshotMessage, SHOT_COLOUR } from '../../render/screenshot-reading.js';
+import { refusalWords, screenshotMessage, SHOT_COLOUR } from '../../render/screenshot-reading.js';
 import { textMessage } from '../../render/v2.js';
 import {
   unreadWords,
@@ -129,6 +129,13 @@ export const readScreenshot: SimpleCommand = {
       await interaction.editReply(v2Answer(textMessage(SHOT_COLOUR, [unreadWords(outcome)])));
       return;
     }
+    if (outcome.screen === 'max') {
+      // A max battle's screen is no raid's.
+      await interaction.editReply(
+        v2Answer(textMessage(SHOT_COLOUR, [refusalWords('not-a-raid-screen')])),
+      );
+      return;
+    }
     const decision =
       outcome.decision.kind === 'report'
         ? { kind: 'report' as const }
diff --git a/src/domain/ocr/max-decision.ts b/src/domain/ocr/max-decision.ts
index 3ece78abd78bdd224cf346f61ec0802dae62b97e..fbfdc01a36818e3221851dbf3ff813c8bfd3ba5d 100644
--- a/src/domain/ocr/max-decision.ts
+++ b/src/domain/ocr/max-decision.ts
@@ -37,6 +37,12 @@ export interface ScreenshotMax {
   sureMoment: boolean;
   /** The countdown ends at a rotation, not the all-day kind (`MaxScreenshotReport.rotationEnd`). */
   rotationEnd: boolean;
+  /**
+   * The end is the last battle time of the day (the countdown capped at it, or `/max`'s default
+   * end): once it has passed, max battles are over for today (Matt's M2), which the check just
+   * before reporting says (review R11, `reportMaxShotAs`).
+   */
+  capped: boolean;
   /**
    * The moment is no sure one (`!sureMoment`: guessed, or its sources disagree): said in the post
    * until `/end`. A dated file name or a clock read surely is exact however old (review A5).
@@ -64,7 +70,10 @@ export function decideMax(report: MaxScreenshotReport, context: MaxDecideContext
     if (report.countdownEnd <= report.firstBattle)
       return { kind: 'refuse', reason: 'before-first' };
   } else if (report.end <= now) {
-    return { kind: 'refuse', reason: 'battle-over' };
+    return {
+      kind: 'refuse',
+      reason: report.end === report.lastBattle ? 'over-for-today' : 'battle-over',
+    };
   }
   const { match } = report.spot;
   if (match.kind === 'unknown') {
@@ -89,6 +98,7 @@ export function decideMax(report: MaxScreenshotReport, context: MaxDecideContext
       takenAt: report.takenAt,
       sureMoment: report.sureMoment,
       rotationEnd: report.rotationEnd,
+      capped: report.end === report.lastBattle,
       timeUncertain: !report.sureMoment,
     },
     doubts,
diff --git a/src/domain/ocr/max-report.test.ts b/src/domain/ocr/max-report.test.ts
index 4d37f27141d80690cd6a7ee716428493ab3ec4d8..9f58a359d43e220e0ac263636c86d89fdbe2188a 100644
--- a/src/domain/ocr/max-report.test.ts
+++ b/src/domain/ocr/max-report.test.ts
@@ -305,6 +305,7 @@ describe('decideMax', () => {
         takenAt: at(THURSDAY),
         sureMoment: true,
         rotationEnd: true,
+        capped: false,
         timeUncertain: false,
       },
       doubts: [],
@@ -354,6 +355,27 @@ describe('decideMax', () => {
     ).toEqual({ kind: 'refuse', reason: 'over-for-today' });
   });
 
+  it('says an end capped at the last battle as capped, for the check before reporting (R11)', () => {
+    // Taken at 20:00, its countdown to 04:59: capped at 21:00.
+    expect(decided(screen({ countdown: 8 * 3600 + 59 * 60 }), '2026-10-22T20:00')).toMatchObject({
+      kind: 'report',
+      battle: { end: at('2026-10-22T21:00'), capped: true },
+    });
+    // Without a countdown the default end of the day's last battle is no less the day's end; one
+    // that passed before the upload is over for today.
+    expect(
+      decided(screen({ countdown: null }), '2026-10-22T20:00', '2026-10-22T20:00'),
+    ).toMatchObject({ kind: 'report', battle: { capped: true } });
+    const late = maxScreenshotReport(
+      screen({ countdown: null }),
+      context('2026-10-22T21:05', '2026-10-22T20:50'),
+    );
+    expect(decideMax(late, { now: at('2026-10-22T21:05') })).toEqual({
+      kind: 'refuse',
+      reason: 'over-for-today',
+    });
+  });
+
   it('refuses a battle its countdown says is over', () => {
     expect(decided(screen({ countdown: 10 * 60 }), '2026-10-22T14:15', '2026-10-22T14:00')).toEqual(
       { kind: 'refuse', reason: 'battle-over' },
diff --git a/src/domain/ocr/screenshot-record.ts b/src/domain/ocr/screenshot-record.ts
index cc13e565c680947246c5a61f44000133210eac49..58a00f1187396c361ce3c9f4cdfa2f17caecf95b 100644
--- a/src/domain/ocr/screenshot-record.ts
+++ b/src/domain/ocr/screenshot-record.ts
@@ -1,4 +1,6 @@
+import type { MaxTier } from '../pogo/max-tier.js';
 import type { RaidTier } from '../pogo/raid-tier.js';
+import type { MaxScreenshotReport } from './max-report.js';
 import type { ScreenshotReport } from './screenshot-report.js';
 
 /**
@@ -23,6 +25,19 @@ export function storedReport(report: ScreenshotReport): StoredReport {
   };
 }
 
+/**
+ * The max report as it is kept (plan 8X-S, review R5): plain data already (the boss by its
+ * reference and name, the spot by its Wayfarer id and title), kept as it is.
+ */
+export type StoredMaxReport = MaxScreenshotReport;
+
+/** A max boss of the list as a record keeps it (`ScreenshotRecord.maxBosses`). */
+export interface StoredMaxBoss {
+  key: string;
+  name: string;
+  tier: MaxTier;
+}
+
 /** How a screenshot came to be read. */
 export const SCREENSHOT_USES = ['read-screenshot', 'raid', 'mention', 'passive'] as const;
 export type ScreenshotUse = (typeof SCREENSHOT_USES)[number];
diff --git a/src/services/screenshot-context.ts b/src/services/screenshot-context.ts
index f6e813a1d4be8e7517de758ccfadd1f69adec2bd..4fab22e90020c8d42634d699f5c794e7a2746b96 100644
--- a/src/services/screenshot-context.ts
+++ b/src/services/screenshot-context.ts
@@ -1,4 +1,6 @@
 import type { AppContext } from '../app-context.js';
+import type { MaxReportContext } from '../domain/ocr/max-report.js';
+import type { SpotTitle } from '../domain/ocr/power-spot-match.js';
 import type { ReportContext } from '../domain/ocr/screenshot-report.js';
 import { takenAtFromFileName } from '../domain/ocr/file-time.js';
 import { gymInGuild } from './region-directory.js';
@@ -39,3 +41,55 @@ export function reportContext(
     ...(fileTakenAt === undefined ? {} : { fileTakenAt }),
   };
 }
+
+/**
+ * What `maxScreenshotReport` needs, from the bot (plan 8X-S): the max bosses in effect, the
+ * Pokémon search over what can Dynamax or Gigantamax (as `/max` accepts typed; of every Pokémon
+ * for an Eternamax screen, `anyPokemon`), the server's Power Spots (`ctx.wayspots` of each of its
+ * regions, those of the channel's region marked `local` and first; review R15), the max and big
+ * events and the battle hours, and the moment as `reportContext` has it.
+ */
+export function maxReportContext(
+  ctx: Pick<
+    AppContext,
+    'maxBosses' | 'raidEvents' | 'wayspots' | 'regions' | 'pokemon' | 'gameData' | 'config'
+  >,
+  where: { channelId: string | null; guildRow: number },
+  uploadedAt: number,
+  fileName?: string,
+): MaxReportContext {
+  const { settings } = ctx.config;
+  const { catalogue } = ctx.gameData;
+  const fileTakenAt =
+    fileName === undefined ? undefined : takenAtFromFileName(fileName, settings.timezone);
+  const channels = [
+    ...(where.channelId === null ? [] : [where.channelId]),
+    ...ctx.regions
+      .all()
+      .filter((region) => region.guildId === where.guildRow)
+      .map((region) => region.channelId),
+  ];
+  const spots = new Map<string, SpotTitle>();
+  for (const channelId of new Set(channels)) {
+    for (const spot of ctx.wayspots.inRegion(channelId)) {
+      if (spot.kind !== 'powerspot' || spot.title.trim() === '' || spots.has(spot.id)) continue;
+      spots.set(spot.id, { id: spot.id, title: spot.title, local: channelId === where.channelId });
+    }
+  }
+  const maxable = (entry: Parameters<typeof catalogue.canDynamax>[0]): boolean =>
+    catalogue.canDynamax(entry) || catalogue.canGigantamax(entry);
+  return {
+    bosses: ctx.maxBosses.bosses(),
+    species: (read) => ctx.pokemon.find(read, { limit: 1, filter: maxable })[0]?.entry,
+    anyPokemon: (read) => ctx.pokemon.find(read, { limit: 1 })[0]?.entry,
+    catalogue,
+    spots: [...spots.values()],
+    hours: settings.maxBattles,
+    events: ctx.raidEvents.maxEvents(),
+    big: ctx.raidEvents.bigEvents(),
+    uploadedAt,
+    zone: settings.timezone,
+    guessOffsetSeconds: settings.screenshotMessageOffsetTime,
+    ...(fileTakenAt === undefined ? {} : { fileTakenAt }),
+  };
+}
diff --git a/src/services/screenshot-service.test.ts b/src/services/screenshot-service.test.ts
index 9005ecfc0c1cc8e0f78c9644baeb0efa895d4eca..1e560635d439f22ebdfbaaa40e544476123b433a 100644
--- a/src/services/screenshot-service.test.ts
+++ b/src/services/screenshot-service.test.ts
@@ -1,9 +1,13 @@
 import { DateTime } from 'luxon';
-import { describe, expect, it } from 'vitest';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
-import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
+import { at, TEST_SPOT } from '../../test/support/parties.js';
 import { screenshotsWith } from '../../test/support/screenshot-service.js';
 import { eggReading, readingOf } from '../../test/support/screenshots.js';
+import { keptRow } from '../../test/support/wayspot-cases.js';
+import type { MaxText } from '../domain/ocr/raid-screen.js';
 import { MAX_SCREENSHOT_BYTES } from './ocr-service.js';
 import {
   isImageAttachment,
@@ -85,7 +89,9 @@ describe('ScreenshotService', () => {
       unclear,
       where({ channelId: null, typed: { gymId: 5 } }),
     );
-    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
+    if (outcome.kind !== 'read' || outcome.screen !== 'raid' || !outcome.id) {
+      throw new Error('not kept');
+    }
     expect(outcome.report.gym).toMatchObject({ gymId: 5, clear: true });
     const kept = await screenshots.get(outcome.id);
     expect(kept).toMatchObject({
@@ -199,6 +205,143 @@ describe('ScreenshotService', () => {
   });
 });
 
+describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  /** A Dynamax Machop (2★) at `spot`, the clock read surely at 13:58, 30 minutes to go. */
+  const maxReading = (spot = 'GAZEBO OF THE PARK', max: Partial<MaxText> = {}) =>
+    readingOf(
+      {
+        clock: { hour: 13, minute: 58, confidence: 0.97 },
+        countdown: 30 * 60,
+        countdownPlace: 'centre',
+        max: {
+          form: 'dynamax',
+          species: 'MACHOP',
+          powerSpot: spot,
+          spotConfidence: 0.95,
+          box: { x0: 100, y0: 1200, x1: 900, y1: 1260 },
+          ...max,
+        },
+      },
+      { heads: 2 },
+    );
+  const maxWhere = (more: Partial<ScreenshotWhere> = {}) =>
+    where({ uploadedAt: MAX_THURSDAY, use: 'mention', ...more });
+  /** A second Power Spot whose name begins as the test spot's. */
+  const POND = keptRow(2, {
+    id: 'c0ffee00c0ffee00c0ffee00c0ffee01.16',
+    kind: 'powerspot',
+    title: 'Gazebo of the Pond',
+    lat: TEST_SPOT.lat + 0.0001,
+    lon: TEST_SPOT.lon,
+  });
+
+  it('reads a max screen the max way, and keeps it with its max report and the max bosses', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.read(screenshot('max.png', maxReading()), maxWhere());
+    expect(outcome).toMatchObject({
+      kind: 'read',
+      screen: 'max',
+      report: {
+        form: 'dynamax',
+        boss: { ref: { key: 'machop' }, listed: true },
+        tier: 'D2',
+        spot: { readSurely: true, match: { kind: 'clear', spot: { id: TEST_SPOT.id } } },
+      },
+      decision: {
+        kind: 'report',
+        battle: {
+          spotId: TEST_SPOT.id,
+          boss: { key: 'machop' },
+          tier: 'D2',
+          end: at('2026-10-22T14:28'),
+          sureMoment: true,
+          capped: false,
+        },
+      },
+    });
+    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
+    // Its picture and text kept; no doubt of its own, so no review copy.
+    expect(files('held')).toEqual([`${outcome.id}.json`, `${outcome.id}.png`]);
+    expect(files('review')).toEqual([]);
+    const kept = await screenshots.get(outcome.id);
+    if (!kept || kept === 'gone') throw new Error('not kept');
+    expect(kept.record).toMatchObject({
+      use: 'mention',
+      decision: { kind: 'report' },
+      max: { spot: { read: 'GAZEBO OF THE PARK' }, doubts: [] },
+      report: { doubts: expect.arrayContaining(['not-a-raid-screen']) as unknown },
+    });
+    expect(kept.record.maxBosses).toContainEqual({ key: 'machop', name: 'Machop', tier: 'D2' });
+  });
+
+  it('asks which Power Spot a name cut short may be, and decides again with the one chosen', async () => {
+    const made = await maxReportingWith(undefined, [POND]);
+    const { screenshots, screenshot } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.read(
+      screenshot('max.png', maxReading('GAZEBO OF THE P')),
+      maxWhere(),
+    );
+    if (outcome.kind !== 'read' || outcome.screen !== 'max') throw new Error('not a max read');
+    expect(outcome.decision).toMatchObject({ kind: 'ask', about: 'spot' });
+    expect(outcome.withSpot(POND.id)).toMatchObject({
+      kind: 'report',
+      battle: { spotId: POND.id },
+    });
+    // A spot it does not know of the server: as nothing chosen.
+    expect(outcome.withSpot('not-a-spot')).toMatchObject({ kind: 'ask', about: 'spot' });
+  });
+
+  it('knows the Power Spots of the whole server, those of another region not as local', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.read(
+      screenshot('max.png', maxReading()),
+      maxWhere({ channelId: EAST_CHANNEL }),
+    );
+    expect(outcome).toMatchObject({
+      screen: 'max',
+      report: { spot: { match: { kind: 'clear', spot: { id: TEST_SPOT.id, local: false } } } },
+    });
+  });
+
+  it('finds the boss only among the Pokémon that can Dynamax or Gigantamax', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.read(
+      screenshot('max.png', maxReading(undefined, { species: 'MEWTWO' })),
+      maxWhere(),
+    );
+    expect(outcome).toMatchObject({
+      screen: 'max',
+      report: { boss: null },
+      decision: { kind: 'refuse', reason: 'no-boss' },
+    });
+  });
+
+  it('keeps nothing of a passive read of a max screen it refused', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.read(
+      screenshot('max.png', maxReading('NOWHERE IN PARTICULAR')),
+      maxWhere({ use: 'passive' }),
+    );
+    expect(outcome).toMatchObject({
+      screen: 'max',
+      id: undefined,
+      decision: { kind: 'refuse', reason: 'no-spot' },
+    });
+    expect(files('held')).toEqual([]);
+  });
+});
+
 describe('screenshotsOf', () => {
   it('takes pictures by their content type or, without one, their name; ten at most', () => {
     const file = (name: string, contentType: string | null) => ({
diff --git a/src/services/screenshot-service.ts b/src/services/screenshot-service.ts
index 5462e3c2d1db36bfaafb281efc096052e800d470..a55be69aced4df763b34dc80c515586cb3137b47 100644
--- a/src/services/screenshot-service.ts
+++ b/src/services/screenshot-service.ts
@@ -1,4 +1,6 @@
 import type { AppContext } from '../app-context.js';
+import { decideMax, withSpot, type MaxDecision } from '../domain/ocr/max-decision.js';
+import { maxScreenshotReport, type MaxScreenshotReport } from '../domain/ocr/max-report.js';
 import {
   decide,
   withTyped,
@@ -19,7 +21,7 @@ import type { ScreenReading } from '../ocr/screen-reader.js';
 import { screenshotReport, type ScreenshotReport } from '../domain/ocr/screenshot-report.js';
 import type { AttachmentGateway } from './attachment-gateway.js';
 import { MAX_SCREENSHOT_BYTES, type ScreenshotReader } from './ocr-service.js';
-import { reportContext } from './screenshot-context.js';
+import { maxReportContext, reportContext } from './screenshot-context.js';
 import type { KeptScreenshot, ScreenshotKeeping } from './screenshot-store.js';
 
 /** The images of one message that are read, in order: as many as Discord allows a message. */
@@ -74,9 +76,16 @@ export interface ScreenshotWhere {
   startBy?: number;
 }
 
+/**
+ * What came of a screenshot. One that was read says which kind of screen it was (`screen`, plan
+ * 8X-S): a raid's with the raid report and decision and `withGym`, a max battle's with the max
+ * report and decision and `withSpot`. What a caller expects is the caller's: it refuses the
+ * other kind itself.
+ */
 export type ScreenshotOutcome =
   | {
       kind: 'read';
+      screen: 'raid';
       /** The kept screenshot's id; undefined when it was not kept. */
       id: string | undefined;
       report: ScreenshotReport;
@@ -87,6 +96,19 @@ export type ScreenshotOutcome =
        */
       withGym: (gymId: number) => ScreenshotDecision;
     }
+  | {
+      kind: 'read';
+      screen: 'max';
+      /** The kept screenshot's id; undefined when it was not kept. */
+      id: string | undefined;
+      report: MaxScreenshotReport;
+      decision: MaxDecision;
+      /**
+       * The decision had the member chosen this Power Spot (its Wayfarer id; the spot question
+       * answered): one the server does not have decides as nothing chosen.
+       */
+      withSpot: (spotId: string) => MaxDecision;
+    }
   /** Larger than a screenshot can be. */
   | { kind: 'too-large' }
   /** The download from Discord failed. */
@@ -105,6 +127,8 @@ export interface Screenshots {
   inUse(id: string): Promise<void>;
   /** The gym the member chose when they were asked. */
   picked(id: string, gymId: number): Promise<void>;
+  /** The Power Spot (its Wayfarer id) the member chose when they were asked. */
+  pickedSpot(id: string, spotId: string): Promise<void>;
   feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'>;
 }
 
@@ -112,10 +136,27 @@ export interface ScreenshotServiceOptions {
   attachments: AttachmentGateway;
   reader: ScreenshotReader;
   store: ScreenshotKeeping;
-  /** What the report needs of the bot: the bosses, the gyms, the regions, the settings. */
-  context: Pick<AppContext, 'raidBosses' | 'raidEvents' | 'gyms' | 'regions' | 'config'>;
+  /**
+   * What the reports need of the bot: the raid and max bosses, the events, the gyms, the Power
+   * Spots, the regions, the Pokémon search and catalogue, the settings.
+   */
+  context: ScreenshotContext;
 }
 
+/** What `ScreenshotService` reads of the bot (`ScreenshotServiceOptions.context`). */
+export type ScreenshotContext = Pick<
+  AppContext,
+  | 'raidBosses'
+  | 'raidEvents'
+  | 'gyms'
+  | 'regions'
+  | 'config'
+  | 'maxBosses'
+  | 'wayspots'
+  | 'pokemon'
+  | 'gameData'
+>;
+
 /**
  * A screenshot from Discord to what Pine makes of it: downloaded (`AttachmentGateway`, at most
  * `MAX_SCREENSHOT_BYTES`, and only when the reader's queue has room: `busy` otherwise), read (`ScreenshotReader`), reported on (`screenshotReport` in the
@@ -150,6 +191,9 @@ export class ScreenshotService implements Screenshots {
       source.name,
     );
     const read = screenshotReport(outcome.reading, reportFrom);
+    if (outcome.reading.text.max) {
+      return this.readMax(download.bytes, outcome.reading, read, where, source.name);
+    }
     const typed = typeof where.typed === 'function' ? where.typed(read) : where.typed;
     const report = typed ? withTyped(read, typed) : read;
     const { settings } = context.config;
@@ -191,7 +235,60 @@ export class ScreenshotService implements Screenshots {
           },
           image,
         );
-    return { kind: 'read', id, report, decision, withGym };
+    return { kind: 'read', screen: 'raid', id, report, decision, withGym };
+  }
+
+  /**
+   * A max battle's screen (plan 8X-S): the max report (`maxScreenshotReport`) over the server's
+   * Power Spots and the max bosses, decided (`decideMax`) and kept beside the raid report of it
+   * (review R5), picture and text, as a raid's; a passive refusal keeps nothing.
+   */
+  private async readMax(
+    bytes: Uint8Array,
+    reading: ScreenReading,
+    raidRead: ScreenshotReport,
+    where: ScreenshotWhere,
+    fileName: string,
+  ): Promise<ScreenshotOutcome> {
+    const { store, context } = this.options;
+    const maxFrom = maxReportContext(
+      context,
+      { channelId: where.channelId, guildRow: where.guildRow },
+      where.uploadedAt,
+      fileName,
+    );
+    const report = maxScreenshotReport(reading, maxFrom);
+    const deciding = { now: where.uploadedAt };
+    const decision = decideMax(report, deciding);
+    const withSpotOf = (spotId: string): MaxDecision => {
+      const spot = maxFrom.spots.find((one) => one.id === spotId);
+      return spot ? decideMax(withSpot(report, spot), deciding) : decision;
+    };
+    const id =
+      where.use === 'passive' && decision.kind === 'refuse'
+        ? undefined
+        : await store.keep(bytes, {
+            guildId: where.guildId,
+            use: where.use,
+            senderId: where.senderId,
+            uploadedAt: where.uploadedAt,
+            fileTakenAt: maxFrom.fileTakenAt ?? null,
+            timeFrom: report.timeFrom,
+            reading: keptReading(reading),
+            report: storedReport(raidRead),
+            max: report,
+            typed: null,
+            decision: decision.kind === 'report' ? { kind: 'report' } : storedDecision(decision),
+            bosses: context.raidBosses
+              .bosses()
+              .map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier })),
+            maxBosses: maxFrom.bosses.map((boss) => ({
+              key: boss.key,
+              name: boss.name,
+              tier: boss.tier,
+            })),
+          });
+    return { kind: 'read', screen: 'max', id, report, decision, withSpot: withSpotOf };
   }
 
   get(id: string): Promise<KeptScreenshot | 'gone' | undefined> {
@@ -202,6 +299,10 @@ export class ScreenshotService implements Screenshots {
     return this.options.store.picked(id, gymId);
   }
 
+  pickedSpot(id: string, spotId: string): Promise<void> {
+    return this.options.store.pickedSpot(id, spotId);
+  }
+
   inUse(id: string): Promise<void> {
     return this.options.store.inUse(id);
   }
@@ -257,7 +358,8 @@ function storedTyped(typed: TypedValues): StoredTyped {
 }
 
 function storedDecision(
-  decision: Exclude<ScreenshotDecision, { kind: 'report' }>,
+  decision:
+    Exclude<ScreenshotDecision, { kind: 'report' }> | Exclude<MaxDecision, { kind: 'report' }>,
 ): { kind: 'ask'; doubts: string[] } | { kind: 'refuse'; reason: string } {
   return decision.kind === 'ask'
     ? { kind: 'ask', doubts: [...decision.doubts] }
diff --git a/src/services/screenshot-store.test.ts b/src/services/screenshot-store.test.ts
index 0a80a054d138c2e34aa617e379a1e388ac605a8a..aaa348a9be649a6a8746a0f91610f95089ab4f25 100644
--- a/src/services/screenshot-store.test.ts
+++ b/src/services/screenshot-store.test.ts
@@ -11,8 +11,14 @@ import path from 'node:path';
 import { describe, expect, it } from 'vitest';
 import { eggReading } from '../../test/support/screenshots.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
-import { storedReport, type StoredReport } from '../domain/ocr/screenshot-record.js';
+import type { MaxDoubt } from '../domain/ocr/max-report.js';
 import {
+  storedReport,
+  type StoredMaxReport,
+  type StoredReport,
+} from '../domain/ocr/screenshot-record.js';
+import {
+  hasIssue,
   ScreenshotStore,
   type NewScreenshot,
   type ScreenshotStoreOptions,
@@ -45,6 +51,33 @@ const report = (doubts: StoredReport['doubts'] = []): StoredReport =>
     doubts,
   });
 
+/** What the max report of a clear Dynamax Machop (2★) at an invented Power Spot keeps. */
+const maxReport = (doubts: MaxDoubt[] = []): StoredMaxReport => ({
+  form: 'dynamax',
+  speciesRead: 'MACHOP',
+  boss: { ref: { key: 'machop' }, name: 'Machop', listed: true },
+  heads: 2,
+  tier: 'D2',
+  tierFrom: 'list',
+  spot: {
+    read: 'MAPLE BENCH EAST',
+    readSurely: true,
+    match: { kind: 'clear', spot: { id: 'w2', title: 'Maple Bench East', local: true } },
+  },
+  clock: { hour: 13, minute: 39 },
+  countdown: 1800,
+  takenAt: 0,
+  timeFrom: 'clock',
+  sureMoment: true,
+  countdownEnd: 1_800_000,
+  end: 1_800_000,
+  endFrom: 'countdown',
+  rotationEnd: true,
+  firstBattle: 0,
+  lastBattle: 2 * 3_600_000,
+  doubts,
+});
+
 function screenshot(
   decision: NewScreenshot['decision'] = { kind: 'report' },
   more: Partial<NewScreenshot> = {},
@@ -176,6 +209,39 @@ describe('ScreenshotStore', () => {
     expect(files('review')).not.toContain(`${more}.json`);
   });
 
+  it('judges a max screenshot by its own doubts, not by the raid report of it', async () => {
+    const { store, files } = storeWith();
+    // The raid report of a max screen always says it is no raid's.
+    const raidOf = report(['not-a-raid-screen']);
+    const clean = screenshot({ kind: 'report' }, { report: raidOf, max: maxReport() });
+    expect(hasIssue({ ...clean, feedback: [] })).toBe(false);
+    await kept(store, clean);
+    expect(files('review')).toEqual([]);
+    const doubted = screenshot(
+      { kind: 'report' },
+      { report: raidOf, max: maxReport(['spot-read-poorly']) },
+    );
+    expect(hasIssue({ ...doubted, feedback: [] })).toBe(true);
+    const id = await kept(store, doubted);
+    expect(files('review')).toEqual([`${id}.json`, `${id}.png`]);
+  });
+
+  it('makes no answer key of "All right" on a max screenshot, and keeps the Power Spot picked', async () => {
+    const { store, json } = storeWith();
+    const id = await kept(
+      store,
+      screenshot(
+        { kind: 'ask', doubts: ['spot-unclear'] },
+        { report: report(['not-a-raid-screen']), max: maxReport(['spot-unclear']) },
+      ),
+    );
+    await store.pickedSpot(id, 'w2');
+    await store.feedback(id, SENDER, { verdict: 'right' });
+    const record = json('review', id);
+    expect(record).toMatchObject({ pickedSpotId: 'w2', pickedGymId: null });
+    expect(record.label).toBeUndefined();
+  });
+
   it('copies no screenshot reported unasked and without a doubt to review', async () => {
     const { store, files } = storeWith();
     await kept(store, screenshot({ kind: 'report' }));
diff --git a/src/services/screenshot-store.ts b/src/services/screenshot-store.ts
index 2e417b3a679b82787dd7dbb896347340acf15925..01443a60797a1ddfc517baf9c7349c522695259b 100644
--- a/src/services/screenshot-store.ts
+++ b/src/services/screenshot-store.ts
@@ -20,6 +20,8 @@ import {
   type MemberLabel,
   type ScreenshotUse,
   type StoredDecision,
+  type StoredMaxBoss,
+  type StoredMaxReport,
   type StoredReport,
   type StoredTyped,
 } from '../domain/ocr/screenshot-record.js';
@@ -62,16 +64,28 @@ export interface ScreenshotRecord {
    * only the lines that look like a clock or are short (notification previews are left out).
    */
   reading: ScreenReading;
-  /** What the reader made of it by itself. */
+  /**
+   * What the reader made of it by itself as a raid's screen (of a max battle's screen too: that
+   * it is none, `not-a-raid-screen`).
+   */
   report: StoredReport;
+  /**
+   * What the reader made of a max battle's screen by itself (plan 8X-S, review R5); absent on
+   * any other, and in records read before it. A record that has it is judged by it.
+   */
+  max?: StoredMaxReport;
   /** What the member typed beside it (`/raid`), which the decision put in its place. */
   typed: StoredTyped | null;
   /** What was decided, from the report with what was typed. */
   decision: StoredDecision;
   /** The gym the member chose when they were asked. */
   pickedGymId: number | null;
+  /** The Power Spot (its Wayfarer id) the member chose when they were asked (plan 8X-S). */
+  pickedSpotId?: string;
   /** The raid bosses in effect at the read, which the boss was decided among (`ocr:check`). */
   bosses: { key: string; name: string; tier: RaidTier }[];
+  /** The max bosses in effect at the read of a max battle's screen, its boss decided among. */
+  maxBosses?: StoredMaxBoss[];
   /** When the files go; null while a raid made from it is active (its post shows it). */
   keepUntil: number | null;
   feedback: FeedbackRecord[];
@@ -100,6 +114,8 @@ export interface ScreenshotKeeping {
   inUse(id: string): Promise<void>;
   /** The gym the member chose when asked. */
   picked(id: string, gymId: number): Promise<void>;
+  /** The Power Spot (its Wayfarer id) the member chose when asked. */
+  pickedSpot(id: string, spotId: string): Promise<void>;
   feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'>;
   sweep(): Promise<void>;
 }
@@ -125,16 +141,25 @@ export interface ScreenshotStoreOptions {
 
 const ID = /^[A-Za-z0-9_-]{12}$/;
 
+/**
+ * The reader's own doubts of a record: a max battle's screen by its max report (its raid report
+ * always says it is no raid screen), any other by its raid report.
+ */
+function ownDoubts(record: Pick<ScreenshotRecord, 'report' | 'max'>): readonly string[] {
+  return record.max ? record.max.doubts : record.report.doubts;
+}
+
 /**
  * A screenshot worth keeping longest (Matt, 2026-10-14): one that was not reported unasked,
- * raised a doubt, or that somebody said was read wrong. "All right" is no issue.
+ * raised a doubt of the reader's own (`ownDoubts`), or that somebody said was read wrong. "All
+ * right" is no issue.
  */
 export function hasIssue(
-  record: Pick<ScreenshotRecord, 'decision' | 'report' | 'feedback'>,
+  record: Pick<ScreenshotRecord, 'decision' | 'report' | 'max' | 'feedback'>,
 ): boolean {
   return (
     record.decision.kind !== 'report' ||
-    record.report.doubts.length > 0 ||
+    ownDoubts(record).length > 0 ||
     record.feedback.some((f) => f.verdict === 'wrong')
   );
 }
@@ -214,7 +239,7 @@ export class ScreenshotStore implements ScreenshotKeeping {
       await this.serially(this.key(this.held, id), async () => {
         await this.write(this.held, record);
         this.index(record);
-        if (record.decision.kind !== 'report' || record.report.doubts.length > 0) {
+        if (record.decision.kind !== 'report' || ownDoubts(record).length > 0) {
           await this.toReview(record);
         }
       });
@@ -247,6 +272,10 @@ export class ScreenshotStore implements ScreenshotKeeping {
     return this.change(id, (record) => ({ ...record, pickedGymId: gymId }), true);
   }
 
+  pickedSpot(id: string, spotId: string): Promise<void> {
+    return this.change(id, (record) => ({ ...record, pickedSpotId: spotId }), true);
+  }
+
   /**
    * Records a member's feedback (their earlier one is replaced) and copies the screenshot to
    * review. "All right" makes the reading the screenshot's answer key, for what the reader
@@ -269,9 +298,11 @@ export class ScreenshotStore implements ScreenshotKeeping {
         const all = [...others, entry];
         const { label: _old, ...rest } = record;
         const disputed = all.some((f) => f.verdict === 'wrong');
-        const label = disputed
-          ? undefined
-          : memberLabel(record.report, record.typed, this.options.gymName, record.pickedGymId);
+        // A max battle's screen has no answer key `ocr:check` scores (plan 8X-S, review R5).
+        const label =
+          disputed || record.max
+            ? undefined
+            : memberLabel(record.report, record.typed, this.options.gymName, record.pickedGymId);
         return { ...rest, feedback: all, ...(label ? { label } : {}) };
       },
       true,
diff --git a/test/support/screenshot-service.ts b/test/support/screenshot-service.ts
index e59902e83d155937fc0e94974f9380ef954cdeb9..95df937bd1c845d22f3ae81937aa2cf2549ba749 100644
--- a/test/support/screenshot-service.ts
+++ b/test/support/screenshot-service.ts
@@ -1,10 +1,13 @@
 import { mkdtempSync, readdirSync } from 'node:fs';
 import { tmpdir } from 'node:os';
 import path from 'node:path';
-import type { AppContext } from '../../src/app-context.js';
 import type { ScreenReading } from '../../src/ocr/screen-reader.js';
 import type { OcrOutcome } from '../../src/services/ocr-service.js';
-import { ScreenshotService, type ScreenshotSource } from '../../src/services/screenshot-service.js';
+import {
+  ScreenshotService,
+  type ScreenshotContext,
+  type ScreenshotSource,
+} from '../../src/services/screenshot-service.js';
 import { ScreenshotStore } from '../../src/services/screenshot-store.js';
 import { FakeAttachments } from './attachments.js';
 import { FakeScreenshotReader } from './screenshots.js';
@@ -16,13 +19,11 @@ import { createTestLogger } from './test-logger.js';
  * folder of its own under the system's temporary folder. `screenshot(name, answer)` gives an
  * attachment whose download is a screenshot that reads as `answer`; `shown` is the set of
  * screenshot ids active raids show (for the store's sweep); `files(folder)` lists `held` or
- * `review`. The bosses, gyms and regions are the test context's, or those of `context`.
+ * `review`. The bosses, gyms, regions, Power Spots and the rest are the test context's, or those
+ * of `context` (`maxReportingWith().ctx` for max battles' screens).
  */
 export function screenshotsWith(
-  context: Pick<
-    AppContext,
-    'raidBosses' | 'raidEvents' | 'gyms' | 'regions' | 'config'
-  > = createTestContext().ctx,
+  context: ScreenshotContext = createTestContext().ctx,
   now?: () => number,
 ) {
   const dir = mkdtempSync(path.join(tmpdir(), 'pine-screenshots-'));
````

### Task 6: 8X-S 6: max screenshots posted in a channel; /raid's refusal; the moderators' note

Prototype commit: `c188d57ac208382af52af60751179cb0d0846319`

A max battle's screenshot posted with a mention of the bot, or read
passively, goes the max way in ScreenshotTrigger.readOne (readMax), sharing
the loop, the per-image throttle, the reactions, the replies and the
message's clean-up with raids:

- A clear Power Spot of the message's region is reported unasked through
  reportMaxShot (commands/max/max-shot.ts, for /max screenshot: too): the
  forum bar (maxBarred) first, then reportMaxShotAs (a battle there joined,
  its boss changed by a newer sure screenshot, or refused; else a new one);
  the screenshot kept while its post shows it. Words: maxShotWords, /max's
  where /max says the same; "Changed the boss of the max battle at <spot> to
  <boss> from your screenshot, until <end>."; an end moved later "Its end is
  now <end>, from your screenshot."; an end passed by now in the words of
  its kind (R11, M2).
- With a mention, a Power Spot not clear, or a clear one of another region,
  is asked about with a menu (shot:<token>:spot; PendingShot is now a union
  of a gym and a spot question; answerSpot as answerShot, sharing the
  take, the ask-again and the answer in place); one it does not know is
  refused "I don't know a Power Spot called "<name>" here: use /max spot:."
  and, for a name read surely, the moderators told (R13), which the
  refusal then says.
- Read passively (R12, Matt's answers): only "I couldn't tell which Power
  Spot this is: use /max screenshot:." for a spot unclear or unknown (in
  the reply that pings the author), a battle joined or its boss changed;
  a clear spot of another region is joined there unasked, or asked Yes or
  No about as a gym (M1; reportMaxShotAs with joinOnly); all else silent.
- ModerationReports.missingSpot: a plain note in the moderators' channel,
  once per name (spotNameKey) and server in seven days (a BoundedMap);
  true when the staff were told, now or before; without the channel a
  log line and false.
- /raid screenshot: given a max screen: "That's a max battle: use
  /max screenshot:, or post it with a mention.", also beside a typed boss
  and gym.
- An expired question says "Post the screenshot again." (no longer only
  /raid). The posted message of the tests is test/support/posted-message.ts,
  the max reading test/support/screenshots.ts's maxReading.

**Files:**

```
 docs/architecture/moderation.md              |   1 +
 docs/architecture/screenshots.md             |   4 +-
 src/commands/max/max-report.ts               |   4 +-
 src/commands/max/max-shot.ts                 | 209 ++++++++++++++++++++++++++-
 src/commands/raids/raid-screenshot.test.ts   |  13 +-
 src/commands/raids/raid.ts                   |  12 +-
 src/commands/screenshots/feedback.ts         |  15 +-
 src/commands/screenshots/mention.max.test.ts | 391 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/screenshots/mention.test.ts     |  58 +-------
 src/commands/screenshots/mention.ts          | 523 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/domain/ocr/power-spot-match.ts           |  13 +-
 src/render/moderation.ts                     |  12 ++
 src/render/screenshot-reading.ts             |  72 +++++++++-
 src/services/moderation-reports.spot.test.ts |  86 +++++++++++
 src/services/moderation-reports.ts           |  50 +++++++
 src/services/screenshot-service.test.ts      |  21 +--
 test/support/posted-message.ts               |  51 +++++++
 test/support/screenshots.ts                  |  32 ++++-
 18 files changed, 1396 insertions(+), 171 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/raids/raid-screenshot.test.ts src/commands/screenshots/mention.max.test.ts src/commands/screenshots/mention.test.ts src/services/moderation-reports.spot.test.ts src/services/screenshot-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c188d57ac208382af52af60751179cb0d0846319 -- docs/architecture/moderation.md docs/architecture/screenshots.md src/commands/max/max-report.ts src/commands/max/max-shot.ts src/commands/raids/raid-screenshot.test.ts src/commands/raids/raid.ts src/commands/screenshots/feedback.ts src/commands/screenshots/mention.max.test.ts src/commands/screenshots/mention.test.ts src/commands/screenshots/mention.ts src/domain/ocr/power-spot-match.ts src/render/moderation.ts src/render/screenshot-reading.ts src/services/moderation-reports.spot.test.ts src/services/moderation-reports.ts src/services/screenshot-service.test.ts test/support/posted-message.ts test/support/screenshots.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 6: max screenshots posted in a channel; /raid's refusal; the moderators' note`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/moderation.md b/docs/architecture/moderation.md
index 0d3f594efa18ac45933cb2ca4431dde6e7c36673..c957221a5b603e4440c6f36f08a871f2893aa875 100644
--- a/docs/architecture/moderation.md
+++ b/docs/architecture/moderation.md
@@ -18,6 +18,7 @@ Members report a party or a single message to the moderators privately, the mode
 ## Max battles at a pin
 
 - A max battle reported at an unlisted power spot (a pin) is posted at once, and the moderators' channel near the region channel it was reported in gets a notice of it, for their information (Matt, 2026-10-21, final review G1; `ModerationReports.maxAtPin`, on the side: nothing waits on it, a failure is logged, nothing without `settings.channels.moderation`; in rehearsal mode through the same gateway as the reports' posts). The notice (`maxPinNotice`, `src/render/moderation.ts`): `### Max battle at an unlisted power spot`, the battle, who reported it (`memberText`, anonymous or not: the moderators see who) in which region channel, `📍 **Unlisted power spot** · [Map]`, and the buttons Delete and Go to post, in a neutral colour (`NEWS_COLOUR`: nothing waits on the moderators). Once the battle is over the notice says how, in grey, with Go to post alone (`maxPinNotice(notice, outcome)`, fix review (a)): "This max battle has ended." when the store's listener (`watch`) sees it end, "Closed by <member>." after `closedByStaff`, one edit at a time per battle, staff's the last word; the notice's message is kept per party in memory (`pinNotices`, a `BoundedMap` of 1,000), so after a restart it stays as it was and its Delete answers that the battle has ended. Delete (`maxpin:<party id>:delete`, `maxPinControls` in `src/components/max-pin.ts`: staff only, `requireManagement`, refused uncounted, `SAFETY_THROTTLE`) opens the dialog of `/delete` (`closeDialog`), whose Submit (`closeControls`) closes the battle as `/delete` does; a battle that is over answers "This max battle has ended.". The press reads nothing slow before its dialog (the slow-read rule): a press from another server opens the dialog, and its Submit is a stale control (`closeControls` checks the server). A member blocked from meetups cannot report at a pin (`parties-and-posts.md`).
+- A Power Spot Pine may be missing (plan 8X-S, design `2026-10-22-max-battle-screenshots-design.md` 3): a max battle's screenshot posted with a mention or given to `/max screenshot:` whose Power Spot matches none of the server's (not even 80% alike) and whose name was read surely (`SPOT_SURE`) has the moderators' channel near the channel it was posted in told so (`ModerationReports.missingSpot`, on the side): plain text, `missingSpotNote` (`src/render/moderation.ts`): "A screenshot in <#channel> showed the Power Spot "<name>", which Pine does not know. A new Wayspot export may be due (`/gym import`).", the name as read, `plain(truncate(name, 80))`. At most one note per name (`spotNameKey`: letters and digits only, so a lost space is the same name) and server in `MISSING_SPOT_DAYS` (7), kept in memory (`spotsNoted`, a `BoundedMap`; a restart may note a name once more; a note not sent, or refused by Discord, is forgotten, so the next screenshot sends it). It answers whether the staff were told, now or within those days, and only then does the member's refusal add "I have let the staff know Pine may be missing this Power Spot." (review R13); without the moderators' channel (not named, or not there) it is a log line (`a screenshot showed a Power Spot Pine does not know`, with the server and the channel, never the name: review r4 B2) and the refusal says nothing of the staff. Passive reading never sends it (Matt, 2026-10-22).
 
 ## /delete
 
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 42029eb27fcbc3f36b68d35a87c81a82091ca524..b2e164440a9bcae89e768677d6d56e82a971b3ee 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -14,7 +14,7 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 - Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
 - A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, a Pokémon search of what can Dynamax or Gigantamax (of every Pokémon on an Eternamax screen, `anyPokemon`: the game data lists Eternatus for no max battle) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon the game lets battle so with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `capped`: the end is the day's last battle time, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old), with no ending-soon question; a default end (no countdown) passed by the upload is `over-for-today` too. `withSpot(report, spot)` puts in the spot a member chose.
-- `ScreenshotService.read` tells the kind of screen by the reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search restricted to what can Dynamax or Gigantamax (`ctx.pokemon.find` with a filter; every Pokémon for `anyPokemon`), the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:`, the mention and `/read-screenshot` refuse a max screen as no raid screen until the max flows come (plan 8X-S, tasks 5 to 7). Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
+- `ScreenshotService.read` tells the kind of screen by the reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search restricted to what can Dynamax or Gigantamax (`ctx.pokemon.find` with a filter; every Pokémon for `anyPokemon`), the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:` refuses a max screen, "That’s a max battle: use `/max screenshot:`, or post it with a mention." (`MAX_SCREEN_FOR_RAID`), also beside a typed boss and gym (the wrong picture: no `typedOnly`); the mention and passive reading take either kind ("On Discord"); `/read-screenshot` refuses a max screen as no raid screen until plan 8X-S's task 7. Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
 
 ## Keeping screenshots
 
@@ -22,5 +22,5 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 
 ## On Discord
 
-- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question; the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I don’t know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely, the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I’ve let the staff know Pine may be missing this Power Spot."). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I couldn’t tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question; the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
 - `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
diff --git a/src/commands/max/max-report.ts b/src/commands/max/max-report.ts
index 6770d7dadfc33ca1c3bc0e95d4c1f5e733c7d48a..1d6720689402104a443224ff5398678885772ca3 100644
--- a/src/commands/max/max-report.ts
+++ b/src/commands/max/max-report.ts
@@ -206,7 +206,7 @@ export function otherBoss(there: MaxParty, boss: ReadMaxBoss): boolean {
 }
 
 /** `at Gazebo of the Park`, `at an unlisted power spot`: where a battle is, in a sentence. */
-function atSpot(spot: MaxSpot): string {
+export function atSpot(spot: MaxSpot): string {
   return spot.kind === 'pin' ? 'at an unlisted power spot' : `at ${plain(maxSpotName(spot))}`;
 }
 
@@ -273,7 +273,7 @@ export const DISCORD_MAX_NAMES: MaxNames = {
   postPending: ': its post is being made',
 };
 
-const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
+export const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
   [PartyStatus.Interested]: 'interested',
   [PartyStatus.Coming]: 'coming',
   [PartyStatus.Present]: 'here',
diff --git a/src/commands/max/max-shot.ts b/src/commands/max/max-shot.ts
index f200e4d0e8a5e9cfa6fb72c1468ab9bbf708ed6a..c357d713e2daaed8d341d4b83ad8b8e2600eafdf 100644
--- a/src/commands/max/max-shot.ts
+++ b/src/commands/max/max-shot.ts
@@ -1,11 +1,21 @@
 import type { AppContext } from '../../app-context.js';
+import { UserError } from '../../discord/errors.js';
+import type { ScreenshotMax } from '../../domain/ocr/max-decision.js';
 import type { MaxSpot, RaidScreenshot } from '../../domain/party/party.js';
 import type { PartyStatus } from '../../domain/party/status.js';
+import { maxBossTitle } from '../../domain/pogo/max-tier.js';
+import { MAX_BATTLE_OVER } from '../../render/screenshot-reading.js';
+import { plain, timestamp } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { MaxShotOutcome } from '../../services/max-change-service.js';
-import type { ReadMaxBoss } from './max-input.js';
+import { battlesOver, spotAt, type ReadMaxBoss, type SpotReading } from './max-input.js';
 import {
+  atSpot,
+  MAX_BARRED,
+  maxBarred,
+  maxReportWords,
   reportMaxAs,
+  takenWords,
   type MaxReporter,
   type MaxReporting,
   type MaxReportResult,
@@ -51,7 +61,9 @@ export type MaxShotResult =
       outcome: Exclude<MaxShotOutcome, { kind: 'gone' }>;
       autoStatus: PartyStatus;
     }
-  | { kind: 'reported'; result: MaxReportResult };
+  | { kind: 'reported'; result: MaxReportResult }
+  /** Asked to join only (`joinOnly`), and no battle was there: nothing was done. */
+  | { kind: 'none-there' };
 
 /** What reporting from a screenshot needs beyond `/max`'s reporting. */
 export type MaxShotReporting = MaxReporting & Pick<AppContext, 'guilds' | 'parties' | 'maxBattles'>;
@@ -61,7 +73,8 @@ export type MaxShotReporting = MaxReporting & Pick<AppContext, 'guilds' | 'parti
  * its end against the clock first (R11), then looks at the spot. `mayJoin` is asked before the
  * battle there is changed or joined; a new battle gets the screenshot, and the boss since its
  * moment when that is sure (review R10). A battle there whose post is still being made is reported
- * as `/max` reports it (joined once its post is made).
+ * as `/max` reports it (joined once its post is made), unless only joining was asked. With `joinOnly` only a battle there is joined or
+ * changed: none there is `none-there` (the passive reading of another region's spot, Matt's M1).
  */
 export async function reportMaxShotAs(
   ctx: MaxShotReporting,
@@ -69,6 +82,7 @@ export async function reportMaxShotAs(
   serverId: string,
   request: MaxShotRequest,
   reporter: MaxReporter,
+  options: { joinOnly?: boolean } = {},
 ): Promise<MaxShotResult> {
   const now = Date.now();
   if (request.end <= now) {
@@ -77,8 +91,8 @@ export async function reportMaxShotAs(
   const guild = await ctx.guilds.idFor(serverId);
   const there = guild === undefined ? undefined : ctx.parties.maxAt(guild, request.spot, now);
   // A battle whose post is still being made is `/max`'s to join: `reportMaxAs` waits for the
-  // post and decides again (review r4 A1).
-  if (there && there.forumPostId !== null) {
+  // post and decides again (review r4 A1); asked only to join (`joinOnly`), it is joined here.
+  if (there && (there.forumPostId !== null || options.joinOnly === true)) {
     const forum = there.forumChannelId;
     if (forum !== null && !(await reporter.mayJoin(forum))) return { kind: 'barred' };
     const settings = await ctx.users.get(member.id);
@@ -102,6 +116,7 @@ export async function reportMaxShotAs(
     }
     // Its end came meanwhile: the spot is free, and reported anew below.
   }
+  if (options.joinOnly === true) return { kind: 'none-there' };
   const result = await reportMaxAs(
     ctx,
     member,
@@ -118,3 +133,187 @@ export async function reportMaxShotAs(
   );
   return { kind: 'reported', result };
 }
+/**
+ * What came of a screenshot's battle on Discord (`reportMaxShot`): `reportMaxShotAs`'s, or
+ * `unknown-access` when Discord could not say whether the member may be put in the forum.
+ */
+export type MaxShotAnswer = MaxShotResult | { kind: 'unknown-access' };
+
+/** What reporting a screenshot's battle needs of the bot (`reportMaxShot`, `maxShotRequest`). */
+export type MaxShotContext = MaxShotReporting &
+  SpotReading &
+  Pick<AppContext, 'screenshots' | 'config'>;
+
+/** Said when the Power Spot a screenshot named left the list before its battle was reported. */
+export const SPOT_GONE = 'That Power Spot is no longer on my list: use `/max spot:`.';
+
+/** What a screenshot's author is told when Discord cannot say whether they may see the forum. */
+export const MAX_ACCESS_UNKNOWN =
+  'Discord cannot be reached just now, so nothing was reported. Try again in a moment.';
+
+/**
+ * The report of the battle a screenshot was decided as (`ScreenshotMax`), with its Power Spot of
+ * the server (`spotAt`; undefined once it is gone from the list) and the boss as `/max` names it
+ * (`bossName` the report's), from the region channel it was posted in; `boss` typed beside it
+ * (`/max screenshot:`) in the place of what was read.
+ */
+export function maxShotRequest(
+  ctx: SpotReading,
+  guildRow: number,
+  battle: ScreenshotMax,
+  bossName: string,
+  regionChannelId: string,
+  screenshotId: string | undefined,
+  typed: { boss?: ReadMaxBoss; spot?: MaxSpot; end?: number } = {},
+): MaxShotRequest | undefined {
+  let spot = typed.spot;
+  if (spot === undefined) {
+    try {
+      spot = spotAt(ctx, guildRow, { spot: battle.spotId });
+    } catch (err) {
+      if (err instanceof UserError) return undefined;
+      throw err;
+    }
+  }
+  return {
+    boss: typed.boss ?? {
+      boss: battle.boss,
+      tier: battle.tier,
+      label: plain(maxBossTitle(bossName, battle.tier)),
+    },
+    spot,
+    end: typed.end ?? battle.end,
+    regionChannelId,
+    takenAt: battle.takenAt,
+    sureMoment: battle.sureMoment,
+    rotationEnd: battle.rotationEnd,
+    capped: typed.end === undefined && battle.capped,
+    screenshot: { id: screenshotId ?? null, timeUncertain: battle.timeUncertain },
+  };
+}
+
+/**
+ * Reports a screenshot's battle as the member (plan 8X-S): what a mention, passive reading and
+ * `/max screenshot:` share. A report that would put the member in a forum somebody keeps them out
+ * of is refused first, as `/max` refuses it (`maxBarred`: the forum a new battle would go to and
+ * that of the battle there; `unknown-access`, logged, while Discord cannot say); then
+ * `reportMaxShotAs`. A screenshot its battle's post now shows (a new battle, a boss changed, an
+ * end moved) is kept while the battle lasts (`ScreenshotService.inUse`). No pin is ever made, so
+ * `staff` matters to nothing but `reportMaxAs`'s own check.
+ */
+export async function reportMaxShot(
+  ctx: MaxShotContext,
+  request: MaxShotRequest,
+  who: { member: Member; serverId: string; guildRow: number; staff: boolean; joinOnly?: boolean },
+): Promise<MaxShotAnswer> {
+  const { member } = who;
+  const memberAccess = (forumId: string, memberId: string) =>
+    ctx.partyService.memberAccess(forumId, memberId);
+  try {
+    const joins = ctx.parties.maxAt(who.guildRow, request.spot, Date.now());
+    const ask = { spot: request.spot, regionChannelId: request.regionChannelId, joins };
+    if (await maxBarred({ partyService: ctx.partyService, memberAccess }, ask, member.id)) {
+      return { kind: 'barred' };
+    }
+  } catch (err) {
+    ctx.log.warn(
+      { err, user: member.id },
+      'could not ask Discord whether a screenshot would report a max battle in a forum its author is kept out of',
+    );
+    return { kind: 'unknown-access' };
+  }
+  const result = await reportMaxShotAs(
+    ctx,
+    member,
+    who.serverId,
+    request,
+    {
+      mayJoin: async (forumId) => (await memberAccess(forumId, member.id)) !== 'barred',
+      staff: who.staff,
+    },
+    who.joinOnly === true ? { joinOnly: true } : {},
+  );
+  const { id } = request.screenshot;
+  if (id !== null && showsScreenshot(result)) await ctx.screenshots.inUse(id);
+  return result;
+}
+
+/**
+ * Whether the battle's post shows the screenshot now (`MaxDetails.screenshot`): a new battle, a
+ * boss changed, an end moved or confirmed.
+ */
+function showsScreenshot(result: MaxShotResult): boolean {
+  if (result.kind === 'reported') return result.result.outcome.kind === 'created';
+  if (result.kind !== 'at-battle') return false;
+  const { outcome } = result;
+  return (
+    outcome.kind === 'changed' ||
+    (outcome.kind === 'joined' && (outcome.endMoved || outcome.confirmed))
+  );
+}
+
+/**
+ * Whether a screenshot's battle was refused for none of the member's doing: its post could not be
+ * made, or the battle there ended twice while it waited (as `/max` gives those back).
+ */
+export function maxShotGivesBack(answer: MaxShotAnswer): boolean {
+  return (
+    answer.kind === 'reported' &&
+    (answer.result.outcome.kind === 'no-post' || answer.result.outcome.kind === 'ended')
+  );
+}
+
+/** Whether the member is in the screenshot's battle now: reported, joined, or its boss changed. */
+export function maxShotMade(answer: MaxShotAnswer): boolean {
+  if (answer.kind === 'reported') {
+    return answer.result.outcome.kind === 'created' || answer.result.outcome.kind === 'exists';
+  }
+  return answer.kind === 'at-battle' && answer.outcome.kind !== 'refused';
+}
+
+/**
+ * What the member is told came of a screenshot's battle (plan 8X-S), in `/max`'s words where
+ * `/max` says the same (`maxReportWords`, `takenWords`: another boss there named with its post,
+ * the hint of `/boss` only within one kind); a boss changed or an end moved by the screenshot
+ * says so; an end passed by now in the words of its kind (review R11, Matt's M2).
+ */
+export function maxShotWords(
+  ctx: Pick<AppContext, 'partyService' | 'config'>,
+  answer: MaxShotAnswer,
+  request: MaxShotRequest,
+): string {
+  switch (answer.kind) {
+    case 'over':
+      return answer.reason === 'over-for-today' ? battlesOver(ctx) : MAX_BATTLE_OVER;
+    case 'barred':
+      return MAX_BARRED;
+    case 'unknown-access':
+      return MAX_ACCESS_UNKNOWN;
+    case 'none-there':
+      return `There is no max battle ${atSpot(request.spot)} to join.`;
+    case 'reported':
+      return maxReportWords(ctx, answer.result.outcome, request, answer.result.autoStatus);
+    case 'at-battle': {
+      const { outcome } = answer;
+      if (outcome.kind === 'refused') return takenWords(ctx, outcome.party, request.boss.tier);
+      const post =
+        outcome.party.forumPostId === null ? '' : ` Its post is <#${outcome.party.forumPostId}>.`;
+      const end = outcome.party.endTime ?? request.end;
+      if (outcome.kind === 'changed') {
+        return (
+          `Changed the boss of the max battle ${atSpot(request.spot)} to ${request.boss.label} ` +
+          `from your screenshot, until ${timestamp(end)}.${post}`
+        );
+      }
+      const joined = maxReportWords(
+        ctx,
+        { kind: 'exists', party: outcome.party, joined: outcome.joined },
+        request,
+        answer.autoStatus,
+      );
+      return outcome.endMoved
+        ? `${joined} Its end is now ${timestamp(end)}, from your screenshot.`
+        : joined;
+    }
+  }
+}
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index 978e1510f5b96a9ae84fe62cf11b2bd3d59bd39d..d4782ec860d1073680b8b7e30d6a21dca92519f3 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -14,7 +14,7 @@ import { at, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.j
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { gymsFixture } from '../../../test/support/providers.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
-import { eggReading, readingOf } from '../../../test/support/screenshots.js';
+import { eggReading, maxReading, readingOf } from '../../../test/support/screenshots.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
 import { enabledCommands } from '../../discord/command.js';
@@ -286,6 +286,17 @@ describe('/raid with a screenshot', () => {
     expect(store.active()[0]?.gymId).toBe(2);
   });
 
+  it('refuses a max battle’s screen, also beside a typed boss and gym (plan 8X-S)', async () => {
+    const { report, store } = await setup();
+    for (const typed of [{}, { boss: 'e:T5:0', gym: 'g:1' }] as Record<string, string>[]) {
+      const used = await report(maxReading(), typed);
+      expect(sent(used.editReply).content).toBe(
+        'That is a max battle: use `/max screenshot:`, or post it with a mention.',
+      );
+    }
+    expect(store.active()).toEqual([]);
+  });
+
   it('reports what the member typed when the screenshot is no raid screen, and says so', async () => {
     const { report, store } = await setup();
     const used = await report(readingOf({ gym: 'Old Stone Fountain' }), {
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index c0721ed7b4d0c94b2ee22c9a3b649f7c00f722ca..85b6bb38f4393a162979d49bbc402be24a2ee345 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -21,7 +21,12 @@ import { memberInfo } from '../../discord/member-info.js';
 import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
 import { storedReport, type StoredReport } from '../../domain/ocr/screenshot-record.js';
 import type { ReportDoubt } from '../../domain/ocr/screenshot-report.js';
-import { doubtLines, readingLines, refusalWords } from '../../render/screenshot-reading.js';
+import {
+  doubtLines,
+  MAX_SCREEN_FOR_RAID,
+  readingLines,
+  refusalWords,
+} from '../../render/screenshot-reading.js';
 import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import { feedbackRow, showRow } from '../screenshots/feedback.js';
@@ -358,10 +363,9 @@ async function reportFromScreenshot(
     throw new UserError(unreadWords(outcome));
   }
   if (outcome.screen === 'max') {
-    // A max battle's screen is no raid's: what was typed beside it is reported, else nothing.
-    if (await typedOnly()) return;
+    // A max battle's screen is the wrong picture, whatever was typed beside it (plan 8X-S).
     await interaction.editReply({
-      content: `${refusalWords('not-a-raid-screen')} Nothing was reported.`,
+      content: MAX_SCREEN_FOR_RAID,
       components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
     });
     return;
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index 0c7afe270235a0b8303c82f22c5e76d11b7bdbfa..d50a37a3305ae1c98d131246a8ba02f77c400ed0 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -27,7 +27,7 @@ import {
 import { refusalWords, screenshotMessage } from '../../render/screenshot-reading.js';
 import { SCREENSHOT_FEEDBACK } from '../../render/party-controls.js';
 import { gymNamerOf } from './gym-question.js';
-import { cancelShot, chooseShotGym, confirmShot } from './mention.js';
+import { cancelShot, chooseShotGym, chooseShotSpot, confirmShot } from './mention.js';
 import { SHOT_KIND } from './shot-kind.js';
 
 /** The ids of the form's two inputs. */
@@ -217,12 +217,15 @@ export const screenshotControls: ComponentHandler = {
     }
   },
 
-  /** The gym menu of the question about a screenshot posted with a mention of the bot. */
+  /**
+   * The menu of the question about a screenshot posted with a mention of the bot: its gym, or a
+   * max battle's Power Spot (plan 8X-S).
+   */
   async select(interaction, id, ctx) {
-    if (id.action !== 'gym' || !interaction.isStringSelectMenu()) {
-      throw new UserError(STALE_COMPONENT);
-    }
-    await chooseShotGym(interaction, id.id, ctx);
+    if (!interaction.isStringSelectMenu()) throw new UserError(STALE_COMPONENT);
+    if (id.action === 'gym') return chooseShotGym(interaction, id.id, ctx);
+    if (id.action === 'spot') return chooseShotSpot(interaction, id.id, ctx);
+    throw new UserError(STALE_COMPONENT);
   },
 
   async modal(interaction, id, ctx) {
diff --git a/src/commands/screenshots/mention.max.test.ts b/src/commands/screenshots/mention.max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4811e250d730af191c20c9d93e13e924c4aabe2a
--- /dev/null
+++ b/src/commands/screenshots/mention.max.test.ts
@@ -0,0 +1,391 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  FAKE_GUILD_ID,
+  fakeButton,
+  fakeSelect,
+  sent,
+} from '../../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
+import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
+import { asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
+import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
+import { screenshotsWith } from '../../../test/support/screenshot-service.js';
+import { maxReading } from '../../../test/support/screenshots.js';
+import { keptRow } from '../../../test/support/wayspot-cases.js';
+import { InteractionRouter } from '../../discord/router.js';
+import type { RaidBossRef } from '../../domain/party/party.js';
+import type { MaxTier } from '../../domain/pogo/max-tier.js';
+import type { WayspotRow } from '../../domain/wayspots/kept.js';
+import type { ScreenReading } from '../../ocr/screen-reader.js';
+import { reportMaxAs } from '../max/max-report.js';
+import { screenshotControls } from './feedback.js';
+import { DONE, READING, ScreenshotTrigger, type ReplyPayload } from './mention.js';
+
+/*
+ * A max battle's screenshot posted in a region channel (plan 8X-S, task 5): with a mention of the
+ * bot, and read passively. `MAX_THURSDAY` is 14:00; `maxReading()` is a Dynamax Machop (2★) at
+ * the test spot's Power Spot, its clock read surely at 13:58 and 30 minutes to go.
+ */
+
+const MINUTE = 60_000;
+const END = at('2026-10-22T14:28');
+const t = (time: number) => `<t:${String(time / 1000)}:t>`;
+
+/** A second Power Spot whose name begins as the test spot's. */
+const POND = keptRow(2, {
+  id: 'c0ffee00c0ffee00c0ffee00c0ffee01.16',
+  kind: 'powerspot',
+  title: 'Gazebo of the Pond',
+  lat: TEST_SPOT.lat + 0.0001,
+  lon: TEST_SPOT.lon,
+});
+
+async function setup(
+  options: { passive?: boolean; safety?: SafetyOptions; rows?: WayspotRow[] } = {},
+) {
+  const made = await maxReportingWith(options.safety ?? { moderation: null }, options.rows ?? []);
+  const shots = screenshotsWith(made.ctx);
+  const passive = options.passive ?? false;
+  const ocr = { ...made.ctx.config.settings.ocr, passive, enabled: true };
+  const ctx = {
+    ...made.ctx,
+    screenshots: shots.screenshots,
+    config: { ...made.ctx.config, settings: { ...made.ctx.config.settings, ocr } },
+    features: { ocrPassive: passive, autoAssignRole: false },
+  };
+  const trigger = new ScreenshotTrigger({ ctx, replyMs: 20, questionMs: 60_000 });
+  const router = new InteractionRouter(ctx, [], [screenshotControls]);
+  /** Posts a message of this screenshot, as the author unless `more` says otherwise. */
+  const post = async (
+    reading: ScreenReading,
+    more: Parameters<typeof posted>[1] = {},
+    name = 'max.png',
+  ) => {
+    const sent = posted([shots.screenshot(name, reading)], { mentionsBot: !passive, ...more });
+    await trigger.handle(sent.message);
+    await made.service.flush();
+    return sent;
+  };
+  /** Bob's battle of this boss at the test spot, reported ten minutes before 14:00 by default. */
+  const battle = async (
+    boss: { boss: RaidBossRef; tier: MaxTier; label: string },
+    when = MAX_THURSDAY - 10 * MINUTE,
+  ) => {
+    vi.setSystemTime(when);
+    await reportMaxAs(
+      made.ctx,
+      { id: BOB, name: 'Bob' },
+      FAKE_GUILD_ID,
+      { boss, spot: TEST_SPOT, end: at('2026-10-22T15:00'), regionChannelId: WEST_CHANNEL },
+      { mayJoin: () => Promise.resolve(true), staff: false },
+    );
+    vi.setSystemTime(MAX_THURSDAY);
+    await made.service.flush();
+    return asMax(made.store.active()[0]);
+  };
+  return { ...shots, ...made, ctx, trigger, router, post, battle };
+}
+
+const MACHOP = { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' };
+const MACHAMP = { boss: { key: 'machamp' }, tier: 'D2' as const, label: 'Dynamax Machamp (2★)' };
+const GIANT = { boss: { key: 'machamp' }, tier: 'G' as const, label: 'Gigantamax Machamp' };
+
+const menuOf = (reply: ReplyPayload | undefined) =>
+  reply?.components?.[0]?.components[0] as {
+    custom_id: string;
+    options: { label: string; value: string; description?: string }[];
+  };
+const buttonsOf = (reply: ReplyPayload | undefined) =>
+  (reply?.components?.[0]?.components ?? []) as { custom_id: string; label: string }[];
+
+describe('a max battle’s screenshot posted with a mention of the bot', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reports a clear Power Spot of the channel’s region unasked, with its screenshot, and deletes the message', async () => {
+    const made = await setup();
+    const { did, replies } = await made.post(maxReading());
+    const battle = asMax(made.store.active()[0]);
+    expect(battle).toMatchObject({
+      createdById: AUTHOR,
+      endTime: END,
+      max: { boss: { key: 'machop' }, tier: 'D2', spot: { id: TEST_SPOT.id } },
+    });
+    const id = battle.max.screenshot?.id ?? '';
+    expect(battle.max.screenshot).toEqual({ id, timeUncertain: false });
+    // Its post shows it: kept while the battle lasts.
+    expect(await made.screenshots.get(id)).toMatchObject({ record: { keepUntil: null } });
+    expect(replies).toEqual([]);
+    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, 'deleted']);
+  });
+
+  it('joins the battle of its boss there, and answers with its post', async () => {
+    const made = await setup();
+    const there = await made.battle(MACHOP);
+    const { replies, did } = await made.post(maxReading(), { bare: false });
+    expect(made.store.active()).toHaveLength(1);
+    expect(asMax(made.store.get(there.id)).attendees[AUTHOR]).toBeDefined();
+    expect(replies[0]?.content).toMatch(
+      new RegExp(
+        `^There is already a max battle against Dynamax Machop \\(2★\\) at this spot: <#${there.forumPostId ?? ''}>\\. You have been marked as \\w+\\.$`,
+      ),
+    );
+    expect(did).toContain(`react ${DONE}`);
+  });
+
+  it('changes the boss there from a newer screenshot, and says so', async () => {
+    const made = await setup();
+    const there = await made.battle(MACHAMP);
+    const { replies } = await made.post(maxReading());
+    expect(asMax(made.store.get(there.id))).toMatchObject({
+      endTime: END,
+      max: { boss: { key: 'machop' }, tier: 'D2' },
+    });
+    expect(replies[0]?.content).toBe(
+      `Changed the boss of the max battle at Gazebo of the Park to Dynamax Machop (2★) from your ` +
+        `screenshot, until ${t(END)}. Its post is <#${there.forumPostId ?? ''}>.`,
+    );
+  });
+
+  it('refuses another boss on an older screenshot, naming the post and `/boss`', async () => {
+    const made = await setup();
+    // Reported at 14:00, after the screenshot was taken (13:58).
+    const there = await made.battle(MACHAMP, MAX_THURSDAY);
+    const { replies } = await made.post(maxReading());
+    expect(asMax(made.store.get(there.id)).max.boss).toEqual({ key: 'machamp' });
+    expect(replies[0]?.content).toBe(
+      'There is already a max battle against Dynamax Machamp (2★) at Gazebo of the Park: ' +
+        `<#${there.forumPostId ?? ''}>. \`/boss\` there changes its boss.`,
+    );
+  });
+
+  it('refuses the other kind of battle without the `/boss` hint, even when newer', async () => {
+    const made = await setup();
+    const there = await made.battle(GIANT);
+    const { replies } = await made.post(maxReading());
+    expect(replies[0]?.content).toBe(
+      'There is already a max battle against Gigantamax Machamp at Gazebo of the Park: ' +
+        `<#${there.forumPostId ?? ''}>.`,
+    );
+  });
+
+  it('asks which Power Spot a name cut short may be, and reports at the one picked', async () => {
+    const made = await setup({ rows: [POND] });
+    const { replies, did } = await made.post(maxReading('GAZEBO OF THE P'));
+    expect(made.store.active()).toEqual([]);
+    expect(replies[0]?.content).toBe(
+      `Dynamax Machop (2★), ending at ${t(END)}. Which Power Spot is it? I read "GAZEBO OF THE P".`,
+    );
+    const menu = menuOf(replies[0]);
+    expect(menu.custom_id).toMatch(/^shot:[\w-]+:spot$/);
+    expect(menu.options.map((option) => option.label)).toEqual([
+      'Gazebo of the Park',
+      'Gazebo of the Pond',
+    ]);
+    const stranger = fakeSelect({ customId: menu.custom_id, values: [POND.id], userId: OTHER });
+    await made.router.handle(stranger as never);
+    expect(sent(stranger.reply).content).toBe('That is somebody else’s screenshot.');
+    const pick = fakeSelect({ customId: menu.custom_id, values: [POND.id], userId: AUTHOR });
+    await made.router.handle(pick as never);
+    await made.service.flush();
+    const battle = asMax(made.store.active()[0]);
+    expect(battle.max.spot).toMatchObject({ id: POND.id });
+    expect(sent(pick.editReply).content).toBe(
+      `Reported: Dynamax Machop (2★) at Gazebo of the Pond, until ${t(END)}. Its post is ` +
+        `<#${battle.forumPostId ?? ''}>.`,
+    );
+    const kept = await made.screenshots.get(battle.max.screenshot?.id ?? '');
+    expect(kept).toMatchObject({ record: { pickedSpotId: POND.id } });
+    expect(did).toContain('deleted');
+  });
+
+  it('asks about a clear Power Spot of another region, naming its region in the menu', async () => {
+    const made = await setup();
+    const { replies } = await made.post(maxReading(), { channelId: EAST_CHANNEL });
+    expect(made.store.active()).toEqual([]);
+    expect(menuOf(replies[0]).options).toEqual([
+      { label: 'Gazebo of the Park', value: TEST_SPOT.id, description: 'west' },
+    ]);
+    const pick = fakeSelect({
+      customId: menuOf(replies[0]).custom_id,
+      values: [TEST_SPOT.id],
+      userId: AUTHOR,
+    });
+    await made.router.handle(pick as never);
+    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ id: TEST_SPOT.id });
+  });
+
+  it('refuses a Power Spot it does not know, and tells the staff of a name read surely', async () => {
+    const made = await setup({ safety: {} });
+    const { replies } = await made.post(maxReading('NOWHERE IN PARTICULAR'));
+    expect(replies[0]?.content).toBe(
+      'I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `/max spot:`. ' +
+        'I have let the staff know Pine may be missing this Power Spot.',
+    );
+    await made.reports.flush();
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+    // A name read poorly is no news for the staff.
+    const poorly = await made.post(
+      maxReading('SOMEWHERE ELSE ENTIRELY', { spotConfidence: 0.5 }),
+      {},
+      'max2.png',
+    );
+    expect(poorly.replies[0]?.content).toBe(
+      'I do not know a Power Spot called "SOMEWHERE ELSE ENTIRELY" here: use `/max spot:`.',
+    );
+    await made.reports.flush();
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+  });
+
+  it('says nothing of the staff where there is no moderators’ channel', async () => {
+    const made = await setup();
+    const { replies } = await made.post(maxReading('NOWHERE IN PARTICULAR'));
+    expect(replies[0]?.content).toBe(
+      'I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `/max spot:`.',
+    );
+  });
+
+  it('refuses a screenshot taken after the day’s last battle, and one of no boss it can tell', async () => {
+    const made = await setup();
+    vi.setSystemTime(at('2026-10-22T21:10'));
+    const late = await made.post(
+      maxReading(undefined, {}, { clock: null }),
+      {},
+      'Screenshot_20261022-210500.png',
+    );
+    expect(late.replies[0]?.content).toBe(
+      'Max battles are over for today: they can be fought from 06:00 to 21:00.',
+    );
+    vi.setSystemTime(MAX_THURSDAY);
+    const unknown = await made.post(maxReading(undefined, { species: 'MEWTWO' }), {}, 'b.png');
+    expect(unknown.replies[0]?.content).toBe('I could not tell which boss: use `/max`.');
+    expect(made.store.active()).toEqual([]);
+  });
+
+  // Review r4 B7: as a raid's post lost while it was made (plan 8S-3).
+  it('does not count a screenshot whose max battle’s post was lost while it was made', async () => {
+    const made = await setup();
+    made.gateway.losePosts = true;
+    for (let n = 0; n < 21; n++) {
+      const { replies } = await made.post(maxReading(), {}, `max${String(n)}.png`);
+      expect(replies.at(-1)?.content).not.toMatch(/many screenshots/);
+    }
+    // The twenty-first was read too: none of the earlier ones counted.
+    expect(made.reader.reads).toBe(21);
+    made.gateway.losePosts = false;
+    await made.post(maxReading(), {}, 'last.png');
+    expect(made.store.active()).toHaveLength(1);
+    await made.trigger.close();
+  });
+});
+
+describe('a max battle’s screenshot read passively', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reports a clear Power Spot of its region and says nothing', async () => {
+    const made = await setup({ passive: true });
+    const { replies } = await made.post(maxReading());
+    expect(made.store.active()).toHaveLength(1);
+    expect(replies).toEqual([]);
+  });
+
+  it('says only that it cannot tell the Power Spot, pinging the author, and tells no staff', async () => {
+    const made = await setup({ passive: true, safety: {}, rows: [POND] });
+    const unknown = await made.post(maxReading('NOWHERE IN PARTICULAR'));
+    expect(unknown.replies).toEqual([
+      {
+        content: `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
+        ping: AUTHOR,
+      },
+    ]);
+    const unclear = await made.post(maxReading('GAZEBO OF THE P'), {}, 'b.png');
+    expect(unclear.replies[0]?.content).toBe(
+      `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
+    );
+    await made.reports.flush();
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+    expect(made.store.active()).toEqual([]);
+  });
+
+  // Review r4 B7.
+  it('says once that it cannot tell the Power Spot of two screenshots in one message', async () => {
+    const made = await setup({ passive: true });
+    const message = posted(
+      [
+        made.screenshot('a.png', maxReading('NOWHERE IN PARTICULAR')),
+        made.screenshot('b.png', maxReading('SOMEWHERE ELSE ENTIRELY')),
+      ],
+      { mentionsBot: false },
+    );
+    await made.trigger.handle(message.message);
+    await made.service.flush();
+    expect(message.replies).toEqual([
+      {
+        content: `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
+        ping: AUTHOR,
+      },
+    ]);
+  });
+
+  it('stays silent on a boss it cannot tell and on another boss’s battle there', async () => {
+    const made = await setup({ passive: true });
+    const unknown = await made.post(maxReading(undefined, { species: 'MEWTWO' }));
+    expect(unknown.replies).toEqual([]);
+    await made.battle(MACHAMP, MAX_THURSDAY);
+    const older = await made.post(maxReading(), {}, 'b.png');
+    expect(older.replies).toEqual([]);
+  });
+
+  it('says in its reply that it changed the boss there', async () => {
+    const made = await setup({ passive: true });
+    const there = await made.battle(MACHAMP);
+    const { replies } = await made.post(maxReading());
+    expect(replies[0]).toEqual({
+      content:
+        `<@${AUTHOR}> Changed the boss of the max battle at Gazebo of the Park to Dynamax Machop ` +
+        `(2★) from your screenshot, until ${t(END)}. Its post is <#${there.forumPostId ?? ''}>.`,
+      ping: AUTHOR,
+    });
+  });
+
+  it('joins the battle at a clear Power Spot of another region unasked', async () => {
+    const made = await setup({ passive: true });
+    const there = await made.battle(MACHOP);
+    const { replies } = await made.post(maxReading(), { channelId: EAST_CHANNEL });
+    expect(asMax(made.store.get(there.id)).attendees[AUTHOR]).toBeDefined();
+    expect(replies[0]?.content).toMatch(
+      new RegExp(`^<@${AUTHOR}> There is already a max battle against Dynamax Machop`),
+    );
+  });
+
+  it('asks Yes or No about a clear Power Spot of another region with no battle, and Yes reports it there', async () => {
+    const made = await setup({ passive: true });
+    const { replies } = await made.post(maxReading(), { channelId: EAST_CHANNEL });
+    expect(made.store.active()).toEqual([]);
+    expect(replies[0]).toMatchObject({
+      content: `<@${AUTHOR}> Gazebo of the Park is in <#${WEST_CHANNEL}>. Report it there?`,
+      ping: AUTHOR,
+    });
+    const [yes, no] = buttonsOf(replies[0]);
+    expect([yes?.label, no?.label]).toEqual(['Yes', 'No']);
+    const press = fakeButton({ customId: yes?.custom_id ?? '', userId: AUTHOR });
+    await made.router.handle(press as never);
+    await made.service.flush();
+    const battle = asMax(made.store.active()[0]);
+    expect(battle).toMatchObject({ max: { spot: { id: TEST_SPOT.id } }, createdById: AUTHOR });
+    expect(sent(press.editReply).content).toMatch(/^Reported: Dynamax Machop \(2★\)/);
+    // A Yes is no pick from a menu.
+    const kept = await made.screenshots.get(battle.max.screenshot?.id ?? '');
+    expect(kept).not.toMatchObject({ record: { pickedSpotId: expect.anything() as unknown } });
+  });
+});
diff --git a/src/commands/screenshots/mention.test.ts b/src/commands/screenshots/mention.test.ts
index 83f3bcb86fad967556f6aa3bc6c85967c303146b..2146f61e66e13cd405810b640f9707e21c235730 100644
--- a/src/commands/screenshots/mention.test.ts
+++ b/src/commands/screenshots/mention.test.ts
@@ -21,65 +21,13 @@ import type { GymProvider } from '../../services/gym-directory.js';
 import type { ScreenReading } from '../../ocr/screen-reader.js';
 import { NO_POST_MADE } from '../../render/activity.js';
 import type { OcrOutcome } from '../../services/ocr-service.js';
-import type { ScreenshotSource } from '../../services/screenshot-service.js';
 import { Rehearsal } from '../../services/rehearsal.js';
 import { REPORT_BARRED } from '../raids/report.js';
 import { screenshotControls } from './feedback.js';
-import {
-  DONE,
-  READING,
-  ScreenshotTrigger,
-  type PostedMessage,
-  type ReplyPayload,
-} from './mention.js';
-
-const AUTHOR = '700000000000000001';
-const OTHER = '700000000000000002';
-const CLOCK = { hour: 13, minute: 59 };
+import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
+import { DONE, READING, ScreenshotTrigger, type ReplyPayload } from './mention.js';
 
-/** A posted message that records what the trigger did to it. */
-function posted(attachments: ScreenshotSource[], more: Partial<PostedMessage> = {}) {
-  const did: string[] = [];
-  const replies: ReplyPayload[] = [];
-  const message: PostedMessage = {
-    id: '800000000000000001',
-    channelId: WEST_CHANNEL,
-    guildId: '412345678901234567',
-    inThread: false,
-    authorId: AUTHOR,
-    authorBot: false,
-    member: { name: 'Rhea', team: 'instinct' },
-    createdAt: PARTY_NOW,
-    mentionsBot: true,
-    bare: true,
-    attachments,
-    channelName: (id) => (id === EAST_CHANNEL ? 'east' : id === WEST_CHANNEL ? 'west' : undefined),
-    react: (emoji) => {
-      did.push(`react ${emoji}`);
-      return Promise.resolve();
-    },
-    unreact: (emoji) => {
-      did.push(`unreact ${emoji}`);
-      return Promise.resolve();
-    },
-    reply: (payload) => {
-      replies.push(payload);
-      did.push('reply');
-      return Promise.resolve({
-        delete: () => {
-          did.push('reply deleted');
-          return Promise.resolve();
-        },
-      });
-    },
-    delete: () => {
-      did.push('deleted');
-      return Promise.resolve();
-    },
-    ...more,
-  };
-  return { message, did, replies };
-}
+const CLOCK = { hour: 13, minute: 59 };
 
 async function setup(
   options: {
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index 15708a20625a63acaaa33e6f5cbdb31f115e1528..f25a5190ef161445b9c1c5a880255ce0c11af305 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -4,6 +4,7 @@ import {
   MessageFlags,
   type APIActionRowComponent,
   type APIComponentInMessageActionRow,
+  type APISelectMenuOption,
   type ButtonInteraction,
   type StringSelectMenuInteraction,
 } from 'discord.js';
@@ -14,11 +15,22 @@ import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { Throttles, waitText, type Throttle } from '../../discord/throttle.js';
 import type { MemberInfo } from '../../domain/party/attendance.js';
+import type { MaxDecision } from '../../domain/ocr/max-decision.js';
+import type { SpotTitle } from '../../domain/ocr/power-spot-match.js';
 import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
 import { storedReport } from '../../domain/ocr/screenshot-record.js';
+import { maxSpotName } from '../../domain/party/max.js';
 import { raidBossRef } from '../../domain/party/raid.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
-import { refusalWords, shortReading } from '../../render/screenshot-reading.js';
+import {
+  MAX_SPOT_UNTOLD,
+  MAX_TIER_UNKNOWN,
+  maxRefusalWords,
+  refusalWords,
+  shortMaxReading,
+  shortReading,
+  STAFF_TOLD,
+} from '../../render/screenshot-reading.js';
 import { endSentence, plain, truncate } from '../../render/text.js';
 import type { ReportOutcome } from '../../services/party-service.js';
 import { PendingRequests } from '../../services/pending-requests.js';
@@ -32,6 +44,15 @@ import { gymCandidates, gymMenuOptions, gymNamerOf } from './gym-question.js';
 import { SHOT_KIND } from './shot-kind.js';
 import { noPostWords } from '../../render/activity.js';
 import { mayJoinNoting, REPORT_BARRED, reportAccessOf, reportBarred } from '../raids/report.js';
+import {
+  maxShotGivesBack,
+  maxShotMade,
+  maxShotRequest,
+  maxShotWords,
+  reportMaxShot,
+  SPOT_GONE,
+  type MaxShotRequest,
+} from '../max/max-shot.js';
 
 /**
  * A raid screenshot posted in a region channel with a mention of the bot (or, with
@@ -124,15 +145,43 @@ type ImageResult =
   | { kind: 'made'; exists?: string }
   | { kind: 'asked' }
   | { kind: 'refused'; words: string }
+  /** Why it made nothing, said also when read passively (a max battle's Power Spot not told). */
+  | { kind: 'told'; words: string }
   | { kind: 'stopped'; outcome: Exclude<ScreenshotOutcome, { kind: 'read' }> };
 
 const refused = (words: string): ImageResult => ({ kind: 'refused', words });
+const told = (words: string): ImageResult => ({ kind: 'told', words });
 
-/** A question about the gym of a screenshot, kept until its author answers it. */
-interface PendingShot {
+/** A screenshot read as a max battle's screen. */
+type MaxRead = Extract<ScreenshotOutcome, { kind: 'read'; screen: 'max' }>;
+
+/**
+ * A question about a screenshot, kept until its author answers it: which gym of a raid's
+ * (`gym`), or which Power Spot of a max battle's (`spot`, plan 8X-S), or whether to report a clear
+ * place of another region there (either kind, its one place).
+ */
+type PendingShot = PendingGym | PendingSpot;
+
+interface PendingGym extends PendingCommon {
+  kind: 'gym';
   raid: ScreenshotRaid;
-  screenshotId: string | undefined;
   gymIds: number[];
+}
+
+interface PendingSpot extends PendingCommon {
+  kind: 'spot';
+  /** The Power Spots offered (Wayfarer ids); for Yes, the one. */
+  spotIds: string[];
+  /** The decision with a Power Spot chosen (`ScreenshotOutcome.withSpot`). */
+  decide: (spotId: string) => MaxDecision;
+  /** The boss's name as the report has it, which the answer names. */
+  bossName: string;
+  /** The server's snowflake, which the report is made in. */
+  serverId: string;
+}
+
+interface PendingCommon {
+  screenshotId: string | undefined;
   regionChannelId: string;
   /** The server's row, for the check of the report's forums. */
   guildRow: number;
@@ -144,7 +193,10 @@ interface PendingShot {
   keep?: ReplyKeep;
   /** What the question says, to be said again above `ASK_AGAIN` (set once it is made). */
   question?: string;
-  /** What is said below it then: `ASK_AGAIN` for the gym menu, `ASK_AGAIN_YES` for Yes / No. */
+  /**
+   * What is said below it then: `ASK_AGAIN` for the gym menu, `ASK_AGAIN_SPOT` for the Power
+   * Spot menu, `ASK_AGAIN_YES` for Yes / No.
+   */
   again?: string;
 }
 
@@ -160,6 +212,9 @@ const QUESTION_ROOM = 1_800;
  */
 const ASK_AGAIN =
   'Discord cannot be reached just now, so nothing was reported. Pick the gym again in a moment.';
+/** `ASK_AGAIN` below the question about a max battle's Power Spot. */
+const ASK_AGAIN_SPOT =
+  'Discord cannot be reached just now, so nothing was reported. Pick the Power Spot again in a moment.';
 /** `ASK_AGAIN` below the question whether to report a place in another region. */
 const ASK_AGAIN_YES =
   'Discord cannot be reached just now, so nothing was reported. Press Yes again in a moment.';
@@ -277,6 +332,8 @@ export class ScreenshotTrigger {
     };
     const refusals = new Map<string, number>();
     const existing: string[] = [];
+    // Said also when read passively: what a max battle's screenshot could not place.
+    const toldAloud: string[] = [];
     let held = 0;
     let wait = 0;
     let stopped: Exclude<ScreenshotOutcome, { kind: 'read' }> | undefined;
@@ -316,7 +373,9 @@ export class ScreenshotTrigger {
         if (result.kind === 'made') {
           batch.made++;
           if (result.exists) existing.push(result.exists);
-        } else if (result.kind === 'refused') {
+        } else if (result.kind === 'told' && passive) {
+          if (!toldAloud.includes(result.words)) toldAloud.push(result.words);
+        } else if (result.kind === 'refused' || result.kind === 'told') {
           refusals.set(result.words, (refusals.get(result.words) ?? 0) + 1);
         } else if (result.kind === 'stopped') stopped = result.outcome;
       }
@@ -339,11 +398,12 @@ export class ScreenshotTrigger {
         );
       }
       if (lines.length > 0) await this.say(message, { content: truncate(lines.join('\n'), 2_000) });
-    } else if (existing.length > 0) {
-      // Read passively, only a raid that exists is said (Matt, 2026-10-15): the member is
-      // signed up as their auto-status says, and their message may go. The reply names and pings
-      // them, as it may be all that is left of what they posted.
-      const content = `<@${message.authorId}> ${existing.join('\n')}`;
+    } else if (existing.length > 0 || toldAloud.length > 0) {
+      // Read passively, only a raid or max battle that exists is said (Matt, 2026-10-15), and a
+      // max battle's Power Spot that could not be told (Matt, 2026-10-22): the member is signed
+      // up as their auto-status says, and their message may go. The reply names and pings them,
+      // as it may be all that is left of what they posted.
+      const content = `<@${message.authorId}> ${[...existing, ...toldAloud].join('\n')}`;
       await this.say(message, { content: truncate(content, 2_000), ping: message.authorId });
     }
     await this.finished(batch);
@@ -374,8 +434,7 @@ export class ScreenshotTrigger {
       return { kind: 'stopped', outcome };
     }
     if (outcome.kind !== 'read') return refused(unreadWords(outcome));
-    // A max battle's screen is no raid's.
-    if (outcome.screen === 'max') return refused(refusalWords('not-a-raid-screen'));
+    if (outcome.screen === 'max') return this.readMax(batch, outcome, guildRow, passive, giveBack);
     const { report, decision, id } = outcome;
     if (decision.kind === 'refuse') return refused(refusalWords(decision.reason));
     // A clear gym that lies in this region is reported unasked; one in another region is asked
@@ -414,6 +473,7 @@ export class ScreenshotTrigger {
       return refused('I could not tell the tier of this raid. Report it with `/raid`.');
     if (assumed.kind === 'refuse' || gyms.length === 0) return refused(refusalWords('no-gym'));
     const pending: PendingShot = {
+      kind: 'gym',
       raid: assumed.raid,
       screenshotId: id,
       gymIds: gyms.map((gym) => gym.id),
@@ -432,7 +492,12 @@ export class ScreenshotTrigger {
       message,
       {
         content: pending.question,
-        components: gymQuestion(ctx, token, message, gyms),
+        components: menuQuestion(
+          token,
+          'gym',
+          'Choose the gym',
+          gymMenuOptions(ctx, message.channelId, gyms, (id) => message.channelName(id)),
+        ),
       },
       this.options.questionMs ?? QUESTION_MS,
       () => pendingShots.take(token, message.authorId),
@@ -481,6 +546,7 @@ export class ScreenshotTrigger {
     const { region: there } = ctx.partyService.regionFor(gym, message.channelId);
     if (!there) return refused(refusalWords('no-gym'));
     const pending: PendingShot = {
+      kind: 'gym',
       raid,
       screenshotId,
       gymIds: [gym.id],
@@ -506,6 +572,180 @@ export class ScreenshotTrigger {
     return { kind: 'asked' };
   }
 
+  /**
+   * A max battle's screenshot (plan 8X-S): a clear Power Spot of the message's region is reported
+   * unasked (`reportMaxShot`: a battle there joined, its boss changed by a newer screenshot, or
+   * refused), its words in the message's reply unless a new battle was made (whose link line the
+   * region channel gets). With a mention a Power Spot that is not clear, or one of another region,
+   * is asked about in a menu; one it does not know is refused, and the moderators told of a name
+   * read surely (`ModerationReports.missingSpot`), which the refusal then says. Read passively it
+   * never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a spot not told is
+   * said in its short reply (`told`), a clear one of another region is joined there unasked, or
+   * asked Yes or No about (`elsewhereSpot`), and what else it refuses is not said.
+   */
+  private async readMax(
+    batch: Batch,
+    outcome: MaxRead,
+    guildRow: number,
+    passive: boolean,
+    giveBack: () => void,
+  ): Promise<ImageResult> {
+    const { ctx } = this.options;
+    const { message } = batch;
+    const { report, decision, id } = outcome;
+    const times = ctx.config.settings.maxBattles;
+    const serverId = message.guildId ?? '';
+    if (decision.kind === 'refuse') {
+      if (decision.reason !== 'no-spot') return refused(maxRefusalWords(decision.reason, times));
+      if (passive) return told(MAX_SPOT_UNTOLD);
+      const words = maxRefusalWords('no-spot', times, decision.read);
+      const staffTold =
+        decision.read !== null &&
+        decision.readSurely &&
+        ctx.reports.missingSpot({ serverId, channelId: message.channelId, name: decision.read });
+      return refused(staffTold ? `${words} ${STAFF_TOLD}` : words);
+    }
+    if (decision.kind === 'ask' && decision.about === 'tier') return refused(MAX_TIER_UNKNOWN);
+    if (decision.kind === 'ask') {
+      return passive
+        ? told(MAX_SPOT_UNTOLD)
+        : this.askSpot(batch, outcome, decision.spots, guildRow, giveBack);
+    }
+    const { match } = report.spot;
+    // A clear spot of this region is reported unasked; one of another region is asked about
+    // with a mention, and joined there or asked Yes or No about read passively (Matt's M1).
+    const local = match.kind === 'clear' && match.spot.local;
+    if (!local && !passive) {
+      return this.askSpot(
+        batch,
+        outcome,
+        match.kind === 'clear' ? [match.spot] : [],
+        guildRow,
+        giveBack,
+      );
+    }
+    const request = maxShotRequest(
+      ctx,
+      guildRow,
+      decision.battle,
+      report.boss?.name ?? '',
+      message.channelId,
+      id,
+    );
+    if (!request) return refused(SPOT_GONE);
+    const answer = await reportMaxShot(ctx, request, {
+      member: { id: message.authorId, ...message.member },
+      serverId,
+      guildRow,
+      staff: false,
+      ...(local ? {} : { joinOnly: true }),
+    });
+    if (answer.kind === 'none-there') {
+      return this.elsewhereSpot(batch, outcome, request, guildRow, giveBack);
+    }
+    if (maxShotGivesBack(answer)) giveBack();
+    const words = maxShotWords(ctx, answer, request);
+    if (!maxShotMade(answer)) return refused(words);
+    // A new battle is said by its link line in the region channel; anything else in the reply.
+    const created = answer.kind === 'reported' && answer.result.outcome.kind === 'created';
+    return created ? { kind: 'made' } : { kind: 'made', exists: words };
+  }
+
+  /**
+   * Asks the author which of these Power Spots a max battle's screenshot shows (plan 8X-S), with
+   * a menu as the gym question's: the channel's region's first, another region's named.
+   */
+  private async askSpot(
+    batch: Batch,
+    outcome: MaxRead,
+    spots: readonly SpotTitle[],
+    guildRow: number,
+    giveBack: () => void,
+  ): Promise<ImageResult> {
+    const { ctx } = this.options;
+    const { message } = batch;
+    const { report, id } = outcome;
+    const times = ctx.config.settings.maxBattles;
+    if (spots.length === 0) return refused(maxRefusalWords('no-spot', times, report.spot.read));
+    const offered = spots.slice(0, MENU_SIZE);
+    const pending: PendingShot = {
+      kind: 'spot',
+      spotIds: offered.map((spot) => spot.id),
+      decide: outcome.withSpot,
+      bossName: report.boss?.name ?? '',
+      serverId: message.guildId ?? '',
+      screenshotId: id,
+      regionChannelId: message.channelId,
+      guildRow,
+      member: message.member,
+      batch,
+      giveBack,
+      again: ASK_AGAIN_SPOT,
+    };
+    const token = pendingShots.put(message.authorId, pending);
+    const read = report.spot.read ? ` I read "${plain(truncate(report.spot.read, 80))}".` : '';
+    pending.question = truncate(
+      `${shortMaxReading(report)}. Which Power Spot is it?${read}`,
+      QUESTION_ROOM,
+    );
+    pending.keep = await this.say(
+      message,
+      {
+        content: pending.question,
+        components: menuQuestion(
+          token,
+          'spot',
+          'Choose the Power Spot',
+          spotMenuOptions(ctx, offered, message),
+        ),
+      },
+      this.options.questionMs ?? QUESTION_MS,
+      () => pendingShots.take(token, message.authorId),
+    );
+    return { kind: 'asked' };
+  }
+
+  /**
+   * A clear Power Spot of another region with no battle there, read passively (Matt's M1, as
+   * `elsewhere` for a gym): the author is asked Yes or No whether to report it there, in the reply
+   * that pings them; nothing is said when the spot lies in no region of the server with a forum.
+   */
+  private async elsewhereSpot(
+    batch: Batch,
+    outcome: MaxRead,
+    request: MaxShotRequest,
+    guildRow: number,
+    giveBack: () => void,
+  ): Promise<ImageResult> {
+    const { ctx } = this.options;
+    const { message } = batch;
+    const { region: there } = ctx.partyService.regionForSpot(request.spot, message.channelId);
+    if (!there || request.spot.kind !== 'powerspot') return refused(SPOT_GONE);
+    const pending: PendingShot = {
+      kind: 'spot',
+      spotIds: [request.spot.id],
+      decide: outcome.withSpot,
+      bossName: outcome.report.boss?.name ?? '',
+      serverId: message.guildId ?? '',
+      screenshotId: outcome.id,
+      regionChannelId: message.channelId,
+      guildRow,
+      member: message.member,
+      batch,
+      giveBack,
+      again: ASK_AGAIN_YES,
+    };
+    const token = pendingShots.put(message.authorId, pending);
+    pending.question = `<@${message.authorId}> ${elsewhereQuestion(plain(maxSpotName(request.spot)), there.channelId)}`;
+    pending.keep = await this.say(
+      message,
+      { content: pending.question, components: [yesNoRow(token)], ping: message.authorId },
+      this.options.questionMs ?? QUESTION_MS,
+      () => pendingShots.take(token, message.authorId),
+    );
+    return { kind: 'asked' };
+  }
+
   /**
    * Once every image of a message made or joined a raid, the message has done its work: it
    * goes when it says nothing but the mention, and is marked ✅ otherwise.
@@ -572,12 +812,18 @@ export class ScreenshotTrigger {
   }
 }
 
-/** The question's controls: the gym menu (each gym told apart) and "Cancel". */
-function gymQuestion(
-  ctx: AppContext,
+/** A select menu holds this many options. */
+const MENU_SIZE = 25;
+
+/**
+ * The question's controls: the menu (`shot:<token>:gym` of gyms, `shot:<token>:spot` of Power
+ * Spots) and "Cancel".
+ */
+function menuQuestion(
   token: string,
-  message: PostedMessage,
-  gyms: readonly Gym[],
+  action: 'gym' | 'spot',
+  placeholder: string,
+  options: APISelectMenuOption[],
 ): Row[] {
   return [
     {
@@ -585,9 +831,9 @@ function gymQuestion(
       components: [
         {
           type: ComponentType.StringSelect,
-          custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'gym' }),
-          placeholder: 'Choose the gym',
-          options: gymMenuOptions(ctx, message.channelId, gyms, (id) => message.channelName(id)),
+          custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action }),
+          placeholder,
+          options,
         },
       ],
     },
@@ -605,6 +851,26 @@ function gymQuestion(
   ];
 }
 
+/**
+ * The options of a Power Spot menu: each by its title, one of another region than the message's
+ * told apart by that region's name (as `menuDescription` tells a gym).
+ */
+function spotMenuOptions(
+  ctx: Pick<AppContext, 'wayspots'>,
+  spots: readonly SpotTitle[],
+  message: Pick<PostedMessage, 'channelName'>,
+): APISelectMenuOption[] {
+  return spots.map((spot) => {
+    const [elsewhere] = spot.local ? [] : ctx.wayspots.regionsOf(spot.id);
+    const region = elsewhere === undefined ? undefined : message.channelName(elsewhere);
+    return {
+      label: truncate(spot.title, 100),
+      value: spot.id,
+      ...(region === undefined ? {} : { description: truncate(region, 100) }),
+    };
+  });
+}
+
 /**
  * What came of a report from a screenshot: the report's own outcome, or none made because it
  * would put the member in a forum somebody keeps them out of (`barred`) or because Discord could
@@ -724,7 +990,7 @@ function outcomeWords(outcome: ShotOutcome, gym: Gym): string {
   }
 }
 
-const EXPIRED = 'That question has expired. Post the screenshot again, or use `/raid`.';
+const EXPIRED = 'That question has expired. Post the screenshot again.';
 const NOT_YOURS = 'That is somebody else’s screenshot.';
 
 /** A press on a question answered already: only acknowledged. */
@@ -776,13 +1042,34 @@ export async function chooseShotGym(
     await interaction.update({ content: EXPIRED, components: [] });
     return;
   }
+  if (request.kind !== 'gym') throw new UserError(EXPIRED);
   const gymId = Number(interaction.values[0]);
   await answerShot(interaction, token, ctx, request, gymId, true);
 }
 
 /**
- * Yes under the question whether to report a clear gym of another region, read passively: the
- * raid is reported there as its author, with the checks of the gym question (Matt, 2026-10-22).
+ * The Power Spot chosen in the question about a max battle's screenshot (plan 8X-S): its battle
+ * is reported as its author, as a gym chosen reports a raid.
+ */
+export async function chooseShotSpot(
+  interaction: StringSelectMenuInteraction,
+  token: string,
+  ctx: AppContext,
+): Promise<void> {
+  if (await answeredAlready(interaction, token)) return;
+  const request = peeked(interaction, token);
+  if (!request) {
+    await interaction.update({ content: EXPIRED, components: [] });
+    return;
+  }
+  if (request.kind !== 'spot') throw new UserError(EXPIRED);
+  await answerSpot(interaction, token, ctx, request, interaction.values[0], true);
+}
+
+/**
+ * Yes under the question whether to report a clear gym or Power Spot of another region, read
+ * passively: the raid or max battle is reported there as its author, with the checks of the
+ * menu's answer (Matt, 2026-10-22).
  */
 export async function confirmShot(
   interaction: ButtonInteraction,
@@ -795,9 +1082,87 @@ export async function confirmShot(
     await interaction.update({ content: EXPIRED, components: [] });
     return;
   }
+  if (request.kind === 'spot') {
+    await answerSpot(interaction, token, ctx, request, request.spotIds[0], false);
+    return;
+  }
   await answerShot(interaction, token, ctx, request, request.gymIds[0], false);
 }
 
+/**
+ * Takes an answered question, once its press is acknowledged (a press that could not be
+ * acknowledged leaves the question): false when another press took it meanwhile, which the
+ * question then says. Answered, the question stays from now on as an answer does.
+ */
+async function taken(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  token: string,
+  request: PendingShot,
+): Promise<boolean> {
+  await interaction.deferUpdate();
+  if (pendingShots.take(token, interaction.user.id) === 'expired') {
+    // Another press took the question meanwhile: the question says what came of that one.
+    if (answeredShots.has(token)) return false;
+    await interaction.editReply({ content: EXPIRED, components: [] }).catch(() => undefined);
+    return false;
+  }
+  answeredShots.set(token, true);
+  request.keep?.answered();
+  return true;
+}
+
+/**
+ * Discord could not say whether the author may be put in the forum, and may answer in a moment:
+ * the question stays, its controls too, with a question's time again, to be answered again
+ * (true); unless its time was up meanwhile or somebody deleted it, and it is gone (false: the
+ * author is told as for any outcome).
+ */
+async function askedAgain(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  token: string,
+  request: PendingShot,
+): Promise<boolean> {
+  if (!request.keep?.askAgain()) return false;
+  answeredShots.delete(token);
+  pendingShots.put(interaction.user.id, request, token);
+  const asked = await interaction
+    .editReply({
+      content: [request.question, request.again ?? ASK_AGAIN].filter(Boolean).join('\n'),
+    })
+    .then(() => true)
+    .catch(() => false);
+  if (asked) return true;
+  pendingShots.take(token, interaction.user.id);
+  answeredShots.set(token, true);
+  return false;
+}
+
+/**
+ * The question becomes the answer and goes at its time: a private follow-up would stand under
+ * "Message could not be loaded" once the question it answers was deleted. Only a question that
+ * went meanwhile (its time was up while the report was made) is answered privately.
+ */
+async function answerInPlace(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  words: string,
+): Promise<void> {
+  const edited = await interaction
+    .editReply({ content: words, components: [] })
+    .then(() => true)
+    .catch(() => false);
+  if (!edited) {
+    await interaction
+      .followUp({ content: words, flags: MessageFlags.Ephemeral })
+      .catch(() => undefined);
+  }
+}
+
+/** The author's message has one more image that made or joined a party. */
+async function madeOne(request: PendingShot): Promise<void> {
+  request.batch.made++;
+  await request.batch.finish();
+}
+
 /**
  * Reports the raid of an answered question at the gym answered (`picked`: chosen in the menu,
  * which the record keeps), and has the question say what came of it until its time is up; the
@@ -807,7 +1172,7 @@ async function answerShot(
   interaction: ButtonInteraction | StringSelectMenuInteraction,
   token: string,
   ctx: AppContext,
-  request: PendingShot,
+  request: PendingGym,
   gymId: number | undefined,
   picked: boolean,
 ): Promise<void> {
@@ -817,17 +1182,7 @@ async function answerShot(
     await interaction.update({ content: 'That gym no longer exists.', components: [] });
     return;
   }
-  // Taken only once acknowledged: a press that could not be acknowledged leaves the question.
-  await interaction.deferUpdate();
-  if (pendingShots.take(token, interaction.user.id) === 'expired') {
-    // Another press took the question meanwhile: the question says what came of that one.
-    if (answeredShots.has(token)) return;
-    await interaction.editReply({ content: EXPIRED, components: [] }).catch(() => undefined);
-    return;
-  }
-  answeredShots.set(token, true);
-  // Answered: the question stays from now on as an answer does, while the raid is reported too.
-  request.keep?.answered();
+  if (!(await taken(interaction, token, request))) return;
   let outcome: ShotOutcome;
   try {
     outcome = await reportShot(ctx, {
@@ -845,42 +1200,72 @@ async function answerShot(
       .catch(() => undefined);
     throw err;
   }
-  // Discord may answer in a moment: the question stays, its menu too, with a question's time
-  // again, to be answered again; unless its time was up meanwhile and it is gone (then the
-  // author is told as for any outcome, below).
   if (noPostMade(outcome)) request.giveBack();
-  if (outcome.kind === 'unknown-access' && request.keep?.askAgain()) {
-    answeredShots.delete(token);
-    pendingShots.put(interaction.user.id, request, token);
-    const asked = await interaction
-      .editReply({
-        content: [request.question, request.again ?? ASK_AGAIN].filter(Boolean).join('\n'),
-      })
-      .then(() => true)
-      .catch(() => false);
-    if (asked) return;
-    // The question went meanwhile (somebody deleted it): nothing of it is kept, and the author
-    // is told privately, as for any outcome below.
-    pendingShots.take(token, interaction.user.id);
-    answeredShots.set(token, true);
-  }
+  if (outcome.kind === 'unknown-access' && (await askedAgain(interaction, token, request))) return;
   if (picked && request.screenshotId !== undefined)
     await ctx.screenshots.picked(request.screenshotId, gym.id);
-  // The question becomes the answer and goes at its time: a private follow-up would stand under
-  // "Message could not be loaded" once the question it answers was deleted.
-  const words = outcomeWords(outcome, gym);
-  const edited = await interaction
-    .editReply({ content: words, components: [] })
-    .then(() => true)
-    .catch(() => false);
-  // The question went meanwhile (its time was up while the raid was reported): say it privately.
-  if (!edited) {
+  await answerInPlace(interaction, outcomeWords(outcome, gym));
+  if (outcome.kind === 'created' || outcome.kind === 'exists') await madeOne(request);
+}
+
+/**
+ * Reports the max battle of an answered question at the Power Spot answered (plan 8X-S;
+ * `picked`: chosen in the menu, which the record keeps), as `answerShot` reports a raid: the
+ * decision made again with the spot (`withSpot`), then `reportMaxShot`.
+ */
+async function answerSpot(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  token: string,
+  ctx: AppContext,
+  request: PendingSpot,
+  spotId: string | undefined,
+  picked: boolean,
+): Promise<void> {
+  const decision =
+    spotId !== undefined && request.spotIds.includes(spotId) ? request.decide(spotId) : undefined;
+  const asked =
+    decision?.kind === 'report'
+      ? maxShotRequest(
+          ctx,
+          request.guildRow,
+          decision.battle,
+          request.bossName,
+          request.regionChannelId,
+          request.screenshotId,
+        )
+      : undefined;
+  if (spotId === undefined || !decision || (decision.kind === 'report' && !asked)) {
+    await interaction.update({ content: SPOT_GONE, components: [] });
+    return;
+  }
+  if (!(await taken(interaction, token, request))) return;
+  if (!asked) {
+    // Chosen, the spot leaves only what the screenshot could not tell (the tier) to refuse.
+    const words =
+      decision.kind === 'refuse'
+        ? maxRefusalWords(decision.reason, ctx.config.settings.maxBattles)
+        : MAX_TIER_UNKNOWN;
+    await answerInPlace(interaction, words);
+    return;
+  }
+  let answer;
+  try {
+    answer = await reportMaxShot(ctx, asked, {
+      member: { id: interaction.user.id, ...request.member },
+      serverId: request.serverId,
+      guildRow: request.guildRow,
+      staff: false,
+    });
+  } catch (err) {
     await interaction
-      .followUp({ content: words, flags: MessageFlags.Ephemeral })
+      .editReply({ content: 'Nothing was reported.', components: [] })
       .catch(() => undefined);
+    throw err;
   }
-  if (outcome.kind === 'created' || outcome.kind === 'exists') {
-    request.batch.made++;
-    await request.batch.finish();
-  }
+  if (maxShotGivesBack(answer)) request.giveBack();
+  if (answer.kind === 'unknown-access' && (await askedAgain(interaction, token, request))) return;
+  if (picked && request.screenshotId !== undefined)
+    await ctx.screenshots.pickedSpot(request.screenshotId, spotId);
+  await answerInPlace(interaction, maxShotWords(ctx, answer, asked));
+  if (maxShotMade(answer)) await madeOne(request);
 }
diff --git a/src/domain/ocr/power-spot-match.ts b/src/domain/ocr/power-spot-match.ts
index 6690bc823f2123451eb90a0c856c935fab96c9db..1221b3afbd139590da396cb808ef4206becbd77b 100644
--- a/src/domain/ocr/power-spot-match.ts
+++ b/src/domain/ocr/power-spot-match.ts
@@ -34,8 +34,11 @@ export const SPOT_ALIKE = 0.8;
  */
 const CUT_NAME_MIN = 6;
 
-/** Letters and digits only, without case or accents: `Juniper's Swing` → `juniperswing`. */
-function letters(text: string): string {
+/**
+ * Letters and digits only, without case or accents: `Juniper's Swing` → `juniperswing`; also the
+ * key of the moderators' note of a Power Spot Pine may be missing (`ModerationReports.missingSpot`).
+ */
+export function spotNameKey(text: string): string {
   return text
     .normalize('NFKD')
     .replace(/\p{M}/gu, '')
@@ -62,12 +65,12 @@ function onlyOne(found: readonly SpotTitle[]): SpotTitle | undefined {
  * alike is a candidate, the region's first; none: unknown.
  */
 export function matchPowerSpot(read: string | null, spots: readonly SpotTitle[]): SpotMatch {
-  const name = read === null ? '' : letters(read);
+  const name = read === null ? '' : spotNameKey(read);
   if (name.length === 0) return { kind: 'unknown' };
-  const equal = spots.filter((spot) => letters(spot.title) === name);
+  const equal = spots.filter((spot) => spotNameKey(spot.title) === name);
   const starts =
     name.length >= CUT_NAME_MIN
-      ? spots.filter((spot) => !equal.includes(spot) && letters(spot.title).startsWith(name))
+      ? spots.filter((spot) => !equal.includes(spot) && spotNameKey(spot.title).startsWith(name))
       : [];
   const clear = equal.length > 0 ? onlyOne(equal) : onlyOne(starts);
   if (clear) return { kind: 'clear', spot: clear };
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index 85ea9170054f1eb0b53ab3e2a34e1d072b1585cd..8208373750702bce6daa7ea336818d19d5be5b72 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -371,6 +371,18 @@ export function removalOf(
  */
 export const MAX_PIN_KIND = 'maxpin';
 
+/**
+ * The moderators' note of a Power Spot a screenshot showed and Pine does not know (plan 8X-S,
+ * design 3): plain text, for their information only; the name as read, plain and cut short
+ * (review R13), the channel as a mention.
+ */
+export function missingSpotNote(channelId: string, name: string): string {
+  return (
+    `A screenshot in <#${channelId}> showed the Power Spot "${plain(truncate(name, 80))}", ` +
+    'which Pine does not know. A new Wayspot export may be due (`/gym import`).'
+  );
+}
+
 /** What the moderators' channel is told of a max battle reported at a pin (`maxPinNotice`). */
 export interface MaxPinNotice {
   /** The server's snowflake. */
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index 73ac847309164e048d6df91c93165042ee3bd055..e4589aa88348c91fde209a4e10fbc233d82be11f 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -1,6 +1,12 @@
 import type { APIButtonComponent } from 'discord.js';
 import type { V2Message } from '../discord/party-gateway.js';
-import { clockText, countdownText, type StoredReport } from '../domain/ocr/screenshot-record.js';
+import {
+  clockText,
+  countdownText,
+  type StoredMaxReport,
+  type StoredReport,
+} from '../domain/ocr/screenshot-record.js';
+import { maxBossTitle } from '../domain/pogo/max-tier.js';
 import type { ReportDoubt } from '../domain/ocr/screenshot-report.js';
 import { raidTierLabel } from '../domain/pogo/raid-tier.js';
 import { cutMarkdown, plain, timestamp, truncate } from './text.js';
@@ -217,6 +223,70 @@ export function shortReading(
   return `${what}${where}${when}`;
 }
 
+/** The first and last battle times of the day (`settings.maxBattles`), which refusals name. */
+export interface BattleTimes {
+  firstBattle: string;
+  lastBattle: string;
+}
+
+/**
+ * Why a max battle's screenshot was not reported (`decideMax`'s `refuse`, plan 8X-S): `read` is
+ * the Power Spot's name as read, for `no-spot`. `/max`'s own words where `/max` says the same.
+ */
+export function maxRefusalWords(
+  reason: string,
+  times: BattleTimes,
+  read: string | null = null,
+): string {
+  switch (reason) {
+    case 'not-a-max-screen':
+      return 'That is a raid: use `/raid screenshot:`, or post it with a mention.';
+    case 'over-for-today':
+      return `Max battles are over for today: they can be fought from ${times.firstBattle} to ${times.lastBattle}.`;
+    case 'battle-over':
+      return MAX_BATTLE_OVER;
+    case 'before-first':
+      return `That battle ends before max battles can be fought (${times.firstBattle}).`;
+    case 'no-spot':
+      return read === null || read.trim() === ''
+        ? 'I could not read the name of the Power Spot: use `/max spot:`.'
+        : `I do not know a Power Spot called "${plain(truncate(read, 80))}" here: use \`/max spot:\`.`;
+    case 'no-boss':
+      return 'I could not tell which boss: use `/max`.';
+    default:
+      return 'This does not look like the screen of a max battle, so I made nothing of it.';
+  }
+}
+
+/** `/raid screenshot:` given a max battle's screen (plan 8X-S): the wrong picture. */
+export const MAX_SCREEN_FOR_RAID =
+  'That is a max battle: use `/max screenshot:`, or post it with a mention.';
+
+/** A max battle's countdown that is over: by the reading, or by the time it would be reported. */
+export const MAX_BATTLE_OVER = 'That battle has ended.';
+
+/** Said of a max battle's screenshot whose tier could not be told (`decideMax` asks it). */
+export const MAX_TIER_UNKNOWN =
+  'I could not tell the tier of this max battle: use `/max` with `tier:`.';
+
+/** The passive reading's one reply about a max battle's screenshot it could not place (Matt). */
+export const MAX_SPOT_UNTOLD = 'I could not tell which Power Spot this is: use `/max screenshot:`.';
+
+/** Added to `no-spot`'s words when the moderators were told the Power Spot may be missing. */
+export const STAFF_TOLD = 'I have let the staff know Pine may be missing this Power Spot.';
+
+/**
+ * What a max battle's screenshot shows, in one line, without its Power Spot (which is asked):
+ * `Dynamax Machop (2★), ending at 14:28`; a boss not told is `A max battle`.
+ */
+export function shortMaxReading(report: StoredMaxReport): string {
+  const what =
+    report.boss && report.tier
+      ? plain(maxBossTitle(report.boss.name, report.tier))
+      : 'A max battle';
+  return report.end === null ? what : `${what}, ending at ${timestamp(report.end)}`;
+}
+
 /** Why a screenshot was not made into a raid (`refuse`'s reason). */
 export function refusalWords(reason: string): string {
   switch (reason) {
diff --git a/src/services/moderation-reports.spot.test.ts b/src/services/moderation-reports.spot.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0782995859dc7ca9df2972eae98fa94c75640106
--- /dev/null
+++ b/src/services/moderation-reports.spot.test.ts
@@ -0,0 +1,86 @@
+import { describe, expect, it } from 'vitest';
+import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { REPORT_SERVER as SERVER, reportsWith } from '../../test/support/reports-service.js';
+
+const DAY = 24 * 3_600_000;
+const OTHER_SERVER = '412345678901234599';
+
+/** The texts the moderators' channel got, in order. */
+const notes = (made: Awaited<ReturnType<typeof reportsWith>>) =>
+  made.gateway
+    .messagesIn(MOD_CHANNEL)
+    .map((sent) => (sent.message.v2 ? undefined : sent.message.content));
+
+describe('ModerationReports: a Power Spot Pine may be missing (plan 8X-S)', () => {
+  it('tells the moderators once per name and server in seven days, and says it did', async () => {
+    const made = await reportsWith();
+    const spot = (name: string, serverId = SERVER, channelId = WEST_CHANNEL) =>
+      made.reports.missingSpot({ serverId, channelId, name });
+    expect(spot("JUNIPER'S SWING CORNER")).toBe(true);
+    await made.reports.flush();
+    expect(notes(made)).toEqual([
+      `A screenshot in <#${WEST_CHANNEL}> showed the Power Spot "JUNIPER'S SWING CORNER", which ` +
+        'Pine does not know. A new Wayspot export may be due (`/gym import`).',
+    ]);
+    // The same name read without its space, from another channel: the staff know already.
+    expect(spot("JUNIPER'SSWING CORNER", SERVER, EAST_CHANNEL)).toBe(true);
+    await made.reports.flush();
+    expect(notes(made)).toHaveLength(1);
+    // Another server's moderators are told of it on their own.
+    expect(spot("JUNIPER'S SWING CORNER", OTHER_SERVER)).toBe(true);
+    await made.reports.flush();
+    expect(notes(made)).toHaveLength(2);
+    // Seven days on, once more.
+    made.clock.now += 7 * DAY;
+    expect(spot("JUNIPER'S SWING CORNER")).toBe(true);
+    await made.reports.flush();
+    expect(notes(made)).toHaveLength(3);
+  });
+
+  it('shows the name read as plain text, cut short', async () => {
+    const made = await reportsWith();
+    made.reports.missingSpot({
+      serverId: SERVER,
+      channelId: WEST_CHANNEL,
+      name: `**BOLD** ${'X'.repeat(100)}`,
+    });
+    await made.reports.flush();
+    const [note] = notes(made);
+    expect(note).toContain('"\\*\\*BOLD\\*\\* XXXX');
+    expect(note).toContain('…", which Pine');
+  });
+
+  it('says nothing was told without the moderators’ channel, and logs where but not the name', async () => {
+    for (const safety of [{ moderation: null }, { channel: false }]) {
+      const made = await reportsWith(safety);
+      expect(
+        made.reports.missingSpot({ serverId: SERVER, channelId: WEST_CHANNEL, name: 'NEW SPOT' }),
+      ).toBe(false);
+      await made.reports.flush();
+      expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+      // The server and the channel only: what a member's screenshot showed stays out of the log.
+      const entry = made.entries.find(
+        (logged) => logged.msg === 'a screenshot showed a Power Spot Pine does not know',
+      );
+      expect(entry).toMatchObject({ server: SERVER, channel: WEST_CHANNEL });
+      expect(JSON.stringify(entry)).not.toContain('NEW SPOT');
+    }
+  });
+
+  // Review r4 B7.
+  it('forgets a note Discord refused, so that the next screenshot sends it, and logs no name', async () => {
+    const made = await reportsWith();
+    const spot = () =>
+      made.reports.missingSpot({ serverId: SERVER, channelId: WEST_CHANNEL, name: 'NEW SPOT' });
+    made.gateway.failing.set('sendMessage', new Error('Missing Permissions'));
+    expect(spot()).toBe(true);
+    await made.reports.flush();
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+    expect(JSON.stringify(made.entries)).not.toContain('NEW SPOT');
+    made.gateway.failing.delete('sendMessage');
+    expect(spot()).toBe(true);
+    await made.reports.flush();
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+  });
+});
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
index 115207f4b53f6ee5973879ffa0b89755a3b69b9d..0dbf4fe07929d6a18423eb65461d67533cac8806 100644
--- a/src/services/moderation-reports.ts
+++ b/src/services/moderation-reports.ts
@@ -23,12 +23,14 @@ import {
   type ReportStore,
 } from '../domain/moderation/reports.js';
 import type { Decider } from '../domain/meetups/records.js';
+import { spotNameKey } from '../domain/ocr/power-spot-match.js';
 import { isMax, isMeetup, isTrain, partyWord, type Party } from '../domain/party/party.js';
 import { currentStop } from '../domain/party/train.js';
 import { BoundedMap } from '../bounded-map.js';
 import type { Logger } from '../log.js';
 import {
   maxPinNotice,
+  missingSpotNote,
   type MaxPinNotice,
   type MaxPinOutcome,
   ENDING_ACTIONS,
@@ -175,6 +177,11 @@ export interface ModerationReportsOptions {
  */
 const STRANDED_MS = 5 * 60_000;
 
+const DAY = 24 * 3_600_000;
+
+/** How long the moderators are not told again of a Power Spot Pine may be missing (design 3). */
+export const MISSING_SPOT_DAYS = 7;
+
 /**
  * As much of a reason as is quoted in a party's post where there is no moderators' channel: in
  * one message with the pings, escaped (`plain` may double it), within Discord's 2,000.
@@ -216,6 +223,9 @@ export class ModerationReports {
     }
   >(1_000);
 
+  /** By server and Power Spot name (`spotNameKey`): when the moderators were told it is missing. */
+  private readonly spotsNoted = new BoundedMap<string, number>(1_000);
+
   constructor(private readonly options: ModerationReportsOptions) {
     this.now = options.now ?? (() => Date.now());
   }
@@ -270,6 +280,46 @@ export class ModerationReports {
     this.aside(work(), { party: notice.partyId }, 'could not tell the moderators of a pin battle');
   }
 
+  /**
+   * A Power Spot a screenshot showed, read surely, that Pine does not know (plan 8X-S, design 3):
+   * the moderators' channel near the channel it was posted in gets a note that a new Wayspot
+   * export may be due, at most once per name (`spotNameKey`) and server in `MISSING_SPOT_DAYS`
+   * (kept in memory: a restart may note a name once more). True when the staff were told, now or
+   * before, so that the member may be told so (review R13); false without the moderators'
+   * channel, which is a log line only (the server and the channel, never the name). The note is
+   * sent on the side; one that is not sent or that Discord refuses is logged and forgotten, so
+   * the next screenshot of the name sends it.
+   */
+  missingSpot(notice: { serverId: string; channelId: string; name: string }): boolean {
+    const { gateway, settings, log } = this.options;
+    // Where only: the name a member's screenshot showed stays out of the log (review r4 B2).
+    const about = { server: notice.serverId, channel: notice.channelId };
+    const name = settings.channels.moderation;
+    const channelId = name === undefined ? undefined : gateway.findChannel(notice.channelId, name);
+    if (channelId === undefined) {
+      log.info(about, 'a screenshot showed a Power Spot Pine does not know');
+      return false;
+    }
+    const key = `${notice.serverId}\n${spotNameKey(notice.name)}`;
+    const now = this.now();
+    const noted = this.spotsNoted.get(key);
+    if (noted !== undefined && now - noted < MISSING_SPOT_DAYS * DAY) return true;
+    this.spotsNoted.set(key, now);
+    const work = async (): Promise<void> => {
+      let sent: string | undefined;
+      try {
+        sent = await gateway.sendMessage(channelId, {
+          content: missingSpotNote(notice.channelId, notice.name),
+        });
+      } finally {
+        // Not sent, or refused: the next screenshot of the name tells the staff (review r4 B7).
+        if (sent === undefined) this.spotsNoted.delete(key);
+      }
+    };
+    this.aside(work(), about, 'could not tell the moderators of a Power Spot Pine does not know');
+    return true;
+  }
+
   /**
    * Says in a pin battle's notice how it went (fix review (a)), one edit at a time per battle, the
    * last word staff's. The notice is remembered in memory only: after a restart its Delete answers
diff --git a/src/services/screenshot-service.test.ts b/src/services/screenshot-service.test.ts
index 1e560635d439f22ebdfbaaa40e544476123b433a..511babcc3c2542945219ec3db985a09f6b607339 100644
--- a/src/services/screenshot-service.test.ts
+++ b/src/services/screenshot-service.test.ts
@@ -5,9 +5,8 @@ import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
 import { at, TEST_SPOT } from '../../test/support/parties.js';
 import { screenshotsWith } from '../../test/support/screenshot-service.js';
-import { eggReading, readingOf } from '../../test/support/screenshots.js';
+import { eggReading, maxReading, readingOf } from '../../test/support/screenshots.js';
 import { keptRow } from '../../test/support/wayspot-cases.js';
-import type { MaxText } from '../domain/ocr/raid-screen.js';
 import { MAX_SCREENSHOT_BYTES } from './ocr-service.js';
 import {
   isImageAttachment,
@@ -213,24 +212,6 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
     vi.useRealTimers();
   });
 
-  /** A Dynamax Machop (2★) at `spot`, the clock read surely at 13:58, 30 minutes to go. */
-  const maxReading = (spot = 'GAZEBO OF THE PARK', max: Partial<MaxText> = {}) =>
-    readingOf(
-      {
-        clock: { hour: 13, minute: 58, confidence: 0.97 },
-        countdown: 30 * 60,
-        countdownPlace: 'centre',
-        max: {
-          form: 'dynamax',
-          species: 'MACHOP',
-          powerSpot: spot,
-          spotConfidence: 0.95,
-          box: { x0: 100, y0: 1200, x1: 900, y1: 1260 },
-          ...max,
-        },
-      },
-      { heads: 2 },
-    );
   const maxWhere = (more: Partial<ScreenshotWhere> = {}) =>
     where({ uploadedAt: MAX_THURSDAY, use: 'mention', ...more });
   /** A second Power Spot whose name begins as the test spot's. */
diff --git a/test/support/posted-message.ts b/test/support/posted-message.ts
new file mode 100644
index 0000000000000000000000000000000000000000..80beed830952f6be74ee2b82d89dced1d0ba8461
--- /dev/null
+++ b/test/support/posted-message.ts
@@ -0,0 +1,51 @@
+import { EAST_CHANNEL, WEST_CHANNEL } from './gyms.js';
+import type { PostedMessage, ReplyPayload } from '../../src/commands/screenshots/mention.js';
+import type { ScreenshotSource } from '../../src/services/screenshot-service.js';
+
+/** The author of the posted messages of the screenshot tests, and another member. */
+export const AUTHOR = '700000000000000001';
+export const OTHER = '700000000000000002';
+
+/** A posted message that records what the trigger did to it. */
+export function posted(attachments: ScreenshotSource[], more: Partial<PostedMessage> = {}) {
+  const did: string[] = [];
+  const replies: ReplyPayload[] = [];
+  const message: PostedMessage = {
+    id: '800000000000000001',
+    channelId: WEST_CHANNEL,
+    guildId: '412345678901234567',
+    inThread: false,
+    authorId: AUTHOR,
+    authorBot: false,
+    member: { name: 'Rhea', team: 'instinct' },
+    createdAt: Date.now(),
+    mentionsBot: true,
+    bare: true,
+    attachments,
+    channelName: (id) => (id === EAST_CHANNEL ? 'east' : id === WEST_CHANNEL ? 'west' : undefined),
+    react: (emoji) => {
+      did.push(`react ${emoji}`);
+      return Promise.resolve();
+    },
+    unreact: (emoji) => {
+      did.push(`unreact ${emoji}`);
+      return Promise.resolve();
+    },
+    reply: (payload) => {
+      replies.push(payload);
+      did.push('reply');
+      return Promise.resolve({
+        delete: () => {
+          did.push('reply deleted');
+          return Promise.resolve();
+        },
+      });
+    },
+    delete: () => {
+      did.push('deleted');
+      return Promise.resolve();
+    },
+    ...more,
+  };
+  return { message, did, replies };
+}
diff --git a/test/support/screenshots.ts b/test/support/screenshots.ts
index 263cfabb597a7f4ce2568c55c399d385b2636e20..7c2ab9f55950431703167e210225caa5ed87f713 100644
--- a/test/support/screenshots.ts
+++ b/test/support/screenshots.ts
@@ -1,4 +1,4 @@
-import type { ScreenText } from '../../src/domain/ocr/raid-screen.js';
+import type { MaxText, ScreenText } from '../../src/domain/ocr/raid-screen.js';
 import type { HeadCount } from '../../src/domain/ocr/tier-heads.js';
 import type { ScreenReading } from '../../src/ocr/screen-reader.js';
 import type { OcrOutcome, ReadOptions, ScreenshotReader } from '../../src/services/ocr-service.js';
@@ -69,6 +69,36 @@ export function eggReading(
   return readingOf({ gym, clock, countdown, countdownPlace: 'centre' }, { heads });
 }
 
+/**
+ * A max battle's screen (plan 8X-S): Dynamax Machop with two heads at `spot` (the test spot's
+ * name by default, read surely), the clock read surely at 13:58 (`MAX_THURSDAY` is 14:00) and
+ * `countdown` seconds to go (30 minutes); `max` and `text` change any of it.
+ */
+export function maxReading(
+  spot = 'GAZEBO OF THE PARK',
+  max: Partial<MaxText> = {},
+  text: Partial<ScreenText> = {},
+  heads = 2,
+): ScreenReading {
+  return readingOf(
+    {
+      clock: { hour: 13, minute: 58, confidence: 0.97 },
+      countdown: 30 * 60,
+      countdownPlace: 'centre',
+      max: {
+        form: 'dynamax',
+        species: 'MACHOP',
+        powerSpot: spot,
+        spotConfidence: 0.95,
+        box: { x0: 100, y0: 1200, x1: 900, y1: 1260 },
+        ...max,
+      },
+      ...text,
+    },
+    { heads },
+  );
+}
+
 /** The first bytes of a PNG file: what a fake screenshot starts with, so that it is kept. */
 const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
````

### Task 7: 8X-S 7: /max screenshot:

Prototype commit: `8f05a24393e92e4e5c16d974bcaae26a231baf39`

/max is forConfig on ocr.enabled, as /raid: where screenshots are read it
has the attachment option screenshot (last) and boss: and spot: optional;
without it both stay required (review R1).

- The guard: without a screenshot a missing boss or spot is refused before
  the throttle ("Give the boss and the spot of the max battle (or attach a
  screenshot of it)."); with one nothing is read before the screenshot but
  an end: that is no time. Deferred privately with a screenshot; execute
  takes the screenshot's way before the guard's reading.
- What is typed stands in the place of what is read (withMaxTyped beside
  withSpot: the spot, the boss as a listed one, the end instead of the
  countdown); a typed boss on no list without tier: takes the screen's tier
  (its heads, or Gigantamax by its form), else WHICH_TIER.
- A screenshot that cannot be read at all, beside a typed boss and spot,
  reports those as /max does, with "I could not read the screenshot, so I
  used what you typed."; else the reader's words naming /max (R14:
  unreadWords(outcome, 'max')).
- A raid's screen is refused, also beside typed values: "That's a raid:
  use /raid screenshot:, or post it with a mention." A picture that is no
  screen of either kind is unreadable, as /raid takes it: what was typed,
  else "This does not look like the screen of a max battle, so I made
  nothing of it."
- A Power Spot not clear: a menu (max:<token>:spot); a clear one of another
  region (read, not typed): "<spot> is in <#region>, not in this region.
  Report the max battle there?" (max:<token>:yes / :no), both through
  maxControls with a store carriesOn reads, so a battle without a post gives
  the use back from them too (R7).
- Refusals say why (maxRefusalWords; the moderators' note for a missing
  Power Spot read surely), then "Nothing was reported. This is what I
  read:" and maxReadingLines, with the feedback row; a report goes through
  reportMaxShot and answers with maxShotWords, the doubts (maxDoubtLines)
  and the button that shows the screenshot (R6).
- 'max' is a use of a screenshot record; the help of /max and /raid say it.

**Files:**

```
 docs/architecture/screenshots.md        |   1 +
 src/commands/max/max-input.ts           |   4 +-
 src/commands/max/max-report.ts          |   2 +-
 src/commands/max/max-screenshot.test.ts | 354 ++++++++++++++++++++++++++++++++++++++++++++
 src/commands/max/max-screenshot.ts      | 573 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/max/max-shot.ts            |  18 ++-
 src/commands/max/max.ts                 | 229 ++++++++++++++++++++---------
 src/commands/raids/raid.ts              |   3 +-
 src/domain/ocr/max-decision.ts          |  73 ++++++++++
 src/domain/ocr/max-report.ts            |   3 +-
 src/domain/ocr/screenshot-record.ts     |   2 +-
 src/render/screenshot-reading.ts        |  82 ++++++++++-
 src/services/screenshot-service.ts      |  18 ++-
 13 files changed, 1267 insertions(+), 95 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/max-screenshot.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8f05a24393e92e4e5c16d974bcaae26a231baf39 -- docs/architecture/screenshots.md src/commands/max/max-input.ts src/commands/max/max-report.ts src/commands/max/max-screenshot.test.ts src/commands/max/max-screenshot.ts src/commands/max/max-shot.ts src/commands/max/max.ts src/commands/raids/raid.ts src/domain/ocr/max-decision.ts src/domain/ocr/max-report.ts src/domain/ocr/screenshot-record.ts src/render/screenshot-reading.ts src/services/screenshot-service.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 7: /max screenshot:`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index b2e164440a9bcae89e768677d6d56e82a971b3ee..c9f726cc82267499e1547a9f3f01e0dca8ade91f 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -22,5 +22,6 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 
 ## On Discord
 
+- `/max screenshot:` (plan 8X-S; `src/commands/max/max-screenshot.ts`; review R1, R6, R7): `/max` is `forConfig` on `ocr.enabled` as `/raid` (the attachment option last, `boss:` and `spot:` optional with it, both required without it); without a screenshot a guard refuses a missing boss or spot ("Give the boss and the spot of the max battle (or attach a screenshot of it)."), with one it reads nothing before the screenshot but an `end:` that is no time (refused at once); always deferred privately with a screenshot. What was typed is read first (`boss:`, `spot:` by `readSpot`, a pin too, `end:`) and stands in the place of what was read (`withMaxTyped` in `max-decision.ts`: the spot as `withSpot`, the boss as a listed one, the end instead of the countdown, then no clean read of a rotation's end); a typed boss on no list without `tier:` takes the screen's tier (its heads, or Gigantamax by its form), else `WHICH_TIER`; `tier:` typed without `boss:` is the tier of a boss read that is on no list, when it is of the screen's kind (`MaxTyped.tier`, settling `tier-unknown`; a listed boss keeps the list's, review r4 B1). A screenshot that cannot be read at all, beside a typed boss and spot, reports those as `/max` does with "I could not read the screenshot, so I used what you typed." (no ending-soon question); otherwise `unreadWords(outcome, 'max')` (naming `/max`, review R14). A raid's screen is refused, also beside typed values: "That is a raid: use `/raid screenshot:`, or post it with a mention." (`RAID_SCREEN_FOR_MAX`). A Power Spot not clear is asked with a menu (`max:<token>:spot`, the region's first, another region's named; `maxControls.select`, the record's `pickedSpot`), a clear one of another region read (not typed) confirmed as `/raid` confirms a gym ("<spot> is in <#region>, not in this region. Report the max battle there?", `max:<token>:yes` / `:no`); both wait in a store of their own that `maxControls.carriesOn` reads, so a battle refused for none of the member's doing (no post, the battle there ended twice) gives the use back from them too, and so does a pin typed beside the screenshot by a member blocked from meetups (`pin-blocked`, as `/max`'s guard refuses it uncounted; `maxShotGivesBack`, review r4 B3). A refusal says why (`maxRefusalWords`, a missing Power Spot read surely telling the moderators as a mention does), "Nothing was reported. This is what I read:" and `maxReadingLines`, with the feedback row; a report goes through `reportMaxShot` (the forum bar, the battle there joined, changed or refused) and answers with `maxShotWords`, what the screenshot left unsure (`maxDoubtLines`) and `showRow` (R6: as `/raid` answers); `/max`'s throttle counts it.
 - Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I don’t know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely, the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I’ve let the staff know Pine may be missing this Power Spot."). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I couldn’t tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question; the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
 - `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
diff --git a/src/commands/max/max-input.ts b/src/commands/max/max-input.ts
index 3b03d70b6d7bab24ef849369d3ba09076d4d0238..2bd8d7653619351206c96fff9b266320e8d081d0 100644
--- a/src/commands/max/max-input.ts
+++ b/src/commands/max/max-input.ts
@@ -210,7 +210,7 @@ export function readMaxBoss(
 /** `/max`'s `spot` takes power spots only (design 3.2). */
 const SPOTS_ONLY: PlaceKindsOnly = {
   kinds: ['powerspot'],
-  refusal: 'A max battle is at a power spot: pick one from the list, or give a maps link.',
+  refusal: 'A max battle is at a Power Spot: pick one from the list, or give a maps link.',
 };
 
 /**
@@ -226,7 +226,7 @@ export async function readSpot(
   text: string,
 ): Promise<MaxSpot> {
   const place = await namedPlace(interaction, ctx, text, 'or give a maps link', SPOTS_ONLY);
-  if (!place) throw new UserError('Name the power spot of the battle.');
+  if (!place) throw new UserError('Name the Power Spot of the battle.');
   if (place.kind === 'powerspot') return place as PowerSpot;
   if (place.kind !== 'pin') throw new UserError(SPOTS_ONLY.refusal);
   const row = await ctx.guilds.idFor(guildIdOf(interaction));
diff --git a/src/commands/max/max-report.ts b/src/commands/max/max-report.ts
index 1d6720689402104a443224ff5398678885772ca3..19ce139d308ee6c95220813858699884c81593fe 100644
--- a/src/commands/max/max-report.ts
+++ b/src/commands/max/max-report.ts
@@ -41,7 +41,7 @@ export const MAX_BARRED =
  */
 export const MAX_PIN_BLOCKED =
   'You are blocked from making meetups in this server, so you cannot report a max battle at an ' +
-  'unlisted power spot. Pick a power spot from the list.';
+  'unlisted power spot. Pick a Power Spot from the list.';
 
 /**
  * What `/max` says when the battle a report would join ended while it waited, and the one after
diff --git a/src/commands/max/max-screenshot.test.ts b/src/commands/max/max-screenshot.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..78f7e15ae84a8803d29421a3872b5686b11e34ca
--- /dev/null
+++ b/src/commands/max/max-screenshot.test.ts
@@ -0,0 +1,354 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  FAKE_USER_ID,
+  fakeButton,
+  fakeChatInput,
+  fakeSelect,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
+import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
+import { asMax, at, TEST_SPOT } from '../../../test/support/parties.js';
+import { screenshotsWith } from '../../../test/support/screenshot-service.js';
+import { eggReading, maxReading, readingOf } from '../../../test/support/screenshots.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { keptRow } from '../../../test/support/wayspot-cases.js';
+import { enabledCommands } from '../../discord/command.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { Throttles } from '../../discord/throttle.js';
+import type { WayspotRow } from '../../domain/wayspots/kept.js';
+import type { ScreenReading } from '../../ocr/screen-reader.js';
+import type { OcrOutcome } from '../../services/ocr-service.js';
+import { screenshotControls } from '../screenshots/feedback.js';
+import { max, maxControls } from './max.js';
+import { MAX_COMMAND, MAX_PIN_BLOCKED, MAX_THROTTLE } from './max-report.js';
+
+/*
+ * `/max screenshot:` (plan 8X-S, task 6). `MAX_THURSDAY` is 14:00; `maxReading()` is a Dynamax
+ * Machop (2★) at the test spot's Power Spot, its clock read surely at 13:58 and 30 minutes to go.
+ */
+
+const END = at('2026-10-22T14:28');
+const t = (time: number) => `<t:${String(time / 1000)}:t>`;
+
+/** A second Power Spot whose name begins as the test spot's. */
+const POND = keptRow(2, {
+  id: 'c0ffee00c0ffee00c0ffee00c0ffee01.16',
+  kind: 'powerspot',
+  title: 'Gazebo of the Pond',
+  lat: TEST_SPOT.lat + 0.0001,
+  lon: TEST_SPOT.lon,
+});
+
+async function setup(safety: SafetyOptions = { moderation: null }, rows: WayspotRow[] = []) {
+  const made = await maxReportingWith(safety, rows);
+  const shots = screenshotsWith(made.ctx);
+  const ctx = { ...made.ctx, screenshots: shots.screenshots };
+  const throttles = new Throttles();
+  const router = new InteractionRouter(ctx, [max], [maxControls, screenshotControls], {
+    throttles,
+  });
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    await made.service.flush();
+    return interaction;
+  };
+  /** `/max` with these options, and this screenshot attached when one is given. */
+  const run = (
+    options: Record<string, string>,
+    reading?: ScreenReading | OcrOutcome,
+    channelId = WEST_CHANNEL,
+  ) =>
+    handle(
+      fakeChatInput({
+        commandName: 'max',
+        channelId,
+        options,
+        ...(reading === undefined
+          ? {}
+          : { resolved: { screenshot: shots.screenshot('max.png', reading) } }),
+      }),
+    );
+  return { ...shots, ...made, ctx, router, throttles, handle, run };
+}
+
+/** What the member was told: a follow-up, else the edit of the deferred answer, else the reply. */
+function told(interaction: FakeInteraction) {
+  for (const responder of [interaction.followUp, interaction.editReply, interaction.reply]) {
+    if (responder.mock.calls.length > 0) return sent(responder);
+  }
+  throw new Error('nothing was told');
+}
+
+function rowsOf(payload: { components?: readonly unknown[] }) {
+  return (payload.components ?? []).map(
+    (row) =>
+      ((row as { toJSON?: () => unknown }).toJSON?.() ?? row) as {
+        components: {
+          custom_id: string;
+          label?: string;
+          options?: { label: string; value: string; description?: string }[];
+        }[];
+      },
+  );
+}
+
+describe('/max screenshot:', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reports the battle it reads, with its screenshot and the button that shows it', async () => {
+    const made = await setup();
+    const used = await made.run({}, maxReading());
+    const battle = asMax(made.store.active()[0]);
+    expect(battle).toMatchObject({
+      endTime: END,
+      max: { boss: { key: 'machop' }, tier: 'D2', spot: { id: TEST_SPOT.id } },
+    });
+    const id = battle.max.screenshot?.id ?? '';
+    expect(id).not.toBe('');
+    const answer = told(used);
+    expect(answer.content).toBe(
+      `Reported: Dynamax Machop (2★) at Gazebo of the Park, until ${t(END)}. Its post is ` +
+        `<#${battle.forumPostId ?? ''}>.`,
+    );
+    expect(rowsOf(answer)[0]?.components[0]).toMatchObject({
+      custom_id: `shot:${id}:show`,
+      label: 'Screenshot feedback',
+    });
+    const kept = await made.screenshots.get(id);
+    expect(kept).toMatchObject({ record: { use: 'max', keepUntil: null } });
+  });
+
+  it('lets what the member typed count instead of what it read', async () => {
+    const made = await setup(undefined, [POND]);
+    await made.run(
+      { boss: 'Machamp', tier: 'D3', spot: `powerspot:${POND.id}`, end: '20' },
+      maxReading(),
+    );
+    expect(asMax(made.store.active()[0])).toMatchObject({
+      endTime: at('2026-10-22T14:20'),
+      max: { boss: { key: 'machamp' }, tier: 'D3', spot: { id: POND.id } },
+    });
+  });
+
+  it('takes the tier of a typed boss on no list from the heads it read', async () => {
+    const made = await setup();
+    await made.run({ boss: 'Machamp' }, maxReading(undefined, {}, {}, 3));
+    expect(asMax(made.store.active()[0]).max).toMatchObject({
+      boss: { key: 'machamp' },
+      tier: 'D3',
+    });
+  });
+
+  // Review r4 B1.
+  it('takes `tier:` typed alone as the tier of a boss on no list whose heads it did not read', async () => {
+    const made = await setup();
+    const used = await made.run(
+      { tier: 'D3' },
+      maxReading(undefined, { species: 'MACHAMP' }, {}, 0),
+    );
+    expect(told(used).content).toMatch(/^Reported: Dynamax Machamp \(3★\)/);
+    expect(asMax(made.store.active()[0]).max).toMatchObject({
+      boss: { key: 'machamp' },
+      tier: 'D3',
+    });
+  });
+
+  // Review r4 B3: as `/max` gives a refusal at a pin back.
+  it('refuses a pin typed beside it to a member blocked from meetups, uncounted', async () => {
+    const made = await setup({});
+    await made.storage.addBlock(made.gateway.guildId, FAKE_USER_ID, {
+      id: '200000000000000009',
+      name: 'Mod',
+      at: MAX_THURSDAY,
+    });
+    // One more than `/max` allows: none of them counted.
+    for (let n = 0; n <= MAX_THROTTLE.uses; n++) {
+      const refused = await made.run({ spot: '40.05, -80.05' }, maxReading());
+      expect(told(refused).content).toContain(MAX_PIN_BLOCKED);
+    }
+    expect(made.store.active()).toEqual([]);
+  });
+
+  it('reports what was typed when the screenshot cannot be read, and says why otherwise', async () => {
+    const made = await setup();
+    const typed = await made.run(
+      { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
+      { kind: 'unavailable' },
+    );
+    expect(told(typed).content).toMatch(
+      /^I could not read the screenshot, so I used what you typed\.\nReported: Dynamax Machop \(2★\) at Gazebo of the Park/,
+    );
+    expect(made.store.active()).toHaveLength(1);
+    const bare = await made.run({}, { kind: 'unavailable' });
+    expect(told(bare).content).toBe(
+      'I cannot read screenshots at the moment. Report the max battle with `/max` and its options.',
+    );
+  });
+
+  it('refuses a raid’s screen, also beside a typed boss and spot', async () => {
+    const made = await setup();
+    const egg = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 59 }, 20 * 60);
+    for (const typed of [{}, { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` }] as Record<
+      string,
+      string
+    >[]) {
+      const used = await made.run(typed, egg);
+      expect(told(used).content).toBe(
+        'That is a raid: use `/raid screenshot:`, or post it with a mention.',
+      );
+    }
+    expect(made.store.active()).toEqual([]);
+  });
+
+  it('takes a picture that is no screen as unreadable: what was typed, else why not', async () => {
+    const made = await setup();
+    const picture = readingOf({ gym: 'Old Stone Fountain' });
+    const bare = await made.run({}, picture);
+    expect(told(bare).content).toBe(
+      'This does not look like the screen of a max battle, so I made nothing of it.',
+    );
+    const typed = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` }, picture);
+    expect(told(typed).content).toMatch(
+      /^I could not read the screenshot, so I used what you typed\.\nReported: Dynamax Machop/,
+    );
+  });
+
+  it('needs the boss and the spot without a screenshot, before counting the use', async () => {
+    const made = await setup();
+    const none = await made.run({});
+    expect(told(none).content).toBe(
+      'Give the boss and the spot of the max battle (or attach a screenshot of it).',
+    );
+    const noSpot = await made.run({ boss: 'Machop' });
+    expect(told(noSpot).content).toBe(
+      'Give the spot of the max battle (or attach a screenshot of it).',
+    );
+    const now = Date.now();
+    for (let i = 0; i < MAX_THROTTLE.uses; i++) {
+      expect(made.throttles.use(MAX_COMMAND, FAKE_USER_ID, MAX_THROTTLE, now)).toBeUndefined();
+    }
+  });
+
+  it('refuses a typed end that is no time before reading the screenshot', async () => {
+    const made = await setup();
+    const used = await made.run({ end: 'soonish' }, maxReading());
+    expect(told(used).content).toBe(
+      'I could not read "soonish" as the time the battle ends. Try `20` (minutes from now) or `6:15pm`.',
+    );
+    expect(made.reader.reads).toBe(0);
+  });
+
+  it('asks which Power Spot a name cut short may be, and reports at the one picked', async () => {
+    const made = await setup(undefined, [POND]);
+    const used = await made.run({}, maxReading('GAZEBO OF THE P'));
+    expect(made.store.active()).toEqual([]);
+    const question = told(used);
+    expect(question.content).toBe(
+      `Dynamax Machop (2★), ending at ${t(END)}. Which Power Spot is it? I read "GAZEBO OF THE P".`,
+    );
+    const [menu] = rowsOf(question)[0]?.components ?? [];
+    expect(menu?.options?.map((option) => option.value)).toEqual([TEST_SPOT.id, POND.id]);
+    const pick = await made.handle(
+      fakeSelect({ customId: menu?.custom_id ?? '', values: [POND.id] }),
+    );
+    const battle = asMax(made.store.active()[0]);
+    expect(battle.max.spot).toMatchObject({ id: POND.id });
+    expect(told(pick).content).toMatch(/^Reported: Dynamax Machop \(2★\) at Gazebo of the Pond/);
+    const kept = await made.screenshots.get(battle.max.screenshot?.id ?? '');
+    expect(kept).toMatchObject({ record: { pickedSpotId: POND.id } });
+  });
+
+  it('gives the use back when the battle chosen from the menu gets no post', async () => {
+    const made = await setup(undefined, [POND]);
+    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    // Nineteen uses before it: the menu's use is the twentieth.
+    for (let i = 0; i < MAX_THROTTLE.uses - 1; i++) {
+      made.throttles.use(MAX_COMMAND, FAKE_USER_ID, MAX_THROTTLE, Date.now());
+    }
+    const used = await made.run({}, maxReading('GAZEBO OF THE P'));
+    const [menu] = rowsOf(told(used))[0]?.components ?? [];
+    const pick = await made.handle(
+      fakeSelect({ customId: menu?.custom_id ?? '', values: [POND.id] }),
+    );
+    expect(told(pick).content).toMatch(/^I am not allowed to make posts in /);
+    expect(made.throttles.use(MAX_COMMAND, FAKE_USER_ID, MAX_THROTTLE, Date.now())).toBeUndefined();
+  });
+
+  it('confirms a clear Power Spot of another region before reporting it there', async () => {
+    const made = await setup();
+    const used = await made.run({}, maxReading(), EAST_CHANNEL);
+    expect(made.store.active()).toEqual([]);
+    const question = told(used);
+    expect(question.content).toBe(
+      `Gazebo of the Park is in <#${WEST_CHANNEL}>, not in this region. Report the max battle there?`,
+    );
+    const [yes, no] = rowsOf(question)[0]?.components ?? [];
+    expect([yes?.label, no?.label]).toEqual(['Report it there', 'Cancel']);
+    const press = await made.handle(fakeButton({ customId: yes?.custom_id ?? '' }));
+    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ id: TEST_SPOT.id });
+    expect(told(press).content).toMatch(/^Reported: Dynamax Machop \(2★\)/);
+  });
+
+  it('refuses a Power Spot it does not know, and tells the staff of a name read surely', async () => {
+    const made = await setup({});
+    const used = await made.run({}, maxReading('NOWHERE IN PARTICULAR'));
+    expect(told(used).content).toMatch(
+      /^I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `\/max spot:`\. I have let the staff know Pine may be missing this Power Spot\.\nNothing was reported\. This is what I read:\n/,
+    );
+    await made.reports.flush();
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+    // A spot typed beside it is reported, and nobody is told.
+    await made.run({ spot: `powerspot:${TEST_SPOT.id}` }, maxReading('SOMEWHERE ELSE'));
+    expect(made.store.active()).toHaveLength(1);
+    await made.reports.flush();
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+  });
+
+  it('offers the screenshot option where screenshots are read, boss and spot optional there', () => {
+    const { ctx } = createTestContext();
+    const off = {
+      ...ctx.config,
+      settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, enabled: false } },
+    };
+    const required = (config: typeof off) =>
+      enabledCommands([max], config)[0]
+        ?.data.toJSON()
+        .options?.map((o) => [o.name, o.required ?? false]);
+    expect(required(off)).toEqual([
+      ['boss', true],
+      ['spot', true],
+      ['tier', false],
+      ['end', false],
+    ]);
+    expect(required(ctx.config)).toEqual([
+      ['boss', false],
+      ['spot', false],
+      ['tier', false],
+      ['end', false],
+      ['screenshot', false],
+    ]);
+  });
+
+  // Matt, 2026-10-23 (review r4 B4): "Power Spot" as the game writes it, but the pin's name.
+  it('writes Power Spot as the game does in the definition and the help, but the pin’s name', () => {
+    const { ctx } = createTestContext();
+    const command = enabledCommands([max], ctx.config)[0];
+    const json = command?.data.toJSON();
+    const details = command?.help?.details;
+    const texts = [
+      json?.description,
+      ...(json?.options ?? []).map((option) => option.description),
+      typeof details === 'function' ? details(ctx.config.settings) : details,
+    ].join('\n');
+    expect(texts).toContain('Power Spot');
+    expect(texts.replaceAll('unlisted power spot', '')).not.toMatch(/power spot/);
+  });
+});
diff --git a/src/commands/max/max-screenshot.ts b/src/commands/max/max-screenshot.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e7ac390f48f99cf653845bf7d5da3e887690791d
--- /dev/null
+++ b/src/commands/max/max-screenshot.ts
@@ -0,0 +1,573 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIActionRowComponent,
+  type APIComponentInMessageActionRow,
+  type Attachment,
+  type ButtonInteraction,
+  type ChatInputCommandInteraction,
+  type StringSelectMenuInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ControlThrottle } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, isStaff, regionChannelOf } from '../../discord/guards.js';
+import { memberInfo } from '../../discord/member-info.js';
+import { whenCounted } from '../../discord/router.js';
+import {
+  decideMax,
+  withMaxTyped,
+  withSpot,
+  type MaxDecision,
+  type ScreenshotMax,
+} from '../../domain/ocr/max-decision.js';
+import type { MaxDoubt, MaxScreenshotReport } from '../../domain/ocr/max-report.js';
+import type { SpotTitle } from '../../domain/ocr/power-spot-match.js';
+import { maxSpotName } from '../../domain/party/max.js';
+import type { MaxSpot } from '../../domain/party/party.js';
+import { isMaxTier, type MaxTier } from '../../domain/pogo/max-tier.js';
+import { MAX_KIND } from '../../render/max-dialog.js';
+import {
+  maxDoubtLines,
+  maxReadingLines,
+  maxRefusalWords,
+  MAX_TIER_UNKNOWN,
+  shortMaxReading,
+  STAFF_TOLD,
+} from '../../render/screenshot-reading.js';
+import { plain, truncate } from '../../render/text.js';
+import { PendingRequests } from '../../services/pending-requests.js';
+import { unreadWords } from '../../services/screenshot-service.js';
+import { feedbackRow, showRow } from '../screenshots/feedback.js';
+import { readAttachedOutcome } from '../screenshots/read-screenshot.js';
+import {
+  readMaxBoss,
+  readSpot,
+  reportedEnd,
+  typedMaxTime,
+  WHICH_TIER,
+  type ReadMaxBoss,
+} from './max-input.js';
+import {
+  MAX_BARRED,
+  MAX_COMMAND,
+  MAX_THROTTLE,
+  maxBarred,
+  maxReportWords,
+  reportMaxAs,
+} from './max-report.js';
+import {
+  maxShotGivesBack,
+  maxShotRequest,
+  maxShotWords,
+  reportMaxShot,
+  SPOT_GONE,
+  type MaxShotRequest,
+} from './max-shot.js';
+
+/*
+ * `/max screenshot:` (plan 8X-S; design 2, review R1, R6, R7): the battle a max battle's
+ * screenshot shows, read in the place of what was not typed, reported as a mention reports it
+ * (`reportMaxShot`: a battle there joined, its boss changed by a newer screenshot, or refused);
+ * a Power Spot that is not clear asked with a menu, a clear one of another region confirmed, as
+ * `/raid` asks and confirms a gym. What the member typed stands in the place of what was read
+ * (`withMaxTyped`); a screenshot that cannot be read, beside a typed boss and spot, reports what
+ * was typed. No ending-soon question (design 5).
+ */
+
+const MESSAGE = 2_000;
+const EXPIRED = 'That choice has expired. Use `/max` again.';
+const NOT_YOURS = 'That is somebody else’s report.';
+
+/** Said before what came of a report that could only use what was typed. */
+const TYPED_ONLY = 'I could not read the screenshot, so I used what you typed.';
+
+/** `/max screenshot:` given a raid's screen (plan 8X-S): the wrong picture. */
+export const RAID_SCREEN_FOR_MAX =
+  'That is a raid: use `/raid screenshot:`, or post it with a mention.';
+
+/** `/max screenshot:` given a picture that is no screen of a raid or a max battle. */
+const MAX_NO_SCREEN =
+  'This does not look like the screen of a max battle, so I made nothing of it.';
+
+/** A pin typed as `spot:` stands in the report as a title of its own. */
+const PIN_TITLE_ID = 'pin';
+
+type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
+type Answerable = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;
+
+/** What was typed beside the screenshot that stands in the place of what was read. */
+interface Typed {
+  boss?: ReadMaxBoss;
+  spot?: MaxSpot;
+  end?: number;
+}
+
+/** A report from a screenshot that waits for the Power Spot menu or the other region's Yes. */
+interface PendingShot {
+  /** The report with what was typed put in, but the spot. */
+  report: MaxScreenshotReport;
+  /** The spots offered in the menu. */
+  spots: SpotTitle[];
+  typed: Typed;
+  regionChannelId: string;
+  guildRow: number;
+  screenshotId: string | undefined;
+  /** When `/max` was used: what is over by then is over. */
+  uploadedAt: number;
+  /** When the router counted the use (`carriesOn`). */
+  countedAt: number;
+  /** For the other region's confirmation: the report to make. */
+  request?: MaxShotRequest;
+}
+
+const pending = new PendingRequests<PendingShot>();
+
+/** The screenshot given to `/max`, where screenshots are read. */
+export function screenshotOf(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Attachment | null {
+  return ctx.config.settings.ocr.enabled ? interaction.options.getAttachment('screenshot') : null;
+}
+
+/**
+ * The guard of `/max` with a screenshot (review R1): nothing is read before the screenshot but
+ * an end that is no time at all, which is refused now, before the throttle.
+ */
+export function requireReadableEnd(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): void {
+  const text = interaction.options.getString('end');
+  if (text !== null && text.trim() !== '') typedMaxTime(ctx, 'end', text, Date.now());
+}
+
+/** The tier the screenshot gives a boss typed without one: its heads, or its form's. */
+function tierOfScreen(report: MaxScreenshotReport): MaxTier | undefined {
+  if (report.form === 'gigantamax' || report.form === 'eternamax') return 'G';
+  const { heads } = report;
+  return heads !== null && heads >= 1 && heads <= 5 ? (`D${String(heads)}` as MaxTier) : undefined;
+}
+
+/** The doubts said with the answer: what the member did not type over. */
+function doubtsOf(report: MaxScreenshotReport): MaxDoubt[] {
+  return report.doubts.filter((doubt) => doubt !== 'spot-unclear' && doubt !== 'no-spot');
+}
+
+/**
+ * `/max` with a screenshot: what was typed is read first (a boss, a spot, an end), the
+ * screenshot then, decided with what was typed in its place, and reported, asked about or
+ * refused with what was read. The interaction is deferred.
+ */
+export async function reportMaxFromScreenshot(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  attachment: Attachment,
+): Promise<void> {
+  const now = Date.now();
+  const countedAt = whenCounted(interaction) ?? now;
+  const regionChannelId = regionChannelOf(interaction, ctx);
+  const guildRow = await ctx.guilds.idFor(guildIdOf(interaction));
+  if (regionChannelId === undefined || guildRow === undefined) {
+    throw new UserError('Use `/max` in a region channel.');
+  }
+  const bossText = interaction.options.getString('boss')?.trim() ?? '';
+  const tierText = interaction.options.getString('tier');
+  const spotText = interaction.options.getString('spot')?.trim() ?? '';
+  const endText = interaction.options.getString('end')?.trim() ?? '';
+  const typed: Typed = {};
+  // A boss on no list typed without a tier takes the screenshot's (`tierOfScreen`), else asks.
+  let bossWithoutTier = false;
+  if (bossText !== '') {
+    try {
+      typed.boss = readMaxBoss(ctx, bossText, tierText, now);
+    } catch (err) {
+      if (!(err instanceof UserError && err.message === WHICH_TIER)) throw err;
+      bossWithoutTier = true;
+    }
+  }
+  if (spotText !== '') typed.spot = await readSpot(interaction, ctx, spotText);
+  if (endText !== '') {
+    const end = typedMaxTime(ctx, 'end', endText, now);
+    if (end !== 'unset') typed.end = end.at;
+  }
+  const outcome = await readAttachedOutcome(interaction, ctx, attachment, { use: 'max' });
+  // Not read, or a picture that is no screen at all, but the boss and the spot were typed: those
+  // are reported (as `/raid`'s `typedOnly`).
+  const typedOnly = async (): Promise<boolean> => {
+    if (bossText === '' || !typed.spot) return false;
+    if (!typed.boss) throw new UserError(WHICH_TIER);
+    await reportTyped(interaction, ctx, { ...typed, boss: typed.boss, spot: typed.spot }, now);
+    return true;
+  };
+  if (outcome.kind !== 'read') {
+    if (await typedOnly()) return;
+    throw new UserError(unreadWords(outcome, 'max'));
+  }
+  const feedback = outcome.id === undefined ? [] : [feedbackRow(outcome.id)];
+  if (outcome.screen === 'raid') {
+    const { decision } = outcome;
+    if (decision.kind === 'refuse' && decision.reason === 'not-a-raid-screen') {
+      // No screen of either kind: unreadable, as `/raid` takes it.
+      if (await typedOnly()) return;
+      await interaction.editReply({
+        content: MAX_NO_SCREEN,
+        components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
+      });
+      return;
+    }
+    // A raid's screen is the wrong picture, whatever was typed beside it.
+    await interaction.editReply({ content: RAID_SCREEN_FOR_MAX, components: feedback });
+    return;
+  }
+  if (bossWithoutTier) {
+    const tier = tierOfScreen(outcome.report);
+    if (tier === undefined) throw new UserError(WHICH_TIER);
+    typed.boss = readMaxBoss(ctx, bossText, tier, now);
+  }
+  const report = withMaxTyped(outcome.report, {
+    ...(typed.boss
+      ? { boss: { ref: typed.boss.boss, name: typed.boss.label, tier: typed.boss.tier } }
+      : {}),
+    // `tier:` beside the screenshot without `boss:` counts too (review r4 B1).
+    ...(bossText === '' && tierText !== null && isMaxTier(tierText) ? { tier: tierText } : {}),
+    ...(typed.end === undefined ? {} : { end: typed.end }),
+  });
+  const shot: PendingShot = {
+    report,
+    spots: [],
+    typed,
+    regionChannelId,
+    guildRow,
+    screenshotId: outcome.id,
+    uploadedAt: interaction.createdTimestamp,
+    countedAt,
+  };
+  const deciding = { now: interaction.createdTimestamp };
+  // A spot typed is the battle's, whatever was read (a pin stands as a title of its own).
+  const decision = typed.spot
+    ? decideMax(withSpot(report, typedTitle(typed.spot)), deciding)
+    : decideMax(report, deciding);
+  const read = maxReadingLines(outcome.report);
+  if (decision.kind === 'ask' && decision.about === 'spot') {
+    await askSpot(interaction, ctx, { ...shot, spots: decision.spots.slice(0, 25) });
+    return;
+  }
+  if (decision.kind !== 'report') {
+    const words = refusal(interaction, ctx, decision);
+    await interaction.editReply({
+      content: truncate(
+        [words, 'Nothing was reported. This is what I read:', '', ...read].join('\n'),
+        MESSAGE,
+      ),
+      components: feedback,
+    });
+    return;
+  }
+  await goOn(interaction, ctx, shot, decision.battle);
+}
+
+/** A typed spot as the report's Power Spot. */
+function typedTitle(spot: MaxSpot): SpotTitle {
+  return {
+    id: spot.kind === 'powerspot' ? spot.id : PIN_TITLE_ID,
+    title: maxSpotName(spot),
+    local: true,
+  };
+}
+
+/**
+ * What a refusal or the tier's question says; a Power Spot not known whose name was read surely
+ * tells the moderators (`ModerationReports.missingSpot`), and then says so (review R13).
+ */
+function refusal(
+  interaction: Answerable,
+  ctx: AppContext,
+  decision: Exclude<MaxDecision, { kind: 'report' } | { kind: 'ask'; about: 'spot' }>,
+): string {
+  if (decision.kind === 'ask') return MAX_TIER_UNKNOWN;
+  const times = ctx.config.settings.maxBattles;
+  if (decision.reason !== 'no-spot') return maxRefusalWords(decision.reason, times);
+  const words = maxRefusalWords('no-spot', times, decision.read);
+  const told =
+    decision.read !== null &&
+    decision.readSurely &&
+    ctx.reports.missingSpot({
+      serverId: guildIdOf(interaction),
+      channelId: interaction.channelId,
+      name: decision.read,
+    });
+  return told ? `${words} ${STAFF_TOLD}` : words;
+}
+
+/** Asks which of the spots the screenshot shows, with a menu, the region's first (R7). */
+async function askSpot(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  shot: PendingShot,
+): Promise<void> {
+  const token = pending.put(interaction.user.id, shot);
+  const { report } = shot;
+  const read = report.spot.read ? ` I read "${plain(truncate(report.spot.read, 80))}".` : '';
+  const regionName = (channelId: string) => interaction.guild?.channels.cache.get(channelId)?.name;
+  const options = shot.spots.map((spot) => {
+    const [elsewhere] = spot.local ? [] : ctx.wayspots.regionsOf(spot.id);
+    const region = elsewhere === undefined ? undefined : regionName(elsewhere);
+    return {
+      label: truncate(spot.title, 100),
+      value: spot.id,
+      ...(region === undefined ? {} : { description: truncate(region, 100) }),
+    };
+  });
+  await interaction.editReply({
+    content: truncate(
+      `${shortMaxReading(report, shot.typed.boss?.label)}. Which Power Spot is it?${read}`,
+      MESSAGE,
+    ),
+    components: [
+      {
+        type: ComponentType.ActionRow,
+        components: [
+          {
+            type: ComponentType.StringSelect,
+            custom_id: encodeCustomId({ kind: MAX_KIND, id: token, action: 'spot' }),
+            placeholder: 'Choose the Power Spot',
+            options,
+          },
+        ],
+      },
+      buttons(token, 'Cancel'),
+    ],
+  });
+}
+
+/** "Report it there" (when `yes` is given) and "Cancel" of a waiting report. */
+function buttons(token: string, cancel: string, yes?: string): Row {
+  const button = (
+    action: string,
+    label: string,
+    style: ButtonStyle.Primary | ButtonStyle.Secondary,
+  ) => ({
+    type: ComponentType.Button as const,
+    custom_id: encodeCustomId({ kind: MAX_KIND, id: token, action }),
+    label,
+    style,
+  });
+  return {
+    type: ComponentType.ActionRow,
+    components: [
+      ...(yes === undefined ? [] : [button('yes', yes, ButtonStyle.Primary)]),
+      button('no', cancel, ButtonStyle.Secondary),
+    ],
+  };
+}
+
+/**
+ * Goes on with a battle decided: a Power Spot read in another region than the one `/max` was
+ * used in is confirmed first, as `/raid` confirms a gym (one typed is the member's own word);
+ * otherwise it is reported.
+ */
+async function goOn(
+  interaction: Answerable,
+  ctx: AppContext,
+  shot: PendingShot,
+  battle: ScreenshotMax,
+): Promise<void> {
+  const request = maxShotRequest(
+    ctx,
+    shot.guildRow,
+    battle,
+    shot.report.boss?.name ?? '',
+    shot.regionChannelId,
+    shot.screenshotId,
+    shot.typed,
+  );
+  if (!request) throw new UserError(SPOT_GONE);
+  const here = shot.regionChannelId;
+  const { region, any } = ctx.partyService.regionForSpot(request.spot, here);
+  const target = region ?? any;
+  if (
+    !shot.typed.spot &&
+    request.spot.kind === 'powerspot' &&
+    target &&
+    target.channelId !== here
+  ) {
+    const token = pending.put(interaction.user.id, { ...shot, request });
+    const name = plain(maxSpotName(request.spot));
+    const content = ctx.wayspots.regionsOf(request.spot.id).includes(here)
+      ? `${name} will be posted in <#${target.channelId}> (this region has no raid forum). Report it there?`
+      : `${name} is in <#${target.channelId}>, not in this region. Report the max battle there?`;
+    await interaction.editReply({
+      content,
+      components: [buttons(token, 'Cancel', 'Report it there')],
+    });
+    return;
+  }
+  await finish(interaction, ctx, shot, request);
+}
+
+/**
+ * Reports the battle (`reportMaxShot`) and tells the member what came of it, with what the
+ * screenshot left unsure and the button that shows the screenshot (R6: as `/raid` answers). No
+ * post made, or a battle there that ended twice while it waited, gives the use back.
+ */
+async function finish(
+  interaction: Answerable,
+  ctx: AppContext,
+  shot: PendingShot,
+  request: MaxShotRequest,
+): Promise<void> {
+  const member = { id: interaction.user.id, ...memberInfo(interaction) };
+  const answer = await reportMaxShot(ctx, request, {
+    member,
+    serverId: guildIdOf(interaction),
+    guildRow: shot.guildRow,
+    staff: isStaff(interaction, ctx),
+  });
+  const doubts = doubtsOf(shot.report);
+  const unsure =
+    doubts.length > 0
+      ? [
+          '',
+          'From the screenshot I was not sure of this:',
+          ...maxDoubtLines(doubts, shot.report.clock),
+        ]
+      : [];
+  const said = truncate([maxShotWords(ctx, answer, request), ...unsure].join('\n'), MESSAGE);
+  const id = request.screenshot.id;
+  await interaction.editReply({ content: said, components: id === null ? [] : [showRow(id)] });
+  if (maxShotGivesBack(answer)) throw new UserError(said, { givesBack: true, said: true });
+}
+
+/**
+ * What was typed, reported as `/max` reports it, where the screenshot could not be read at all
+ * (busy, unavailable): with a note that says so, without the ending-soon question.
+ */
+async function reportTyped(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  typed: { boss: ReadMaxBoss; spot: MaxSpot; end?: number },
+  now: number,
+): Promise<void> {
+  const regionChannelId = regionChannelOf(interaction, ctx) ?? '';
+  const ask = {
+    boss: typed.boss,
+    spot: typed.spot,
+    end: typed.end ?? reportedEnd(ctx, typed.boss.tier, null, now),
+    regionChannelId,
+  };
+  const guild = await ctx.guilds.idFor(guildIdOf(interaction));
+  const joins = guild === undefined ? undefined : ctx.parties.maxAt(guild, typed.spot, now);
+  const memberAccess = (forumId: string, memberId: string) =>
+    ctx.partyService.memberAccess(forumId, memberId);
+  if (
+    await maxBarred(
+      { partyService: ctx.partyService, memberAccess },
+      { ...ask, joins },
+      interaction.user.id,
+    )
+  ) {
+    throw new UserError(MAX_BARRED);
+  }
+  const member = { id: interaction.user.id, ...memberInfo(interaction) };
+  const { outcome, autoStatus } = await reportMaxAs(ctx, member, guildIdOf(interaction), ask, {
+    mayJoin: async (forumId) => (await memberAccess(forumId, member.id)) !== 'barred',
+    staff: isStaff(interaction, ctx),
+  });
+  const content = `${TYPED_ONLY}\n${maxReportWords(ctx, outcome, ask, autoStatus)}`;
+  await interaction.editReply({ content });
+  if (outcome.kind === 'no-post' || outcome.kind === 'ended' || outcome.kind === 'pin-blocked') {
+    throw new UserError(content, { givesBack: true, said: true });
+  }
+}
+
+/** The use `/max` counted, for a waiting report's controls (`carriesOn`). */
+export function shotCarriesOn(
+  userId: string,
+  token: string,
+): (ControlThrottle & { countedAt: number }) | undefined {
+  const waiting = pending.peek(token, userId);
+  return typeof waiting === 'object'
+    ? { ...MAX_THROTTLE, as: MAX_COMMAND, countedAt: waiting.value.countedAt }
+    : undefined;
+}
+
+/** The waiting report of a control; answers the member when there is none. */
+async function claimed(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  token: string,
+): Promise<PendingShot | undefined> {
+  const taken = pending.take(token, interaction.user.id);
+  if (taken === 'not-yours') throw new UserError(NOT_YOURS);
+  if (taken === 'expired') {
+    await interaction.update({ content: EXPIRED, components: [] });
+    return undefined;
+  }
+  return taken.value;
+}
+
+/**
+ * Runs what follows `deferUpdate`: when it fails, the used-up controls are taken from the
+ * message (best effort) before the error goes on; a refusal said already stays.
+ */
+async function afterDeferral(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  work: () => Promise<void>,
+): Promise<void> {
+  try {
+    await work();
+  } catch (err) {
+    if (err instanceof UserError && err.said) throw err;
+    await interaction
+      .editReply({ content: 'Nothing was reported.', components: [] })
+      .catch(() => undefined);
+    throw err;
+  }
+}
+
+/** The Power Spot chosen in `/max screenshot:`'s menu (`max:<token>:spot`), kept in the record. */
+export async function chooseMaxShotSpot(
+  interaction: StringSelectMenuInteraction,
+  token: string,
+  ctx: AppContext,
+): Promise<void> {
+  const shot = await claimed(interaction, token);
+  if (!shot) return;
+  const spot = shot.spots.find((one) => one.id === interaction.values[0]);
+  if (!spot) throw new UserError(SPOT_GONE);
+  await interaction.deferUpdate();
+  if (shot.screenshotId !== undefined) await ctx.screenshots.pickedSpot(shot.screenshotId, spot.id);
+  const decision = decideMax(withSpot(shot.report, spot), { now: shot.uploadedAt });
+  await afterDeferral(interaction, async () => {
+    if (decision.kind === 'report') {
+      await goOn(interaction, ctx, shot, decision.battle);
+      return;
+    }
+    // Chosen, the spot leaves only what the screenshot could not tell (the tier) to refuse.
+    const words =
+      decision.kind === 'ask' && decision.about === 'spot'
+        ? SPOT_GONE
+        : refusal(interaction, ctx, decision);
+    await interaction.editReply({ content: words, components: [] });
+  });
+}
+
+/** "Report it there" or "Cancel" of a waiting report (`max:<token>:yes` / `:no`). */
+export async function confirmMaxShot(
+  interaction: ButtonInteraction,
+  token: string,
+  action: string,
+  ctx: AppContext,
+): Promise<void> {
+  const shot = await claimed(interaction, token);
+  if (!shot) return;
+  if (action !== 'yes' || !shot.request) {
+    await interaction.update({ content: 'Nothing was reported.', components: [] });
+    return;
+  }
+  const { request } = shot;
+  await interaction.deferUpdate();
+  await afterDeferral(interaction, () => finish(interaction, ctx, shot, request));
+}
diff --git a/src/commands/max/max-shot.ts b/src/commands/max/max-shot.ts
index c357d713e2daaed8d341d4b83ad8b8e2600eafdf..859a066cae5ef825f994c8905e50b977016e4cf1 100644
--- a/src/commands/max/max-shot.ts
+++ b/src/commands/max/max-shot.ts
@@ -198,8 +198,9 @@ export function maxShotRequest(
  * of is refused first, as `/max` refuses it (`maxBarred`: the forum a new battle would go to and
  * that of the battle there; `unknown-access`, logged, while Discord cannot say); then
  * `reportMaxShotAs`. A screenshot its battle's post now shows (a new battle, a boss changed, an
- * end moved) is kept while the battle lasts (`ScreenshotService.inUse`). No pin is ever made, so
- * `staff` matters to nothing but `reportMaxAs`'s own check.
+ * end moved) is kept while the battle lasts (`ScreenshotService.inUse`). A screenshot's own
+ * Power Spot is never a pin; a pin is only typed beside it (`/max screenshot: spot:`), and then
+ * `staff` lets a member of staff with a block report there as `/max` does (`reportMaxAs`).
  */
 export async function reportMaxShot(
   ctx: MaxShotContext,
@@ -253,14 +254,15 @@ function showsScreenshot(result: MaxShotResult): boolean {
 }
 
 /**
- * Whether a screenshot's battle was refused for none of the member's doing: its post could not be
- * made, or the battle there ended twice while it waited (as `/max` gives those back).
+ * Whether a screenshot's battle gives the use back, as `/max` gives these back: its post could not
+ * be made, or the battle there ended twice while it waited (none of the member's doing), or a
+ * member blocked from meetups typed a pin (`pin-blocked`, which `/max`'s guard refuses uncounted;
+ * review r4 B3).
  */
 export function maxShotGivesBack(answer: MaxShotAnswer): boolean {
-  return (
-    answer.kind === 'reported' &&
-    (answer.result.outcome.kind === 'no-post' || answer.result.outcome.kind === 'ended')
-  );
+  if (answer.kind !== 'reported') return false;
+  const { kind } = answer.result.outcome;
+  return kind === 'no-post' || kind === 'ended' || kind === 'pin-blocked';
 }
 
 /** Whether the member is in the screenshot's battle now: reported, joined, or its boss changed. */
diff --git a/src/commands/max/max.ts b/src/commands/max/max.ts
index 22d07242995032df60d585b9de6a29adb23b23b9..185109dfcec313a1b79fae3d908971fac96be789 100644
--- a/src/commands/max/max.ts
+++ b/src/commands/max/max.ts
@@ -53,6 +53,14 @@ import {
   type MaxAccess,
 } from './max-report.js';
 import { nearChoices, regionSpotChoices } from '../place-option.js';
+import {
+  chooseMaxShotSpot,
+  confirmMaxShot,
+  reportMaxFromScreenshot,
+  requireReadableEnd,
+  screenshotOf,
+  shotCarriesOn,
+} from './max-screenshot.js';
 import { MAX_CHOICES } from '../choices.js';
 
 /*
@@ -128,6 +136,19 @@ async function refuseBlockedAtPin(
  */
 const requireMaxReport: Guard = async (interaction, ctx) => {
   if (!interaction.isChatInputCommand()) return;
+  // With a screenshot, what can be known is known only once it is read (review R1).
+  if (screenshotOf(interaction, ctx)) {
+    requireReadableEnd(interaction, ctx);
+    return;
+  }
+  const missing = ['boss', 'spot'].filter(
+    (name) => (interaction.options.getString(name)?.trim() ?? '') === '',
+  );
+  if (missing.length > 0) {
+    throw new UserError(
+      `Give the ${missing.join(' and the ')} of the max battle (or attach a screenshot of it).`,
+    );
+  }
   const now = Date.now();
   const regionChannelId = regionChannelOf(interaction, ctx);
   if (regionChannelId === undefined) return;
@@ -187,23 +208,24 @@ async function report(
   }
 }
 
-export const max: SimpleCommand = {
-  data: new SlashCommandBuilder()
+/** The definition: with the option `screenshot` where screenshots are read (plan 8X-S). */
+function maxData(screenshots: boolean) {
+  const data = new SlashCommandBuilder()
     .setName('max')
-    .setDescription('Report a max battle at a power spot')
+    .setDescription('Report a max battle at a Power Spot')
     .addStringOption((option) =>
       option
         .setName('boss')
         .setDescription('The boss: pick from the list, or type a Pokémon in full')
-        .setRequired(true)
+        .setRequired(!screenshots)
         .setMaxLength(100)
         .setAutocomplete(true),
     )
     .addStringOption((option) =>
       option
         .setName('spot')
-        .setDescription('The power spot: pick from the list, or paste a maps link or coordinates')
-        .setRequired(true)
+        .setDescription('The Power Spot: pick from the list, or paste a maps link or coordinates')
+        .setRequired(!screenshots)
         .setMaxLength(1_500)
         .setAutocomplete(true),
     )
@@ -218,75 +240,123 @@ export const max: SimpleCommand = {
         .setName('end')
         .setDescription('When it ends, if not the end of its rotation: 20 (minutes) or 2:30pm')
         .setMaxLength(40),
-    ),
-  help: {
-    category: 'raid-crud',
-    details:
-      "Creates a post for a max battle in the raid forum of the spot's region. Pick the boss and " +
-      'the power spot from the lists that appear while you type (the bosses of an event that is ' +
-      'on come first); a Pokémon that can Dynamax may be typed in full, with `tier` when it is on ' +
-      'no list. A spot Pine does not know can be given as a maps link or coordinates: it becomes ' +
-      'an unlisted power spot. A battle lasts until the end of its rotation (the next half hour ' +
-      'in a short event, the next hour all day and for Gigantamax), otherwise until the last ' +
-      'battle of the day, or the start of a max event later that day; `end` sets another. If the spot already has a battle of that boss, you ' +
-      'are shown its post instead; one ending within five minutes is asked about first.',
-    examples: [
-      '/max boss:machamp spot:Gazebo',
-      '/max boss:gigantamax machamp spot:40.4406, -79.9959 end:20',
-    ],
-  },
-  guards: [requireRegion, requireMaxReport],
-  defer: (interaction) => (asked.get(interaction)?.asks ? undefined : 'ephemeral'),
-  throttle: MAX_THROTTLE,
-
-  async execute(interaction, ctx) {
-    const ask = asked.get(interaction);
-    if (!ask) throw new UserError('Use `/max` again.');
-    if (!ask.asks) {
-      await report(interaction, ctx, ask);
-      return;
-    }
-    const now = Date.now();
-    // Nothing is read for the dialog, but the guard's reads must have left Discord's three
-    // seconds for it (the slow-read rule): past them no dialog opens.
-    await readInTime(ctx.log, interaction, () => Promise.resolve());
-    const next = nextRotationEnd(ask.end, maxEndInput(ctx, ask.boss.tier, now));
-    const token = pending.put(interaction.user.id, {
-      ...ask,
-      countedAt: whenCounted(interaction) ?? now,
-      ...(next === undefined ? {} : { next }),
-    });
-    const { settings } = ctx.config;
-    await interaction.showModal(
-      endingSoonDialog({
-        customId: encodeCustomId({ kind: MAX_KIND, id: token, action: 'report', args: [] }),
-        end: ask.end,
-        next,
-        now,
-        zone: settings.timezone,
-      }),
     );
-  },
+  if (screenshots) {
+    data.addAttachmentOption((option) =>
+      option
+        .setName('screenshot')
+        .setDescription(
+          'A screenshot of the max battle screen; I read it. Others can see it from the post',
+        ),
+    );
+  }
+  return data;
+}
 
-  async autocomplete(interaction, ctx) {
-    const focused = interaction.options.getFocused(true);
-    if (focused.name === 'boss') {
-      await interaction.respond(maxBossOptions(ctx, focused.value, Date.now()));
-      return;
-    }
-    if (focused.name === 'spot' && focused.value.trim() === '') {
-      // Nothing typed: the region's power spots by name (plan 8X-F), as a max train's route.
-      await interaction.respond(
-        regionSpotChoices(ctx, regionChannelOf(interaction, ctx)).slice(0, MAX_CHOICES),
+const DETAILS =
+  "Creates a post for a max battle in the raid forum of the spot's region. Pick the boss and " +
+  'the Power Spot from the lists that appear while you type (the bosses of an event that is ' +
+  'on come first); a Pokémon that can Dynamax may be typed in full, with `tier` when it is on ' +
+  'no list. A spot Pine does not know can be given as a maps link or coordinates: it becomes ' +
+  'an unlisted power spot. A battle lasts until the end of its rotation (the next half hour ' +
+  'in a short event, the next hour all day and for Gigantamax), otherwise until the last ' +
+  'battle of the day, or the start of a max event later that day; `end` sets another. If the ' +
+  'spot already has a battle of that boss, you are shown its post instead; one ending within ' +
+  'five minutes is asked about first.';
+
+const SCREENSHOT_DETAILS =
+  ' Or attach a screenshot of the max battle instead: I read the Power Spot, the boss, its ' +
+  'tier and the time left from it, and ask only when I am not sure which Power Spot it is. ' +
+  'What you type beside it counts instead of what I read. A screenshot newer than the boss of ' +
+  'the battle already at the spot changes its boss. The screenshot is kept for a while: ' +
+  'others can see it from the post of the battle, and it may be used to improve the reader.';
+
+function maxCommand(screenshots: boolean): SimpleCommand {
+  return {
+    data: maxData(screenshots),
+    help: {
+      category: 'raid-crud',
+      details: screenshots ? DETAILS + SCREENSHOT_DETAILS : DETAILS,
+      examples: [
+        '/max boss:machamp spot:Gazebo',
+        '/max boss:gigantamax machamp spot:40.4406, -79.9959 end:20',
+        ...(screenshots ? ['/max screenshot:(a max battle screenshot)'] : []),
+      ],
+    },
+    guards: [requireRegion, requireMaxReport],
+    // The reading of a screenshot may wait in the queue: always deferred (review R1).
+    defer: (interaction, ctx) =>
+      screenshotOf(interaction, ctx) || !asked.get(interaction)?.asks ? 'ephemeral' : undefined,
+    throttle: MAX_THROTTLE,
+
+    async execute(interaction, ctx) {
+      const attachment = screenshotOf(interaction, ctx);
+      if (attachment) {
+        await reportMaxFromScreenshot(interaction, ctx, attachment);
+        return;
+      }
+      const ask = asked.get(interaction);
+      if (!ask) throw new UserError('Use `/max` again.');
+      if (!ask.asks) {
+        await report(interaction, ctx, ask);
+        return;
+      }
+      const now = Date.now();
+      // Nothing is read for the dialog, but the guard's reads must have left Discord's three
+      // seconds for it (the slow-read rule): past them no dialog opens.
+      await readInTime(ctx.log, interaction, () => Promise.resolve());
+      const next = nextRotationEnd(ask.end, maxEndInput(ctx, ask.boss.tier, now));
+      const token = pending.put(interaction.user.id, {
+        ...ask,
+        countedAt: whenCounted(interaction) ?? now,
+        ...(next === undefined ? {} : { next }),
+      });
+      const { settings } = ctx.config;
+      await interaction.showModal(
+        endingSoonDialog({
+          customId: encodeCustomId({ kind: MAX_KIND, id: token, action: 'report', args: [] }),
+          end: ask.end,
+          next,
+          now,
+          zone: settings.timezone,
+        }),
       );
-      return;
-    }
-    if (focused.name === 'spot' && !isPinText(focused.value)) {
-      await interaction.respond(await nearChoices(interaction, ctx, focused.value, ['powerspot']));
-      return;
-    }
-    await interaction.respond([]);
-  },
+    },
+
+    async autocomplete(interaction, ctx) {
+      const focused = interaction.options.getFocused(true);
+      if (focused.name === 'boss') {
+        await interaction.respond(maxBossOptions(ctx, focused.value, Date.now()));
+        return;
+      }
+      if (focused.name === 'spot' && focused.value.trim() === '') {
+        // Nothing typed: the region's power spots by name (plan 8X-F), as a max train's route.
+        await interaction.respond(
+          regionSpotChoices(ctx, regionChannelOf(interaction, ctx)).slice(0, MAX_CHOICES),
+        );
+        return;
+      }
+      if (focused.name === 'spot' && !isPinText(focused.value)) {
+        await interaction.respond(
+          await nearChoices(interaction, ctx, focused.value, ['powerspot']),
+        );
+        return;
+      }
+      await interaction.respond([]);
+    },
+  };
+}
+
+const withScreenshots = maxCommand(true);
+const withoutScreenshots = maxCommand(false);
+
+/**
+ * `/max`: as an installation that reads screenshots offers it (`ocr.enabled`), with the option
+ * `screenshot` and the boss and the spot optional; otherwise without it, both required.
+ */
+export const max: SimpleCommand = {
+  ...withScreenshots,
+  forConfig: (config) => (config.settings.ocr.enabled ? withScreenshots : withoutScreenshots),
 };
 
 /**
@@ -300,12 +370,27 @@ export const maxControls: ComponentHandler = {
   // A command's guards do not cover its controls: a Submit is of a server too (review B, B5).
   guards: [requireGuild],
   carriesOn: (interaction, id) => {
+    if (id.action !== 'report') return shotCarriesOn(interaction.user.id, id.id);
     const waiting = pending.peek(id.id, interaction.user.id);
     return typeof waiting === 'object' && waiting.value.countedAt !== undefined
       ? { ...MAX_THROTTLE, as: MAX_COMMAND, countedAt: waiting.value.countedAt }
       : undefined;
   },
 
+  /** The Power Spot menu of `/max screenshot:` (plan 8X-S, review R7). */
+  async select(interaction, id, ctx) {
+    if (id.action !== 'spot' || !interaction.isStringSelectMenu()) {
+      throw new UserError(STALE_COMPONENT);
+    }
+    await chooseMaxShotSpot(interaction, id.id, ctx);
+  },
+
+  /** "Report it there" and "Cancel" of `/max screenshot:`'s other region and menu. */
+  async button(interaction, id, ctx) {
+    if (id.action !== 'yes' && id.action !== 'no') throw new UserError(STALE_COMPONENT);
+    await confirmMaxShot(interaction, id.id, id.action, ctx);
+  },
+
   async modal(interaction, id, ctx) {
     if (id.action !== 'report') throw new UserError('That question has expired. Use `/max` again.');
     const taken = pending.take(id.id, interaction.user.id);
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index 85b6bb38f4393a162979d49bbc402be24a2ee345..eacb73e8d3ef459e1ba0393b7eb4362fcc5caa83 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -577,7 +577,8 @@ const SCREENSHOT_DETAILS =
   ' Or attach a screenshot of the raid instead: I read the gym, the time, the tier and the ' +
   'boss from it, and ask only when I am not sure which gym it is. What you type beside it ' +
   'counts instead of what I read. The screenshot is kept for a while: others can see it from ' +
-  'the post of the raid, and it may be used to improve the reader.';
+  'the post of the raid, and it may be used to improve the reader. A screenshot of a max ' +
+  'battle goes to `/max`.';
 
 function raidCommand(screenshots: boolean): SimpleCommand {
   return {
diff --git a/src/domain/ocr/max-decision.ts b/src/domain/ocr/max-decision.ts
index fbfdc01a36818e3221851dbf3ff813c8bfd3ba5d..b75072c4334b08ff77d3ea6065908827a9be17f9 100644
--- a/src/domain/ocr/max-decision.ts
+++ b/src/domain/ocr/max-decision.ts
@@ -116,3 +116,76 @@ export function withSpot(report: MaxScreenshotReport, spot: SpotTitle): MaxScree
     doubts: report.doubts.filter((doubt) => doubt !== 'no-spot' && doubt !== 'spot-unclear'),
   };
 }
+
+/**
+ * What a member typed beside a max battle's screenshot (`/max screenshot:`, plan 8X-S), which
+ * stands in the place of what was read, as a raid's `withTyped`: the Power Spot (`spot`; a pin
+ * typed stands as a title of its own), the boss with its tier (`name` as the member's answer
+ * shows it), the tier alone for a boss read that is on no list, the end.
+ */
+export interface MaxTyped {
+  spot?: SpotTitle;
+  boss?: { ref: RaidBossRef; name: string; tier: MaxTier };
+  /**
+   * `tier:` typed without a boss (review r4 B1): the tier of the boss read when that is on no
+   * list and the tier is of the screen's kind; a listed boss keeps the list's, as `/max` does.
+   */
+  tier?: MaxTier;
+  end?: number;
+}
+
+/** The doubts a typed boss settles. */
+const BOSS_DOUBTS: readonly MaxDoubt[] = [
+  'no-boss',
+  'boss-unlisted',
+  'tier-unknown',
+  'heads-boss-conflict',
+  'heads-form-conflict',
+];
+
+/**
+ * The report with what the member typed in the place of what was read (decide again with
+ * `decideMax`): the spot as `withSpot` puts it in; the boss and its tier as a listed boss's; a
+ * tier alone as the tier of an unlisted boss read (`tier-unknown` settled); an
+ * end typed instead of the countdown, which is then no clean read of a rotation's end
+ * (`rotationEnd` false: a battle there keeps its end).
+ */
+export function withMaxTyped(report: MaxScreenshotReport, typed: MaxTyped): MaxScreenshotReport {
+  let out = typed.spot ? withSpot(report, typed.spot) : report;
+  const { tier } = typed;
+  if (
+    !typed.boss &&
+    tier !== undefined &&
+    out.boss !== null &&
+    !out.boss.listed &&
+    (tier === 'G') === (out.form === 'gigantamax' || out.form === 'eternamax')
+  ) {
+    out = {
+      ...out,
+      tier,
+      // What the member typed counts as the list does for a typed boss.
+      tierFrom: 'list',
+      doubts: out.doubts.filter((doubt) => doubt !== 'tier-unknown'),
+    };
+  }
+  if (typed.boss) {
+    out = {
+      ...out,
+      boss: { ref: typed.boss.ref, name: typed.boss.name, listed: true },
+      tier: typed.boss.tier,
+      tierFrom: 'list',
+      doubts: out.doubts.filter((doubt) => !BOSS_DOUBTS.includes(doubt)),
+    };
+  }
+  if (typed.end !== undefined) {
+    out = {
+      ...out,
+      end: typed.end,
+      endFrom: 'typed',
+      countdownEnd: null,
+      rotationEnd: false,
+      doubts: out.doubts.filter((doubt) => doubt !== 'no-time'),
+    };
+  }
+  return out;
+}
diff --git a/src/domain/ocr/max-report.ts b/src/domain/ocr/max-report.ts
index d6ac1777f1ef58444e95cd25d7516b2e6ac53519..63b72d388ea9962bca17082094f1a4d858b4bbb5 100644
--- a/src/domain/ocr/max-report.ts
+++ b/src/domain/ocr/max-report.ts
@@ -110,7 +110,8 @@ export interface MaxScreenshotReport {
    * over by the moment it was taken.
    */
   end: number | null;
-  endFrom: 'countdown' | 'default' | null;
+  /** `typed`: the member's `end:` (`withMaxTyped`). */
+  endFrom: 'countdown' | 'default' | 'typed' | null;
   /**
    * The countdown ends at a rotation: before the last battle time of the day it was taken (an
    * event's, say 15:00), not the all-day kind that runs to about 05:00 the next day.
diff --git a/src/domain/ocr/screenshot-record.ts b/src/domain/ocr/screenshot-record.ts
index 58a00f1187396c361ce3c9f4cdfa2f17caecf95b..f4578dc9002bec03ccfc8ec7d957e093bcafe468 100644
--- a/src/domain/ocr/screenshot-record.ts
+++ b/src/domain/ocr/screenshot-record.ts
@@ -39,7 +39,7 @@ export interface StoredMaxBoss {
 }
 
 /** How a screenshot came to be read. */
-export const SCREENSHOT_USES = ['read-screenshot', 'raid', 'mention', 'passive'] as const;
+export const SCREENSHOT_USES = ['read-screenshot', 'raid', 'max', 'mention', 'passive'] as const;
 export type ScreenshotUse = (typeof SCREENSHOT_USES)[number];
 
 /** What was decided (`decide`): the kinds of `ScreenshotDecision`, with the doubts or reason. */
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index e4589aa88348c91fde209a4e10fbc233d82be11f..ec5027a7a107c5dbc4579cd15ba6ea40009a611b 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -6,7 +6,7 @@ import {
   type StoredMaxReport,
   type StoredReport,
 } from '../domain/ocr/screenshot-record.js';
-import { maxBossTitle } from '../domain/pogo/max-tier.js';
+import { maxBossTitle, maxTierLabel } from '../domain/pogo/max-tier.js';
 import type { ReportDoubt } from '../domain/ocr/screenshot-report.js';
 import { raidTierLabel } from '../domain/pogo/raid-tier.js';
 import { cutMarkdown, plain, timestamp, truncate } from './text.js';
@@ -277,16 +277,88 @@ export const STAFF_TOLD = 'I have let the staff know Pine may be missing this Po
 
 /**
  * What a max battle's screenshot shows, in one line, without its Power Spot (which is asked):
- * `Dynamax Machop (2★), ending at 14:28`; a boss not told is `A max battle`.
+ * `Dynamax Machop (2★), ending at 14:28`; a boss not told is `A max battle`; `label` names a boss
+ * the member typed in its place.
  */
-export function shortMaxReading(report: StoredMaxReport): string {
+export function shortMaxReading(report: StoredMaxReport, label?: string): string {
   const what =
-    report.boss && report.tier
+    label ??
+    (report.boss && report.tier
       ? plain(maxBossTitle(report.boss.name, report.tier))
-      : 'A max battle';
+      : 'A max battle');
   return report.end === null ? what : `${what}, ending at ${timestamp(report.end)}`;
 }
 
+/** A max report's doubts in words, one short sentence each (those of the moment as a raid's). */
+const MAX_DOUBT_WORDS: Readonly<Record<string, string>> = {
+  'not-a-max-screen': 'This does not look like the screen of a max battle.',
+  'no-spot': 'I found no Power Spot of this server with that name.',
+  'spot-unclear': 'The Power Spot’s name fits more than one Power Spot, or only nearly.',
+  'spot-read-poorly': 'The Power Spot’s name was hard to read.',
+  'no-boss': 'I could not tell the boss.',
+  'boss-unlisted': 'The boss is on no list of current max bosses.',
+  'tier-unknown': 'I could not tell the tier.',
+  'heads-boss-conflict': 'The boss I found is of another tier than the heads say.',
+  'heads-form-conflict': 'The heads do not fit the kind of battle the screen says.',
+  'no-time': 'I could not read the countdown, so the battle ends with its rotation.',
+};
+
+/** A max report's doubt in words (`doubtWords` for the moment's). */
+export function maxDoubtWords(doubt: string, clock: StoredReport['clock'] = null): string {
+  return MAX_DOUBT_WORDS[doubt] ?? doubtWords(doubt, clock);
+}
+
+/** A max report's doubts as a list, or nothing when there are none. */
+export function maxDoubtLines(
+  doubts: readonly string[],
+  clock: StoredReport['clock'] = null,
+): string[] {
+  return doubts.map((doubt) => `- ${maxDoubtWords(doubt, clock)}`);
+}
+
+const FORM_WORDS = { dynamax: 'Dynamax', gigantamax: 'Gigantamax', eternamax: 'Eternamax' };
+
+/**
+ * A max battle's screenshot's every element, raw and as understood (plan 8X-S, as `readingLines`
+ * for a raid): the Power Spot as read and as matched, the time, the heads and the form with the
+ * tier, the boss; and what was not sure (`doubts: false` leaves that out).
+ */
+export function maxReadingLines(
+  report: StoredMaxReport,
+  options: { doubts?: boolean } = {},
+): string[] {
+  const { match } = report.spot;
+  const spot =
+    match.kind === 'clear'
+      ? `**${plain(match.spot.title)}**`
+      : match.kind === 'candidates' && match.spots[0]
+        ? `**${plain(match.spots[0].title)}** (not sure)`
+        : 'no Power Spot';
+  const clock = clockText(report.clock);
+  const countdown = countdownText(report.countdown);
+  const ends =
+    report.end === null
+      ? 'no end: max battles were over'
+      : `ends at ${timestamp(report.end)}${report.endFrom === 'default' ? ' (the end of its rotation)' : ''}`;
+  const guessed = report.doubts.includes('time-guessed') ? ' (guessed from the upload)' : '';
+  const heads =
+    report.heads === null ? 'no heads' : `${report.heads} head${report.heads === 1 ? '' : 's'}`;
+  const form = report.form === null ? 'no max battle' : FORM_WORDS[report.form];
+  const tier = report.tier === null ? 'no tier' : `**${maxTierLabel(report.tier)}**`;
+  const boss = report.boss ? `**${plain(report.boss.name)}**` : 'no boss';
+  const lines = [
+    `**Power Spot:** read ${quoted(report.spot.read)} → ${spot}`,
+    `**Time:** clock ${clock === null ? 'not read' : `\`${clock}\``}, countdown ${
+      countdown === null ? 'not read' : `\`${countdown}\``
+    } → ${ends}${guessed}`,
+    `**Tier:** ${heads}, ${form} → ${tier}`,
+    `**Boss:** name read ${quoted(report.speciesRead)} → ${boss}`,
+  ];
+  if (report.doubts.length > 0 && options.doubts !== false)
+    lines.push('', 'Not sure:', ...maxDoubtLines(report.doubts, report.clock));
+  return lines;
+}
+
 /** Why a screenshot was not made into a raid (`refuse`'s reason). */
 export function refusalWords(reason: string): string {
   switch (reason) {
diff --git a/src/services/screenshot-service.ts b/src/services/screenshot-service.ts
index a55be69aced4df763b34dc80c515586cb3137b47..253553fda4761c2087dee399025bfe2df88e196e 100644
--- a/src/services/screenshot-service.ts
+++ b/src/services/screenshot-service.ts
@@ -366,8 +366,18 @@ function storedDecision(
     : { kind: 'refuse', reason: decision.reason };
 }
 
-/** What a member is told when a screenshot could not be read at all. */
-export function unreadWords(outcome: Exclude<ScreenshotOutcome, { kind: 'read' }>): string {
+/**
+ * What a member is told when a screenshot could not be read at all; `what` the command that
+ * reports without one (`/max` for a max battle's screenshot, review R14).
+ */
+export function unreadWords(
+  outcome: Exclude<ScreenshotOutcome, { kind: 'read' }>,
+  what: 'raid' | 'max' = 'raid',
+): string {
+  const instead =
+    what === 'max'
+      ? 'report the max battle with `/max` and its options'
+      : 'report the raid with `/raid` and its options';
   switch (outcome.kind) {
     case 'too-large':
       return 'That file is too large to be a screenshot.';
@@ -378,8 +388,8 @@ export function unreadWords(outcome: Exclude<ScreenshotOutcome, { kind: 'read' }
     case 'busy':
       return 'Too many screenshots are waiting to be read just now. Try again shortly.';
     case 'unavailable':
-      return 'I cannot read screenshots at the moment. Report the raid with `/raid` and its options.';
+      return `I cannot read screenshots at the moment. ${instead[0]?.toUpperCase() ?? ''}${instead.slice(1)}.`;
     case 'failed':
-      return 'Reading that screenshot went wrong. Try again, or report the raid with `/raid` and its options.';
+      return `Reading that screenshot went wrong. Try again, or ${instead}.`;
   }
 }
````

### Task 8: 8X-S 8: /read-screenshot, feedback and ocr:review of max screenshots; docs; staging

Prototype commit: `e15c0d69a4789652d1553ea5d4ba25bf497585d2`

- /read-screenshot shows a max battle's reading (maxScreenshotMessage:
  maxReadingLines, the Power Spot as read and as matched, the clock and
  countdown with the end, the heads and form with the tier, the boss; the
  max doubts in small print) and what a mention or /max would do
  (maxDecisionWords: report, ask which Power Spot, the tier not told, or the
  refusal in maxRefusalWords). Nobody is told of a Power Spot only shown.
- "Screenshot feedback" (showScreenshot) renders a record with max so.
- Feedback (review R6): "Something is wrong..." of a max screenshot carries
  the argument max (shot:<id>:wrong:max, its form shot:<id>:form:max) and
  offers Power Spot, Time, Tier, Boss (MAX_FEEDBACK_ELEMENTS; 'spot' in
  FEEDBACK_ELEMENTS with its label); a button without it, every one made
  before, is a raid's; a Submit keeps only its kind's elements. The
  refusals of /raid and /max that read a max screen carry the max row.
- ocr:review counts max records apart (reviewSummary's max: by use,
  decision, the max report's own doubts, each element said wrong by where,
  maxWrongAt); their corrections are listed with the raids'.
- Docs: screenshots.md (the max path end to end), the max battle design's
  pointer and its corrected timer; the staging checklist
  2026-10-23-phase-8xs-staging.md (Matt's screenshots by file name only).

**Files:**

```
 docs/architecture/screenshots.md                        |   7 +--
 docs/superpowers/plans/2026-10-23-phase-8xs-staging.md  |  78 ++++++++++++++++++++++++++++++++++
 docs/superpowers/specs/2026-10-20-max-battles-design.md |   4 +-
 scripts/ocr/review.ts                                   |  25 ++++++++++-
 src/commands/max/max-screenshot.test.ts                 |   2 +
 src/commands/max/max-screenshot.ts                      |   7 ++-
 src/commands/raids/raid-screenshot.test.ts              |   1 +
 src/commands/raids/raid.ts                              |   2 +-
 src/commands/screenshots/feedback.ts                    | 120 ++++++++++++++++++++++++++++++++++++++++-----------
 src/commands/screenshots/read-screenshot.max.test.ts    | 130 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/screenshots/read-screenshot.ts             |  46 ++++++++++++++------
 src/domain/ocr/review.test.ts                           |  84 +++++++++++++++++++++++++++++++++++-
 src/domain/ocr/review.ts                                | 114 +++++++++++++++++++++++++++++++++++++++++++++++--
 src/domain/ocr/screenshot-record.ts                     |  11 ++++-
 src/render/screenshot-reading.ts                        |  49 +++++++++++++++------
 15 files changed, 615 insertions(+), 65 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/max-screenshot.test.ts src/commands/raids/raid-screenshot.test.ts src/commands/screenshots/read-screenshot.max.test.ts src/domain/ocr/review.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e15c0d69a4789652d1553ea5d4ba25bf497585d2 -- docs/architecture/screenshots.md docs/superpowers/plans/2026-10-23-phase-8xs-staging.md docs/superpowers/specs/2026-10-20-max-battles-design.md scripts/ocr/review.ts src/commands/max/max-screenshot.test.ts src/commands/max/max-screenshot.ts src/commands/raids/raid-screenshot.test.ts src/commands/raids/raid.ts src/commands/screenshots/feedback.ts src/commands/screenshots/read-screenshot.max.test.ts src/commands/screenshots/read-screenshot.ts src/domain/ocr/review.test.ts src/domain/ocr/review.ts src/domain/ocr/screenshot-record.ts src/render/screenshot-reading.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 8: /read-screenshot, feedback and ocr:review of max screenshots; docs; staging`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index c9f726cc82267499e1547a9f3f01e0dca8ade91f..3e0b221ffe9e0282a68f57ee07cc6b0b3a53352e 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -1,6 +1,6 @@
 # Screenshots (OCR)
 
-Reading raid screenshots: the models in a child process of low priority, the pure reading of the raid screen, the report and the decision of what to do with it, the three ways members report from a screenshot, the store and review folder that feed the improvement cycle, and the answers of `/read-screenshot` and "Screenshot feedback". Read before changing the reader, the screenshot flows or what is kept.
+Reading raid screenshots: the models in a child process of low priority, the pure reading of the raid screen, the report and the decision of what to do with it, the ways members report a raid or a max battle from a screenshot, the store and review folder that feed the improvement cycle, and the answers of `/read-screenshot` and "Screenshot feedback". Read before changing the reader, the screenshot flows or what is kept.
 
 ## The reader
 
@@ -14,7 +14,7 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 - Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
 - A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, a Pokémon search of what can Dynamax or Gigantamax (of every Pokémon on an Eternamax screen, `anyPokemon`: the game data lists Eternatus for no max battle) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon the game lets battle so with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `capped`: the end is the day's last battle time, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old), with no ending-soon question; a default end (no countdown) passed by the upload is `over-for-today` too. `withSpot(report, spot)` puts in the spot a member chose.
-- `ScreenshotService.read` tells the kind of screen by the reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search restricted to what can Dynamax or Gigantamax (`ctx.pokemon.find` with a filter; every Pokémon for `anyPokemon`), the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:` refuses a max screen, "That’s a max battle: use `/max screenshot:`, or post it with a mention." (`MAX_SCREEN_FOR_RAID`), also beside a typed boss and gym (the wrong picture: no `typedOnly`); the mention and passive reading take either kind ("On Discord"); `/read-screenshot` refuses a max screen as no raid screen until plan 8X-S's task 7. Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
+- `ScreenshotService.read` tells the kind of screen by the reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search restricted to what can Dynamax or Gigantamax (`ctx.pokemon.find` with a filter; every Pokémon for `anyPokemon`), the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:` refuses a max screen, "That is a max battle: use `/max screenshot:`, or post it with a mention." (`MAX_SCREEN_FOR_RAID`), also beside a typed boss and gym (the wrong picture: no `typedOnly`); the mention and passive reading take either kind ("On Discord"); `/read-screenshot` shows a max reading (below). Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
 
 ## Keeping screenshots
 
@@ -23,5 +23,6 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 ## On Discord
 
 - `/max screenshot:` (plan 8X-S; `src/commands/max/max-screenshot.ts`; review R1, R6, R7): `/max` is `forConfig` on `ocr.enabled` as `/raid` (the attachment option last, `boss:` and `spot:` optional with it, both required without it); without a screenshot a guard refuses a missing boss or spot ("Give the boss and the spot of the max battle (or attach a screenshot of it)."), with one it reads nothing before the screenshot but an `end:` that is no time (refused at once); always deferred privately with a screenshot. What was typed is read first (`boss:`, `spot:` by `readSpot`, a pin too, `end:`) and stands in the place of what was read (`withMaxTyped` in `max-decision.ts`: the spot as `withSpot`, the boss as a listed one, the end instead of the countdown, then no clean read of a rotation's end); a typed boss on no list without `tier:` takes the screen's tier (its heads, or Gigantamax by its form), else `WHICH_TIER`; `tier:` typed without `boss:` is the tier of a boss read that is on no list, when it is of the screen's kind (`MaxTyped.tier`, settling `tier-unknown`; a listed boss keeps the list's, review r4 B1). A screenshot that cannot be read at all, beside a typed boss and spot, reports those as `/max` does with "I could not read the screenshot, so I used what you typed." (no ending-soon question); otherwise `unreadWords(outcome, 'max')` (naming `/max`, review R14). A raid's screen is refused, also beside typed values: "That is a raid: use `/raid screenshot:`, or post it with a mention." (`RAID_SCREEN_FOR_MAX`). A Power Spot not clear is asked with a menu (`max:<token>:spot`, the region's first, another region's named; `maxControls.select`, the record's `pickedSpot`), a clear one of another region read (not typed) confirmed as `/raid` confirms a gym ("<spot> is in <#region>, not in this region. Report the max battle there?", `max:<token>:yes` / `:no`); both wait in a store of their own that `maxControls.carriesOn` reads, so a battle refused for none of the member's doing (no post, the battle there ended twice) gives the use back from them too, and so does a pin typed beside the screenshot by a member blocked from meetups (`pin-blocked`, as `/max`'s guard refuses it uncounted; `maxShotGivesBack`, review r4 B3). A refusal says why (`maxRefusalWords`, a missing Power Spot read surely telling the moderators as a mention does), "Nothing was reported. This is what I read:" and `maxReadingLines`, with the feedback row; a report goes through `reportMaxShot` (the forum bar, the battle there joined, changed or refused) and answers with `maxShotWords`, what the screenshot left unsure (`maxDoubtLines`) and `showRow` (R6: as `/raid` answers); `/max`'s throttle counts it.
-- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I don’t know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely, the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I’ve let the staff know Pine may be missing this Power Spot."). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I couldn’t tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question; the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- Three ways to report a raid from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I do not know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely, the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I have let the staff know Pine may be missing this Power Spot."). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I could not tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question and Power Spot question (`spot`); the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- A max battle's screenshot (plan 8X-S, review R6) is shown by `/read-screenshot` and by its "Screenshot feedback" button (`showScreenshot`, for a record with `max`) through `maxScreenshotMessage`: `maxReadingLines` (the Power Spot as read and as matched, the clock and countdown with the end it gives, the heads and the form with the tier, the boss's name as read and the boss), its doubts in small print (`maxDoubtWords`), and what a mention or `/max` would do (`maxDecisionWords`: report, ask which Power Spot, the tier not told, or the refusal in `maxRefusalWords`; `/read-screenshot` tells no moderator of a Power Spot it only shows). Its "Something is wrong" carries the argument `max` (`shot:<id>:wrong:max`, its form `shot:<id>:form:max`) and offers a max battle's elements (`MAX_FEEDBACK_ELEMENTS`: Power Spot, time, tier, boss; `spot` is in `FEEDBACK_ELEMENTS`); a button without the argument, every one made before, is a raid's (`RAID_FEEDBACK_ELEMENTS`), and a form's Submit keeps only the elements its kind offers. The refusals of `/raid` and `/max` that read a max screen carry the max row (`feedbackRow(id, true)`). `npm run ocr:review` heads the rest "raid screenshots and other pictures" and counts max battles' records apart (`reviewSummary`'s `max`: by use, decision, the max report's own doubts, and each element said wrong by where, `maxWrongAt`); their members' corrections are listed with the raids'.
 - `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
diff --git a/docs/superpowers/plans/2026-10-23-phase-8xs-staging.md b/docs/superpowers/plans/2026-10-23-phase-8xs-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..c0b42a38169e7a48455cab943ed7d5b799d17ab8
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-23-phase-8xs-staging.md
@@ -0,0 +1,78 @@
+# Phase 8X-S staging checklist: max battle screenshots (draft)
+
+Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.
+
+- **Accounts:** Googer (owner, staff) and Tester (a member).
+- **Plan:** 8X-S; design `docs/superpowers/specs/2026-10-22-max-battle-screenshots-design.md`.
+- **Conventions:** `docs/architecture/screenshots.md` (the max path, "On Discord"), `moderation.md` (the missing Power Spot note), `parties-and-posts.md` (party state 15).
+- **Screenshots:** Matt's real max screens in `var/ocr/matt-2026-10-22-max` (`IMG_0147.png`, `IMG_0153.png`, `IMG_0157.png`) and `var/ocr/matt-2026-10-22b` (`1000038137.jpg`, `1000038139.jpg`, `1000038140.jpg`, `1000038141.jpg`, `1000038145.jpg`, `1000038146.jpg`, `image0-member.jpg`, an old Gigantamax screen without a countdown). They stay off the repository: copies for the steps go in the git-ignored `var/stage/8xs/`, and no step or note names their Power Spots.
+
+## Before
+
+1. **The commands changed** (`/max` gains `screenshot:`, `boss:` and `spot:` become optional where screenshots are read; `/read-screenshot`'s description). Matt deploys them with the stage settings:
+
+   ```
+   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
+   ```
+
+2. **Settings:** `ocr.enabled` on; `ocr.passive` on for the passive steps (with the Message Content intent on for the dev application); `settings.channels.moderation` named, and the moderators' channel there.
+3. **The Power Spots:** the test server holds Pittsburgh's Wayfarer import. For each screenshot, find the region its Power Spot lies in: `/max spot:` with the start of the name in a region channel, or `/find-region`. Note it in `var/stage/8xs/` only. A screenshot whose Power Spot lies in no region of the test server is kept for step 18 (the unknown spot): Pine knows only the Power Spots of its regions.
+4. **The moment of a screenshot.** The clock on the screens is a 12-hour clock: Pine takes it as the last such time before the upload, within an hour and a half, and otherwise guesses the moment from the upload (the post then says the time is a guess until `/end`). For a moment Pine is sure of, a copy is named as Android names screenshots, `Screenshot_<yyyymmdd>-<hhmmss>.jpg`, with the staging day's date and the clock on the screen in 24 hours (`1000038140.jpg`'s 3:24 becomes `Screenshot_<day>-152400.jpg`), and posted after that time. A name more than two minutes off the clock is contested and not sure.
+5. **The countdowns** of all these screens are the all-day kind (they run to about 05:00): every end is 21:00, capped. A countdown that ends at a rotation needs an event's screenshot (step 13).
+
+## /raid and /read-screenshot
+
+6. **`/raid screenshot:` with `IMG_0153.png`:** "That is a max battle: use `/max screenshot:`, or post it with a mention." Nothing reported. Again with `boss:` and `gym:` typed: the same refusal (the wrong picture).
+   - The answer's "Something is wrong…" offers Power Spot, Time, Tier, Boss.
+7. **`/read-screenshot` with `IMG_0153.png`:** the Power Spot as read and as matched, the clock and countdown with "ends at 21:00", "2 heads, Dynamax → Dynamax 2★", the boss; "With a screenshot like this, I report the max battle as above." Nothing reported.
+   - "Something is wrong…": Power Spot, Time, Tier, Boss; Submit with Power Spot ticked: "Thank you".
+   - `image0-member.jpg`: no countdown, the end "(the end of its rotation)", Gigantamax.
+
+## /max screenshot:
+
+8. **Read alone.** In the region channel of its Power Spot, `/max screenshot:` with the dated copy of `1000038140.jpg` (step 4), after its time.
+   - Reported: "Reported: Dynamax Sneasel (2★) at <spot>, until 21:00. Its post is …", with "Screenshot feedback".
+   - The post shows no guessed time. Screenshot feedback shows the max reading.
+   - The same in another region's channel (a new battle elsewhere ended first with `/delete`): "<spot> is in <#region>, not in this region. Report the max battle there?", Report it there reports it there.
+9. **Typed values win.** `/max screenshot:` with `1000038139.jpg` and `boss:` another listed boss, `end:20`: the battle has the typed boss and ends in 20 minutes, the screenshot on its post.
+10. **Unreadable with typed values.** `/max screenshot:` with an ordinary photo and `boss:` and `spot:` typed: "I could not read the screenshot, so I used what you typed." and the report. Without them: "This does not look like the screen of a max battle, so I made nothing of it."
+11. **A raid's screen:** `/max screenshot:` with a raid screenshot of `matt-2026-10-22b` (`1000038138.jpg`): "That is a raid: use `/raid screenshot:`, or post it with a mention.", also with `boss:` and `spot:` typed.
+12. **Without a screenshot:** `/max` with neither boss nor spot: "Give the boss and the spot of the max battle (or attach a screenshot of it)." The use is not counted. `/max` as before with both: unchanged, the ending-soon dialog included.
+
+## A battle already at the spot
+
+13. **The same boss.** Googer reports the screenshot's boss at its spot with `/max`. Tester posts the dated copy of a screenshot of that boss there with a mention:
+    - joined by Tester's automatic status, the reply names the post;
+    - the end stays 21:00 (an all-day countdown never moves it).
+    - Optional, on a max event's day (the Max Battle Day of 2026-10-24, 14:00–17:00): a fresh screenshot whose countdown ends at the rotation, posted at a battle of its boss whose end is earlier, moves the end later and says "Its end is now …, from your screenshot." Not earlier.
+14. **Another boss, newer.** Googer reports another Dynamax boss at the spot of `1000038140.jpg` with `/max`, at a time T. A copy of `1000038140.jpg` with the status bar cropped off (no clock: the file's name is the moment) named `Screenshot_<day>-<T plus one minute>.jpg`, posted by Tester with a mention after that:
+    - the boss changes to Dynamax Sneasel (2★), the end to the screenshot's; the post says "Boss changed to **Dynamax Sneasel (2★)** from a screenshot by Tester, until 21:00."; Googer stays signed up;
+    - a member with a want of Sneasel gets the DM `/boss` would send.
+    - **Older:** the dated copy of step 4 (its moment before T) at a battle of another boss: refused "There is already a max battle against … at <spot>: <post>. `/boss` there changes its boss."
+    - **The other kind:** Googer reports a Gigantamax boss at the spot (`tier:G`); a Dynamax screenshot there is refused, the post named, without the `/boss` hint, even when newer.
+
+## Mentions and passive reading
+
+15. **A mention, clear spot of the channel's region:** a dated copy of `1000038141.jpg` with @Pine and nothing else: reported unasked, the message deleted; with text beside it, marked ✅.
+16. **A mention, another region's spot:** the menu "Which Power Spot is it?" with the spot, its region named under it; picking it reports there.
+17. **A spot cut short:** a copy of `IMG_0157.png` with the end of the Power Spot's name painted over (in `var/stage/8xs/`): the menu of the spots it may be, the channel's region's first; the pick is reported and kept in the record (`pickedSpotId`).
+18. **An unknown spot.** The screenshot of step 3 whose Power Spot lies in no region of the test server (`<shot>` below), its name read surely (`/read-screenshot` shows it). Only if none of the screenshots has such a spot, as a fallback: in the dev database (`pine-dev-mysql`), set the row of the Power Spot of `IMG_0147.png` in the table `Wayspot` (its id is the Wayfarer id of `/max spot:`'s choice) to `kind = 'gone'` for the step, restart the bot, and restore it afterwards (`kind = 'powerspot'`, restart).
+    - A mention with `<shot>`: "I do not know a Power Spot called "<name>" here: use `/max spot:`. I have let the staff know Pine may be missing this Power Spot."; the moderators' channel gets "A screenshot in #<channel> showed the Power Spot "<name>", which Pine does not know. A new Wayspot export may be due (`/gym import`)."
+    - The same again, and `/max screenshot:` with it: the refusal still says the staff know; no second note.
+    - Passive: only "<@Tester> I could not tell which Power Spot this is: use `/max screenshot:`."; no note.
+19. **Passive, its own region:** a dated copy of a screenshot whose Power Spot has no battle, posted without a mention in its region's channel: reported silently.
+20. **Passive, another region:** with a battle of the boss there, joined unasked: the reply pings Tester and names the post. With none, "<@Tester> <spot> is in <#region>. Report it there?" with Yes and No only Tester can answer; Yes reports it there, No or nothing makes nothing.
+21. **Passive, silent:** a screenshot of no boss Pine can tell, or an older screenshot at another boss's battle: no reply.
+
+## After the last battle
+
+22. **After 21:00:** `1000038146.jpg` named `Screenshot_<day>-211200.jpg` (its clock, 9:12 pm), posted after 21:12 with a mention and with `/max screenshot:`: "Max battles are over for today: they can be fought from 06:00 to 21:00." Passive: silent.
+
+## Feedback and review
+
+23. **Feedback:** the Screenshot feedback of step 8's answer, Something is wrong… with Power Spot and Boss ticked: "Thank you". The record has `use: 'max'`, the max report and the feedback.
+24. **`npm run ocr:review -- var/ocr/review`** (a copy of the dev bot's review folder): the first line counts "raid screenshots and other pictures", and a "Max battles:" part counts the max screenshots apart, with Power Spot and Boss said wrong.
+
+## After
+
+25. Note the results in the follow-ups file, under "From the staging run of 8X-S".
diff --git a/docs/superpowers/specs/2026-10-20-max-battles-design.md b/docs/superpowers/specs/2026-10-20-max-battles-design.md
index e31eae1ce1ea39752445f1a86ee8e5b983d936dd..79160ae1277e73eca954709e780371eef41ea051 100644
--- a/docs/superpowers/specs/2026-10-20-max-battles-design.md
+++ b/docs/superpowers/specs/2026-10-20-max-battles-design.md
@@ -179,9 +179,9 @@ All decided by Matt, 2026-10-20:
 - **Q8** A species want gives at most **one DM an hour per member and boss** for max battles, and that DM says so: "You won't be told about more Dynamax Machamp battles for an hour." (so a quiet hour does not look like broken notifications).
 
 Open for 8X-3 (Matt, 2026-10-20 night; settle when 8X-3 is planned):
-- **Q9 How long a max battle lasts.** Matt: Gigantamax battles, event days only in practice, do not follow the all-day rule (06:00–21:00) but a short rotation: 30 minutes during a Max Battle Day's three core hours for certain; outside them (the rest of the day) 30 or 60 minutes, not known. A search (2026-10-20) confirmed only the 30-minute rotation in the core hours (the Max Battle Day articles of the Pokémon GO wiki and Pokémon GO Hub, one older guide says 20–30 minutes) and that Max Monday's bosses rotate every hour all day; nothing on the hours outside; Reddit was not reached. The game's timer at a spot counts down to 21:00, so a reporter does not see the rotation. Claude's recommendation: the default end by the event the battle falls in: during a Max Battle Day's hours (8X-2 knows them) 30 minutes from the report, on a Max Monday 60 minutes, a Gigantamax battle outside an event's hours 60 minutes, otherwise 21:00 as above; `end:` and `/end` change it as now; Matt confirms the outside-hours rotation on the next Gigantamax day. **Matt (2026-10-20): the recommendation matches what he believes is right; he seeks confirmation of the outside-hours rotation.** The wiki's list of Max Battle Days (read by Matt, 2026-10-20): most are 14:00–17:00 (one 14:00–19:00, extended by Niantic), but the **Max Battle Weekends** (Dynamax legendaries, and Gigantamax inside larger events) run 06:00–21:00; the 30-minute rotation is stated for Max Battle Days only, and Matt has seen Gigantamax battles active before and after the three core hours. So the rule reads the event's own hours from the feed, never a fixed 14:00–17:00: an event of a few hours 30 minutes, an all-day event (Max Monday, a Max Battle Weekend) 60 minutes, until confirmed. **Matt (2026-10-21): battles rotate on the hour and the half hour, and a reported battle is already on (there is no egg), so the default end is the boundary of the rotation it is in, never a span from the report:** inside a short event (a Max Battle Day of a few hours) the next :00 or :30; inside an all-day event (Max Monday, a Max Battle Weekend), and for a Gigantamax battle in a big event (Wild Area, GO Tour, GO Fest Global) or outside any event, the next full hour; otherwise (a Dynamax battle on an ordinary day) the last battle time, or the start of a max event later that day if sooner (Matt, 2026-10-21, Q-B: reported at 10:00 on a 14:00–17:00 Max Battle Day, until 14:00; to be checked on the lake trio day of 2026-10-24, whether Dynamax battles were up before 14:00); in a big event's hours `/max` lists the Gigantamax bosses first (Matt, 2026-10-21, Q-A); always capped at the last battle time; `end:` and `/end` change it within the day. A report not joining a battle whose end is less than five minutes away is asked about first (a dialog: until the next rotation, first, or until the end about to pass; only "Report it anyway?" where no later rotation is left, also a Dynamax battle at its event's last boundary); a typed `end:` is never asked about.
+- **Q9 How long a max battle lasts.** Matt: Gigantamax battles, event days only in practice, do not follow the all-day rule (06:00–21:00) but a short rotation: 30 minutes during a Max Battle Day's three core hours for certain; outside them (the rest of the day) 30 or 60 minutes, not known. A search (2026-10-20) confirmed only the 30-minute rotation in the core hours (the Max Battle Day articles of the Pokémon GO wiki and Pokémon GO Hub, one older guide says 20–30 minutes) and that Max Monday's bosses rotate every hour all day; nothing on the hours outside; Reddit was not reached. The game's timer at a spot counts down to 21:00, so a reporter does not see the rotation (corrected by the design of max battle screenshots, `2026-10-22-max-battle-screenshots-design.md` section 8: it counts down to the rotation's end during events and to the small hours, about 04:59, otherwise; a screenshot's end is its countdown capped at the last battle time). Claude's recommendation: the default end by the event the battle falls in: during a Max Battle Day's hours (8X-2 knows them) 30 minutes from the report, on a Max Monday 60 minutes, a Gigantamax battle outside an event's hours 60 minutes, otherwise 21:00 as above; `end:` and `/end` change it as now; Matt confirms the outside-hours rotation on the next Gigantamax day. **Matt (2026-10-20): the recommendation matches what he believes is right; he seeks confirmation of the outside-hours rotation.** The wiki's list of Max Battle Days (read by Matt, 2026-10-20): most are 14:00–17:00 (one 14:00–19:00, extended by Niantic), but the **Max Battle Weekends** (Dynamax legendaries, and Gigantamax inside larger events) run 06:00–21:00; the 30-minute rotation is stated for Max Battle Days only, and Matt has seen Gigantamax battles active before and after the three core hours. So the rule reads the event's own hours from the feed, never a fixed 14:00–17:00: an event of a few hours 30 minutes, an all-day event (Max Monday, a Max Battle Weekend) 60 minutes, until confirmed. **Matt (2026-10-21): battles rotate on the hour and the half hour, and a reported battle is already on (there is no egg), so the default end is the boundary of the rotation it is in, never a span from the report:** inside a short event (a Max Battle Day of a few hours) the next :00 or :30; inside an all-day event (Max Monday, a Max Battle Weekend), and for a Gigantamax battle in a big event (Wild Area, GO Tour, GO Fest Global) or outside any event, the next full hour; otherwise (a Dynamax battle on an ordinary day) the last battle time, or the start of a max event later that day if sooner (Matt, 2026-10-21, Q-B: reported at 10:00 on a 14:00–17:00 Max Battle Day, until 14:00; to be checked on the lake trio day of 2026-10-24, whether Dynamax battles were up before 14:00); in a big event's hours `/max` lists the Gigantamax bosses first (Matt, 2026-10-21, Q-A); always capped at the last battle time; `end:` and `/end` change it within the day. A report not joining a battle whose end is less than five minutes away is asked about first (a dialog: until the next rotation, first, or until the end about to pass; only "Report it anyway?" where no later rotation is left, also a Dynamax battle at its event's last boundary); a typed `end:` is never asked about.
 - **Q10 Meet… for a max battle** (8X-1B left it to 8X-3): no in-game RSVP times exist for max battles (Matt, 2026-10-20). Claude's recommendation: the round 5-minute times of the next hour, up to the battle's end, and "No meeting time" when one is set. **Taken by Matt, 2026-10-20.**
 
 ## 13. Follow-ups (not in this work)
 
-Pokebattler as a fallback raid boss source; screenshots of max battles; spot targets ("tell me about max battles at this spot"); catch CP and moves for max bosses; a group menu and more than five groups.
+Pokebattler as a fallback raid boss source; screenshots of max battles (since plan 8X-S: design `2026-10-22-max-battle-screenshots-design.md`, `docs/architecture/screenshots.md`); spot targets ("tell me about max battles at this spot"); catch CP and moves for max bosses; a group menu and more than five groups.
diff --git a/scripts/ocr/review.ts b/scripts/ocr/review.ts
index fb536888b13a1009ab04e4b24ab0959c59009fd3..f94e15645b9bba4eccf6d3c47f1fd5a3ca403fbe 100644
--- a/scripts/ocr/review.ts
+++ b/scripts/ocr/review.ts
@@ -9,7 +9,8 @@
  * how often members said it was wrong, by where it went wrong (`wrongAt`): the gym's text read
  * but another gym chosen (a nickname may fix it) or no gym found, no clock or no countdown, the
  * heads counted, a CP read and no boss decided. Gym texts corrected the same way twice or more
- * are suggested as nicknames. What members wrote, and who they are (their ids), is printed only
+ * are suggested as nicknames. Max battles' screenshots are counted apart, by their own report
+ * (`maxWrongAt`: the Power Spot's text, the countdown, the heads and form, the boss's name). What members wrote, and who they are (their ids), is printed only
  * with `--show-text`: it stays on the machine it was copied to. The procedure around it is the skill
  * `.claude/skills/improve-screenshot-reading/SKILL.md`.
  */
@@ -52,7 +53,9 @@ const listed = (counts: Record<string, number>) =>
     .map(([key, n]) => `${key} ${n}`)
     .join(', ') || 'none';
 
-out(`${summary.records} screenshots${unreadable ? ` (${unreadable} records not read)` : ''}.`);
+out(
+  `${summary.records} raid screenshots and other pictures${unreadable ? ` (${unreadable} records not read)` : ''}.`,
+);
 out(`Read for: ${listed(summary.byUse)}.`);
 out(`Decided: ${listed(summary.byDecision)}.`);
 out(`Doubts raised: ${listed(summary.doubts)}.`);
@@ -66,6 +69,24 @@ for (const [element, counts] of Object.entries(summary.elements)) {
     out(`  ${n}  ${where}`);
   }
 }
+const { max } = summary;
+if (max.records > 0) {
+  // Max battles' screenshots apart, by their own report (plan 8X-S).
+  out();
+  out(`Max battles: ${max.records} screenshots.`);
+  out(`  Read for: ${listed(max.byUse)}.`);
+  out(`  Decided: ${listed(max.byDecision)}.`);
+  out(`  Doubts raised: ${listed(max.doubts)}.`);
+  out(`  Said all right: ${max.right}; said wrong: ${max.wrong}.`);
+  for (const [element, counts] of Object.entries(max.elements)) {
+    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
+    if (total === 0) continue;
+    out(`  ${element}: wrong ${total} times`);
+    for (const [where, n] of Object.entries(counts).sort(([, a], [, b]) => b - a)) {
+      out(`    ${n}  ${where}`);
+    }
+  }
+}
 if (summary.nicknames.length > 0) {
   out();
   out('Gym texts corrected the same way more than once (suggested nicknames, `/gym edit`):');
diff --git a/src/commands/max/max-screenshot.test.ts b/src/commands/max/max-screenshot.test.ts
index 78f7e15ae84a8803d29421a3872b5686b11e34ca..90935b055dc1899b987602d1af37af69de8b8ed1 100644
--- a/src/commands/max/max-screenshot.test.ts
+++ b/src/commands/max/max-screenshot.test.ts
@@ -303,6 +303,8 @@ describe('/max screenshot:', () => {
     expect(told(used).content).toMatch(
       /^I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `\/max spot:`\. I have let the staff know Pine may be missing this Power Spot\.\nNothing was reported\. This is what I read:\n/,
     );
+    // Its feedback is a max battle's.
+    expect(rowsOf(told(used))[0]?.components[1]?.custom_id).toMatch(/^shot:[\w-]+:wrong:max$/);
     await made.reports.flush();
     expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
     // A spot typed beside it is reported, and nobody is told.
diff --git a/src/commands/max/max-screenshot.ts b/src/commands/max/max-screenshot.ts
index e7ac390f48f99cf653845bf7d5da3e887690791d..27fd96932b98254afed55043de9cc974067d14b1 100644
--- a/src/commands/max/max-screenshot.ts
+++ b/src/commands/max/max-screenshot.ts
@@ -206,7 +206,6 @@ export async function reportMaxFromScreenshot(
     if (await typedOnly()) return;
     throw new UserError(unreadWords(outcome, 'max'));
   }
-  const feedback = outcome.id === undefined ? [] : [feedbackRow(outcome.id)];
   if (outcome.screen === 'raid') {
     const { decision } = outcome;
     if (decision.kind === 'refuse' && decision.reason === 'not-a-raid-screen') {
@@ -219,9 +218,13 @@ export async function reportMaxFromScreenshot(
       return;
     }
     // A raid's screen is the wrong picture, whatever was typed beside it.
-    await interaction.editReply({ content: RAID_SCREEN_FOR_MAX, components: feedback });
+    await interaction.editReply({
+      content: RAID_SCREEN_FOR_MAX,
+      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
+    });
     return;
   }
+  const feedback = outcome.id === undefined ? [] : [feedbackRow(outcome.id, true)];
   if (bossWithoutTier) {
     const tier = tierOfScreen(outcome.report);
     if (tier === undefined) throw new UserError(WHICH_TIER);
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index d4782ec860d1073680b8b7e30d6a21dca92519f3..d071fd4eb60a8ddede5f4a2b885811848814786b 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -293,6 +293,7 @@ describe('/raid with a screenshot', () => {
       expect(sent(used.editReply).content).toBe(
         'That is a max battle: use `/max screenshot:`, or post it with a mention.',
       );
+      expect(rowsOf(sent(used.editReply))[0]?.components[1]?.custom_id).toMatch(/:wrong:max$/);
     }
     expect(store.active()).toEqual([]);
   });
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index eacb73e8d3ef459e1ba0393b7eb4362fcc5caa83..47aa75b1f8a371f9aa5a3b8e3cf4dfe83cacf186 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -366,7 +366,7 @@ async function reportFromScreenshot(
     // A max battle's screen is the wrong picture, whatever was typed beside it (plan 8X-S).
     await interaction.editReply({
       content: MAX_SCREEN_FOR_RAID,
-      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
+      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id, true)],
     });
     return;
   }
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index d50a37a3305ae1c98d131246a8ba02f77c400ed0..e2c3e011f634e0d5d21861600feaa26b9caed475 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -18,13 +18,22 @@ import { v2Answer } from '../../discord/late-reply.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
 import {
-  FEEDBACK_ELEMENTS,
   MAX_CORRECTION,
+  MAX_FEEDBACK_ELEMENTS,
+  RAID_FEEDBACK_ELEMENTS,
   type Feedback,
   type FeedbackElement,
   type StoredDecision,
+  type StoredMaxReport,
 } from '../../domain/ocr/screenshot-record.js';
-import { refusalWords, screenshotMessage } from '../../render/screenshot-reading.js';
+import {
+  maxRefusalWords,
+  maxScreenshotMessage,
+  MAX_TIER_UNKNOWN,
+  refusalWords,
+  screenshotMessage,
+  type BattleTimes,
+} from '../../render/screenshot-reading.js';
 import { SCREENSHOT_FEEDBACK } from '../../render/party-controls.js';
 import { gymNamerOf } from './gym-question.js';
 import { cancelShot, chooseShotGym, chooseShotSpot, confirmShot } from './mention.js';
@@ -42,6 +51,7 @@ const ELEMENT_LABELS: Readonly<Record<FeedbackElement, string>> = {
   stage: 'Egg or hatched',
   tier: 'Tier',
   boss: 'Boss',
+  spot: 'Power Spot',
 };
 
 type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
@@ -51,26 +61,40 @@ function shotButton(
   action: string,
   label: string,
   style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger,
+  args: string[] = [],
 ) {
   return {
     type: ComponentType.Button as const,
-    custom_id: encodeCustomId({ kind: SHOT_KIND, id, action }),
+    custom_id: encodeCustomId({ kind: SHOT_KIND, id, action, args }),
     label,
     style,
   };
 }
 
-/** "All right" and "Something is wrong" under what was read. */
-export function feedbackButtons(screenshotId: string): APIButtonComponent[] {
+/**
+ * The argument that marks the feedback of a max battle's screenshot (`shot:<id>:wrong:max`,
+ * `shot:<id>:form:max`; plan 8X-S, review R6): its form offers a max battle's elements. A button
+ * without it (every one made before) is a raid's.
+ */
+const MAX_ARG = 'max';
+
+/** "All right" and "Something is wrong" under what was read; `max` for a max battle's screenshot. */
+export function feedbackButtons(screenshotId: string, max = false): APIButtonComponent[] {
   return [
     shotButton(screenshotId, 'right', 'All right', ButtonStyle.Success),
-    shotButton(screenshotId, 'wrong', 'Something is wrong…', ButtonStyle.Secondary),
+    shotButton(
+      screenshotId,
+      'wrong',
+      'Something is wrong…',
+      ButtonStyle.Secondary,
+      max ? [MAX_ARG] : [],
+    ),
   ];
 }
 
-/** The same in a row of a plain-text message (the refusal of `/raid`). */
-export function feedbackRow(screenshotId: string): Row {
-  return { type: ComponentType.ActionRow, components: feedbackButtons(screenshotId) };
+/** The same in a row of a plain-text message (the refusals of `/raid` and `/max`). */
+export function feedbackRow(screenshotId: string, max = false): Row {
+  return { type: ComponentType.ActionRow, components: feedbackButtons(screenshotId, max) };
 }
 
 /** The button of the reporter's private answer that shows the screenshot. */
@@ -81,10 +105,26 @@ export function showRow(screenshotId: string): Row {
   };
 }
 
-/** The form of "Something is wrong": which elements, and what they should be. */
-export function feedbackForm(screenshotId: string): APIModalInteractionResponseCallbackData {
+/** The elements a form offers: a max battle's screen's, or a raid's. */
+const elementsOf = (max: boolean): readonly FeedbackElement[] =>
+  max ? MAX_FEEDBACK_ELEMENTS : RAID_FEEDBACK_ELEMENTS;
+
+/**
+ * The form of "Something is wrong": which elements (a max battle's screen's with `max`: Power
+ * Spot, time, tier, boss), and what they should be.
+ */
+export function feedbackForm(
+  screenshotId: string,
+  max = false,
+): APIModalInteractionResponseCallbackData {
+  const elements = elementsOf(max);
   return {
-    custom_id: encodeCustomId({ kind: SHOT_KIND, id: screenshotId, action: 'form' }),
+    custom_id: encodeCustomId({
+      kind: SHOT_KIND,
+      id: screenshotId,
+      action: 'form',
+      args: max ? [MAX_ARG] : [],
+    }),
     title: 'What did I read wrong?',
     components: [
       {
@@ -94,8 +134,8 @@ export function feedbackForm(screenshotId: string): APIModalInteractionResponseC
           type: ComponentType.StringSelect,
           custom_id: ELEMENTS_INPUT,
           min_values: 1,
-          max_values: FEEDBACK_ELEMENTS.length,
-          options: FEEDBACK_ELEMENTS.map((element) => ({
+          max_values: elements.length,
+          options: elements.map((element) => ({
             label: ELEMENT_LABELS[element],
             value: element,
           })),
@@ -129,6 +169,28 @@ export function decisionWords(decision: StoredDecision): string {
   }
 }
 
+/**
+ * What Pine did, or would do, with a max battle's screenshot (plan 8X-S), in one sentence: its
+ * refusal in the words a mention or `/max` would say (`report` for the Power Spot read).
+ */
+export function maxDecisionWords(
+  decision: StoredDecision,
+  report: StoredMaxReport,
+  times: BattleTimes,
+): string {
+  switch (decision.kind) {
+    case 'report':
+      return 'With a screenshot like this, I report the max battle as above.';
+    case 'ask':
+      // A spot not clear is asked first; asked with the spot clear, only the tier is missing.
+      return decision.doubts.includes('spot-unclear')
+        ? 'With a screenshot like this, I ask which Power Spot it is before I report the battle.'
+        : MAX_TIER_UNKNOWN;
+    case 'refuse':
+      return maxRefusalWords(decision.reason, times, report.spot.read);
+  }
+}
+
 /**
  * Shows a member privately the kept screenshot itself (so they can read what Pine could not),
  * what was read and what Pine made of it, with "All right" and "Something is wrong". For the
@@ -149,17 +211,28 @@ export async function showScreenshot(
   }
   const { record } = kept;
   const shown = kept.path === undefined || record.file === null ? undefined : record.file;
-  const message = screenshotMessage({
-    report: record.report,
-    gymName: gymNamerOf(ctx),
-    decision: decisionWords(record.decision),
+  const shot = {
     question:
       record.file === null
         ? 'Is this what the picture shows?'
         : 'Is this what the screenshot shows?',
     picture: shown === undefined ? undefined : `attachment://${shown}`,
-    buttons: feedbackButtons(screenshotId),
-  });
+  };
+  // A max battle's screenshot shows its own reading, and its feedback is a max battle's.
+  const message = record.max
+    ? maxScreenshotMessage({
+        ...shot,
+        report: record.max,
+        decision: maxDecisionWords(record.decision, record.max, ctx.config.settings.maxBattles),
+        buttons: feedbackButtons(screenshotId, true),
+      })
+    : screenshotMessage({
+        ...shot,
+        report: record.report,
+        gymName: gymNamerOf(ctx),
+        decision: decisionWords(record.decision),
+        buttons: feedbackButtons(screenshotId),
+      });
   await interaction.editReply({
     ...v2Answer(message),
     files:
@@ -206,7 +279,7 @@ export const screenshotControls: ComponentHandler = {
         return;
       }
       case 'wrong':
-        await interaction.showModal(feedbackForm(id.id));
+        await interaction.showModal(feedbackForm(id.id, id.args[0] === MAX_ARG));
         return;
       case 'cancel':
         return cancelShot(interaction, id.id);
@@ -230,11 +303,10 @@ export const screenshotControls: ComponentHandler = {
 
   async modal(interaction, id, ctx) {
     if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
+    const offered = elementsOf(id.args[0] === MAX_ARG) as readonly string[];
     const elements = interaction.fields
       .getStringSelectValues(ELEMENTS_INPUT)
-      .filter((value): value is FeedbackElement =>
-        (FEEDBACK_ELEMENTS as readonly string[]).includes(value),
-      );
+      .filter((value): value is FeedbackElement => offered.includes(value));
     if (elements.length === 0) throw new UserError('Choose what was wrong.');
     const correction = interaction.fields
       .getTextInputValue(CORRECTION_INPUT)
diff --git a/src/commands/screenshots/read-screenshot.max.test.ts b/src/commands/screenshots/read-screenshot.max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fa5ec3b6b5725613be55ccedd18cff6a352a9150
--- /dev/null
+++ b/src/commands/screenshots/read-screenshot.max.test.ts
@@ -0,0 +1,130 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  asV2,
+  fakeButton,
+  fakeChatInput,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
+import { buttonsOf, textOf } from '../../../test/support/messages.js';
+import { at } from '../../../test/support/parties.js';
+import { screenshotsWith } from '../../../test/support/screenshot-service.js';
+import { maxReading } from '../../../test/support/screenshots.js';
+import { InteractionRouter } from '../../discord/router.js';
+import type { ScreenReading } from '../../ocr/screen-reader.js';
+import { screenshotControls } from './feedback.js';
+import { readScreenshot } from './read-screenshot.js';
+
+/*
+ * `/read-screenshot` and the feedback of a max battle's screenshot (plan 8X-S, task 7).
+ * `MAX_THURSDAY` is 14:00; `maxReading()` is a Dynamax Machop (2★) at the test spot's Power
+ * Spot, its clock read surely at 13:58 and 30 minutes to go.
+ */
+
+const END = at('2026-10-22T14:28');
+
+async function setup() {
+  const made = await maxReportingWith();
+  const shots = screenshotsWith(made.ctx);
+  const ctx = { ...made.ctx, screenshots: shots.screenshots };
+  const router = new InteractionRouter(ctx, [readScreenshot], [screenshotControls]);
+  const handled = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const read = (reading: ScreenReading) =>
+    handled(
+      fakeChatInput({
+        commandName: 'read-screenshot',
+        channelId: WEST_CHANNEL,
+        resolved: { screenshot: shots.screenshot('max.png', reading) },
+      }),
+    );
+  return { ...shots, ...made, handled, read };
+}
+
+describe('/read-screenshot of a max battle’s screenshot', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('shows what it read and what it would do, with feedback on a max battle’s elements', async () => {
+    const made = await setup();
+    const used = await made.read(maxReading());
+    const answer = asV2(sent(used.editReply));
+    const text = textOf(answer);
+    expect(text).toContain('**Power Spot:** read `GAZEBO OF THE PARK` → **Gazebo of the Park**');
+    expect(text).toContain(
+      `**Time:** clock \`13:58\`, countdown \`0:30:00\` → ends at <t:${String(END / 1000)}:t>`,
+    );
+    expect(text).toContain('**Tier:** 2 heads, Dynamax → **Dynamax 2★**');
+    expect(text).toContain('**Boss:** name read `MACHOP` → **Machop**');
+    expect(text).toContain('With a screenshot like this, I report the max battle as above.');
+    expect(made.store.active()).toEqual([]);
+    const [right, wrong] = buttonsOf(answer);
+    const id = right?.customId?.split(':')[1] ?? '';
+    expect(wrong?.customId).toBe(`shot:${id}:wrong:max`);
+
+    const pressed = await made.handled(fakeButton({ customId: wrong?.customId ?? '' }));
+    const form = pressed.showModal.mock.calls[0]?.[0] as {
+      custom_id: string;
+      components: { component: { options?: { label: string; value: string }[] } }[];
+    };
+    expect(form.components[0]?.component.options?.map((o) => o.label)).toEqual([
+      'Power Spot',
+      'Time',
+      'Tier',
+      'Boss',
+    ]);
+    await made.handled(
+      fakeModal({
+        customId: form.custom_id,
+        selected: { elements: ['spot', 'gym'] },
+        fields: { correction: 'Gazebo of the Pond' },
+      }),
+    );
+    const kept = await made.screenshots.get(id);
+    expect(kept).toMatchObject({
+      record: { feedback: [{ verdict: 'wrong', elements: ['spot'] }] },
+    });
+  });
+
+  it('says the refusal or the question it would make', async () => {
+    const made = await setup();
+    const unknown = await made.read(maxReading('NOWHERE IN PARTICULAR'));
+    expect(textOf(asV2(sent(unknown.editReply)))).toContain(
+      'I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `/max spot:`.',
+    );
+    const noBoss = await made.read(maxReading(undefined, { species: 'MEWTWO' }));
+    expect(textOf(asV2(sent(noBoss.editReply)))).toContain(
+      'I could not tell which boss: use `/max`.',
+    );
+    // Nobody is told of a Power Spot read only to show it.
+    await made.reports.flush();
+    expect(made.entries.map((entry) => entry.msg)).not.toContain(
+      'a screenshot showed a Power Spot Pine does not know',
+    );
+  });
+
+  it('shows a kept max battle’s screenshot with its own reading', async () => {
+    const made = await setup();
+    const used = await made.read(maxReading());
+    const id = buttonsOf(asV2(sent(used.editReply)))[0]?.customId?.split(':')[1] ?? '';
+    const shown = await made.handled(fakeButton({ customId: `shot:${id}:show` }));
+    const answer = asV2(sent(shown.editReply));
+    expect(textOf(answer)).toContain('**Power Spot:** read `GAZEBO OF THE PARK`');
+    expect(buttonsOf(answer)[1]?.customId).toBe(`shot:${id}:wrong:max`);
+  });
+
+  // Matt, 2026-10-23 (review r4 B4).
+  it('writes Power Spot in its help as the game does', () => {
+    const { details } = readScreenshot.help ?? {};
+    expect(typeof details === 'string' ? details : '').toContain('of a max battle the Power Spot');
+  });
+});
diff --git a/src/commands/screenshots/read-screenshot.ts b/src/commands/screenshots/read-screenshot.ts
index 0a838c70d1a281fdf7c3e5f98de1b7c4b870f277..57f68d6643410e477888639f99f5db531a91b27a 100644
--- a/src/commands/screenshots/read-screenshot.ts
+++ b/src/commands/screenshots/read-screenshot.ts
@@ -5,7 +5,11 @@ import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { storedReport } from '../../domain/ocr/screenshot-record.js';
-import { refusalWords, screenshotMessage, SHOT_COLOUR } from '../../render/screenshot-reading.js';
+import {
+  maxScreenshotMessage,
+  screenshotMessage,
+  SHOT_COLOUR,
+} from '../../render/screenshot-reading.js';
 import { textMessage } from '../../render/v2.js';
 import {
   unreadWords,
@@ -13,7 +17,7 @@ import {
   type ScreenshotSource,
   type ScreenshotWhere,
 } from '../../services/screenshot-service.js';
-import { decisionWords, feedbackButtons } from './feedback.js';
+import { decisionWords, feedbackButtons, maxDecisionWords } from './feedback.js';
 import { gymNamerOf } from './gym-question.js';
 
 /**
@@ -91,11 +95,13 @@ export async function readAttachedOutcome(
 export const readScreenshot: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('read-screenshot')
-    .setDescription('Show what I read on a raid screenshot, without reporting anything')
+    .setDescription(
+      'Show what I read on a raid or max battle screenshot, without reporting anything',
+    )
     .addAttachmentOption((option) =>
       option
         .setName('screenshot')
-        .setDescription('A screenshot of a raid or an egg, as the game shows it')
+        .setDescription('A screenshot of a raid, an egg or a max battle, as the game shows it')
         .setRequired(true),
     ),
   help: {
@@ -103,7 +109,8 @@ export const readScreenshot: SimpleCommand = {
     details:
       'Reads the screenshot and tells you, privately, what I read on it and what I make of it: ' +
       'the gym, the time, egg or hatched, the tier and the boss, each as read and as ' +
-      'understood. Nothing is reported. Tell me with the buttons whether I read it right: ' +
+      'understood; of a max battle the Power Spot, the time, the tier and the boss. Nothing is ' +
+      'reported. Tell me with the buttons whether I read it right: ' +
       'screenshots with your answer are kept for a while to improve the reader. Outside a ' +
       'region channel the gym is looked for among all of this server’s gyms.',
     examples: ['/read-screenshot screenshot:(a raid screenshot)'],
@@ -129,11 +136,27 @@ export const readScreenshot: SimpleCommand = {
       await interaction.editReply(v2Answer(textMessage(SHOT_COLOUR, [unreadWords(outcome)])));
       return;
     }
+    // The member's own upload, beside what was read of it.
+    const picture = attachment.url.startsWith('https://') ? attachment.url : undefined;
+    const question = outcome.id === undefined ? undefined : 'Did I read it right?';
     if (outcome.screen === 'max') {
-      // A max battle's screen is no raid's.
-      await interaction.editReply(
-        v2Answer(textMessage(SHOT_COLOUR, [refusalWords('not-a-raid-screen')])),
-      );
+      // A max battle's screenshot (plan 8X-S): its own reading, what a mention or `/max` would do
+      // with it (nobody is told of a Power Spot only shown), and a max battle's feedback.
+      const { decision } = outcome;
+      const stored =
+        decision.kind === 'report'
+          ? { kind: 'report' as const }
+          : decision.kind === 'ask'
+            ? { kind: 'ask' as const, doubts: decision.doubts }
+            : { kind: 'refuse' as const, reason: decision.reason };
+      const message = maxScreenshotMessage({
+        report: outcome.report,
+        decision: maxDecisionWords(stored, outcome.report, ctx.config.settings.maxBattles),
+        question,
+        picture,
+        buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id, true),
+      });
+      await interaction.editReply(v2Answer(message));
       return;
     }
     const decision =
@@ -146,9 +169,8 @@ export const readScreenshot: SimpleCommand = {
       report: storedReport(outcome.report),
       gymName: gymNamerOf(ctx),
       decision: decisionWords(decision),
-      question: outcome.id === undefined ? undefined : 'Did I read it right?',
-      // The member's own upload, beside what was read of it.
-      picture: attachment.url.startsWith('https://') ? attachment.url : undefined,
+      question,
+      picture,
       buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id),
     });
     await interaction.editReply(v2Answer(message));
diff --git a/src/domain/ocr/review.test.ts b/src/domain/ocr/review.test.ts
index 89d45f66e6893ee15c3b058a2f9ea66fa13bedec..25415b8480822c341bbf11a50bf4f90bd3e85c72 100644
--- a/src/domain/ocr/review.test.ts
+++ b/src/domain/ocr/review.test.ts
@@ -1,6 +1,11 @@
 import { describe, expect, it } from 'vitest';
-import { reviewSummary, wrongAt, type ReviewRecord } from './review.js';
-import type { FeedbackElement, FeedbackRecord, StoredReport } from './screenshot-record.js';
+import { maxWrongAt, reviewSummary, wrongAt, type ReviewRecord } from './review.js';
+import type {
+  FeedbackElement,
+  FeedbackRecord,
+  StoredMaxReport,
+  StoredReport,
+} from './screenshot-record.js';
 
 const REPORT: StoredReport = {
   gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
@@ -95,3 +100,78 @@ describe('reviewSummary', () => {
     expect(summary.elements.boss).toEqual({ 'CP read, no boss decided': 1 });
   });
 });
+
+/** A max battle's report as a record keeps it: Machop (2★) at an invented Power Spot. */
+const MAX: StoredMaxReport = {
+  form: 'dynamax',
+  speciesRead: 'MACHOP',
+  boss: { ref: { key: 'machop' }, name: 'Machop', listed: true },
+  heads: 2,
+  tier: 'D2',
+  tierFrom: 'list',
+  spot: {
+    read: 'MAPLE BENCH',
+    readSurely: true,
+    match: { kind: 'clear', spot: { id: 'w2', title: 'Maple Bench', local: true } },
+  },
+  clock: { hour: 13, minute: 58 },
+  countdown: 1800,
+  takenAt: 0,
+  timeFrom: 'clock',
+  sureMoment: true,
+  countdownEnd: 1_800_000,
+  end: 1_800_000,
+  endFrom: 'countdown',
+  rotationEnd: true,
+  firstBattle: 0,
+  lastBattle: 2_000_000,
+  doubts: ['spot-read-poorly'],
+};
+
+describe('reviewSummary of max battles’ screenshots (plan 8X-S)', () => {
+  const maxRecord = (
+    id: string,
+    feedback: FeedbackRecord[],
+    max: Partial<StoredMaxReport> = {},
+  ) => ({
+    ...record(id, feedback, { doubts: ['not-a-raid-screen'] }),
+    use: 'max',
+    max: { ...MAX, ...max },
+  });
+
+  it('counts them apart, by their own doubts and elements', () => {
+    const summary = reviewSummary([
+      record('a', [wrong(['gym'], '')]),
+      maxRecord('m1', [wrong(['spot', 'boss'], 'Maple Bench East')]),
+      maxRecord('m2', [wrong(['spot'], '')], {
+        spot: { read: 'NOWHERE', readSurely: true, match: { kind: 'unknown' } },
+        doubts: ['no-spot'],
+      }),
+    ]);
+    expect(summary).toMatchObject({ records: 1, wrong: 1, byUse: { raid: 1 } });
+    expect(summary.doubts).toEqual({ 'time-guessed': 1, 'boss-unknown': 1 });
+    expect(summary.max).toMatchObject({ records: 2, wrong: 2, byUse: { max: 2 } });
+    expect(summary.max.doubts).toEqual({ 'spot-read-poorly': 1, 'no-spot': 1 });
+    expect(summary.max.elements.spot).toEqual({
+      'text read, the match chose another Power Spot': 1,
+      'text read, no Power Spot found': 1,
+    });
+    expect(summary.max.elements.boss).toEqual({ 'name read, a listed boss': 1 });
+    // Every member's correction is listed, of either kind.
+    expect(summary.corrections.map((c) => c.id)).toEqual(['m1']);
+  });
+
+  it('tells where a max element went wrong', () => {
+    expect(
+      maxWrongAt('spot', {
+        ...MAX,
+        spot: { read: null, readSurely: false, match: { kind: 'unknown' } },
+      }),
+    ).toBe('no text read');
+    expect(maxWrongAt('time', { ...MAX, countdown: null })).toBe(
+      'no countdown (the end of its rotation)',
+    );
+    expect(maxWrongAt('tier', { ...MAX, heads: null })).toBe('no heads, Dynamax');
+    expect(maxWrongAt('boss', { ...MAX, boss: null })).toBe('name read, no boss found');
+  });
+});
diff --git a/src/domain/ocr/review.ts b/src/domain/ocr/review.ts
index 4a9db17d73585b55e8a154970f14fb38901c8a3d..448c2de4a16bded0fdb28e639db0a88b73225fe3 100644
--- a/src/domain/ocr/review.ts
+++ b/src/domain/ocr/review.ts
@@ -2,7 +2,9 @@ import { nameKey } from '../gyms/shared-names.js';
 import type {
   FeedbackElement,
   FeedbackRecord,
+  MaxFeedbackElement,
   StoredDecision,
+  StoredMaxReport,
   StoredReport,
   StoredTyped,
 } from './screenshot-record.js';
@@ -22,13 +24,29 @@ export interface ReviewRecord {
   report: StoredReport;
   /** What the member typed beside it: those elements are not the reader's to answer for. */
   typed?: StoredTyped | null;
+  /** What the reader made of a max battle's screen (plan 8X-S): such a record is counted apart. */
+  max?: StoredMaxReport;
   feedback: readonly FeedbackRecord[];
 }
 
 /** Where an element went wrong, as far as the record tells. */
 export type WrongAt = string;
 
+/** The max battles' screenshots of a review folder, counted apart (plan 8X-S, review R5). */
+export interface MaxReviewSummary {
+  records: number;
+  byUse: Record<string, number>;
+  byDecision: Record<string, number>;
+  right: number;
+  wrong: number;
+  /** Per element of a max battle's screen: how often it was said wrong, by where. */
+  elements: Record<MaxFeedbackElement, Record<WrongAt, number>>;
+  /** How often each doubt of the max report was raised. */
+  doubts: Record<string, number>;
+}
+
 export interface ReviewSummary {
+  /** The raids' screenshots (and pictures that are no screen); the max battles' are in `max`. */
   records: number;
   byUse: Record<string, number>;
   byDecision: Record<string, number>;
@@ -45,8 +63,9 @@ export interface ReviewSummary {
    * `correction` is the member's text: shown only when asked for.
    */
   nicknames: { read: string; correction: string; times: number }[];
-  /** Every correction with who wrote it: shown only when asked for. */
+  /** Every correction with who wrote it, of either kind of screen: shown only when asked for. */
   corrections: { id: string; memberId: string; elements: FeedbackElement[]; correction: string }[];
+  max: MaxReviewSummary;
 }
 
 /** The elements a member typed, which the reader does not answer for. */
@@ -89,20 +108,108 @@ export function wrongAt(element: FeedbackElement, report: StoredReport): WrongAt
     case 'boss':
       if (report.cp === null) return 'no CP';
       return report.boss === null ? 'CP read, no boss decided' : 'CP read, a boss decided';
+    case 'spot':
+      return 'not on a raid’s screen';
+  }
+}
+
+const FORMS = { dynamax: 'Dynamax', gigantamax: 'Gigantamax', eternamax: 'Eternamax' };
+
+/** Where an element of a max battle's screen said to be wrong went wrong (plan 8X-S). */
+export function maxWrongAt(element: FeedbackElement, report: StoredMaxReport): WrongAt {
+  switch (element) {
+    case 'spot': {
+      if (report.spot.read === null) return 'no text read';
+      const { match } = report.spot;
+      if (match.kind === 'unknown') return 'text read, no Power Spot found';
+      return match.kind === 'candidates'
+        ? 'text read, the Power Spot was not clear'
+        : 'text read, the match chose another Power Spot';
+    }
+    case 'time':
+      if (report.countdown === null) return 'no countdown (the end of its rotation)';
+      if (report.clock === null) return 'no clock (guessed from the upload)';
+      if (report.doubts.includes('time-guessed'))
+        return 'clock read but did not fit the upload (guessed from the upload)';
+      return 'clock and countdown read';
+    case 'tier': {
+      const form = report.form === null ? 'no form' : FORMS[report.form];
+      return `${report.heads === null ? 'no heads' : `${report.heads} heads`}, ${form}`;
+    }
+    case 'boss':
+      if (report.speciesRead === null) return 'no name read';
+      if (report.boss === null) return 'name read, no boss found';
+      return report.boss.listed ? 'name read, a listed boss' : 'name read, a boss on no list';
+    case 'gym':
+    case 'stage':
+      return 'not on a max battle’s screen';
   }
 }
 
-export function reviewSummary(records: readonly ReviewRecord[]): ReviewSummary {
+/** Corrections members wrote on these records, with who wrote them. */
+function correctionsOf(record: ReviewRecord): ReviewSummary['corrections'] {
+  return record.feedback.flatMap((f) =>
+    f.verdict === 'wrong' && f.correction.trim() !== ''
+      ? [
+          {
+            id: record.id,
+            memberId: f.memberId,
+            elements: f.elements,
+            correction: f.correction.trim(),
+          },
+        ]
+      : [],
+  );
+}
+
+/** The count of the max battles' screenshots of a review folder (`reviewSummary`'s `max`). */
+function maxSummary(records: readonly ReviewRecord[]): MaxReviewSummary {
+  const summary: MaxReviewSummary = {
+    records: 0,
+    byUse: {},
+    byDecision: {},
+    right: 0,
+    wrong: 0,
+    elements: { spot: {}, time: {}, tier: {}, boss: {} },
+    doubts: {},
+  };
+  for (const record of records) {
+    const { max } = record;
+    if (!max) continue;
+    summary.records++;
+    add(summary.byUse, record.use);
+    add(summary.byDecision, record.decision.kind);
+    for (const doubt of max.doubts) add(summary.doubts, doubt);
+    const wrongs = record.feedback.filter((f) => f.verdict === 'wrong');
+    if (wrongs.length === 0) {
+      if (record.feedback.length > 0) summary.right++;
+      continue;
+    }
+    summary.wrong++;
+    const elements = new Set(wrongs.flatMap((f) => (f.verdict === 'wrong' ? f.elements : [])));
+    for (const element of elements) {
+      if (element in summary.elements) {
+        add(summary.elements[element as MaxFeedbackElement], maxWrongAt(element, max));
+      }
+    }
+  }
+  return summary;
+}
+
+export function reviewSummary(all: readonly ReviewRecord[]): ReviewSummary {
+  // A max battle's screenshot is counted apart, by its own report (plan 8X-S).
+  const records = all.filter((record) => !record.max);
   const summary: ReviewSummary = {
     records: records.length,
     byUse: {},
     byDecision: {},
     right: 0,
     wrong: 0,
-    elements: { gym: {}, time: {}, stage: {}, tier: {}, boss: {} },
+    elements: { gym: {}, time: {}, stage: {}, tier: {}, boss: {}, spot: {} },
     doubts: {},
     nicknames: [],
     corrections: [],
+    max: maxSummary(all),
   };
   const corrected = new Map<string, { read: string; correction: string; times: number }>();
   for (const record of records) {
@@ -142,6 +249,7 @@ export function reviewSummary(records: readonly ReviewRecord[]): ReviewSummary {
       corrected.set(key, seen);
     }
   }
+  for (const record of all) if (record.max) summary.corrections.push(...correctionsOf(record));
   summary.nicknames = [...corrected.values()]
     .filter((pair) => pair.times >= 2)
     .sort((a, b) => b.times - a.times);
diff --git a/src/domain/ocr/screenshot-record.ts b/src/domain/ocr/screenshot-record.ts
index f4578dc9002bec03ccfc8ec7d957e093bcafe468..9cc869e53d3c1dcf11218a7751e806f8359ed6ab 100644
--- a/src/domain/ocr/screenshot-record.ts
+++ b/src/domain/ocr/screenshot-record.ts
@@ -46,10 +46,17 @@ export type ScreenshotUse = (typeof SCREENSHOT_USES)[number];
 export type StoredDecision =
   { kind: 'report' } | { kind: 'ask'; doubts: string[] } | { kind: 'refuse'; reason: string };
 
-/** The elements a member may say were wrong. */
-export const FEEDBACK_ELEMENTS = ['gym', 'time', 'stage', 'tier', 'boss'] as const;
+/** The elements a member may say were wrong (`spot`: a max battle's Power Spot, plan 8X-S). */
+export const FEEDBACK_ELEMENTS = ['gym', 'time', 'stage', 'tier', 'boss', 'spot'] as const;
 export type FeedbackElement = (typeof FEEDBACK_ELEMENTS)[number];
 
+/** Those of a raid's screen. */
+export const RAID_FEEDBACK_ELEMENTS = ['gym', 'time', 'stage', 'tier', 'boss'] as const;
+
+/** Those of a max battle's screen (plan 8X-S): no gym, no egg. */
+export const MAX_FEEDBACK_ELEMENTS = ['spot', 'time', 'tier', 'boss'] as const;
+export type MaxFeedbackElement = (typeof MAX_FEEDBACK_ELEMENTS)[number];
+
 /** A member's correction is at most this long. */
 export const MAX_CORRECTION = 500;
 
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index ec5027a7a107c5dbc4579cd15ba6ea40009a611b..cfbff3a8aa208dfcccc7cd8cf6c8a8956222f1b9 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -146,10 +146,8 @@ export const SHOT_COLOUR = 0xf1c40f;
 const READING_ROOM = 1_800;
 const DOUBTS_ROOM = 1_200;
 
-/** What a message about a screenshot shows (`screenshotMessage`). */
-export interface ScreenshotView {
-  report: StoredReport;
-  gymName: GymNamer;
+/** What a message about a screenshot shows beside its reading (`screenshotMessage`). */
+interface ShotView {
   /** What Pine did, or would do, with it (`decisionWords`). */
   decision: string;
   /** The question under it ("Did I read it right?"); none when nothing can be answered. */
@@ -160,6 +158,17 @@ export interface ScreenshotView {
   buttons?: readonly APIButtonComponent[] | undefined;
 }
 
+/** What a message about a raid's screenshot shows (`screenshotMessage`). */
+export interface ScreenshotView extends ShotView {
+  report: StoredReport;
+  gymName: GymNamer;
+}
+
+/** What a message about a max battle's screenshot shows (`maxScreenshotMessage`, plan 8X-S). */
+export interface MaxScreenshotView extends ShotView {
+  report: StoredMaxReport;
+}
+
 /**
  * What a screenshot showed Pine as a components-v2 message (`/read-screenshot`, Screenshot
  * feedback; plan 8B-4): one container of `SHOT_COLOUR`, what was read beside the screenshot
@@ -168,17 +177,33 @@ export interface ScreenshotView {
  */
 export function screenshotMessage(view: ScreenshotView): V2Message {
   const { report } = view;
-  const read = cutMarkdown(
-    readingLines(report, view.gymName, { doubts: false }).join('\n'),
-    READING_ROOM,
+  return shotMessage(
+    view,
+    readingLines(report, view.gymName, { doubts: false }),
+    report.doubts.map((doubt) => doubtWords(doubt, report.clock)),
   );
+}
+
+/** `screenshotMessage` of a max battle's screenshot (plan 8X-S): its own reading and doubts. */
+export function maxScreenshotMessage(view: MaxScreenshotView): V2Message {
+  const { report } = view;
+  return shotMessage(
+    view,
+    maxReadingLines(report, { doubts: false }),
+    report.doubts.map((doubt) => maxDoubtWords(doubt, report.clock)),
+  );
+}
+
+function shotMessage(
+  view: ShotView,
+  lines: readonly string[],
+  doubtTexts: readonly string[],
+): V2Message {
+  const read = cutMarkdown(lines.join('\n'), READING_ROOM);
   const doubts =
-    report.doubts.length === 0
+    doubtTexts.length === 0
       ? undefined
-      : cutMarkdown(
-          `-# Not sure: ${report.doubts.map((doubt) => doubtWords(doubt, report.clock)).join(' ')}`,
-          DOUBTS_ROOM,
-        );
+      : cutMarkdown(`-# Not sure: ${doubtTexts.join(' ')}`, DOUBTS_ROOM);
   const buttons = view.buttons ?? [];
   return {
     v2: true,
````

### Task 9: 8X-S 9: Power Spot capitalized across Pine

Prototype commit: `cd11c5a83701d7e9f92df27b9a2c84a6b84b167c`

Matt, 2026-10-23: "Power Spot" as the game writes it wherever members,
staff or admins read it, but the pin's name "Unlisted power spot".

- The kind's word after a place's name (PLACE_KIND_WORDS: autocomplete,
  pins near a place, /places), "(Power Spot)" in /where, the max post's
  Where, trains' stops (stopLabel, the route, answers and announcements),
  "Unknown Power Spot" for a gone stop, the stops taken off a route.
- MAX_NO_GYM (/request, /target), /meetup's refusal, /wild near:'s option
  and help, /route and /train's descriptions, help and refusals, the
  Power Spot no longer kept (activity), the moderators' "Posted already"
  notice, /region edit's help.
- /gym import's preview and refusals, /gym review's kind words, the gym
  list summary ("The PokéStops and Power Spots changed").
- The web: the map's refusals (max-routes), a train's stop names in the
  page (parties, train-forms), the region editor's counts, fix lines and
  layer "Power Spots".
- Left lower-case: "unlisted power spot" in running text (it names the pin,
  as task 6 kept it), party-state's internal validation error, comments
  not otherwise touched. Comments that quote a changed text follow it.
- Tests assert the new texts; docs/guides and docs/architecture capitalized;
  the unrun staging checklists (8W-2, 8X-3, 8X-4, 8X-5, 8X-G) quote the
  new texts.

**Files:**

```
 docs/architecture/gyms-and-regions.md                        |  6 ++---
 docs/architecture/history.md                                 | 10 ++++-----
 docs/architecture/meetup-safety.md                           |  4 ++--
 docs/architecture/notifications-and-dms.md                   |  2 +-
 docs/architecture/parties-and-posts.md                       | 12 +++++-----
 docs/architecture/testing.md                                 | 10 ++++-----
 docs/architecture/trains.md                                  | 20 ++++++++---------
 docs/architecture/utilities.md                               |  2 +-
 docs/architecture/wayfarer.md                                |  6 ++---
 docs/architecture/web.md                                     | 22 +++++++++----------
 docs/guides/migrating-a-legacy-instance.md                   |  2 +-
 docs/guides/new-instance.md                                  |  4 ++--
 docs/superpowers/plans/2026-10-16-phase-8w2-staging.md       |  2 +-
 docs/superpowers/plans/2026-10-21-phase-8x3-staging.md       |  4 ++--
 docs/superpowers/plans/2026-10-21-phase-8x4-staging.md       |  6 ++---
 docs/superpowers/plans/2026-10-22-phase-8x5-staging.md       |  2 +-
 docs/superpowers/plans/2026-10-22-phase-8xg-staging.md       |  2 +-
 src/commands/gyms/import.test.ts                             | 12 +++++-----
 src/commands/gyms/import.ts                                  |  8 +++----
 src/commands/gyms/review.test.ts                             |  4 ++--
 src/commands/gyms/review.ts                                  |  4 ++--
 src/commands/max/in-max.test.ts                              |  8 +++----
 src/commands/max/max-report.test.ts                          |  8 +++----
 src/commands/max/max-report.ts                               |  2 +-
 src/commands/max/max.test.ts                                 | 26 +++++++++++-----------
 src/commands/meetups/meetup.test.ts                          |  2 +-
 src/commands/meetups/meetup.ts                               |  2 +-
 src/commands/notifications/targets.test.ts                   |  4 ++--
 src/commands/notifications/wild.test.ts                      | 16 +++++++-------
 src/commands/notifications/wild.ts                           |  4 ++--
 src/commands/parties/status.ts                               |  6 ++---
 src/commands/regions/edit.ts                                 |  2 +-
 src/commands/trains/route.test.ts                            | 62 ++++++++++++++++++++++++++--------------------------
 src/commands/trains/route.ts                                 | 16 +++++++-------
 src/commands/trains/train-changes.ts                         |  2 +-
 src/commands/trains/train.test.ts                            |  2 +-
 src/commands/trains/train.ts                                 |  6 ++---
 src/commands/util/request.test.ts                            |  4 ++--
 src/db/migrations/2026_10_21_026_train_spot_stops.db.test.ts |  2 +-
 src/db/repositories/history-recording.db.test.ts             |  4 ++--
 src/db/repositories/party-repository.db.test.ts              |  2 +-
 src/db/repositories/saved-route-repository.db.test.ts        |  2 +-
 src/db/repositories/saved-route-text.test.ts                 |  2 +-
 src/domain/history/party-history.test.ts                     |  4 ++--
 src/domain/party/max.test.ts                                 |  6 ++---
 src/domain/party/max.ts                                      |  2 +-
 src/domain/party/stops.test.ts                               |  6 ++---
 src/domain/search/place-merge.test.ts                        |  2 +-
 src/domain/wayspots/keep.test.ts                             |  4 ++--
 src/domain/wayspots/match.test.ts                            |  6 ++---
 src/domain/web/party-view.test.ts                            |  2 +-
 src/render/activity.ts                                       |  2 +-
 src/render/gym-summary.test.ts                               | 16 +++++++-------
 src/render/gym-summary.ts                                    |  8 +++----
 src/render/max-post.test.ts                                  | 12 +++++-----
 src/render/max-post.ts                                       |  4 ++--
 src/render/moderation.ts                                     |  2 +-
 src/render/notify-dm.test.ts                                 |  2 +-
 src/render/place.ts                                          |  2 +-
 src/render/text.test.ts                                      |  4 ++--
 src/render/train-stops.ts                                    | 14 ++++++------
 src/services/gym-admin-service.test.ts                       |  6 ++---
 src/services/meetup-safety.test.ts                           |  2 +-
 src/services/moderation-reports.test.ts                      |  2 +-
 src/services/notify-service.max.test.ts                      |  2 +-
 src/services/party-store.max.test.ts                         |  2 +-
 src/services/place-finder.test.ts                            |  4 ++--
 src/services/spawn-service.test.ts                           |  2 +-
 src/services/train-service.spots.test.ts                     | 16 +++++++-------
 src/services/train-service.ts                                |  8 +++----
 src/services/wayfarer-import-service.test.ts                 |  4 ++--
 src/web/client/editor-view.test.ts                           |  4 ++--
 src/web/client/editor-view.ts                                |  4 ++--
 src/web/client/editor.ts                                     |  2 +-
 src/web/client/parties.test.ts                               |  4 ++--
 src/web/client/parties.ts                                    |  4 ++--
 src/web/client/train-forms.test.ts                           |  6 ++---
 src/web/client/train-forms.ts                                |  2 +-
 src/web/max-options.test.ts                                  |  2 +-
 src/web/max-report.test.ts                                   |  6 ++---
 src/web/max-routes.ts                                        |  4 ++--
 src/web/meetup-make.test.ts                                  |  4 ++--
 src/web/train-route.test.ts                                  |  4 ++--
 83 files changed, 260 insertions(+), 260 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/gyms/import.test.ts src/commands/gyms/review.test.ts src/commands/max/in-max.test.ts src/commands/max/max-report.test.ts src/commands/max/max.test.ts src/commands/meetups/meetup.test.ts src/commands/notifications/targets.test.ts src/commands/notifications/wild.test.ts src/commands/trains/route.test.ts src/commands/trains/train.test.ts src/commands/util/request.test.ts src/db/repositories/saved-route-text.test.ts src/domain/history/party-history.test.ts src/domain/party/max.test.ts src/domain/party/stops.test.ts src/domain/search/place-merge.test.ts src/domain/wayspots/keep.test.ts src/domain/wayspots/match.test.ts src/domain/web/party-view.test.ts src/render/gym-summary.test.ts src/render/max-post.test.ts src/render/notify-dm.test.ts src/render/text.test.ts src/services/gym-admin-service.test.ts src/services/meetup-safety.test.ts src/services/moderation-reports.test.ts src/services/notify-service.max.test.ts src/services/party-store.max.test.ts src/services/place-finder.test.ts src/services/spawn-service.test.ts src/services/train-service.spots.test.ts src/services/wayfarer-import-service.test.ts src/web/client/editor-view.test.ts src/web/client/parties.test.ts src/web/client/train-forms.test.ts src/web/max-options.test.ts src/web/max-report.test.ts src/web/meetup-make.test.ts src/web/train-route.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cd11c5a83701d7e9f92df27b9a2c84a6b84b167c -- docs/architecture/gyms-and-regions.md docs/architecture/history.md docs/architecture/meetup-safety.md docs/architecture/notifications-and-dms.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/trains.md docs/architecture/utilities.md docs/architecture/wayfarer.md docs/architecture/web.md docs/guides/migrating-a-legacy-instance.md docs/guides/new-instance.md docs/superpowers/plans/2026-10-16-phase-8w2-staging.md docs/superpowers/plans/2026-10-21-phase-8x3-staging.md docs/superpowers/plans/2026-10-21-phase-8x4-staging.md docs/superpowers/plans/2026-10-22-phase-8x5-staging.md docs/superpowers/plans/2026-10-22-phase-8xg-staging.md src/commands/gyms/import.test.ts src/commands/gyms/import.ts src/commands/gyms/review.test.ts src/commands/gyms/review.ts src/commands/max/in-max.test.ts src/commands/max/max-report.test.ts src/commands/max/max-report.ts src/commands/max/max.test.ts src/commands/meetups/meetup.test.ts src/commands/meetups/meetup.ts src/commands/notifications/targets.test.ts src/commands/notifications/wild.test.ts src/commands/notifications/wild.ts src/commands/parties/status.ts src/commands/regions/edit.ts src/commands/trains/route.test.ts src/commands/trains/route.ts src/commands/trains/train-changes.ts src/commands/trains/train.test.ts src/commands/trains/train.ts src/commands/util/request.test.ts src/db/migrations/2026_10_21_026_train_spot_stops.db.test.ts src/db/repositories/history-recording.db.test.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/saved-route-repository.db.test.ts src/db/repositories/saved-route-text.test.ts src/domain/history/party-history.test.ts src/domain/party/max.test.ts src/domain/party/max.ts src/domain/party/stops.test.ts src/domain/search/place-merge.test.ts src/domain/wayspots/keep.test.ts src/domain/wayspots/match.test.ts src/domain/web/party-view.test.ts src/render/activity.ts src/render/gym-summary.test.ts src/render/gym-summary.ts src/render/max-post.test.ts src/render/max-post.ts src/render/moderation.ts src/render/notify-dm.test.ts src/render/place.ts src/render/text.test.ts src/render/train-stops.ts src/services/gym-admin-service.test.ts src/services/meetup-safety.test.ts src/services/moderation-reports.test.ts src/services/notify-service.max.test.ts src/services/party-store.max.test.ts src/services/place-finder.test.ts src/services/spawn-service.test.ts src/services/train-service.spots.test.ts src/services/train-service.ts src/services/wayfarer-import-service.test.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/train-forms.test.ts src/web/client/train-forms.ts src/web/max-options.test.ts src/web/max-report.test.ts src/web/max-routes.ts src/web/meetup-make.test.ts src/web/train-route.test.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-S 9: Power Spot capitalized across Pine`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index ef27ca47bb53197b9bb684aea7a5cab49405e994..29263542392aee6710c1f582ecfbcc18dd834393 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -4,9 +4,9 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 
 ## Finding gyms and regions
 
-- Gyms are found through `ctx.gyms` (`search(channelId, text, { limit })`, `get`, `isRegion`, `regionsOf`, `inRegion`): all gyms are held in memory by `GymDirectory`. A hit says where it lies (`place`: `local`, `neighbouring`, `anywhere`), whether every word matched (`allWords`; false means a guess), whether a word had to be read as a misspelling (`corrected`) and how far the reading is (`typos`, `typoCost` of `src/domain/search/text.ts`: per typed word nothing as typed, a quarter for a word it only begins, else the fewest wrong letters, read by the words found in the gym's name, nickname or keywords, a word found only in its places, description or address costing 3: `namedReading`; a stop's or power spot's by its title, its street counting so): corrected matches and guesses come by how many typed words they lack (`missed` of `reading`: a guess that found more of the words first, whatever its misspellings), then by it, then by score (plan 8W-3: the score weighs a rare word high, so "libary" read as "Vicary" with two letters wrong came before the libraries with one). Act only on a clear hit; offer the rest as a choice. After a gym edit call `GymDirectory.refreshGym(id)`; after regions change, `load()`.
+- Gyms are found through `ctx.gyms` (`search(channelId, text, { limit })`, `get`, `isRegion`, `regionsOf`, `inRegion`): all gyms are held in memory by `GymDirectory`. A hit says where it lies (`place`: `local`, `neighbouring`, `anywhere`), whether every word matched (`allWords`; false means a guess), whether a word had to be read as a misspelling (`corrected`) and how far the reading is (`typos`, `typoCost` of `src/domain/search/text.ts`: per typed word nothing as typed, a quarter for a word it only begins, else the fewest wrong letters, read by the words found in the gym's name, nickname or keywords, a word found only in its places, description or address costing 3: `namedReading`; a stop's or Power Spot's by its title, its street counting so): corrected matches and guesses come by how many typed words they lack (`missed` of `reading`: a guess that found more of the words first, whatever its misspellings), then by it, then by score (plan 8W-3: the score weighs a rare word high, so "libary" read as "Vicary" with two letters wrong came before the libraries with one). Act only on a clear hit; offer the rest as a choice. After a gym edit call `GymDirectory.refreshGym(id)`; after regions change, `load()`.
 - `ctx.regions` (`RegionDirectory`) has the regions by id, channel and forum; `GymDirectory` holds its own copy, so after a region changes load both. Every change to what either directory holds bumps its `generation` (`GymDirectory`: every load, gym re-read or forgotten; `RegionDirectory`: every load): the web map's cache (`GeoCache`, `web.md`) rebuilds a server's view only when a generation differs, so a new way of changing either directory's state must bump it too, or the map keeps showing the old state. `regionChannelOf` also answers for a region's forum and a post in it. `ctx.users.get(snowflake)` gives a member's settings.
-- Gyms, PokéStops and power spots together are found through `ctx.placeFinder` (`PlaceFinder`, `src/services/place-finder.ts`; plan 8W-2, Matt's rules of 2026-10-15): the server's gyms through the gym search (`GymLookupOptions.within`, the gyms of its regions: a gym elsewhere with every word leaves the server's guesses alone; `PlaceFinder` takes what it needs of `GymDirectory` by `Pick`, and `GymProvider` has no `all()`), the stops (the kept Wayspots and, plan 8R-1, the stops of Pine's own that staff add with `/pokestop`, `stop-reports.md`) and power spots each through a `WayspotIndex` of their own (`src/domain/search/wayspot-index.ts`: title, and counting little the street and town; every word as typed or as a beginning; one letter wrong only when nothing matched as typed, or when a word as typed looks misspelt (a word one letter off is in at least `MISSPELT_TITLES` 3 titles and three times as many as it: "Little Free Libary" beside the libraries, plan 8W-3), whose corrections then follow its hits as typed; guesses by some words only when nothing else matched; common words weigh little by MiniSearch's BM25, the legacy stop words not at all), never one mixed index; merged by `mergePlaces` (`place-merge.ts`: `placeFit` exact, word, beginning, loose, guess, the guesses by `guessRank` across kinds (fewer typed words missed first, then the fewest letters read wrong); then the member's region; then gym, stop, power spot; then fewer title words beyond those typed, `extraWords`, counted in the name the fit came from (`placeFitBy`: a gym's name or nickname), tuned on Pittsburgh's export; then score). Only what lies in a region of the server is found (`find`, `chosen(value)`); a choice says where it is (`where`: its street, or "near <gym>", the nearest of the server's gyms within `NEAR_GYM_METRES` 1 km, never the place itself; with none so near, nothing); a value is `<kind>:<id>` (`placeValue`, `readPlaceValue`); typed text is acted on only through `clearOf(found)`, of the list one `find` gave (`clearPlace`: the one hit, of every kind and region, whose every word matched exactly, `exact` or `word`; one that names it outright beside another with every word is no clear hit). The indexes are built after every change of what the Wayspots are (`ctx.wayspots.contentGeneration`, told by `whenChanged`: a load; not a change of the regions, nor a forget: a forgotten Wayspot is passed over at once because the search takes only what `inRegion` has) in a turn of their own (`setImmediate`, about half a second for a city), never inside a search: a search before the first build finds the gyms alone, one after a load what was built until the new build is done; `built()` waits for a build that is due (tests).
+- Gyms, PokéStops and Power Spots together are found through `ctx.placeFinder` (`PlaceFinder`, `src/services/place-finder.ts`; plan 8W-2, Matt's rules of 2026-10-15): the server's gyms through the gym search (`GymLookupOptions.within`, the gyms of its regions: a gym elsewhere with every word leaves the server's guesses alone; `PlaceFinder` takes what it needs of `GymDirectory` by `Pick`, and `GymProvider` has no `all()`), the stops (the kept Wayspots and, plan 8R-1, the stops of Pine's own that staff add with `/pokestop`, `stop-reports.md`) and Power Spots each through a `WayspotIndex` of their own (`src/domain/search/wayspot-index.ts`: title, and counting little the street and town; every word as typed or as a beginning; one letter wrong only when nothing matched as typed, or when a word as typed looks misspelt (a word one letter off is in at least `MISSPELT_TITLES` 3 titles and three times as many as it: "Little Free Libary" beside the libraries, plan 8W-3), whose corrections then follow its hits as typed; guesses by some words only when nothing else matched; common words weigh little by MiniSearch's BM25, the legacy stop words not at all), never one mixed index; merged by `mergePlaces` (`place-merge.ts`: `placeFit` exact, word, beginning, loose, guess, the guesses by `guessRank` across kinds (fewer typed words missed first, then the fewest letters read wrong); then the member's region; then gym, stop, Power Spot; then fewer title words beyond those typed, `extraWords`, counted in the name the fit came from (`placeFitBy`: a gym's name or nickname), tuned on Pittsburgh's export; then score). Only what lies in a region of the server is found (`find`, `chosen(value)`); a choice says where it is (`where`: its street, or "near <gym>", the nearest of the server's gyms within `NEAR_GYM_METRES` 1 km, never the place itself; with none so near, nothing); a value is `<kind>:<id>` (`placeValue`, `readPlaceValue`); typed text is acted on only through `clearOf(found)`, of the list one `find` gave (`clearPlace`: the one hit, of every kind and region, whose every word matched exactly, `exact` or `word`; one that names it outright beside another with every word is no clear hit). The indexes are built after every change of what the Wayspots are (`ctx.wayspots.contentGeneration`, told by `whenChanged`: a load; not a change of the regions, nor a forget: a forgotten Wayspot is passed over at once because the search takes only what `inRegion` has) in a turn of their own (`setImmediate`, about half a second for a city), never inside a search: a search before the first build finds the gyms alone, one after a load what was built until the new build is done; `built()` waits for a build that is due (tests).
 - Whether a gym belongs to a server is decided by the row of its region, never by the channel cache: `gymRegionsInGuild` / `gymInGuild` (`src/services/region-directory.ts`). A region without a `guildId` belongs to no server.
 
 ## Maps
@@ -30,7 +30,7 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 - The views of a gym are components-v2 messages of `GYM_COLOUR` (`renderGymView`, staff: the heading `### [Name (Nickname)](<place>)`, the address Google gave and `regionsSentence`, the map, the description, `**Notice**`, `**Keywords:**`, `**Gym targets:**`, `**Elite raid gym:**`, `**Nearest gym:**`, nearby places and `Gym #<id> · <lat>, <lon>` in small print, a Map button; `renderMemberGymView` for `/find-gym`: no elite mark, the regions, the map, the description, the notice, **Raids now**, `Gym #<id>`, a Map button); every text is cut to its room (`SHOWN`, `HEADING`) so that the worst case is within `TEXT_BUDGET`: what staff or Google wrote is cut before it is escaped, the lines above a view are kept whole while they fit (`fitLines`, "…and N more lines"; a first line too long by itself is cut by `cutMarkdown`, `src/render/text.ts`, which never cuts inside a code span, a link, a mention or an escape and takes out an emphasis marker left open: finished markdown, plan 8W-3), and `namesakeNote` names its namesakes within `NAMESAKES_SHOWN`. Every message of the `/gym` flows is v2 from first to last (`gymQuestion` for questions and answers, `gymViewMessage(ctx, place, gym, lines, controls)` for a view with what a change did above it, `answerGym` and `sayGym` to show them); the answer of a change has no buttons but the Map link. Tests read them with `said` (the sentences above a view), `gymViewOf` (title, lines, facts, small print, pictures) and `gymOf` (`test/support/gym-commands.ts`).
 - The view of `/gym show` has Edit…, Make elite / Not elite, Move… and Delete… beside its Map link (`viewControls`, `src/commands/gyms/view-controls.ts`): the custom-id kind `gymview`, `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0` (what Make elite / Not elite sets, so that a view drawn before somebody else changed the mark does what its label says), the form `gymview:<gym id>:place` (titled by the gym's tidied name, cut to 38) and the dialog of a deletion `gymview:<gym id>:delete`, nothing kept in memory, the guard of `/gym` and no throttle (as `/gym`), a gym gone or out of reach refused with `VIEW_GONE`. Edit… opens the form of `/gym edit` (`openEditForm`, `fromView`: its answer is a message of its own and the view stays; a refusal of it too, and the form opened again from that refusal is answered in its place); Make elite sets the mark and shows the view anew in place with what it did and the buttons as they now are (a gym gone during the press is said in the view's place); Move… opens a form of one input read by `readLocation` and answers as `/gym move` does (`moveGymTo`) in a private message of its own (`deferReply`, then `answerGym`); Delete… opens the dialog of `/gym delete` (plan 8Q; below), not deferred before it.
 - `/gym delete` and Delete… ask in a dialog (plan 8Q, `deleteDialog` in `src/commands/gyms/delete.ts`): titled `Delete a gym`, today's question (`Delete **Name** (#6)? This cannot be undone.`, then `Nothing refers to it.` or `With it go:` and its lines) and `Submit deletes it.`; the gym and what refers to it (`GymAdminService.references`) read within `DIALOG_READ_MS` (`readInTime`); a raid at the gym refused privately, without a dialog. `/gym delete` declares no `defer`. The dialog carries only the gym's number (`gymview:<gym id>:delete`, a `modal` of `gymViewControls`, the guard of `/gym`): nothing is kept in `pendingGyms`. Its Submit (`deleteGymNow`) is acknowledged privately and decides everything again (`GymAdminService.delete`: a gym gone or of another server's regions only is `That gym no longer exists.`, also for a second Submit; a raid reported since keeps it), answering in a message of its own. Discord's Cancel replaces Keep; the buttons of the question before plan 8Q (`gym:<token>:delete|cancel`) find no request and say that it expired.
-- A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced. What changes the gym list in bulk (a Wayfarer import, the answers of its review queue, the deletion of the gyms beyond a scanned area) is one summary instead (`gymListSummary`, `src/render/gym-summary.ts`: what changed, never what made it (Matt, 2026-10-16), "Professor Pine has added 30 gyms, renamed 1, and moved 1.", the serial comma before the last of three or more; then, for an import, what it changed of the PokéStops and power spots, "It also added 120 PokéStops and 3 power spots, changed 4 PokéStops, and removed 2 power spots." (`wayfarer.md`), alone under the heading "The PokéStops and power spots changed" when no gym changed; counts of nothing are left out; a name changed only in spaces or capitals, `tidiesName`, is no rename): `GymAdminService.batch(place, source, work)` posts its summary at the end, the review's (`source` `review`, also `delete(…, 'review')`) gathered per server and posted `REVIEW_SUMMARY_MS` after the last answer (`flush` posts what waits; a crash loses the counts of those minutes, the changes themselves stand: ruled in plan 8W-3 not to keep them in the database, which would take a migration, a repository and its twin, and a timer taken up at start with the place of the summary for a post that only counts what members can see on the map and the posts). One gym added alone is `gymAnnouncement(gym, regions, map)`, a components-v2 message with its map (Matt, 2026-10-15: like `/find-gym`; `GymAdminOptions.maps`, fetched only once a channel was found, the announcement going without it when it fails); a deletion is `gymRemovedLine`. `announce` takes the messages to try in order: one Discord refuses (a file where the bot may not attach files, a map file gone) is followed by the next (the gym without its map); the map is fetched only once a channel was found, and a gym gone by then is not announced. The fake gateway's `refuseFiles` refuses a sent message with files.
+- A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced. What changes the gym list in bulk (a Wayfarer import, the answers of its review queue, the deletion of the gyms beyond a scanned area) is one summary instead (`gymListSummary`, `src/render/gym-summary.ts`: what changed, never what made it (Matt, 2026-10-16), "Professor Pine has added 30 gyms, renamed 1, and moved 1.", the serial comma before the last of three or more; then, for an import, what it changed of the PokéStops and Power Spots, "It also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots." (`wayfarer.md`), alone under the heading "The PokéStops and Power Spots changed" when no gym changed; counts of nothing are left out; a name changed only in spaces or capitals, `tidiesName`, is no rename): `GymAdminService.batch(place, source, work)` posts its summary at the end, the review's (`source` `review`, also `delete(…, 'review')`) gathered per server and posted `REVIEW_SUMMARY_MS` after the last answer (`flush` posts what waits; a crash loses the counts of those minutes, the changes themselves stand: ruled in plan 8W-3 not to keep them in the database, which would take a migration, a repository and its twin, and a timer taken up at start with the place of the summary for a post that only counts what members can see on the map and the posts). One gym added alone is `gymAnnouncement(gym, regions, map)`, a components-v2 message with its map (Matt, 2026-10-15: like `/find-gym`; `GymAdminOptions.maps`, fetched only once a channel was found, the announcement going without it when it fails); a deletion is `gymRemovedLine`. `announce` takes the messages to try in order: one Discord refuses (a file where the bot may not attach files, a map file gone) is followed by the next (the gym without its map); the map is fetched only once a channel was found, and a gym gone by then is not announced. The fake gateway's `refuseFiles` refuses a sent message with files.
 
 ## Regions
 
diff --git a/docs/architecture/history.md b/docs/architecture/history.md
index 0d5a9cb01d872f8e59c994dae232eb1f480b8090..e766fc04fbe7450df164b208ab85f890abf26b59 100644
--- a/docs/architecture/history.md
+++ b/docs/architecture/history.md
@@ -7,11 +7,11 @@ Every party that ends is kept in relational tables beside the live `Party` table
 - `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train`, `meetup` or `max` (a max battle, plan 8X-3). Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; a max battle's `D1` to `D5` or `G`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end, not by a split); `routeStops` (a train's route at the end); `trainKind` (migration 026, below); `splitFromId` (migration 020, below).
 - `PartyHistoryAttendee`: a row per member who signed up, in the order they did (`seq`): `memberId` only with their opt-in, else null (the row still counts); `status` at the end (null: they left before it), `furthest` (`interested`, `joined`, `here`, `done`; asked whether they completed it counts as `here`), `groupId`, `extras`, `remote`, `team`, and the times the bot saw (`signedUpAt`, `joinedAt`: first coming or further, `hereAt`, `doneAt`, `leftAt`; null in the legacy history); `splitOff` (migration 020: 1 for a member who left with a group split off the train, 0 otherwise).
 - `PartyHistoryGroup`: a row per group: `label`, `meetingTime` (the last one set, also after the clock cleared it; the steps of a group's meeting time name it by its letter and when it was opened, `B:<stamp>`, plan 8X-1B, since a group nobody is in goes and a later one may take its letter: a pruned B's time is never a new B's; a step of before the stamps names the letter alone and counts for that letter), `members` and `heads` at the end.
-- `PartyHistoryStop`: a row per stop a train made, in order (`seq`; a loop makes a gym's stop twice): `gymId` (null where the gym list no longer has it, with `legacyGymId`; null for a power spot), `wayspotId` (migration 026, plan 8X-4: the Wayfarer id of a power spot the train stopped at, null for a gym), `arrivedAt`, `leftAt` (null where not known: the first stop is reached at the train's start when it was laid earlier; a legacy train's stops have no times).
+- `PartyHistoryStop`: a row per stop a train made, in order (`seq`; a loop makes a gym's stop twice): `gymId` (null where the gym list no longer has it, with `legacyGymId`; null for a Power Spot), `wayspotId` (migration 026, plan 8X-4: the Wayfarer id of a Power Spot the train stopped at, null for a gym), `arrivedAt`, `leftAt` (null where not known: the first stop is reached at the train's start when it was laid earlier; a legacy train's stops have no times).
 - `HistoryOptIn`: a row per member and server (by snowflake, no foreign key) who opted in.
-- `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, a member who went with a group split off a train (`split`), where a train is (`stop`: its place, the gym or null at the end; `spot`, plan 8X-4: at a power spot, `subject` the bare Wayfarer id, `value` null, so that a spot is no end of the route), a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
+- `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, a member who went with a group split off a train (`split`), where a train is (`stop`: its place, the gym or null at the end; `spot`, plan 8X-4: at a Power Spot, `subject` the bare Wayfarer id, `value` null, so that a spot is no end of the route), a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
 - Migration 020 (plan 8T): `PartyHistory.splitFromId`, in the record of a train that was split off another, that train's `partyId` (`char(36)`, null otherwise, no foreign key: a link only, each train is recorded on its own; Matt, 2026-10-17), with an index (`partyhistory_splitfromid_index`: the trains split off a train); `PartyHistoryAttendee.splitOff` (`tinyint(1) not null default 0`, written from `HistoryAttendee.splitOff`), so that SQL tells a member who went with a group from one who left. Each is added only when it is missing. `kind` of a step is `varchar(8)` since 018 and takes `split` as it is.
-- Migration 025 (plan 8X-3): `PartyHistory.wayspotId` (`varchar(40)`, null), the Wayfarer id of a max battle's power spot, null for one at a pin (an "Unlisted power spot") and for every other party; no foreign key (a Wayspot an import deletes stays named by its id). Migration 026 (plan 8X-4) adds `PartyHistoryStop.wayspotId` the same way (`varchar(40)`, null, no foreign key, added only when missing), and `PartyHistory.trainKind` (`varchar(10)`, null, added only when missing): what a train went to, `raid`, `dynamax` or `gigantamax` (`HistoryRecord.trainKind`, `TrainParty.train.kind`; a legacy train is `raid`), null means the party is no train: 026 sets the trains recorded before it to `raid` (they all were), touching nothing else. A max battle has no `gymId`, its boss in the boss columns as a raid's, `shiny` as its post says it when it ends (`listedMaxBoss`: the max boss list's boss of its tier by catalogue entry or reported name; null where the list has none, final review X3-F4), and it took place (`completed`) when somebody completed it, as a raid. Added only when it is missing.
+- Migration 025 (plan 8X-3): `PartyHistory.wayspotId` (`varchar(40)`, null), the Wayfarer id of a max battle's Power Spot, null for one at a pin (an "Unlisted power spot") and for every other party; no foreign key (a Wayspot an import deletes stays named by its id). Migration 026 (plan 8X-4) adds `PartyHistoryStop.wayspotId` the same way (`varchar(40)`, null, no foreign key, added only when missing), and `PartyHistory.trainKind` (`varchar(10)`, null, added only when missing): what a train went to, `raid`, `dynamax` or `gigantamax` (`HistoryRecord.trainKind`, `TrainParty.train.kind`; a legacy train is `raid`), null means the party is no train: 026 sets the trains recorded before it to `raid` (they all were), touching nothing else. A max battle has no `gymId`, its boss in the boss columns as a raid's, `shiny` as its post says it when it ends (`listedMaxBoss`: the max boss list's boss of its tier by catalogue entry or reported name; null where the list has none, final review X3-F4), and it took place (`completed`) when somebody completed it, as a raid. Added only when it is missing.
 - `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its record was written, for what still reads them (below): no member, no party id. Its rows are kept for good, as the ended `Party` rows were before: the post can be reopened by a late message any time.
 - Text a member wrote (a train's or meetup's name, a meetup's description, a group's label) is kept with every member it names written `@member` (`withoutMembers`, `src/domain/history/party-history.ts`; mentions and bare ids of 17 to 20 digits, an emoji's tag stays), live and legacy alike.
 - `createdById` of a raid whose reporter asked not to be named in the post (`anonymous`) is kept all the same when the reporter opted in to the history: a statistic shown to others later must honour `anonymous`.
@@ -192,7 +192,7 @@ group by a.furthest
 order by field(a.furthest, 'interested', 'joined')
 ```
 
-Trains by length: stops on the route, stops made (at power spots too, plan 8X-4), the gyms among them, and minutes from the first arrival to the last departure.
+Trains by length: stops on the route, stops made (at Power Spots too, plan 8X-4), the gyms among them, and minutes from the first arrival to the last departure.
 
 ```sql trains-by-length
 select h.name, h.routeStops, count(s.seq) as stopsMade, count(distinct s.gymId) as gyms,
@@ -204,7 +204,7 @@ group by h.id, h.name, h.routeStops
 order by stopsMade desc, h.id
 ```
 
-The busiest gyms, for hot spots on the map: raids there and train stops made there, with where the gym is (a train's stop at a power spot is at no gym, and left out).
+The busiest gyms, for hot spots on the map: raids there and train stops made there, with where the gym is (a train's stop at a Power Spot is at no gym, and left out).
 
 ```sql busiest-gyms
 select g.id as gymId, g.name, g.lat, g.lon, count(*) as visits
diff --git a/docs/architecture/meetup-safety.md b/docs/architecture/meetup-safety.md
index 9608bb565d220d18f906b347d0cdd08f7de08253..917262ee920be144062abe9003bbec60adca98ce 100644
--- a/docs/architecture/meetup-safety.md
+++ b/docs/architecture/meetup-safety.md
@@ -4,7 +4,7 @@ A meetup at a place that might be private is held for a moderator before anythin
 
 ## The check
 
-- `meetupPlaceVerdict(check)` (`src/domain/meetups/safety.ts`, pure) answers `allowed`, `review`, `refused` or `blocked` from: whether the safety is `on`, the place (8D's `Place`: a gym, PokéStop or power spot as a snapshot, or a pin), whether the maker is `staff` (`isStaff`: admins, moderators, the owner), whether they are `blocked`, the server's `ruling` of the place, and the `flaggedWords`. In this order: off or staff, allowed (staff are never blocked); blocked; a pin, review (a pin has no ruling, and one given is ignored: an approval of a pin is for that meetup alone); a ruling `refuse`, refused; a ruling `allow`, allowed; a flagged title or other name (`otherTitles`), review; else allowed.
+- `meetupPlaceVerdict(check)` (`src/domain/meetups/safety.ts`, pure) answers `allowed`, `review`, `refused` or `blocked` from: whether the safety is `on`, the place (8D's `Place`: a gym, PokéStop or Power Spot as a snapshot, or a pin), whether the maker is `staff` (`isStaff`: admins, moderators, the owner), whether they are `blocked`, the server's `ruling` of the place, and the `flaggedWords`. In this order: off or staff, allowed (staff are never blocked); blocked; a pin, review (a pin has no ruling, and one given is ignored: an approval of a pin is for that meetup alone); a ruling `refuse`, refused; a ruling `allow`, allowed; a flagged title or other name (`otherTitles`), review; else allowed.
 - `MeetupSafety.verdict({ serverId, place, makerId, staff })` (`src/services/meetup-safety.ts`) is the shared check: it reads the block and the ruling from the storage (nothing for staff or while the safety is off), and for a gym its official name and nickname (`MeetupSafetyOptions.gyms`), either of which flags it. `/meetup`'s guard asks it; the making itself goes through `MeetupSafety.make` (below), which plan 8M-5M (meetups from the web map) calls too, and which may end in "sent to the moderators" (`held`) instead of a post.
 - Flagged words: `DEFAULT_FLAGGED_WORDS` (little free library, apartment(s), apts, apt, condo(s), condominium(s), townhome(s), townhouse(s), residence, private, salon, studio, LLC, daycare; not "home of", which public signs say) and `settings.meetupSafety.flaggedWords`, in lower case, each once (`flaggedWordsOf`); a word matches the place's title as a whole word (no letter or digit beside it; the words of a phrase across any white space), whatever the letter case (`flaggedWordIn`; the words of a list are one expression, made once per list). A gym's title is the name its post shows (the nickname first); its other name is checked too.
 - Rulings are kept per server by the place's kind and id (`rulingKeyOf`: a gym's number as text, a Wayspot's Wayfarer id); a pin has none.
@@ -14,7 +14,7 @@ A meetup at a place that might be private is held for a moderator before anythin
 
 - `/meetup name near start` (all required since 8S-1) is refused by its guards for everything that can be known before the form, so that a refusal does not count: no region or forum, a bad name, a member blocked in the server (`MeetupSafety.blocked`, asked before the place and the start are read, so that a blocked member hears of the block and not of a place or start they mistyped: `NO_MEETUPS_FOR_YOU`, with an Appeal button: `blockedRefusal`, a `UserError` with `answer`, which the router shows privately; the same before the form, on its submit and after a meetup made meanwhile), a place `namedPlace` cannot take, a start `typedTimedTime` cannot read for a meetup still to be made (`newPartyTimes('meetup', now)`), and the verdict (asked with `blocked: false`, the block not read twice): `refused` (`NO_MEETUP_HERE`, "A meetup can't be held there."), `review` with a start less than two hours ahead (`MEETUP_TOO_SOON`). Its throttle (`MEETUP_THROTTLE`, two a quarter of an hour) counts the command, so a form left unsent counts too, and requests count like meetups; a form whose work fails gives the use back (plan 8S-3: `carriesOn`; an unexpected error, a post the bot may not make, `MEETUP_NOT_SENT`: `discord-framework.md`), on the map too.
 - The guard keeps what it read for `execute` (a `WeakMap` by the interaction), so nothing is searched or checked twice before the form must open. The command then opens the form of the information (`meetupForm`, `infoInput` shared with `/info`: required here, at least one character; information of nothing but white space is refused, `NO_INFORMATION`), keeping what it was used with in a `PendingRequests` under the form's token for half an hour (`meetup:<token>:form`; a form open across a restart expires). On the submit (`meetupFormControls`) the reply is deferred privately and `MeetupSafety.make` does the rest, the one entry point for making a meetup with the safety (8M-5M's meetups from the web map call it too: the caller says whether the maker is `staff` and counts the use against its own throttle; a caller without Discord's answers has no Appeal button for a blocked maker and points them to `/meetup`). What the form does with the outcome is `makeMeetupAs` (each outcome in `/meetup`'s words), which the map calls too (`web.md`, "Meetups on the map"), and `refusalOf` is the verdict's refusal for `/meetup`'s guard and the map alike. It refuses a name or information a meetup cannot have (`bad-name`, `bad-description`, white space alone too), asks the verdict again (a ruling or block may have come meanwhile: `refused`, `blocked`), then: allowed, `PartyService.createMeetup` with the start and information (`MeetupRequest.startTime`, `.description`; the meetup is made with them, so one post and no line announcing a start), and `closeIfBlocked` after it (`posted`, with the party); review, `submit` (`held`, the member told `MEETUP_HELD`, never why; or `too-soon`, `not-sent`, `blocked`); `createMeetup`'s own refusals (`no-region`, `no-forum`, `no-post`) come out as they are. `MeetupSafety.closeIfBlocked({ serverId, makerId, partyId, staff })` looks for a block once more after a meetup is made (one that came after the check, whose sweep of the maker's meetups ran before this one was there; never for staff): it closes the meetup as Block member does (`closed`; `close-failed` when that fails, logged, the meetup still up; `false` when not blocked or the block cannot be read), and the member gets the blocked answer. Refusals of the form give the typed information back (`refusedWithText`).
-- A meetup is never at a power spot (Matt, 2026-10-17: they are poorly curated, and many are on private property such as home businesses): `/meetup near:` offers, finds and names a pin by gyms and PokéStops alone (`MEETUP_PLACE_KINDS`, `PlaceKindsOnly` in `src/commands/place-option.ts`) and refuses a picked power spot with `NO_POWER_SPOT`; `MeetupSafety.make` answers `power-spot` for one, staff too, before anything else, so the web map is held to it as well. A meetup stored before at a power spot stays as it is, and `meetupPlaceVerdict` still takes the kind.
+- A meetup is never at a Power Spot (Matt, 2026-10-17: they are poorly curated, and many are on private property such as home businesses): `/meetup near:` offers, finds and names a pin by gyms and PokéStops alone (`MEETUP_PLACE_KINDS`, `PlaceKindsOnly` in `src/commands/place-option.ts`) and refuses a picked Power Spot with `NO_POWER_SPOT`; `MeetupSafety.make` answers `power-spot` for one, staff too, before anything else, so the web map is held to it as well. A meetup stored before at a Power Spot stays as it is, and `meetupPlaceVerdict` still takes the kind.
 
 ## Requests and the moderators' post
 
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 63790514995a18c8fd1a9aec133b1e82f3bd48e0..7aca8d175d42d9b200510cabb5a2998b2d088b06 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -27,5 +27,5 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 - A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild` and by the live map (plan 8M-4S; `web.md`, "Spawns on the map") through one code path: `readSpawn` (`wild.ts`: the Pokémon and the details, as the command's guard and handler read them) and `reportSpawnAs` (`spawn-report.ts`: the report, the command's words, a report's link and a channel named by the caller's `SpawnNames`); a map report's point is its `near`, a pin (`PlaceFinder.pin`). The report is a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning); a message Discord refuses with Invalid Form Body is sent once more without its picture (the Unown copy too), and the DM says when the report goes away as the report does (`SpawnNews.goneAt`); deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
 - **Costumed spawns** (plan 8R-4, design 5, F11): a report is costumed when an event on at its moment lists that very entry costumed (`costumedSpawn`, `src/domain/time/spawn-events.ts`: the species' entry for a species, the form's for a form; listed plain and costumed both, costumed). The events are the global ones of ScrapedDuck's feed with spawns (`parseSpawnEventFeed`, read by `RaidEventService` with the research flags and kept in memory, `spawnEvents()`, `SpawnEventProvider`; one on now that a read drops is kept while it lasts): a community day's spawns (`extraData.communityday.spawns`) and a spotlight hour's (`extraData.spotlight.list`) from the feed, any other event the feed marks `generic.hasSpawns` from the Spawns section of its Leek Duck page (`parseEventSpawns`, `src/domain/research/leekduck.ts`). Only the types of an allowlist (`SPAWN_EVENT_TYPES`, Matt's R-M5 and Q2): `event`, `community-day`, `pokemon-spotlight-hour`, `pokemon-go-tour`, and the Global Wild Area and Global GO Fest (`wild-area` and `pokemon-go-fest`, `GLOBAL_ONLY`, whose feed name says Global, `GLOBAL_EDITION`: the feed has nothing firmer; a city's has `Z` times too, and the Global one must have none); never a city's Wild Area or GO Fest, a City Safari (location-bound), a season, a type the feed adds later, an event at fixed times of a zone of its own (`Z`: Pokémon Night Out), nor anything without hours or longer than 31 days. A page gives at most 100 Pokémon (B4); Leek Duck's free-text sentences ("you might also encounter X wearing …") are not read (B-D2, a follow-up). `EventSpawnService` (`src/services/event-spawn-service.ts`, `ctx.eventSpawns`, `EventSpawnProvider.sightingsAt(at)`: the listed Pokémon placed by `costumedSighting`) reads an event's page while it is on, again every six hours (`REREAD_MS`), with Pine's User-Agent and `readLimitedText`, only Leek Duck's events pages (`isEventPage`; another address is skipped and said once; never followed to another address, `redirect: 'error'`, and refused where the answer's `url` is no events page, B3), keeping the spawns of the last good read by event in a `BoundedMap`; a page never read gives none. It looks again at the next start of an event, at the latest in an hour (`nextReadIn`); `app.ts` starts it after the first read of the events feed and stops it at shutdown. `SpawnService` asks it at the report's moment (`costumes`; one that throws is logged and the report goes out plain): `SpawnView.costumed` ("### Wild costumed Pikachu", "A wild costumed **Pikachu**" in DMs), `SpawnNews.costumed` for the matchers, and the posted outcome's `costumed` for `/wild`'s and the map's answer ("Reported: a wild costumed Pikachu"). `/want`'s Costumes field shows for a Pokémon an event on lists costumed (`costumesShown`, review R7).
-- `/wild near:` (plan 8W-2) names a gym, PokéStop or power spot of the server's regions: the option's autocomplete is `ctx.placeFinder` (`nearChoices`: `placeLabel` "Fountain Square (PokéStop) · Market Street", the title cut and never where it is; the member's region first), resolved in the command's guard so that a refusal does not count (`namedPlace`, `src/commands/place-option.ts`: a value whose place is gone or of another kind now is `PLACE_GONE` "That place is gone from the list; pick it again.", one outside the regions `NOT_HERE`; typed text only on `clearOf` of the one search, the one hit of every word; resolved once per interaction (plan 8W-3: `resolvedPlaces`, a `WeakMap` by the interaction, so that the command takes what its guard found, one search in all), else "Which place is …?" with five suggestions); `details` stays required. A maps link or coordinates typed there are a pin (plan 8D, Matt, 2026-10-17; the option takes `MAX_PLACE_TEXT` 1,500 characters for long links, and its autocomplete offers nothing for one): `readPin` (`src/domain/geo/pin-input.ts`, pure, over `readLocation`: coordinates, `geo:` with a phone's label, Google Maps with the place's pin before the map's centre and `/place/<name>/` as `linkName`, Apple Maps `ll`, `coordinate`, `q` with coordinates, `sll` only on a map that asks for nothing (a search near a point, `q=coffee&sll=…`, is `no-point`, as Google’s search link), OpenStreetMap `mlat`/`mlon`, `#map=`) and `PlaceFinder.pin` (refused outside the server's regions, `PIN_NOT_HERE`; named by the nearest gym, PokéStop or power spot within 50 m); a short link (`maps.app.goo.gl`, `goo.gl/maps`, Apple's `maps.apple/p/…`, OpenStreetMap's `osm.org/go/…`) is refused with `SHORT_LINK` and never followed, a link of a maps site that shows no one place (a search, a Street View, `geo:0,0?q=<address>`) with `NO_POINT`, numbers that are no place with `NO_PLACE_ON_EARTH`; the autocomplete offers nothing for any of them. A pin is named by the nearest of the server's gyms (by its nickname, as its post) and of the kept PokéStops and power spots in the server's regions with a title. The option's helpers are `src/commands/place-option.ts` (`namedPlace`, `nearChoices`, `placeLabel`, `placeWords`), shared with `/meetup`. The report carries the place as a snapshot, `SpawnReport.near` (`SpawnPlace`, which is `Place`: never looked up again, the report is short-lived; a pin is `pinLine` without a label, `📍 Near **X** (PokéStop) · [Map](<…>)`, `📍 **<link's name>**` or `📍 Dropped pin`, without a picture): `nearLine` ("Near **<title>** (PokéStop) · <address> · [Map](<…>)": the address a gym's `addressLine`, a Wayspot's `wayspotAddressLine` (`wayfarer-address.ts`: as a gym made of it would show it, never the town, postal code and country Wayfarer repeats), "(no address available)" for none where the place's picture stands beside the line, so that the picture never sits beside a bare name (plan 8W-3: without the picture, in a DM's brief, a report sent again without pictures or the classic text, the address is left out; the moderators' post of a meetup request, `meetup-safety.ts`, words it by its own picture the same way); title and address through `plainNoLinks`) after the details under **Where**, with the place's picture beside them where `wayspotPicture` allows (the Pokémon's beside the head), in the sighting, the text report and the DM's brief alike; a message Discord refuses is sent once more without either picture.
+- `/wild near:` (plan 8W-2) names a gym, PokéStop or Power Spot of the server's regions: the option's autocomplete is `ctx.placeFinder` (`nearChoices`: `placeLabel` "Fountain Square (PokéStop) · Market Street", the title cut and never where it is; the member's region first), resolved in the command's guard so that a refusal does not count (`namedPlace`, `src/commands/place-option.ts`: a value whose place is gone or of another kind now is `PLACE_GONE` "That place is gone from the list; pick it again.", one outside the regions `NOT_HERE`; typed text only on `clearOf` of the one search, the one hit of every word; resolved once per interaction (plan 8W-3: `resolvedPlaces`, a `WeakMap` by the interaction, so that the command takes what its guard found, one search in all), else "Which place is …?" with five suggestions); `details` stays required. A maps link or coordinates typed there are a pin (plan 8D, Matt, 2026-10-17; the option takes `MAX_PLACE_TEXT` 1,500 characters for long links, and its autocomplete offers nothing for one): `readPin` (`src/domain/geo/pin-input.ts`, pure, over `readLocation`: coordinates, `geo:` with a phone's label, Google Maps with the place's pin before the map's centre and `/place/<name>/` as `linkName`, Apple Maps `ll`, `coordinate`, `q` with coordinates, `sll` only on a map that asks for nothing (a search near a point, `q=coffee&sll=…`, is `no-point`, as Google’s search link), OpenStreetMap `mlat`/`mlon`, `#map=`) and `PlaceFinder.pin` (refused outside the server's regions, `PIN_NOT_HERE`; named by the nearest gym, PokéStop or Power Spot within 50 m); a short link (`maps.app.goo.gl`, `goo.gl/maps`, Apple's `maps.apple/p/…`, OpenStreetMap's `osm.org/go/…`) is refused with `SHORT_LINK` and never followed, a link of a maps site that shows no one place (a search, a Street View, `geo:0,0?q=<address>`) with `NO_POINT`, numbers that are no place with `NO_PLACE_ON_EARTH`; the autocomplete offers nothing for any of them. A pin is named by the nearest of the server's gyms (by its nickname, as its post) and of the kept PokéStops and Power Spots in the server's regions with a title. The option's helpers are `src/commands/place-option.ts` (`namedPlace`, `nearChoices`, `placeLabel`, `placeWords`), shared with `/meetup`. The report carries the place as a snapshot, `SpawnReport.near` (`SpawnPlace`, which is `Place`: never looked up again, the report is short-lived; a pin is `pinLine` without a label, `📍 Near **X** (PokéStop) · [Map](<…>)`, `📍 **<link's name>**` or `📍 Dropped pin`, without a picture): `nearLine` ("Near **<title>** (PokéStop) · <address> · [Map](<…>)": the address a gym's `addressLine`, a Wayspot's `wayspotAddressLine` (`wayfarer-address.ts`: as a gym made of it would show it, never the town, postal code and country Wayfarer repeats), "(no address available)" for none where the place's picture stands beside the line, so that the picture never sits beside a bare name (plan 8W-3: without the picture, in a DM's brief, a report sent again without pictures or the classic text, the address is left out; the moderators' post of a meetup request, `meetup-safety.ts`, words it by its own picture the same way); title and address through `plainNoLinks`) after the details under **Where**, with the place's picture beside them where `wayspotPicture` allows (the Pokémon's beside the head), in the sighting, the text report and the DM's brief alike; a message Discord refuses is sent once more without either picture.
 - Text a member typed that reaches other members' DMs or a spawn report goes through `plainNoLinks` (`src/render/text.ts`), which also breaks bare addresses; a member's name is always shown through it. `plain()` leaves an address alone (a meetup's description may link).
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index e52e68662568f57bdfc60dd125764f0209356847..46dc477e45555bf46d63207fd64c666b4db4ef0b 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -33,17 +33,17 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 ## Max battles
 
-- A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
-- One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status; answered "There is already a max battle against <the battle's boss> at this spot: <post>." whatever the report named, "…: its post is being made." without a post, and on the map without the post, plan 8X-F), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the power spots that fit what is typed (`nearChoices`), and with nothing typed the region's power spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
+- A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a Power Spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
+- One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same Power Spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status; answered "There is already a max battle against <the battle's boss> at this spot: <post>." whatever the report named, "…: its post is being made." without a post, and on the map without the post, plan 8X-F), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the Power Spots that fit what is typed (`nearChoices`), and with nothing typed the region's Power Spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
 - How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax, `bossSince` set to the change's moment; `setEnd` also confirms a screenshot's guessed time, `maxTimeConfirmed`, even when the end stays, said in the post as "confirmed the end time"; `fromScreenshot`, plan 8X-S: a screenshot of the battle at its spot, decided by the pure `screenshotAtBattle` (`src/domain/party/max.ts`) inside one change without the spot's lock: the same boss joins by the automatic status in a group of the lobby size (`lobbySize` option), at whatever tier of its kind (the tier is `/boss`'s; Matt, review r4 A2), its end moved only later and only on a clean read (a sure moment and a countdown that ends at a rotation), "set the end time from a screenshot"; a clean read of the end it has confirms its time (`maxTimeConfirmed`, without a line; A3), and a moved or confirmed end makes the screenshot the post's, unless it was not kept (its id null: the post's own stays, its time no guess any more; A4); another boss of the kind on a sure moment newer than `bossSince` changes boss, tier and end, "Boss changed to <boss> from a screenshot by <member>, until <end>." (`doer`; meeting times after the new end cancelled), told to the notifier as `/boss`; anything else refused, `max-other-boss` or `max-kind-change`, the battle named; a battle whose end came meanwhile is `gone`. The look first and the report of a free spot are `reportMaxShotAs` (`src/commands/max/max-shot.ts`): the end checked against the clock first (review R11), a battle there whose post is still being made left to `reportMaxAs`, which waits for the post (review r4 A1), `mayJoin` before the change, `reportMaxAs` once with the screenshot and the boss since its sure moment (R10)). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
-- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …` (under it, while it is on and its end was guessed from a screenshot, `UNCERTAIN_MAX_TIME`, which names `/end` only; a max battle's kept screenshot stays while it is active, `screenshotIdOf` in `shown()`), the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
-- A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known power spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
+- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …` (under it, while it is on and its end was guessed from a screenshot, `UNCERTAIN_MAX_TIME`, which names `/end` only; a max battle's kept screenshot stays while it is active, `screenshotIdOf` in `shown()`), the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (Power Spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a Power Spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
+- A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known Power Spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
 
 ## Meetups and timed parties
 
 - A timed party (a meetup or a train) has `party.timed` (`name`, `startTime`: one start for the whole party, not a group's meeting time) and changes through `ctx.timedParties` (`TimedPartyService`: `setName`, `setDescription`, `setStartTime`, `setEndTime`, `flush`) over the pure functions of `src/domain/party/timed.ts` (and `meetup.ts`). Each of the four takes the value the change was drawn from (`drawn`, the live map's meetup editor, plan 8M-5M) and refuses it inside the store as `changed-meanwhile` when the party has another by now (`asDrawn`); the commands give none. What `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, answering `TimedAnswer`, which the commands reply with through `replyTimed`) and `describeAs` (`src/commands/meetups/info.ts`), the code paths the map shares. It is over at its end time; without one, a day after its start; without either, a day after it was made or its last time was removed (`latestTime(party, now)`, `settled`). The clock warns it `trainOrMeetupDeletionWarningTime` ahead, and an ended one is always shown as over. A new start is announced in the post gathered (one message a few seconds after the last change).
 - A meetup has one group and no completion: Done means leave (`finishParty`), `/group` and a group's meeting time are refused (`no-groups`, `party-wide-start`), its post has no Done and no Set time… button, and its maker is always named.
-- A meetup's place (plan 8D, Matt, 2026-10-17) is `meetup.place` (`MeetupPlace`, `src/domain/geo/place.ts`: a `KnownPlace`, a gym or PokéStop as it was when it was named, a snapshot (a new meetup is never at a power spot: Matt, 2026-10-17, poorly curated and often on private property; `MEETUP_PLACE_KINDS`, and `PlaceKindsOnly` for `nearChoices` and `namedPlace`, whose pin is then named by no power spot either; one stored before stays as it is); or a `DroppedPin`, a point with the place `near` it within `PIN_NEAR_METRES` 50 and the `linkName` its maps link gave). It is set once, by `/meetup near:` when the meetup is made (`createMeetup`; `near` required since plan 8S-1, which also asks for the start and, in a form, the information, and holds a place that might be private for the moderators: `meetup-safety.md`; a meetup made before may have no place), and never changes afterwards (Matt, 2026-10-17): no command adds, changes or clears it, since a new public place would skip the moderators' check of plan 8S, and what more there is to say about where goes in the information (`/info`). `/location` is for raids alone. `near` is read by `namedPlace` (`src/commands/place-option.ts`, shared with `/wild near:`). The post shows the place as it is now while it is the same place (`shownPlace`: the gym by id from `MeetupPostView.gym`, the kept Wayspot from `MeetupPostView.wayspot`, of the same kind and within `PLACE_MOVE_METRES` 25 of the snapshot, so a rename, a new picture, address or a gym's notice show), else the snapshot; the stored place is never rewritten. A gym edit shows the meetups at it anew (`GymUpkeep.showAnew`), a load of the kept Wayspots those near a PokéStop or power spot (`PartyService` over `WayspotProvider.whenChanged`). Its Where, after the heading block and before "Meeting Information": a known place `Near **<title>** (<kind>) · <address> · [Map](…)` (the `NO_ADDRESS` rule of a raid's Where), a gym's notice under it, its picture beside; a pin `📍 Near **<title>** (<kind>)` (the nearest place within 50 m), else `📍 **<linkName>**`, else `📍 Dropped pin`, with its Map and no picture (`pinLine`, `src/render/place.ts`); nothing without a place. The DM brief has the first line of the Where without links or Map, and the place's point as its `map`; the DM of a start time names the place as the post shows it now (`PartyService.placeOf`, `meetupPlaceNow`).
+- A meetup's place (plan 8D, Matt, 2026-10-17) is `meetup.place` (`MeetupPlace`, `src/domain/geo/place.ts`: a `KnownPlace`, a gym or PokéStop as it was when it was named, a snapshot (a new meetup is never at a Power Spot: Matt, 2026-10-17, poorly curated and often on private property; `MEETUP_PLACE_KINDS`, and `PlaceKindsOnly` for `nearChoices` and `namedPlace`, whose pin is then named by no Power Spot either; one stored before stays as it is); or a `DroppedPin`, a point with the place `near` it within `PIN_NEAR_METRES` 50 and the `linkName` its maps link gave). It is set once, by `/meetup near:` when the meetup is made (`createMeetup`; `near` required since plan 8S-1, which also asks for the start and, in a form, the information, and holds a place that might be private for the moderators: `meetup-safety.md`; a meetup made before may have no place), and never changes afterwards (Matt, 2026-10-17): no command adds, changes or clears it, since a new public place would skip the moderators' check of plan 8S, and what more there is to say about where goes in the information (`/info`). `/location` is for raids alone. `near` is read by `namedPlace` (`src/commands/place-option.ts`, shared with `/wild near:`). The post shows the place as it is now while it is the same place (`shownPlace`: the gym by id from `MeetupPostView.gym`, the kept Wayspot from `MeetupPostView.wayspot`, of the same kind and within `PLACE_MOVE_METRES` 25 of the snapshot, so a rename, a new picture, address or a gym's notice show), else the snapshot; the stored place is never rewritten. A gym edit shows the meetups at it anew (`GymUpkeep.showAnew`), a load of the kept Wayspots those near a PokéStop or Power Spot (`PartyService` over `WayspotProvider.whenChanged`). Its Where, after the heading block and before "Meeting Information": a known place `Near **<title>** (<kind>) · <address> · [Map](…)` (the `NO_ADDRESS` rule of a raid's Where), a gym's notice under it, its picture beside; a pin `📍 Near **<title>** (<kind>)` (the nearest place within 50 m), else `📍 **<linkName>**`, else `📍 Dropped pin`, with its Map and no picture (`pinLine`, `src/render/place.ts`); nothing without a place. The DM brief has the first line of the Where without links or Map, and the place's point as its `map`; the DM of a start time names the place as the post shows it now (`PartyService.placeOf`, `meetupPlaceNow`).
 - A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`; one it cannot read is refused with `timedTimeHint`, whose example date is three days from today, `dateExample`, plan 8X-G) over `resolvePartyTime` (for a meetup still to be made, `/meetup start:`, against `newPartyTimes('meetup', now)`): never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
 
 ## How a post is rendered
@@ -56,7 +56,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time… (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move…, Manage…, Split… and Route, words only, Group…'s emoji left out on a train: `trains.md`, plan 8X-G). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group in letter order (plan 8X-G, `inLetterOrder`; newest first before), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked; since plan 8X-G the groups in letter order, and marked to start with where they have no size the default group, where Join, +1 and Remote put a newcomer, review r0 A2: an iPhone starts there, Android with group A). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) in letter order (plan 8X-G), then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>[:~<token>]` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
-- A sentence that ends with a place's name (a gym, a power spot, a stop, a route's stop by its link) ends through `endSentence(text)` (`src/render/text.ts`, plan 8X-F): no period is added where what a reader sees already ends in one (`.`, `!`, `?`; through closing bold, a masked link's address and `plain`'s escapes), so "at **Fire Company Inc.**" never reads "Inc..". A battle at a pin is "at an unlisted power spot" in running text (the DMs' `MaxDmView.pin`, the meeting DM); the label `Unlisted power spot` stays where it is a name (the post, `/where`, the moderators' notice, the map).
+- A sentence that ends with a place's name (a gym, a Power Spot, a stop, a route's stop by its link) ends through `endSentence(text)` (`src/render/text.ts`, plan 8X-F): no period is added where what a reader sees already ends in one (`.`, `!`, `?`; through closing bold, a masked link's address and `plain`'s escapes), so "at **Fire Company Inc.**" never reads "Inc..". A battle at a pin is "at an unlisted power spot" in running text (the DMs' `MaxDmView.pin`, the meeting DM); the label `Unlisted power spot` stays where it is a name (the post, `/where`, the moderators' notice, the map).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit (some 86 snowflakes after a short text, 100 at most). `inMessages(text, members)` (plan 8X-1) pings them all: the text with as many as fit, then messages of mentions alone, each within 2,000 characters and 100 pings. `pingInMessages(deps, partyId, postId, text, members)` (`src/services/party-change.ts`) sends them one after the other, asking the store before each whether the party is still active with that post (a moved raid has another), and stops otherwise or when Discord says the post is gone (`complete`, `pinged`, and `stopped`: `gone`, or `moved` for a party still active with another post); `/shout` (`AttendanceService.shout`) goes through it, answering `gone` with how many it `pinged` before ("This raid is over. I pinged 86 trainers before it ended."), or `moved` ("This raid moved to another post: I pinged 86 trainers before it moved. Shout again there.", without the count when nobody was pinged yet, and then the use of `/shout` goes back: `givesBack`); `/shout group:True` pings only the others of the shouter's own group (not Complete, those who allow shout pings; the text says `to everybody in group B:`), refused in a party of one group (`one-group`: "This raid has one group: `/shout` without `group` pings everybody."), `nobody` with the group when nobody else is in it. Since plan 8X-4 (a Gigantamax train holds a hundred) a group's meeting time, a new group's notice (its sentence and hint first), a timed party's start, a train's movement, the notice of a raid that moved and a train's split notice go through `pingInMessages` as well (its `sent` says how many messages went; the move notice is said once the first went); only the archive warning and the completion question still ping one message's worth (their ids are kept to delete them; a follow-up).
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index ea97f5419352ccf1faf403314c05f6d1341181ff..32e9fdfd183418d3338b9ce0f24aef4662494272 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -48,11 +48,11 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Trains
 
-- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`; `add` takes a gym by its number). Stops (plan 8X-4): `stops(4, 1, <Wayfarer id>)` a route of gyms by number and power spots by Wayfarer id, `gym(n)` one gym (`test/support/parties.ts`), `inGyms(value)` a value with every gym stop as its id, for an expectation written by gym ids (both sides of a matcher); `createdTrain({ route, kind }, { wayspots })` takes gym numbers or stops, a kind, and the kept Wayspots (`wayspotsWith`, power spots by `keptRow(n, { kind: 'powerspot', lat, lon })` inside West, 40.00 to 40.10 north, -80.10 to -80.00) for the party and train services alike. Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`. A split (plan 8T) goes through `made.trains.split` (the service's `splits` is the party service); what happens while the new post is made is tested by holding `gateway.createPost` (`holdPost` in `train-split.test.ts`, as the relocate tests do; it moves the clock on as making a post takes time), what happens between the new post and the paired write of both trains by holding a write of the old train (`holdOldTrain`: the new train's id is made to sort after the old one's, or before it, which decides whose lock `updateBoth` takes first), a failed paired write by `failingPairs` (and a failed save by `failingSaves`), and a stop before the paired write by both, `restarted(made)` and `settlePendingSplits()`; a train's ids sort by `createdAt` and then id, so a test finds the new train by its id, not by its place in `store.active()`.
+- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`; `add` takes a gym by its number). Stops (plan 8X-4): `stops(4, 1, <Wayfarer id>)` a route of gyms by number and Power Spots by Wayfarer id, `gym(n)` one gym (`test/support/parties.ts`), `inGyms(value)` a value with every gym stop as its id, for an expectation written by gym ids (both sides of a matcher); `createdTrain({ route, kind }, { wayspots })` takes gym numbers or stops, a kind, and the kept Wayspots (`wayspotsWith`, Power Spots by `keptRow(n, { kind: 'powerspot', lat, lon })` inside West, 40.00 to 40.10 north, -80.10 to -80.00) for the party and train services alike. Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`. A split (plan 8T) goes through `made.trains.split` (the service's `splits` is the party service); what happens while the new post is made is tested by holding `gateway.createPost` (`holdPost` in `train-split.test.ts`, as the relocate tests do; it moves the clock on as making a post takes time), what happens between the new post and the paired write of both trains by holding a write of the old train (`holdOldTrain`: the new train's id is made to sort after the old one's, or before it, which decides whose lock `updateBoth` takes first), a failed paired write by `failingPairs` (and a failed save by `failingSaves`), and a stop before the paired write by both, `restarted(made)` and `settlePendingSplits()`; a train's ids sort by `createdAt` and then id, so a test finds the new train by its id, not by its place in `store.active()`.
 
 ## Wayfarer
 
-- Wayfarer tests: the import and the queue over gym administration on fakes are `wayfarerImportWith()` (`test/support/wayfarer-import.ts`: `wayfarer`, `wayfarerReview`, `wayfarerStore`, `wayspotStore` (`MemoryWayspots`) and `wayspots` (a `WayspotDirectory` over it, loaded), `admin`, `directory`, `removal`), which `gymCommandsWith()` routes like the bot; `createTestContext`'s own `wayfarer` and `wayfarerReview` throw when used. Exports in tests are built from invented Wayspots at the invented gyms, their cells by `wayfarerCellAt`. Kept Wayspots: `MemoryWayspots` keeps those found gone apart (`goneRows`, plan 8W-3); `keptRow(n, overrides)` and `wayspotId(n)` (`test/support/wayspot-cases.ts`, with `wayspotCases`, which the repository and `MemoryWayspots` both run), `wayspotsWith(rows)` (a loaded directory over the invented regions; pass it as `wayspots` to `createTestContext`, whose own is empty, `noWayspots()`, and whose `placeFinder` is built over its own gyms, Wayspots and regions unless given; a test that searches stops or power spots awaits `placeFinder.built()` first, as the search indexes are built in a turn of their own). Never the real export: it is read only by scratch scripts.
+- Wayfarer tests: the import and the queue over gym administration on fakes are `wayfarerImportWith()` (`test/support/wayfarer-import.ts`: `wayfarer`, `wayfarerReview`, `wayfarerStore`, `wayspotStore` (`MemoryWayspots`) and `wayspots` (a `WayspotDirectory` over it, loaded), `admin`, `directory`, `removal`), which `gymCommandsWith()` routes like the bot; `createTestContext`'s own `wayfarer` and `wayfarerReview` throw when used. Exports in tests are built from invented Wayspots at the invented gyms, their cells by `wayfarerCellAt`. Kept Wayspots: `MemoryWayspots` keeps those found gone apart (`goneRows`, plan 8W-3); `keptRow(n, overrides)` and `wayspotId(n)` (`test/support/wayspot-cases.ts`, with `wayspotCases`, which the repository and `MemoryWayspots` both run), `wayspotsWith(rows)` (a loaded directory over the invented regions; pass it as `wayspots` to `createTestContext`, whose own is empty, `noWayspots()`, and whose `placeFinder` is built over its own gyms, Wayspots and regions unless given; a test that searches stops or Power Spots awaits `placeFinder.built()` first, as the search indexes are built in a turn of their own). Never the real export: it is read only by scratch scripts.
 
 ## Reports at stops (plans 8R-1, 8R-2)
 
@@ -77,9 +77,9 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`; `/raid`'s own refusal of a forum the member is kept out of in `raid.test.ts`, with `gateway.barred` and a router's `Throttles` to see it uncounted, plan 8M-6; a screenshot's in `mention.test.ts`, whose `setup({ alsoInEast })` puts gyms in East as well).
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
-- Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a power spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
-- Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept power spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
-- Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a power spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
+- Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a Power Spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
+- Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept Power Spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
+- Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode, the Move panel) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events, the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a colour written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define; `theme.test.ts` reads a theme through a fake reader (`readTheme`). It lives outside `src/web/client/` because the client's type check has no Node.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 5b7d741879d0889bfe35bf7d56fe68e8f0bbfbff..ee4155aa9c9f0eee88480b5bdc6a43347541c732 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -1,10 +1,10 @@
 # Raid trains
 
-The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax or Gigantamax battles), a current stop, a conductor, modes at the end of the route (finish, loop, turn back), movement and its announcement, the dialogs Move… and Manage… of its post (plan 8X-G; the Manage train panel before), saved routes, copies in the channels of the regions a train stops in, and the commands' code paths the live map shares. Read before changing trains, routes or the dialogs (and `parties-and-posts.md` for what all parties share; `web.md`, "Trains on the map", for the map's side).
+The third kind of party: a route of gyms and Power Spots, a kind (raids, Dynamax or Gigantamax battles), a current stop, a conductor, modes at the end of the route (finish, loop, turn back), movement and its announcement, the dialogs Move… and Manage… of its post (plan 8X-G; the Manage train panel before), saved routes, copies in the channels of the regions a train stops in, and the commands' code paths the live map shares. Read before changing trains, routes or the dialogs (and `parties-and-posts.md` for what all parties share; `web.md`, "Trains on the map", for the map's side).
 
 ## The model
 
-- A raid train is the third kind (`TrainParty`: `timed` like a meetup, and `train: { route, stop, conductorId, boss, finishedFrom, atEnd }`). `isTrain`, the guards `requireTrain` (with `commandTrain`, `trainOf`) and `requireRaidOrTrain` (what has a boss or a gym: `/boss`, `/where`); `bossOf(party)` is the boss of any party that has one. `route` is stops (`StopRef`, plan 8X-4: a gym by its id or a power spot by its Wayfarer id; below), none twice, at most `MAX_ROUTE_STOPS`; `stop === route.length` on a route that is not empty means finished; `party.gymId` is null (the gym of a train is `currentStop(party)`). It has groups like a raid and one start like a meetup; Done means leave, and whoever leaves as the conductor stops being it.
+- A raid train is the third kind (`TrainParty`: `timed` like a meetup, and `train: { route, stop, conductorId, boss, finishedFrom, atEnd }`). `isTrain`, the guards `requireTrain` (with `commandTrain`, `trainOf`) and `requireRaidOrTrain` (what has a boss or a gym: `/boss`, `/where`); `bossOf(party)` is the boss of any party that has one. `route` is stops (`StopRef`, plan 8X-4: a gym by its id or a Power Spot by its Wayfarer id; below), none twice, at most `MAX_ROUTE_STOPS`; `stop === route.length` on a route that is not empty means finished; `party.gymId` is null (the gym of a train is `currentStop(party)`). It has groups like a raid and one start like a meetup; Done means leave, and whoever leaves as the conductor stops being it.
 - The maker of a train is signed up as their auto-status says (None: not at all; Here counts as Coming), and with privacy Anonymous neither the post nor the new-train DM names them (`NewTrain.anonymous`, `autoStatus`). A maker who is not signed up may still arrange the route and the times as far as the train does not move (`mayArrange`, `party.ts`); moving it and being its conductor need a sign-up. Meetups know neither setting.
 - A train remembers the stop it was at when a move finished its route (`train.finishedFrom`; state document version 6, version 5 read as null): Previous from the end leads back there and leaves Here as Here (`destinationOf`, `targetOf`), and to the last stop when nothing is remembered. `withTrain` in `train.ts` is the one place that keeps it (null unless the route is finished and still has that stop), so a route is changed only through the functions of `train.ts`, never by building `train.route` by hand: the state document refuses a train that breaks the rule. The panel's Previous button carries its target like Next and Skip.
 
@@ -13,7 +13,7 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 - Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `reverse`, `setAtEnd`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its stop through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
 - Who may edit is one rule each in `train.ts`, which the domain functions, the live map's view and its routes all ask: `mayNotArrange` (add, remove, move a stop: signed up, the maker, staff), `mayNotClear` (the conductor and staff; `/route clear` counts bot developers as staff), `mayNotLoad` (who may move the train, or the maker its first route), `mayNotMove`. An edit of the route may carry the route it was drawn from (`drawn`, the live map's route editor: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `loadRoute` and `saveRoute` take it last): the service refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`); a command gives none. So may a change of the conductor carry whose the role was as the map drew its button (`seen`, `ConductorSeen`: `setConductor` and `clearConductor` take it last), refused inside the store when the role is somebody else's by now (`conductorDrawn`, reason `conductor-changed`).
 - What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `reverseRouteAs`, `setAtEndAs` and `setKindAs` (plan 8X-5) word the map's panel's Reverse, mode and kind; Manage…'s Submit says them in the same words), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). Move… and Manage… answer in the commands' words too (plan 8X-G). `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
-- A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym or a power spot is a stop only when it lies in a region of the train's server (`reaches`, `stopRegionsInGuild`).
+- A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym or a Power Spot is a stop only when it lies in a region of the train's server (`reaches`, `stopRegionsInGuild`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
 - What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (and the map's panel) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
 
@@ -25,14 +25,14 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 
 - On the live map the Manage train panel stays (plan 8X-G changed only the post; the map's panel waits for its UX pass): it opens in the train's popup in place of its actions ("Manage…") and stays open after each move, as the post's does (`web.md`, "Trains on the map"); the popup keeps the click that drew the panel (`keepClicksInPopup`: before plan 8S-3 Leaflet took it for a click on the map, the Manage… button being out of the page by then, and closed the popup at once).
 
-## Kinds and power spots (plan 8X-4)
+## Kinds and Power Spots (plan 8X-4)
 
-- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid; its hint `What the train is mainly for (its stops can be gyms or power spots)`) and Manage…'s menu "What the train is mainly for" (plan 8X-G; `TRAIN_KIND_QUESTION`; the choices `Raids`, `Dynamax Battles`, `Gigantamax Battles`, `trainKindChoice`, the same for `/train kind:`; `TrainService.manage`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices, which name what the train is mainly for): the post's heading and brief, `/help`; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
+- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid; its hint `What the train is mainly for (its stops can be gyms or Power Spots)`) and Manage…'s menu "What the train is mainly for" (plan 8X-G; `TRAIN_KIND_QUESTION`; the choices `Raids`, `Dynamax Battles`, `Gigantamax Battles`, `trainKindChoice`, the same for `/train kind:`; `TrainService.manage`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices, which name what the train is mainly for): the post's heading and brief, `/help`; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
 - **Planned ahead:** `/train start:` (a time as `/meet` reads it, `typedTimedTime` over `newPartyTimes('train', now)`, read by the guard first so that a refusal is not counted) makes the train with its start; its route may stay empty until the day (a train with no time still goes a day after it was made). Manage… opens on a train without a route too, with its kind alone (so a kind set wrongly at `/train` can be changed before the first stop); the post shows no Move… until the first stop.
-- **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the dialogs' custom ids and choices stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A power spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (power spot)` in lists, the dialogs and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a power spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown power spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
-- **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered power spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's power spots by name ahead of them (`regionSpotChoices`, shared with `/max spot:`). A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a power spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, and its several (some fitting every word) are "Several places fit", unless the other kind's stop beyond doubt fits the typed text strictly better than that stop or the best of those several (`PlaceFit`, `TypedSide.several.best`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a power spot fits strictly better, and a max train takes a gym's exact full name though several power spots contain its words (plan 8X-F, the staging's "Allegheny Station"); without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add power spots. `/route remove stop:` keeps its stop number.
-- **Saved routes** keep stops: `SavedRoute.stops`, the column `SavedRoutes.gyms` their keys separated by commas (`routeText`, `routeStops`, which also reads the legacy bot's gym ids; no migration). `removeGym` keeps a route's power spots and removes only a route left without a stop; `countWithGym` and `removeGym` narrow their `LIKE` by the parsed stops. `/route load` leaves out stops gone or of no region of the server.
-- **Copies** in other regions go also where a power spot of the route lies (`stopRegionsInGuild` in `PartyMirrors.regionChannels`). The history records a spot's stop with its `wayspotId` (`history.md`). The map draws the line through the spots its data gives (`web.md`).
+- **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the dialogs' custom ids and choices stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A Power Spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (Power Spot)` in lists, the dialogs and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a Power Spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown Power Spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
+- **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered Power Spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's Power Spots by name ahead of them (`regionSpotChoices`, shared with `/max spot:`). A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a Power Spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, and its several (some fitting every word) are "Several places fit", unless the other kind's stop beyond doubt fits the typed text strictly better than that stop or the best of those several (`PlaceFit`, `TypedSide.several.best`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a Power Spot fits strictly better, and a max train takes a gym's exact full name though several Power Spots contain its words (plan 8X-F, the staging's "Allegheny Station"); without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add Power Spots. `/route remove stop:` keeps its stop number.
+- **Saved routes** keep stops: `SavedRoute.stops`, the column `SavedRoutes.gyms` their keys separated by commas (`routeText`, `routeStops`, which also reads the legacy bot's gym ids; no migration). `removeGym` keeps a route's Power Spots and removes only a route left without a stop; `countWithGym` and `removeGym` narrow their `LIKE` by the parsed stops. `/route load` leaves out stops gone or of no region of the server.
+- **Copies** in other regions go also where a Power Spot of the route lies (`stopRegionsInGuild` in `PartyMirrors.regionChannels`). The history records a spot's stop with its `wayspotId` (`history.md`). The map draws the line through the spots its data gives (`web.md`).
 
 ## Splitting a group off
 
@@ -47,7 +47,7 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 
 ## Saved routes
 
-- Saved routes are the legacy table `SavedRoutes` behind `SavedRouteRepository` (per member and region, at most `MAX_SAVED_ROUTES`, the same name without case replaces; `save` and `remove` lock the member's `User` row first). A saved route keeps the order of its stops and the train's mode (`SavedRoutes.atEnd`, migration 013, and its stops gyms and power spots since plan 8X-4 (above), `varchar(10)` defaulting to `finish`, which covers the legacy bot's inserts; a value this code does not know reads as `finish`; `SavedRoute.atEnd`; starting the bot migrates, so a dev database must hold 8W-1's 012 before this branch starts on it: Kysely refuses 012 after 013 has run, and a database with 012 refuses a branch without it ("previously executed migration ... is missing"); if 013 ran first, delete its row from `kysely_migration` and start again, 013 does nothing when the column exists): `/route save` writes the train's, `/route load` sets both (`replaceRoute(…, atEnd)`), `/route show` ends with `atEndSentence` on a route of two stops or more; the private answers of save and load always say the mode, the public "loaded" line in the post only when it is not `finish`. The `route` option's autocomplete value is `id:<n>` (`SAVED_ROUTE_CHOICE`); anything else typed is a name. `/boss` in a train goes through `trainBoss` (`raid-input.ts`): tier words are ignored, any Pokémon the catalogue names is accepted, `none` clears; `reportedBoss` is for raids only.
+- Saved routes are the legacy table `SavedRoutes` behind `SavedRouteRepository` (per member and region, at most `MAX_SAVED_ROUTES`, the same name without case replaces; `save` and `remove` lock the member's `User` row first). A saved route keeps the order of its stops and the train's mode (`SavedRoutes.atEnd`, migration 013, and its stops gyms and Power Spots since plan 8X-4 (above), `varchar(10)` defaulting to `finish`, which covers the legacy bot's inserts; a value this code does not know reads as `finish`; `SavedRoute.atEnd`; starting the bot migrates, so a dev database must hold 8W-1's 012 before this branch starts on it: Kysely refuses 012 after 013 has run, and a database with 012 refuses a branch without it ("previously executed migration ... is missing"); if 013 ran first, delete its row from `kysely_migration` and start again, 013 does nothing when the column exists): `/route save` writes the train's, `/route load` sets both (`replaceRoute(…, atEnd)`), `/route show` ends with `atEndSentence` on a route of two stops or more; the private answers of save and load always say the mode, the public "loaded" line in the post only when it is not `finish`. The `route` option's autocomplete value is `id:<n>` (`SAVED_ROUTE_CHOICE`); anything else typed is a name. `/boss` in a train goes through `trainBoss` (`raid-input.ts`): tier words are ignored, any Pokémon the catalogue names is accepted, `none` clears; `reportedBoss` is for raids only.
 
 ## Copies in other regions
 
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 05b6fd09c5fa4582abfe2d3445c584c3962cacc3..f2310c2c64242a9ef214799ccf9eaac25bf9a13d 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -13,7 +13,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 ## Finding Pokémon
 
 - Pokémon are found through `ctx.pokemon`: `exact(text)` is the one entry a text names outright (act on this); `search(text)` is a list ordered best first that includes near misses (offer it, never act on its first entry); `find(text, { limit, filter, plain })` is the same list with how each hit fits (`exact`, `word`, `beginning`, `loose`, `guess`) and whether it was found by its name (`named`). The order: a whole word of a name, then a beginning, then looser hits, guesses last; among hits led by the species' own name or a nickname, a legendary, mythical or ultra-beast species (`PokemonEntry.class`, from the game master) first, at most `CLASS_LIFTS` entries of one species (`plain: true` switches that off). A nickname is never read as a misspelling, a costume word alone does not find its species, a word of up to five letters must keep its first letter, and a text that names a Pokémon outright brings no guesses. A list that puts current bosses first asks for them by themselves (`filter`), and offers a guess only where the shown name has the guessed word (`showsGuessed`, `src/commands/choices.ts`). After a nickname change call `PokemonSearchService.reloadNicknames()`.
-- Places are not Pokémon: gyms, PokéStops and power spots together are `ctx.placeFinder`, with an index per kind and the merge of `src/domain/search/place-merge.ts`, whose fits are worded as the Pokémon search's (`gyms-and-regions.md`).
+- Places are not Pokémon: gyms, PokéStops and Power Spots together are `ctx.placeFinder`, with an index per kind and the merge of `src/domain/search/place-merge.ts`, whose fits are worded as the Pokémon search's (`gyms-and-regions.md`).
 - Short fixed lists (status and privacy words, a boss's moves) use the strict matcher `matchNamed` (`src/domain/search/word-match.ts`), not an index: a misspelling must keep the first letter and may not add words.
 
 ## Raid tiers and bosses
diff --git a/docs/architecture/wayfarer.md b/docs/architecture/wayfarer.md
index b6a5b9af7f33c3b1eee35eac646d596ec34e06be..d095bdbe5f3da8130c0dc1547023196286a8299c 100644
--- a/docs/architecture/wayfarer.md
+++ b/docs/architecture/wayfarer.md
@@ -16,7 +16,7 @@ The true list of gyms from Wayfarer: the export file and its parts, S2 cells and
 
 ## Matching and the import
 
-- Matching gyms to Wayspots is pure (`src/domain/wayspots/match.ts`, `matchGyms(input): ImportPlan`): by id (a `pogoId` that is a Wayfarer gym of the file; beyond `CANDIDATE_METRES` 100 m it is asked about instead of moving the gym; of two gyms that hold one id the nearer to the Wayspot is it, ties to the lower id, and the other shares it (plan 8W-3): it goes on as a gym never matched, and if nothing takes it it is asked about with that Wayspot as its own candidate marked `heldBy` the nearer gym, a `missing` item unless a Wayfarer gym near makes it a `match`; such a candidate has no "Same as" or "New gym", and `/gym review` says "<gym> shares its Wayspot **T** with <holder>, which lies nearer to it: that gym is the Wayspot now.", however far it lies, and for a Wayspot that is a PokéStop or power spot now "… shares its Wayspot **T**, a PokéStop now, with <holder>, which lies nearer to it and holds it too."), then certain among the Wayspots not taken, exactly one by `certainBy` (title equal by `nameKey` within `CERTAIN_NAME_METRES` 20, equal but for "the", "a", "an" and punctuation by `looseNameKey` within `CERTAIN_LOOSE_METRES` 50, any title within `CERTAIN_PLACE_METRES` 5 for a Wayfarer gym only; a gym marked "not in Wayfarer" only by id or name), or exactly one by name beside others by place alone (`certainPick`), every pick by name before any by place alone (a pass takes picks by place only when it has none by name), within each the gyms ordered by the Wayspot each would take, nearest first, and again while a pass takes anything (never a gym whose Wayfarer id the file lacks where it did not cover every cell within `COVERED_AROUND_METRES` of it, plan 8W-3: that Wayspot is there, unseen, maybe across the edge of the gym's cell; such a gym is `notCovered` with the first uncovered cell, and `isOtherWayspot` reads the same); a Wayspot goes to at most one gym, and the Wayfarer ids of gyms outside the input are taken. A Wayfarer gym nobody took is offered to a gym within 100 m that may be it (neither matched nor marked; not one whose Wayfarer id the file lacks where it did not cover the gym's cell, which is a Wayspot the file did not see; not one whose last answer was "None of these" about that Wayspot, `MatchInput.refused`, from `latestDecided`), its namesake first, else the nearest, each gym at most `MAX_CANDIDATES` such Wayspots with its own first (the rest go to the next such gym; when every gym that may be it has its five, it is neither offered nor added but `held`, and a later import offers it once a place is free); with none it is added where it lies in the regions, unless a gym outside the input that may be it (`MatchInput.others`, `isOtherWayspot`: not marked, and its id neither a Wayfarer gym of the file nor absent where the file did not cover it, and its latest decided item of any server, `latestDecided('any', ...)`, not "None of these" about that Wayspot) lies within 100 m: then it is `held` too (counted in the preview, "N Wayfarer gyms wait for a question about a gym nearby", logged, listed in the report, not added); stops and power spots are never added. The rest is queued (`ReviewItem`) with up to `MAX_CANDIDATES` 5 candidates within 100 m (never a Wayspot the plan adds: it becomes a gym of its own): `match` when a Wayfarer gym is among them, else `missing` (its own Wayspot is a stop or power spot now, or its id is gone from a covered cell) or `unknown` (never matched, cell covered), a gone id and `unknown` only where every cell within `COVERED_AROUND_METRES` 50 of the gym is covered (`cellsAround`: its point and eight points that far; a gym whose own Wayspot was seen as a stop or power spot is `missing` whatever the coverage); a gym in an uncovered cell, or near one, is otherwise `notCovered` (with the first uncovered cell), a marked one counted. A candidate keeps Wayfarer's address (`ReviewCandidate.address`, absent where Wayfarer has none and on items stored before 8W-3), which "Same as" and "New gym" write instead of asking Google (an older item falls back to the kept Wayspot's address). A match writes `pogoId`, the title as name (`newGymName`, tidied by `gym-text.ts`; a blank or too long title leaves the name), the picture (`pictureOf`, at most `MAX_PICTURE_ADDRESS`), and the place when farther than `MOVE_METRES` 3 (`matchChange`). A Wayfarer gym outside the regions that no gym took (here or elsewhere), none is offered and none may be (of the input or of `others`), that lies in no region of another server (`mayPlace`), within the file's margin of an outline (`MatchInput.nearOutline`), is listed in `outsideGyms` (`OutsideGym`: metres from the nearest outline and that region's channel), never added; stops and power spots outside are not listed. `withAnswers` leaves out what staff answered already (`stillAnswered` with the new file's covered cells, plan 8W-3: a Wayspot answered about whose cell the new file did not cover is not missed, so that two files covering different cells around a gym do not ask again; a Wayspot new to the question is a change wherever it lies). The CSV of the preview is `importReportCsv` (`src/render/wayfarer-report.ts`, one line per gym, per added Wayspot, per `held` one (with the gym that holds it back where the server may name it: the considered gyms and `WayfarerPreview.holders`, the gyms outside the import it may touch; else no gym) and per `outside` Wayfarer gym, the last with its metres and the nearest region's channel name in the column `region`, empty when the bot does not see the channel).
+- Matching gyms to Wayspots is pure (`src/domain/wayspots/match.ts`, `matchGyms(input): ImportPlan`): by id (a `pogoId` that is a Wayfarer gym of the file; beyond `CANDIDATE_METRES` 100 m it is asked about instead of moving the gym; of two gyms that hold one id the nearer to the Wayspot is it, ties to the lower id, and the other shares it (plan 8W-3): it goes on as a gym never matched, and if nothing takes it it is asked about with that Wayspot as its own candidate marked `heldBy` the nearer gym, a `missing` item unless a Wayfarer gym near makes it a `match`; such a candidate has no "Same as" or "New gym", and `/gym review` says "<gym> shares its Wayspot **T** with <holder>, which lies nearer to it: that gym is the Wayspot now.", however far it lies, and for a Wayspot that is a PokéStop or Power Spot now "… shares its Wayspot **T**, a PokéStop now, with <holder>, which lies nearer to it and holds it too."), then certain among the Wayspots not taken, exactly one by `certainBy` (title equal by `nameKey` within `CERTAIN_NAME_METRES` 20, equal but for "the", "a", "an" and punctuation by `looseNameKey` within `CERTAIN_LOOSE_METRES` 50, any title within `CERTAIN_PLACE_METRES` 5 for a Wayfarer gym only; a gym marked "not in Wayfarer" only by id or name), or exactly one by name beside others by place alone (`certainPick`), every pick by name before any by place alone (a pass takes picks by place only when it has none by name), within each the gyms ordered by the Wayspot each would take, nearest first, and again while a pass takes anything (never a gym whose Wayfarer id the file lacks where it did not cover every cell within `COVERED_AROUND_METRES` of it, plan 8W-3: that Wayspot is there, unseen, maybe across the edge of the gym's cell; such a gym is `notCovered` with the first uncovered cell, and `isOtherWayspot` reads the same); a Wayspot goes to at most one gym, and the Wayfarer ids of gyms outside the input are taken. A Wayfarer gym nobody took is offered to a gym within 100 m that may be it (neither matched nor marked; not one whose Wayfarer id the file lacks where it did not cover the gym's cell, which is a Wayspot the file did not see; not one whose last answer was "None of these" about that Wayspot, `MatchInput.refused`, from `latestDecided`), its namesake first, else the nearest, each gym at most `MAX_CANDIDATES` such Wayspots with its own first (the rest go to the next such gym; when every gym that may be it has its five, it is neither offered nor added but `held`, and a later import offers it once a place is free); with none it is added where it lies in the regions, unless a gym outside the input that may be it (`MatchInput.others`, `isOtherWayspot`: not marked, and its id neither a Wayfarer gym of the file nor absent where the file did not cover it, and its latest decided item of any server, `latestDecided('any', ...)`, not "None of these" about that Wayspot) lies within 100 m: then it is `held` too (counted in the preview, "N Wayfarer gyms wait for a question about a gym nearby", logged, listed in the report, not added); stops and Power Spots are never added. The rest is queued (`ReviewItem`) with up to `MAX_CANDIDATES` 5 candidates within 100 m (never a Wayspot the plan adds: it becomes a gym of its own): `match` when a Wayfarer gym is among them, else `missing` (its own Wayspot is a stop or Power Spot now, or its id is gone from a covered cell) or `unknown` (never matched, cell covered), a gone id and `unknown` only where every cell within `COVERED_AROUND_METRES` 50 of the gym is covered (`cellsAround`: its point and eight points that far; a gym whose own Wayspot was seen as a stop or Power Spot is `missing` whatever the coverage); a gym in an uncovered cell, or near one, is otherwise `notCovered` (with the first uncovered cell), a marked one counted. A candidate keeps Wayfarer's address (`ReviewCandidate.address`, absent where Wayfarer has none and on items stored before 8W-3), which "Same as" and "New gym" write instead of asking Google (an older item falls back to the kept Wayspot's address). A match writes `pogoId`, the title as name (`newGymName`, tidied by `gym-text.ts`; a blank or too long title leaves the name), the picture (`pictureOf`, at most `MAX_PICTURE_ADDRESS`), and the place when farther than `MOVE_METRES` 3 (`matchChange`). A Wayfarer gym outside the regions that no gym took (here or elsewhere), none is offered and none may be (of the input or of `others`), that lies in no region of another server (`mayPlace`), within the file's margin of an outline (`MatchInput.nearOutline`), is listed in `outsideGyms` (`OutsideGym`: metres from the nearest outline and that region's channel), never added; stops and Power Spots outside are not listed. `withAnswers` leaves out what staff answered already (`stillAnswered` with the new file's covered cells, plan 8W-3: a Wayspot answered about whose cell the new file did not cover is not missed, so that two files covering different cells around a gym do not ask again; a Wayspot new to the question is a change wherever it lies). The CSV of the preview is `importReportCsv` (`src/render/wayfarer-report.ts`, one line per gym, per added Wayspot, per `held` one (with the gym that holds it back where the server may name it: the considered gyms and `WayfarerPreview.holders`, the gyms outside the import it may touch; else no gym) and per `outside` Wayfarer gym, the last with its metres and the nearest region's channel name in the column `region`, empty when the bot does not see the channel).
 - The import is `ctx.wayfarer` (`WayfarerImportService`, `src/services/wayfarer-import-service.ts`): `preview(staff, file)` plans and writes nothing; `apply(staff, file)` plans again inside `GymAdminService.batch` against the gyms as they are then and writes that plan, each gym's write decided before any of it is written (`mayPlace` first: a match that would move a gym where the server may not put it is held and asked about); each match is one row write (a move takes the other fields as its `patch`: a move refused when the regions changed meanwhile writes nothing, and the summary counts a rename only with its move); a write that fails is counted and logged, and the import goes on; a move over `REFETCH_METRES` 25 takes the Wayspot's address and has its places fetched again, in `GymUpkeep`'s line (`placed(id, { places: 'later', address })`; its address too when the Wayspot's names no street); the outcome says what was not recorded (`Unrecorded`). It considers the gyms this server may touch (`mayTouch`) that lie in its regions, and gyms in no region of any server that lie within 100 m of one of its outlines (`nearRing`, `region-membership.ts`) or in a covered cell; Wayspots outside the regions count only near those gyms. The count `outside` (preview and outcome: "N Wayfarer gyms lie just outside every region of this server: your outlines may leave them out") is `plan.outsideGyms`, measured by `metresFromRing` (`region-membership.ts`, beside `grownBox`) against the server's outlines within `file.margin` (none for a file without a margin); the `ignored` Wayspots may include them. `GymAdminService.batch(place, source, work)` runs `work(ops)` under the admin lock with `GymBatch` (`add`, `move` with an optional `patch`, `update` of `BatchPatch`, `remove`), none of which takes the lock or announces: what it changed is announced in one summary at the end, also when `work` failed (`source` decides when it is posted: gathered for the review, at once otherwise; the summary names no source, Matt, 2026-10-16); work that asks for the lock from inside never finishes. `delete(id, by, place, onlyIf)` asks `onlyIf` under the lock first and answers `withdrawn` when it no longer holds.
 - `/gym import` (`src/commands/gyms/import.ts`) previews in a v2 message (counts in sentences, by region, the stops of Pine's own within 30 m of an imported stop named for staff to remove, plan 8R-1 `pineStopsNear`, `wayfarer-import.csv` as a file component, Import / Cancel) and keeps the parsed export in its own `pendingImports` (`MAX_PENDING_IMPORTS` 3, `IMPORT_PENDING_MINUTES` 30) under the token of `gym:<token>:wayfarer-import|wayfarer-cancel`, only what Import reads of it (`forImport`: no descriptions, no status; plan 8W-3); an export that would change nothing gets no Import (`changesNothing`; an item counts as queued already, `queuedAlready`, only when an open item asks the same kind about the same set of candidate ids; a preview that could not read the kept Wayspots may change them: it offers Import and says why it cannot tell, `KEPT_UNREAD`). The sentences of the preview, the outcome and the question are cut by `sentencesText` (`cutMarkdown`: never inside a mention, a code span or bold). Import replaces the preview with "Importing…", then the outcome, or a failure line when `apply` throws; when that edit fails (an import may outlast the interaction) the outcome is logged.
 - The scanned area of an export is its own outlines grown by its margin, never the server's regions of the day (`src/domain/wayspots/scanned-area.ts`): the preview says where they differ (`compareOutlines`: regions not as scanned, areas that are no region now) and lists the gyms this server may touch that lie in no region of any server beyond the area (`gymsBeyond`, `WayfarerImportService.outsideArea`, the report's `beyond`). After an import of a finished scan with a margin (`mayDeleteOutside`: every cell of the area received, `scanFinished`) whose outlines are every region of the server as it is now (while `compareOutlines` names a region not scanned, `outsideArea` gives nothing and the preview says why), the outcome offers "Delete N gyms outside the area…" (`gym:<token>:outside-ask`, then `outside-delete` / `outside-keep` of a private question naming the first `OUTSIDE_NAMED` and what goes with them; the area alone is kept in `pendingOutside`, the question under `questionToken` of the outcome's token, so that asking again replaces it and presses do not crowd the store; it names each gym's metres from the nearest outline, as the report's `beyond` lines do): the list is worked out again at each press (the question and the deletion, under the lock, refuse with nothing deleted when a region was added or changed since: `OutsideDeletion.regionsNotScanned`), each gym deleted through `GymBatch.remove` (gym administration's deletion under the batch's lock; an active raid keeps its gym, named), one summary at the end (`deleteOutside`).
@@ -24,8 +24,8 @@ The true list of gyms from Wayfarer: the export file and its parts, S2 cells and
 
 ## The kept Wayspots
 
-- Every Wayspot of an applied import is kept (plan 8W-2): table `Wayspot` (migration `2026_10_16_017_wayspot`; a migration merged after it must sort after it, since Kysely refuses an earlier name once 017 ran on a database: 8H's is `2026_10_16_018_party_history`, 016 stays unused; first merge wins, the second renumbers above it, and only a merged migration, or one that already sorts after everything merged, is run on the dev database. The table: the Wayfarer id, `kind`, `formerKind` (the kind before an import last saw it as another; `stop` for a promoted stop), place, title and address plain (not entity-encoded: nothing legacy reads it; cut to 255), picture (`pictureOf`, the address as Wayfarer gives it; a message shows it through `wayspotPicture`: https, `=s400`), `firstSeen` (when an import first kept it: the import's time), `lastSeen` (when the scan of the newest file that saw it was made, `scanTimeOf`: the file's `finishedAt`, else `startedAt`, else the import's time, never later than the import's time: a file dated in the future would freeze its rows); not per server) behind `WayspotStorage` (`WayspotRepository`: `all`, `gone`, `saveFromImport({ upsert, remove, gone }, importedAt, scannedAt, startedAt)` in one transaction of chunks of 500, `remove(ids)`; twin `MemoryWayspots`, both run `wayspotCases`). The pure part is `planKept` (`src/domain/wayspots/keep.ts`, rows `kept.ts`): every Wayspot of the file but those whose id is a Pine gym's `pogoId` (of any server) after the import, which live in `Gym` (a row of one is deleted); a kept row not in the file is marked gone where the file covered its cell (`coveredCells`; plan 8W-3: the row stays with `kind` `gone`, its kind before in `formerKind` and its `lastSeen` the time of the scan that found it gone, never read by `all`; no column was added, ruling: tombstones are kept for good, a few thousand rows at most: nothing prunes them, and every preview and import reads them all, `WayspotStorage.gone`, with the kind each had, `GoneWayspot` (a stop where it is not known, `UNKNOWN_GONE_KIND`, so that no tombstone is left out); one brought back keeps that kind as its `formerKind`, and a Wayfarer gym added that was such a stop counts as one, `promoted`), and a Wayspot a newer scan found gone (`KeptInput.gone`, from `WayspotStorage.gone`) is not brought back by an older file (a newer one brings it back, keeping its `firstSeen`); the storage keeps these guards itself whatever the caller planned (plan 8W-3: an upsert never overwrites a row, kept or gone, last seen after the file's scan, by MySQL's row alias `AS new` with `IF(Wayspot.lastSeen > new.lastSeen, …)`, `lastSeen` assigned last; a row is marked gone only when not seen since the file's scan started, or at its own scan time), so that imports that were not one after the other cannot undo each other either; a row last seen after the file's scan (another server's newer scan) is neither changed nor deleted nor counted (a week-old file does not undo a fresh scan; only a gym that is it now takes it), and one another scan saw after the file's scan started (`scanStartOf`: `startedAt`, else `finishedAt`, never later than the import) is not deleted (a row last seen exactly at the file's scan time is its own: an earlier import of the same scan); moves and renames are silent; `WayspotCounts` counts stops and power spots `added`, `changed` (kind, title, place, address or picture), `gone` (also a stop that became a gym), and `gyms` (kept Wayfarer gyms written, said nowhere and no reason to offer an import). The import reads the kept rows under its lock, writes them after the gyms (`Unrecorded` `wayspots` when it fails or they cannot be read; the gyms stand, and a gym added is then not known to have been a PokéStop) and stores the counts in its row as `wayspots*`; preview and outcome say them in one line (a preview that cannot read them logs it and says nothing of them), and an import that changes only stops and power spots is offered (`changesNothing`, `changesWayspots`). A Wayfarer gym whose adding failed stays a kept `gym` row. A review's Same as (`applyMatch`) and New gym delete the row of the Wayspot the gym now is; New gym gives the gym the kept row's picture. A Wayfarer gym added whose kept row was a stop (`wasStop`) is counted by `GymBatch.add(…, { promoted: true })`: the summary says "Professor Pine has added 12 gyms (3 of them were PokéStops)". The summary also says what the import changed of the stops and power spots (`planKept`'s `byKind`, `WayspotChanges`, given to the batch by `GymBatch.countWayspots` once they are written), each count by its kind: "It also added 120 PokéStops and 3 power spots, changed 4 PokéStops, and removed 2 power spots."; its `gone` is only what left Wayfarer's map, not a stop that became a gym (unlike `WayspotCounts.gone`, which the preview says): a stop Wayfarer now shows as a gym, taken by a Pine gym or not, is counted neither as removed nor as a stop. Its `changed` is only a new kind, a new title or a move over `NOTICED_MOVE_METRES` 10 (`noticeable`): a new address or picture alone is written but not said, so that routine re-imports post nothing (the preview's `changed` still counts them). Real export (43,057): `planKept` 0.2 s, the first write 1.9 s, a write of all again 1.2 s.
-- `ctx.wayspots` is `WayspotDirectory` (`src/services/wayspot-directory.ts`): loaded at start (after the regions) and after every applied import, empty until then; it also holds the stops of Pine's own (plan 8R-1, `setPineStops` from `PineStopService`: kind `stop`, `pineServer` set, keyed `pine-<id>`, in the regions of their own server only; each change bumps both generations; `stop-reports.md`); `byId`, `all`, `inRegion(channelId)`, `regionsOf(id)` (by the outlines, worked out again when `RegionDirectory.generation` changes), `near(point, metres, kinds?)`, `forget(ids)` (an id forgotten while a load reads stays forgotten when the load ends), a `generation` that changes with every load, forget and change of the regions (the region editor of 8M-2 rebuilds on it), and a `contentGeneration` that changes only with what the Wayspots are (every load; not the regions, not a forget: what is built of them passes over a forgotten one through `inRegion` and `byId`), with `whenChanged(listener)` called after each change of it (the search indexes of `PlaceFinder` are built on it, and `PartyService` shows the meetups near a PokéStop or power spot anew, plan 8D). `near` also names a pin: `PlaceFinder.pin` takes the nearest gym of the server or kept PokéStop or power spot within 50 m.
+- Every Wayspot of an applied import is kept (plan 8W-2): table `Wayspot` (migration `2026_10_16_017_wayspot`; a migration merged after it must sort after it, since Kysely refuses an earlier name once 017 ran on a database: 8H's is `2026_10_16_018_party_history`, 016 stays unused; first merge wins, the second renumbers above it, and only a merged migration, or one that already sorts after everything merged, is run on the dev database. The table: the Wayfarer id, `kind`, `formerKind` (the kind before an import last saw it as another; `stop` for a promoted stop), place, title and address plain (not entity-encoded: nothing legacy reads it; cut to 255), picture (`pictureOf`, the address as Wayfarer gives it; a message shows it through `wayspotPicture`: https, `=s400`), `firstSeen` (when an import first kept it: the import's time), `lastSeen` (when the scan of the newest file that saw it was made, `scanTimeOf`: the file's `finishedAt`, else `startedAt`, else the import's time, never later than the import's time: a file dated in the future would freeze its rows); not per server) behind `WayspotStorage` (`WayspotRepository`: `all`, `gone`, `saveFromImport({ upsert, remove, gone }, importedAt, scannedAt, startedAt)` in one transaction of chunks of 500, `remove(ids)`; twin `MemoryWayspots`, both run `wayspotCases`). The pure part is `planKept` (`src/domain/wayspots/keep.ts`, rows `kept.ts`): every Wayspot of the file but those whose id is a Pine gym's `pogoId` (of any server) after the import, which live in `Gym` (a row of one is deleted); a kept row not in the file is marked gone where the file covered its cell (`coveredCells`; plan 8W-3: the row stays with `kind` `gone`, its kind before in `formerKind` and its `lastSeen` the time of the scan that found it gone, never read by `all`; no column was added, ruling: tombstones are kept for good, a few thousand rows at most: nothing prunes them, and every preview and import reads them all, `WayspotStorage.gone`, with the kind each had, `GoneWayspot` (a stop where it is not known, `UNKNOWN_GONE_KIND`, so that no tombstone is left out); one brought back keeps that kind as its `formerKind`, and a Wayfarer gym added that was such a stop counts as one, `promoted`), and a Wayspot a newer scan found gone (`KeptInput.gone`, from `WayspotStorage.gone`) is not brought back by an older file (a newer one brings it back, keeping its `firstSeen`); the storage keeps these guards itself whatever the caller planned (plan 8W-3: an upsert never overwrites a row, kept or gone, last seen after the file's scan, by MySQL's row alias `AS new` with `IF(Wayspot.lastSeen > new.lastSeen, …)`, `lastSeen` assigned last; a row is marked gone only when not seen since the file's scan started, or at its own scan time), so that imports that were not one after the other cannot undo each other either; a row last seen after the file's scan (another server's newer scan) is neither changed nor deleted nor counted (a week-old file does not undo a fresh scan; only a gym that is it now takes it), and one another scan saw after the file's scan started (`scanStartOf`: `startedAt`, else `finishedAt`, never later than the import) is not deleted (a row last seen exactly at the file's scan time is its own: an earlier import of the same scan); moves and renames are silent; `WayspotCounts` counts stops and Power Spots `added`, `changed` (kind, title, place, address or picture), `gone` (also a stop that became a gym), and `gyms` (kept Wayfarer gyms written, said nowhere and no reason to offer an import). The import reads the kept rows under its lock, writes them after the gyms (`Unrecorded` `wayspots` when it fails or they cannot be read; the gyms stand, and a gym added is then not known to have been a PokéStop) and stores the counts in its row as `wayspots*`; preview and outcome say them in one line (a preview that cannot read them logs it and says nothing of them), and an import that changes only stops and Power Spots is offered (`changesNothing`, `changesWayspots`). A Wayfarer gym whose adding failed stays a kept `gym` row. A review's Same as (`applyMatch`) and New gym delete the row of the Wayspot the gym now is; New gym gives the gym the kept row's picture. A Wayfarer gym added whose kept row was a stop (`wasStop`) is counted by `GymBatch.add(…, { promoted: true })`: the summary says "Professor Pine has added 12 gyms (3 of them were PokéStops)". The summary also says what the import changed of the stops and Power Spots (`planKept`'s `byKind`, `WayspotChanges`, given to the batch by `GymBatch.countWayspots` once they are written), each count by its kind: "It also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots."; its `gone` is only what left Wayfarer's map, not a stop that became a gym (unlike `WayspotCounts.gone`, which the preview says): a stop Wayfarer now shows as a gym, taken by a Pine gym or not, is counted neither as removed nor as a stop. Its `changed` is only a new kind, a new title or a move over `NOTICED_MOVE_METRES` 10 (`noticeable`): a new address or picture alone is written but not said, so that routine re-imports post nothing (the preview's `changed` still counts them). Real export (43,057): `planKept` 0.2 s, the first write 1.9 s, a write of all again 1.2 s.
+- `ctx.wayspots` is `WayspotDirectory` (`src/services/wayspot-directory.ts`): loaded at start (after the regions) and after every applied import, empty until then; it also holds the stops of Pine's own (plan 8R-1, `setPineStops` from `PineStopService`: kind `stop`, `pineServer` set, keyed `pine-<id>`, in the regions of their own server only; each change bumps both generations; `stop-reports.md`); `byId`, `all`, `inRegion(channelId)`, `regionsOf(id)` (by the outlines, worked out again when `RegionDirectory.generation` changes), `near(point, metres, kinds?)`, `forget(ids)` (an id forgotten while a load reads stays forgotten when the load ends), a `generation` that changes with every load, forget and change of the regions (the region editor of 8M-2 rebuilds on it), and a `contentGeneration` that changes only with what the Wayspots are (every load; not the regions, not a forget: what is built of them passes over a forgotten one through `inRegion` and `byId`), with `whenChanged(listener)` called after each change of it (the search indexes of `PlaceFinder` are built on it, and `PartyService` shows the meetups near a PokéStop or Power Spot anew, plan 8D). `near` also names a pin: `PlaceFinder.pin` takes the nearest gym of the server or kept PokéStop or Power Spot within 50 m.
 
 ## The review queue
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 705915b1e3a5ed14a7a21c6375317ced467a5548..e78b9cefa0d35673bdb21532ea7c5bdd6cd4087d 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -60,13 +60,13 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - **One code path with `/wild`** (spec 3.5, 3.8): what `/wild` does beyond `SpawnService.report` is `readSpawn` (`src/commands/notifications/wild.ts`: the Pokémon by `wildPokemon`, `appearsInWild` with the settings' exceptions; then the details, which must say something, `SAY_WHERE`, trimmed and cut to `MAX_DETAILS`; a refusal thrown as a `UserError`) and `reportSpawnAs` (`src/commands/notifications/spawn-report.ts`: the report through `SpawnService`, the command's words, a report's link and a region's channel named by the caller's `SpawnNames`: the link and a mention on Discord, `DISCORD_SPAWN_NAMES`; on the map no link and a channel as `#name`; `no-channel`, `refused` and `closed` thrown in `/wild`'s words as a `SpawnNotMade`, a `UserError` with that `kind`). The command's guard and handler and the map call them; the web server is given what `/wild` reads and calls (`SpawnWebDeps.ctx`, `SpawnWebContext`: the bot's context in `src/app.ts`), the channel names the bot sees (`channelName`) and the gateway's `ownViewDenied` (`channels`).
 - **The pick list** `GET /s/<guild>/api/wild-options` (members, as `/api/raid-options`: 401, 403, 503; 30 a minute per address): `wildOptions` (`src/web/wild-options.ts`, pure; types in `src/domain/web/spawn-data.ts`, without imports): every catalogue entry `/wild` takes (`appearsInWild` with `wildExceptionsOf(ctx).species`), a form as that form, in the catalogue's order, as `[key, name]` (about 1,180, 33 KB); kept per catalogue and settings (a `WeakMap` by the `WildExceptions` read), an ETag of its JSON, `private, no-cache`, 304.
-- **A report** `POST /s/<guild>/api/spawns`, body `{ pokemon, details, iv?, lat, lon, region? }` (strict: `pokemon` as `/wild` takes it, a key of the list or typed, 1 to 100 characters; `details` up to 200, blanks allowed so that they are refused in `/wild`'s words; `iv` `perfect` or `zero`; the point, latitude and longitude in range, kept to six decimals; the region's id when the point lies in several). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); where: the regions of this server whose outlines hold the point (`regionsAtPoint`, `src/services/region-directory.ts`: one per channel, in the regions' order), none 422 in `/wild`'s words for a pin outside them (`PIN_NOT_HERE`), several without one of them picked 422 `{ ok: false, text: "This point lies in several regions: pick the one to report the spawn in.", regions: [{ id, name }] }` (any region of the server, spec 2.5; names as the raids' list names them); the region by an id the body names counts only where the point lies in several (a point in one region is reported there whatever it names); the forum of the region picked (`memberAccess`: `barred` 403, as for a raid there; a region without a forum is not asked) and its text channel, where the report goes (`PartyGateway.ownViewDenied`: an overwrite of the member's own that denies View Channel 403, with a forum or without one; not asked of an administrator, whom Discord shows every channel, the server's owner included (`MemberStanding.administrator`); Discord unreachable 503 for either); the limit: a role's overwrite that denies View Channel on the text channel is not looked at, as the raids' checks look at none on the region's channel; `/wild`'s readers (`readSpawn`: 422 in its words as `pageWords` text, "Mewtwo does not appear in the wild.", "Say in details where …") and the pin (`PlaceFinder.pin(row, point, null)`: named by the nearest gym, PokéStop or power spot within 50 m, else a dropped pin), as `/wild`'s guard reads them; only then `/wild`'s throttle in its window (`throttledOnTheMap`, `WILD_COMMAND`, `WILD_THROTTLE`: five in half an hour from Discord and the map together, 429 "You can use /wild again in 30 minutes."), so that a report refused for who reports, where or what is not counted; then `reportSpawnAs` as the member (named by the name Discord has now, `ActingMembers`, as `/wild` names the member who uses it: spawns have no privacy setting), the point as the report's `near` (a `DroppedPin`: the region's message, the Unown copy and the DMs show it as `/wild near:` with a pin shows it), and who wants the Pokémon is told (`NotifyService.spawnReported`, through `DmSender`). The answer (`SpawnAnswer`): 200 `{ ok: true, text: "Reported: a wild Dratini near The Stacks.\nThe report is removed in 30 minutes." }` (`/wild`'s words without the report's link; a pin named by nothing is "at your pin"), 422 `{ ok: false, text }` for a report that was not made (the channel gone, the bot not allowed to post there: "I am not allowed to post in #west, …", a channel the bot sees no name of as `Region 1`), 503 with `Retry-After: 60` and `{ error: "I am restarting just now, so the report was not made. Report it again in a minute." }` for one that came while the bot shuts down (`kind` `closed`: no refusal, the page may try again). Nobody is named in an answer. Logged at info as a command is, one line per report once who reports is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once one is picked; `posted`, `not-made` or `closed`, or what refused it: `not-here`, `several-regions`, `barred`, `unreachable`, `refused` for `/wild`'s readers, `throttled`), "a spawn was reported on the map", never a text or the point.
+- **A report** `POST /s/<guild>/api/spawns`, body `{ pokemon, details, iv?, lat, lon, region? }` (strict: `pokemon` as `/wild` takes it, a key of the list or typed, 1 to 100 characters; `details` up to 200, blanks allowed so that they are refused in `/wild`'s words; `iv` `perfect` or `zero`; the point, latitude and longitude in range, kept to six decimals; the region's id when the point lies in several). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); where: the regions of this server whose outlines hold the point (`regionsAtPoint`, `src/services/region-directory.ts`: one per channel, in the regions' order), none 422 in `/wild`'s words for a pin outside them (`PIN_NOT_HERE`), several without one of them picked 422 `{ ok: false, text: "This point lies in several regions: pick the one to report the spawn in.", regions: [{ id, name }] }` (any region of the server, spec 2.5; names as the raids' list names them); the region by an id the body names counts only where the point lies in several (a point in one region is reported there whatever it names); the forum of the region picked (`memberAccess`: `barred` 403, as for a raid there; a region without a forum is not asked) and its text channel, where the report goes (`PartyGateway.ownViewDenied`: an overwrite of the member's own that denies View Channel 403, with a forum or without one; not asked of an administrator, whom Discord shows every channel, the server's owner included (`MemberStanding.administrator`); Discord unreachable 503 for either); the limit: a role's overwrite that denies View Channel on the text channel is not looked at, as the raids' checks look at none on the region's channel; `/wild`'s readers (`readSpawn`: 422 in its words as `pageWords` text, "Mewtwo does not appear in the wild.", "Say in details where …") and the pin (`PlaceFinder.pin(row, point, null)`: named by the nearest gym, PokéStop or Power Spot within 50 m, else a dropped pin), as `/wild`'s guard reads them; only then `/wild`'s throttle in its window (`throttledOnTheMap`, `WILD_COMMAND`, `WILD_THROTTLE`: five in half an hour from Discord and the map together, 429 "You can use /wild again in 30 minutes."), so that a report refused for who reports, where or what is not counted; then `reportSpawnAs` as the member (named by the name Discord has now, `ActingMembers`, as `/wild` names the member who uses it: spawns have no privacy setting), the point as the report's `near` (a `DroppedPin`: the region's message, the Unown copy and the DMs show it as `/wild near:` with a pin shows it), and who wants the Pokémon is told (`NotifyService.spawnReported`, through `DmSender`). The answer (`SpawnAnswer`): 200 `{ ok: true, text: "Reported: a wild Dratini near The Stacks.\nThe report is removed in 30 minutes." }` (`/wild`'s words without the report's link; a pin named by nothing is "at your pin"), 422 `{ ok: false, text }` for a report that was not made (the channel gone, the bot not allowed to post there: "I am not allowed to post in #west, …", a channel the bot sees no name of as `Region 1`), 503 with `Retry-After: 60` and `{ error: "I am restarting just now, so the report was not made. Report it again in a minute." }` for one that came while the bot shuts down (`kind` `closed`: no refusal, the page may try again). Nobody is named in an answer. Logged at info as a command is, one line per report once who reports is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once one is picked; `posted`, `not-made` or `closed`, or what refused it: `not-here`, `several-regions`, `barred`, `unreachable`, `refused` for `/wild`'s readers, `throttled`), "a spawn was reported on the map", never a text or the point.
 - **The page** (`src/web/client/spawn-forms.ts`, pure: "Report spawn here" (`spawnBox`), the regions a point lies in by the outlines of `/api/geo` (`regionsAt`, `ringContains`), the form as a tree of nodes, its body, reading an answer, `sendSpawnForm` over `pressParty`; the DOM side `spawn-ui.ts`): for a member while the map is not read-only (`reportOffered`, as "Report raid"), a long press or a right click on the map (Leaflet's `contextmenu`, which it also fires for a long press on a phone; also on a raid's picture or dot, at the pointer: Leaflet makes a layer the target of a mouse event only when the layer listens for it (`Map._findEventTargets`), else the map, so no layer of the map may listen for `contextmenu`; one that did would take it, at its own position for a marker; a gym's raids marker is `raidsMarker` of `party-layer.ts`, and `party-layer-contextmenu.isolated.test.ts` runs the real Leaflet's routing over it, plan 8W-3) opens the form in a popup of its own at that point (`spawnAt`; with another form open it says "Close the form that is open first." and opens nothing; at a point in no region of the map's outlines it says "That point is not in a region of this server." at once and opens nothing, `pressedWhere`: the server still decides by its own outlines, at their edges too), and "Report spawn here" in a gym's popup (its own, and that of a gym that shows raids, after "Report raid") opens it in place of its button, the gym's place being the point (the map shows no Wayspots, so no Wayspot popup has it). The form (`spawnForm`): the Pokémon, typed and picked by name from a `datalist` of the pick list (the browser filters it), sent as its key when the name is one of the list's (whatever its letter case), else as typed for the server to read; "Where it is" (required: "Say where it is first: …", the page's own); the IVs, "Not checked" by default; the region where the point lies in several of the map's outlines; whenever the server's answer names regions, the form is drawn again with those, keeping what was filled in (`redrawnAfter`: a region picked stays picked only while it is among them). It is held like the raid forms (`FormHold`: the hold taken before the list is asked for, the controls that open a form, `data-spawn` among them, off meanwhile, a popup's content held, `ready` before it is drawn); a success is said in the notice and closes the form; a refusal is said under the form and in the notice. Spawns are not drawn on the map.
 
 ## Trains on the map (plan 8M-5)
 
 - **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The panel of the post keeps its own answer (it draws itself anew); the map calls the same service methods with the same `from`, `target` and `first`, and words Reverse and the mode with `reverseRouteAs` and `setAtEndAs`. The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opened it before plan 8X-G (the post has Move… and Manage… since, `trains.md`; the map's panel waits for the UX pass), none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the power spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (power spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); power spots as a layer, Add to route from a spot (the add body takes a spot's key already) and the kind menu are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opened it before plan 8X-G (the post has Move… and Manage… since, `trains.md`; the map's panel waits for the UX pass), none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); Power Spots as a layer, Add to route from a spot (the add body takes a spot's key already) and the kind menu are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
 - **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd?, kind? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`; the kind as its `kind`, plan 8X-5, a raid train without one). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the editor or the panel again without the controls); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
 - **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`), `finish` (`{ from }`), `reverse` (`{ from, first }`), `at-end` (`{ from, atEnd }`), and `kind` (`{ kind }`, plan 8X-5: the panel's kind menu, as the post's menu, nothing of where the train is; who may is `mayNotMove`, also without a route; `setKindAs`, "This train is a Gigantamax Train now.", `trainKindSentence`; not one of `PANEL_PRESSES`, the panel's buttons, but `KIND_PRESS`): the Manage train panel, each press carrying where the panel was drawn and where it leads, as the post's controls carry them; the same checks in the same order, who may being `mayNotMove` (the mode: `mayNotArrange`, as `setAtEnd` decides), and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as a press of the panel counts; then `moveTrainAs` (the command's words, where the train is now, "I am telling the others."), `reverseRouteAs` ("The route is reversed. " and where the train is), `setAtEndAs` (`atEndSentence`). The movement message in the post pings as for any move. Logged "a train was moved on the map" (a kind set: "a train's kind was set on the map", `{ user, guild, party, kind, outcome }`). **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
@@ -77,22 +77,22 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - **One code path per command** (spec 3.5, 3.7): what `/meetup`'s form does with `MeetupSafety.make`'s outcome is `makeMeetupAs` (`src/commands/meetups/meetup.ts`: the check of the place, the meetup or the moderators' request, each outcome in `/meetup`'s words, the post and a region's channel named by the caller's `ReportNames`); what `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, `TimedAnswer`: `ok`, `refused` with the reason, `gone`) and `describeAs` (`src/commands/meetups/info.ts`). The commands reply with them (`replyTimed`) or throw them; the map answers them. The web server is given what those commands read and call (`MeetupWebDeps.ctx`, `MeetupWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
 - **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). Nobody is named.
-- **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a power spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a power spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info, one line per request once who makes it is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once it is one of the server's; `makeMeetupAs`'s kind, or what refused it: `no-region`, `no-forum`, `barred`, `unreachable`, `blocked`, `refused` for `/meetup`'s guards and form, `throttled`), "a meetup was made on the map", never a text or the place.
+- **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a Power Spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a Power Spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info, one line per request once who makes it is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once it is one of the server's; `makeMeetupAs`'s kind, or what refused it: `no-region`, `no-forum`, `barred`, `unreachable`, `blocked`, `refused` for `/meetup`'s guards and form, `throttled`), "a meetup was made on the map", never a text or the place.
 - **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 021 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
-- **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power spots are never offered here (they are `/api/powerspots`'s, plan 8X-5, for max battles), nor other Wayspots; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
+- **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power Spots are never offered here (they are `/api/powerspots`'s, plan 8X-5, for max battles), nor other Wayspots; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
 - **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end, the map, which crosses forums, asks more, as for raids); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
 - **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeTime`, `src/domain/web/clock.ts`: "in 5 h", "1 h 30 min ago", "now"), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
-- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on the pane of the rings (`RING_PANE`, `rings`, which the trains' rings share), above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
+- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on the pane of the rings (`RING_PANE`, `rings`, which the trains' rings share), above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power Spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
 - **Not in it:** a meetup's place cannot change after it is made (no route for it); a member cannot withdraw a pending request; Report on a meetup (8S-2); meetups on Campfire; the PokéStops are drawn only in "pick a place" mode, not from a zoom level up (a question per pan for every member, for little: left for staging to say whether it is wanted); an end given when the meetup is made (`/meetup` takes none, and a request kept for the moderators has no end: it is set with the editor once the meetup is posted).
 
 ## Max battles on the map (plan 8X-5)
 
-- **Scope** (Matt, 2026-10-22: the page may change after the map's staging, from a CSS polish with layers to choose to more; the technology matters little): the server side alone, what a new page would use unchanged: the data, the routes, the code paths they share with `/max`. The page (`src/web/client/`) has no max battle feature yet: no power spot layer, no max battle markers or popups, no report form, no kind menu, no Remote button, no Add to route from a spot; they are left for the UX pass (follow-ups, "From Phase 8X-5"). The page as it is reads `raids`, `trains` and `meetups` and ignores the rest.
+- **Scope** (Matt, 2026-10-22: the page may change after the map's staging, from a CSS polish with layers to choose to more; the technology matters little): the server side alone, what a new page would use unchanged: the data, the routes, the code paths they share with `/max`. The page (`src/web/client/`) has no max battle feature yet: no Power Spot layer, no max battle markers or popups, no report form, no kind menu, no Remote button, no Add to route from a spot; they are left for the UX pass (follow-ups, "From Phase 8X-5"). The page as it is reads `raids`, `trains` and `meetups` and ignores the rest.
 - **One code path with `/max`** (spec 3.5; `src/commands/max/max-report.ts`): `reportMaxAs` (the report as the member: privacy and automatic status from their settings, `PartyService.reportMax`, a new pin battle logged for staff and told to the moderators, `ModerationReports.maxAtPin`), `maxReportWords` and `takenWords` with the caller's `MaxNames` (`ReportNames` plus `ended`, `bossHint`, `pinBlocked`; on the map no post, a region as `#name`), `maxBarred` over `MaxAccess` (the forum a new battle would go to and that of the battle at the spot), `blockedAtPin` (staff passed in: `isMapStaff` on the map; `reportMaxAs` takes `{ mayJoin, staff }` and asks it again through `MaxReport.mayCreateAtPin`, so that a battle at a pin that ends before the report is written leaves no new one by a blocked member, `pin-blocked`); `spotAt` (`max-input.ts`) names a spot without an interaction, and `readSpot` names its pins through it; `endingSoonQuestion` (`src/render/max-dialog.ts`) words the ending-soon question for the dialog and the map, each choice with the end it reports. The web server is given what `/max` reads and calls (`MaxWebDeps.ctx`, `MaxWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
 - **The view:** `PartiesView.maxes`, a list of its own in the order the battles were made: `MapMax` (`party-data.ts`), with `MapRaid`'s names where they mean the same, so that one page component can draw both: `id`, `spotId` (the Wayfarer id as `/api/powerspots` lists it, null for a pin), `picture` (the boss's as the post shows it, only from `pictureOrigins`), `level` (`D1` to `G`), `tier` (`Dynamax 2★`), `boss`, `title` (`Dynamax Machamp (2★)`), `endTime`, `link`, `place` (the spot as Where names it: as it is now while it is the same place, `spotNow`; a pin `Unlisted power spot`, address null; six decimals), `attendance` (Done always offered). None once its end has come (`maxEnded`); nothing of it is changed on the map. How the post shows it comes from the renderer (`maxLook`, `src/render/max-post.ts`, over `PartyService.maxView`), given to the pure view as `PartyViewInput.maxLook` (`PartyWebDeps.maxLook`), as `look` is for raids; every route that draws a party passes it.
-- **The power spots of a box** `GET /s/<guild>/api/powerspots?south&west&north&east`: as `/api/stops` (both through `wayspotsInBox`, `src/web/wayspot-box.ts`): members (401, 403, 503), the same box (400 otherwise), the titled power spots in a region of the server, the nearest to the box's middle first, at most `MAX_MAP_SPOTS` (300), `more`; `PowerSpotsView` (`src/domain/web/max-data.ts`), `[id, lat, lon, title]`; `private, no-store`; 60 a minute per address.
+- **The Power Spots of a box** `GET /s/<guild>/api/powerspots?south&west&north&east`: as `/api/stops` (both through `wayspotsInBox`, `src/web/wayspot-box.ts`): members (401, 403, 503), the same box (400 otherwise), the titled Power Spots in a region of the server, the nearest to the box's middle first, at most `MAX_MAP_SPOTS` (300), `more`; `PowerSpotsView` (`src/domain/web/max-data.ts`), `[id, lat, lon, title]`; `private, no-store`; 60 a minute per address.
 - **The pick lists** `GET /s/<guild>/api/max-options`: `maxOptions` (`src/web/max-options.ts`, pure; types in `max-data.ts`): `/max`'s bosses of the moment in its order (`currentMaxBossChoices`: the featured first, the Gigantamax first in a big event's hours), each `{ value, name, level, tier, featured, image? }`, the value its choice has (`m:<tier>:<key>`, which `readMaxBoss` reads back; none over 100 characters), the picture a post would show (the game's icon, `maxBossPicture`, else the list's) only from `pictureOrigins`; `tiers` for a boss on no list (`TIER_CHOICES`); `zone`. Members, an ETag of its JSON, `private, no-cache`, 304; 30 a minute per address.
-- **A report** `POST /s/<guild>/api/maxes`, body `{ spot }` (a power spot's Wayfarer id) or `{ lat, lon }` (a point), `region?`, `boss` (a value of the list or typed, up to 100), `tier?` (`D1` to `G`, as `/max`'s `tier:`), `end?` (as `end:` takes it, up to 40), `soon?: { value: 'next' | 'soon', end }` (strict; both a spot and a point, neither, or `soon` with a typed end: 400). Before the body is read: 30 a minute per address (`MAX_WRITES_PER_ADDRESS_MINUTE`) and `postGuard`. Then, in this order, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the spot (`spotAt`: a power spot by its id, refused `PLACE_GONE` once Pine keeps it no more or it lies in no region of the server; a point, kept to six decimals, in a region of the server, else `PIN_NOT_HERE`, which is the nearest power spot within 50 metres, else an unlisted power spot: the map's point is what a pin is, Q7, as `/max` takes a maps link); the regions of the server at its point (`regionsAtPoint`): several without one of them picked 422 `{ ok: false, text: "This place lies in several regions: pick the one to report the max battle in.", regions }` (names as the raids' list names them); `/max`'s readers (`readMaxBoss`, `reportedEnd`: 422 in their words, the last battle time; where `/max` names its option `tier:`, `WHICH_TIER`, the map says "Which tier? Pick the tier of this boss." with `needs: 'tier'`; where it names the list that appears while one types, `UnknownMaxBoss`, the map says "I know no Pokémon called "…". Pick a boss from the list." with `needs: 'boss'`, `mapUnknownBoss`); a `soon` whose end has passed 422 "That battle has ended meanwhile: nothing was reported." (the dialog's Submit's words); another boss at the spot 409 in `takenWords` (the battle there as `max` where the member may see it, its forum always asked of Discord: this comes before `maxBarred`; no post named, the hint of `/boss` in the map's words); a new battle at a pin by a member blocked from meetups 403 in the map's words, "… Pick a power spot on the map." (`MAP_PIN_BLOCKED`; `/max`'s `MAX_PIN_BLOCKED` names its list), with `needs: 'listed-spot'` (joining the battle there is allowed, as from `/max`); the forums (`maxBarred`: 403 `{ error: MAX_BARRED }`, Discord unreachable 503); **the ending-soon question** where `/max` opens its dialog (a new battle, no typed end, its end within five minutes), unless `/max`'s window is full (429 as the throttle below answers, nothing counted: `throttledOnTheMap` with `count: false`, as Discord refuses `/max` before its dialog opens): 422 `{ ok: false, text, soon: { choices: [{ value, label, end }] } }` in the dialog's words (until the next rotation first, then until the end about to pass; only the latter, with "Report it anyway?", where no later rotation is left); the report sent again with `soon` takes that end while it is a choice the server offers now (decided anew, no state kept between the two requests), else is asked again with the new choices; a page drops `soon` once that end has passed (a report sent with it is refused as the dialog's Submit refuses it, even where a report without it would pass). Only then `/max`'s throttle in its window (`MAX_COMMAND`, `MAX_THROTTLE`: `/max` counts one use for its dialog and Submit, the map one for the report sent again); then `reportMaxAs` as the member fetched fresh, a battle that came meanwhile in another forum asked about (`mayJoinNoting`: Discord away 503); `no-post` and `ended` give the use back (`givenBackOnTheMap`), and so does `pin-blocked` (the battle at a pin a blocked member would join ended before the report was written: 403 `MAP_PIN_BLOCKED` with `needs: 'listed-spot'`, as the check above). `needs` (`MaxNeed`, `max-data.ts`) is the machine part of a refusal a page acts on: `tier`, `listed-spot`, `boss`; the words are only to be shown. `/max`'s words that name `/max` or its options are said on the map in its own (the namer, `MaxNames`: `ended`, "The max battle there has just ended: report it again.", `MAP_MAX_ENDED`; `bossHint` after another boss's battle, "Open its post and use /boss there to change its boss.", `MAP_BOSS_HINT`; `pinBlocked`, `MAP_PIN_BLOCKED`; and in the route a spot no region's outline holds any more, "… Pick a power spot on the map.", `MAP_NOT_HERE`, where `/max` says `NOT_HERE`); `/max`'s stay as they are. The answer (`MaxAnswer`): 200 `created`, 409 `exists` (joined: "You have been marked as interested.") and `taken`, 422 `ended`, `no-region` and `no-forum`, 403 `barred` and `pin-blocked`, 503 `no-post` (none of the member's doing, the use given back); `{ ok, text, max? }` with the battle as the map shows it where the member is not kept out of its forum, and " It was posted in #west." after the words when the region picked has no forum and the battle went to another region of the spot (`regionForSpot`). Logged at info once who reports is known, a refusal too: `{ user, guild, spot | pin, outcome }` (the spot's Wayfarer id, or `pin: true`, once known; the outcome's kind, or `no-spot`, `refused`, `several-regions`, `taken`, `blocked`, `barred`, `unreachable`, `ends-soon`, `throttled`), "a max battle was reported on the map", never a text or the point; a new pin battle is also logged by `reportMaxAs` for staff, with its point, as from `/max`.
+- **A report** `POST /s/<guild>/api/maxes`, body `{ spot }` (a Power Spot's Wayfarer id) or `{ lat, lon }` (a point), `region?`, `boss` (a value of the list or typed, up to 100), `tier?` (`D1` to `G`, as `/max`'s `tier:`), `end?` (as `end:` takes it, up to 40), `soon?: { value: 'next' | 'soon', end }` (strict; both a spot and a point, neither, or `soon` with a typed end: 400). Before the body is read: 30 a minute per address (`MAX_WRITES_PER_ADDRESS_MINUTE`) and `postGuard`. Then, in this order, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the spot (`spotAt`: a Power Spot by its id, refused `PLACE_GONE` once Pine keeps it no more or it lies in no region of the server; a point, kept to six decimals, in a region of the server, else `PIN_NOT_HERE`, which is the nearest Power Spot within 50 metres, else an unlisted power spot: the map's point is what a pin is, Q7, as `/max` takes a maps link); the regions of the server at its point (`regionsAtPoint`): several without one of them picked 422 `{ ok: false, text: "This place lies in several regions: pick the one to report the max battle in.", regions }` (names as the raids' list names them); `/max`'s readers (`readMaxBoss`, `reportedEnd`: 422 in their words, the last battle time; where `/max` names its option `tier:`, `WHICH_TIER`, the map says "Which tier? Pick the tier of this boss." with `needs: 'tier'`; where it names the list that appears while one types, `UnknownMaxBoss`, the map says "I know no Pokémon called "…". Pick a boss from the list." with `needs: 'boss'`, `mapUnknownBoss`); a `soon` whose end has passed 422 "That battle has ended meanwhile: nothing was reported." (the dialog's Submit's words); another boss at the spot 409 in `takenWords` (the battle there as `max` where the member may see it, its forum always asked of Discord: this comes before `maxBarred`; no post named, the hint of `/boss` in the map's words); a new battle at a pin by a member blocked from meetups 403 in the map's words, "… Pick a Power Spot on the map." (`MAP_PIN_BLOCKED`; `/max`'s `MAX_PIN_BLOCKED` names its list), with `needs: 'listed-spot'` (joining the battle there is allowed, as from `/max`); the forums (`maxBarred`: 403 `{ error: MAX_BARRED }`, Discord unreachable 503); **the ending-soon question** where `/max` opens its dialog (a new battle, no typed end, its end within five minutes), unless `/max`'s window is full (429 as the throttle below answers, nothing counted: `throttledOnTheMap` with `count: false`, as Discord refuses `/max` before its dialog opens): 422 `{ ok: false, text, soon: { choices: [{ value, label, end }] } }` in the dialog's words (until the next rotation first, then until the end about to pass; only the latter, with "Report it anyway?", where no later rotation is left); the report sent again with `soon` takes that end while it is a choice the server offers now (decided anew, no state kept between the two requests), else is asked again with the new choices; a page drops `soon` once that end has passed (a report sent with it is refused as the dialog's Submit refuses it, even where a report without it would pass). Only then `/max`'s throttle in its window (`MAX_COMMAND`, `MAX_THROTTLE`: `/max` counts one use for its dialog and Submit, the map one for the report sent again); then `reportMaxAs` as the member fetched fresh, a battle that came meanwhile in another forum asked about (`mayJoinNoting`: Discord away 503); `no-post` and `ended` give the use back (`givenBackOnTheMap`), and so does `pin-blocked` (the battle at a pin a blocked member would join ended before the report was written: 403 `MAP_PIN_BLOCKED` with `needs: 'listed-spot'`, as the check above). `needs` (`MaxNeed`, `max-data.ts`) is the machine part of a refusal a page acts on: `tier`, `listed-spot`, `boss`; the words are only to be shown. `/max`'s words that name `/max` or its options are said on the map in its own (the namer, `MaxNames`: `ended`, "The max battle there has just ended: report it again.", `MAP_MAX_ENDED`; `bossHint` after another boss's battle, "Open its post and use /boss there to change its boss.", `MAP_BOSS_HINT`; `pinBlocked`, `MAP_PIN_BLOCKED`; and in the route a spot no region's outline holds any more, "… Pick a Power Spot on the map.", `MAP_NOT_HERE`, where `/max` says `NOT_HERE`); `/max`'s stay as they are. The answer (`MaxAnswer`): 200 `created`, 409 `exists` (joined: "You have been marked as interested.") and `taken`, 422 `ended`, `no-region` and `no-forum`, 403 `barred` and `pin-blocked`, 503 `no-post` (none of the member's doing, the use given back); `{ ok, text, max? }` with the battle as the map shows it where the member is not kept out of its forum, and " It was posted in #west." after the words when the region picked has no forum and the battle went to another region of the spot (`regionForSpot`). Logged at info once who reports is known, a refusal too: `{ user, guild, spot | pin, outcome }` (the spot's Wayfarer id, or `pin: true`, once known; the outcome's kind, or `no-spot`, `refused`, `several-regions`, `taken`, `blocked`, `barred`, `unreachable`, `ends-soon`, `throttled`), "a max battle was reported on the map", never a text or the point; a new pin battle is also logged by `reportMaxAs` for staff, with its point, as from `/max`.
 - **Remote** on the map is the parties' press `remote` (above, "The parties on the map"), for every kind whose post has Remote; **the train's kind** is in "Trains on the map".
 
 ## Reports at stops on the map (plan 8R-3)
@@ -102,7 +102,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **Who sees which reports** (review R1): a report lies in the regions of the server whose outlines hold its stop's snapshot (`regionsAtPoints`: the server's regions taken once a request and each outline's box tried first, `containment` as the pinned post's; each report placed once, for who may see it and for the view alike; a stop renamed or gone later the same day stays, design 3), and shows unless the member is `barred` from the forum of every one of them (a region without a forum always shows it): the parties' rule, through the same `PartyViewers` (one for `/api/parties` and `/api/stop-reports`, made in `guildRoutes`, so that what Discord said of a forum serves both; read-only while Discord is away, 503 for a member it has not confirmed lately). No text channel is fetched. A report in no region now is shown to nobody.
 - **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt` (a lineup's with its label, `MapGrunt.lineup`, plan 8R-4L; `MapHideout` has none); `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `madeAt` (with `id` its version, which a take-back sends back, plan 8R-4L, review L1), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (the task's key, `typed:<key>` for a typed task: it tells tasks apart and is never sent back as a report's `task`; the same task at more stops is sent as `sameAs` of the report's `id`), `text`, `category`, `typed`, `rewards`; grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (its first catch's, as the post shows it). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
 - **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards }`, `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note?, lineups? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), a grunt type's two lineups (plan 8R-4L, B9; `RocketLineupOption`: `key` `grunt:water:male`, `value` `<key>#<fingerprint>` as a report sends it, `label` the first slot in short, `fingerprint`, `catches`; in the feed's order, the type's own `key` then "not sure which"), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
-- **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, stops }` or `{ sameAs, stops }` (strict, one or the other, never both nor neither: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…"; one to five stop keys, each up to 60). Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a power spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew +4`, a line per stop, where it shows), the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends another report with `sameAs`, counted in `/research report`'s window as the command's menu is.
+- **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, stops }` or `{ sameAs, stops }` (strict, one or the other, never both nor neither: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…"; one to five stop keys, each up to 60). Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a Power Spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew +4`, a line per stop, where it shows), the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends another report with `sameAs`, counted in `/research report`'s window as the command's menu is.
 - **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key, a lineup's `value` (plan 8R-4L: a fingerprint not of now is `LINEUPS_CHANGED`, uncounted) or a name typed in full, 1 to 100; a lineup over "not sure which" or the other lineup refines the grunt in place, as `/rocket` does, its `grunt` keeping its id; the question names a lineup by `rocketLabel`; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (counted, as `/rocket` counts it, 8R-2); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
 - **Taking back** `POST /s/<guild>/api/stop-reports/<id>/remove` (body empty, `{}`, or `{ madeAt }`, the report's `madeAt` as the list gave it, plan 8R-4L, review L1; an id that is not 1 to 10 digits 404 before the body): after the session, the body and `actingOnTheMap`, the report by id of this server that has not ended (`StopReportService.get`: an unknown id, another server's and one gone answer alike, 409 `{ ok: false, text: NOTHING_LEFT }`, R14), the member's own or any for staff (`isMapStaff` of the member fetched fresh; 403 `{ ok: false, text: NOT_YOUR_REPORT }`), with a `madeAt` that is no longer the report's before that (a grunt refined in place since keeps its id: 409 `{ ok: false, text: REPORT_CHANGED }`, for its first reporter and staff alike, and again where `takeBackAs` meets a refine meanwhile, `changed`), none counted; then `MEMBER_WRITE_THROTTLE` in `/research remove`'s or `/rocket remove`'s window by the report's kind; then `takeBackAs`: 200 `{ ok: true, text: "Took back Catch a Dragon-type Pokémon at Yellow Mural." }`. A hideout put back under a new id (8R-2's fix S3) is found by the page's next poll, not by the old id. Logged `{ user, guild, report, outcome }`, "a report at a stop was taken back on the map".
 
@@ -113,9 +113,9 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **The data** `GET /s/<guild>/api/regions/edit` (`EditorCache` over `editorView`, `src/domain/web/editor-view.ts`; types in `editor-data.ts`, without imports): the server's regions (id, channel id and name, category, description, outline, `version`), other servers' regions whose boxes meet the box of the server's outlines grown by 2 km (outlines only), the gyms in its regions and those in no region of any server inside that box (`[id, lat, lon, name]`), the kept Wayspots inside it (`[kind, lat, lon, title]`, no addresses or pictures), the text channels that are no region of any server; places at six decimals. The static part is kept per server until the generations of gyms, regions and Wayspots or the server's channels change; who asks (`userId`, `readOnly`, `mayManageChannels`, and the channels, none while read-only) is put in front per request; the ETag covers both; `private, no-cache`; 20 a minute per address (each asks Discord). 401, 403, 503 as the page (read-only while Discord is unreachable only for staff seen lately, as the page).
 - **Versions:** `regionVersion` (`src/domain/regions/version.ts`): base64url of SHA-256 (written out in pure code, so the page has it too) over the outline at six decimals and the region's description, cut to 16. A changed or removed region is sent with the version its first staged edit saw. Wherever an outline enters a draft (drawn, split, of a file: `record`) and wherever the server takes one (`planSave`), it is `normalisedOutline` (six decimals, a corner the rounding repeats dropped), so page and server see the same corners.
 - **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 while unreachable: "Discord cannot be reached just now, so nothing can be saved. Try again in a moment." to staff it confirmed within 30 minutes, `StaffSeen`, and to anybody else the page's "… so I cannot tell whether you are staff.", which promises no save, plan 8M-6), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file, names and categories up to 1,000 characters: anything beyond is malformed, 400; a new channel's name over 100 characters or its category over 200 is refused by `planSave` with a line naming the region, 422, and the page's fields have those `maxlength`s, a KML description being cut to 200 by `kmlEdit`). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`) in what the import will write (`outlinesWritten`: the areas the preview of `RegionAdminService` leaves out are not written, so a removal whose replacement is left out is checked as a removal alone), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time, at most three waiting beyond it, any more 503 "Busy checking other saves: try again in a minute."; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; polyclip throwing in the thread (its answer `{ ok: false }`) is logged and does not block; a thread that does not start, fails otherwise or ends without an answer is 503 "I cannot check the outlines just now: try again in a minute."), its verdict kept five minutes by a hash of the request, the server's regions (`regionsStamp`) and the areas the import leaves out, never its channels (plan 8M-6: a channel coming or going leaves the outlines as they are), so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", a new channel's name said as typed in the panel, not read from a file: "is it a typo?", "a typo in a name makes a channel of that name", plan 8M-6; and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one of the save changed meanwhile, 409 `conflicts`; then compares what the save was planned and checked against with this server's regions now (`regionsStamp` and `channelsStamp`, plan 8M-6: the versions of its regions, which of its channels is which region, also a row of no server on one of them, and, by id, name, kind and category, only the channels the save depends on: the channels and forums of those regions, the channels it takes by id, and every channel or category whose `channelKey` is a name its areas go to or whose `categoryKey` is a category a new channel of theirs names or that its preview puts one into (a full category's overflow, `<name> 2`, plan 8S-4), a category with how many channels it holds (one filled meanwhile has no room for what was planned); another server's regions and the server's other channels, such as a ticket or voice bot's that come and go all day, are no part of it), and does nothing when anything differs (another save adding the same channel, two saves that together make a new overlap, a channel or category of a name the save would make or use made or renamed on Discord meanwhile), 409 `stale` "The regions changed meanwhile: preview again.", on which the page loads the regions and previews again; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: the bot's mentions as `#name`, no markdown, and outside the code spans of names the bot made (a backtick after an even number of backslashes; one after an odd number was typed) the escapes of `plain` undone by `unplain`: `north_hills`, not `north\_hills`, one backslash for a typed one, `1. Uptown`, a typed backtick as typed; the mentions are named before `unplain`, so a typed `<#…>` stays text; plan 8M-6); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
-- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name stages no channel (`pickerChange`): the channel the region had staged (a name typed before, or one of the list) is taken off with one edit (plan 8M-6: what Save sends is never a name the panel no longer shows), and nothing is recorded when it had none. What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, power spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
+- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name stages no channel (`pickerChange`): the channel the region had staged (a name typed before, or one of the list) is taken off with one edit (plan 8M-6: what Save sends is never a name the panel no longer shows), and nothing is recorded when it had none. What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, Power Spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
 - **Overlaps and gaps** (`src/domain/regions/coverage.ts`, polyclip-ts): pairwise intersections of outlines whose boxes meet (cached per pair of outlines by identity), gaps the holes of the union less what lies in them (`newProblems` cuts the gaps over the outlines whose boxes chain to what changed, `chainedTo`, so a region that closes a ring of regions is seen to close its hole); areas on the sphere (Lambert cylindrical equal-area); a piece thinner than 0.5 m on average (twice its area over its perimeter) is the six-decimal rounding and left out. A piece is new unless 90 % of its area lies inside one piece of its kind of the loaded outlines (so a shrunk overlap, or one split between two regions, is not new).
-- **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
+- **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, Power Spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
 - **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
 
 ## The Wayspot export tool (plan 8W-P)
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 8b1899118671d3cdfee7fdbfa3d5454b160323fc..6f2d8a6e0d31b87ab47d26a3efa9858922d8723b 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -279,7 +279,7 @@ They can take a little while to show up in Discord.
 
 ### 4.10 Check that it works
 
-- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a power spot (`/max`; the power spots come from `/gym import` of a Wayfarer export, and without it only a maps link works for `spot:`, as an "Unlisted power spot"); a train (`/train`; `kind:` for a train of Dynamax or Gigantamax battles, whose `/route add stop:` offers the power spots first); a meetup (`/meetup`); field research (`/research report`, which the region's pinned post "Today at the stops" shows); Team GO Rocket (`/rocket report`: a grunt is a message in the region channel for half an hour, a leader, Giovanni or a decoy goes in the pinned post).
+- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a Power Spot (`/max`; the Power Spots come from `/gym import` of a Wayfarer export, and without it only a maps link works for `spot:`, as an "Unlisted power spot"); a train (`/train`; `kind:` for a train of Dynamax or Gigantamax battles, whose `/route add stop:` offers the Power Spots first); a meetup (`/meetup`); field research (`/research report`, which the region's pinned post "Today at the stops" shows); Team GO Rocket (`/rocket report`: a grunt is a message in the region channel for half an hour, a leader, Giovanni or a decoy goes in the pinned post).
 - A direct message: set a want (`/want`) and have somebody else report that boss.
 - A screenshot of a raid posted with a mention of the bot (the bot itself, not a role of the same name).
 
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index 6895c364578e44c7c8f4e5e3ccdfa6e144fbb137..1ddb7198b0c7c0e533042d4fc7efb8e32920361d 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -167,13 +167,13 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 - **One at a time:** `/gym add` with the link Pokémon GO shares for the gym (or its coordinates) and its name. `/gym edit`, `/gym move` and `/gym delete` change it later.
 - **PokéStops Wayfarer does not list** (sponsored ones): `/pokestop add` with its name and the link Pokémon GO shares for it (or a maps link, or its coordinates); `/pokestop edit` and `/pokestop remove` change it later. Members find it wherever a PokéStop is asked for.
-- **All at once, from Wayfarer:** `/gym import` reads an export of the gyms, PokéStops and power spots Wayfarer has. The export is made by the Pine Wayspot export tool: ask for it at https://profpine.com/userscript (your settings' `wayspotTool`, which `/help gym` names). It takes the KML file of `/region export`. Then attach the file it saves to `/gym import`: it shows what it would do first, and what needs a person goes to `/gym review`. `/help gym` has the details, and [wayfarer.md](../architecture/wayfarer.md) the whole design.
+- **All at once, from Wayfarer:** `/gym import` reads an export of the gyms, PokéStops and Power Spots Wayfarer has. The export is made by the Pine Wayspot export tool: ask for it at https://profpine.com/userscript (your settings' `wayspotTool`, which `/help gym` names). It takes the KML file of `/region export`. Then attach the file it saves to `/gym import`: it shows what it would do first, and what needs a person goes to `/gym review`. `/help gym` has the details, and [wayfarer.md](../architecture/wayfarer.md) the whole design.
 
 ## 7. Forums
 
 Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), its tags, and a pinned list of what is going on ("Going on now": its raids, max battles, trains and meetups). It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
-Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a power spot: the power spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with power spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today at the stops" shows it), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in the pinned post), `/want` and a report of that boss by somebody else. `/help` lists everything.
+Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a Power Spot: the Power Spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with Power Spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today at the stops" shows it), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in the pinned post), `/want` and a report of that boss by somebody else. `/help` lists everything.
 
 ## 8. Running it
 
diff --git a/docs/superpowers/plans/2026-10-16-phase-8w2-staging.md b/docs/superpowers/plans/2026-10-16-phase-8w2-staging.md
index caa0df49ec5f71167be9c310615f2743c62cc1a2..58d62175783d20b191cfea45a229b427d74b0700 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8w2-staging.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8w2-staging.md
@@ -10,7 +10,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 ## `/gym import`
 
-4. The preview has the line "PokéStops and power spots for `/wild` and the map: N new" (a first import: every stop and power spot of the file). An export that changes no gym but brings stops is offered (Import / Cancel), not "would change nothing".
+4. The preview has the line "PokéStops and Power Spots for `/wild` and the map: N new" (a first import: every stop and power spot of the file). An export that changes no gym but brings stops is offered (Import / Cancel), not "would change nothing".
 5. Import: the outcome has the same line; the log has "Wayspots loaded" with the count (Pittsburgh: about 37,000 stops and power spots, and the Wayfarer gyms Pine did not take). Note how long the import took and the `ms` of that line.
 6. Import the same file again: no line about stops (nothing changed), and the preview says it would change nothing.
 7. A Wayfarer gym that was a stop in an earlier import (Pittsburgh may have one between two scans; else edit a kept row's `kind` to `stop` by hand in the dev database before the second import): the bot-updates summary says "added N gyms (1 of them was a PokéStop)". A review's New gym of such a candidate: the gathered summary says "(it was a PokéStop)".
diff --git a/docs/superpowers/plans/2026-10-21-phase-8x3-staging.md b/docs/superpowers/plans/2026-10-21-phase-8x3-staging.md
index 113e48b58edd9b7b897ace80e2321a3e03852957..285a0694bfcaa236eafc20e1a8e3e34dc236bc54 100644
--- a/docs/superpowers/plans/2026-10-21-phase-8x3-staging.md
+++ b/docs/superpowers/plans/2026-10-21-phase-8x3-staging.md
@@ -12,7 +12,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 ## Reporting
 
 5. **phone** As Tester, `/max boss:` autocomplete: the week's featured boss first (this week's Max Monday boss), then 5★ down to 1★, Gigantamax last, each choice with its tier ("Machamp · Dynamax 2★"). Typing a boss on no list asks `tier:` ("Which tier? Add `tier:`"). `spot:` offers the region's Power Spots first.
-6. `/max boss:<1★ boss> spot:<a Power Spot>` on an ordinary weekday morning: the post's heading `### Dynamax <boss> (1★)`, its picture, "Until 9:00 PM", types and weaknesses; Where `**<spot>** (power spot) · <address> · [Map]` with the Wayfarer picture; one group `0/4 coming`; buttons as a raid's but no Set time and no Screenshot feedback, Remote kept. The thread title `Dynamax <boss> (1★) · <spot>`, the `Max battle` tag, the region channel's link line "New max battle: <#post>", the summary's **Max battles** section after the raids.
+6. `/max boss:<1★ boss> spot:<a Power Spot>` on an ordinary weekday morning: the post's heading `### Dynamax <boss> (1★)`, its picture, "Until 9:00 PM", types and weaknesses; Where `**<spot>** (Power Spot) · <address> · [Map]` with the Wayfarer picture; one group `0/4 coming`; buttons as a raid's but no Set time and no Screenshot feedback, Remote kept. The thread title `Dynamax <boss> (1★) · <spot>`, the `Max battle` tag, the region channel's link line "New max battle: <#post>", the summary's **Max battles** section after the raids.
 7. **The default end by the day** (the clock as reported): a Dynamax battle on an ordinary day ends at 21:00; on a Max Monday (06:00–21:00) at the next full hour; during the 2026-10-24 Max Battle Day (14:00–17:00) at the next :00 or :30; reported before 14:00 on 10-24 at 14:00; a Gigantamax battle (Machamp, from `/admin boss add tier:Gigantamax`, or typed) at the next full hour. A report after 21:00 is refused ("Max battles are over for today…"); one before 06:00 ends at 21:00 (or the next rotation counted from 06:00).
 8. **phone** **Ending soon:** a report less than 5 minutes before its default end opens the dialog: "Until the next rotation, <time>" first and picked (Android: selected at opening; iPhone: whether Submit works without a tap), then "Until <end> (in n minutes)". OK reports with the chosen end, Cancel makes nothing. At 20:56 (no later rotation): the plain "Report it anyway?". With `end:` typed: no dialog.
 9. **One per spot:** a second report at the same spot with the same boss joins the battle ("There is already a max battle against it…", signed up); another boss is refused with the post named and the `/boss` hint; Gigantamax where a Dynamax battle stands is refused without the `/boss` hint. In the post `/boss <another Dynamax boss>` changes the boss and tier; `/boss` to a Gigantamax boss is refused.
@@ -23,7 +23,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 12. Four accounts Join: all in A (`4/4 coming`); a fifth (or a +1) opens B silently (no line, no ping); B's heading `1/4 coming`. Group… moves a member; a member over the size shows `5/4 · over the lobby size…`.
 13. **Meet…** offers the 5-minute times of the next hour, up to the end, and "No meeting time" when one is set; `/meet 20` sets a group's time; every member of that group gets the meeting DM naming "the max battle at <spot>". `/cancel-meet` works.
-14. `/end` moves the end earlier and later (within the day, not past 21:00); later at a spot whose time another battle would take is refused. `/where` names the spot as the post does (rename a Wayspot in the database first if convenient); `/request` and `/target` in the post say "A max battle is at a power spot, not a gym…".
+14. `/end` moves the end earlier and later (within the day, not past 21:00); later at a spot whose time another battle would take is refused. `/where` names the spot as the post does (rename a Wayspot in the database first if convenient); `/request` and `/target` in the post say "A max battle is at a Power Spot, not a gym…".
 15. Done completes (not leave); the completion question as for a raid; the post shows "Ended" past its end; the clock warns and archives by the raid rule.
 16. `/report` and "Report to moderators" on the post reach the moderators' channel ("Reported max battle", Where the spot); `/delete` by staff has its own wording.
 17. **phone** The post with five groups on a phone (the worst case).
diff --git a/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md b/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md
index 2bf95df08b3e99f448bc30952c07b9b0c3709c8c..d18dc6217e1f87caa19d625c68498248541f2abe 100644
--- a/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md
+++ b/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md
@@ -1,6 +1,6 @@
 # Phase 8X-4 staging checklist: train kinds and Power Spot stops (draft)
 
-Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member); a third account where a step says so. Look at the steps marked **phone** on Android and on an iPhone. The design is `docs/superpowers/specs/2026-10-20-max-battles-design.md`, section 6; the conventions are `docs/architecture/trains.md` ("Kinds and power spots"), `parties-and-posts.md`, `history.md`, `web.md`. The steps marked "(from 8B-3 step N)" are 8B-3's staging steps never run (follow-ups, "From the staging run of 8B-1 to 8B-4 …"), adapted: the panel is "Manage train…" now. A route of four stops is called A, B, C, D below.
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member); a third account where a step says so. Look at the steps marked **phone** on Android and on an iPhone. The design is `docs/superpowers/specs/2026-10-20-max-battles-design.md`, section 6; the conventions are `docs/architecture/trains.md` ("Kinds and Power Spots"), `parties-and-posts.md`, `history.md`, `web.md`. The steps marked "(from 8B-3 step N)" are 8B-3's staging steps never run (follow-ups, "From the staging run of 8B-1 to 8B-4 …"), adapted: the panel is "Manage train…" now. A route of four stops is called A, B, C, D below.
 
 ## Before
 
@@ -18,7 +18,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 ## Power Spot stops
 
-9. `/route add stop:` on the max train: the list with nothing typed shows the region's Power Spots first, then gyms, each marked `(power spot)` / `(gym)`; typed text that fits a gym and a spot equally offers the spot first. On a raid train, gyms first. Add two spots and two gyms: the post's route lists `<title> (power spot)`, Where shows a spot's Wayfarer picture, address and Map.
+9. `/route add stop:` on the max train: the list with nothing typed shows the region's Power Spots first, then gyms, each marked `(Power Spot)` / `(gym)`; typed text that fits a gym and a spot equally offers the spot first. On a raid train, gyms first. Add two spots and two gyms: the post's route lists `<title> (Power Spot)`, Where shows a spot's Wayfarer picture, address and Map.
 10. **Typed text without picking** (raid train): a gym's full name adds the gym; a Power Spot's full name that no gym has adds the spot; a name several gyms fit says "Several places fit"; a spot named exactly what was typed beats a gym that only contains the words (plan decision 1), also when several gyms contain them (plan 8X-F). The mirror case on the max train: a gym's exact full name adds the gym though several Power Spots contain all its words (the staging's "Allegheny Station" against "Allegheny County Fire Station" and "West Mifflin #3 Volunteer Fire Company - Allegheny County Station 295"); a part of the name that fits the gym no better still says "Several places fit".
 11. **Moving through spots:** Next, Previous, Skip and Finish through a spot; the movement message names it and pings as at a gym; Reverse at the first stop; Loop and Turn back with a spot at the end. Gym targets fire only at gym stops.
 12. **A copy in another region:** a spot stop in another region of the server makes the train's copy there, as a gym stop does.
@@ -28,7 +28,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 ## The map
 
-16. The map shows the mixed train: its line passes through the spots, its ring stands at a spot when the train is there, route mode numbers the spots; a spot's popup line "… (power spot)" with Directions. "Manage…" opens the panel headed "Manage the train". The route editor still adds gyms only (8X-5 adds spots).
+16. The map shows the mixed train: its line passes through the spots, its ring stands at a spot when the train is there, route mode numbers the spots; a spot's popup line "… (Power Spot)" with Directions. "Manage…" opens the panel headed "Manage the train". The route editor still adds gyms only (8X-5 adds spots).
 
 ## Left over from 8B-3's staging
 
diff --git a/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md b/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md
index 88666979a342faa14034a318c6c1e25ddbe3f770..4c0fd9b1e7cc10947f5962f73cf96552f4c1cdb9 100644
--- a/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md
+++ b/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md
@@ -42,7 +42,7 @@ const post = (path, body) =>
 13. `await post('parties/<a raid id>/remote')` as Tester, signed up: 200, the post shows Tester as remote; again: off. The same on a max battle, a meetup and a train (every post that has Remote); on an elite raid that refuses Remote: refused in the post's words. `get('parties')`: each party's attendance has `remote: { offered, on }`.
 14. **A train's kind:** `post('trains', { region: <region id>, name: 'Map Wild Area', kind: 'gigantamax' })` (`region` is the region's row id, a number, as `get('geo')` lists it in `regions`, not its channel id; plan 8X-F): the post `### Gigantamax Train: Map Wild Area` with the `Max battle` tag. `get('parties')`: its `trainKind` `gigantamax`, `trainKindWords`, `may.kind` true for Googer while it has no route (`panel` null).
 15. `post('trains/<id>/move/kind', { kind: 'dynamax' })` as its maker: "This train is a Max Battle Train now.", the post's heading and tags change, its log line; as Tester (not its maker, no rights): 403, uncounted. The log line "a train's kind was set on the map".
-16. Add a Power Spot stop from the console (`post('trains/<id>/route', { drawn: [], add: { stop: 'w<spot id>' } })` or the body `web.md` gives): the route lists it as `<title> (power spot)`.
+16. Add a Power Spot stop from the console (`post('trains/<id>/route', { drawn: [], add: { stop: 'w<spot id>' } })` or the body `web.md` gives): the route lists it as `<title> (Power Spot)`.
 
 ## After
 
diff --git a/docs/superpowers/plans/2026-10-22-phase-8xg-staging.md b/docs/superpowers/plans/2026-10-22-phase-8xg-staging.md
index 01a6369df0d805e1200f27a2786b8543e5116be3..b4fe714e5b87cf3c63e7a13bb6dc9d662538d58b 100644
--- a/docs/superpowers/plans/2026-10-22-phase-8xg-staging.md
+++ b/docs/superpowers/plans/2026-10-22-phase-8xg-staging.md
@@ -24,7 +24,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord and
 12. **Move…'s stale guard with two accounts.** Googer and Tester (no conductor, both signed up) each open Move… at the same stop; Googer submits Next, then Tester submits Next: the train moved once, and Tester reads "The train has moved on since you opened this: The train is at stop 2 …". Tester as a member who may not move it (with a conductor set): Move… is refused privately before it opens.
 13. **Manage… on web, Android and iPhone.** Manage… opens "Manage the train": where the train is, "The route" with **Keep it as it is** picked (Reverse it at either end of a route that finishes or anywhere on a loop; Finish it here unless finished; left out where only Keep is left), "At the end of the route" and "What the train is mainly for" as menus with the train's own picked (check Android does not pick another value by itself). Submit with Reverse, Loop and Dynamax Battles at once: one line in the post naming all three, one private answer ("This train is a Max Battle Train now. The route is reversed. At the end it loops back to the first stop. The train is at …"). Submit without changing anything: "Nothing changed." Several parts at once that are refused (Tester, who may not move the train, with a dialog opened while still allowed, or a route change after the train moved on): the refusal ends with "Nothing was changed." and none of the parts is applied. Googer opens Manage…, Tester changes the mode with another Manage…; Googer submits a new kind only: the mode Tester set stays. Finish it here: the route is finished and the movement message says so. A train without a route (`/train … start:`): Manage… shows the kind alone and no Move… is on the post. Staff (Googer, not the conductor) may open Manage…; a member who may not move the train is refused privately.
 14. **Old buttons.** A train post drawn before 8X-G (one of an older run, or one not edited since the deploy): its "Manage train…" opens Move… (Manage… on a train without a route). A Manage train panel still open in a client: its buttons and menus answer as no longer in use and change nothing.
-15. **The kind's words.** `/train kind:` offers Raids, Dynamax Battles, Gigantamax Battles under the hint "What the train is mainly for (its stops can be gyms or power spots)". The posts still say Raid Train / Max Battle Train / Gigantamax Train. `/help command:train`'s example names `kind:Gigantamax Battles`. The help of the moves names the new buttons: `/help command:next`, `previous` and `skip` say "The same as the button "Move…" on the post" (and that Manage… reverses the route), `/help command:finish` "Finish it here" in Manage…'s dialog, `/help command:route` the button "Route" (no "Whole route", no "Manage train…" or its panel anywhere).
+15. **The kind's words.** `/train kind:` offers Raids, Dynamax Battles, Gigantamax Battles under the hint "What the train is mainly for (its stops can be gyms or Power Spots)". The posts still say Raid Train / Max Battle Train / Gigantamax Train. `/help command:train`'s example names `kind:Gigantamax Battles`. The help of the moves names the new buttons: `/help command:next`, `previous` and `skip` say "The same as the button "Move…" on the post" (and that Manage… reverses the route), `/help command:finish` "Finish it here" in Manage…'s dialog, `/help command:route` the button "Route" (no "Whole route", no "Manage train…" or its panel anywhere).
 16. **The `…` labels.** Set time… on a raid without times, Something is wrong… under a screenshot's reading, Appeal… under a meetup block, Ask the moderators… under an old refused place, Delete… on the moderators' notice of a pin battle, Open the form again… under a refused gym form: each still opens its dialog. The texts that name them say them with `…` (the raid without times pressed on Meet…: `"Set time…" gives them.`). On the map: a meetup at a refused place says "… its answer has "Ask the moderators…"." and a blocked member making a meetup reads "… use /meetup on Discord and press "Appeal…"."
 17. **Groups in letter order, with a reused letter.** A new group takes the first free letter after the highest one in use, and an earlier letter only when none is free after it: so the groups go up to E first. This needs five accounts, one per group (a group with nobody in it goes, and guests count in their member's group). On a raid, open groups until there are five, A to E: each account in turn opens a new group with Group… from A. Empty B (its member leaves or joins another group): B goes. Then a newcomer (or a member moving out of a crowded group) opens a group: it is B again, and the post lists it in its place, A, B, C, D, E, not last. The post lists them by letter; the which-group dialog of a newcomer lists A to E with the default group marked (the newest opened, where Join, +1 and Remote put a newcomer): on an iPhone it starts there, on Android A is picked by itself (check whether that reads well where the raid has no lobby size); Group… lists them by letter; the `group` option's choices by letter (`/join group:`, `/group join letter:`); `/shout group:True` from the reused B pings only the others of B; Split…'s radio of a train by letter, nothing marked: on Android the first group, often the presser's own, is picked by itself (review r0 A3: check it is never submitted by accident; a follow-up if it is); the map's group question by letter.
 18. **The summary post renamed.** In #north-side's forum the pinned post is renamed "Going on now" with its next edit (a post made as "Active raids"), its heading `### Going on now`; with nothing going on: "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`." Without any other change, the rename goes through within ten minutes of the update (Discord's rename limit: the retry timer, not a later report, does it). With the record of the post lost (`summaryMessageId` set to NULL by SQL in `Region`, Matt's call), **restart the bot** (it reads the regions at the start: without the restart it still knows the post), then `/admin setup-forums` takes the old post over instead of making a second one.
diff --git a/src/commands/gyms/import.test.ts b/src/commands/gyms/import.test.ts
index a9932b85d6a949dfc9d087a0c78e932bd0119caf..0a359bbeaf736a9e8a5f9981476ffdbfb737fc22 100644
--- a/src/commands/gyms/import.test.ts
+++ b/src/commands/gyms/import.test.ts
@@ -294,7 +294,7 @@ describe('/gym import: the preview', () => {
         'Wayfarer). `/gym review` shows them one at a time.',
       '1 gym marked "not in Wayfarer" is left alone.',
       '5 gyms lie where the scan did not reach, so they are left alone.',
-      'PokéStops and power spots for `/wild` and the map: 1 new.',
+      'PokéStops and Power Spots for `/wild` and the map: 1 new.',
       "1 of the scan's areas is no region of this server as it is now.",
       '1 gym lies in no region and outside the area this scan covered (in the report as ' +
         '`beyond`). This scan went no margin beyond its areas, so it cannot be deleted from it.',
@@ -431,7 +431,7 @@ describe('/gym import: the preview', () => {
     );
   });
 
-  it('offers an import that changes only PokéStops and power spots, and says what it did', async () => {
+  it('offers an import that changes only PokéStops and Power Spots, and says what it did', async () => {
     const made = await gymCommandsWith();
     const file = cityFile(made);
     const { answer: first } = await importing(made, packed(file));
@@ -453,14 +453,14 @@ describe('/gym import: the preview', () => {
       'Importing this export of 9 Wayspots would do this. Nothing changes until you press Import.',
     );
     expect(linesOf(answer)).toContain(
-      'PokéStops and power spots for `/wild` and the map: 2 new, 1 changed.',
+      'PokéStops and Power Spots for `/wild` and the map: 2 new, 1 changed.',
     );
     expect(labelsOf(answer)).toEqual(['Import', 'Cancel']);
 
     const pressed = await pressing(made, buttonId(answer, 'Import'), answer);
     await made.settle();
     expect(linesOf(sentLast(pressed))).toContain(
-      'PokéStops and power spots for `/wild` and the map: 2 new, 1 changed.',
+      'PokéStops and Power Spots for `/wild` and the map: 2 new, 1 changed.',
     );
     expect((await made.wayspotStore.all()).map((row) => row.title)).toEqual([
       'Bench by the Mosaic',
@@ -491,7 +491,7 @@ describe('/gym import: the preview', () => {
       'Importing this export of 7 Wayspots would do this. Nothing changes until you press Import.',
     );
     expect(linesOf(answer)).toContain(
-      'I could not read the PokéStops and power spots kept for `/wild` and the map (the log ' +
+      'I could not read the PokéStops and Power Spots kept for `/wild` and the map (the log ' +
         'says why), so I cannot say what this export changes of them. Import tries again.',
     );
     expect(labelsOf(answer)).toEqual(['Import', 'Cancel']);
@@ -890,7 +890,7 @@ describe('/gym import: the buttons', () => {
       '2 gyms are in the review queue (1 to match, 1 never found in Wayfarer). `/gym review` ' +
         'shows them one at a time.',
       '5 gyms where the scan did not reach were left alone.',
-      'PokéStops and power spots for `/wild` and the map: 1 new.',
+      'PokéStops and Power Spots for `/wild` and the map: 1 new.',
     ]);
     expect(done.attachments).toEqual([]);
     expect(labelsOf(done)).toEqual([]);
diff --git a/src/commands/gyms/import.ts b/src/commands/gyms/import.ts
index 6bf4b0ebd71a753f6aafd5e142f633653b024c3d..55f99a0bfa5ac39d9defb97771bf6c72bf8e5d21 100644
--- a/src/commands/gyms/import.ts
+++ b/src/commands/gyms/import.ts
@@ -159,7 +159,7 @@ const NOT_AN_EXPORT =
 const FAULTS: Readonly<Record<WayspotFault, string>> = {
   shape: 'is not a Wayspot as the export tool writes one',
   id: 'has no Wayfarer id',
-  kind: 'is neither a gym, a PokéStop nor a power spot',
+  kind: 'is neither a gym, a PokéStop nor a Power Spot',
   place: 'lies at no place on earth',
   text: `has a text longer than ${MAX_WAYSPOT_TEXT.toLocaleString('en-US')} characters`,
 };
@@ -452,7 +452,7 @@ export function changesNothing(
 
 /** What the preview says when the kept PokéStops and power spots could not be read. */
 const KEPT_UNREAD =
-  'I could not read the PokéStops and power spots kept for `/wild` and the map (the log says ' +
+  'I could not read the PokéStops and Power Spots kept for `/wild` and the map (the log says ' +
   'why), so I cannot say what this export changes of them. Import tries again.';
 
 /**
@@ -470,7 +470,7 @@ function wayspotLines(counts: WayspotCounts | undefined, unread: string[] = []):
   ];
   return parts.length === 0
     ? []
-    : [`PokéStops and power spots for \`/wild\` and the map: ${parts.join(', ')}.`];
+    : [`PokéStops and Power Spots for \`/wild\` and the map: ${parts.join(', ')}.`];
 }
 
 /** How many stops of Pine's own the preview names; the rest are counted. */
@@ -714,7 +714,7 @@ const UNRECORDED: Readonly<Record<Unrecorded, string>> = {
   reviews: 'the review queue',
   seen: 'when the gyms were seen',
   marks: 'the marks "not in Wayfarer" taken off',
-  wayspots: 'the PokéStops and power spots',
+  wayspots: 'the PokéStops and Power Spots',
 };
 
 /** What an import did, as the lines that take the place of the preview. */
diff --git a/src/commands/gyms/review.test.ts b/src/commands/gyms/review.test.ts
index 0e5925b7d0b81a0950ef6ba0422e60ff683dbfc2..de33e17d836da16b6d9c7f6fef7a192f4ff9405f 100644
--- a/src/commands/gyms/review.test.ts
+++ b/src/commands/gyms/review.test.ts
@@ -122,7 +122,7 @@ async function raidAt(made: Made, gymId: number) {
 
 const MOSAIC_LINES = (made: Made, left: string): string[] => [
   'Which Wayspot is **Maple Leaf Mosaic** (#6)? None within 100 m is certainly it.',
-  'Only a Wayfarer gym can be a gym or become one: a PokéStop or a power spot is listed for ' +
+  'Only a Wayfarer gym can be a gym or become one: a PokéStop or a Power Spot is listed for ' +
     'what is there.',
   `It lies in <#${WEST_CHANNEL}>. Its place: [40.03, -80.03](<${gymMapsUrl(gymOf(made, 6))}>).`,
   'Wayspots within 100 m:',
@@ -193,7 +193,7 @@ describe('/gym review: the message', () => {
     expect(lines(made, used).slice(0, -1)).toEqual([
       'Which Wayspot is **Maple Leaf Mosaic** (#6)? The Wayspot its Wayfarer id names lies ' +
         '3.0 km away: it was not moved there without asking.',
-      'Only a Wayfarer gym can be a gym or become one: a PokéStop or a power spot is listed for ' +
+      'Only a Wayfarer gym can be a gym or become one: a PokéStop or a Power Spot is listed for ' +
         'what is there.',
       `It lies in <#${WEST_CHANNEL}>. Its place: [40.03, -80.03](<${gymMapsUrl(mosaic)}>).`,
       'Wayspots within 100 m:',
diff --git a/src/commands/gyms/review.ts b/src/commands/gyms/review.ts
index 1d7c5631fb84923217225419fcaae4bf008d1c3b..012db73eb396cae1ea974080f0fb8421a3c12665 100644
--- a/src/commands/gyms/review.ts
+++ b/src/commands/gyms/review.ts
@@ -51,7 +51,7 @@ export const NOTHING_LEFT = 'Nothing left to review.';
 const KIND_WORDS: Readonly<Record<WayspotKind, string>> = {
   gym: 'a gym',
   stop: 'a PokéStop',
-  powerspot: 'a power spot',
+  powerspot: 'a Power Spot',
 };
 
 /** A Wayspot's title as a button shows it: tidied, never empty. */
@@ -190,7 +190,7 @@ function questionLines(shown: ReviewShown): string[] {
   const named = gymWithId(gym);
   const others = item.candidates.length - gymCandidates(item).length;
   const onlyGyms =
-    'Only a Wayfarer gym can be a gym or become one: a PokéStop or a power spot is listed for ' +
+    'Only a Wayfarer gym can be a gym or become one: a PokéStop or a Power Spot is listed for ' +
     'what is there.';
   switch (item.kind) {
     case 'match': {
diff --git a/src/commands/max/in-max.test.ts b/src/commands/max/in-max.test.ts
index e509ad35f1915e51d567b24ab69972d70f02494c..f8867e7adfe75cc511b330b5c9c43f5f7ea72bf1 100644
--- a/src/commands/max/in-max.test.ts
+++ b/src/commands/max/in-max.test.ts
@@ -210,16 +210,16 @@ describe('the commands in the post of a max battle (plan 8X-3)', () => {
     );
   });
 
-  it('/where shows the power spot with its map', async () => {
+  it('/where shows the Power Spot with its map', async () => {
     const made = await setup();
     expect(await made.answer('where')).toBe(
-      '**Gazebo of the Park** (power spot)\n' +
+      '**Gazebo of the Park** (Power Spot)\n' +
         '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
     );
   });
 
   // Final review, X3-F3: as the post names it (`spotNow`), not as it was reported.
-  it('/where names the power spot as it is now while it is the same place', async () => {
+  it('/where names the Power Spot as it is now while it is the same place', async () => {
     const renamed = keptRow(1, {
       id: TEST_SPOT.id,
       kind: 'powerspot',
@@ -231,7 +231,7 @@ describe('the commands in the post of a max battle (plan 8X-3)', () => {
     // The post's service names the spot (`spotOf`), as the bot's does.
     const made = await setup({}, { wayspots }, { wayspots });
     expect(await made.answer('where')).toBe(
-      '**Gazebo of the Old Park** (power spot)\n' +
+      '**Gazebo of the Old Park** (Power Spot)\n' +
         '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
     );
   });
diff --git a/src/commands/max/max-report.test.ts b/src/commands/max/max-report.test.ts
index 99d642cc81361d73f3d7b8da96adf1df3e809fb0..db8d1015b914376611bd41d5f382b09f837a6ece 100644
--- a/src/commands/max/max-report.test.ts
+++ b/src/commands/max/max-report.test.ts
@@ -17,7 +17,7 @@ const MAP_NAMES: MaxNames = {
   channel: () => '#west',
   ended: 'The max battle there has just ended: report it again.',
   bossHint: ' Open its post and use /boss there to change its boss.',
-  pinBlocked: 'You are blocked from making meetups in this server. Pick a power spot on the map.',
+  pinBlocked: 'You are blocked from making meetups in this server. Pick a Power Spot on the map.',
   postPending: '',
 };
 
@@ -178,7 +178,7 @@ describe('reporting a max battle as a member (reportMaxAs)', () => {
     );
     const battle = asMax(made.store.active()[0]);
     const spot = battle.max.spot;
-    if (spot.kind !== 'powerspot') throw new Error('not at a power spot');
+    if (spot.kind !== 'powerspot') throw new Error('not at a Power Spot');
     const inc = {
       ...battle,
       max: { ...battle.max, spot: { ...spot, title: 'Fire Company Inc.' } },
@@ -198,7 +198,7 @@ describe('a spot named without an interaction (spotAt)', () => {
     vi.useRealTimers();
   });
 
-  it('names a kept power spot by its id, and refuses one Pine keeps no more', async () => {
+  it('names a kept Power Spot by its id, and refuses one Pine keeps no more', async () => {
     const made = await maxReportingWith();
     expect(spotAt(made.ctx, 1, { spot: TEST_SPOT.id })).toMatchObject({
       kind: 'powerspot',
@@ -208,7 +208,7 @@ describe('a spot named without an interaction (spotAt)', () => {
     expect(() => spotAt(made.ctx, 1, { spot: 'deadbeef.16' })).toThrow(PLACE_GONE);
   });
 
-  it('takes a point near a power spot as that spot, one near none as a pin, and refuses one outside the regions', async () => {
+  it('takes a point near a Power Spot as that spot, one near none as a pin, and refuses one outside the regions', async () => {
     const made = await maxReportingWith();
     expect(spotAt(made.ctx, 1, { lat: TEST_SPOT.lat, lon: TEST_SPOT.lon + 0.0002 })).toMatchObject({
       kind: 'powerspot',
diff --git a/src/commands/max/max-report.ts b/src/commands/max/max-report.ts
index 19ce139d308ee6c95220813858699884c81593fe..1f1cde198a81ce920f23114a62d33e785e2bb9c3 100644
--- a/src/commands/max/max-report.ts
+++ b/src/commands/max/max-report.ts
@@ -249,7 +249,7 @@ function alreadyThere(
  * How an answer of a report names a post and a region channel (`ReportNames`), and says what
  * `/max` says in words of Discord's (`ended`: "use `/max` again"; `bossHint`, after another
  * boss's battle is named: "`/boss` there changes its boss.", with its space before it;
- * `pinBlocked`, a member blocked from meetups at a pin: "Pick a power spot from the list."): on
+ * `pinBlocked`, a member blocked from meetups at a pin: "Pick a Power Spot from the list."): on
  * Discord as `/max` says it (`DISCORD_MAX_NAMES`), on the map in the map's words (plan 8X-5).
  * `postPending` follows the battle there while it has no post yet: `: its post is being made` on
  * Discord, nothing on the map, which names no post at all (review r0 of 8X-F, X5-5).
diff --git a/src/commands/max/max.test.ts b/src/commands/max/max.test.ts
index 56373f038a198243581cb61e1bfb65793d361e0e..8e6a66100a7cf7c8d495a2efb9c3005d565769a6 100644
--- a/src/commands/max/max.test.ts
+++ b/src/commands/max/max.test.ts
@@ -134,7 +134,7 @@ describe('/max', () => {
     vi.useRealTimers();
   });
 
-  it('reports a listed Dynamax boss at a power spot picked from the list, until 21:00', async () => {
+  it('reports a listed Dynamax boss at a Power Spot picked from the list, until 21:00', async () => {
     const made = await setup();
     const interaction = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
     const [battle] = made.store.active();
@@ -172,7 +172,7 @@ describe('/max', () => {
     );
   });
 
-  it('takes a maps link near a power spot as that spot, and one near none as a pin', async () => {
+  it('takes a maps link near a Power Spot as that spot, and one near none as a pin', async () => {
     const made = await setup();
     await made.run({ boss: 'Machop', spot: `${TEST_SPOT.lat}, ${TEST_SPOT.lon + 0.0002}` });
     expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ kind: 'powerspot' });
@@ -313,7 +313,7 @@ describe('/max', () => {
     expect(made.store.active()).toEqual([]);
   });
 
-  it('offers the bosses of the moment and the power spots while one types', async () => {
+  it('offers the bosses of the moment and the Power Spots while one types', async () => {
     const made = await setup();
     const bosses = fakeAutocomplete({
       commandName: 'max',
@@ -333,10 +333,10 @@ describe('/max', () => {
     await made.handle(spots);
     const offered = spots.respond.mock.calls[0]?.[0] ?? [];
     expect(offered.map((choice) => choice.value)).toEqual([`powerspot:${TEST_SPOT.id}`]);
-    expect(offered[0]?.name).toMatch(/^Gazebo of the Park \(power spot\)/);
+    expect(offered[0]?.name).toMatch(/^Gazebo of the Park \(Power Spot\)/);
   });
 
-  it("offers the region's power spots by name before anything is typed (staging of 8X)", async () => {
+  it("offers the region's Power Spots by name before anything is typed (staging of 8X)", async () => {
     // A second spot of West, one of East.
     const made = await setup({ moderation: null }, [
       keptRow(2, { kind: 'powerspot', title: 'Anchor Statue', lat: 40.04, lon: -80.04 }),
@@ -353,15 +353,15 @@ describe('/max', () => {
       return (typing.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
     };
     expect(await blank(WEST_CHANNEL)).toEqual([
-      { name: 'Anchor Statue (power spot)', value: `powerspot:${keptRow(2).id}` },
-      { name: 'Gazebo of the Park (power spot)', value: `powerspot:${TEST_SPOT.id}` },
+      { name: 'Anchor Statue (Power Spot)', value: `powerspot:${keptRow(2).id}` },
+      { name: 'Gazebo of the Park (Power Spot)', value: `powerspot:${TEST_SPOT.id}` },
     ]);
     // Outside a region's channel: nothing, as before.
     expect(await blank('199999999999999999')).toEqual([]);
   });
 
   // Review r0, F-A6: Discord takes 25 choices; those first by name.
-  it("offers at most 25 of the region's power spots before anything is typed, the first by name", async () => {
+  it("offers at most 25 of the region's Power Spots before anything is typed, the first by name", async () => {
     const many = Array.from({ length: 30 }, (_, n) =>
       keptRow(10 + n, {
         kind: 'powerspot',
@@ -380,9 +380,9 @@ describe('/max', () => {
     await made.handle(typing);
     const offered = (typing.respond.mock.calls[0]?.[0] ?? []) as readonly { name: string }[];
     expect(offered).toHaveLength(25);
-    expect(offered[0]?.name).toBe('Gazebo of the Park (power spot)');
+    expect(offered[0]?.name).toBe('Gazebo of the Park (Power Spot)');
     expect(offered.slice(1).map((choice) => choice.name)).toEqual(
-      Array.from({ length: 24 }, (_, n) => `Spot ${String(n).padStart(2, '0')} (power spot)`),
+      Array.from({ length: 24 }, (_, n) => `Spot ${String(n).padStart(2, '0')} (Power Spot)`),
     );
   });
 });
@@ -605,7 +605,7 @@ describe('/max at an unlisted power spot', () => {
     vi.useRealTimers();
   });
 
-  it('refuses a member blocked from meetups, uncounted, and takes their known power spot', async () => {
+  it('refuses a member blocked from meetups, uncounted, and takes their known Power Spot', async () => {
     const made = await setup({});
     await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
     for (let n = 0; n < 3; n++) {
@@ -670,7 +670,7 @@ describe('/max at an unlisted power spot', () => {
         `Dynamax Machop (2★), reported by **Alice** (<@${ALICE}>) in <#${WEST_CHANNEL}>.\n` +
         '📍 **Unlisted power spot** · ' +
         '[Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)\n' +
-        '-# Posted already: a power spot Pine does not know, which nobody checked. ' +
+        '-# Posted already: a Power Spot Pine does not know, which nobody checked. ' +
         'Delete closes it as `/delete` does.',
     ]);
     expect(buttonNames(notice?.message)).toEqual(['Delete…', 'Go to post']);
@@ -749,7 +749,7 @@ describe('/max at an unlisted power spot', () => {
     );
   });
 
-  it('tells the moderators nothing without their channel, nor of a known power spot', async () => {
+  it('tells the moderators nothing without their channel, nor of a known Power Spot', async () => {
     const off = await setup();
     await off.run({ boss: 'Machop', spot: PIN_SPOT });
     await off.reports.flush();
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index 696da8862314da8bf1d082a8ccd949f93ad6b2fd..0f0d6e55e0ca0e7eedb45737f17d348d6c889940 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -415,7 +415,7 @@ describe('/meetup', () => {
     });
   });
 
-  it('is never near a power spot: not offered, not found, refused when picked, naming no pin by one', async () => {
+  it('is never near a Power Spot: not offered, not found, refused when picked, naming no pin by one', async () => {
     const { wayspots } = await wayspotsWith([
       keptRow(1, { title: 'Garden Gnome', kind: 'powerspot', lat: 40.0601, lon: -80.0601 }),
     ]);
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index 1e55ac265ba3bbb1e35a6185803a33ea2f7d240b..ee7ca283be2348f878d2cd213796ef0471a2974f 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -45,7 +45,7 @@ const OR_A_PIN = 'or paste a maps link or coordinates';
 
 /** Said of a power spot picked for a meetup. */
 export const NO_POWER_SPOT =
-  "A meetup can't be at a power spot. Pick a gym or PokéStop, or paste a maps link or coordinates.";
+  "A meetup can't be at a Power Spot. Pick a gym or PokéStop, or paste a maps link or coordinates.";
 
 /** A meetup is near a gym or a PokéStop, or at a pin; never a power spot (Matt, 2026-10-17). */
 const MEETUP_PLACES: PlaceKindsOnly = { kinds: MEETUP_PLACE_KINDS, refusal: NO_POWER_SPOT };
diff --git a/src/commands/notifications/targets.test.ts b/src/commands/notifications/targets.test.ts
index acf1e0bb87687a67cfc34b57c8d6379949de8522..e8c4806b6778a2512682652091e50b395a4e8da0 100644
--- a/src/commands/notifications/targets.test.ts
+++ b/src/commands/notifications/targets.test.ts
@@ -318,13 +318,13 @@ describe('/target', () => {
   });
 
   // Final review, X3-F6: a max battle is at a power spot, which is no gym.
-  it('says that a max battle is at a power spot, in its post', async () => {
+  it('says that a max battle is at a Power Spot, in its post', async () => {
     const max = await reportedMax();
     const made = setup({ parties: max.store, regions: max.regions });
     const inPost = { channelId: max.postId, thread: { parentId: WEST_FORUM } };
     for (const name of ['target', 'untarget']) {
       expect(await made.answer(name, {}, inPost)).toBe(
-        'A max battle is at a power spot, not a gym: name the gym with `gym`.',
+        'A max battle is at a Power Spot, not a gym: name the gym with `gym`.',
       );
     }
   });
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index 6f68a821f9ae7942943562b3045e7bd1fb8dec9d..660e4af9834ff7d971bbf5034a74780dd2f60436 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -775,13 +775,13 @@ describe('/wild near:', () => {
     return setup({}, { wayspots });
   }
 
-  it('offers gyms, stops and power spots of the server, the region first, saying where each is', async () => {
+  it('offers gyms, stops and Power Spots of the server, the region first, saying where each is', async () => {
     const made = await withWayspots();
     expect(await made.offered('fountain', 'near')).toEqual([
       { name: 'Old Stone Fountain (gym) · Market Street', value: 'gym:2' },
       { name: 'Fountain Square (PokéStop) · Market Street', value: `stop:${wayspotId(1)}` },
       {
-        name: 'Fountain Garden (power spot) · near Old Stone Fountain',
+        name: 'Fountain Garden (Power Spot) · near Old Stone Fountain',
         value: `powerspot:${wayspotId(2)}`,
       },
       { name: 'Fountain Steps (PokéStop) · Main St', value: `stop:${wayspotId(3)}` },
@@ -797,7 +797,7 @@ describe('/wild near:', () => {
     const settings = loadSettings(TEST_SETTINGS_PATH);
     const help = textDisplays(renderCommandHelp(wildCommand, settings)).join('\n');
     expect(help).toContain(
-      '`near` names a gym, PokéStop or power spot it is near: pick one from the list',
+      '`near` names a gym, PokéStop or Power Spot it is near: pick one from the list',
     );
     expect(help).toContain('/wild pokemon:Pikachu details:by the bench near:Fountain Square');
   });
@@ -850,7 +850,7 @@ describe('/wild near:', () => {
     );
   });
 
-  it('says the address of a gym, and that a power spot without one has none', async () => {
+  it('says the address of a gym, and that a Power Spot without one has none', async () => {
     const made = await withWayspots();
     await made.run({ pokemon: 'dratini', near: 'gym:2' });
     await made.run({ pokemon: 'dratini', near: `powerspot:${wayspotId(2)}` });
@@ -859,19 +859,19 @@ describe('/wild near:', () => {
       'Near **Old Stone Fountain** (gym) · 12 Market Street, Pinewood, Pennsylvania 15999 · [Map]',
     );
     expect(spot).toContain(
-      'Near **Fountain Garden** (power spot) · (no address available) · [Map]',
+      'Near **Fountain Garden** (Power Spot) · (no address available) · [Map]',
     );
   });
 
   it('takes typed text only when it means one place beyond doubt', async () => {
     const made = await withWayspots();
     await made.run({ pokemon: 'dratini', near: 'fountain garden' });
-    expect(textOf(made.reports()[0]?.message)).toContain('Near **Fountain Garden** (power spot)');
+    expect(textOf(made.reports()[0]?.message)).toContain('Near **Fountain Garden** (Power Spot)');
     const used = await made.run({ pokemon: 'dratini', near: 'fountain' });
     expect(sent(used.reply)).toEqual({
       content:
         'Which place is "fountain"? Pick one from the list that appears while you type: Old ' +
-        'Stone Fountain (gym), Fountain Square (PokéStop), Fountain Garden (power spot) or ' +
+        'Stone Fountain (gym), Fountain Square (PokéStop), Fountain Garden (Power Spot) or ' +
         'Fountain Steps (PokéStop).',
       flags: MessageFlags.Ephemeral,
     });
@@ -1016,7 +1016,7 @@ describe('/wild near:', () => {
     }
     const none = await made.run({ pokemon: 'dratini', near: 'qwxzy' });
     expect(sent(none.reply).content).toBe(
-      'I know no gym, PokéStop or power spot called "qwxzy" here. Pick one from the list that ' +
+      'I know no gym, PokéStop or Power Spot called "qwxzy" here. Pick one from the list that ' +
         'appears while you type, or say where in `details` alone.',
     );
     expect(made.reports()).toEqual([]);
diff --git a/src/commands/notifications/wild.ts b/src/commands/notifications/wild.ts
index f3e5342360d14e0126ade7a11bfacde0d53afa6f..e87b0efff5c87db6c5bc542847a12e0fdbaeb64b 100644
--- a/src/commands/notifications/wild.ts
+++ b/src/commands/notifications/wild.ts
@@ -250,7 +250,7 @@ export const wildCommand: SimpleCommand = {
       option
         .setName('near')
         .setDescription(
-          'A gym, PokéStop or power spot it is near (pick from the list), or a maps link',
+          'A gym, PokéStop or Power Spot it is near (pick from the list), or a maps link',
         )
         .setMaxLength(MAX_PLACE_TEXT)
         .setAutocomplete(true),
@@ -275,7 +275,7 @@ export const wildCommand: SimpleCommand = {
       'Rattata`); megas, legendary and mythical Pokémon and ultra beasts do not' +
       exceptionsClause(settings.wildSpawnExceptions) +
       '. `details` says where it is and is needed: a report is of no use ' +
-      'without it. `near` names a gym, PokéStop or power spot it is near: pick one from the ' +
+      'without it. `near` names a gym, PokéStop or Power Spot it is near: pick one from the ' +
       'list that appears while you type (your region’s first; each says its street or the gym ' +
       'nearest to it), or paste a link to the place from a maps app, or its coordinates ' +
       '(`40.4406, -79.9959`): the report shows it with a map link. `iv` says that you checked it ' +
diff --git a/src/commands/parties/status.ts b/src/commands/parties/status.ts
index 983d6cd57938ea3e738eaacf0b76b3828e3366e9..5826417cfacbe87404362e7cc479bf75a6c8d2cc 100644
--- a/src/commands/parties/status.ts
+++ b/src/commands/parties/status.ts
@@ -92,7 +92,7 @@ export const where: SimpleCommand = {
     category: 'basic-raid',
     details:
       'Shows you a link to the gym in Google Maps and a map of its surroundings: the gym of a ' +
-      'raid, or the stop a train is at; in the post of a max battle, its power spot with a link ' +
+      'raid, or the stop a train is at; in the post of a max battle, its Power Spot with a link ' +
       'to it. Use it in the post of the raid, max battle or train.',
     examples: ['/where'],
   },
@@ -110,7 +110,7 @@ export const where: SimpleCommand = {
       // its post names it, as it is now while it is the same place (`spotNow`, review X3-F3).
       const spot = ctx.partyService.spotOf(party);
       const name =
-        spot.kind === 'pin' ? `📍 **${UNLISTED_SPOT}**` : `**${plain(spot.title)}** (power spot)`;
+        spot.kind === 'pin' ? `📍 **${UNLISTED_SPOT}**` : `**${plain(spot.title)}** (Power Spot)`;
       await interaction.editReply({
         content: `${name}\n[Open in Google Maps](<${gymMapsUrl(spot)}>)`,
       });
@@ -131,7 +131,7 @@ export const where: SimpleCommand = {
         // A power spot of its route (plan 8X-4), as a max battle's spot is shown.
         const shown = stopsFrom(ctx.gyms, ctx.wayspots)(at);
         const spot = shown.kind === 'powerspot' ? shown.spot : undefined;
-        if (!spot) throw new UserError('I no longer know the power spot this train is at.');
+        if (!spot) throw new UserError('I no longer know the Power Spot this train is at.');
         await interaction.editReply({
           content: `${stopInWords(shown)}\n[Open in Google Maps](<${gymMapsUrl(spot)}>)`,
         });
diff --git a/src/commands/regions/edit.ts b/src/commands/regions/edit.ts
index b87d0ea547a7b5a3ac7f42f6646523ac0cb027f9..aa99c290d2fc4743d5887e66b9bb7c5e056f448c 100644
--- a/src/commands/regions/edit.ts
+++ b/src/commands/regions/edit.ts
@@ -21,7 +21,7 @@ export const editRegions: SubcommandPart = {
     details:
       'Gives you the address of the region editor, on a map in your browser, and a button that ' +
       'opens it and logs you in (it works once, within five minutes). There you draw new ' +
-      'regions, reshape, move, split and remove them, see the gyms, stops and power spots in ' +
+      'regions, reshape, move, split and remove them, see the gyms, stops and Power Spots in ' +
       'no region and where regions overlap or leave gaps, load and export KML, and save: you ' +
       'see what a save would do first, in the words of `/region import`. Only you see the answer.',
     examples: ['/region edit'],
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index 2c1aa89c5c21737625d1c7418e1d44c557900933..b062bc80dd39d0920ef29383d7179d45750c6c8f 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -367,10 +367,10 @@ describe('/route add', () => {
   it('acts only on a clear hit, and says what it found otherwise', async () => {
     const made = await setup();
     expect(await made.answer('add', { stop: 'zzzz' })).toBe(
-      'I found no gym or power spot for "zzzz". Type part of its name and pick it from the list.',
+      'I found no gym or Power Spot for "zzzz". Type part of its name and pick it from the list.',
     );
     expect(await made.answer('add', { stop: 'gym:999' })).toMatch(
-      /^I found no gym or power spot for/,
+      /^I found no gym or Power Spot for/,
     );
     expect(await made.answer('add', { stop: 'pinewood' })).toMatch(
       /^Several places fit "pinewood" /,
@@ -391,7 +391,7 @@ describe('/route add', () => {
   });
 });
 
-describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () => {
+describe('/route add stop: a gym or a Power Spot (plan 8X-4; design 6.2)', () => {
   /** A power spot in West, one titled as gym 2 is (Old Stone Fountain), one in the north. */
   const GAZEBO = keptRow(901, {
     kind: 'powerspot',
@@ -419,26 +419,26 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     return { ...made, directory: wayspots };
   }
 
-  it('adds a power spot picked from the list or named, named so in the answer and the post', async () => {
+  it('adds a Power Spot picked from the list or named, named so in the answer and the post', async () => {
     const made = await withSpots();
     expect(await made.answer('add', { stop: `powerspot:${GAZEBO.id}` })).toBe(
-      '**Gazebo of the Lake** (power spot) is stop 4 of the route.',
+      '**Gazebo of the Lake** (Power Spot) is stop 4 of the route.',
     );
     expect(made.routeNow().at(-1)).toEqual(spotStop(GAZEBO.id));
     expect(await made.lines()).toEqual([
-      `**Alice** (<@${ALICE}>) added stop 4 to the route: **Gazebo of the Lake** (power spot).`,
+      `**Alice** (<@${ALICE}>) added stop 4 to the route: **Gazebo of the Lake** (Power Spot).`,
     ]);
     // One typed beyond doubt is taken as it is.
     await made.trains.removeStop(made.party.id, { id: ALICE }, 4);
     expect(await made.answer('add', { stop: 'gazebo of the lake' })).toBe(
-      '**Gazebo of the Lake** (power spot) is stop 4 of the route.',
+      '**Gazebo of the Lake** (Power Spot) is stop 4 of the route.',
     );
     expect(await made.answer('add', { stop: `powerspot:${GAZEBO.id}` })).toBe(
       'That stop is on the route already.',
     );
   });
 
-  it("takes the train's kind of stop when a gym and a power spot are both typed beyond doubt", async () => {
+  it("takes the train's kind of stop when a gym and a Power Spot are both typed beyond doubt", async () => {
     const raid = await withSpots();
     expect(await raid.answer('add', { stop: 'old stone fountain' })).toBe(
       '**Old Stone Fountain** is stop 4 of the route.',
@@ -446,7 +446,7 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     expect(raid.routeNow().at(-1)).toEqual(gymStop(2));
     const max = await withSpots('dynamax');
     expect(await max.answer('add', { stop: 'old stone fountain' })).toBe(
-      '**Old Stone Fountain** (power spot) is stop 4 of the route.',
+      '**Old Stone Fountain** (Power Spot) is stop 4 of the route.',
     );
     expect(max.routeNow().at(-1)).toEqual(spotStop(FOUNTAIN.id));
   });
@@ -482,12 +482,12 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     );
     // The power spot is clear: a max train takes it, though the gyms are several.
     expect(await max.answer('add', { stop: 'pinewood' })).toBe(
-      '**Pinewood Pavilion** (power spot) is stop 4 of the route.',
+      '**Pinewood Pavilion** (Power Spot) is stop 4 of the route.',
     );
     expect(max.routeNow().at(-1)).toEqual(spotStop(pavilion.id));
   });
 
-  it('takes the gym of a raid train though two power spots fit every word typed', async () => {
+  it('takes the gym of a raid train though two Power Spots fit every word typed', async () => {
     // As at Riverview Park: the gym's name typed, and two power spots of the park.
     const gates = [907, 908].map((n, index) =>
       keptRow(n, {
@@ -507,7 +507,7 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     );
   });
 
-  it("takes the better fit of a gym and a power spot both beyond doubt, the train's kind on a tie", async () => {
+  it("takes the better fit of a gym and a Power Spot both beyond doubt, the train's kind on a tie", async () => {
     // Gym 7 is Harbor Lighthouse Mural, on the route already. The gym's whole name typed, a
     // power spot with more words: the gym, also on a max train.
     const steps = keptRow(909, {
@@ -529,7 +529,7 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     });
     const raid = await withSpots('raid', [lighthouse]);
     expect(await raid.answer('add', { stop: 'harbor lighthouse' })).toBe(
-      '**Harbor Lighthouse** (power spot) is stop 4 of the route.',
+      '**Harbor Lighthouse** (Power Spot) is stop 4 of the route.',
     );
   });
 
@@ -559,7 +559,7 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     );
   });
 
-  it('takes a power spot that fits better than several gyms of a raid train', async () => {
+  it('takes a Power Spot that fits better than several gyms of a raid train', async () => {
     // Two gyms have "pinewood" among more words; a power spot is called just that.
     const pinewood = keptRow(914, {
       kind: 'powerspot',
@@ -569,14 +569,14 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     });
     const raid = await withSpots('raid', [pinewood]);
     expect(await raid.answer('add', { stop: 'pinewood' })).toBe(
-      '**Pinewood** (power spot) is stop 4 of the route.',
+      '**Pinewood** (Power Spot) is stop 4 of the route.',
     );
     expect(raid.routeNow().at(-1)).toEqual(spotStop(pinewood.id));
   });
 
   // Review r0, F-A2: several gyms that have every word as typed fit as well as a word's fit,
   // as one gym beyond doubt does: a power spot of a word's fit is no better.
-  it('counts several gyms with every word as fitting a word, not worse than a power spot', async () => {
+  it('counts several gyms with every word as fitting a word, not worse than a Power Spot', async () => {
     const steps = keptRow(915, {
       kind: 'powerspot',
       title: 'Pine Steps',
@@ -589,7 +589,7 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     expect(inGyms(raid.routeNow())).toEqual([4, 1, 7]);
   });
 
-  it('counts a gym beyond doubt as fitting every word, not worse than a power spot beyond doubt', async () => {
+  it('counts a gym beyond doubt as fitting every word, not worse than a Power Spot beyond doubt', async () => {
     // Gym 7 is Harbor Lighthouse Mural, on the route already: beyond doubt for "harbor light",
     // which begins its words; the spot has the typed words whole. A tie: the raid train's gym.
     const lights = keptRow(911, {
@@ -608,12 +608,12 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     const made = await withSpots();
     // Gym 10 lies in no region.
     expect(await made.answer('add', { stop: 'lakeview trailhead' })).toBe(
-      'I found no gym or power spot for "lakeview trailhead". Type part of its name and pick ' +
+      'I found no gym or Power Spot for "lakeview trailhead". Type part of its name and pick ' +
         'it from the list.',
     );
   });
 
-  it("offers a max train the region's power spots ahead of its gyms before anything is typed", async () => {
+  it("offers a max train the region's Power Spots ahead of its gyms before anything is typed", async () => {
     const raid = await (await withSpots()).choices('add', 'stop');
     expect(
       raid.map((choice) => choice.value).every((value) => String(value).startsWith('gym:')),
@@ -621,14 +621,14 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     const max = await (await withSpots('dynamax')).choices('add', 'stop');
     // West's power spots by name (not the north's, of another server), then its gyms.
     expect(max.slice(0, 2)).toEqual([
-      { name: 'Gazebo of the Lake (power spot)', value: `powerspot:${GAZEBO.id}` },
-      { name: 'Old Stone Fountain (power spot)', value: `powerspot:${FOUNTAIN.id}` },
+      { name: 'Gazebo of the Lake (Power Spot)', value: `powerspot:${GAZEBO.id}` },
+      { name: 'Old Stone Fountain (Power Spot)', value: `powerspot:${FOUNTAIN.id}` },
     ]);
     expect(String(max[2]?.value)).toMatch(/^gym:/);
     expect(max[2]?.name).toMatch(/ \(gym\)$/);
   });
 
-  it('offers gyms and power spots, each by its kind, ordered as the train goes (Matt, 2026-10-20)', async () => {
+  it('offers gyms and Power Spots, each by its kind, ordered as the train goes (Matt, 2026-10-20)', async () => {
     const names = async (kind?: TrainKind) =>
       (await (await withSpots(kind)).choices('add', 'stop', 'old stone fountain')).map(
         (choice) => choice.name,
@@ -636,9 +636,9 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     // As good a match either way: a raid train offers the gym first, a max train the spot.
     const raid = await names();
     expect(raid[0]).toMatch(/^Old Stone Fountain \(gym\)/);
-    expect(raid[1]).toMatch(/^Old Stone Fountain \(power spot\)/);
+    expect(raid[1]).toMatch(/^Old Stone Fountain \(Power Spot\)/);
     const max = await names('dynamax');
-    expect(max[0]).toMatch(/^Old Stone Fountain \(power spot\)/);
+    expect(max[0]).toMatch(/^Old Stone Fountain \(Power Spot\)/);
     expect(max[1]).toMatch(/^Old Stone Fountain \(gym\)/);
     // A better match comes first whatever its kind: a gym's whole name on a max train.
     const better = await (
@@ -647,16 +647,16 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     expect(better[0]?.name).toMatch(/^Riverside Park Gazebo \(gym\)/);
   });
 
-  it('refuses a power spot of no region of this server, as a name that finds nothing', async () => {
+  it('refuses a Power Spot of no region of this server, as a name that finds nothing', async () => {
     const made = await withSpots();
     expect(await made.answer('add', { stop: `powerspot:${NORTH.id}` })).toBe(
-      `I found no gym or power spot for "powerspot:${NORTH.id}". Type part of its name and ` +
+      `I found no gym or Power Spot for "powerspot:${NORTH.id}". Type part of its name and ` +
         'pick it from the list.',
     );
     expect(inGyms(made.routeNow())).toEqual([4, 1, 7]);
   });
 
-  it('saves a route with its power spots, and loads it back without one that is gone', async () => {
+  it('saves a route with its Power Spots, and loads it back without one that is gone', async () => {
     const made = await withSpots();
     await made.answer('add', { stop: `powerspot:${GAZEBO.id}` });
     await made.answer('add', { stop: `powerspot:${FOUNTAIN.id}` });
@@ -678,7 +678,7 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     expect(made.routeNow()).toEqual([...stops(4, 1, 7), spotStop(GAZEBO.id)]);
   });
 
-  it('shows a train at a power spot as at a gym: its Where, its picture, the route', async () => {
+  it('shows a train at a Power Spot as at a gym: its Where, its picture, the route', async () => {
     const made = await withSpots();
     await made.answer('add', { stop: `powerspot:${GAZEBO.id}` });
     await made.trains.move(made.party.id, { id: ALICE }, 'skip', false);
@@ -686,11 +686,11 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     await made.service.flush();
     const message = made.gateway.posts.get(made.postId)?.message;
     expect(textOf(message)).toContain(
-      '**Where · stop 4 of 4**\n**Gazebo of the Lake** (power spot) · 1 Lake Road',
+      '**Where · stop 4 of 4**\n**Gazebo of the Lake** (Power Spot) · 1 Lake Road',
     );
     const shown = await made.run('show');
     expect(sent(shown.reply).content).toContain(
-      '**4\\. [Gazebo of the Lake](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>) (power spot)** (the train is here)',
+      '**4\\. [Gazebo of the Lake](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>) (Power Spot)** (the train is here)',
     );
   });
 });
@@ -1161,7 +1161,7 @@ describe('/route: what the review of the whole plan found', () => {
     // Gym 10 exists and lies in no region: the list never offers it, but its choice can be typed.
     expect(made.ctx.gyms.get(10)?.name).toBe('Lakeview Trailhead');
     expect(await made.answer('add', { stop: 'gym:10' })).toBe(
-      'I found no gym or power spot for "gym:10". Type part of its name and pick it from the list.',
+      'I found no gym or Power Spot for "gym:10". Type part of its name and pick it from the list.',
     );
     expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
     expect(await made.lines()).toEqual([]);
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index 738003c41a2938c721ff9cc5aa151a9747139969..e0b634612699ea5793ecc1e1a79229dbe1ecc685 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -295,7 +295,7 @@ function typedStop(
         ? reported.gyms
         : []
     ).map((one) => one.name),
-    ...spots.map((choice) => `${choice.title} (power spot)`),
+    ...spots.map((choice) => `${choice.title} (Power Spot)`),
   ];
   return own.kind === 'none' && other.kind === 'none'
     ? NONE
@@ -349,21 +349,21 @@ function firstStops(
 const add: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('add')
-    .setDescription('Add a stop to the end of the route of this train: a gym or power spot')
+    .setDescription('Add a stop to the end of the route of this train: a gym or Power Spot')
     .addStringOption((option) =>
       option
         .setName('stop')
-        .setDescription('A gym or power spot: type part of its name and pick from the list')
+        .setDescription('A gym or Power Spot: type part of its name and pick from the list')
         .setRequired(true)
         .setMaxLength(100)
         .setAutocomplete(true),
     ),
   help: {
     details:
-      'You must be signed up (moderators need not be). The stop is a gym or a power spot (where ' +
+      'You must be signed up (moderators need not be). The stop is a gym or a Power Spot (where ' +
       'max battles are), and may lie in another region of this server: the list says what each ' +
       `is and where. A ${TRAIN_KIND_WORDS.dynamax} or ${TRAIN_KIND_WORDS.gigantamax} is offered ` +
-      `power spots first, a ${TRAIN_KIND_WORDS.raid} gyms, among places that fit as well. ` +
+      `Power Spots first, a ${TRAIN_KIND_WORDS.raid} gyms, among places that fit as well. ` +
       'A stop is on a route once, and a route ' +
       `has at most ${MAX_ROUTE_STOPS} stops. A stop added to a route that was finished makes ` +
       'the train go on there, which moves the train: with a conductor only they and the ' +
@@ -378,7 +378,7 @@ const add: SubcommandPart = {
     const shown = plain(truncate(typed, 80));
     if (found.kind === 'none') {
       throw new UserError(
-        `I found no gym or power spot for "${shown}". Type part of its name and pick it from the list.`,
+        `I found no gym or Power Spot for "${shown}". Type part of its name and pick it from the list.`,
       );
     }
     if (found.kind === 'several') {
@@ -699,7 +699,7 @@ const load: SubcommandPart = {
       'The route of the train is replaced, and the train is at its first stop: that moves the ' +
       'train, so with a conductor only they and the moderators can do it, and otherwise you ' +
       'must be signed up. The train then does at the end what it did when the route was ' +
-      'saved (finish, loop or turn back). Gyms and power spots that no longer exist are left out.',
+      'saved (finish, loop or turn back). Gyms and Power Spots that no longer exist are left out.',
     examples: ['/route load route:Downtown loop'],
   },
   throttle: CHANGE_THROTTLE,
@@ -758,7 +758,7 @@ export const route = commandGroup({
   help: {
     category: 'train',
     details:
-      'Use it in the post of the train. A stop is a gym or a power spot. The current stop ' +
+      'Use it in the post of the train. A stop is a gym or a Power Spot. The current stop ' +
       'follows its place through every change of the route: the train stays where it is. A saved route keeps the order of its stops ' +
       'and what the train does at its end (finish, loop or turn back); loading it sets both. ' +
       'The route is reversed, or finished, in the dialog of the button "Manage…" on the post.',
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index 1d7b989797185eccade8ba72a01167c10d103086..d02a31c58b7688461542f2a264c70cc9b8decace 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -78,7 +78,7 @@ export function trainRefusal(
   return problemText(reason, ctx.attendance.limits(), 'train');
 }
 
-/** A stop as an answer names it: `**The Stacks**`, `**Gazebo** (power spot)`. */
+/** A stop as an answer names it: `**The Stacks**`, `**Gazebo** (Power Spot)`. */
 function named(ctx: Pick<AppContext, 'gyms' | 'wayspots'>, ref: StopRef): string {
   return stopInWords(stopsFrom(ctx.gyms, ctx.wayspots)(ref));
 }
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index 8882aa5648afb692524fb2f330b18cf194718440..39ea40bfb909b2c38e21722a77b98e0a269dafc7 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -302,7 +302,7 @@ describe('/train', () => {
     const option = train.data.toJSON().options?.find((found) => found.name === 'kind');
     expect(option).toMatchObject({
       required: false,
-      description: 'What the train is mainly for (its stops can be gyms or power spots)',
+      description: 'What the train is mainly for (its stops can be gyms or Power Spots)',
       choices: [
         { name: 'Raids', value: 'raid' },
         { name: 'Dynamax Battles', value: 'dynamax' },
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index 429393276008e42b653fe6524f001c89a921481b..cdb57b530252d0246cbbf86fbbdba2d707cd67cd 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -85,7 +85,7 @@ export const train: SimpleCommand = {
     .addStringOption((option) =>
       option
         .setName('kind')
-        .setDescription(`${TRAIN_KIND_QUESTION} (its stops can be gyms or power spots)`)
+        .setDescription(`${TRAIN_KIND_QUESTION} (its stops can be gyms or Power Spots)`)
         .addChoices(TRAIN_KINDS.map((kind) => ({ name: trainKindChoice(kind), value: kind }))),
     )
     .addStringOption((option) =>
@@ -97,11 +97,11 @@ export const train: SimpleCommand = {
   help: {
     category: 'train',
     details:
-      'For a group that goes from gym to gym, or power spot to power spot. Use it in the channel ' +
+      'For a group that goes from gym to gym, or Power Spot to Power Spot. Use it in the channel ' +
       'of a region; the train gets a post in the forum of that region. You are signed up for it ' +
       'as `/settings auto-status` says (interested unless you changed it; coming for Here), and ' +
       'the post names you unless your `/settings privacy` is Anonymous. In the post, `/route ' +
-      'add` adds the gyms and power spots it visits (also of other regions), `/meet` sets when ' +
+      'add` adds the gyms and Power Spots it visits (also of other regions), `/meet` sets when ' +
       'it starts and `/end` when it ends, `/boss` says which Pokémon it is after, and ' +
       '`/conductor set` makes you the one who moves it. Members sign up with the buttons, as ' +
       'for a raid, and the button "Move…" or `/next` takes it to its next stop. `at-end` ' +
diff --git a/src/commands/util/request.test.ts b/src/commands/util/request.test.ts
index 8e25f1e1fc5ed861e8dcc3afa97a1d0f017e4ab3..a775944c04ae72841f36088477ebd32b719adf4c 100644
--- a/src/commands/util/request.test.ts
+++ b/src/commands/util/request.test.ts
@@ -204,14 +204,14 @@ describe('/request: refused before anything is sent', () => {
   });
 
   // Final review, X3-F6: a max battle is at a power spot, which is no gym.
-  it('in the post of a max battle, which is at a power spot', async () => {
+  it('in the post of a max battle, which is at a Power Spot', async () => {
     const max = await reportedMax();
     const made = setup({ parties: max.store, regions: max.regions });
     const used = await made.run(
       { text: 'Gone' },
       { channelId: max.postId, thread: { parentId: WEST_FORUM } },
     );
-    expect(told(used)).toBe('A max battle is at a power spot, not a gym: name the gym with `gym`.');
+    expect(told(used)).toBe('A max battle is at a Power Spot, not a gym: name the gym with `gym`.');
   });
 
   it('in the post of a meetup, which is at no gym', async () => {
diff --git a/src/db/migrations/2026_10_21_026_train_spot_stops.db.test.ts b/src/db/migrations/2026_10_21_026_train_spot_stops.db.test.ts
index e6071712e1902a60a5d5a0614eeac4371909a967..c0aa4771c9d688dcd803a07d3052a33f7e62eb11 100644
--- a/src/db/migrations/2026_10_21_026_train_spot_stops.db.test.ts
+++ b/src/db/migrations/2026_10_21_026_train_spot_stops.db.test.ts
@@ -9,7 +9,7 @@ const TRAIN = '00000000-0000-4000-8000-000000000001';
 const MAX_TRAIN = '00000000-0000-4000-8000-000000000002';
 const RAID = '00000000-0000-4000-8000-000000000003';
 
-describe('migration 026: power spots as stops and the kind of a train in the history', () => {
+describe('migration 026: Power Spots as stops and the kind of a train in the history', () => {
   let stop: () => Promise<void>;
   let db: Kysely<DB>;
 
diff --git a/src/db/repositories/history-recording.db.test.ts b/src/db/repositories/history-recording.db.test.ts
index 9aa834404af2edaf1cd14647b7f15d0d78d72355..9ae484f59df7cda5cc99d1b0e30dd1b4fa797c05 100644
--- a/src/db/repositories/history-recording.db.test.ts
+++ b/src/db/repositories/history-recording.db.test.ts
@@ -165,7 +165,7 @@ describe('the party history, written with the parties', () => {
   }
   const ending = (party: Party, at: number): Party => ({ ...endParty(party), updatedAt: at });
 
-  it('records a max battle: its kind, tier and power spot, and no Wayspot for a pin (plan 8X-3)', async () => {
+  it('records a max battle: its kind, tier and Power Spot, and no Wayspot for a pin (plan 8X-3)', async () => {
     const battle = { ...testMax(), forumChannelId: FORUM, forumPostId: POST };
     const ended = await live([
       battle,
@@ -325,7 +325,7 @@ describe('the party history, written with the parties', () => {
     expect(await attendees()).toHaveLength(1);
   });
 
-  it('keeps a power spot a train stopped at by its Wayfarer id, and its step (plan 8X-4)', async () => {
+  it('keeps a Power Spot a train stopped at by its Wayfarer id, and its step (plan 8X-4)', async () => {
     const made = testTrain();
     const on = (stop: number): Party => ({
       ...made,
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index c11d71ac0b05d8a673c4e26d489869a0cfd968a0..e672189708bcdb2b4c832eaa112477148c9beb5f 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -117,7 +117,7 @@ describe('PartyRepository', () => {
     };
   }
 
-  it('keeps the place of a meetup that is a gym, PokéStop or power spot, as it was named', async () => {
+  it('keeps the place of a meetup that is a gym, PokéStop or Power Spot, as it was named', async () => {
     const meetup: MeetupParty = {
       ...fullMeetup(7),
       meetup: {
diff --git a/src/db/repositories/saved-route-repository.db.test.ts b/src/db/repositories/saved-route-repository.db.test.ts
index 5be3ccd6ca273333b3f0760aa503121a9e469d72..562f172fcc6935361b182c81441365ccab74b2a3 100644
--- a/src/db/repositories/saved-route-repository.db.test.ts
+++ b/src/db/repositories/saved-route-repository.db.test.ts
@@ -270,7 +270,7 @@ describe('SavedRouteRepository', () => {
     expect(await routes.removeGym(17)).toEqual({ changed: 0, removed: 0 });
   });
 
-  it('keeps power spots: saved and read back in order, kept when a gym goes (plan 8X-4)', async () => {
+  it('keeps Power Spots: saved and read back in order, kept when a gym goes (plan 8X-4)', async () => {
     // A Wayfarer id holds the digits of gym 17 too: only a gym of the route counts as one.
     const spot = '0000000000000000000000000000017a.16';
     const saved = await routes.save(ALICE, WEST, 'Max loop', stops(4, spot, 17));
diff --git a/src/db/repositories/saved-route-text.test.ts b/src/db/repositories/saved-route-text.test.ts
index b00fbbc488135ebeafae362e1e061ae367b00567..000b3b73106bd15f3b03f943de2b80dd48b6f386 100644
--- a/src/db/repositories/saved-route-text.test.ts
+++ b/src/db/repositories/saved-route-text.test.ts
@@ -5,7 +5,7 @@ import { routeStops, routeText } from './saved-route-repository.js';
 const SPOT = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';
 
 describe('the stops of a saved route as the column holds them (plan 8X-4; design 6.2)', () => {
-  it('reads gym ids and power spots separated by commas, and leaves out what is none', () => {
+  it('reads gym ids and Power Spots separated by commas, and leaves out what is none', () => {
     expect(routeStops('12,45,9')).toEqual([gymStop(12), gymStop(45), gymStop(9)]);
     expect(routeStops(`12,w${SPOT},9`)).toEqual([gymStop(12), spotStop(SPOT), gymStop(9)]);
     expect(routeStops('')).toEqual([]);
diff --git a/src/domain/history/party-history.test.ts b/src/domain/history/party-history.test.ts
index 410487d3ff382eda06374ef60d9f29659a20cd0b..af54b0ca884c4e32a480c6d1e09c8430b5b96a3f 100644
--- a/src/domain/history/party-history.test.ts
+++ b/src/domain/history/party-history.test.ts
@@ -61,7 +61,7 @@ describe('historyOfParty: a max battle (plan 8X-3, design 3.5)', () => {
       },
     );
 
-  it('keeps its kind, tier, boss and the Wayspot of its power spot; no gym', () => {
+  it('keeps its kind, tier, boss and the Wayspot of its Power Spot; no gym', () => {
     const done = withAttendees(testMax({ boss: { key: 'yveltal' } }), {
       [ALICE]: { status: PartyStatus.Complete },
     });
@@ -495,7 +495,7 @@ describe('historyOfParty', () => {
     ]);
   });
 
-  it('keeps a power spot of the route as a stop made there, by its Wayfarer id (plan 8X-4)', () => {
+  it('keeps a Power Spot of the route as a stop made there, by its Wayfarer id (plan 8X-4)', () => {
     const spot = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';
     const mixed = (stop: number): TrainParty => {
       const made = train(stop);
diff --git a/src/domain/party/max.test.ts b/src/domain/party/max.test.ts
index 3a16dd17e89b73fd289b1fb99d2ca64aedcc99b8..39d9cb212029c8167f67f54094312b04ae1a049d 100644
--- a/src/domain/party/max.test.ts
+++ b/src/domain/party/max.test.ts
@@ -92,13 +92,13 @@ describe('a max battle among the kinds of party', () => {
 });
 
 describe('its spot', () => {
-  it('is locked by the power spot, and by one key for every pin', () => {
+  it('is locked by the Power Spot, and by one key for every pin', () => {
     expect(spotKey(TEST_SPOT)).toBe(`w${TEST_SPOT.id}`);
     expect(spotKey(TEST_PIN)).toBe('pin');
     expect(spotKey({ ...TEST_PIN, lat: 41 })).toBe('pin');
   });
 
-  it('is the same spot as the same power spot, or a pin within 50 metres', () => {
+  it('is the same spot as the same Power Spot, or a pin within 50 metres', () => {
     expect(sameSpot(TEST_SPOT, { ...TEST_SPOT, title: 'Renamed' })).toBe(true);
     expect(sameSpot(TEST_SPOT, { ...TEST_SPOT, id: 'other.16' })).toBe(false);
     expect(sameSpot(TEST_PIN, { ...TEST_PIN, lat: TEST_PIN.lat + 0.0004 })).toBe(true);
@@ -255,7 +255,7 @@ describe('the state of a max battle (version 13, and 15)', () => {
     defaultGroupId: 'B',
   });
 
-  it('comes back from storage exactly as it went in, at a power spot and at a pin', () => {
+  it('comes back from storage exactly as it went in, at a Power Spot and at a pin', () => {
     const battle = full();
     expect(partyState(battle)).toMatchObject({ v: 15, max: battle.max });
     expect(partyFromStored(columnsOf(battle), stored(partyState(battle)), [])).toEqual({
diff --git a/src/domain/party/max.ts b/src/domain/party/max.ts
index 5e2aeccda5e225202a2845fb00e13c8dc49d246d..74e7e1516d24ed1bab8f100c622ac3917968a4bb 100644
--- a/src/domain/party/max.ts
+++ b/src/domain/party/max.ts
@@ -286,7 +286,7 @@ export const UNLISTED_SPOT = 'Unlisted power spot';
  * What a command about a gym says in a max battle's post, where it cannot take the party's gym
  * (`/request`, `/target`, `/untarget`; final review X3-F6).
  */
-export const MAX_NO_GYM = 'A max battle is at a power spot, not a gym: name the gym with `gym`.';
+export const MAX_NO_GYM = 'A max battle is at a Power Spot, not a gym: name the gym with `gym`.';
 
 /** A max battle's spot by name: the power spot's title, or `UNLISTED_SPOT` for a pin. */
 export function maxSpotName(spot: MaxSpot): string {
diff --git a/src/domain/party/stops.test.ts b/src/domain/party/stops.test.ts
index 052d8dd767cd95dcbe6b1690608d0c8fa2558cc9..1d6367e23a8008f9c127deef7bbe470c3ccbde39 100644
--- a/src/domain/party/stops.test.ts
+++ b/src/domain/party/stops.test.ts
@@ -44,8 +44,8 @@ function columnsOf(party: Party): PartyColumns {
   return { ...columns, mirrorMessages: [] };
 }
 
-describe('a stop: a gym or a power spot (plan 8X-4; design 6.2)', () => {
-  it('has a key: a gym its id, a power spot w and its Wayfarer id, read back as the stop', () => {
+describe('a stop: a gym or a Power Spot (plan 8X-4; design 6.2)', () => {
+  it('has a key: a gym its id, a Power Spot w and its Wayfarer id, read back as the stop', () => {
     expect(stopKey(gymStop(12))).toBe('12');
     expect(stopKey(spotStop(SPOT))).toBe(`w${SPOT}`);
     expect(readStopKey('12')).toEqual(gymStop(12));
@@ -55,7 +55,7 @@ describe('a stop: a gym or a power spot (plan 8X-4; design 6.2)', () => {
     }
   });
 
-  it('has a short handle for a control: a gym its id, a power spot eight characters of a hash', () => {
+  it('has a short handle for a control: a gym its id, a Power Spot eight characters of a hash', () => {
     expect(stopHandle(gymStop(12))).toBe('12');
     const handle = stopHandle(spotStop(SPOT));
     expect(handle).toMatch(/^[0-9a-f]{8}$/u);
diff --git a/src/domain/search/place-merge.test.ts b/src/domain/search/place-merge.test.ts
index 670a981e335d5290e199758d0bece89e8fb2df86..e9b4d7f09222ba09e2ca218e67c95520dc66a741 100644
--- a/src/domain/search/place-merge.test.ts
+++ b/src/domain/search/place-merge.test.ts
@@ -60,7 +60,7 @@ function hit(
 }
 
 describe('mergePlaces', () => {
-  it('orders by fit, then the member’s region, then gym, stop, power spot, then score', () => {
+  it('orders by fit, then the member’s region, then gym, stop, Power Spot, then score', () => {
     const merged = mergePlaces([
       hit('Spot word', 'powerspot', 'word'),
       hit('Stop beginning', 'stop', 'beginning'),
diff --git a/src/domain/wayspots/keep.test.ts b/src/domain/wayspots/keep.test.ts
index fa834e99652367d7aaa6cb20ef27e6795d9ca33a..c4cafbcf0a04ee65231c10e1e049ccdc66ad1445 100644
--- a/src/domain/wayspots/keep.test.ts
+++ b/src/domain/wayspots/keep.test.ts
@@ -94,7 +94,7 @@ describe('keptRowOf', () => {
 });
 
 describe('planKept', () => {
-  it('keeps every Wayspot of the file but those Pine gyms are, and counts the stops and power spots', () => {
+  it('keeps every Wayspot of the file but those Pine gyms are, and counts the stops and Power Spots', () => {
     const stop = exported(1, 'stop');
     const spot = exported(2, 'powerspot');
     const wayfarerGym = exported(3, 'gym');
@@ -305,7 +305,7 @@ describe('planKept', () => {
     expect(plan.writes.upsert.map((row) => row.title)).toEqual(['A newer name']);
   });
 
-  it('counts by kind the stops and power spots gone from the map, not those that became gyms', () => {
+  it('counts by kind the stops and Power Spots gone from the map, not those that became gyms', () => {
     const goneStop = exported(1, 'stop');
     const goneSpot = exported(2, 'powerspot');
     const pineGymNow = exported(3, 'stop');
diff --git a/src/domain/wayspots/match.test.ts b/src/domain/wayspots/match.test.ts
index 6de93833132e7b365af10fe9027ed8a82a7450d0..dfcde1c0f50b08959b37d8787c9589b42ae28744 100644
--- a/src/domain/wayspots/match.test.ts
+++ b/src/domain/wayspots/match.test.ts
@@ -455,7 +455,7 @@ describe('matchGyms: gyms that are missing', () => {
     ]);
   });
 
-  it('queues a never matched gym whose namesake is a power spot as missing, its own candidate marked', () => {
+  it('queues a never matched gym whose namesake is a Power Spot as missing, its own candidate marked', () => {
     const spot = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 10), 'powerspot');
     const result = plan([FOUNTAIN], [spot]);
     expect(result.matched).toEqual([]);
@@ -469,7 +469,7 @@ describe('matchGyms: gyms that are missing', () => {
     ]);
   });
 
-  it('takes no stop or power spot by its place alone: it is a candidate, a gym near is offered', () => {
+  it('takes no stop or Power Spot by its place alone: it is a candidate, a gym near is offered', () => {
     // A power spot 3 m off and a Wayfarer gym "New Name" 15 m off: the gym was renamed and
     // moved, or is another one. Never added beside it, never queued as missing.
     const spot = wayspot(1, 'Field', at(FOUNTAIN, 3), 'powerspot');
@@ -810,7 +810,7 @@ describe('matchGyms: new gyms', () => {
     ]);
   });
 
-  it('never adds a stop or a power spot', () => {
+  it('never adds a stop or a Power Spot', () => {
     const result = plan(
       [],
       [wayspot(1, 'Bench', FOUNTAIN, 'stop'), wayspot(2, 'Field', LIBRARY, 'powerspot')],
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 4ae6a7adef9bf3e36edb7a3950ec149be92efa8e..72bdc9101298eb756890d84e794baa9ebeb1edf9 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -298,7 +298,7 @@ describe('partyView', () => {
     expect(none.raids[0]).toMatchObject({ picture: null, boss: null });
   });
 
-  it('names the power spots of a route by their keys, with where they are (plan 8X-4)', () => {
+  it('names the Power Spots of a route by their keys, with where they are (plan 8X-4)', () => {
     const spot = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';
     const gone = '0123456789abcdef0123456789abcdef.7';
     const train = posted(
diff --git a/src/render/activity.ts b/src/render/activity.ts
index db64fe682577a5f9a8d8cd3f036ff507f7ef680b..2a22958674fa35832b3fd73d52f6a257342e34b6 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -161,7 +161,7 @@ export function problemText(
     case 'gym-gone':
       return 'That gym is no longer in my gym list.';
     case 'spot-gone':
-      return 'That power spot is no longer in my list of power spots.';
+      return 'That Power Spot is no longer in my list of Power Spots.';
     case 'post-not-made':
       return (
         'I could not make the post in the other region: it was deleted while I was making it. ' +
diff --git a/src/render/gym-summary.test.ts b/src/render/gym-summary.test.ts
index c823d238a23074c61796bf5751f7bbce8cc3de0f..e5c5b8955feee27860295190f19477ab016c1cb9 100644
--- a/src/render/gym-summary.test.ts
+++ b/src/render/gym-summary.test.ts
@@ -52,7 +52,7 @@ describe('gymListSummary', () => {
     );
   });
 
-  it('says what changed of the PokéStops and power spots in a second sentence, each by its kind', () => {
+  it('says what changed of the PokéStops and Power Spots in a second sentence, each by its kind', () => {
     expect(
       textOf(
         gymListSummary({
@@ -64,21 +64,21 @@ describe('gymListSummary', () => {
       ),
     ).toBe(
       '### The gym list changed\nProfessor Pine has added 30 gyms, renamed 1, and moved 1. It ' +
-        'also added 120 PokéStops and 3 power spots, changed 4 PokéStops, and removed 2 power ' +
-        'spots.',
+        'also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power ' +
+        'Spots.',
     );
     expect(
       textOf(gymListSummary({ ...wayspots({ gone: 1 }, { changed: 1, gone: 2 }), deleted: 2_000 })),
     ).toBe(
-      '### The gym list changed\nProfessor Pine has deleted 2,000 gyms. It also changed 1 power ' +
-        'spot and removed 1 PokéStop and 2 power spots.',
+      '### The gym list changed\nProfessor Pine has deleted 2,000 gyms. It also changed 1 Power ' +
+        'Spot and removed 1 PokéStop and 2 Power Spots.',
     );
   });
 
-  it('says the PokéStops and power spots alone under their own heading when no gym changed', () => {
+  it('says the PokéStops and Power Spots alone under their own heading when no gym changed', () => {
     expect(textOf(gymListSummary(wayspots({ added: 1_500 }, { added: 1 })))).toBe(
-      '### The PokéStops and power spots changed\nProfessor Pine has added 1,500 PokéStops and ' +
-        '1 power spot.',
+      '### The PokéStops and Power Spots changed\nProfessor Pine has added 1,500 PokéStops and ' +
+        '1 Power Spot.',
     );
   });
 
diff --git a/src/render/gym-summary.ts b/src/render/gym-summary.ts
index 1ac9e17e5ebf064f96e8b9c64db608519cbec650..099e7a4300104a5ce2cee3a292c5807e76c42dab 100644
--- a/src/render/gym-summary.ts
+++ b/src/render/gym-summary.ts
@@ -109,7 +109,7 @@ function gymWords(changes: GymListChanges): string {
 }
 
 /**
- * "added 120 PokéStops and 3 power spots, changed 4 PokéStops, and removed 2 power spots": each
+ * "added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots": each
  * count names its kind; counts of nothing are left out.
  */
 function wayspotWords({ wayspots }: GymListChanges): string {
@@ -119,7 +119,7 @@ function wayspotWords({ wayspots }: GymListChanges): string {
     const spots = of(wayspots.powerSpots);
     const kinds = [
       ...(stops > 0 ? [counted(stops, 'PokéStop', 'PokéStops')] : []),
-      ...(spots > 0 ? [counted(spots, 'power spot', 'power spots')] : []),
+      ...(spots > 0 ? [counted(spots, 'Power Spot', 'Power Spots')] : []),
     ];
     if (kinds.length > 0) parts.push(`${verb} ${kinds.join(' and ')}`);
   };
@@ -132,7 +132,7 @@ function wayspotWords({ wayspots }: GymListChanges): string {
 /**
  * The post: one container of the gym colour, its heading and a sentence of the gyms ("Professor
  * Pine has added 2,596 gyms, renamed 169, and moved 109."), then one of the PokéStops and power
- * spots ("It also added 120 PokéStops and 3 power spots."); with no gym changed, the PokéStops
+ * spots ("It also added 120 PokéStops and 3 Power Spots."); with no gym changed, the PokéStops
  * and power spots alone under a heading of their own. It pings nobody. Undefined when nothing
  * changed.
  */
@@ -146,7 +146,7 @@ export function gymListSummary(changes: GymListChanges): V2Message | undefined {
   }
   const heading = anyGymChanges(changes)
     ? 'The gym list changed'
-    : 'The PokéStops and power spots changed';
+    : 'The PokéStops and Power Spots changed';
   return {
     v2: true,
     components: [
diff --git a/src/render/max-post.test.ts b/src/render/max-post.test.ts
index 7a2410b423720e68c7fa8a13ad88f3ed9e778c94..72af0d3d51dcfeea545790a7649c16f89ff14d98 100644
--- a/src/render/max-post.test.ts
+++ b/src/render/max-post.test.ts
@@ -115,18 +115,18 @@ describe('renderMaxPost: the heading (design 3.3)', () => {
 });
 
 describe('renderMaxPost: Where', () => {
-  it('shows a power spot as a known place, with its address, Map and picture', () => {
+  it('shows a Power Spot as a known place, with its address, Map and picture', () => {
     const spot = { ...TEST_SPOT, image: 'https://lh3.googleusercontent.com/spot' };
     const rendered = post(testMax({ spot }));
     const where = textDisplays(rendered.message).find((text) => text.startsWith('**Where**'));
     expect(where).toBe(
-      '**Where**\n**Gazebo of the Park** (power spot) · 1 Park Lane · ' +
+      '**Where**\n**Gazebo of the Park** (Power Spot) · 1 Park Lane · ' +
         '[Map](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
     );
     expect(thumbnailsOf(rendered.message)).toContain('https://lh3.googleusercontent.com/spot=s400');
   });
 
-  it('shows the power spot as it is now while it is the same place', () => {
+  it('shows the Power Spot as it is now while it is the same place', () => {
     const now = keptRow(1, {
       id: TEST_SPOT.id,
       kind: 'powerspot',
@@ -135,7 +135,7 @@ describe('renderMaxPost: Where', () => {
       lon: TEST_SPOT.lon,
     });
     const rendered = post(testMax(), { wayspot: (id) => (id === TEST_SPOT.id ? now : undefined) });
-    expect(textOf(rendered.message)).toContain('**Gazebo of the Old Park** (power spot)');
+    expect(textOf(rendered.message)).toContain('**Gazebo of the Old Park** (Power Spot)');
   });
 
   it('shows a pin as an unlisted power spot with its Map', () => {
@@ -221,10 +221,10 @@ describe('renderMaxPost: groups, controls and the rest', () => {
     expect(brief.lines).toEqual([
       '**Dynamax Machamp (2★)**',
       `Until ${stamp(END)} (${stamp(END, 'R')}).`,
-      '**Gazebo of the Park** (power spot) · 1 Park Lane',
+      '**Gazebo of the Park** (Power Spot) · 1 Park Lane',
       '1 trainer',
     ]);
-    expect(brief.whereLine).toBe('**Gazebo of the Park** (power spot) · 1 Park Lane');
+    expect(brief.whereLine).toBe('**Gazebo of the Park** (Power Spot) · 1 Park Lane');
     expect(brief.map).toBe('https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005');
     expect(brief.picture).toBe('https://example.test/machamp.png');
   });
diff --git a/src/render/max-post.ts b/src/render/max-post.ts
index 77a7ac73a8bfa1626ca02dfdebe3f798a2d24810..c3a8a524df9efb6ae7e72b6d5b0dfeec320e6f59 100644
--- a/src/render/max-post.ts
+++ b/src/render/max-post.ts
@@ -166,14 +166,14 @@ function bossLines(view: MaxPostView): string[] {
   return [typesLine(entry, view.emoji), ...weaknessLines(view.catalogue, entry, view.emoji)];
 }
 
-/** `**Gazebo of the Park** (power spot)`: a spot's first words, made safe by `text`. */
+/** `**Gazebo of the Park** (Power Spot)`: a spot's first words, made safe by `text`. */
 function spotWords(spot: PowerSpot, text: (raw: string) => string): string {
   return `**${text(spot.title)}** (${PLACE_KIND_WORDS.powerspot})`;
 }
 
 /**
  * Where the battle is (design 3.3), under `**Where**`: a power spot as a meetup's known place,
- * `**<title>** (power spot) · <address> · [Map](<…>)` with its Wayfarer picture beside it
+ * `**<title>** (Power Spot) · <address> · [Map](<…>)` with its Wayfarer picture beside it
  * (`placeSection`); a pin `📍 **Unlisted power spot** · [Map](<…>)` (Q7), without a picture.
  */
 function maxWhere(view: MaxPostView, fit: Fit): PostBlock {
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index 8208373750702bce6daa7ea336818d19d5be5b72..59d26ff46f258267f67c9be7e72e7ecbafd16282 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -409,7 +409,7 @@ export type MaxPinOutcome = { kind: 'ended' } | { kind: 'closed'; by: NamedMembe
 export function maxPinNotice(notice: MaxPinNotice, outcome?: MaxPinOutcome): V2Message {
   const last =
     outcome === undefined
-      ? '-# Posted already: a power spot Pine does not know, which nobody checked. Delete ' +
+      ? '-# Posted already: a Power Spot Pine does not know, which nobody checked. Delete ' +
         'closes it as `/delete` does.'
       : outcome.kind === 'ended'
         ? 'This max battle has ended.'
diff --git a/src/render/notify-dm.test.ts b/src/render/notify-dm.test.ts
index 917cc4e166402a18f4f6c3c07d3bb290ceff340f..56a27637f5d94a2f6d0b4d01b566ef8cf4ef86f3 100644
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -112,7 +112,7 @@ describe('maxDmSentence (plan 8X-F)', () => {
     ...more,
   });
 
-  it('names a power spot in bold, and a pin as an unlisted power spot in running text', () => {
+  it('names a Power Spot in bold, and a pin as an unlisted power spot in running text', () => {
     expect(maxDmSentence(max())).toBe(
       `A **Dynamax Machamp (2★)** battle has been reported at **Gazebo of the Park** (<#${REGION}>).`,
     );
diff --git a/src/render/place.ts b/src/render/place.ts
index f0497c2c55093b70e1243e9c0bad83b72d5d14a2..0e07d8b54aedd3fcb450fcc59c89cfdb5db17778 100644
--- a/src/render/place.ts
+++ b/src/render/place.ts
@@ -6,7 +6,7 @@ import { mapMarkdown } from './raid-post.js';
 export const PLACE_KIND_WORDS: Readonly<Record<PlaceKind, string>> = {
   gym: 'gym',
   stop: 'PokéStop',
-  powerspot: 'power spot',
+  powerspot: 'Power Spot',
 };
 
 /**
diff --git a/src/render/text.test.ts b/src/render/text.test.ts
index 8ec77bc4bc9f82cbc9a5fb0b40dbdddcd68b59ba..d9422d4fb7c57f0068c67327490ba22b092370cf 100644
--- a/src/render/text.test.ts
+++ b/src/render/text.test.ts
@@ -192,8 +192,8 @@ describe('endSentence (plan 8X-F)', () => {
       'to [Acme](<https://maps.example/?q=1>).',
     );
     // A power spot says what it is after its link: the sentence ends there.
-    expect(endSentence('to [Acme Inc.](<https://maps.example>) (power spot)')).toBe(
-      'to [Acme Inc.](<https://maps.example>) (power spot).',
+    expect(endSentence('to [Acme Inc.](<https://maps.example>) (Power Spot)')).toBe(
+      'to [Acme Inc.](<https://maps.example>) (Power Spot).',
     );
   });
 
diff --git a/src/render/train-stops.ts b/src/render/train-stops.ts
index 6614f60c17a385d52cd4073ccc4b6800e7478619..f137b57f7937ec261f36b26591ada3716321282a 100644
--- a/src/render/train-stops.ts
+++ b/src/render/train-stops.ts
@@ -36,7 +36,7 @@ export interface PostSpot {
 }
 
 /** What a power spot that Pine no longer keeps as one is called. */
-export const UNKNOWN_SPOT = 'Unknown power spot';
+export const UNKNOWN_SPOT = 'Unknown Power Spot';
 
 /** What shows the stops of a route: the gym or power spot a reference names, as it is now. */
 export type StopLookup = (ref: StopRef) => PostStop;
@@ -76,8 +76,8 @@ export function stopGone(stop: PostStop): boolean {
 
 /**
  * A stop's name, raw: a gym's as the posts name it (`gymName`, its nickname first), a power
- * spot's title; `Unknown gym` and `Unknown power spot` for one that is gone. A title gone blank
- * is no name: `Unknown power spot` too.
+ * spot's title; `Unknown gym` and `Unknown Power Spot` for one that is gone. A title gone blank
+ * is no name: `Unknown Power Spot` too.
  */
 export function stopName(stop: PostStop): string {
   if (stop.kind === 'gym') return gymName(stop.gym);
@@ -87,7 +87,7 @@ export function stopName(stop: PostStop): string {
 
 /**
  * What a stop is called where a list could take a power spot for a gym (design 6.2): a power
- * spot's name with ` (power spot)` after it, a gym's alone. Raw; the caller makes it plain.
+ * spot's name with ` (Power Spot)` after it, a gym's alone. Raw; the caller makes it plain.
  */
 export function stopLabel(stop: PostStop): string {
   const name = stopName(stop);
@@ -96,7 +96,7 @@ export function stopLabel(stop: PostStop): string {
     : name;
 }
 
-/** `**The Stacks**`, `**Gazebo** (power spot)`: a stop in a sentence, made plain. */
+/** `**The Stacks**`, `**Gazebo** (Power Spot)`: a stop in a sentence, made plain. */
 export function stopInWords(stop: PostStop): string {
   const name = `**${plain(stopName(stop))}**`;
   return stop.kind === 'powerspot' && stopName(stop) !== UNKNOWN_SPOT
@@ -126,9 +126,9 @@ export function stopLink(stop: PostStop, bare = false): string {
 
 /**
  * Where a train's current stop is, under `heading` (plan 8D): a gym as a raid's Where says it
- * (`gymWhere`); a power spot as a max battle's, `**<title>** (power spot) · <address> ·
+ * (`gymWhere`); a power spot as a max battle's, `**<title>** (Power Spot) · <address> ·
  * [Map](<…>)` with its Wayfarer picture beside it (`placeSection`); one that is gone
- * `**Unknown power spot**` without a map.
+ * `**Unknown Power Spot**` without a map.
  */
 export function stopWhere(heading: string, stop: PostStop, fit: Fit): PostBlock {
   if (stop.kind === 'gym') return gymWhere(heading, stop.gym, fit);
diff --git a/src/services/gym-admin-service.test.ts b/src/services/gym-admin-service.test.ts
index 92dd2711e4fc3ccf83ee11ce984130cf44a7a114..27fc1804b491a42b8838e88c93d45915646a8fea 100644
--- a/src/services/gym-admin-service.test.ts
+++ b/src/services/gym-admin-service.test.ts
@@ -1303,7 +1303,7 @@ describe('GymAdminService.batch', () => {
     }
   });
 
-  it('says in its summary the PokéStops and power spots the work counted', async () => {
+  it('says in its summary the PokéStops and Power Spots the work counted', async () => {
     const made = await gymAdminWith();
     await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
       await ops.add({ name: 'Clock Tower', ...FREE });
@@ -1322,8 +1322,8 @@ describe('GymAdminService.batch', () => {
     await settle(made);
     expect(announced(made).map((message) => textOf(message))).toEqual([
       '### The gym list changed\nProfessor Pine has added 1 gym. It also added 3 PokéStops and 1 ' +
-        'power spot, changed 2 power spots, and removed 1 PokéStop.',
-      '### The PokéStops and power spots changed\nProfessor Pine has changed 1 PokéStop.',
+        'Power Spot, changed 2 Power Spots, and removed 1 PokéStop.',
+      '### The PokéStops and Power Spots changed\nProfessor Pine has changed 1 PokéStop.',
     ]);
   });
 
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index 8752e8d4fbeee05c66aa4898c902cee0ff29fa94..9de103274945fb109e2de135a083cbe1a7e437cd 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -232,7 +232,7 @@ describe('MeetupSafety.make', () => {
     expect(made.storage.requests.size).toBe(1);
   });
 
-  it('makes no meetup at a power spot, for staff neither, and asks nobody', async () => {
+  it('makes no meetup at a Power Spot, for staff neither, and asks nobody', async () => {
     const made = await meetupSafetyWith();
     const spot: KnownPlace = { ...PARK, kind: 'powerspot' };
     expect(await make(made, { place: spot })).toEqual({ kind: 'power-spot' });
diff --git a/src/services/moderation-reports.test.ts b/src/services/moderation-reports.test.ts
index 26afc51fba808bd49bb1e560a1bdb56f06789172..f85c797d8964702832512e3c47ecf5ba15c2780d 100644
--- a/src/services/moderation-reports.test.ts
+++ b/src/services/moderation-reports.test.ts
@@ -146,7 +146,7 @@ describe('ModerationReports: a party reported', () => {
   });
 
   // Plan 8X-3 (review A, X3-B-1): a max battle is a party a member can report.
-  it('takes a max battle at its power spot or its pin, reported by its reporter', async () => {
+  it('takes a max battle at its Power Spot or its pin, reported by its reporter', async () => {
     const made = await reportsWith();
     const report = (spot: MaxSpot) =>
       made.service.reportMax({
diff --git a/src/services/notify-service.max.test.ts b/src/services/notify-service.max.test.ts
index 39ff5d01489a90294fb6d5df0a0e46a4b8a990bc..2ea287d09b61b907f8f7f832f189b1ecf5a386bb 100644
--- a/src/services/notify-service.max.test.ts
+++ b/src/services/notify-service.max.test.ts
@@ -237,7 +237,7 @@ describe('NotifyService: a max battle is reported (plan 8X-3, design 3.4)', () =
   });
 
   // Fix review (b): a DM names the spot as its post does now (`PartyService.spotOf`).
-  it('names the power spot as it is now in every DM: the report, the boss, the meeting time', async () => {
+  it('names the Power Spot as it is now in every DM: the report, the boss, the meeting time', async () => {
     const renamed = keptRow(1, {
       id: TEST_SPOT.id,
       kind: 'powerspot',
diff --git a/src/services/party-store.max.test.ts b/src/services/party-store.max.test.ts
index a5b35b2a232757f517dbf50e492bc5da7fe7299c..903642b3b1667a9b2b108c862f90ae5f63227fc3 100644
--- a/src/services/party-store.max.test.ts
+++ b/src/services/party-store.max.test.ts
@@ -20,7 +20,7 @@ const NEAR_PIN: MaxSpot = { ...TEST_PIN, lat: 40.00227 };
 const FAR_PIN: MaxSpot = { ...TEST_PIN, lat: 40.0047 };
 
 describe('PartyStore: one max battle per spot (plan 8X-3)', () => {
-  it('finds the max battle at a power spot while its end has not come', async () => {
+  it('finds the max battle at a Power Spot while its end has not come', async () => {
     const battle = testMax({ id: ID(1), endTime: at('2026-10-13T14:30') });
     const { store } = await partyStoreWith([battle]);
     expect(store.maxAt(1, TEST_SPOT, PARTY_NOW)).toBe(battle);
diff --git a/src/services/place-finder.test.ts b/src/services/place-finder.test.ts
index 46ccefead1fdd885c20e27fd1b939d1d400768c3..a13191a90a988a1c7fda22564eca67bc82786970 100644
--- a/src/services/place-finder.test.ts
+++ b/src/services/place-finder.test.ts
@@ -93,7 +93,7 @@ describe('PlaceFinder', () => {
     expect(finder.pin(1, { lat: 40.0999, lon: -80.05 }, null)?.near).toBeNull();
   });
 
-  it('merges gyms, stops and power spots by fit, the member’s region first, then the kind', async () => {
+  it('merges gyms, stops and Power Spots by fit, the member’s region first, then the kind', async () => {
     const { finder } = await finderWith();
     const found = finder.find(1, WEST_CHANNEL, 'fountain');
     expect(found.map((one) => [one.title, one.kind, one.fit, one.local])).toEqual([
@@ -228,7 +228,7 @@ describe('PlaceFinder', () => {
     expect(builds()).toBe(1);
   });
 
-  it('builds the indexes of stops and power spots after each load, not while it searches', async () => {
+  it('builds the indexes of stops and Power Spots after each load, not while it searches', async () => {
     const { storage, wayspots } = await wayspotsWith([
       keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
     ]);
diff --git a/src/services/spawn-service.test.ts b/src/services/spawn-service.test.ts
index d7eec52b05556de0879d3127944380146f0da88b..cf8f464f2b77fbb7540ae6150ea8b6f53d47ed7f 100644
--- a/src/services/spawn-service.test.ts
+++ b/src/services/spawn-service.test.ts
@@ -605,7 +605,7 @@ describe('the messages of a spawn report', () => {
       { ...view, details: 'here', near: { ...NEAR, kind: 'powerspot' } },
       WEST_CHANNEL,
     );
-    expect(textOf(spot)).toContain('(power spot) · 20 \\*Market\\* Street');
+    expect(textOf(spot)).toContain('(Power Spot) · 20 \\*Market\\* Street');
     // Text, the brief of a direct message: the place by name.
     expect(
       spawnTextMessage({ ...view, details: 'here', near: NEAR }, SPAWN_FOOTER).content,
diff --git a/src/services/train-service.spots.test.ts b/src/services/train-service.spots.test.ts
index 2d5929f0f9ce07d7840d8cd9424384fcd7aa1949..a0b23363c005f4c9cd827030741fbee598fd5b43 100644
--- a/src/services/train-service.spots.test.ts
+++ b/src/services/train-service.spots.test.ts
@@ -45,8 +45,8 @@ async function spotted(route: readonly (number | ReturnType<typeof spotStop>)[]
   return { ...made, ...kept };
 }
 
-describe('power spots as stops of a train (plan 8X-4; design 6.2)', () => {
-  it('reaches a power spot of a region of its server, and no other place', async () => {
+describe('Power Spots as stops of a train (plan 8X-4; design 6.2)', () => {
+  it('reaches a Power Spot of a region of its server, and no other place', async () => {
     const made = await spotted();
     const party = made.current();
     expect(made.trains.reaches(party, spotStop(WEST_SPOT.id))).toBe(true);
@@ -58,7 +58,7 @@ describe('power spots as stops of a train (plan 8X-4; design 6.2)', () => {
     expect(made.trains.reaches(party, gym(4))).toBe(true);
   });
 
-  it('refuses a power spot that is gone by the time the stop is added', async () => {
+  it('refuses a Power Spot that is gone by the time the stop is added', async () => {
     const made = await spotted();
     expect(await made.trains.addStop(made.party.id, alice, spotStop(keptRow(999).id))).toEqual({
       kind: 'refused',
@@ -66,7 +66,7 @@ describe('power spots as stops of a train (plan 8X-4; design 6.2)', () => {
     });
   });
 
-  it('copies the post into the channel of the region a power spot of its route lies in', async () => {
+  it('copies the post into the channel of the region a Power Spot of its route lies in', async () => {
     const made = await spotted([4, spotStop(EAST_SPOT.id)]);
     await made.service.flush();
     const copies = made.gateway.messagesIn(EAST_CHANNEL).filter((sent) => sent.message.v2 === true);
@@ -74,7 +74,7 @@ describe('power spots as stops of a train (plan 8X-4; design 6.2)', () => {
     expect(textOf(copies[0]?.message)).toContain('Harbor Anchor');
   });
 
-  it('takes off a power spot that an import found gone or made a PokéStop, as an unknown gym', async () => {
+  it('takes off a Power Spot that an import found gone or made a PokéStop, as an unknown gym', async () => {
     const made = await spotted([4, spotStop(WEST_SPOT.id), spotStop(EAST_SPOT.id)]);
     await made.storage.saveFromImport(
       { upsert: [{ ...EAST_SPOT, kind: 'stop' }], remove: [], gone: [WEST_SPOT.id] },
@@ -85,11 +85,11 @@ describe('power spots as stops of a train (plan 8X-4; design 6.2)', () => {
     expect(made.current().train.route).toEqual([gym(4)]);
     await made.attendance.flush();
     expect(made.said().at(-1)).toBe(
-      "2 stops were removed: their power spots are no longer in Pine's list of power spots.",
+      "2 stops were removed: their Power Spots are no longer in Pine's list of Power Spots.",
     );
   });
 
-  it('takes off a power spot that is gone while the gym list is empty, and no gym', async () => {
+  it('takes off a Power Spot that is gone while the gym list is empty, and no gym', async () => {
     // A gym list that knows no gym at all (it could not be read), though it still names them.
     const empty = Object.defineProperty(Object.create(gymsFixture()) as GymProvider, 'size', {
       value: 0,
@@ -105,7 +105,7 @@ describe('power spots as stops of a train (plan 8X-4; design 6.2)', () => {
     expect(made.current().train.route).toEqual([gym(4), gym(1)]);
   });
 
-  it('takes off no power spot while no Wayspot is kept at all', async () => {
+  it('takes off no Power Spot while no Wayspot is kept at all', async () => {
     const made = await spotted([4, spotStop(WEST_SPOT.id)]);
     for (const id of [WEST_SPOT.id, EAST_SPOT.id, NORTH_SPOT.id, STOP.id]) {
       made.wayspots.forget([id]);
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index 33d735b4c1fcc45efc276cef8a55d6941dc46cff..3abda4e3fe50b6fb6e6032ad7404195ef4db0231 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -245,7 +245,7 @@ export class TrainService {
     return stopsFrom(this.options.gyms, this.options.wayspots);
   }
 
-  /** A stop as a line names it: `**The Stacks**`, `**Gazebo** (power spot)`. */
+  /** A stop as a line names it: `**The Stacks**`, `**Gazebo** (Power Spot)`. */
   private named(ref: StopRef): string {
     return stopInWords(this.stops(ref));
   }
@@ -1086,11 +1086,11 @@ function unknownStopsLine(removed: { gyms: number; spots: number }): string {
   }
   if (gyms === 0) {
     return spots === 1
-      ? "A stop was removed: its power spot is no longer in Pine's list of power spots."
-      : `${count(spots, 'stop')} were removed: their power spots are no longer in Pine's list of power spots.`;
+      ? "A stop was removed: its Power Spot is no longer in Pine's list of Power Spots."
+      : `${count(spots, 'stop')} were removed: their Power Spots are no longer in Pine's list of Power Spots.`;
   }
   return (
-    `${count(gyms + spots, 'stop')} were removed: their gyms or power spots are no longer in ` +
+    `${count(gyms + spots, 'stop')} were removed: their gyms or Power Spots are no longer in ` +
     "Pine's lists."
   );
 }
diff --git a/src/services/wayfarer-import-service.test.ts b/src/services/wayfarer-import-service.test.ts
index a1d47c6526e9e6dcf45b6d02ddb8ab8a2bfa69af..cf683a598cc76dfc48daf898c2d1454a6880a139 100644
--- a/src/services/wayfarer-import-service.test.ts
+++ b/src/services/wayfarer-import-service.test.ts
@@ -1042,7 +1042,7 @@ describe('WayfarerImportService: the kept Wayspots', () => {
     await settle(made);
     expect(announced(made).map((message) => textOf(message))).toEqual([
       '### The gym list changed\nProfessor Pine has added 2 gyms, renamed 2, and moved 2. It also ' +
-        'added 1 PokéStop and 1 power spot.',
+        'added 1 PokéStop and 1 Power Spot.',
     ]);
     // The bench (a stop), the mosaic wall (a Wayfarer gym asked about) and the water tower far
     // outside every region; never the Wayfarer gyms the gyms are now.
@@ -1078,7 +1078,7 @@ describe('WayfarerImportService: the kept Wayspots', () => {
       announced(made)
         .map((message) => textOf(message))
         .at(-1),
-    ).toBe('### The PokéStops and power spots changed\nProfessor Pine has removed 1 PokéStop.');
+    ).toBe('### The PokéStops and Power Spots changed\nProfessor Pine has removed 1 PokéStop.');
     expect(await ids(made)).toEqual([idOf(5), idOf(9)]);
   });
 
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index 798822dce60f9d00f60355d2cbcb7b6350474f7c..32d2420976c187d6a9fe66ca7733c8fe851e5b8c 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -244,7 +244,7 @@ describe('the region editor page', () => {
         },
         () => '',
       ),
-    ).toBe('Gap of 98,765 m²: 3 power spots, 1 Wayfarer gym');
+    ).toBe('Gap of 98,765 m²: 3 Power Spots, 1 Wayfarer gym');
     expect(
       pieceLine(
         {
@@ -317,7 +317,7 @@ describe('the region editor page', () => {
       'Stop “Mural” ends up in no region.',
     );
     expect(landingWords({ place: 4, key: 'west' }, DATA, name)).toBe(
-      'Power spot “Kiosk” ends up in #west.',
+      'Power Spot “Kiosk” ends up in #west.',
     );
     expect(cannotFixWords('too-wide')).toBe(
       'Its borders lie more than 150 m apart: draw it by hand.',
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 59a67fbe0025e5863a16d2566b21cf14470a6b11..0da9503d5e87046a415f702e014d31026ca0ea4e 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -380,7 +380,7 @@ export function pieceLine(piece: ListedPiece, name: (key: string) => string): st
   const inside = [
     ...(gym > 0 ? [count(gym, 'gym')] : []),
     ...(stop > 0 ? [count(stop, 'stop')] : []),
-    ...(powerspot > 0 ? [count(powerspot, 'power spot')] : []),
+    ...(powerspot > 0 ? [count(powerspot, 'Power Spot')] : []),
     ...(wayfarerGym > 0 ? [count(wayfarerGym, 'Wayfarer gym')] : []),
   ];
   return `${head}${between}${inside.length > 0 ? `: ${inside.join(', ')}` : ''}`;
@@ -416,7 +416,7 @@ function placeWords(index: number, data: Pick<EditorData, 'gyms' | 'wayspots'>):
   const wayspot = data.wayspots[index - data.gyms.length];
   if (!wayspot) return 'A place';
   const [kind, , , title] = wayspot;
-  const what = kind === 'stop' ? 'Stop' : kind === 'powerspot' ? 'Power spot' : 'Wayfarer gym';
+  const what = kind === 'stop' ? 'Stop' : kind === 'powerspot' ? 'Power Spot' : 'Wayfarer gym';
   return `${what} “${title}”`;
 }
 
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index 1f49242fb9f5fbc4d41826a26036e4220186ae02..a644b36f4d8f6dcd7131c7fe0e7c251b93639a0b 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -340,7 +340,7 @@ class Editor {
         {
           Gyms: gyms,
           'Stops (many: off at first)': stops,
-          'Power spots': powerspots,
+          'Power Spots': powerspots,
           'Wayfarer gyms Pine did not take': wayfarerGyms,
           "Other servers' regions": others,
           'Overlaps and gaps': this.shaded,
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 0fa186a6571fa50ecac992cfb21e18319ae8216b..05867e54e8f450af079731b44db42db55eeed5b5 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -375,7 +375,7 @@ describe("a train's line and ring on the map (trainPlaces)", () => {
     spots: [spot],
   });
 
-  it('draws the line through a power spot of the route and rings it where the train stands', () => {
+  it('draws the line through a Power Spot of the route and rings it where the train stands', () => {
     const library = GYMS.get(1);
     const fountain = GYMS.get(2);
     expect(trainPlaces(at(1), GYMS)).toEqual({
@@ -443,7 +443,7 @@ describe('trainPopup and meetupItem', () => {
       context,
     );
     expect(texts(atSpot).slice(3, 5)).toEqual([
-      'At stop 2 of 3: Gazebo of the Lake (power spot)',
+      'At stop 2 of 3: Gazebo of the Lake (Power Spot)',
       'Directions',
     ]);
     // The stop the train is at: its address line and Directions to it.
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 5beacb59546060c2b171814574e38b6ad371f12c..f9d92e5ec750529e77bc17800b482f5273f9df1e 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -350,8 +350,8 @@ function stopLine(train: MapTrain, context: ShowContext): string {
   const spot = train.spots.find((one) => one.key === key);
   const name = key?.startsWith('w')
     ? spot
-      ? `${spot.name} (power spot)`
-      : 'a power spot'
+      ? `${spot.name} (Power Spot)`
+      : 'a Power Spot'
     : (context.gym(gymOfStop(key))?.name ?? 'a gym not on the map');
   return `At stop ${train.stop + 1} of ${train.route.length}: ${name}`;
 }
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 89800bdc56cfe4b77cb41b8a3346856aee0892ba..688824217c8e9cfe29433fe1edd9d568c3c3441d 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -202,12 +202,12 @@ describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
     expect(stopName(undefined, '99')).toBe('Gym 99');
     // A power spot of the route (plan 8X-4): by the name the train's data gives it.
     const key = 'w0123456789abcdef0123456789abcdef.16';
-    expect(stopName(undefined, key)).toBe('A power spot');
+    expect(stopName(undefined, key)).toBe('A Power Spot');
     const spots = [{ key, name: 'Gazebo of the Lake', lat: 40.05, lon: -80.05 }];
-    expect(stopName(undefined, key, spots)).toBe('Gazebo of the Lake (power spot)');
+    expect(stopName(undefined, key, spots)).toBe('Gazebo of the Lake (Power Spot)');
   });
 
-  it('numbers a power spot the train is at where it is, and leaves out a stop the map cannot place', () => {
+  it('numbers a Power Spot the train is at where it is, and leaves out a stop the map cannot place', () => {
     const key = 'w0123456789abcdef0123456789abcdef.16';
     const spots = [{ key, name: 'Gazebo of the Lake', lat: 40.2, lon: -80.2 }];
     const at = train({ route: ['4', key, '99', '7'], spots, stop: 1 });
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index 7a0bbd0dd7115d093419b898b3b47b1dd6c060c8..a400550a87951cd47e15c7278339f7d58727f519 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -83,7 +83,7 @@ export function stopName(
   // A power spot of the route (plan 8X-4), by the name the train's data gives it.
   if (key.startsWith('w')) {
     const spot = spots.find((one) => one.key === key);
-    return spot ? `${spot.name} (power spot)` : 'A power spot';
+    return spot ? `${spot.name} (Power Spot)` : 'A Power Spot';
   }
   if (!gym) return `Gym ${key}`;
   return gym.nickname !== null && gym.nickname !== '' ? gym.nickname : gym.name;
diff --git a/src/web/max-options.test.ts b/src/web/max-options.test.ts
index 0f282ec7771ec1614295c5e578659765732f9b2a..19d71c8720d06b6dfeeb407e5f3fa703c13dda1d 100644
--- a/src/web/max-options.test.ts
+++ b/src/web/max-options.test.ts
@@ -179,7 +179,7 @@ describe('GET /s/<guild>/api/powerspots', () => {
     return { status: answer.statusCode, json: answer.json<PowerSpotsView>(), answer };
   };
 
-  it('gives a member the titled power spots of the server in the box, nearest to its middle first, never a PokéStop', async () => {
+  it('gives a member the titled Power Spots of the server in the box, nearest to its middle first, never a PokéStop', async () => {
     const made = await serving([
       keptRow(2, { kind: 'powerspot', lat: 40.062, lon: -80.062, title: 'Salon' }),
       keptRow(3, { kind: 'powerspot', lat: 40.0651, lon: -80.0651, title: 'Bandstand' }),
diff --git a/src/web/max-report.test.ts b/src/web/max-report.test.ts
index 28a5192025784929a1375da047320fd35f56d20c..37227c448dd9016651817d41511f529006f278be 100644
--- a/src/web/max-report.test.ts
+++ b/src/web/max-report.test.ts
@@ -85,7 +85,7 @@ describe('reporting a max battle on the map', () => {
     web = undefined;
   });
 
-  it("reports a boss of the list at a power spot as /max does: as the member, until its end, the command's words and the battle as the map shows it", async () => {
+  it("reports a boss of the list at a Power Spot as /max does: as the member, until its end, the command's words and the battle as the map shows it", async () => {
     const map = await reporting();
     web = map.web;
     const answer = await map.report({ spot: TEST_SPOT.id, boss: 'm:D2:machop' });
@@ -115,7 +115,7 @@ describe('reporting a max battle on the map', () => {
     );
   });
 
-  it('takes a point near a power spot as that spot, and one near none as an unlisted power spot, telling the moderators', async () => {
+  it('takes a point near a Power Spot as that spot, and one near none as an unlisted power spot, telling the moderators', async () => {
     const map = await reporting({ safety: {} });
     web = map.web;
     const near = await map.report({
@@ -390,7 +390,7 @@ describe('reporting a max battle on the map', () => {
     const refused = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
     expect(refused).toMatchObject({ status: 422, json: { ok: false, text: MAP_NOT_HERE } });
     expect(MAP_NOT_HERE).toBe(
-      'That place is not in a region of this server. Pick a power spot on the map.',
+      'That place is not in a region of this server. Pick a Power Spot on the map.',
     );
   });
 
diff --git a/src/web/max-routes.ts b/src/web/max-routes.ts
index 50f686f5232a2bd90bb2cd88ad2a5ddddeb98889..ca39c37f7eecb5f1973cca07c845e93077669bf6 100644
--- a/src/web/max-routes.ts
+++ b/src/web/max-routes.ts
@@ -136,7 +136,7 @@ const reportBodySchema = z
 export const MAP_WHICH_TIER = 'Which tier? Pick the tier of this boss.';
 export const MAP_PIN_BLOCKED =
   'You are blocked from making meetups in this server, so you cannot report a max battle at an ' +
-  'unlisted power spot. Pick a power spot on the map.';
+  'unlisted power spot. Pick a Power Spot on the map.';
 export const MAP_MAX_ENDED = 'The max battle there has just ended: report it again.';
 /** After another boss's battle is named: what a member on the map can do about it. */
 export const MAP_BOSS_HINT = ' Open its post and use /boss there to change its boss.';
@@ -148,7 +148,7 @@ export const mapUnknownBoss = (shown: string): string =>
   `I know no Pokémon called "${shown}". Pick a boss from the list.`;
 /** `NOT_HERE` names `/max`'s list: a spot no region's outline holds any more, on the map. */
 export const MAP_NOT_HERE =
-  'That place is not in a region of this server. Pick a power spot on the map.';
+  'That place is not in a region of this server. Pick a Power Spot on the map.';
 
 /** The status of each outcome of a report. */
 const REPORT_STATUS: Readonly<Record<MaxReportOutcome['kind'], number>> = {
diff --git a/src/web/meetup-make.test.ts b/src/web/meetup-make.test.ts
index 2a6a9aebd848916bee0975386b69ead906feb68b..04394c2e327144957bab759347749b3d890a5b7f 100644
--- a/src/web/meetup-make.test.ts
+++ b/src/web/meetup-make.test.ts
@@ -199,7 +199,7 @@ describe('making a meetup on the map', () => {
     });
   });
 
-  it('refuses a power spot and any place that is no gym, PokéStop or pin, and counts none of it', async () => {
+  it('refuses a Power Spot and any place that is no gym, PokéStop or pin, and counts none of it', async () => {
     const map = await making();
     web = map.web;
     for (const kind of ['powerspot', 'portal']) {
@@ -457,7 +457,7 @@ describe('the PokéStops of a box of the map', () => {
     return { status: answer.statusCode, json: answer.json<StopsView>() };
   };
 
-  it('gives a member the titled stops of the server in the box, nearest to its middle first, never a power spot', async () => {
+  it('gives a member the titled stops of the server in the box, nearest to its middle first, never a Power Spot', async () => {
     const map = await making();
     web = map.web;
     const cookie = await map.web.loggedIn(ALICE, 'Alice');
diff --git a/src/web/train-route.test.ts b/src/web/train-route.test.ts
index 43314c5c31a0adbb8a09cce7ed9e584fb0512559..c2438e2d17a6d63edde8985b982ae871c0f4aeb8 100644
--- a/src/web/train-route.test.ts
+++ b/src/web/train-route.test.ts
@@ -188,7 +188,7 @@ describe("a train's route on the map", () => {
     expect(counted.json.error).toBe('You can use /route add again in 1 minute.');
   });
 
-  it("adds a power spot of the server's regions by its key, in any region of the server, and none of another server or none kept as one (404)", async () => {
+  it("adds a Power Spot of the server's regions by its key, in any region of the server, and none of another server or none kept as one (404)", async () => {
     // A power spot in West, one in East (another region of the server), one in the region of
     // another server, a Wayspot that is a PokéStop, a power spot an import found gone.
     const lake = keptRow(901, {
@@ -220,7 +220,7 @@ describe("a train's route on the map", () => {
     expect(added.status).toBe(200);
     expect(added.json).toMatchObject({
       ok: true,
-      text: 'Gazebo of the Lake (power spot) is stop 4 of the route.',
+      text: 'Gazebo of the Lake (Power Spot) is stop 4 of the route.',
       train: { route: ['4', '1', '7', `w${lake.id}`] },
     });
     expect(map.made.current().train.route.at(-1)).toEqual(spotStop(lake.id));
````

## After the last task

- [ ] `npm run check > var/8xs-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `npm run test:db` (0), one at a time.
- [ ] `git diff cd11c5a83701d7e9f92df27b9a2c84a6b84b167c HEAD -- src test scripts` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory.
