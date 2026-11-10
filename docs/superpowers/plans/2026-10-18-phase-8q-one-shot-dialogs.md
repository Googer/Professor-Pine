# Phase 8Q: The One-Shot Questions as Dialogs: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** six private "are you sure?" replies become Discord dialogs (modals), as 8T-H did for the train split: Remove all (`/wants`, `/targets`, `/unwant-all`, `/untarget-all`), staff's `/delete`, the report post's Close…, Refuse place… and Block maker…, deleting a gym (`/gym delete`, Delete… of `/gym show`), `/region remove`, and `/location` to another region.

**Architecture:**

- **Shared pieces** (task 1): `src/discord/dialog.ts`: `dialog({ customId, title, text, choice })` (title ≤ 45, text ≤ 4,000, a choice as a required radio group with nothing picked), `pickedOf` (undefined for a Submit without the group: the stale answer), `deferSubmit`, `channelInDialog` (channels named, never mentioned), and the slow-read rule `readInTime(log, interaction, work)`: what a dialog needs is read within `DIALOG_READ_MS` (2 s) of the interaction's creation, else no dialog and `SLOW_READ` privately, the use given back. The split's dialog uses them. Test helpers in `test/support/dialogs.ts`.
- **The six** (tasks 2–6): each question a dialog with today's text, Discord's Cancel in place of Keep/Cancel, a Submit that is the `modal` of the same handler kind with the same guards and throttle, deferred privately, deciding everything again (server, staff guard, owner, the post's raid). Custom ids carry everything; the pending tokens of these questions go. `/location`'s Submit carries when the `/location` use was counted, so a move refused for no post gives both uses back (8S-4).
- **Docs** (task 7): `discord-framework.md` (dialogs as one-shot questions), the staging checklist `2026-10-18-phase-8q-staging.md`; area docs went in with their tasks.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js 14, Vitest. No new dependency, no migration.

**Spec:** `docs/superpowers/specs/2026-10-18-one-shot-dialogs-design.md` (from Matt's sweep decision, 2026-10-18; his go-ahead to build and merge while he slept; Claude's calls marked "my call"). Brief `.superpowers/sdd/2026-10-18-phase-8q-dialogs/design.md` (git-ignored).

**Every diff in this plan was run before the plan was written** on a throwaway branch (`proto-8q`), one commit per task, each typechecked with its tests green. On the tip the full check (7,987 unit tests), the build and the database suite (488) are clean. An Opus reviewer went through the prototype (ready after fixes: five minor, three nits, all folded into the commits below).

## Decisions in this plan

1. **The slow-read rule** applies where a database read precedes the dialog (Remove all, the report post, gym delete, `/region remove`, the split); `/delete` and `/location` read only memory and cache. The budget counts from the interaction's creation, as the router's late deferral does.
2. **A Submit acknowledges privately first**, before the server check; refusals after it are follow-ups or edits of that answer.
3. **Custom ids:** `wants:all:remove`, `targets:all:remove`, `pclose:<party>:close[:archive]`, `mreport:<report>:<action>[:archive]`, `gymview:<gym>:delete` (both entry points), `region:<region>:remove[:keep]`, `location:<party>:move:<gym>:<counted at>`.
4. **Old controls:** Remove all, `/delete`, `/location` and the report's Delete post get the router's stale answer; old gym and region buttons their kind's "expired"; the report's old Archive post archives at once (its id is the may-not-delete button's).
5. **New texts** (for Matt to read): report titles `Close this <word>`, `Refuse this place`, `Block the maker`; the archive-only removal text; the region's forum lines; `the region of the deleted channel <id>`; Delete post's description `… like a home address` (to fit 100).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8q`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`. Stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Nothing acknowledges or waits past the budget before `showModal`; no dialog from a modal Submit.
2. Every Submit re-checks permission, server and ownership from its own payload (custom ids are forgeable).
3. Behaviour kept from today's confirming presses, including 8S-4's `/location` give-back.

### Task 1: Plan 8Q T1: the shared dialog pieces and the slow-read rule (8Q-1)

Prototype commit: `643d142b5db1f9e3a1ecb743cb9791c8936dfac1`

src/discord/dialog.ts holds what every one-shot question as a dialog
uses: dialog() (a title cut to 45 characters, the question as one text
display, and a choice between ways as a required radio group with
nothing picked), pickedOf() to read that choice at Submit, deferSubmit()
(a Submit is acknowledged privately at once), channelInDialog() (a
channel named, #oakland or a deleted channel, never mentioned inside a
dialog), and readInTime(): what a dialog needs from the database is read
within DIALOG_READ_MS (2 seconds of Discord's 3); past it no dialog
opens and the member is told privately "That took me too long to look
up: try again in a moment.", a refusal that gives the use back. A read
that fails after it was given up is logged.

The split's dialog is built on them: splitDialog through dialog(), the
member's privacy read in time, its Submit deferred by deferSubmit.
test/support/dialogs.ts reads a dialog's texts and choices;
discord-framework.md and testing.md say all of it.

**Files:**

```
 docs/architecture/discord-framework.md |   1 +
 docs/architecture/testing.md           |   1 +
 docs/architecture/trains.md            |   2 +-
 src/commands/trains/split.test.ts      |  20 ++++++
 src/commands/trains/split.ts           |  16 +++--
 src/discord/dialog.test.ts             | 184 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/discord/dialog.ts                  | 159 +++++++++++++++++++++++++++++++++++++++++++++
 src/render/train-split.ts              |  57 +++++++----------
 test/support/dialogs.ts                |  52 +++++++++++++++
 test/support/fake-interactions.ts      |   2 +
 10 files changed, 452 insertions(+), 42 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/discord/dialog.test.ts src/commands/trains/split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 643d142b5db1f9e3a1ecb743cb9791c8936dfac1 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8Q T1: the shared dialog pieces and the slow-read rule (8Q-1)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/discord-framework.md
git add -- docs/architecture/testing.md
git add -- docs/architecture/trains.md
git add -- src/commands/trains/split.test.ts
git add -- src/commands/trains/split.ts
git add -- src/discord/dialog.test.ts
git add -- src/discord/dialog.ts
git add -- src/render/train-split.ts
git add -- test/support/dialogs.ts
git add -- test/support/fake-interactions.ts
```

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 79b062a5..d04126c7 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -24,6 +24,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text, choice })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index ea2ece2c..9696e5b2 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -26,6 +26,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Fake interactions
 
 - Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu or radio group (Discord refuses the Submit without one), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
+- A dialog (plan 8Q, `discord-framework.md`) is read with `test/support/dialogs.ts`: `dialogOf(fake)` (undefined when none opened) or `shownDialog(fake)`, its `dialogTexts` / `dialogText`, and `dialogChoices` (value, label, description, and `picked` for a choice picked beforehand, which none may be). Submit it with `fakeModal({ customId: dialog.custom_id, form: dialog, picked })`, so that the fake refuses a required choice left empty. The slow-read rule is tested by holding the read (a spy that resolves a promise when it is asked and never answers), then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before the press (the timer is set before the read is asked; the fake's `createdTimestamp` is the real now, so the budget is about `DIALOG_READ_MS`) and `vi.advanceTimersByTimeAsync(DIALOG_READ_MS)` once it was asked. A submitted form's `fields.fields` is the map of what it submitted, as discord.js's (`pickedOf` asks it).
 
 ## Parties
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 3d791fdb..4b35f2b0 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -32,7 +32,7 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 - No window between the writes: the old train's loss of the group and the new train's carry-over commit together or not at all, so nobody can end on both trains or on neither. What is left is the new post of a split whose write never committed: a stop of the process after the new post and before the write, or a failed write whose take-back could not end the new train. It stays pending (`train.splitFrom.pending`, in the state document) while the old train still has the group, and `settlePendingSplits` takes it back, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any; one it could not end stays pending for the next try and is not counted. A pending train whose old train is still active and lists it in `splitOff` cannot come of this code (only 8T's first build, which wrote the two trains one after the other, could leave one); it is settled as it is stored and logged as an error, since the group is on no other train. Only an active old train is seen (the store keeps no ended party): the pending train of an old train that ended is taken back, whatever the old one listed. A commit whose acknowledgement is lost (the connection drops after MySQL committed) is the same rare risk as for any `update`: the split's take-back then ends the new train although the old one lost the group, which leaves the group on neither train in the database (memory still has it on the old train) until the old train's next write stores it again, and a restart before that write makes the loss permanent (the restarted process reads the old train without the group); accepted as the same rare risk as any `update`.
 - Then the old post says `<doer> split group B (Fast) off into a train of its own.` (a line, no ping) and the new post `<doer> split this train off with group B (Fast).`, pinging the members who moved and allow `mentions`, never the presser (`doer`: a maker who asked not to be named is not; `This train was split off with …` then).
 - The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "✂️ Split group…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out) stands in the row of Move train… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 40 components with `postMessage`'s fold of four groups' details (44 unfolded).
-- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens. "Split group…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>`. The other is a text of what is the same for every group and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups` in the post's order, nothing picked (Discord refuses Submit until one is), each choice labelled `Group B (Fast) · Dawn, Iris +1, Cilan` (the members as the post lists them, `groupInPostOrder`, by name with their guests; those without a name counted in `, and N more`; the group's label cut to 40, the whole to 100) and described `<new train's name> · <who leads which>` (the conductor words without `it has no conductor;` where the old train keeps its conductor; beyond 100 the train's name is cut, in both places alike, so that the group and who leads stay whole and the choices differ), its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform`. Choices' labels and descriptions are the members' text as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the texts are made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split group… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split group… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
+- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens, within `DIALOG_READ_MS` of the interaction (`readInTime`, plan 8Q): past it no dialog opens and the member is told `SLOW_READ` privately. "Split group…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>`. The other is a text of what is the same for every group and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups` in the post's order, nothing picked (Discord refuses Submit until one is), each choice labelled `Group B (Fast) · Dawn, Iris +1, Cilan` (the members as the post lists them, `groupInPostOrder`, by name with their guests; those without a name counted in `, and N more`; the group's label cut to 40, the whole to 100) and described `<new train's name> · <who leads which>` (the conductor words without `it has no conductor;` where the old train keeps its conductor; beyond 100 the train's name is cut, in both places alike, so that the group and who leads stay whole and the choices differ), its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform`. Choices' labels and descriptions are the members' text as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the texts are made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split group… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split group… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
 - The history records each train on its own (`history.md`: the step `split`, `PartyHistoryAttendee.splitOff`, `PartyHistory.splitFromId`; a pending train has no history until it is settled).
 
 ## Saved routes
diff --git a/src/commands/trains/split.test.ts b/src/commands/trains/split.test.ts
index 520f4928..a66b2ba4 100644
--- a/src/commands/trains/split.test.ts
+++ b/src/commands/trains/split.test.ts
@@ -24,6 +24,7 @@ import { groupMark } from '../../domain/party/train.js';
 import { group } from '../parties/group.js';
 import { help, helpControls } from '../util/help.js';
 import { SPLIT_GROUP_INPUT, splitDialog } from '../../render/train-split.js';
+import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
 
 const DAVE = '200000000000000005';
 const STAFF = { userId: DAVE, displayName: 'Dave', roleNames: ['Moderator'] } as const;
@@ -204,6 +205,25 @@ describe('the button "Split group…" of a train post', () => {
     expect(asTrain(made.fresh())).toMatchObject({ anonymous: true, train: { conductorId: null } });
   });
 
+  it('opens no dialog when the privacy it needs takes too long to read', async () => {
+    const made = await setup();
+    let arrive: () => void = () => undefined;
+    const asked = new Promise<void>((resolve) => {
+      arrive = resolve;
+    });
+    vi.spyOn(made.users, 'get').mockImplementation(() => {
+      arrive();
+      return new Promise(() => undefined);
+    });
+    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
+    const pressing = made.click(`party:${made.party.id}:split`);
+    await asked;
+    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
+    const pressed = await pressing;
+    expect(pressed.showModal).not.toHaveBeenCalled();
+    expect(sent(pressed.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
+  });
+
   it('opens the dialog that asks which group for staff and the conductor, who may split several', async () => {
     const made = await setup();
     const forStaff = await made.click(`party:${made.party.id}:split`, STAFF);
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
index 5f2d3b99..9d915b6a 100644
--- a/src/commands/trains/split.ts
+++ b/src/commands/trains/split.ts
@@ -1,5 +1,4 @@
 import {
-  MessageFlags,
   SlashCommandSubcommandBuilder,
   type ButtonInteraction,
   type ChatInputCommandInteraction,
@@ -7,6 +6,7 @@ import {
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
+import { deferSubmit, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { isStaff, notATrain } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
@@ -50,16 +50,18 @@ const GROUPS_CHANGED = 'The groups of this train changed meanwhile: press Split
 /**
  * The dialog for this member, of these groups, as things stand now; who leads the new train as
  * their privacy says (`/settings privacy`, as the split itself reads it; the Submit reads it
- * anew, so a privacy changed in between counts as it is then).
+ * anew, so a privacy changed in between counts as it is then), read within `DIALOG_READ_MS` of
+ * the interaction (`readInTime`: past it no dialog, and the member is told `SLOW_READ`).
  */
 async function dialogFor(
+  interaction: ButtonInteraction | ChatInputCommandInteraction,
   ctx: AppContext,
   party: TrainParty,
   memberId: string,
   staff: boolean,
   groups: readonly [GroupId, ...GroupId[]],
 ): Promise<ReturnType<typeof splitDialog>> {
-  const settings = await ctx.users.get(memberId);
+  const settings = await readInTime(ctx.log, interaction, () => ctx.users.get(memberId));
   const anonymous = settings.raidPrivacy === RaidPrivacy.Anonymous;
   return splitDialog(
     { party, gym: (id) => ctx.gyms.get(id), memberId, staff, anonymous, now: Date.now() },
@@ -109,7 +111,7 @@ export async function openSplit(
   const [first, ...rest] = splittableGroups(party, interaction.user.id, staff);
   if (first === undefined) throw new UserError(whyNot(ctx, party, interaction.user.id, staff));
   await interaction.showModal(
-    await dialogFor(ctx, party, interaction.user.id, staff, [first, ...rest]),
+    await dialogFor(interaction, ctx, party, interaction.user.id, staff, [first, ...rest]),
   );
 }
 
@@ -153,7 +155,7 @@ export async function submitSplit(
   if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
   const member = actingMember(interaction);
   const staff = isStaff(interaction, ctx);
-  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+  await deferSubmit(interaction);
   let answer;
   try {
     answer = await splitGroupAs(ctx, { party, member, group, staff, drawn: mark }, DISCORD_NAMES);
@@ -185,7 +187,9 @@ async function splitByCommand(
   const staff = isStaff(interaction, ctx);
   const problem = mayNotSplit(party, interaction.user.id, staff, group);
   if (problem) throw new UserError(splitRefusal(ctx, party, problem, group));
-  await interaction.showModal(await dialogFor(ctx, party, interaction.user.id, staff, [group]));
+  await interaction.showModal(
+    await dialogFor(interaction, ctx, party, interaction.user.id, staff, [group]),
+  );
 }
 
 /** The part `split` of `/group`. */
diff --git a/src/discord/dialog.test.ts b/src/discord/dialog.test.ts
new file mode 100644
index 00000000..70293dfb
--- /dev/null
+++ b/src/discord/dialog.test.ts
@@ -0,0 +1,184 @@
+import { ComponentType } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { checkModal, fakeModal } from '../../test/support/fake-interactions.js';
+import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import {
+  DIALOG_READ_MS,
+  SLOW_READ,
+  channelInDialog,
+  dialog,
+  pickedOf,
+  readInTime,
+} from './dialog.js';
+import { UserError } from './errors.js';
+
+describe('dialog', () => {
+  it('is a title and a text, with Discord’s own Submit and Cancel', () => {
+    const shown = dialog({ customId: 'x:1:go', title: 'Remove a region', text: 'Remove it?' });
+    checkModal(shown);
+    expect(shown.custom_id).toBe('x:1:go');
+    expect(shown.title).toBe('Remove a region');
+    expect(dialogTexts(shown)).toEqual(['Remove it?']);
+    expect(dialogChoices(shown)).toEqual([]);
+  });
+
+  it('asks a choice as a required radio group with nothing picked', () => {
+    const shown = dialog({
+      customId: 'x:1:go',
+      title: 'Close this raid',
+      text: 'Close this raid?',
+      choice: {
+        id: 'removal',
+        label: 'The post',
+        options: [
+          { value: 'archive', label: 'Archive post', description: 'Keeps it.' },
+          { value: 'delete', label: 'Delete post', description: 'Removes it.' },
+        ],
+      },
+    });
+    checkModal(shown);
+    expect(dialogTexts(shown)).toEqual(['Close this raid?']);
+    const [label] = shown.components.filter((one) => one.type === ComponentType.Label);
+    expect(label).toMatchObject({
+      label: 'The post',
+      component: { type: ComponentType.RadioGroup, custom_id: 'removal', required: true },
+    });
+    expect(dialogChoices(shown)).toEqual([
+      { value: 'archive', label: 'Archive post', description: 'Keeps it.', picked: false },
+      { value: 'delete', label: 'Delete post', description: 'Removes it.', picked: false },
+    ]);
+  });
+
+  it('cuts a title and a text to what Discord takes', () => {
+    const shown = dialog({ customId: 'x:1:go', title: 'T'.repeat(60), text: 'w'.repeat(5_000) });
+    checkModal(shown);
+    expect(shown.title).toHaveLength(45);
+    expect(dialogTexts(shown)[0]).toHaveLength(4_000);
+  });
+});
+
+describe('channelInDialog', () => {
+  it('names a channel by its name, and one the bot cannot find as a deleted one', () => {
+    expect(channelInDialog('oakland')).toBe('#oakland');
+    expect(channelInDialog('north_hills_')).toBe('#north\\_hills\\_');
+    expect(channelInDialog(undefined)).toBe('a deleted channel');
+  });
+});
+
+describe('readInTime', () => {
+  const NOW = 1_800_000_000_000;
+  /** An interaction made just now, by the faked clock. */
+  const fresh = { createdTimestamp: NOW };
+
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOW });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('gives what was read in time, and leaves no timer behind', async () => {
+    const { log } = createTestLogger();
+    await expect(readInTime(log, fresh, () => Promise.resolve(12))).resolves.toBe(12);
+    expect(vi.getTimerCount()).toBe(0);
+  });
+
+  it('passes a refusal of the read on as it is', async () => {
+    const { log } = createTestLogger();
+    const refusal = new UserError('A raid is there.');
+    await expect(readInTime(log, fresh, () => Promise.reject(refusal))).rejects.toBe(refusal);
+    expect(vi.getTimerCount()).toBe(0);
+  });
+
+  it('passes a read that throws at once on, and leaves no timer behind', async () => {
+    const { log } = createTestLogger();
+    const refusal = new UserError('There is no gym #13.');
+    await expect(
+      readInTime(log, fresh, () => {
+        throw refusal;
+      }),
+    ).rejects.toBe(refusal);
+    expect(vi.getTimerCount()).toBe(0);
+  });
+
+  it('refuses a read past the budget, giving the use back, and logs its late failure', async () => {
+    const { log, entries } = createTestLogger();
+    let fail: (err: Error) => void = () => undefined;
+    const slow = new Promise<number>((_, reject) => {
+      fail = reject;
+    });
+    const read = readInTime(log, fresh, () => slow);
+    const refused = expect(read).rejects.toMatchObject({
+      message: SLOW_READ,
+      givesBack: true,
+    });
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS - 1);
+    await vi.advanceTimersByTimeAsync(1);
+    await refused;
+    fail(new Error('connection lost'));
+    // The read's own handler was attached first: it has run once this one does.
+    await slow.catch(() => undefined);
+    expect(entries.some((entry) => entry.level === 40 && entry.msg === 'a slow read failed')).toBe(
+      true,
+    );
+  });
+
+  it('counts the budget from when the interaction was made, not from when the read began', async () => {
+    const { log } = createTestLogger();
+    let settled = false;
+    const read = readInTime(
+      log,
+      { createdTimestamp: NOW - 1_500 },
+      () => new Promise<number>(() => undefined),
+    );
+    const refused = expect(read).rejects.toMatchObject({ message: SLOW_READ });
+    void read.catch(() => {
+      settled = true;
+    });
+    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS - 1_500 - 1);
+    expect(settled).toBe(false);
+    await vi.advanceTimersByTimeAsync(1);
+    await refused;
+    // An interaction older than the budget gets no time at all.
+    const old = readInTime(
+      log,
+      { createdTimestamp: NOW - 5_000 },
+      () => new Promise(() => undefined),
+    );
+    const refusedAtOnce = expect(old).rejects.toMatchObject({ message: SLOW_READ });
+    await vi.advanceTimersByTimeAsync(0);
+    await refusedAtOnce;
+  });
+
+  it('does not refuse a read that comes just in time', async () => {
+    const { log } = createTestLogger();
+    let done: (n: number) => void = () => undefined;
+    const read = readInTime(
+      log,
+      fresh,
+      () =>
+        new Promise<number>((resolve) => {
+          done = resolve;
+        }),
+    );
+    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS - 1);
+    done(3);
+    await expect(read).resolves.toBe(3);
+  });
+});
+
+describe('pickedOf', () => {
+  it('gives the choice picked, and nothing for one that is no choice of the dialog', () => {
+    const picked = fakeModal({ customId: 'x:1:go', picked: { removal: 'delete' } });
+    expect(pickedOf(picked as never, 'removal', ['archive', 'delete'])).toBe('delete');
+    const other = fakeModal({ customId: 'x:1:go', picked: { removal: 'burn' } });
+    expect(pickedOf(other as never, 'removal', ['archive', 'delete'])).toBeUndefined();
+  });
+
+  it('gives nothing for a Submit without the radio group (a dialog of an older shape)', () => {
+    const older = fakeModal({ customId: 'x:1:go' });
+    expect(pickedOf(older as never, 'removal', ['archive', 'delete'])).toBeUndefined();
+  });
+});
diff --git a/src/discord/dialog.ts b/src/discord/dialog.ts
new file mode 100644
index 00000000..dff1fafa
--- /dev/null
+++ b/src/discord/dialog.ts
@@ -0,0 +1,159 @@
+import {
+  ComponentType,
+  MessageFlags,
+  type APIModalInteractionResponseCallbackData,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { Logger } from '../log.js';
+import { plain, truncate } from '../render/text.js';
+import { textDisplay } from '../render/v2.js';
+import { UserError } from './errors.js';
+
+/*
+ * Dialogs as one-shot questions (plans 8T-H, 8Q; design `2026-10-18-one-shot-dialogs-design.md`):
+ * a question asked once ("Remove all your wants?", "Close this raid?") is a Discord dialog, the
+ * first answer of the command or press (nothing is deferred before `showModal`), with Discord's
+ * own Submit and Cancel. What the question needs from the database is read within
+ * `DIALOG_READ_MS` of the interaction (`readInTime`), since Discord takes no dialog after three
+ * seconds; its
+ * Submit is deferred privately at once (`deferSubmit`) and decides everything again.
+ */
+
+/** Discord's limits of a dialog: its title, and a text display. */
+const TITLE_ROOM = 45;
+const TEXT_ROOM = 4_000;
+
+/** How long what a dialog needs may take to read: Discord's three seconds, less a margin. */
+export const DIALOG_READ_MS = 2_000;
+
+/** What a member is told when what a dialog needs took longer than `DIALOG_READ_MS`. */
+export const SLOW_READ = 'That took me too long to look up: try again in a moment.';
+
+/** A choice of a dialog's radio group: a label, the value it submits, what it does. */
+export interface DialogOption {
+  value: string;
+  label: string;
+  description: string;
+}
+
+/** What a dialog asks: its custom id, title, text, and a choice between ways when it has one. */
+export interface DialogContent {
+  customId: string;
+  /** The act (`Remove a region`), cut to Discord's 45 characters. */
+  title: string;
+  /** The question, as Markdown (a dialog's text displays show it). */
+  text: string;
+  /**
+   * A choice between ways (archive or delete a post): a required radio group with nothing
+   * picked, so that Submit never does the harsher one by default; `id` is read at Submit with
+   * `fields.getRadioGroup(id, true)`.
+   */
+  choice?: { id: string; label: string; options: readonly DialogOption[] };
+}
+
+/** The dialog, as `showModal` takes it. */
+export function dialog(content: DialogContent): APIModalInteractionResponseCallbackData {
+  const { choice } = content;
+  return {
+    custom_id: content.customId,
+    title: truncate(content.title, TITLE_ROOM),
+    components: [
+      textDisplay(truncate(content.text, TEXT_ROOM)),
+      ...(choice === undefined
+        ? []
+        : [
+            {
+              type: ComponentType.Label as const,
+              label: choice.label,
+              component: {
+                type: ComponentType.RadioGroup as const,
+                custom_id: choice.id,
+                required: true,
+                options: choice.options.map((option) => ({ ...option })),
+              },
+            },
+          ]),
+    ],
+  };
+}
+
+/**
+ * A channel as a dialog names it: `#oakland` by its name, `a deleted channel` for one the bot
+ * cannot find. A dialog does not mention channels (`<#id>`): whether Discord shows a mention
+ * inside a dialog is not checked yet (design, "Channels in a dialog's text are named").
+ */
+export function channelInDialog(name: string | undefined): string {
+  return name === undefined ? 'a deleted channel' : `#${plain(name)}`;
+}
+
+/**
+ * What a dialog needs, read within `DIALOG_READ_MS` of when the interaction was made (`since`,
+ * its `createdTimestamp`: Discord counts its three seconds from then, not from when the read
+ * began, as the router's late deferral does): past it the member is refused with `SLOW_READ` (a
+ * `UserError` that gives the use back: none of their doing) and no dialog opens, since a
+ * `showModal` after Discord's three seconds fails for good. A refusal of the read itself (a raid
+ * at the gym), also one thrown at once, passes on as it is; a read that fails after it was given
+ * up is logged.
+ */
+export function readInTime<T>(
+  log: Logger,
+  since: { createdTimestamp: number },
+  work: () => Promise<T>,
+): Promise<T> {
+  const age = Math.max(0, Date.now() - since.createdTimestamp);
+  return new Promise<T>((resolve, reject) => {
+    let late = false;
+    const timer = setTimeout(
+      () => {
+        late = true;
+        reject(new UserError(SLOW_READ, { givesBack: true }));
+      },
+      Math.max(0, DIALOG_READ_MS - age),
+    );
+    let reading: Promise<T>;
+    try {
+      reading = work();
+    } catch (err) {
+      // Thrown before it was a promise: no timer may stay behind.
+      clearTimeout(timer);
+      reject(err instanceof Error ? err : new Error(String(err)));
+      return;
+    }
+    reading.then(
+      (value) => {
+        clearTimeout(timer);
+        resolve(value);
+      },
+      (err: unknown) => {
+        clearTimeout(timer);
+        if (late) log.warn({ err }, 'a slow read failed');
+        else reject(err instanceof Error ? err : new Error(String(err)));
+      },
+    );
+  });
+}
+
+/**
+ * Acknowledges a dialog's Submit privately, at once: what follows decides everything again and
+ * may take longer than Discord waits (a post ended, a forum deleted). The answer is the edit of
+ * this acknowledgement (`editReply`, `answerApart`), and the router's refusals follow it.
+ */
+export async function deferSubmit(interaction: ModalSubmitInteraction): Promise<void> {
+  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+}
+
+/**
+ * The choice a Submit picked in the radio group `id`, when it is one of `values`; undefined for
+ * anything else: a Submit without that group (a dialog of an older shape, a forged one), which
+ * discord.js would refuse with `ModalSubmitInteractionFieldNotFound` whatever `required` says, or
+ * a value that is none of the choices.
+ */
+export function pickedOf<V extends string>(
+  interaction: ModalSubmitInteraction,
+  id: string,
+  values: readonly V[],
+): V | undefined {
+  if (!interaction.fields.fields.has(id)) return undefined;
+  const picked = interaction.fields.getRadioGroup(id);
+  return values.find((value) => value === picked);
+}
diff --git a/src/render/train-split.ts b/src/render/train-split.ts
index b0126905..8227f4ab 100644
--- a/src/render/train-split.ts
+++ b/src/render/train-split.ts
@@ -1,9 +1,6 @@
-import {
-  ComponentType,
-  type APIModalInteractionResponseCallbackData,
-  type APIRadioGroupOption,
-} from 'discord.js';
+import type { APIModalInteractionResponseCallbackData } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
+import { dialog } from '../discord/dialog.js';
 import {
   groupOf,
   isGroupId,
@@ -19,7 +16,6 @@ import { groupInPostOrder, guestsOf } from './party-post.js';
 import { gymName } from './raid-post.js';
 import { count, memberName, plain, truncate } from './text.js';
 import type { TrainPlaces } from './train-post.js';
-import { textDisplay } from './v2.js';
 
 /** What the dialog of a split is drawn from: the train and who asks (plan 8T-H). */
 export interface SplitView extends TrainPlaces {
@@ -217,7 +213,7 @@ export function splitChoice(value: string): { group: GroupId; mark: string } | u
 /**
  * The dialog of splitting a group off a train (plan 8T-H; design
  * `2026-10-18-train-split-dialog-design.md`), titled `Split a group off the train`, with
- * Discord's own Submit and Cancel. For one group (`groups` of one: the member may split only it,
+ * Discord's own Submit and Cancel (`dialog`). For one group (`groups` of one: the member may split only it,
  * or `/group split` named it): one text, what becomes of the group (the new train's name, as
  * `splitTrain` makes it), the same route at the same stop, who moves (the first `NAMES_SHOWN`),
  * who leads which train, and `Submit splits it off.`; its custom id
@@ -235,40 +231,31 @@ export function splitDialog(
   const { party } = view;
   const [first] = groups;
   if (groups.length === 1) {
-    return {
-      custom_id: encodeCustomId({
+    return dialog({
+      customId: encodeCustomId({
         kind: PARTY_KIND,
         id: party.id,
         action: SPLIT_FORM,
         args: [first, groupMark(party, first) ?? '0'],
       }),
       title: TITLE,
-      components: [textDisplay(oneGroupText(view, first))],
-    };
+      text: oneGroupText(view, first),
+    });
   }
-  const options: APIRadioGroupOption[] = groups.map((id) => ({
-    label: choiceLabel(party, groupOf(party, id) ?? { id }),
-    value: choiceValue(party, id),
-    description: choiceDescription(view, id),
-  }));
-  return {
-    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: SPLIT_FORM }),
+  return dialog({
+    customId: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: SPLIT_FORM }),
     title: TITLE,
-    components: [
-      textDisplay(
-        `The group you pick leaves **${plain(nameOf(party))}** and becomes a train of its own: ` +
-          `${whereWords(view)}. Its members move to it as they are signed up now.`,
-      ),
-      {
-        type: ComponentType.Label,
-        label: 'Group that leaves',
-        component: {
-          type: ComponentType.RadioGroup,
-          custom_id: SPLIT_GROUP_INPUT,
-          required: true,
-          options,
-        },
-      },
-    ],
-  };
+    text:
+      `The group you pick leaves **${plain(nameOf(party))}** and becomes a train of its own: ` +
+      `${whereWords(view)}. Its members move to it as they are signed up now.`,
+    choice: {
+      id: SPLIT_GROUP_INPUT,
+      label: 'Group that leaves',
+      options: groups.map((id) => ({
+        label: choiceLabel(party, groupOf(party, id) ?? { id }),
+        value: choiceValue(party, id),
+        description: choiceDescription(view, id),
+      })),
+    },
+  });
 }
diff --git a/test/support/dialogs.ts b/test/support/dialogs.ts
new file mode 100644
index 00000000..f66dab1d
--- /dev/null
+++ b/test/support/dialogs.ts
@@ -0,0 +1,52 @@
+import { ComponentType, type APIModalInteractionResponseCallbackData } from 'discord.js';
+
+/** What a handler showed with `showModal`, as a fake recorded it. */
+interface ShowsModals {
+  showModal: { mock: { calls: ReadonlyArray<readonly unknown[]> } };
+}
+
+/** The dialog a fake was answered with (`showModal`); undefined when it opened none. */
+export function dialogOf(fake: ShowsModals): APIModalInteractionResponseCallbackData | undefined {
+  return fake.showModal.mock.calls[0]?.[0] as APIModalInteractionResponseCallbackData | undefined;
+}
+
+/** The dialog a fake was answered with; fails the test when it opened none. */
+export function shownDialog(fake: ShowsModals): APIModalInteractionResponseCallbackData {
+  const shown = dialogOf(fake);
+  if (!shown) throw new Error('no dialog was opened');
+  return shown;
+}
+
+/** The texts of a dialog's text displays. */
+export function dialogTexts(dialog: APIModalInteractionResponseCallbackData): string[] {
+  return dialog.components.flatMap((component) =>
+    component.type === ComponentType.TextDisplay ? [component.content] : [],
+  );
+}
+
+/** The texts of a dialog's text displays as one text, a line between two. */
+export function dialogText(dialog: APIModalInteractionResponseCallbackData): string {
+  return dialogTexts(dialog).join('\n');
+}
+
+/** A choice of a dialog's radio groups, and whether it is picked before the member picks. */
+export interface DialogChoice {
+  value: string;
+  label: string;
+  description: string | undefined;
+  picked: boolean;
+}
+
+/** The choices of a dialog's radio groups, in their order. */
+export function dialogChoices(dialog: APIModalInteractionResponseCallbackData): DialogChoice[] {
+  return dialog.components.flatMap((component) =>
+    component.type === ComponentType.Label && component.component.type === ComponentType.RadioGroup
+      ? component.component.options.map((option) => ({
+          value: option.value,
+          label: option.label,
+          description: option.description,
+          picked: option.default === true,
+        }))
+      : [],
+  );
+}
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 9ee3b20b..f4c4ed0f 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -857,6 +857,8 @@ function base(kind: Kind, o: FakeOptions) {
     },
     // As discord.js: reading an input the form did not submit, or of another type, throws.
     fields: {
+      /** As discord.js's `fields.fields`: what the form submitted, by custom id. */
+      fields: submitted,
       getTextInputValue: (id: string) => {
         const input = submitted.get(id);
         if (input?.type !== ComponentType.TextInput) throw notSubmitted(id, 'text input');
````

### Task 2: Plan 8Q T2: Remove all asks in a dialog (8Q-2)

Prototype commit: `88f9ae51abe3f724fc52c19444c1987b007208e7`

/unwant-all, /untarget-all and the lists' "Remove all..." open a dialog
titled "Remove all your wants" / "Remove all your gym targets": today's
question with the count, read within the slow-read budget, then "Submit
removes them." ("... removes it." for one). With nothing to remove the
private answer says so as before and nothing opens. Discord's Cancel
replaces Keep them; the commands declare no defer any more.

The Submit (wants:all:remove, targets:all:remove) is acknowledged
privately and removes whatever the list holds then, answering today's
"Removed 3 entries: ..." (or that the list is empty); a failure says
"Nothing was removed." before the router says what went wrong. The
question's buttons and their pending requests go: an old press gets the
router's stale answer. The list stays as it was under "Remove all...".

**Files:**

```
 docs/architecture/notifications-and-dms.md |   2 +-
 src/commands/notifications/remove-all.ts   | 103 +++++++++++++-------------------
 src/commands/notifications/targets.test.ts |  62 +++++++++++--------
 src/commands/notifications/targets.ts      |  11 ++--
 src/commands/notifications/wants.test.ts   | 159 ++++++++++++++++++++++++++++---------------------
 src/commands/notifications/wants.ts        |  11 ++--
 src/discord/custom-id.ts                   |   4 +-
 7 files changed, 184 insertions(+), 168 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/commands/notifications/wants.test.ts src/commands/notifications/targets.test.ts src/render/member-list.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 88f9ae51abe3f724fc52c19444c1987b007208e7 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8Q T2: Remove all asks in a dialog (8Q-2)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/notifications-and-dms.md
git add -- src/commands/notifications/remove-all.ts
git add -- src/commands/notifications/targets.test.ts
git add -- src/commands/notifications/targets.ts
git add -- src/commands/notifications/wants.test.ts
git add -- src/commands/notifications/wants.ts
git add -- src/discord/custom-id.ts
```

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index f1f23b87..bfe4cc3a 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -8,7 +8,7 @@ What members ask to be told about (wants, gym targets, new trains, boss-set), ho
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
-- Commands that answer one member privately about their own settings (`/settings`, the wants, the gym targets, `/friend-code`, `/nickname`) are tied to no bot channel; what writes is throttled with `MEMBER_WRITE_THROTTLE` (`src/discord/throttle.ts`), what asks Discord about members with a tighter one. The server of an interaction is `guildIdOf(interaction)` (`guards.ts`). What autocomplete handlers share (`Choice`, `MAX_CHOICES`, `byName`, `beginningFirst`) is in `src/commands/choices.ts`. A question with "Remove all" / "Keep" is `removeAllQuestion` (`src/commands/notifications/remove-all.ts`). `/wants` and `/targets` answer with a components-v2 list (`renderMemberList`, `src/render/member-list.ts`; plan 8B-1): a heading and a count, `LIST_PAGE` (10) entries to a page, each a section with a red Remove, Previous / Next, "Remove all…" (the question of `/unwant-all` / `/untarget-all`, asked in a new private answer) and how to add one; the entries share what is left of `TEXT_BUDGET` (a gym's name is cut before it is escaped). Their controls are `memberListControls` (`src/commands/notifications/list-controls.ts`), the kinds `wantlist` and `targetlist` (`wants` and `targets` are the remove-all questions): `<kind>:<page>:prev|next|all` and `<kind>:<page>:remove:<what>` with `<what>` as `stopArgs` spells it; a press reads the member's list anew, removes (what is gone already is no error) and shows the page again with `update` (the last page when it is past the end); one throttle, `MEMBER_WRITE_THROTTLE`, for all of a kind. An answer that is a v2 message goes through `answer(interaction, v2Answer(message))` (`src/discord/late-reply.ts`), an `update` or `editReply` with `v2Answer(message)`.
+- Commands that answer one member privately about their own settings (`/settings`, the wants, the gym targets, `/friend-code`, `/nickname`) are tied to no bot channel; what writes is throttled with `MEMBER_WRITE_THROTTLE` (`src/discord/throttle.ts`), what asks Discord about members with a tighter one. The server of an interaction is `guildIdOf(interaction)` (`guards.ts`). What autocomplete handlers share (`Choice`, `MAX_CHOICES`, `byName`, `beginningFirst`) is in `src/commands/choices.ts`. `/unwant-all`, `/untarget-all` and "Remove all…" ask in a dialog (plan 8Q, `removeAllQuestion` in `src/commands/notifications/remove-all.ts`): titled `Remove all your wants` / `Remove all your gym targets`, the question with the count read in time (`readInTime`), then `Submit removes them.`; with nothing to remove the private answer says so and no dialog opens. Its Submit (`wants:all:remove`, `targets:all:remove`) is acknowledged privately and removes whatever the list holds then; the commands declare no `defer`. `/wants` and `/targets` answer with a components-v2 list (`renderMemberList`, `src/render/member-list.ts`; plan 8B-1): a heading and a count, `LIST_PAGE` (10) entries to a page, each a section with a red Remove, Previous / Next, "Remove all…" (the dialog of `/unwant-all` / `/untarget-all`; the list stays as it was) and how to add one; the entries share what is left of `TEXT_BUDGET` (a gym's name is cut before it is escaped). Their controls are `memberListControls` (`src/commands/notifications/list-controls.ts`), the kinds `wantlist` and `targetlist` (`wants` and `targets` are the Submits of the remove-all dialogs): `<kind>:<page>:prev|next|all` and `<kind>:<page>:remove:<what>` with `<what>` as `stopArgs` spells it; a press reads the member's list anew, removes (what is gone already is no error) and shows the page again with `update` (the last page when it is past the end); one throttle, `MEMBER_WRITE_THROTTLE`, for all of a kind. An answer that is a v2 message goes through `answer(interaction, v2Answer(message))` (`src/discord/late-reply.ts`), an `update` or `editReply` with `v2Answer(message)`.
 
 ## The notifier
 
diff --git a/src/commands/notifications/remove-all.ts b/src/commands/notifications/remove-all.ts
index e19a34f5..fef59196 100644
--- a/src/commands/notifications/remove-all.ts
+++ b/src/commands/notifications/remove-all.ts
@@ -1,24 +1,19 @@
-import {
-  ActionRowBuilder,
-  ButtonBuilder,
-  ButtonStyle,
-  type ButtonInteraction,
-  type ChatInputCommandInteraction,
-} from 'discord.js';
+import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { ComponentHandler } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
+import { deferSubmit, dialog, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
-import { guildIdOf } from '../../discord/guards.js';
-import { NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
+import { guildIdOf, requireGuild } from '../../discord/guards.js';
 import { answer } from '../../discord/late-reply.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
 
 /** What a "remove all of them?" question is about. */
 export interface RemoveAllOptions {
-  /** The custom-id kind of the two buttons; it belongs to this question alone. */
+  /** The custom-id kind of its dialog; it belongs to this question alone. */
   kind: string;
-  /** The command that asks, as a member types it: `/unwant-all`. */
-  command: string;
+  /** The dialog's title: `Remove all your wants`. */
+  title: string;
   /** How many there are to remove for a member in a server. */
   count(ctx: AppContext, memberId: string, guildId: string): Promise<number>;
   /** Removes them all and gives how many went. */
@@ -27,80 +22,68 @@ export interface RemoveAllOptions {
   none: string;
   /** The question, for `n` of them. */
   question(n: number): string;
-  /** The label of the button that removes them: `Remove all 3`, and `Remove it` for one. */
-  button(n: number): string;
   /** What the member is told once `n` are gone. */
   removed(n: number): string;
 }
 
+/** The action of the dialog's custom id: `<kind>:all:remove`. */
+const REMOVE = 'remove';
+
+/** What a Submit answers when the removal failed. */
+const NOTHING_REMOVED = 'Nothing was removed.';
+
 /**
- * A command that removes everything a member has of one kind in a server, after asking: two
- * buttons, Remove all N and Keep them (Remove it and Keep it for one). The question is kept in a `PendingRequests` store as `/raid`
- * keeps its own (the token is the id of the custom id): only the member who asked can answer,
- * once, within ten minutes. Gives the command's `execute` (the interaction is deferred) and the
- * handler of the buttons. `ask` also answers "Remove all…" under a member's list (`/wants`,
- * `/targets`): the question then comes as a new private answer, and the list stays as it was.
+ * A command that removes everything a member has of one kind in a server, after asking (plan
+ * 8Q): a dialog with the question and `Submit removes them.` (`… removes it.` for one), Discord's
+ * Cancel closing it; with nothing to remove the member is told so, privately, and nothing opens.
+ * The count is read within `DIALOG_READ_MS` (`readInTime`). The dialog's custom id is
+ * `<kind>:all:remove` (the server is the Submit's own, and only the asker can submit a dialog);
+ * its Submit is acknowledged privately and removes whatever the list holds then, as the press
+ * of the old question did. Gives the command's `execute` (declare no `defer`: the dialog is the
+ * first answer) and the handler of the Submit. `ask` also answers "Remove all…" under a member's
+ * list (`/wants`, `/targets`), which stays as it was.
  */
 export function removeAllQuestion(options: RemoveAllOptions): {
   ask(interaction: ChatInputCommandInteraction | ButtonInteraction, ctx: AppContext): Promise<void>;
   controls: ComponentHandler;
 } {
-  const pending = new PendingRequests<{ guildId: string }>();
-  const expired = `That question has expired. Use \`${options.command}\` again.`;
   return {
     async ask(interaction, ctx) {
       const guildId = guildIdOf(interaction);
-      const n = await options.count(ctx, interaction.user.id, guildId);
+      const n = await readInTime(ctx.log, interaction, () =>
+        options.count(ctx, interaction.user.id, guildId),
+      );
       if (n === 0) {
         await answer(interaction, { content: options.none });
         return;
       }
-      const token = pending.put(interaction.user.id, { guildId });
-      const button = (action: string, label: string, style: ButtonStyle) =>
-        new ButtonBuilder()
-          .setCustomId(encodeCustomId({ kind: options.kind, id: token, action }))
-          .setLabel(label)
-          .setStyle(style);
-      await answer(interaction, {
-        content: options.question(n),
-        components: [
-          new ActionRowBuilder<ButtonBuilder>().addComponents(
-            button('all', options.button(n), ButtonStyle.Danger),
-            button('keep', n === 1 ? 'Keep it' : 'Keep them', ButtonStyle.Secondary),
-          ),
-        ],
-      });
+      await interaction.showModal(
+        dialog({
+          customId: encodeCustomId({ kind: options.kind, id: 'all', action: REMOVE }),
+          title: options.title,
+          text: `${options.question(n)}\n\nSubmit removes ${n === 1 ? 'it' : 'them'}.`,
+        }),
+      );
     },
     controls: {
       kind: options.kind,
-      async button(interaction, id, ctx) {
-        const taken = pending.take(id.id, interaction.user.id);
-        if (taken === 'not-yours') throw new UserError(NOT_YOURS);
-        if (taken === 'expired') {
-          await interaction.update({ content: expired, components: [] });
-          return;
-        }
-        if (id.action !== 'all') {
-          await interaction.update({ content: 'Nothing was removed.', components: [] });
-          return;
-        }
-        // The database first, the answer after: the buttons go only once it is known what came
-        // of it. A failure leaves the question answered (its token is used up) and is reported
-        // by the router.
-        await interaction.deferUpdate();
+      guards: [requireGuild],
+      async modal(interaction, id, ctx) {
+        if (id.action !== REMOVE) throw new UserError(STALE_COMPONENT);
+        await deferSubmit(interaction);
         let content: string;
         try {
-          const n = await options.removeAll(ctx, interaction.user.id, taken.value.guildId);
+          const n = await options.removeAll(ctx, interaction.user.id, guildIdOf(interaction));
           content = n === 0 ? options.none : options.removed(n);
         } catch (err) {
-          try {
-            await answer(interaction, { content: 'Nothing was removed.', components: [] });
-          } catch {
-            // The message may be gone or the token expired; the error below is what matters.
-          }
+          // Said before the router says what went wrong; an answer that cannot be given is
+          // logged, so that the router gets the removal's own failure.
+          await interaction.editReply({ content: NOTHING_REMOVED }).catch((noteErr: unknown) => {
+            ctx.log.warn({ err: noteErr }, 'could not say that nothing was removed');
+          });
           throw err;
         }
-        await answer(interaction, { content, components: [] });
+        await interaction.editReply({ content });
       },
     },
   };
diff --git a/src/commands/notifications/targets.test.ts b/src/commands/notifications/targets.test.ts
index 82e2a591..7e41b712 100644
--- a/src/commands/notifications/targets.test.ts
+++ b/src/commands/notifications/targets.test.ts
@@ -1,10 +1,12 @@
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { dialogText, shownDialog } from '../../../test/support/dialogs.js';
 import {
   FAKE_GUILD_ID,
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeModal,
   fakeSelect,
   answered,
   asV2,
@@ -24,7 +26,7 @@ import { ALICE, BOB } from '../../../test/support/parties.js';
 import { createdMeetup, createdTrain, reportedRaid } from '../../../test/support/party-service.js';
 import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
 import { createTestContext } from '../../../test/support/test-context.js';
-import { InteractionRouter } from '../../discord/router.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { gymMapsUrl } from '../../render/raid-post.js';
 import {
   ownTargetChoices,
@@ -585,15 +587,15 @@ describe('/targets', () => {
     expect(customIdsOf(shown(sent(back.update)))[0]).toMatch(/^targetlist:0:remove:/);
   });
 
-  it('asks the question of /untarget-all on Remove all…, in a new private answer', async () => {
+  it('asks the question of /untarget-all on Remove all… in its dialog, the list staying', async () => {
     const made = setup();
     made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
     const pressed = await made.handle(
       fakeButton({ customId: 'targetlist:0:all', userId: ALICE, guildChannelNames: SERVER }),
     );
     expect(pressed.update).not.toHaveBeenCalled();
-    expect(answered(pressed).content).toMatch(/^Remove your one gym in this server\?/);
-    expect(answered(pressed).flags).toBe(MessageFlags.Ephemeral);
+    expect(shownDialog(pressed).title).toBe('Remove all your gym targets');
+    expect(dialogText(shownDialog(pressed))).toMatch(/^Remove your one gym in this server\?/);
     expect(made.gymsOf()).toEqual(['1']);
   });
 
@@ -663,48 +665,56 @@ describe('/targets', () => {
 });
 
 describe('/untarget-all', () => {
-  it('asks first and removes every row of the member in this server on Remove all', async () => {
+  /** The Submit of the dialog a fake was shown, by Alice. */
+  const submit = (made: ReturnType<typeof setup>, asked: FakeInteraction) => {
+    const dialog = shownDialog(asked);
+    return made.handle(fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE }));
+  };
+
+  it('asks first in a dialog and removes every row of the member in this server on Submit', async () => {
     const made = setup();
     for (const gym of ['1', '2', 'nowhere']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
     made.store.addRow(ALICE, OTHER_GUILD, '3');
     made.store.addRow(BOB, FAKE_GUILD_ID, '1');
     const asked = await made.run('untarget-all');
-    expect(answered(asked).content).toBe(
+    const dialog = shownDialog(asked);
+    expect(dialog.title).toBe('Remove all your gym targets');
+    expect(dialogText(dialog)).toBe(
       'Remove all 3 of your gyms in this server? You will get no DMs for raids at particular ' +
-        'gyms here any more.',
+        'gyms here any more.\n\nSubmit removes them.',
     );
-    const buttons = controls(asked);
-    expect(buttons.map((button) => button.label)).toEqual(['Remove all 3', 'Keep them']);
-    expect(buttons[0]?.custom_id).toMatch(/^targets:[0-9a-f]{16}:all$/);
     expect(made.store.rows).toHaveLength(5);
-    const other = await made.handle(
-      fakeButton({ customId: buttons[0]?.custom_id ?? '', userId: BOB }),
-    );
-    expect(sent(other.reply).content).toBe('That is somebody else’s question.');
-    const pressed = await made.handle(
-      fakeButton({ customId: buttons[0]?.custom_id ?? '', userId: ALICE }),
-    );
-    expect(pressed.editReply).toHaveBeenCalledWith({
+    const submitted = await submit(made, asked);
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(sent(submitted.editReply)).toEqual({
       content: 'Removed 3 gyms: you have no gyms in this server any more.',
-      components: [],
     });
     expect(made.gymsOf()).toEqual([]);
     expect(made.store.rows).toHaveLength(2);
   });
 
-  it('removes nothing on Keep, and says so when there is nothing to remove', async () => {
+  it('says so when there is nothing to remove, and words one gym as one', async () => {
     const made = setup();
-    expect(await made.answer('untarget-all')).toBe(
+    const none = await made.run('untarget-all');
+    expect(none.showModal).not.toHaveBeenCalled();
+    expect(answered(none).content).toBe(
       'You have no gyms in this server: there is nothing to remove.',
     );
     made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
     const asked = await made.run('untarget-all');
-    expect(answered(asked).content).toMatch(/^Remove your one gym in this server\?/);
-    expect(controls(asked).map((button) => button.label)).toEqual(['Remove it', 'Keep it']);
-    const kept = await made.handle(
-      fakeButton({ customId: controls(asked)[1]?.custom_id ?? '', userId: ALICE }),
+    expect(dialogText(shownDialog(asked))).toMatch(
+      /^Remove your one gym in this server\?[^\n]*\n\nSubmit removes it\.$/,
+    );
+    expect(made.gymsOf()).toEqual(['1']);
+  });
+
+  it('gives the buttons of the question it asked before the stale answer', async () => {
+    const made = setup();
+    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
+    const pressed = await made.handle(
+      fakeButton({ customId: 'targets:0123456789abcdef:all', userId: ALICE }),
     );
-    expect(kept.update).toHaveBeenCalledWith({ content: 'Nothing was removed.', components: [] });
+    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
     expect(made.gymsOf()).toEqual(['1']);
   });
 });
diff --git a/src/commands/notifications/targets.ts b/src/commands/notifications/targets.ts
index fba859ab..64cc713b 100644
--- a/src/commands/notifications/targets.ts
+++ b/src/commands/notifications/targets.ts
@@ -502,14 +502,13 @@ export const targets: SimpleCommand = {
 
 const allTargets = removeAllQuestion({
   kind: 'targets',
-  command: '/untarget-all',
+  title: 'Remove all your gym targets',
   count: (ctx, memberId, guildId) => ctx.gymTargets.count(memberId, guildId),
   removeAll: (ctx, memberId, guildId) => ctx.gymTargets.removeAll(memberId, guildId),
   none: 'You have no gyms in this server: there is nothing to remove.',
   question: (n) =>
     `Remove ${n === 1 ? 'your one gym' : `all ${String(n)} of your gyms`} in this server? ` +
     'You will get no DMs for raids at particular gyms here any more.',
-  button: (n) => (n === 1 ? 'Remove it' : `Remove all ${String(n)}`),
   removed: (n) => `Removed ${count(n, 'gym')}: you have no gyms in this server any more.`,
 });
 
@@ -521,18 +520,18 @@ export const untargetAll: SimpleCommand = {
   help: {
     category: 'notifications',
     details:
-      'Removes all your gyms in this server, after asking you once. Your gyms in other ' +
-      'servers and your list of Pokémon (`/wants`) stay as they are.',
+      'Removes all your gyms in this server, after asking you once, in a dialog. Your gyms ' +
+      'in other servers and your list of Pokémon (`/wants`) stay as they are.',
     examples: ['/untarget-all'],
   },
   enabled: notificationsEnabled,
   guards: [requireGuild],
-  defer: 'late',
+  // The dialog is the first answer: nothing is deferred before it.
   throttle: NOTIFICATION_THROTTLE,
   execute: (interaction, ctx) => allTargets.ask(interaction, ctx),
 };
 
-/** The two buttons of `/untarget-all`. */
+/** The Submit of the dialog of `/untarget-all`. */
 export const targetRemovalControls = allTargets.controls;
 
 /** The buttons of `/targets`: the pages, Remove, and "Remove all…". */
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index 99649e69..69aa2949 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -1,10 +1,12 @@
 import { MessageFlags } from 'discord.js';
-import { describe, expect, it } from 'vitest';
+import { describe, expect, it, vi } from 'vitest';
+import { dialogChoices, dialogText, shownDialog } from '../../../test/support/dialogs.js';
 import {
   FAKE_GUILD_ID,
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeModal,
   sent,
   type FakeInteraction,
   answered,
@@ -21,7 +23,8 @@ import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { ALICE, BOB } from '../../../test/support/parties.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryWants } from '../../../test/support/wants.js';
-import { InteractionRouter } from '../../discord/router.js';
+import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import {
   notificationTiers,
   pokemonTarget,
@@ -31,6 +34,7 @@ import { bossIdsOf, type RaidBoss } from '../../domain/pogo/raid-bosses.js';
 import type { WantList } from '../../domain/pogo/wants.js';
 import { catalogueFixture } from '../../../test/support/game-data.js';
 import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
+import { NOTIFICATION_THROTTLE } from './shared.js';
 import { wantChoices } from './want-input.js';
 import {
   unwant,
@@ -94,14 +98,6 @@ function setup() {
   return { ctx, store, router, run, answer, choices, handle, rows, formRows };
 }
 
-/** The custom id of the n-th button of a reply. */
-function customId(interaction: FakeInteraction, index = 0): string {
-  const row = answered(interaction).components?.[0] as {
-    toJSON(): { components: { custom_id: string; label: string }[] };
-  };
-  return row.toJSON().components[index]?.custom_id ?? '';
-}
-
 describe('the notification commands', () => {
   it('exist only where notifications are switched on, with help in the notifications category', () => {
     const { ctx } = createTestContext();
@@ -1375,12 +1371,21 @@ describe('/wants', () => {
     expect(made.rows()).toEqual([[3, 'both']]);
   });
 
-  it('asks the question of /unwant-all on Remove all…, in a new private answer', async () => {
+  it('asks the question of /unwant-all on Remove all… in its dialog, the list staying', async () => {
     const made = setup();
     made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
     const pressed = await made.handle(fakeButton({ customId: 'wantlist:0:all', userId: ALICE }));
-    expect(answered(pressed).content).toMatch(/^Remove the one entry of your list/);
+    expect(pressed.update).not.toHaveBeenCalled();
+    expect(shownDialog(pressed).title).toBe('Remove all your wants');
+    expect(dialogText(shownDialog(pressed))).toMatch(/^Remove the one entry of your list/);
     expect(made.rows()).toHaveLength(1);
+    // With nothing to remove, it says so and opens nothing.
+    made.store.rows.splice(0);
+    const empty = await made.handle(fakeButton({ customId: 'wantlist:0:all', userId: ALICE }));
+    expect(empty.showModal).not.toHaveBeenCalled();
+    expect(answered(empty).content).toBe(
+      'Your list for this server is empty: there is nothing to remove.',
+    );
   });
 
   it('refuses a Remove that names no want', async () => {
@@ -1455,87 +1460,96 @@ describe('/unwant-all', () => {
     made.store.add(BOB, FAKE_GUILD_ID, 150, 'both');
     return made;
   };
-  const press = (made: ReturnType<typeof setup>, id: string, userId = ALICE) =>
-    made.handle(fakeButton({ customId: id, userId }));
+  /** The Submit of the dialog a fake was shown, by Alice. */
+  const submit = (made: ReturnType<typeof setup>, asked: FakeInteraction) => {
+    const dialog = shownDialog(asked);
+    return made.handle(fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE }));
+  };
 
-  it('says so when there is nothing to remove', async () => {
+  it('says so when there is nothing to remove, and opens no dialog', async () => {
     const made = setup();
     const used = await made.run('unwant-all');
-    expect(answered(used).content).toBe(
-      'Your list for this server is empty: there is nothing to remove.',
-    );
+    expect(used.showModal).not.toHaveBeenCalled();
+    expect(answered(used)).toEqual({
+      content: 'Your list for this server is empty: there is nothing to remove.',
+      flags: MessageFlags.Ephemeral,
+    });
   });
 
-  it('asks first, with two buttons, and removes nothing yet', async () => {
+  it('asks first in a dialog, and removes nothing yet', async () => {
     const made = filled();
     const asked = await made.run('unwant-all');
-    expect(answered(asked).content).toBe(
+    expect(asked.deferReply).not.toHaveBeenCalled();
+    expect(asked.reply).not.toHaveBeenCalled();
+    const dialog = shownDialog(asked);
+    expect(dialog.title).toBe('Remove all your wants');
+    expect(dialogText(dialog)).toBe(
       'Remove all 3 entries of your list for this server? You will get no DMs for Pokémon or ' +
-        'raid tiers here any more.',
+        'raid tiers here any more.\n\nSubmit removes them.',
     );
-    const row = answered(asked).components?.[0] as {
-      toJSON(): { components: { custom_id: string; label: string }[] };
-    };
-    expect(row.toJSON().components.map((button) => button.label)).toEqual([
-      'Remove all 3',
-      'Keep them',
-    ]);
-    expect(customId(asked, 0)).toMatch(/^wants:[0-9a-f]{16}:all$/);
-    expect(customId(asked, 1)).toMatch(/^wants:[0-9a-f]{16}:keep$/);
+    expect(dialogChoices(dialog)).toEqual([]);
     expect(made.store.rows).toHaveLength(5);
   });
 
-  it('removes every row of the member in this server on Remove all, also unreadable ones', async () => {
+  it('removes every row of the member in this server on Submit, also unreadable ones', async () => {
     const made = filled();
-    const asked = await made.run('unwant-all');
-    const pressed = await press(made, customId(asked, 0));
-    expect(pressed.deferUpdate).toHaveBeenCalled();
-    expect(pressed.editReply).toHaveBeenCalledWith({
+    const submitted = await submit(made, await made.run('unwant-all'));
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(sent(submitted.editReply)).toEqual({
       content: 'Removed 3 entries: your list for this server is empty.',
-      components: [],
     });
     expect(made.rows()).toEqual([]);
     expect(made.rows(ALICE, OTHER_GUILD)).toEqual([[151, 'both']]);
     expect(made.rows(BOB)).toEqual([[150, 'both']]);
   });
 
-  it('removes nothing on Keep', async () => {
+  it('removes what the list holds at Submit, and says so when that is nothing', async () => {
     const made = filled();
     const asked = await made.run('unwant-all');
-    const pressed = await press(made, customId(asked, 1));
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'Nothing was removed.',
-      components: [],
-    });
-    expect(made.rows()).toHaveLength(3);
+    made.store.add(ALICE, FAKE_GUILD_ID, 3, 'both');
+    expect(sent((await submit(made, asked)).editReply).content).toBe(
+      'Removed 4 entries: your list for this server is empty.',
+    );
+    expect(sent((await submit(made, asked)).editReply).content).toBe(
+      'Your list for this server is empty: there is nothing to remove.',
+    );
   });
 
-  it('lets only the asker answer, once', async () => {
+  it('opens no dialog when the count takes too long to read', async () => {
     const made = filled();
-    const asked = await made.run('unwant-all');
-    const other = await press(made, customId(asked, 0), BOB);
-    expect(other.reply).toHaveBeenCalledWith({
-      content: 'That is somebody else’s question.',
-      flags: MessageFlags.Ephemeral,
+    let arrive: () => void = () => undefined;
+    const asked = new Promise<void>((resolve) => {
+      arrive = resolve;
     });
-    expect(made.store.rows).toHaveLength(5);
-    await press(made, customId(asked, 0));
-    const again = await press(made, customId(asked, 0));
-    expect(again.update).toHaveBeenCalledWith({
-      content: 'That question has expired. Use `/unwant-all` again.',
-      components: [],
+    const slow = vi.spyOn(made.store, 'count').mockImplementation(() => {
+      arrive();
+      return new Promise(() => undefined);
     });
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const using = made.run('unwant-all');
+      await asked;
+      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
+      const used = await using;
+      expect(used.showModal).not.toHaveBeenCalled();
+      expect(sent(used.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
+    } finally {
+      vi.useRealTimers();
+    }
+    expect(made.store.rows).toHaveLength(5);
+    // The use came back at the router: the whole limit is still there.
+    slow.mockRestore();
+    for (let n = 0; n < NOTIFICATION_THROTTLE.uses; n++) {
+      expect(shownDialog(await made.run('unwant-all')).title).toBe('Remove all your wants');
+    }
   });
 
   it('says that nothing was removed when the database fails', async () => {
     const made = filled();
     const asked = await made.run('unwant-all');
     made.store.failing = new Error('the database is away');
-    const pressed = await press(made, customId(asked, 0));
-    expect(pressed.editReply).toHaveBeenCalledWith({
-      content: 'Nothing was removed.',
-      components: [],
-    });
+    const submitted = await submit(made, asked);
+    expect(sent(submitted.editReply)).toEqual({ content: 'Nothing was removed.' });
     made.store.failing = undefined;
     expect(made.rows()).toHaveLength(3);
   });
@@ -1544,12 +1558,23 @@ describe('/unwant-all', () => {
     const made = setup();
     made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
     const asked = await made.run('unwant-all');
-    expect(answered(asked).content).toMatch(/^Remove the one entry of your list/);
-    const row = answered(asked).components?.[0] as {
-      toJSON(): { components: { label: string }[] };
-    };
-    expect(row.toJSON().components.map((button) => button.label)).toEqual(['Remove it', 'Keep it']);
-    const pressed = await press(made, customId(asked, 0));
-    expect(answered(pressed).content).toBe('Removed 1 entry: your list for this server is empty.');
+    expect(dialogText(shownDialog(asked))).toMatch(
+      /^Remove the one entry of your list[^\n]*\n\nSubmit removes it\.$/,
+    );
+    const submitted = await submit(made, asked);
+    expect(sent(submitted.editReply).content).toBe(
+      'Removed 1 entry: your list for this server is empty.',
+    );
+  });
+
+  it('gives the buttons of the question it asked before the stale answer', async () => {
+    const made = filled();
+    for (const action of ['all', 'keep']) {
+      const pressed = await made.handle(
+        fakeButton({ customId: `wants:0123456789abcdef:${action}`, userId: ALICE }),
+      );
+      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
+    }
+    expect(made.store.rows).toHaveLength(5);
   });
 });
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 2df3c51b..1e17e6d8 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -368,14 +368,13 @@ export const wants: SimpleCommand = {
 
 const allWants = removeAllQuestion({
   kind: 'wants',
-  command: '/unwant-all',
+  title: 'Remove all your wants',
   count: (ctx, memberId, guildId) => ctx.wants.count(memberId, guildId),
   removeAll: (ctx, memberId, guildId) => ctx.wants.removeAll(memberId, guildId),
   none: 'Your list for this server is empty: there is nothing to remove.',
   question: (n) =>
     `Remove ${n === 1 ? 'the one entry' : `all ${String(n)} entries`} of your list for this ` +
     'server? You will get no DMs for Pokémon or raid tiers here any more.',
-  button: (n) => (n === 1 ? 'Remove it' : `Remove all ${String(n)}`),
   removed: (n) => `Removed ${count(n, 'entry', 'entries')}: your list for this server is empty.`,
 });
 
@@ -387,18 +386,18 @@ export const unwantAll: SimpleCommand = {
   help: {
     category: 'notifications',
     details:
-      'Empties your list for this server, after asking you once. Your lists in other servers ' +
-      'and your gyms (`/targets`) stay as they are.',
+      'Empties your list for this server, after asking you once, in a dialog. Your lists in ' +
+      'other servers and your gyms (`/targets`) stay as they are.',
     examples: ['/unwant-all'],
   },
   enabled: notificationsEnabled,
   guards: [requireGuild],
-  defer: 'late',
+  // The dialog is the first answer: nothing is deferred before it.
   throttle: NOTIFICATION_THROTTLE,
   execute: (interaction, ctx) => allWants.ask(interaction, ctx),
 };
 
-/** The two buttons of `/unwant-all`. */
+/** The Submit of the dialog of `/unwant-all`. */
 export const wantControls = allWants.controls;
 
 /** The buttons of `/wants`: the pages, Remove, and "Remove all…". */
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 970d219d..dee0880c 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -78,8 +78,8 @@
  * several `party:<id>:splitform`, whose radio group's value is `<group>:<mark>`.
  *
  * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
- * (`/targets`; the kinds `wants` and `targets` are the questions of `/unwant-all` and
- * `/untarget-all`), and their id is the page the list shows, from 0: `wantlist:<page>:prev`,
+ * (`/targets`; the kinds `wants` and `targets` are the dialogs of `/unwant-all` and
+ * `/untarget-all`, `wants:all:remove` and `targets:all:remove`, plan 8Q), and their id is the page the list shows, from 0: `wantlist:<page>:prev`,
  * `wantlist:<page>:next`, `wantlist:<page>:all` ("Remove all…") and
  * `wantlist:<page>:remove:<what>`, where `<what>` is spelled as for the stop buttons of a DM
  * (`stopArgs`: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`, `ts:<level>`, `iv:…`, `g:<gym id>`).
````

### Task 3: Plan 8Q T3: /delete and a report's Close, Refuse and Block ask in a dialog (8Q-3)

Prototype commit: `0a6db17586ef0503a983d4c7f288546ee464a9e4`

removalDialog (render/moderation.ts) takes the place of removalQuestion:
the act as its title (Close this raid, Close this meetup, Refuse this
place, Block the maker), today's question as its text, and the required
radio group "The post" with nothing picked: Archive post ("Keeps it
readable and locked.") or Delete post ("Removes it with everything
written in it: for what nobody should keep reading, like a home
address."). Where the bot may not delete posts in the forum there is no
choice: the text says the post will be archived, that I can't delete
posts in #forum (named, not mentioned, inside a dialog), and "Submit
archives its post."; the custom id then carries archive.

/delete opens it (pclose:<party>:close[:archive]) and declares no defer;
its Submit (closeControls, the same guards and CLOSE_THROTTLE) is
acknowledged privately and ends the party as the press did, with
today's answers, a deletion the bot may no longer make refused with
today's words. The report post's Close..., Refuse place... and Block
maker... read the report in time and open it (mreport:<report>:<action>
[:archive]), a report decided already said at once without a dialog;
its Submit decides privately, and a deletion Discord's permissions
refuse by then is answered with the one Archive post button, which
decides at once. The buttons of the old questions (pclose:<party>:
archive|delete, a report question's Delete post) get the router's stale
answer.

**Files:**

```
 docs/architecture/moderation.md           |   4 +-
 docs/architecture/parties-and-posts.md    |   2 +-
 src/commands/parties/delete.test.ts       | 278 +++++++++++++++++++++++++++++++++-----------------
 src/commands/parties/delete.ts            |  93 ++++++++++-------
 src/commands/parties/in-meetup.test.ts    |  24 +++--
 src/commands/parties/in-train.test.ts     |  24 +++--
 src/components/moderation-reports.test.ts | 203 +++++++++++++++++++++++++++++-------
 src/components/moderation-reports.ts      | 187 +++++++++++++++++++++------------
 src/discord/custom-id.ts                  |   9 +-
 src/render/moderation.test.ts             |  59 +++++++++--
 src/render/moderation.ts                  | 103 +++++++++++++------
 11 files changed, 690 insertions(+), 296 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/commands/parties/delete.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/components/moderation-reports.test.ts src/render/moderation.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0a6db17586ef0503a983d4c7f288546ee464a9e4 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8Q T3: /delete and a report's Close, Refuse and Block ask in a dialog (8Q-3)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/moderation.md
git add -- docs/architecture/parties-and-posts.md
git add -- src/commands/parties/delete.test.ts
git add -- src/commands/parties/delete.ts
git add -- src/commands/parties/in-meetup.test.ts
git add -- src/commands/parties/in-train.test.ts
git add -- src/components/moderation-reports.test.ts
git add -- src/components/moderation-reports.ts
git add -- src/discord/custom-id.ts
git add -- src/render/moderation.test.ts
git add -- src/render/moderation.ts
```

````diff
diff --git a/docs/architecture/moderation.md b/docs/architecture/moderation.md
index d0fb9605..5b063006 100644
--- a/docs/architecture/moderation.md
+++ b/docs/architecture/moderation.md
@@ -11,13 +11,13 @@ Members report a party or a single message to the moderators privately, the mode
 ## The moderators' post and its decisions
 
 - `reportMessage(report)` (`src/render/moderation.ts`): `### Reported meetup` (raid, train, message), what it is and when, who made it and where, **Where** (`placeLine`, a gym's official name beside its nickname), a meetup's **Information**, **Reasons** with every reporter (`memberText`, the words through `plain`; as many whole ones as fit, then "…and N more reasons"), and while open the buttons of `reportActions`: a raid or train Close… and Dismiss; a meetup Close…, Refuse place… (a gym or PokéStop, never a pin), Block maker… and Dismiss; a message Delete message and Dismiss; with Go to post / Go to message while it is there. Decided, it shows who decided what and when, without buttons.
-- `reportDecisionControls` (kind `mreport`, `src/components/moderation-reports.ts`): staff alone (`requireManagement`, refused uncounted), `SAFETY_THROTTLE`. An action that ends a party asks first, privately, "Archive the post or delete it?" (`removalQuestion`, `mreport:<id>:<action>:archive|delete`); the answer is carried out in the place of the question. `ModerationReports.decide`: one conditional change of the report (`decideReport`, the first press wins; a later one is told who decided what; a question of an action pressed on a decided report says so at once), then its work with the party as it is now (its subject renewed): Refuse place… refuses the place for good with the report's post as the ruling's source (`MeetupSafety.refusePlace`), Block maker… blocks as Block member does (`MeetupSafety.blockMember`: the maker's name kept, one DM only for a new block, the maker's other meetups closed archived, this one left to the end, their pending requests withdrawn), then the party ends as `/delete` ends it (`PartyService.endAs` with "This meetup was closed by the moderators.", `removal`; the history records `cancelled`). Refuse place… on a meetup whose place is now a pin or none changes nothing (`no-place`, said so). Where a step of the work fails, the report is opened again (`reopenReport`: its buttons back) and `failed` tells the moderator what was done before it (a place refused, a maker blocked: they stay, and a second try finds them done) and whether the report is open again (if not, to close the party with `/delete`). `endAs` says how the post went: a deletion Discord refused archives it, which the report keeps as removal `denied` (`setRemoval`; the post says "archived: Discord refused to delete it") and the moderator is told ("archived: Discord refused to delete it; delete it yourself"); a party over between the press and the closing has its post deleted all the same when Delete post was chosen (`PartyService.deletePostOf`). Delete post where the bot lacks Manage Threads (`PartyGateway.mayDeletePost`, from the cache) is refused before anything changes (`may-not-delete`), the question shown again with Archive post alone. Delete message claims the report first (`decideReport` as `deleted`, so a Dismiss at the same moment wins or loses before anything is deleted), then deletes the message (`PartyGateway.deleteReported`: an archived post is opened for the deletion and archived again as it was, locked or not, also when the deletion fails, and only where the bot has Manage Threads there, else `not-allowed` before anything is opened; a refused archiving afterwards is logged and the deletion's result stands; a channel the bot cannot see, Missing Access, is `not-allowed`): `deleted`, `gone` when it was deleted first (`markGone`; the post says so); without Manage Messages the report is opened again and the moderator told to delete it themselves, and a deletion that fails opens it again too (`failed`). In rehearsal mode the rehearsal's gateway deletes a member's message only in the post of a rehearsed party (else `not-allowed`, logged).
+- `reportDecisionControls` (kind `mreport`, `src/components/moderation-reports.ts`): staff alone (`requireManagement`, refused uncounted), `SAFETY_THROTTLE`. An action that ends a party asks first in a dialog (plan 8Q, `removalDialog` in `src/render/moderation.ts`): titled `Close this meetup`, `Refuse this place` or `Block the maker`, today's question as its text, and the required radio group `The post` with nothing picked, Archive post (`Keeps it readable and locked.`) or Delete post (`Removes it with everything written in it: …`); where the bot may not delete the post there (`PartyService.mayDeletePost`) there is no choice, the text says the post will be archived and why (the forum named, `channelInDialog`), and the custom id carries `archive`. The report is read within `DIALOG_READ_MS` (`readInTime`, else the slow-read refusal) and one decided already is said at once without a dialog. Its Submit (`mreport:<id>:<action>[:archive]`, the same guards and throttle) is acknowledged privately and decided, the answer private; the post is redrawn for everybody as before. `ModerationReports.decide`: one conditional change of the report (`decideReport`, the first press wins; a later one is told who decided what; a question of an action pressed on a decided report says so at once), then its work with the party as it is now (its subject renewed): Refuse place… refuses the place for good with the report's post as the ruling's source (`MeetupSafety.refusePlace`), Block maker… blocks as Block member does (`MeetupSafety.blockMember`: the maker's name kept, one DM only for a new block, the maker's other meetups closed archived, this one left to the end, their pending requests withdrawn), then the party ends as `/delete` ends it (`PartyService.endAs` with "This meetup was closed by the moderators.", `removal`; the history records `cancelled`). Refuse place… on a meetup whose place is now a pin or none changes nothing (`no-place`, said so). Where a step of the work fails, the report is opened again (`reopenReport`: its buttons back) and `failed` tells the moderator what was done before it (a place refused, a maker blocked: they stay, and a second try finds them done) and whether the report is open again (if not, to close the party with `/delete`). `endAs` says how the post went: a deletion Discord refused archives it, which the report keeps as removal `denied` (`setRemoval`; the post says "archived: Discord refused to delete it") and the moderator is told ("archived: Discord refused to delete it; delete it yourself"); a party over between the press and the closing has its post deleted all the same when Delete post was chosen (`PartyService.deletePostOf`). Delete post where the bot lacks Manage Threads (`PartyGateway.mayDeletePost`, from the cache; by Submit, since the dialog offered it) is refused before anything changes (`may-not-delete`): the private answer says so with one button, Archive post (`mreport:<id>:<action>:archive`), which decides at once. The question's Delete post of before plan 8Q (`…:delete`) gets the router's stale answer. Delete message claims the report first (`decideReport` as `deleted`, so a Dismiss at the same moment wins or loses before anything is deleted), then deletes the message (`PartyGateway.deleteReported`: an archived post is opened for the deletion and archived again as it was, locked or not, also when the deletion fails, and only where the bot has Manage Threads there, else `not-allowed` before anything is opened; a refused archiving afterwards is logged and the deletion's result stands; a channel the bot cannot see, Missing Access, is `not-allowed`): `deleted`, `gone` when it was deleted first (`markGone`; the post says so); without Manage Messages the report is opened again and the moderator told to delete it themselves, and a deletion that fails opens it again too (`failed`). In rehearsal mode the rehearsal's gateway deletes a member's message only in the post of a rehearsed party (else `not-allowed`, logged).
 - A reported party that ends without a moderator (the clock, its maker, a move) ends its open report (`watch`: a listener of the store, the work on the side, `flush()` in tests): the post says it was over, without buttons. One that staff close with `/delete` ends so too, and then `closeControls` calls `closedByStaff(partyId, removal, by)`: it waits for that work, and the reports it ended (remembered by party) or still open are restated as closed by that moderator with how the post really went (`ReportStore.closeEnded`, conditional on `ended`; `denied` where Discord refused the deletion), so the post reads "Closed by …" and has no Go to post once the post is deleted.
 - In rehearsal mode the reports' posts go through meetup safety's gateway (`rehearsalModeratorsGateway`).
 
 ## /delete
 
-- `/delete` is for staff (`default_member_permissions` Manage Messages, `requireManagement`, help category `admin`): it asks privately whether to archive the post or delete it (`pclose:<party id>:archive|delete`, `closeControls`), then ends the party as before, the post saying who closed it (`PartyService.end` with `removal`: `delete` deletes the post with everything in it in the place of its last showing and the archiving; a deletion Discord refuses archives it). The command has no throttle; its question's buttons have `CLOSE_THROTTLE` (twenty a minute) and take no party of another server. A deletion Discord refuses is said to the moderator as for a report. `/help` tells a member who asks for `/delete` to use `/report` (`TOLD_INSTEAD`, without saying that the command exists).
+- `/delete` is for staff (`default_member_permissions` Manage Messages, `requireManagement`, help category `admin`): it asks in a dialog whether to archive the post or delete it (plan 8Q, `removalDialog`, titled `Close this raid` / train / meetup; `pclose:<party id>:close`, or `pclose:<party id>:close:archive` without the choice where the bot may not delete the post, the forum named as in a report's dialog; the command declares no `defer`), and its Submit (`closeControls`, acknowledged privately; a deletion the bot may no longer make is refused there with today's words) ends the party as before, the post saying who closed it (`PartyService.end` with `removal`: `delete` deletes the post with everything in it in the place of its last showing and the archiving; a deletion Discord refuses archives it). The command has no throttle; its dialog's Submit has `CLOSE_THROTTLE` (twenty a minute) and takes no party of another server; the buttons of the question before plan 8Q (`pclose:<party id>:archive|delete`) get the router's stale answer. A deletion Discord refuses is said to the moderator as for a report. `/help` tells a member who asks for `/delete` to use `/report` (`TOLD_INSTEAD`, without saying that the command exists).
 
 ## /places
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 87569645..baa20867 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -54,7 +54,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
 - `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for trains and meetups, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
-- Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks privately whether to archive the post or delete it, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
+- Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks in a dialog whether to archive the post or delete it, plan 8Q, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
 - The forum of a region holds its raids, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
 
diff --git a/src/commands/parties/delete.test.ts b/src/commands/parties/delete.test.ts
index 2d5da0ab..f8511793 100644
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -1,10 +1,15 @@
-import { MessageFlags, PermissionFlagsBits } from 'discord.js';
+import {
+  MessageFlags,
+  PermissionFlagsBits,
+  type APIModalInteractionResponseCallbackData,
+} from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { dialogChoices, dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
 import {
-  answered,
   asV2,
   fakeButton,
   fakeChatInput,
+  fakeModal,
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
@@ -22,13 +27,17 @@ import { gatewayWithMirrorChannels, reportedRaid } from '../../../test/support/p
 import { TEST_ENV } from '../../../test/support/test-env.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { partyButtons } from '../../components/party.js';
-import { InteractionRouter } from '../../discord/router.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { PartyStatus } from '../../domain/party/status.js';
+import { REMOVAL_INPUT } from '../../render/moderation.js';
 import { closeControls, deleteParty } from './delete.js';
 import { accentOf, buttonsOf, header, textOf } from '../../../test/support/messages.js';
 
 const yveltal = { boss: { key: 'yveltal' } } as const;
 
+/** The names of the fakes' channels as the server has them: the forum of the raids. */
+const CHANNELS = { [WEST_FORUM]: 'west-raids' };
+
 async function setup() {
   const made = await reportedRaid(yveltal, {}, { gateway: gatewayWithMirrorChannels() });
   const { ctx } = createTestContext({
@@ -42,33 +51,45 @@ async function setup() {
     await router.handle(interaction as never);
     return interaction;
   };
-  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
-  /** `/delete` in the raid's post, by Alice with these roles. */
+  const inPost = {
+    channelId: made.postId,
+    thread: { parentId: WEST_FORUM },
+    guildChannelNames: CHANNELS,
+  };
+  /** `/delete` in the raid's post (or where `extra` says), by Alice with these roles. */
   const run = (roleNames: string[] = [], extra: object = {}) =>
     handle(fakeChatInput({ commandName: 'delete', userId: ALICE, roleNames, ...inPost, ...extra }));
-  /** The answer to the question of `/delete`: Archive post or Delete post. */
-  const press = (removal: string, roleNames = ['Moderator'], extra: object = {}) =>
-    handle(
-      fakeButton({
-        customId: `pclose:${made.party.id}:${removal}`,
+  /** The dialog of `/delete` as a moderator is shown it now, in the post or where `extra` says. */
+  const opened = async (extra: object = {}) => shownDialog(await run(['Moderator'], extra));
+  /**
+   * The Submit of the dialog of `/delete` (opened now unless given), `removal` picked (none for
+   * a dialog without the choice), by Alice with these roles.
+   */
+  const submit = async (
+    removal: 'archive' | 'delete' | undefined,
+    roleNames = ['Moderator'],
+    extra: object = {},
+    dialog?: APIModalInteractionResponseCallbackData,
+  ) => {
+    const form = dialog ?? (await opened());
+    return handle(
+      fakeModal({
+        customId: form.custom_id,
+        form,
+        ...(removal === undefined ? {} : { picked: { [REMOVAL_INPUT]: removal } }),
         userId: ALICE,
         roleNames,
-        ephemeralMessage: true,
-        v2Message: true,
         ...inPost,
         ...extra,
       }),
     );
-  /** What a press made of the question: its edit after the acknowledgement, or its update. */
-  const shown = (pressed: FakeInteraction) =>
-    textOf(
-      asV2(
-        pressed.editReply.mock.calls.length > 0
-          ? sent(pressed.editReply, pressed.editReply.mock.calls.length - 1)
-          : sent(pressed.update),
-      ),
-    );
-  return { ...made, ctx, run, press, shown, handle };
+  };
+  /** What a Submit was answered, after its private acknowledgement: its last edit. */
+  const shown = (submitted: FakeInteraction) => {
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    return textOf(asV2(sent(submitted.editReply, submitted.editReply.mock.calls.length - 1)));
+  };
+  return { ...made, ctx, run, opened, submit, shown, handle };
 }
 
 describe('/delete', () => {
@@ -80,31 +101,54 @@ describe('/delete', () => {
     const made = await setup();
     for (const roleNames of [['Valor'], ['Bot Developer']]) {
       const used = await made.run(roleNames);
+      expect(used.showModal).not.toHaveBeenCalled();
       expect(sent(used.reply)).toEqual({
         content: 'Only admins and moderators can do that.',
         flags: MessageFlags.Ephemeral,
       });
     }
-    const pressed = await made.press('archive', ['Valor']);
-    expect(sent(pressed.reply).content).toBe('Only admins and moderators can do that.');
+    // A dialog submitted by somebody who is no longer staff.
+    const submitted = await made.submit('archive', ['Valor']);
+    expect(sent(submitted.reply).content).toBe('Only admins and moderators can do that.');
     expect(made.store.get(made.party.id)).toBeDefined();
   });
 
-  it('asks staff privately whether to archive the post or delete it, and changes nothing yet', async () => {
+  it('asks staff in a dialog whether to archive the post or delete it, and changes nothing yet', async () => {
     for (const who of [{ roleNames: ['ADMIN'] }, { userId: TEST_ENV.OWNER_ID }]) {
       const made = await setup();
       const used = await made.run(who.roleNames ?? [], who.userId ? { userId: who.userId } : {});
-      const question = asV2(answered(used));
-      expect((answered(used).flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
-      expect(textOf(question)).toContain('Close this raid?');
-      expect(buttonsOf(question).map(({ label, customId }) => [label, customId])).toEqual([
-        ['Archive post', `pclose:${made.party.id}:archive`],
-        ['Delete post', `pclose:${made.party.id}:delete`],
+      expect(used.reply).not.toHaveBeenCalled();
+      expect(used.deferReply).not.toHaveBeenCalled();
+      const dialog = shownDialog(used);
+      expect(dialog.custom_id).toBe(`pclose:${made.party.id}:close`);
+      expect(dialog.title).toBe('Close this raid');
+      expect(dialogTexts(dialog)).toEqual(['Close this raid?']);
+      expect(
+        dialogChoices(dialog).map(({ value, label, picked }) => [value, label, picked]),
+      ).toEqual([
+        ['archive', 'Archive post', false],
+        ['delete', 'Delete post', false],
       ]);
       expect(made.store.get(made.party.id)).toBeDefined();
     }
   });
 
+  it('offers no choice where the bot may not delete the post, and archives it on Submit', async () => {
+    const made = await setup();
+    made.gateway.noManaging.add(WEST_FORUM);
+    const dialog = await made.opened();
+    expect(dialog.custom_id).toBe(`pclose:${made.party.id}:close:archive`);
+    expect(dialogChoices(dialog)).toEqual([]);
+    expect(dialogTexts(dialog)[0]).toContain(
+      "I can't delete posts in #west-raids (Manage Threads is missing there)",
+    );
+    expect(made.shown(await made.submit(undefined, ['Moderator'], {}, dialog))).toBe(
+      'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
+    );
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
+    expect(made.gateway.deletedPosts).toEqual([]);
+  });
+
   it('archives: the post says who closed it, and is archived and locked', async () => {
     const made = await setup();
     const { gateway, store, postId } = made;
@@ -113,8 +157,8 @@ describe('/delete', () => {
     await made.service.flush();
     expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
 
-    const pressed = await made.press('archive');
-    expect(made.shown(pressed)).toBe(
+    const submitted = await made.submit('archive');
+    expect(made.shown(submitted)).toBe(
       'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
     );
     expect(store.get(made.party.id)).toBeUndefined();
@@ -137,8 +181,8 @@ describe('/delete', () => {
     const made = await setup();
     const { gateway, postId } = made;
     await made.service.flush();
-    const pressed = await made.press('delete');
-    expect(made.shown(pressed)).toBe(
+    const submitted = await made.submit('delete');
+    expect(made.shown(submitted)).toBe(
       'This raid is closed: its gym is free for a new report, and I am deleting its post.',
     );
     expect(made.store.get(made.party.id)).toBeUndefined();
@@ -149,11 +193,12 @@ describe('/delete', () => {
     ]);
   });
 
-  it('refuses to delete where the bot may not, before anything ends', async () => {
+  it('refuses to delete where the bot may no longer, before anything ends', async () => {
     const made = await setup();
+    const dialog = await made.opened();
     made.gateway.noManaging.add(WEST_FORUM);
-    const pressed = await made.press('delete');
-    expect(made.shown(pressed)).toBe(
+    const submitted = await made.submit('delete', ['Moderator'], {}, dialog);
+    expect(made.shown(submitted)).toBe(
       `I can't delete posts in <#${WEST_FORUM}> (Manage Threads is missing there). Archive it, or ` +
         'delete it yourself.',
     );
@@ -163,25 +208,26 @@ describe('/delete', () => {
 
   it('answers the moderator before anything is done to the post', async () => {
     const made = await setup();
-    const pressed = fakeButton({
-      customId: `pclose:${made.party.id}:archive`,
+    const dialog = await made.opened();
+    const submitted = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      picked: { [REMOVAL_INPUT]: 'archive' },
       userId: ALICE,
       roleNames: ['Admin'],
-      ephemeralMessage: true,
-      v2Message: true,
       channelId: made.postId,
       thread: { parentId: WEST_FORUM },
     });
     let callsWhenAnswered = -1;
     let activeWhenAnswered = true;
     const before = made.gateway.calls.length;
-    pressed.editReply.mockImplementation(() => {
+    submitted.editReply.mockImplementation(() => {
       callsWhenAnswered = made.gateway.calls.length - before;
       activeWhenAnswered = made.store.get(made.party.id) !== undefined;
       return Promise.resolve();
     });
-    await made.handle(pressed);
-    expect(pressed.editReply).toHaveBeenCalledTimes(1);
+    await made.handle(submitted);
+    expect(submitted.editReply).toHaveBeenCalledTimes(1);
     // The party had left the store, and Discord had not been asked for anything yet.
     expect(activeWhenAnswered).toBe(false);
     expect(callsWhenAnswered).toBe(0);
@@ -190,45 +236,79 @@ describe('/delete', () => {
 
   it('closes the raid although the answer cannot be given', async () => {
     const made = await setup();
-    const pressed = fakeButton({
-      customId: `pclose:${made.party.id}:archive`,
+    const dialog = await made.opened();
+    const submitted = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      picked: { [REMOVAL_INPUT]: 'archive' },
       userId: ALICE,
       roleNames: ['Admin'],
-      ephemeralMessage: true,
-      v2Message: true,
     });
-    pressed.editReply.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
-    await made.handle(pressed);
+    submitted.editReply.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
+    await made.handle(submitted);
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
   });
 
-  it('takes no press for a party of another server', async () => {
+  it('takes no Submit for a party of another server', async () => {
     const made = await setup();
-    const pressed = await made.press('delete', ['Moderator'], { guildId: OTHER_GUILD_ID });
-    expect(sent(pressed.reply).content).toBe('This control is no longer active.');
+    const submitted = await made.submit('delete', ['Moderator'], { guildId: OTHER_GUILD_ID });
+    expect(sent(submitted.followUp).content).toBe('This control is no longer active.');
     expect(made.store.get(made.party.id)).toBeDefined();
     expect(made.gateway.deletedPosts).toEqual([]);
   });
 
+  it('gives a Submit without the choice (a dialog of an older shape) the stale answer', async () => {
+    const made = await setup();
+    const forged = await made.handle(
+      fakeModal({
+        customId: `pclose:${made.party.id}:close`,
+        userId: ALICE,
+        roleNames: ['Moderator'],
+        channelId: made.postId,
+        thread: { parentId: WEST_FORUM },
+      }),
+    );
+    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
+    expect(made.store.get(made.party.id)).toBeDefined();
+  });
+
+  it('gives the buttons of the question it asked before the stale answer', async () => {
+    const made = await setup();
+    for (const removal of ['archive', 'delete']) {
+      const pressed = await made.handle(
+        fakeButton({
+          customId: `pclose:${made.party.id}:${removal}`,
+          userId: ALICE,
+          roleNames: ['Moderator'],
+          ephemeralMessage: true,
+          v2Message: true,
+        }),
+      );
+      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
+    }
+    expect(made.store.get(made.party.id)).toBeDefined();
+  });
+
   it('says that the post was archived where Discord refused to delete it', async () => {
     const made = await setup();
     made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
-    expect(made.shown(await made.press('delete'))).toBe(
+    expect(made.shown(await made.submit('delete'))).toBe(
       'This raid is closed: its gym is free for a new report, and its post is archived: ' +
         'Discord refused to delete it; delete it yourself.',
     );
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true });
   });
 
-  it('deletes the post of a raid that ended a moment before, when Delete post was chosen', async () => {
+  it('deletes the post of a raid that ended a moment before, when Delete post was picked', async () => {
     const made = await setup();
+    const dialog = await made.opened();
     const endAs = made.service.endAs.bind(made.service);
-    // The raid ends between the press and the closing.
+    // The raid ends between the Submit and the closing.
     made.service.endAs = async (...args) => {
       await endAs(made.party.id);
       return endAs(...args);
     };
-    expect(made.shown(await made.press('delete'))).toBe(
+    expect(made.shown(await made.submit('delete', ['Moderator'], {}, dialog))).toBe(
       'This raid was over already; I deleted its post.',
     );
     expect(made.gateway.deletedPosts).toEqual([made.postId]);
@@ -236,32 +316,36 @@ describe('/delete', () => {
 
   it('takes it calmly when the answer cannot be given in the post it just deleted', async () => {
     const made = await setup();
+    const dialog = await made.opened();
     const endAs = made.service.endAs.bind(made.service);
     made.service.endAs = async (...args) => {
       await endAs(made.party.id);
       return endAs(...args);
     };
-    const pressed = fakeButton({
-      customId: `pclose:${made.party.id}:delete`,
+    const submitted = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      picked: { [REMOVAL_INPUT]: 'delete' },
       userId: ALICE,
       roleNames: ['Moderator'],
-      ephemeralMessage: true,
-      v2Message: true,
       channelId: made.postId,
       thread: { parentId: WEST_FORUM },
     });
-    // The question lived in the post, which is gone with its answer.
-    pressed.editReply.mockImplementation(() => Promise.reject(new Error('Unknown Channel')));
-    await made.handle(pressed);
+    // The answer lived in the post, which is gone with it.
+    submitted.editReply.mockImplementation(() => Promise.reject(new Error('Unknown Channel')));
+    await made.handle(submitted);
     expect(made.gateway.deletedPosts).toEqual([made.postId]);
-    expect(pressed.followUp).not.toHaveBeenCalled();
+    expect(submitted.followUp).not.toHaveBeenCalled();
   });
 
-  it('has no limit on the command; its question takes twenty presses a minute', async () => {
+  it('has no limit on the command; its dialog takes twenty Submits a minute', async () => {
     expect(deleteParty.throttle).toBeUndefined();
     const made = await setup();
-    for (let i = 0; i < 20; i++) await made.press('archive');
-    expect(sent((await made.press('archive')).reply).content).toMatch(/^That was a lot of clicks/);
+    const dialog = await made.opened();
+    for (let i = 0; i < 20; i++) await made.submit('archive', ['Moderator'], {}, dialog);
+    expect(sent((await made.submit('archive', ['Moderator'], {}, dialog)).reply).content).toMatch(
+      /^That was a lot of clicks/,
+    );
   });
 
   it('closes as many raids as there are, one after the other', async () => {
@@ -278,24 +362,18 @@ describe('/delete', () => {
         boss: null,
       });
       if (outcome.kind !== 'created') throw new Error(outcome.kind);
-      await made.run(['Moderator'], { channelId: outcome.party.forumPostId });
-      const pressed = await made.handle(
-        fakeButton({
-          customId: `pclose:${outcome.party.id}:archive`,
-          userId: ALICE,
-          roleNames: ['Moderator'],
-          ephemeralMessage: true,
-          v2Message: true,
-        }),
-      );
-      expect(made.shown(pressed)).toMatch(/^This raid is closed/);
+      const where = { channelId: outcome.party.forumPostId };
+      const dialog = await made.opened(where);
+      expect(dialog.custom_id).toBe(`pclose:${outcome.party.id}:close`);
+      const submitted = await made.submit('archive', ['Moderator'], where, dialog);
+      expect(made.shown(submitted)).toMatch(/^This raid is closed/);
       expect(made.store.get(outcome.party.id)).toBeUndefined();
     }
   });
 
   it('frees the gym for a new report', async () => {
     const made = await setup();
-    await made.press('archive', ['Admin']);
+    await made.submit('archive', ['Admin']);
     const gym = made.ctx.gyms.get(1);
     if (!gym) throw new Error('no gym 1');
     const again = await made.service.reportRaid({
@@ -311,16 +389,22 @@ describe('/delete', () => {
 
   it('says that the raid is over when somebody else closed it first', async () => {
     const made = await setup();
+    const dialog = await made.opened();
     await made.service.end(made.party.id);
-    expect(made.shown(await made.press('archive'))).toBe('This has ended.');
+    expect(made.shown(await made.submit('archive', ['Moderator'], {}, dialog))).toBe(
+      'This has ended.',
+    );
     const made2 = await setup();
+    const dialog2 = await made2.opened();
     const endAs = made2.service.endAs.bind(made2.service);
-    // The raid ends between the press and the closing.
+    // The raid ends between the Submit and the closing.
     made2.service.endAs = async (...args) => {
       await endAs(made2.party.id);
       return endAs(...args);
     };
-    expect(made2.shown(await made2.press('archive'))).toBe('This raid is over.');
+    expect(made2.shown(await made2.submit('archive', ['Moderator'], {}, dialog2))).toBe(
+      'This raid is over.',
+    );
   });
 });
 
@@ -443,16 +527,24 @@ describe('/delete of a reported party', () => {
     });
     if (refuse) made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
     const router = new InteractionRouter(ctx, [deleteParty], [closeControls]);
+    const asMod = {
+      userId: MODERATOR,
+      displayName: 'Mod',
+      roleNames: ['Moderator'],
+      channelId: made.postId,
+      thread: { parentId: WEST_FORUM },
+    };
+    const used = fakeChatInput({ commandName: 'delete', ...asMod });
+    await router.handle(used as never);
+    const dialog = shownDialog(used);
+    // A meetup's dialog says so.
+    expect(dialog.title).toBe('Close this meetup');
     await router.handle(
-      fakeButton({
-        customId: `pclose:${made.party.id}:${removal}`,
-        userId: MODERATOR,
-        displayName: 'Mod',
-        roleNames: ['Moderator'],
-        ephemeralMessage: true,
-        v2Message: true,
-        channelId: made.postId,
-        thread: { parentId: WEST_FORUM },
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        picked: { [REMOVAL_INPUT]: removal },
+        ...asMod,
       }) as never,
     );
     await made.reports.flush();
diff --git a/src/commands/parties/delete.ts b/src/commands/parties/delete.ts
index 77a5b21b..fd4923f8 100644
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -1,26 +1,32 @@
 import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
-import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
+import type {
+  ComponentHandler,
+  GuardableInteraction,
+  SimpleCommand,
+} from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
+import { channelInDialog, deferSubmit } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, requireGuild, requireManagement, requireParty } from '../../discord/guards.js';
-import { answer, v2Answer } from '../../discord/late-reply.js';
+import { v2Answer } from '../../discord/late-reply.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
 import type { PostRemoval } from '../../domain/moderation/reports.js';
 import { partyWord, type Party } from '../../domain/party/party.js';
 import { APPROVED_ACCENT, EXPIRED_ACCENT, REFUSED_ACCENT } from '../../render/meetup-safety.js';
-import { removalQuestion } from '../../render/moderation.js';
+import { removalDialog, removalOf } from '../../render/moderation.js';
 import { memberText } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
 import { actingMember, commandParty, partyOver } from './reply.js';
 
 /**
- * The custom-id kind of the private question of `/delete` (plan 8S-2): `pclose:<party id>:archive`
- * and `pclose:<party id>:delete`.
+ * The custom-id kind of the dialog of `/delete` (plans 8S-2, 8Q): `pclose:<party id>:close`, its
+ * radio group `REMOVAL_INPUT`, and `pclose:<party id>:close:archive` where the bot may not
+ * delete the post.
  */
 export const CLOSE_KIND = 'pclose';
 
-/** How often one member of staff may answer the questions of `/delete`: a clean-up is many. */
+/** How often one member of staff may submit the dialog of `/delete`: a clean-up is many. */
 export const CLOSE_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };
 
 /** What a moderator is told of a party they closed, as its post goes. */
@@ -49,15 +55,25 @@ export function mayNotDelete(forumId: string | null): string {
   );
 }
 
+/** The action of the dialog of `/delete`: `pclose:<party id>:close[:archive]`. */
+const CLOSE_FORM = 'close';
+
+/** The forum of a party's post as a dialog names it: `#west-raids`. */
+export function forumInDialog(interaction: GuardableInteraction, forumId: string | null): string {
+  const name = forumId === null ? undefined : interaction.guild?.channels.cache.get(forumId)?.name;
+  return channelInDialog(name);
+}
+
 /**
  * `/delete` (spec 4.2; plan 8S-2: for staff only, Manage Messages): closes the raid, train or
- * meetup of the post it is used in, after a private question: archive its post (it stays
- * readable, locked) or delete it with everything in it (the command has no throttle; the
- * question's buttons `CLOSE_THROTTLE`). The post says who closed it (when it is
- * kept), the copies and the link line go, and a raid's gym is free for a new report. It is the
- * tool for what the clock does not tidy up by itself, so it works on any party that is still
- * active and has no throttle. Members report with `/report`; `/help` tells a member who asks for
- * `/delete` so.
+ * meetup of the post it is used in, after asking in a dialog (plan 8Q, `removalDialog`): archive
+ * its post (it stays readable, locked) or delete it with everything in it, or, where the bot may
+ * not delete posts there, archive it only (the command has no throttle; the dialog's Submit
+ * `CLOSE_THROTTLE`). The post says who closed it (when it is kept), the copies and the link line
+ * go, and a raid's gym is free for a new report. It is the tool for what the clock does not tidy
+ * up by itself, so it works on any party that is still active and has no throttle. Members
+ * report with `/report`; `/help` tells a member who asks for `/delete` so. The dialog is the
+ * first answer: the command declares no `defer`.
  */
 export const deleteParty: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -68,43 +84,51 @@ export const deleteParty: SimpleCommand = {
     category: 'admin',
     details:
       'For admins and moderators: closes the raid, train or meetup of the post you use it in. ' +
-      'It asks first whether to archive its post (it stays readable and locked) or to delete ' +
-      'the post with everything written in it. Members tell the moderators with `/report`. ' +
-      'Server Settings › Integrations decide who sees it (Manage Messages by default).',
+      'It asks first, in a dialog, whether to archive its post (it stays readable and locked) ' +
+      'or to delete the post with everything written in it. Members tell the moderators with ' +
+      '`/report`. Server Settings › Integrations decide who sees it (Manage Messages by default).',
     examples: ['/delete'],
   },
   guards: [requireParty, requireManagement],
-  defer: 'late',
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
-    await answer(
-      interaction,
-      v2Answer(
-        removalQuestion(`Close this ${partyWord(party)}?`, (removal) =>
-          encodeCustomId({ kind: CLOSE_KIND, id: party.id, action: removal }),
-        ),
-      ),
+    const word = partyWord(party);
+    const id = (args: string[]) =>
+      encodeCustomId({ kind: CLOSE_KIND, id: party.id, action: CLOSE_FORM, args });
+    await interaction.showModal(
+      removalDialog({
+        customId: id([]),
+        archiveOnlyId: id(['archive']),
+        title: `Close this ${word}`,
+        question: `Close this ${word}?`,
+        mayDelete: ctx.partyService.mayDeletePost(party.id),
+        forum: forumInDialog(interaction, party.forumChannelId),
+      }),
     );
   },
 };
 
 /**
- * The answers to the question of `/delete` (kind `pclose`), for staff: the party ends as
- * `/delete` ended it before (`PartyService.end` with who closed it as the post's last words),
- * its post archived or deleted (`removal`); a deletion the bot may not make is refused before
- * anything ends. The question is edited to the outcome before anything is done to the post.
+ * The Submit of the dialog of `/delete` (kind `pclose`), for staff: acknowledged privately, then
+ * the party ends as `/delete` ended it before (`PartyService.end` with who closed it as the
+ * post's last words), its post archived or deleted (`removal`, picked or fixed by the dialog); a
+ * deletion the bot may not make (by now) is refused before anything ends. The answer is given
+ * before anything is done to the post. The buttons of the private question this dialog replaced
+ * (`pclose:<party>:archive|delete`) are no control any more: the router's stale answer.
  */
 export const closeControls: ComponentHandler = {
   kind: CLOSE_KIND,
   guards: [requireGuild, requireManagement],
   throttle: CLOSE_THROTTLE,
-  async button(interaction, id, ctx) {
-    const removal = id.action;
-    if (removal !== 'archive' && removal !== 'delete') throw new UserError(STALE_COMPONENT);
+  async modal(interaction, id, ctx) {
+    if (id.action !== CLOSE_FORM) throw new UserError(STALE_COMPONENT);
+    const removal = removalOf(interaction, id.args);
+    if (removal === undefined) throw new UserError(STALE_COMPONENT);
+    await deferSubmit(interaction);
     const party = ctx.parties.get(id.id);
     const say = (accent: number, text: string) => v2Answer(textMessage(accent, [text]));
     if (!party) {
-      await interaction.update(say(EXPIRED_ACCENT, partyOver()));
+      await interaction.editReply(say(EXPIRED_ACCENT, partyOver()));
       return;
     }
     // A custom id can be sent from anywhere: a party of another server is none here.
@@ -112,10 +136,9 @@ export const closeControls: ComponentHandler = {
       throw new UserError(STALE_COMPONENT);
     }
     if (removal === 'delete' && !ctx.partyService.mayDeletePost(party.id)) {
-      await interaction.update(say(REFUSED_ACCENT, mayNotDelete(party.forumChannelId)));
+      await interaction.editReply(say(REFUSED_ACCENT, mayNotDelete(party.forumChannelId)));
       return;
     }
-    await interaction.deferUpdate();
     const word = partyWord(party);
     const moderator = actingMember(interaction);
     const closed = await ctx.partyService.endAs(party.id, undefined, {
@@ -131,7 +154,7 @@ export const closeControls: ComponentHandler = {
         removal === 'delete' && postId !== null
           ? await ctx.partyService.deletePostOf(postId)
           : undefined;
-      // The question may have lived in the post just deleted: its answer goes with it.
+      // The answer may have lived in the post just deleted: it goes with it.
       await interaction
         .editReply(
           deleted === 'deleted'
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index 94bebefd..da9d2a38 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -1,6 +1,7 @@
+import { dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
+import { REMOVAL_INPUT } from '../../render/moderation.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
-  answered,
   asV2,
   fakeAutocomplete,
   fakeButton,
@@ -651,16 +652,17 @@ describe('the other commands in the post of a meetup', () => {
   it('/delete from staff asks first, and Archive post closes the meetup: the post says who did it', async () => {
     const made = await setup();
     const used = await made.run('delete', {}, { roleNames: ['Moderator'] });
-    expect(textOf(asV2(answered(used)))).toContain('Close this meetup?');
+    const dialog = shownDialog(used);
+    expect(dialogTexts(dialog)).toEqual(['Close this meetup?']);
     expect(made.store.get(made.party.id)).toBeDefined();
     const pressed = await made.handle(
-      fakeButton({
-        customId: `pclose:${made.party.id}:archive`,
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        picked: { [REMOVAL_INPUT]: 'archive' },
         userId: ALICE,
         displayName: 'Alice',
         roleNames: ['Moderator'],
-        ephemeralMessage: true,
-        v2Message: true,
         ...made.where,
       }),
     );
@@ -780,14 +782,14 @@ describe('what a member of a meetup is told', () => {
         }),
       );
     }
-    await made.run('delete', {}, { roleNames: ['Admin'] });
+    const closing = shownDialog(await made.run('delete', {}, { roleNames: ['Admin'] }));
     await made.handle(
-      fakeButton({
-        customId: `pclose:${made.party.id}:archive`,
+      fakeModal({
+        customId: closing.custom_id,
+        form: closing,
+        picked: { [REMOVAL_INPUT]: 'archive' },
         userId: ALICE,
         roleNames: ['Admin'],
-        ephemeralMessage: true,
-        v2Message: true,
       }),
     );
     // A form that was still open when the meetup was closed.
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index ba6a28c6..599ee7bd 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -1,7 +1,8 @@
+import { dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
+import { REMOVAL_INPUT } from '../../render/moderation.js';
 import { ComponentType, MessageFlags } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
-  answered,
   asV2,
   fakeAutocomplete,
   fakeButton,
@@ -636,16 +637,17 @@ describe('the other commands in the post of a train', () => {
   it('/delete from staff asks first, and Archive post closes the train: the post says who did it', async () => {
     const made = await setup();
     const used = await made.run('delete', {}, { roleNames: ['Moderator'] });
-    expect(textOf(asV2(answered(used)))).toContain('Close this train?');
+    const dialog = shownDialog(used);
+    expect(dialogTexts(dialog)).toEqual(['Close this train?']);
     expect(made.store.get(made.party.id)).toBeDefined();
     const pressed = await made.handle(
-      fakeButton({
-        customId: `pclose:${made.party.id}:archive`,
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        picked: { [REMOVAL_INPUT]: 'archive' },
         userId: ALICE,
         displayName: 'Alice',
         roleNames: ['Moderator'],
-        ephemeralMessage: true,
-        v2Message: true,
         ...made.inPost,
       }),
     );
@@ -864,14 +866,14 @@ describe('what a member of a train is told', () => {
     for (const action of panel) await made.click(action, { userId: CAROL });
     await made.click('leave');
     for (const action of panel.slice(0, 3)) await made.click(action);
-    await made.run('delete', {}, { roleNames: ['Admin'] });
+    const closing = shownDialog(await made.run('delete', {}, { roleNames: ['Admin'] }));
     await made.handle(
-      fakeButton({
-        customId: `pclose:${made.party.id}:archive`,
+      fakeModal({
+        customId: closing.custom_id,
+        form: closing,
+        picked: { [REMOVAL_INPUT]: 'archive' },
         userId: ALICE,
         roleNames: ['Admin'],
-        ephemeralMessage: true,
-        v2Message: true,
       }),
     );
     for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A', 'leave']) {
diff --git a/src/components/moderation-reports.test.ts b/src/components/moderation-reports.test.ts
index 8b7f1120..40ce9d39 100644
--- a/src/components/moderation-reports.test.ts
+++ b/src/components/moderation-reports.test.ts
@@ -1,8 +1,10 @@
-import { MessageFlags } from 'discord.js';
-import { describe, expect, it } from 'vitest';
+import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
+import { describe, expect, it, vi } from 'vitest';
+import { dialogChoices, dialogTexts, shownDialog } from '../../test/support/dialogs.js';
 import {
   asV2,
   fakeButton,
+  fakeModal,
   sent,
   type FakeInteraction,
 } from '../../test/support/fake-interactions.js';
@@ -12,9 +14,14 @@ import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
 import { buttonsOf, textOf } from '../../test/support/messages.js';
 import { reportedMeetup } from '../../test/support/reports-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
-import { InteractionRouter } from '../discord/router.js';
+import { DIALOG_READ_MS, SLOW_READ } from '../discord/dialog.js';
+import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
+import { REMOVAL_INPUT } from '../render/moderation.js';
 import { reportDecisionControls, reportDecisionWords } from './moderation-reports.js';
 
+/** The names of the fakes' channels as the server has them: the forum of the meetups. */
+const CHANNELS = { [WEST_FORUM]: 'west-meetups' };
+
 async function setup() {
   const made = await reportedMeetup();
   const outcome = await made.report();
@@ -28,6 +35,13 @@ async function setup() {
   });
   const router = new InteractionRouter(ctx, [], [reportDecisionControls]);
   const id = outcome.report.id;
+  const asMod = {
+    userId: '200000000000000009',
+    displayName: 'Mod',
+    roleNames: ['Moderator'],
+    channelId: MOD_CHANNEL,
+    guildChannelNames: CHANNELS,
+  };
   const pressOn = async (
     reportId: string,
     action: string,
@@ -35,44 +49,67 @@ async function setup() {
   ): Promise<FakeInteraction> => {
     const interaction = fakeButton({
       customId: `mreport:${reportId}:${action}`,
-      userId: '200000000000000009',
-      displayName: 'Mod',
-      roleNames: ['Moderator'],
-      channelId: MOD_CHANNEL,
       v2Message: true,
+      ...asMod,
       ...extra,
     });
     await router.handle(interaction as never);
     return interaction;
   };
   const press = (action: string, extra: object = {}) => pressOn(id, action, extra);
-  return { ...made, id, press, pressOn };
+  /**
+   * The Submit of the dialog of `action` (opened now by its button unless given), `removal`
+   * picked (none for a dialog without the choice).
+   */
+  const submit = async (
+    action: string,
+    removal: 'archive' | 'delete' | undefined,
+    dialog?: APIModalInteractionResponseCallbackData,
+  ): Promise<FakeInteraction> => {
+    const form = dialog ?? shownDialog(await press(action));
+    const interaction = fakeModal({
+      customId: form.custom_id,
+      form,
+      ...(removal === undefined ? {} : { picked: { [REMOVAL_INPUT]: removal } }),
+      ...asMod,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ...made, id, router, press, pressOn, submit };
 }
 
 describe('the buttons of a report’s post', () => {
-  it('ask privately whether to archive or delete before an action that ends the party', async () => {
+  it('ask in a dialog whether to archive or delete before an action that ends the party', async () => {
     const made = await setup();
     const asked = await made.press('close');
-    const question = asV2(sent(asked.reply));
-    expect((sent(asked.reply).flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
-    expect(textOf(question)).toContain('Close this meetup?');
-    expect(buttonsOf(question).map((button) => button.customId)).toEqual([
-      `mreport:${made.id}:close:archive`,
-      `mreport:${made.id}:close:delete`,
+    expect(asked.reply).not.toHaveBeenCalled();
+    const dialog = shownDialog(asked);
+    expect(dialog.custom_id).toBe(`mreport:${made.id}:close`);
+    expect(dialog.title).toBe('Close this meetup');
+    expect(dialogTexts(dialog)).toEqual(['Close this meetup?']);
+    expect(dialogChoices(dialog).map(({ value, picked }) => [value, picked])).toEqual([
+      ['archive', false],
+      ['delete', false],
+    ]);
+    const refuse = shownDialog(await made.press('refuse'));
+    expect([refuse.custom_id, refuse.title, dialogTexts(refuse)]).toEqual([
+      `mreport:${made.id}:refuse`,
+      'Refuse this place',
+      ['Refuse this place for good, and close this meetup?'],
+    ]);
+    const block = shownDialog(await made.press('block'));
+    expect([block.title, dialogTexts(block)]).toEqual([
+      'Block the maker',
+      ['Block its maker from creating meetups here, and close this meetup?'],
     ]);
-    expect(textOf(asV2(sent((await made.press('refuse')).reply)))).toContain(
-      'Refuse this place for good, and close this meetup?',
-    );
-    expect(textOf(asV2(sent((await made.press('block')).reply)))).toContain(
-      'Block its maker from creating meetups here, and close this meetup?',
-    );
     expect(made.store.get(made.party.id)).toBeDefined();
   });
 
-  it('carry out the choice in the place of the question', async () => {
+  it('carry out the choice on Submit, privately', async () => {
     const made = await setup();
-    const chosen = await made.press('close:archive', { ephemeralMessage: true });
-    expect(chosen.deferUpdate).toHaveBeenCalled();
+    const chosen = await made.submit('close', 'archive');
+    expect(chosen.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(textOf(asV2(sent(chosen.editReply)))).toBe(
       'Closed: the meetup is over, and its post archived.',
     );
@@ -83,40 +120,128 @@ describe('the buttons of a report’s post', () => {
     );
   });
 
-  it('dismiss, and say where the bot may not delete', async () => {
+  it('offer no choice where the bot may not delete the post, archiving it on Submit', async () => {
     const made = await setup();
     made.gateway.noManaging.add(WEST_FORUM);
-    const refused = await made.press('close:delete', { ephemeralMessage: true });
-    expect(textOf(asV2(sent(refused.editReply)))).toBe(
-      `I can't delete posts in <#${WEST_FORUM}> (Manage Threads is missing there). Archive it, or ` +
-        'delete it yourself.',
+    const dialog = shownDialog(await made.press('close'));
+    expect(dialog.custom_id).toBe(`mreport:${made.id}:close:archive`);
+    expect(dialogChoices(dialog)).toEqual([]);
+    expect(dialogTexts(dialog)[0]).toContain("I can't delete posts in #west-meetups");
+    const chosen = await made.submit('close', undefined, dialog);
+    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
+      'Closed: the meetup is over, and its post archived.',
     );
+  });
+
+  it('dismiss at once, privately', async () => {
+    const made = await setup();
     const dismissed = await made.press('dismiss');
+    expect(dismissed.showModal).not.toHaveBeenCalled();
     expect(dismissed.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(sent(dismissed.editReply).content).toBe('Dismissed: nothing else changes.');
   });
 
   it('answer an action that ends a party at once when the report is decided already', async () => {
     const made = await setup();
+    const dialog = shownDialog(await made.press('close'));
     await made.press('dismiss');
     const again = await made.press('close');
+    expect(again.showModal).not.toHaveBeenCalled();
     expect(sent(again.reply).content).toMatch(/decided this already .*: dismissed\.$/);
+    // A dialog opened before is answered the same way.
+    const late = await made.submit('close', 'archive', dialog);
+    expect(textOf(asV2(sent(late.editReply)))).toMatch(/decided this already .*: dismissed\.$/);
+    expect(made.store.get(made.party.id)).toBeDefined();
   });
 
-  it('keep Archive post where the bot may not delete the post', async () => {
+  it('open no dialog when the report takes too long to read', async () => {
     const made = await setup();
+    let arrive: () => void = () => undefined;
+    const asked = new Promise<void>((resolve) => {
+      arrive = resolve;
+    });
+    vi.spyOn(made.reports, 'reportOf').mockImplementation(() => {
+      arrive();
+      return new Promise(() => undefined);
+    });
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const pressing = made.press('close');
+      await asked;
+      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
+      const pressed = await pressing;
+      expect(pressed.showModal).not.toHaveBeenCalled();
+      expect(sent(pressed.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  it('keep Archive post where the bot may no longer delete the post at Submit', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.press('close'));
     made.gateway.noManaging.add(WEST_FORUM);
-    const refused = await made.press('close:delete', { ephemeralMessage: true });
+    const refused = await made.submit('close', 'delete', dialog);
     const shown = asV2(sent(refused.editReply));
+    expect(textOf(shown)).toBe(
+      `I can't delete posts in <#${WEST_FORUM}> (Manage Threads is missing there). Archive it, or ` +
+        'delete it yourself.',
+    );
     expect(buttonsOf(shown).map((button) => [button.label, button.customId])).toEqual([
       ['Archive post', `mreport:${made.id}:close:archive`],
     ]);
+    expect(made.store.get(made.party.id)).toBeDefined();
+    // It archives at once.
+    const archived = await made.press('close:archive', { ephemeralMessage: true });
+    expect(textOf(asV2(sent(archived.editReply)))).toBe(
+      'Closed: the meetup is over, and its post archived.',
+    );
+  });
+
+  it('refuse a Submit by a moderator demoted since the dialog opened, the report still open', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.press('close'));
+    const submitted = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      picked: { [REMOVAL_INPUT]: 'archive' },
+      userId: '200000000000000009',
+      displayName: 'Mod',
+      roleNames: ['Valor'],
+      channelId: MOD_CHANNEL,
+    });
+    await made.router.handle(submitted as never);
+    expect(sent(submitted.reply).content).toBe('Only admins and moderators can do that.');
+    expect(submitted.deferReply).not.toHaveBeenCalled();
+    expect(made.store.get(made.party.id)).toBeDefined();
+    expect((await made.reportStore.report(made.id))?.status).toBe('open');
+  });
+
+  it('give a Submit without the choice (a dialog of an older shape) the stale answer', async () => {
+    const made = await setup();
+    const forged = fakeModal({
+      customId: `mreport:${made.id}:close`,
+      userId: '200000000000000009',
+      displayName: 'Mod',
+      roleNames: ['Moderator'],
+      channelId: MOD_CHANNEL,
+    });
+    await made.router.handle(forged as never);
+    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
+    expect((await made.reportStore.report(made.id))?.status).toBe('open');
+  });
+
+  it('give the Delete post of the question they asked before the stale answer', async () => {
+    const made = await setup();
+    const pressed = await made.press('close:delete', { ephemeralMessage: true });
+    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
+    expect(made.store.get(made.party.id)).toBeDefined();
   });
 
   it('say it could not be done, the report open, where a step failed', async () => {
     const made = await setup();
     made.storage.failing.add('addBlock');
-    const failed = await made.press('block:archive', { ephemeralMessage: true });
+    const failed = await made.submit('block', 'archive');
     expect(textOf(asV2(sent(failed.editReply)))).toBe(
       'That could not be done: nothing changed, and the report is still open. Try again.',
     );
@@ -125,13 +250,13 @@ describe('the buttons of a report’s post', () => {
   it('say what was done where a later step failed, and whether the report is open again', async () => {
     const made = await setup();
     made.service.endAs = () => Promise.reject(new Error('the database is away'));
-    const blocked = await made.press('block:archive', { ephemeralMessage: true });
+    const blocked = await made.submit('block', 'archive');
     expect(textOf(asV2(sent(blocked.editReply)))).toBe(
       'That could not be finished: its maker is blocked, but the meetup is not closed. The ' +
         'report is open again: try again.',
     );
     made.reportStore.failing.add('reopenReport');
-    const stuck = await made.press('close:archive', { ephemeralMessage: true });
+    const stuck = await made.submit('close', 'archive');
     expect(textOf(asV2(sent(stuck.editReply)))).toBe(
       'That could not be finished: the meetup is not closed, and the report could not be ' +
         'opened again. Close the meetup with /delete.',
@@ -157,7 +282,7 @@ describe('the buttons of a report’s post', () => {
   it('say that a place that is now a pin cannot be refused', async () => {
     const made = await setup();
     made.service.placeOf = () => SAFETY_PIN;
-    const refused = await made.press('refuse:archive', { ephemeralMessage: true });
+    const refused = await made.submit('refuse', 'archive');
     expect(textOf(asV2(sent(refused.editReply)))).toBe(
       'The meetup’s place is now a dropped pin or none, which cannot be refused: nothing ' +
         'changed, and the report is still open.',
@@ -167,16 +292,18 @@ describe('the buttons of a report’s post', () => {
   it('say that Discord refused to delete the post, which is archived', async () => {
     const made = await setup();
     made.gateway.failing.set('deletePost', new Error('Missing Permissions'));
-    const chosen = await made.press('close:delete', { ephemeralMessage: true });
+    const chosen = await made.submit('close', 'delete');
     expect(textOf(asV2(sent(chosen.editReply)))).toBe(
       'Closed: the meetup is over, and its post archived: Discord refused to delete it; delete ' +
         'it yourself.',
     );
   });
 
-  it('take twenty presses a minute of a moderator', async () => {
+  it('take twenty presses and Submits a minute of a moderator', async () => {
     const made = await setup();
-    for (let i = 0; i < 20; i++) await made.press('close');
+    // Opening the dialog counts, and so does each Submit.
+    const dialog = shownDialog(await made.press('close'));
+    for (let i = 0; i < 19; i++) await made.submit('close', 'archive', dialog);
     expect(sent((await made.press('close')).reply).content).toMatch(/^That was a lot of clicks/);
   });
 
diff --git a/src/components/moderation-reports.ts b/src/components/moderation-reports.ts
index 11531b66..096c4af9 100644
--- a/src/components/moderation-reports.ts
+++ b/src/components/moderation-reports.ts
@@ -1,19 +1,28 @@
-import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
-import { mayNotDelete } from '../commands/parties/delete.js';
+import {
+  ButtonStyle,
+  ComponentType,
+  MessageFlags,
+  type ButtonInteraction,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../app-context.js';
+import { forumInDialog, mayNotDelete } from '../commands/parties/delete.js';
 import type { ComponentHandler } from '../discord/command.js';
+import { deferSubmit, readInTime } from '../discord/dialog.js';
 import { UserError } from '../discord/errors.js';
 import { guildIdOf, requireGuild, requireManagement } from '../discord/guards.js';
 import { answerApart, v2Answer } from '../discord/late-reply.js';
 import { memberInfo } from '../discord/member-info.js';
 import { STALE_COMPONENT } from '../discord/router.js';
-import type { ModerationReport, ReportRemoval } from '../domain/moderation/reports.js';
+import type { ModerationReport, PostRemoval, ReportRemoval } from '../domain/moderation/reports.js';
 import { partyWord } from '../domain/party/party.js';
 import { APPROVED_ACCENT, REFUSED_ACCENT } from '../render/meetup-safety.js';
 import {
   ENDING_ACTIONS,
   REPORT_ACTIONS,
   REPORT_KIND,
-  removalQuestion,
+  removalDialog,
+  removalOf,
   type ReportAction,
 } from '../render/moderation.js';
 import { count, memberText, timestamp } from '../render/text.js';
@@ -138,7 +147,7 @@ export function reportDecisionWords(outcome: ReportDecision): string {
   }
 }
 
-/** The private question before an action that ends a party, by the action. */
+/** The question of the dialog before an action that ends a party, by the action. */
 function questionOf(action: ReportAction, word: string): string {
   switch (action) {
     case 'refuse':
@@ -150,14 +159,86 @@ function questionOf(action: ReportAction, word: string): string {
   }
 }
 
+/** The title of the dialog of an action that ends a party: the act. */
+function titleOf(action: ReportAction, word: string): string {
+  switch (action) {
+    case 'refuse':
+      return 'Refuse this place';
+    case 'block':
+      return 'Block the maker';
+    default:
+      return `Close this ${word}`;
+  }
+}
+
+/**
+ * Decides the report as the moderator chose and answers them privately: after a Submit in the
+ * edit of its private acknowledgement, after the Archive post of a refused deletion in the place
+ * of that answer. Where Discord's permissions refuse the deletion (`may-not-delete`, which the
+ * dialog did not foresee: the bot lost Manage Threads since), the answer keeps Archive post,
+ * which archives at once.
+ */
+async function decideAndAnswer(
+  interaction: ButtonInteraction | ModalSubmitInteraction,
+  ctx: AppContext,
+  reportId: string,
+  action: ReportAction,
+  removal: PostRemoval | null,
+): Promise<void> {
+  const outcome = await ctx.reports.decide(
+    reportId,
+    action,
+    removal,
+    { id: interaction.user.id, name: memberInfo(interaction).name },
+    guildIdOf(interaction),
+    interaction.guild?.name,
+  );
+  const words = reportDecisionWords(outcome);
+  if (outcome.kind === 'may-not-delete') {
+    await answerApart(
+      interaction,
+      textMessage(
+        REFUSED_ACCENT,
+        [words],
+        [
+          actionRow([
+            {
+              type: ComponentType.Button,
+              style: ButtonStyle.Primary,
+              label: 'Archive post',
+              custom_id: encodeCustomId({
+                kind: REPORT_KIND,
+                id: reportId,
+                action,
+                args: ['archive'],
+              }),
+            },
+          ]),
+        ],
+      ),
+    );
+    return;
+  }
+  if (removal !== null) {
+    const accent = outcome.kind === 'done' ? APPROVED_ACCENT : REFUSED_ACCENT;
+    await interaction.editReply(v2Answer(textMessage(accent, [words])));
+  } else {
+    await interaction.editReply({ content: words });
+  }
+}
+
 /**
  * The buttons of a report's post in the moderators' channel (plan 8S-2; custom-id kind
- * `mreport`): `mreport:<report id>:close|refuse|block|delete|dismiss`, and on the private question
- * an action that ends a party asks first `mreport:<report id>:<action>:archive|delete`. For staff
+ * `mreport`): `mreport:<report id>:close|refuse|block|delete|dismiss`. An action that ends a
+ * party asks first in a dialog (plan 8Q, `removalDialog`: archive or delete the post, or archive
+ * only where the bot may not delete there), the report read within `DIALOG_READ_MS` and one
+ * decided already said at once, privately, without a dialog; its Submit
+ * (`mreport:<report id>:<action>[:archive]`) decides. A deletion refused at Submit is answered
+ * with Archive post, `mreport:<report id>:<action>:archive`, which decides at once. For staff
  * alone (`requireManagement`; others are refused privately, uncounted), with the throttle of the
- * moderators' posts. The report is read from the database, so a post from before a restart
- * works; the decision is the service's (`ModerationReports.decide`, the first press wins), which
- * edits the post for everybody; the presser is told privately, in the place of the question.
+ * moderators' posts for presses and Submits alike. The report is read from the database, so a
+ * post from before a restart works; the decision is the service's (`ModerationReports.decide`,
+ * the first one wins), which edits the post for everybody; the moderator is told privately.
  */
 export const reportDecisionControls: ComponentHandler = {
   kind: REPORT_KIND,
@@ -170,70 +251,50 @@ export const reportDecisionControls: ComponentHandler = {
     const [chosen] = id.args;
     const ending = ENDING_ACTIONS.includes(action);
     if (ending && chosen === undefined) {
-      // The question first, privately: nothing changes until the moderator chooses.
-      const report = await ctx.reports.reportOf(id.id);
+      // The dialog first: nothing changes until the moderator submits.
+      const report = await readInTime(ctx.log, interaction, () => ctx.reports.reportOf(id.id));
       if (!report || report.serverId !== guildIdOf(interaction))
         throw new UserError(STALE_COMPONENT);
-      // Decided already: said at once, no question.
+      // Decided already: said at once, no dialog.
       if (report.status !== 'open') {
         throw new UserError(reportDecisionWords({ kind: 'decided-before', report }));
       }
       const word = wordOf(report);
-      await interaction.reply({
-        ...v2Answer(
-          removalQuestion(questionOf(action, word), (removal) =>
-            encodeCustomId({ kind: REPORT_KIND, id: id.id, action, args: [removal] }),
-          ),
-        ),
-        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
-      });
+      const partyId = report.subject.kind === 'party' ? report.subject.partyId : undefined;
+      const forumId = (partyId === undefined ? undefined : ctx.parties.get(partyId))
+        ?.forumChannelId;
+      const customId = (args: string[]) =>
+        encodeCustomId({ kind: REPORT_KIND, id: id.id, action, args });
+      await interaction.showModal(
+        removalDialog({
+          customId: customId([]),
+          archiveOnlyId: customId(['archive']),
+          title: titleOf(action, word),
+          question: questionOf(action, word),
+          mayDelete: partyId === undefined || ctx.partyService.mayDeletePost(partyId),
+          forum: forumInDialog(interaction, forumId ?? null),
+        }),
+      );
       return;
     }
-    const removal = chosen === 'archive' || chosen === 'delete' ? chosen : null;
-    if (chosen !== undefined && removal === null) throw new UserError(STALE_COMPONENT);
+    // Archive post of a deletion refused at Submit; Delete post of a question from before the
+    // dialog is no control any more.
+    if (ending ? chosen !== 'archive' : chosen !== undefined) throw new UserError(STALE_COMPONENT);
     // Ending a party and editing posts take longer than Discord waits for an answer.
     if (ending) await interaction.deferUpdate();
     else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
-    const outcome = await ctx.reports.decide(
-      id.id,
-      action,
-      removal,
-      { id: interaction.user.id, name: memberInfo(interaction).name },
-      guildIdOf(interaction),
-      interaction.guild?.name,
-    );
-    const words = reportDecisionWords(outcome);
-    if (outcome.kind === 'may-not-delete') {
-      // Archive post stays: the moderator may still choose it.
-      await answerApart(
-        interaction,
-        textMessage(
-          REFUSED_ACCENT,
-          [words],
-          [
-            actionRow([
-              {
-                type: ComponentType.Button,
-                style: ButtonStyle.Primary,
-                label: 'Archive post',
-                custom_id: encodeCustomId({
-                  kind: REPORT_KIND,
-                  id: id.id,
-                  action,
-                  args: ['archive'],
-                }),
-              },
-            ]),
-          ],
-        ),
-      );
-      return;
-    }
-    if (ending) {
-      const accent = outcome.kind === 'done' ? APPROVED_ACCENT : REFUSED_ACCENT;
-      await interaction.editReply(v2Answer(textMessage(accent, [words])));
-    } else {
-      await interaction.editReply({ content: words });
+    await decideAndAnswer(interaction, ctx, id.id, action, ending ? 'archive' : null);
+  },
+
+  /** The Submit of the dialog of an action that ends a party: acknowledged privately at once. */
+  async modal(interaction, id, ctx) {
+    const action = REPORT_ACTIONS.find((one) => one === id.action);
+    if (action === undefined || !ENDING_ACTIONS.includes(action)) {
+      throw new UserError(STALE_COMPONENT);
     }
+    const removal = removalOf(interaction, id.args);
+    if (removal === undefined) throw new UserError(STALE_COMPONENT);
+    await deferSubmit(interaction);
+    await decideAndAnswer(interaction, ctx, id.id, action, removal);
   },
 };
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index dee0880c..e7e6bd48 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -111,9 +111,12 @@
  * Reports to the moderators (plan 8S-2): the form of a report is `report:<party id>:party`
  * (`/report`, the Apps menu on a party's post) or `report:<token>:message` (the Apps menu on
  * another message, kept under the token); the buttons of a report's post in the moderators'
- * channel are `mreport:<report id>:close|refuse|block|delete|dismiss` (its UUID), and the private
- * question of an action that ends a party `mreport:<report id>:<action>:archive|delete`. The
- * private question of staff's `/delete` is `pclose:<party id>:archive|delete`.
+ * channel are `mreport:<report id>:close|refuse|block|delete|dismiss` (its UUID); an action that
+ * ends a party asks in a dialog (plan 8Q) `mreport:<report id>:<action>` with the radio group
+ * `removal` (`archive` or `delete`), or `mreport:<report id>:<action>:archive` where the bot may
+ * not delete the post, and the button Archive post under a deletion refused at Submit is
+ * `mreport:<report id>:<action>:archive`. The dialog of staff's `/delete` is
+ * `pclose:<party id>:close[:archive]`, as a report's.
  *
  * "Change options…" under an answer of `/counters` is `counters:<token>:options`, and the dialog
  * it opens `counters:<token>:dialog`: the token is that of the answer's options, kept for a day
diff --git a/src/render/moderation.test.ts b/src/render/moderation.test.ts
index bed6a82d..9ba5d6f1 100644
--- a/src/render/moderation.test.ts
+++ b/src/render/moderation.test.ts
@@ -8,6 +8,8 @@ import {
   SAFETY_PIN,
   SAFETY_SERVER,
 } from '../../test/support/meetup-safety-cases.js';
+import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
+import { checkModal } from '../../test/support/fake-interactions.js';
 import { accentOf, buttonsOf, linksOf, textDisplays, textOf } from '../../test/support/messages.js';
 import { expectV2Sendable } from '../../test/support/post-limits.js';
 import {
@@ -23,7 +25,7 @@ import {
   type ReportSubject,
 } from '../domain/moderation/reports.js';
 import { PENDING_ACCENT } from './meetup-safety.js';
-import { removalQuestion, reportMessage } from './moderation.js';
+import { removalDialog, reportMessage } from './moderation.js';
 import { plain, plainLines } from './text.js';
 
 const HOUR = 3_600_000;
@@ -245,13 +247,54 @@ describe('reportMessage of a message', () => {
   });
 });
 
-describe('removalQuestion', () => {
-  it('asks whether to archive the post or delete it, with a button for each', () => {
-    const message = removalQuestion('Close this meetup?', (removal) => `x:1:${removal}`);
-    expect(textOf(message)).toContain('Close this meetup?');
-    expect(buttonsOf(message).map(({ label, customId }) => [label, customId])).toEqual([
-      ['Archive post', 'x:1:archive'],
-      ['Delete post', 'x:1:delete'],
+describe('removalDialog', () => {
+  it('asks whether to archive the post or delete it, with nothing picked', () => {
+    const dialog = removalDialog({
+      customId: 'x:1:close',
+      archiveOnlyId: 'x:1:close:archive',
+      title: 'Close this meetup',
+      question: 'Close this meetup?',
+      mayDelete: true,
+      forum: '#west-meetups',
+    });
+    checkModal(dialog);
+    expect(dialog.custom_id).toBe('x:1:close');
+    expect(dialog.title).toBe('Close this meetup');
+    expect(dialogTexts(dialog)).toEqual(['Close this meetup?']);
+    expect(dialogChoices(dialog)).toEqual([
+      {
+        value: 'archive',
+        label: 'Archive post',
+        description: 'Keeps it readable and locked.',
+        picked: false,
+      },
+      {
+        value: 'delete',
+        label: 'Delete post',
+        description:
+          'Removes it with everything written in it: for what nobody should keep reading, like ' +
+          'a home address.',
+        picked: false,
+      },
+    ]);
+  });
+
+  it('offers no choice where the bot may not delete the post, and says so', () => {
+    const dialog = removalDialog({
+      customId: 'x:1:close',
+      archiveOnlyId: 'x:1:close:archive',
+      title: 'Close this meetup',
+      question: 'Close this meetup?',
+      mayDelete: false,
+      forum: '#west-meetups',
+    });
+    checkModal(dialog);
+    expect(dialog.custom_id).toBe('x:1:close:archive');
+    expect(dialogChoices(dialog)).toEqual([]);
+    expect(dialogTexts(dialog)).toEqual([
+      "Close this meetup?\n\nIts post will be archived (kept readable and locked): I can't " +
+        'delete posts in #west-meetups (Manage Threads is missing there), so deleting it is not ' +
+        'offered. Delete it yourself if nobody should keep reading it.\n\nSubmit archives its post.',
     ]);
   });
 });
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index af8ddc98..aa6f1ee7 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -3,8 +3,11 @@ import {
   ComponentType,
   type APIButtonComponent,
   type APIComponentInContainer,
+  type APIModalInteractionResponseCallbackData,
+  type ModalSubmitInteraction,
 } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
+import { dialog, pickedOf } from '../discord/dialog.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import type {
   MessageSubject,
@@ -27,12 +30,15 @@ import {
   timestamp,
   truncate,
 } from './text.js';
-import { actionRow, container, linkButton, textDisplay, textMessage } from './v2.js';
+import { actionRow, container, linkButton, textDisplay } from './v2.js';
 
 /**
  * The custom-id kind of the buttons of a report's post (plan 8S-2): `mreport:<report id>:<action>`
- * (`ReportAction`), and under the private question of an action that ends a party
- * `mreport:<report id>:<action>:archive|delete`.
+ * (`ReportAction`); an action that ends a party asks in a dialog (plan 8Q)
+ * `mreport:<report id>:<action>` (its radio group `REMOVAL_INPUT`), or
+ * `mreport:<report id>:<action>:archive` where the bot may not delete the post, and the private
+ * answer to a deletion refused at Submit has the button Archive post
+ * `mreport:<report id>:<action>:archive`.
  */
 export const REPORT_KIND = 'mreport';
 
@@ -275,37 +281,72 @@ export function reportMessage(report: ModerationReport): V2Message {
   return { v2: true, components: [container(accentOf(report), components)] };
 }
 
+/** The custom id of the radio group of a removal's dialog: `archive` or `delete`. */
+export const REMOVAL_INPUT = 'removal';
+
+/** What a removal's dialog is drawn from. */
+export interface RemovalDialog {
+  /** The custom id of the dialog with the choice. */
+  customId: string;
+  /** The custom id of the dialog that only archives (the bot may not delete there). */
+  archiveOnlyId: string;
+  /** The act: `Close this raid`, `Refuse this place`. */
+  title: string;
+  /** Today's question: `Close this raid?`. */
+  question: string;
+  /** Whether the bot may delete the post (`PartyService.mayDeletePost`). */
+  mayDelete: boolean;
+  /** The post's forum as a dialog names it (`channelInDialog`). */
+  forum: string;
+}
+
 /**
- * The private question before a party is ended by a moderator (a report's Close…, Refuse place…
- * and Block maker…, and staff's `/delete`): archive the post, which stays readable, or delete it
- * with everything in it. `idOf` gives each button's custom id.
+ * The dialog before a party is ended by a moderator (plan 8Q; a report's Close…, Refuse place…
+ * and Block maker…, and staff's `/delete`): the question, and the required radio group `The
+ * post` with nothing picked: Archive post (it stays readable and locked) or Delete post (with
+ * everything in it). Where the bot may not delete the post there is no choice: the text says
+ * the post will be archived and why deleting it is not offered, and its custom id is
+ * `archiveOnlyId`.
  */
-export function removalQuestion(
-  question: string,
-  idOf: (removal: PostRemoval) => string,
-): V2Message {
-  return textMessage(
-    PENDING_ACCENT,
-    [
-      question,
-      '**Archive post** keeps it readable and locked. **Delete post** removes it with ' +
-        'everything written in it: for what nobody should keep reading, such as a home address.',
-    ],
-    [
-      actionRow([
-        {
-          type: ComponentType.Button,
-          style: ButtonStyle.Primary,
-          label: 'Archive post',
-          custom_id: idOf('archive'),
-        },
+export function removalDialog(asked: RemovalDialog): APIModalInteractionResponseCallbackData {
+  if (!asked.mayDelete) {
+    return dialog({
+      customId: asked.archiveOnlyId,
+      title: asked.title,
+      text:
+        `${asked.question}\n\nIts post will be archived (kept readable and locked): I can't ` +
+        `delete posts in ${asked.forum} (Manage Threads is missing there), so deleting it is ` +
+        'not offered. Delete it yourself if nobody should keep reading it.\n\n' +
+        'Submit archives its post.',
+    });
+  }
+  return dialog({
+    customId: asked.customId,
+    title: asked.title,
+    text: asked.question,
+    choice: {
+      id: REMOVAL_INPUT,
+      label: 'The post',
+      options: [
+        { value: 'archive', label: 'Archive post', description: 'Keeps it readable and locked.' },
         {
-          type: ComponentType.Button,
-          style: ButtonStyle.Danger,
+          value: 'delete',
           label: 'Delete post',
-          custom_id: idOf('delete'),
+          description:
+            'Removes it with everything written in it: for what nobody should keep reading, ' +
+            'like a home address.',
         },
-      ]),
-    ],
-  );
+      ],
+    },
+  });
+}
+
+/** The choice of a removal's dialog: its fixed `archive` (`args[0]`), or the one picked. */
+export function removalOf(
+  interaction: ModalSubmitInteraction,
+  args: readonly string[],
+): PostRemoval | undefined {
+  const [fixed] = args;
+  if (fixed !== undefined) return fixed === 'archive' ? 'archive' : undefined;
+  return pickedOf(interaction, REMOVAL_INPUT, ['archive', 'delete'] as const);
 }
````

### Task 4: Plan 8Q T4: deleting a gym asks in a dialog (8Q-4)

Prototype commit: `9b29f8144ab91bf61099a9804f8fdcb7bf19f30a`

/gym delete and Delete... of a gym's view open the dialog "Delete a
gym": today's question (Delete **Name** (#6)? This cannot be undone.,
then Nothing refers to it. or With it go: and its lines) and "Submit
deletes it.". The gym and what refers to it are read within the
slow-read budget; a raid at the gym is refused privately as before,
without a dialog. /gym delete declares no defer, and Delete... no longer
defers before asking.

The dialog carries only the gym's number (gymview:<gym id>:delete, a
modal of the view's controls with the guard of /gym): the delete request
of pendingGyms goes. Its Submit is acknowledged privately and decides
everything again through GymAdminService.delete, with today's answers
in a message of its own (a gym gone or of another server's regions
only, also on a second Submit: That gym no longer exists.). Discord's
Cancel replaces Keep ("The gym was kept." goes); the old question's
buttons find no request and say that it expired.

**Files:**

```
 docs/architecture/gyms-and-regions.md   |   3 +-
 src/commands/gyms/controls.ts           |   8 +--
 src/commands/gyms/delete-export.test.ts | 167 ++++++++++++++++++++++++++++++----------------------
 src/commands/gyms/delete.ts             | 150 ++++++++++++++++++++++++----------------------
 src/commands/gyms/edit-move.test.ts     |  16 -----
 src/commands/gyms/servers.test.ts       |  10 +++-
 src/commands/gyms/shared.ts             |   4 +-
 src/commands/gyms/view-controls.test.ts |  18 ++++--
 src/commands/gyms/view-controls.ts      |  35 ++++++-----
 src/discord/custom-id.ts                |   8 +--
 10 files changed, 218 insertions(+), 201 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/commands/gyms/delete-export.test.ts src/commands/gyms/edit-move.test.ts src/commands/gyms/servers.test.ts src/commands/gyms/view-controls.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9b29f8144ab91bf61099a9804f8fdcb7bf19f30a -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8Q T4: deleting a gym asks in a dialog (8Q-4)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/gyms-and-regions.md
git add -- src/commands/gyms/controls.ts
git add -- src/commands/gyms/delete-export.test.ts
git add -- src/commands/gyms/delete.ts
git add -- src/commands/gyms/edit-move.test.ts
git add -- src/commands/gyms/servers.test.ts
git add -- src/commands/gyms/shared.ts
git add -- src/commands/gyms/view-controls.test.ts
git add -- src/commands/gyms/view-controls.ts
git add -- src/discord/custom-id.ts
```

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 51123bba..90ce9d05 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -28,7 +28,8 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 ## Gym views and announcements
 
 - The views of a gym are components-v2 messages of `GYM_COLOUR` (`renderGymView`, staff: the heading `### [Name (Nickname)](<place>)`, the address Google gave and `regionsSentence`, the map, the description, `**Notice**`, `**Keywords:**`, `**Gym targets:**`, `**Elite raid gym:**`, `**Nearest gym:**`, nearby places and `Gym #<id> · <lat>, <lon>` in small print, a Map button; `renderMemberGymView` for `/find-gym`: no elite mark, the regions, the map, the description, the notice, **Raids now**, `Gym #<id>`, a Map button); every text is cut to its room (`SHOWN`, `HEADING`) so that the worst case is within `TEXT_BUDGET`: what staff or Google wrote is cut before it is escaped, the lines above a view are kept whole while they fit (`fitLines`, "…and N more lines"; a first line too long by itself is cut by `cutMarkdown`, `src/render/text.ts`, which never cuts inside a code span, a link, a mention or an escape and takes out an emphasis marker left open: finished markdown, plan 8W-3), and `namesakeNote` names its namesakes within `NAMESAKES_SHOWN`. Every message of the `/gym` flows is v2 from first to last (`gymQuestion` for questions and answers, `gymViewMessage(ctx, place, gym, lines, controls)` for a view with what a change did above it, `answerGym` and `sayGym` to show them); the answer of a change has no buttons but the Map link. Tests read them with `said` (the sentences above a view), `gymViewOf` (title, lines, facts, small print, pictures) and `gymOf` (`test/support/gym-commands.ts`).
-- The view of `/gym show` has Edit…, Make elite / Not elite, Move… and Delete… beside its Map link (`viewControls`, `src/commands/gyms/view-controls.ts`): the custom-id kind `gymview`, `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0` (what Make elite / Not elite sets, so that a view drawn before somebody else changed the mark does what its label says) and the form `gymview:<gym id>:place` (titled by the gym's tidied name, cut to 38), nothing kept in memory, the guard of `/gym` and no throttle (as `/gym`), a gym gone or out of reach refused with `VIEW_GONE`. Edit… opens the form of `/gym edit` (`openEditForm`, `fromView`: its answer is a message of its own and the view stays; a refusal of it too, and the form opened again from that refusal is answered in its place); Make elite sets the mark and shows the view anew in place with what it did and the buttons as they now are (a gym gone during the press is said in the view's place); Move… opens a form of one input read by `readLocation` and answers as `/gym move` does (`moveGymTo`), Delete… with the question of `/gym delete` (`deleteQuestion`), both in a private message of their own (`deferReply`, then `answerGym`).
+- The view of `/gym show` has Edit…, Make elite / Not elite, Move… and Delete… beside its Map link (`viewControls`, `src/commands/gyms/view-controls.ts`): the custom-id kind `gymview`, `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0` (what Make elite / Not elite sets, so that a view drawn before somebody else changed the mark does what its label says), the form `gymview:<gym id>:place` (titled by the gym's tidied name, cut to 38) and the dialog of a deletion `gymview:<gym id>:delete`, nothing kept in memory, the guard of `/gym` and no throttle (as `/gym`), a gym gone or out of reach refused with `VIEW_GONE`. Edit… opens the form of `/gym edit` (`openEditForm`, `fromView`: its answer is a message of its own and the view stays; a refusal of it too, and the form opened again from that refusal is answered in its place); Make elite sets the mark and shows the view anew in place with what it did and the buttons as they now are (a gym gone during the press is said in the view's place); Move… opens a form of one input read by `readLocation` and answers as `/gym move` does (`moveGymTo`) in a private message of its own (`deferReply`, then `answerGym`); Delete… opens the dialog of `/gym delete` (plan 8Q; below), not deferred before it.
+- `/gym delete` and Delete… ask in a dialog (plan 8Q, `deleteDialog` in `src/commands/gyms/delete.ts`): titled `Delete a gym`, today's question (`Delete **Name** (#6)? This cannot be undone.`, then `Nothing refers to it.` or `With it go:` and its lines) and `Submit deletes it.`; the gym and what refers to it (`GymAdminService.references`) read within `DIALOG_READ_MS` (`readInTime`); a raid at the gym refused privately, without a dialog. `/gym delete` declares no `defer`. The dialog carries only the gym's number (`gymview:<gym id>:delete`, a `modal` of `gymViewControls`, the guard of `/gym`): nothing is kept in `pendingGyms`. Its Submit (`deleteGymNow`) is acknowledged privately and decides everything again (`GymAdminService.delete`: a gym gone or of another server's regions only is `That gym no longer exists.`, also for a second Submit; a raid reported since keeps it), answering in a message of its own. Discord's Cancel replaces Keep; the buttons of the question before plan 8Q (`gym:<token>:delete|cancel`) find no request and say that it expired.
 - A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced. What changes the gym list in bulk (a Wayfarer import, the answers of its review queue, the deletion of the gyms beyond a scanned area) is one summary instead (`gymListSummary`, `src/render/gym-summary.ts`: what changed, never what made it (Matt, 2026-10-16), "Professor Pine has added 30 gyms, renamed 1, and moved 1.", the serial comma before the last of three or more; then, for an import, what it changed of the PokéStops and power spots, "It also added 120 PokéStops and 3 power spots, changed 4 PokéStops, and removed 2 power spots." (`wayfarer.md`), alone under the heading "The PokéStops and power spots changed" when no gym changed; counts of nothing are left out; a name changed only in spaces or capitals, `tidiesName`, is no rename): `GymAdminService.batch(place, source, work)` posts its summary at the end, the review's (`source` `review`, also `delete(…, 'review')`) gathered per server and posted `REVIEW_SUMMARY_MS` after the last answer (`flush` posts what waits; a crash loses the counts of those minutes, the changes themselves stand: ruled in plan 8W-3 not to keep them in the database, which would take a migration, a repository and its twin, and a timer taken up at start with the place of the summary for a post that only counts what members can see on the map and the posts). One gym added alone is `gymAnnouncement(gym, regions, map)`, a components-v2 message with its map (Matt, 2026-10-15: like `/find-gym`; `GymAdminOptions.maps`, fetched only once a channel was found, the announcement going without it when it fails); a deletion is `gymRemovedLine`. `announce` takes the messages to try in order: one Discord refuses (a file where the bot may not attach files, a map file gone) is followed by the next (the gym without its map); the map is fetched only once a channel was found, and a gym gone by then is not announced. The fake gateway's `refuseFiles` refuses a sent message with files.
 
 ## Regions
diff --git a/src/commands/gyms/controls.ts b/src/commands/gyms/controls.ts
index bd455f0a..69c09606 100644
--- a/src/commands/gyms/controls.ts
+++ b/src/commands/gyms/controls.ts
@@ -4,7 +4,6 @@ import { UserError } from '../../discord/errors.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { addAnswers, addForms, addOpeners } from './add.js';
-import { deleteAnswers } from './delete.js';
 import { editForms, editOpeners } from './edit.js';
 import { importButton, isImportAction } from './import.js';
 import { moveAnswers } from './move.js';
@@ -27,7 +26,6 @@ const CANCELLED: Readonly<Record<PendingGym['what'], string>> = {
   add: 'Nothing was added.',
   edit: 'Nothing was changed.',
   move: 'The gym stays where it is.',
-  delete: 'The gym was kept.',
 };
 
 /**
@@ -36,11 +34,7 @@ const CANCELLED: Readonly<Record<PendingGym['what'], string>> = {
  * question (`ANSWERS`: the request is taken, the question is answered once) or opens a form
  * (`OPENERS`: the request stays); a form that was sent is answered by `FORMS`.
  */
-const ANSWERS: Readonly<Record<string, ButtonAnswer>> = {
-  ...addAnswers,
-  ...moveAnswers,
-  ...deleteAnswers,
-};
+const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...addAnswers, ...moveAnswers };
 const OPENERS: Readonly<Record<string, FormOpener>> = { ...addOpeners, ...editOpeners };
 const FORMS: Readonly<Record<string, FormAnswer>> = { ...addForms, ...editForms };
 /** The actions that open a form, whatever the request is about. */
diff --git a/src/commands/gyms/delete-export.test.ts b/src/commands/gyms/delete-export.test.ts
index 10f22fd2..9839e67c 100644
--- a/src/commands/gyms/delete-export.test.ts
+++ b/src/commands/gyms/delete-export.test.ts
@@ -1,21 +1,24 @@
 import { MessageFlags } from 'discord.js';
-import { describe, expect, it } from 'vitest';
+import { describe, expect, it, vi } from 'vitest';
+import { dialogChoices, dialogText, shownDialog } from '../../../test/support/dialogs.js';
 import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
 import { STAFF_PLACE, UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
 import {
   answerOf,
-  buttonId,
   buttonsOf,
   gymCommandsWith,
   gymViewOf,
   MEMBER,
   MODERATOR,
+  OTHER_SERVER,
   said,
 } from '../../../test/support/gym-commands.js';
 import { WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { ALICE, asTrain, BOB, REPORTER } from '../../../test/support/parties.js';
 import { PartyStatus } from '../../domain/party/status.js';
+import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
 import { LIMITS } from '../../render/text.js';
+import { EXPIRED } from './shared.js';
 
 type Made = Awaited<ReturnType<typeof gymCommandsWith>>;
 
@@ -49,48 +52,83 @@ async function trainOn(made: Made, route: readonly number[]) {
 }
 
 describe('/gym delete', () => {
-  it('asks first, with what goes with the gym', async () => {
+  /** `/gym delete` of gym 6, and the dialog it opened. */
+  async function asked(made: Made, gym = 'id:6') {
+    const used = await made.use('delete', { gym });
+    return { used, dialog: shownDialog(used) };
+  }
+
+  it('asks first in a dialog, with what goes with the gym', async () => {
     const made = await gymCommandsWith();
     await trainOn(made, [1, 6]);
     made.routes.add(ALICE, 1, 'Loop', [6, 1]);
     made.routes.add(BOB, 1, 'Only', [6]);
     await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
 
-    const asked = await made.use('delete', { gym: 'id:6' });
+    const { used, dialog } = await asked(made);
 
-    expect(asked.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
-    const question = answerOf(asked);
-    expect(said(question).split('\n')).toEqual([
+    expect(used.deferReply).not.toHaveBeenCalled();
+    expect(used.reply).not.toHaveBeenCalled();
+    expect(dialog.custom_id).toBe('gymview:6:delete');
+    expect(dialog.title).toBe('Delete a gym');
+    expect(dialogText(dialog).split('\n')).toEqual([
       'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.',
       'With it go:',
       '- its stop on the route of 1 active train',
       '- its stop on 2 saved routes',
       '- the gym target of 1 member',
+      '',
+      'Submit deletes it.',
     ]);
-    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Delete', 'Keep']);
+    expect(dialogChoices(dialog)).toEqual([]);
     expect(made.gymStore.row(6)).toBeDefined();
   });
 
   it('says so when nothing refers to the gym', async () => {
     const made = await gymCommandsWith();
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    expect(said(question)).toBe(
-      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.',
+    const { dialog } = await asked(made);
+    expect(dialogText(dialog)).toBe(
+      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.\n\n' +
+        'Submit deletes it.',
     );
   });
 
-  it('deletes on Delete: the gym, its stops, its saved routes and its targets', async () => {
+  it('opens no dialog when what goes with the gym takes too long to read', async () => {
+    const made = await gymCommandsWith();
+    let arrive: () => void = () => undefined;
+    const reading = new Promise<void>((resolve) => {
+      arrive = resolve;
+    });
+    vi.spyOn(made.admin, 'references').mockImplementation(() => {
+      arrive();
+      return new Promise(() => undefined);
+    });
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const using = made.use('delete', { gym: 'id:6' });
+      await reading;
+      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
+      const used = await using;
+      expect(used.showModal).not.toHaveBeenCalled();
+      expect(sent(used.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
+    } finally {
+      vi.useRealTimers();
+    }
+    expect(made.gymStore.row(6)).toBeDefined();
+  });
+
+  it('deletes on Submit: the gym, its stops, its saved routes and its targets', async () => {
     const made = await gymCommandsWith();
     const train = await trainOn(made, [1, 6]);
     made.routes.add(ALICE, 1, 'Loop', [6, 1]);
     await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
+    const { dialog } = await asked(made);
 
-    const pressed = await made.press(buttonId(question, 'Delete'));
+    const submitted = await made.submit(dialog.custom_id, {});
     await made.settle();
 
-    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
-    expect(said(answerOf(pressed))).toBe(
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(said(answerOf(submitted))).toBe(
       [
         'Deleted **Maple Leaf Mosaic** (#6).',
         'With it went:',
@@ -99,7 +137,7 @@ describe('/gym delete', () => {
         '- the gym target of 1 member',
       ].join('\n'),
     );
-    expect(buttonsOf(answerOf(pressed))).toEqual([]);
+    expect(buttonsOf(answerOf(submitted))).toEqual([]);
     expect(made.gymStore.row(6)).toBeUndefined();
     expect(made.directory.get(6)).toBeUndefined();
     expect(asTrain(made.store.get(train.id)).train.route).toEqual([1]);
@@ -122,35 +160,26 @@ describe('/gym delete', () => {
     );
   });
 
-  it('keeps the gym on Keep', async () => {
-    const made = await gymCommandsWith();
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    const pressed = await made.press(buttonId(question, 'Keep'));
-    expect(said(sent(pressed.update))).toBe('The gym was kept.');
-    expect(buttonsOf(sent(pressed.update))).toEqual([]);
-    expect(made.gymStore.row(6)).toBeDefined();
-  });
-
-  it('refuses while an active raid is at the gym, with a link to its post', async () => {
+  it('refuses while an active raid is at the gym, with a link to its post, and opens no dialog', async () => {
     const made = await gymCommandsWith();
     const raid = await raidAt(made, 6);
     const used = await made.use('delete', { gym: 'id:6' });
-    expect(said(sent(used.followUp))).toBe(
+    expect(used.showModal).not.toHaveBeenCalled();
+    expect(said(sent(used.reply))).toBe(
       `A raid is at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym cannot be ` +
         'deleted while a raid is there: wait until the raid is over, or close it with ' +
         '`/delete` in its post.',
     );
-    expect(used.editReply).not.toHaveBeenCalled();
   });
 
-  it('decides again on Delete: a raid that was reported since the question keeps the gym', async () => {
+  it('decides again on Submit: a raid that was reported since the dialog keeps the gym', async () => {
     const made = await gymCommandsWith();
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
+    const { dialog } = await asked(made);
     const raid = await raidAt(made, 6);
 
-    const pressed = await made.press(buttonId(question, 'Delete'));
+    const submitted = await made.submit(dialog.custom_id, {});
 
-    expect(said(answerOf(pressed))).toBe(
+    expect(said(answerOf(submitted))).toBe(
       `A raid was reported at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym ` +
         'cannot be deleted while a raid is there: wait until the raid is over, or close it ' +
         'with `/delete` in its post.',
@@ -158,30 +187,31 @@ describe('/gym delete', () => {
     expect(made.gymStore.row(6)).toBeDefined();
   });
 
-  it('counts on Delete what is there then, not what the question listed', async () => {
+  it('counts on Submit what is there then, not what the dialog listed', async () => {
     const made = await gymCommandsWith();
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    expect(said(question)).toContain('Nothing refers to it.');
+    const { dialog } = await asked(made);
+    expect(dialogText(dialog)).toContain('Nothing refers to it.');
     made.routes.add(ALICE, 1, 'Loop', [6, 1]);
-    const pressed = await made.press(buttonId(question, 'Delete'));
-    expect(said(answerOf(pressed))).toBe(
+    const submitted = await made.submit(dialog.custom_id, {});
+    expect(said(answerOf(submitted))).toBe(
       'Deleted **Maple Leaf Mosaic** (#6).\nWith it went:\n- its stop on 1 saved route',
     );
     expect(made.routes.rows.map((row) => row.gyms)).toEqual([[1]]);
   });
 
-  it('says so when the gym is gone already, and when the clean-up fails', async () => {
+  it('says so when the gym is gone already (a second Submit too), and when the clean-up fails', async () => {
     const made = await gymCommandsWith();
-    const first = answerOf(await made.use('delete', { gym: 'id:6' }));
-    const second = answerOf(await made.use('delete', { gym: 'id:6' }));
-    await made.press(buttonId(first, 'Delete'));
-    expect(said(answerOf(await made.press(buttonId(second, 'Delete'))))).toBe(
+    const { dialog } = await asked(made);
+    expect(said(answerOf(await made.submit(dialog.custom_id, {})))).toBe(
+      'Deleted **Maple Leaf Mosaic** (#6).',
+    );
+    expect(said(answerOf(await made.submit(dialog.custom_id, {})))).toBe(
       'That gym no longer exists.',
     );
 
-    const question = answerOf(await made.use('delete', { gym: 'id:3' }));
+    const other = await asked(made, 'id:3');
     made.routes.failing = new Error('database is down');
-    expect(said(answerOf(await made.press(buttonId(question, 'Delete'))))).toBe(
+    expect(said(answerOf(await made.submit(other.dialog.custom_id, {})))).toBe(
       'I could not delete the gym, and nothing was changed. Try again in a moment; the log ' +
         'says what failed.',
     );
@@ -195,8 +225,8 @@ describe('/gym delete', () => {
     // One member with the target in two servers is one member.
     await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
     await made.gymTargets.add(ALICE, '412345678901234568', 6);
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    expect(said(question)).toContain('- the gym target of 1 member');
+    const { dialog } = await asked(made);
+    expect(dialogText(dialog)).toContain('- the gym target of 1 member');
     // The gym goes; the train cannot be stored afterwards.
     const remove = made.removal.remove.bind(made.removal);
     made.removal.remove = async (id) => {
@@ -205,10 +235,10 @@ describe('/gym delete', () => {
       return counts;
     };
 
-    const pressed = await made.press(buttonId(question, 'Delete'));
+    const submitted = await made.submit(dialog.custom_id, {});
     made.storage.failing = undefined;
 
-    expect(said(answerOf(pressed)).split('\n')).toEqual([
+    expect(said(answerOf(submitted)).split('\n')).toEqual([
       'Deleted **Maple Leaf Mosaic** (#6).',
       'With it went:',
       '- its stop on 1 saved route',
@@ -218,29 +248,24 @@ describe('/gym delete', () => {
     expect(made.directory.get(6)).toBeUndefined();
   });
 
-  it('does not write "expired" over the answer when Delete is pressed twice', async () => {
-    const made = await gymCommandsWith();
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    const first = await made.press(buttonId(question, 'Delete'));
-    const second = await made.press(buttonId(question, 'Delete'));
-    expect(said(answerOf(first))).toBe('Deleted **Maple Leaf Mosaic** (#6).');
-    expect(second.deferUpdate).toHaveBeenCalledTimes(1);
-    expect(second.update).not.toHaveBeenCalled();
-    expect(second.editReply).not.toHaveBeenCalled();
-  });
-
-  it('lets only the staff member who asked delete', async () => {
+  it('lets only staff submit, and takes no gym of another server', async () => {
     const made = await gymCommandsWith();
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    const other = await made.press(buttonId(question, 'Delete'), { userId: '200000000000000007' });
-    expect(said(sent(other.reply))).toBe('That is somebody else’s question.');
-    const member = await made.press(buttonId(question, 'Delete'), {
-      userId: MEMBER,
-      roleNames: [],
-    });
+    const { dialog } = await asked(made);
+    const member = await made.submit(dialog.custom_id, {}, { userId: MEMBER, roleNames: [] });
     expect(said(sent(member.reply))).toBe(
       'Only admins, moderators and bot developers can do that.',
     );
+    const foreign = await made.submit(dialog.custom_id, {}, OTHER_SERVER);
+    expect(said(answerOf(foreign))).toBe('That gym no longer exists.');
+    expect(made.gymStore.row(6)).toBeDefined();
+  });
+
+  it('gives the buttons of the question it asked before no answer but that it expired', async () => {
+    const made = await gymCommandsWith();
+    for (const action of ['delete', 'cancel']) {
+      const pressed = await made.press(`gym:0123456789abcdef:${action}`);
+      expect(said(answerOf(pressed))).toBe(EXPIRED);
+    }
     expect(made.gymStore.row(6)).toBeDefined();
   });
 });
@@ -421,10 +446,10 @@ describe('/gym: what it says fits one message', () => {
     ]);
     expect(buttonsOf(move).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);
 
-    const remove = answerOf(await made.use('delete', { gym: '#13' }));
-    expect(said(remove).length).toBeLessThanOrEqual(LIMITS.content);
+    // The dialog of a deletion holds the 4,000 characters of a text display (`checkModal`).
+    const remove = dialogText(shownDialog(await made.use('delete', { gym: '#13' })));
     // The number is what tells such gyms apart: it is never cut away.
-    expect(said(remove)).toContain(', #13)? This cannot be undone.');
+    expect(remove).toContain(', #13)? This cannot be undone.');
 
     const shown = answerOf(await made.use('show', { gym: '#13' }));
     expect(said(shown).length).toBeLessThanOrEqual(LIMITS.content);
diff --git a/src/commands/gyms/delete.ts b/src/commands/gyms/delete.ts
index b16001d7..4026bea2 100644
--- a/src/commands/gyms/delete.ts
+++ b/src/commands/gyms/delete.ts
@@ -1,25 +1,24 @@
-import { ButtonStyle, SlashCommandSubcommandBuilder } from 'discord.js';
+import {
+  SlashCommandSubcommandBuilder,
+  type APIModalInteractionResponseCallbackData,
+  type ModalSubmitInteraction,
+} from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
-import type { V2Message } from '../../discord/party-gateway.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { deferSubmit, dialog, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
+import { answerApart } from '../../discord/late-reply.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
 import type { RaidParty } from '../../domain/party/party.js';
 import { gymWithId } from '../../render/gym-view.js';
 import { count } from '../../render/text.js';
 import type { DeleteOutcome } from '../../services/gym-admin-service.js';
 import { actingMember } from '../parties/reply.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
-import {
-  answerGym,
-  button,
-  content,
-  GYM_GONE,
-  gymQuestion,
-  pendingGyms,
-  staffPlace,
-  type ButtonAnswer,
-} from './shared.js';
+import { content, GYM_GONE, gymQuestion, staffPlace } from './shared.js';
+import { GYM_VIEW_KIND } from './view-controls.js';
 
 /** Why a gym with a raid stays, with the raid's post (also the answer of `/gym review`). */
 export function raidThere(gym: string, raid: RaidParty, when: string): string {
@@ -67,7 +66,8 @@ export function deletedLines(outcome: Extract<DeleteOutcome, { kind: 'deleted' }
 
 /**
  * `/gym delete`: takes a gym out of the gym list, with what refers to it. Refused while an
- * active raid is there; otherwise the staff member is asked, with what goes with the gym.
+ * active raid is there; otherwise the staff member is asked in a dialog (plan 8Q,
+ * `deleteDialog`), with what goes with the gym. The dialog is the first answer: no `defer`.
  */
 export const deleteGym: SubcommandPart = {
   data: withGymOption(
@@ -77,81 +77,87 @@ export const deleteGym: SubcommandPart = {
   ),
   help: {
     details:
-      'For a gym that no longer exists in the game. I ask first and say what goes with it: ' +
-      'it is taken off the route of every active train (the train’s post says why) and off ' +
-      'every saved route, and members who have it as a gym target lose that target. It ' +
-      'cannot be deleted while a raid is there. A gym that was only put down wrongly is ' +
-      'moved with `/gym move` instead.',
+      'For a gym that no longer exists in the game. I ask first, in a dialog, and say what ' +
+      'goes with it: it is taken off the route of every active train (the train’s post says ' +
+      'why) and off every saved route, and members who have it as a gym target lose that ' +
+      'target. It cannot be deleted while a raid is there. A gym that was only put down ' +
+      'wrongly is moved with `/gym move` instead.',
     examples: ['/gym delete gym:Big Fountain'],
   },
-  defer: 'ephemeral',
   async execute(interaction, ctx) {
-    const gym = await chosenGym(interaction, ctx);
-    await answerGym(interaction, await deleteQuestion(ctx, interaction.user.id, gym));
+    const dialog = await readInTime(ctx.log, interaction, async () =>
+      deleteDialog(ctx, await chosenGym(interaction, ctx)),
+    );
+    await interaction.showModal(dialog);
   },
   autocomplete: respondWithGyms,
 };
 
+/** The action of Delete… of a gym view, and of the dialog both open: `gymview:<gym id>:delete`. */
+export const DELETE_ACTION = 'delete';
+
 /**
- * The question of `/gym delete` (also of Delete… of the view of `/gym show`), with what goes with
- * the gym; refused while a raid is there. It is kept as a pending request of the staff member.
+ * The dialog of `/gym delete` (also of Delete… of the view of `/gym show`), titled `Delete a
+ * gym`, with what goes with the gym and `Submit deletes it.`; refused while a raid is there. Its
+ * custom id is `gymview:<gym id>:delete`: nothing is kept in memory, and its Submit
+ * (`deleteGymNow`) decides everything again.
  */
-export async function deleteQuestion(
+export async function deleteDialog(
   ctx: AppContext,
-  userId: string,
   gym: Gym,
-): Promise<V2Message> {
+): Promise<APIModalInteractionResponseCallbackData> {
   const references = await ctx.gymAdmin.references(gym.id);
   const [raid] = references.raids;
   if (raid) throw new UserError(raidThere(gymWithId(gym), raid, 'is'));
-  const token = pendingGyms.put(userId, { what: 'delete', gymId: gym.id });
   const going = goesWith(references, 'With it go:');
-  return gymQuestion(
-    [
-      content([
-        `Delete ${gymWithId(gym)}? This cannot be undone.`,
-        ...(going.length === 0 ? ['Nothing refers to it.'] : going),
-      ]),
-    ],
-    [
-      button(token, 'delete', 'Delete', ButtonStyle.Danger),
-      button(token, 'cancel', 'Keep', ButtonStyle.Secondary),
-    ],
-  );
+  return dialog({
+    customId: encodeCustomId({ kind: GYM_VIEW_KIND, id: String(gym.id), action: DELETE_ACTION }),
+    title: 'Delete a gym',
+    text: [
+      `Delete ${gymWithId(gym)}? This cannot be undone.`,
+      ...(going.length === 0 ? ['Nothing refers to it.'] : going),
+      '',
+      'Submit deletes it.',
+    ].join('\n'),
+  });
 }
 
 /**
- * Delete was pressed under the question. Everything is decided again now (the question may be
- * minutes old), by the service, and what the answer counts is what really went; the answer
- * takes the place of the question. A train that still has the gym on its route, because it
- * could not be changed, is named with its post.
+ * The Submit of the dialog of a gym's deletion: acknowledged privately, then everything is
+ * decided again now (the dialog may be minutes old), by the service, and what the answer counts
+ * is what really went. A gym that is gone, or lies only in another server's regions, is `That
+ * gym no longer exists.`; a train that still has the gym on its route, because it could not be
+ * changed, is named with its post. The answer is a private message of its own.
  */
-export const deleteAnswers: Readonly<Record<string, ButtonAnswer>> = {
-  'delete:delete': async (interaction, ctx, request) => {
-    if (request.what !== 'delete') return;
-    const { gymId } = request;
-    const before = ctx.gyms.get(gymId);
-    const place = await staffPlace(interaction, ctx);
-    const outcome = await ctx.gymAdmin.delete(gymId, actingMember(interaction), place);
-    let lines: string[];
-    switch (outcome.kind) {
-      case 'gone':
-      case 'withdrawn':
-        lines = [GYM_GONE];
-        break;
-      case 'raid-there':
-        lines = [raidThere(before ? gymWithId(before) : 'that gym', outcome.raid, 'was reported')];
-        break;
-      case 'failed':
-        lines = [
-          'I could not delete the gym, and nothing was changed. Try again in a moment; the ' +
-            'log says what failed.',
-        ];
-        break;
-      case 'deleted':
-        lines = deletedLines(outcome);
-        break;
-    }
-    await answerGym(interaction, gymQuestion([content(lines)]));
-  },
-};
+export async function deleteGymNow(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  id: string,
+): Promise<void> {
+  const gymId = /^\d{1,9}$/.test(id) ? Number(id) : undefined;
+  if (gymId === undefined) throw new UserError(STALE_COMPONENT);
+  await deferSubmit(interaction);
+  const before = ctx.gyms.get(gymId);
+  const place = await staffPlace(interaction, ctx);
+  const outcome = await ctx.gymAdmin.delete(gymId, actingMember(interaction), place);
+  let lines: string[];
+  switch (outcome.kind) {
+    case 'gone':
+    case 'withdrawn':
+      lines = [GYM_GONE];
+      break;
+    case 'raid-there':
+      lines = [raidThere(before ? gymWithId(before) : 'that gym', outcome.raid, 'was reported')];
+      break;
+    case 'failed':
+      lines = [
+        'I could not delete the gym, and nothing was changed. Try again in a moment; the ' +
+          'log says what failed.',
+      ];
+      break;
+    case 'deleted':
+      lines = deletedLines(outcome);
+      break;
+  }
+  await answerApart(interaction, gymQuestion([content(lines)]));
+}
diff --git a/src/commands/gyms/edit-move.test.ts b/src/commands/gyms/edit-move.test.ts
index 0ca5b4e5..a44d7ef8 100644
--- a/src/commands/gyms/edit-move.test.ts
+++ b/src/commands/gyms/edit-move.test.ts
@@ -744,22 +744,6 @@ describe('/gym: questions and refusals from before plan 8B-4', () => {
     expect(made.gymStore.row(6)).toMatchObject({ lat: 40.2 });
   });
 
-  it('answers Delete and Keep on a plain-text question below it, or in plain text', async () => {
-    const made = await gymCommandsWith();
-    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
-    const pressed = await made.press(buttonId(question, 'Delete'), { v2Message: false });
-    expect(sent(pressed.editReply)).toEqual(closed);
-    expect(said(sent(pressed.followUp))).toBe('Deleted **Maple Leaf Mosaic** (#6).');
-    const kept = answerOf(await made.use('delete', { gym: 'id:5' }));
-    const keep = await made.press(buttonId(kept, 'Keep'), { v2Message: false });
-    expect(sent(keep.update)).toEqual({
-      content: 'The gym was kept.',
-      embeds: [],
-      components: [],
-      attachments: [],
-    });
-  });
-
   it('answers a form opened again from a plain-text refusal below that refusal', async () => {
     const made = await gymCommandsWith();
     const form = await editForm(made, 'id:1');
diff --git a/src/commands/gyms/servers.test.ts b/src/commands/gyms/servers.test.ts
index 197f3235..be63f784 100644
--- a/src/commands/gyms/servers.test.ts
+++ b/src/commands/gyms/servers.test.ts
@@ -1,3 +1,4 @@
+import { shownDialog } from '../../../test/support/dialogs.js';
 import { describe, expect, it } from 'vitest';
 import { sent } from '../../../test/support/fake-interactions.js';
 import { withOtherServer } from '../../../test/support/gym-admin.js';
@@ -116,7 +117,10 @@ describe('/gym: the gyms of another server', () => {
     made.gymStore.writes.length = 0;
     const none = 'There is no gym #13.';
     await expect(refusal(made.use('elite', { gym: '#13', eligible: true }))).resolves.toBe(none);
-    await expect(refusal(made.use('delete', { gym: '#13' }))).resolves.toBe(none);
+    // The dialog of a deletion is not deferred: its refusal is the reply.
+    const deleting = await made.use('delete', { gym: '#13' });
+    expect(deleting.showModal).not.toHaveBeenCalled();
+    expect(said(sent(deleting.reply))).toBe(none);
     await expect(refusal(made.use('refresh', { gym: '#13' }))).resolves.toBe(none);
     await expect(
       refusal(made.use('move', { gym: '#13', location: '40.2501, -80.05' })),
@@ -154,12 +158,12 @@ describe('/gym: the gyms of another server', () => {
 
   it('refuses a press on a question about a gym that changed hands since', async () => {
     const made = await twoServers();
-    const deleting = answerOf(await made.use('delete', { gym: '#6' }));
+    const deleting = shownDialog(await made.use('delete', { gym: '#6' }));
     const moving = answerOf(await made.use('move', { gym: '#6', location: '40.05, -79.95' }));
     await handOver(made);
     made.gymStore.writes.length = 0;
 
-    const deleted = answerOf(await made.press(buttonId(deleting, 'Delete')));
+    const deleted = answerOf(await made.submit(deleting.custom_id, {}));
     const moved = answerOf(await made.press(buttonId(moving, 'Move anyway')));
     for (const gone of [deleted, moved]) {
       expect(said(gone)).toBe('That gym no longer exists.');
diff --git a/src/commands/gyms/shared.ts b/src/commands/gyms/shared.ts
index 47995b80..a58f9a6d 100644
--- a/src/commands/gyms/shared.ts
+++ b/src/commands/gyms/shared.ts
@@ -95,9 +95,7 @@ export type PendingGym =
       point: LatLon;
       approximate: boolean;
       nearIds: readonly number[];
-    }
-  /** `/gym delete`: the gym. */
-  | { what: 'delete'; gymId: number };
+    };
 
 /**
  * How long a question or a form of `/gym` can be answered. Long: a form that is open while its
diff --git a/src/commands/gyms/view-controls.test.ts b/src/commands/gyms/view-controls.test.ts
index 02015765..fa4a081a 100644
--- a/src/commands/gyms/view-controls.test.ts
+++ b/src/commands/gyms/view-controls.test.ts
@@ -1,3 +1,4 @@
+import { dialogText, shownDialog } from '../../../test/support/dialogs.js';
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
 import { asV2, sent } from '../../../test/support/fake-interactions.js';
@@ -200,17 +201,21 @@ describe('the buttons of the view of /gym show', () => {
     expect(made.gymStore.row(6)).toEqual(before);
   });
 
-  it('asks before it deletes, in a message of its own', async () => {
+  it('asks before it deletes, in the dialog of /gym delete, the view staying', async () => {
     const made = await gymCommandsWith();
     const view = await shown(made, 'id:6');
     const pressed = await made.press(buttonId(view, 'Delete…'));
-    expect(pressed.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(pressed.deferReply).not.toHaveBeenCalled();
     expect(pressed.update).not.toHaveBeenCalled();
-    const question = answerOf(pressed);
-    expect(said(question)).toBe(
-      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.',
+    const dialog = shownDialog(pressed);
+    expect(dialog.title).toBe('Delete a gym');
+    expect(dialogText(dialog)).toBe(
+      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.\n\n' +
+        'Submit deletes it.',
     );
-    const deleted = await made.press(buttonId(question, 'Delete'));
+    const deleted = await made.submit(dialog.custom_id, {});
+    expect(deleted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(deleted.update).not.toHaveBeenCalled();
     expect(said(answerOf(deleted))).toBe('Deleted **Maple Leaf Mosaic** (#6).');
     expect(made.gymStore.row(6)).toBeUndefined();
   });
@@ -230,6 +235,7 @@ describe('the buttons of the view of /gym show', () => {
     if (raid.kind !== 'created') throw new Error('no raid');
     const view = await shown(made, 'id:6');
     const pressed = await made.press(buttonId(view, 'Delete…'));
+    expect(pressed.showModal).not.toHaveBeenCalled();
     expect(said(answerOf(pressed))).toMatch(/^A raid is at \*\*Maple Leaf Mosaic\*\* \(#6\)/);
     expect(made.gymStore.row(6)).toBeDefined();
   });
diff --git a/src/commands/gyms/view-controls.ts b/src/commands/gyms/view-controls.ts
index bacdf056..31f66747 100644
--- a/src/commands/gyms/view-controls.ts
+++ b/src/commands/gyms/view-controls.ts
@@ -12,28 +12,23 @@ import type { ComponentHandler, GuardableInteraction } from '../../discord/comma
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { requireBotManagement } from '../../discord/guards.js';
+import { readInTime } from '../../discord/dialog.js';
 import { showInPlace } from '../../discord/late-reply.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { tidyLine } from '../../domain/gyms/gym-text.js';
 import { isEliteGym } from '../../domain/party/raid.js';
 import { truncate } from '../../render/text.js';
-import { deleteQuestion } from './delete.js';
+import { DELETE_ACTION, deleteDialog, deleteGymNow } from './delete.js';
 import { openEditForm } from './edit.js';
 import { eliteLine } from './elite.js';
 import { moveGymTo } from './move.js';
-import {
-  answerGym,
-  gymViewMessage,
-  LOCATION_OPTION,
-  placeOrRefuse,
-  sayGym,
-  staffPlace,
-} from './shared.js';
+import { gymViewMessage, LOCATION_OPTION, placeOrRefuse, sayGym, staffPlace } from './shared.js';
 
 /**
  * The custom-id kind of the buttons of the view of `/gym show` (documented in `custom-id.ts`):
- * `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0`, and the form of Move…
- * `gymview:<gym id>:place`.
+ * `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0`, the form of Move…
+ * `gymview:<gym id>:place`, and the dialog of a deletion (of Delete… and of `/gym delete`)
+ * `gymview:<gym id>:delete`.
  * Nothing is kept in memory: the gym's number is in the custom id.
  */
 export const GYM_VIEW_KIND = 'gymview';
@@ -131,8 +126,9 @@ async function viewedGym(
  * Edit… opens the form of `/gym edit`, whose answer is a message of its own; Make elite / Not
  * elite changes the mark and shows the view anew in place, with what it did above it and the
  * buttons as they now are; Move… opens a form for the new place and answers, in a message of
- * its own, as `/gym move` does (the question, or the moved gym); Delete… answers with the
- * question of `/gym delete` in a message of its own. The view itself stays.
+ * its own, as `/gym move` does (the question, or the moved gym); Delete… opens the dialog of
+ * `/gym delete` (plan 8Q), whose Submit (`gymview:<gym id>:delete`) answers in a message of its
+ * own. The view itself stays.
  */
 export const gymViewControls: ComponentHandler = {
   kind: GYM_VIEW_KIND,
@@ -173,11 +169,12 @@ export const gymViewControls: ComponentHandler = {
         );
         return;
       }
-      case 'delete': {
-        const gym = await viewedGym(interaction, ctx, id.id);
-        // A message of its own; the view stays.
-        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
-        await answerGym(interaction, await deleteQuestion(ctx, interaction.user.id, gym));
+      case DELETE_ACTION: {
+        // The dialog of `/gym delete`, read in time; the view stays.
+        const dialog = await readInTime(ctx.log, interaction, async () =>
+          deleteDialog(ctx, await viewedGym(interaction, ctx, id.id)),
+        );
+        await interaction.showModal(dialog);
         return;
       }
       default:
@@ -186,6 +183,8 @@ export const gymViewControls: ComponentHandler = {
   },
 
   async modal(interaction, id, ctx) {
+    // The dialog of a deletion (`/gym delete`, Delete…): its Submit deletes.
+    if (id.action === DELETE_ACTION) return deleteGymNow(interaction, ctx, id.id);
     if (id.action !== 'place') throw new UserError(STALE_COMPONENT);
     const gym = await viewedGym(interaction, ctx, id.id);
     // Following a short link takes a moment; the answer is a message of its own.
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index e7e6bd48..6e5d422d 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -23,8 +23,7 @@
  * `gym:<token>:details` (opens the form) and `gym:<token>:cancel`; the form itself is
  * `gym:<token>:form`. The form of `/gym edit` is `gym:<token>:edit`. Under the refusal of
  * either form: `gym:<token>:reopen`, which opens the form again with what was typed. Under the question of
- * `/gym move`: `gym:<token>:move` and `gym:<token>:cancel`; under that of `/gym delete`:
- * `gym:<token>:delete` and `gym:<token>:cancel`. Under the preview of `/gym import`:
+ * `/gym move`: `gym:<token>:move` and `gym:<token>:cancel`. Under the preview of `/gym import`:
  * `gym:<token>:wayfarer-import` and `gym:<token>:wayfarer-cancel`, whose token is one of the
  * import's own pending requests (`pendingImports`, `src/commands/gyms/import.ts`). Under its
  * outcome: `gym:<token>:outside-ask` ("Delete N gyms outside the area…"), and under the private
@@ -34,8 +33,9 @@
  * The buttons of the view of `/gym show` have the kind `gymview` (`src/commands/gyms/view-controls.ts`),
  * and their id is the number of the gym: `gymview:<gym id>:edit` (opens the form of `/gym
  * edit`), `gymview:<gym id>:elite:1|0` (Make elite / Not elite: what it sets), `gymview:<gym id>:move` (opens the
- * form `gymview:<gym id>:place`) and `gymview:<gym id>:delete` (asks as `/gym delete`). Nothing
- * else is kept anywhere.
+ * form `gymview:<gym id>:place`) and `gymview:<gym id>:delete` (opens the dialog of `/gym
+ * delete`, plan 8Q, whose Submit is `gymview:<gym id>:delete` as well, from `/gym delete` too).
+ * Nothing else is kept anywhere.
  *
  * The buttons of `/gym review` have the kind `gymreview` (`src/components/gym-review.ts`), and
  * their id is the row id of an item of the review queue (`GymReview.id`), found again for the
````

### Task 5: Plan 8Q T5: /region remove asks in a dialog (8Q-5)

Prototype commit: `320ff8918493c9ac864c0dfdcf303986135fdcf6`

/region remove opens the dialog "Remove a region": what goes with the
region, counted and read within the slow-read budget, the text
channel's line, the forum's, and "Submit removes it.", channels named
(#west, a region of a deleted channel by its id), not mentioned. With a
forum the staff member may delete, the required radio group "Its forum"
with nothing picked: Keep it as history ("Its posts are archived and
locked.") or Delete it ("Deletes every post in it for good."). Without
Manage Channels, or in rehearsal mode, there is no choice and the line
says the forum stays and why; without a forum, today's line. The
command declares no defer.

The dialog carries the region's row id (region:<id>:remove, :keep
without the choice): the remove request of pendingRegions goes. Its
Submit is acknowledged privately and decides again as the press did:
deleting the forum is refused in rehearsal mode and to staff who lost
Manage Channels, nothing removed; otherwise today's outcome lines, with
mentions, in a message of its own. The "Removing the region..." line,
"The region was kept." and the question's buttons go; an old press
finds no request and says that it expired.

**Files:**

```
 docs/architecture/gyms-and-regions.md |   4 +-
 src/commands/regions/controls.ts      |  20 ++--
 src/commands/regions/remove.test.ts   | 307 ++++++++++++++++++++++++++++++++----------------------
 src/commands/regions/remove.ts        | 256 ++++++++++++++++++++++++++++-----------------
 src/commands/regions/shared.ts        |   4 +-
 src/discord/custom-id.ts              |   7 +-
 test/support/region-commands.ts       |  27 ++++-
 7 files changed, 386 insertions(+), 239 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/commands/regions/remove.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 320ff8918493c9ac864c0dfdcf303986135fdcf6 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8Q T5: /region remove asks in a dialog (8Q-5)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/gyms-and-regions.md
git add -- src/commands/regions/controls.ts
git add -- src/commands/regions/remove.test.ts
git add -- src/commands/regions/remove.ts
git add -- src/commands/regions/shared.ts
git add -- src/discord/custom-id.ts
git add -- test/support/region-commands.ts
```

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 90ce9d05..91dd31bc 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -34,7 +34,7 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 
 ## Regions
 
-- Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import; each in the very category the plan named, by its id while it is there), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; what Discord still refuses for want of room (a race, the server's 500) is said plainly: `CreatedChannel`'s `category-full` (with the category's name, `NotImported.category`) or `server-full` (`channelLimitOf`, `src/discord/party-gateway.ts`: the server's code, or Invalid Form Body with `CHANNEL_PARENT_MAX_CHANNELS`, no other refusal of the parent), and a forum refused so says which category is full (`setupForums`' reason); nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
+- Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import; each in the very category the plan named, by its id while it is there), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; what Discord still refuses for want of room (a race, the server's 500) is said plainly: `CreatedChannel`'s `category-full` (with the category's name, `NotImported.category`) or `server-full` (`channelLimitOf`, `src/discord/party-gateway.ts`: the server's code, or Invalid Form Body with `CHANNEL_PARENT_MAX_CHANNELS`, no other refusal of the parent), and a forum refused so says which category is full (`setupForums`' reason); nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `/region remove` asks in a dialog (plan 8Q, `removalDialog` in `src/commands/regions/remove.ts`; no `defer`): titled `Remove a region`, what goes with the region counted (`removalQuestion`, read within `DIALOG_READ_MS`), the text channel's line and the forum's, then `Submit removes it.`, channels named (`#west`, `regionInDialog` and `channelInDialog`), not mentioned. With a forum the staff member may delete, the required radio group `Its forum` (`FORUM_INPUT`) with nothing picked: Keep it as history (`Its posts are archived and locked.`) or Delete it (`Deletes every post in it for good.`); with one they may not delete (no Manage Channels, or rehearsal mode) no choice and the line that says it stays and why; without one, that line. Its custom id carries the region, `region:<region id>:remove` (`:keep` without the choice): no pending request. Its Submit (`submitRemoval`, a `modal` of `regionControls`) is acknowledged privately, refuses deleting the forum in rehearsal mode and to staff without Manage Channels (as the press did, nothing removed), and answers `outcomeLines` in a message of its own; Discord's Cancel replaces Cancel, and the buttons of the question before plan 8Q find no request and say that it expired. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
 - The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, and the server's regions, the regions of its channels and the channels the save depends on compared with those the save was planned against, `regionsStamp` and `channelsStamp` of `src/web/editor-save.ts`, another server's regions and the server's other channels left out (plan 8M-6); then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use; `'editor'` words a new channel's name as typed in the panel, "a typo in a name", where a file's preview says "a typo in the file") and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`: the escapes of `plain` undone by `unplain` outside the code spans of derived names, so a typed backslash shows once). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits), `fix.ts` and `fix-all.ts` (Fix and "Fix all slivers", plan 8M-2F, with `lines.ts`: lines measured flat in metres); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
 - KML is read by pure code: `src/domain/geo/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, the room of categories and of the server: plan 8S-4. Discord allows `MAX_CATEGORY_CHANNELS` (50, forums included) in a category and `MAX_SERVER_CHANNELS` (500) in a server, and every region written without a forum gets one beside its channel. The forums of channels that exist take their room first; where the category is full, a channel that is no region yet leaves its area out (`category-full`, the category named: a forum in another category would not have the channel's permissions, so staff move channels out and import again), and a region that is one already gets its outline, its forum `forumBlocked` (the preview says "keeps no forum", `newForums` leaves it out, and the forum step's refusal names the full category). A new channel whose category has no room for it and its forum goes into the overflow category `<name> 2` (then `3` …, the name cut to `MAX_CHANNEL_NAME`): one of that name, without case, that has room, else a new one the areas after it share, which continues the full one (`PlannedCategory` `{ create, like }`; an existing overflow category carries `like` too, so one deleted before Import is made again as the full one's continuation: `createCategory` makes it with that category's permission overwrites and moves it right after it; Discord refusing the overwrites is `copy-refused`, said with both names, where the bot may create channels at all (else `no-permission`), and a continued category deleted meanwhile is `base-gone`: none is made without its permissions; one such refusal stands for every later area of that category in the run, unasked); `ImportPlan.overflow` says which category had how much room before the import, how much of it its regions' new forums take, and where how many went, and the preview says it in one line. What would take the server beyond its channels (a new category counted too) is left out, `server-full`. Nothing is planned beyond what Discord allows, so there is no warning of a crowded category any more). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
-- `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the question and outcome of `/region remove` are `regionQuestion`s; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
+- `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the outcome of `/region remove` is a `regionQuestion`; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
diff --git a/src/commands/regions/controls.ts b/src/commands/regions/controls.ts
index 10275ac4..572f1c24 100644
--- a/src/commands/regions/controls.ts
+++ b/src/commands/regions/controls.ts
@@ -4,7 +4,7 @@ import { requireBotManagement } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { count } from '../../render/text.js';
 import { importAnswers } from './import.js';
-import { removeAnswers } from './remove.js';
+import { REMOVE_FORM, submitRemoval } from './remove.js';
 import {
   EXPIRED,
   markAnswered,
@@ -20,7 +20,6 @@ import {
 /** What a question says once it was answered with Cancel. */
 const CANCELLED: Readonly<Record<PendingRegion['what'], string>> = {
   import: 'Nothing was imported.',
-  remove: 'The region was kept.',
 };
 
 /**
@@ -28,16 +27,14 @@ const CANCELLED: Readonly<Record<PendingRegion['what'], string>> = {
  * import creates channels and forums): the buttons go at once, so that nobody presses again.
  */
 function working(request: PendingRegion): string {
-  return request.what === 'import'
-    ? `Importing ${count(request.imports.length, 'area')}… this message changes when it is done.`
-    : 'Removing the region… this message changes when it is done.';
+  return `Importing ${count(request.imports.length, 'area')}… this message changes when it is done.`;
 }
 
 /**
  * What the buttons of `/region` do, by what their request is about and their action
- * (`import:import`, `remove:keep`); each subcommand brings its own.
+ * (`import:import`); each subcommand brings its own.
  */
-const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...importAnswers, ...removeAnswers };
+const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...importAnswers };
 
 /**
  * The buttons of `/region` (custom-id kind `region`): each belongs to a pending request of the
@@ -48,7 +45,9 @@ const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...importAnswers, ...r
  * A question is answered once. A second press on it (a double click) is only acknowledged, so
  * that it does not write over the answer of the first; a press on a question that is older
  * than the bot remembers says that it has expired. The answer takes the place of the question,
- * also when it is a refusal: buttons that no longer do anything must not stay under it.
+ * also when it is a refusal: buttons that no longer do anything must not stay under it. The
+ * dialog of `/region remove` (plan 8Q) is no pending request: its Submit,
+ * `region:<region id>:remove[:keep]`, carries the region (`submitRemoval`).
  */
 export const regionControls: ComponentHandler = {
   kind: REGION_KIND,
@@ -78,4 +77,9 @@ export const regionControls: ComponentHandler = {
       await sayRegion(interaction, err.message);
     }
   },
+
+  async modal(interaction, id, ctx) {
+    if (id.action !== REMOVE_FORM) throw new UserError(STALE_COMPONENT);
+    await submitRemoval(interaction, ctx, id);
+  },
 };
diff --git a/src/commands/regions/remove.test.ts b/src/commands/regions/remove.test.ts
index 7dfdd906..04cd1174 100644
--- a/src/commands/regions/remove.test.ts
+++ b/src/commands/regions/remove.test.ts
@@ -1,15 +1,10 @@
 import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
-import { describe, expect, it } from 'vitest';
-import { sent } from '../../../test/support/fake-interactions.js';
-import { ANSWERED_BELOW } from '../../discord/late-reply.js';
-import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
-import {
-  EAST_CHANNEL,
-  EAST_FORUM,
-  UNBOUNDED_CHANNEL,
-  WEST_CHANNEL,
-  WEST_FORUM,
-} from '../../../test/support/gyms.js';
+import { describe, expect, it, vi } from 'vitest';
+import { dialogChoices, dialogText, shownDialog } from '../../../test/support/dialogs.js';
+import { sent, type FakeInteraction } from '../../../test/support/fake-interactions.js';
+import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
+import { answerOf, buttonsOf } from '../../../test/support/gym-commands.js';
+import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { ALICE, REPORTER } from '../../../test/support/parties.js';
 import {
   MEMBER,
@@ -18,7 +13,8 @@ import {
   regionSaid,
 } from '../../../test/support/region-commands.js';
 import { Rehearsal } from '../../services/rehearsal.js';
-import { REHEARSAL_CHANNELS } from './shared.js';
+import { FORUM_INPUT } from './remove.js';
+import { EXPIRED, REHEARSAL_CHANNELS } from './shared.js';
 import { PartyStatus } from '../../domain/party/status.js';
 
 type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
@@ -52,62 +48,124 @@ function missingPermissions(): DiscordAPIError {
   );
 }
 
-describe('/region remove: the question', () => {
-  it('says what the removal does, counted, and offers both ways with the forum', async () => {
+/** `/region remove` of `region`, and the dialog it opened. */
+async function asked(made: Made, region = 'id:1', extra: object = {}) {
+  const used = await made.use('remove', { region }, extra);
+  return { used, dialog: shownDialog(used) };
+}
+
+/** What a Submit was answered, after its private acknowledgement. */
+function outcome(submitted: FakeInteraction): string {
+  expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+  return regionSaid(answerOf(submitted));
+}
+
+const KEEP = { [FORUM_INPUT]: 'keep' };
+const DELETE = { [FORUM_INPUT]: 'delete' };
+
+describe('/region remove: the dialog', () => {
+  it('says what the removal does, counted, and asks what becomes of the forum', async () => {
     const made = await regionCommandsWith();
     await reported(made, 1);
     made.routes.add(ALICE, 1, 'Loop', [1, 2]);
     made.routes.add(ALICE, 1, 'Other', [3]);
-    const used = await made.use('remove', { region: 'id:1' });
-    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
-    const answer = answerOf(used);
-    // A components-v2 message, its buttons inside (plan 8B-4).
-    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
-    expect(regionSaid(answer).split('\n')).toEqual([
-      `Remove the region <#${WEST_CHANNEL}>? This cannot be undone.`,
+    const { used, dialog } = await asked(made);
+    expect(used.deferReply).not.toHaveBeenCalled();
+    expect(used.reply).not.toHaveBeenCalled();
+    expect(dialog.custom_id).toBe('region:1:remove');
+    expect(dialog.title).toBe('Remove a region');
+    // Channels are named in a dialog, never mentioned.
+    expect(dialogText(dialog).split('\n')).toEqual([
+      'Remove the region #west? This cannot be undone.',
       '- 1 active raid, train or meetup will be ended; its post says why',
       '- 8 gyms will lie in no region of this server: no raid can be reported there until a ' +
         'region covers them',
       '- 2 saved routes of members will go with it',
       'Its text channel stays as it is, and no gym is deleted.',
-      `Its forum <#${WEST_FORUM}> can stay as history (its posts are archived and locked), or ` +
-        'be deleted. **Deleting the forum deletes every post in it for good.**',
+      'Its forum #west-raids can stay as history or be deleted, as you pick below.',
+      '',
+      'Submit removes it.',
     ]);
-    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
-      'Remove, keep the forum',
-      'Remove and delete the forum',
-      'Cancel',
+    expect(dialogChoices(dialog)).toEqual([
+      {
+        value: 'keep',
+        label: 'Keep it as history',
+        description: 'Its posts are archived and locked.',
+        picked: false,
+      },
+      {
+        value: 'delete',
+        label: 'Delete it',
+        description: 'Deletes every post in it for good.',
+        picked: false,
+      },
     ]);
     // Nothing has happened yet.
     expect(made.regions.byId(1)).toBeDefined();
     expect(made.store.inRegion(1)).toHaveLength(1);
   });
 
-  it('offers only to remove where there is no forum to keep or delete', async () => {
+  it('asks nothing about a forum where there is none to keep or delete', async () => {
     const made = await regionCommandsWith();
-    const used = await made.use('remove', { region: 'unbounded' });
-    const answer = answerOf(used);
-    expect(regionSaid(answer).split('\n')).toEqual([
-      `Remove the region <#${UNBOUNDED_CHANNEL}>? This cannot be undone.`,
+    const { dialog } = await asked(made, 'unbounded');
+    expect(dialog.custom_id).toBe('region:3:remove:keep');
+    expect(dialogChoices(dialog)).toEqual([]);
+    expect(dialogText(dialog).split('\n')).toEqual([
+      'Remove the region #unbounded? This cannot be undone.',
       'Nothing goes with it.',
       'Its text channel stays as it is, and no gym is deleted.',
       'It has no forum.',
+      '',
+      'Submit removes it.',
     ]);
-    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Remove', 'Cancel']);
     made.gateway.gone.add(EAST_FORUM);
     made.gateway.gone.add(EAST_CHANNEL);
-    const east = answerOf(await made.use('remove', { region: 'id:2' }));
-    expect(regionSaid(east)).toContain(`Remove the region of the deleted channel ${EAST_CHANNEL}?`);
-    expect(regionSaid(east)).toContain('Its forum is gone already.');
-    expect(regionSaid(east)).not.toContain('text channel stays');
+    const east = dialogText((await asked(made, 'id:2')).dialog);
+    expect(east).toContain(`Remove the region of the deleted channel ${EAST_CHANNEL}?`);
+    expect(east).toContain('Its forum is gone already.');
+    expect(east).not.toContain('text channel stays');
   });
 
-  it('refuses a region of another server, or none', async () => {
+  it('refuses a region of another server, or none, without a dialog', async () => {
     const made = await regionCommandsWith();
     for (const typed of ['id:99', 'nowhere']) {
       const used = await made.use('remove', { region: typed });
-      expect(regionSaid(answerOf(used))).toContain('is no region of this server');
+      expect(used.showModal).not.toHaveBeenCalled();
+      expect(regionSaid(sent(used.reply))).toContain('is no region of this server');
+    }
+  });
+
+  it('opens no dialog when what goes with the region takes too long to read', async () => {
+    const made = await regionCommandsWith();
+    let arrive: () => void = () => undefined;
+    const reading = new Promise<void>((resolve) => {
+      arrive = resolve;
+    });
+    vi.spyOn(made.regionAdmin, 'removalQuestion').mockImplementation(() => {
+      arrive();
+      return new Promise(() => undefined);
+    });
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const using = made.use('remove', { region: 'id:1' });
+      await reading;
+      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
+      const used = await using;
+      expect(used.showModal).not.toHaveBeenCalled();
+      expect(sent(used.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
+    } finally {
+      vi.useRealTimers();
     }
+    expect(made.regions.byId(1)).toBeDefined();
+  });
+
+  it('gives the buttons of the question it asked before no answer but that it expired', async () => {
+    const made = await regionCommandsWith();
+    for (const action of ['keep', 'delete', 'cancel']) {
+      const pressed = await made.press(`region:0123456789abcdef:${action}`);
+      expect(regionSaid(answerOf(pressed))).toBe(EXPIRED);
+    }
+    expect(made.regions.byId(1)).toBeDefined();
   });
 });
 
@@ -116,15 +174,14 @@ describe('/region remove: the answers', () => {
     const made = await regionCommandsWith();
     await reported(made, 1);
     await reported(made, 2);
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const { dialog } = await asked(made);
     // The raid that is ended second cannot be ended: its row is gone from under it. (Both were
     // made in the same millisecond, so which is second is the store's order, by id.)
     const [, second] = made.store.inRegion(1);
     if (!second) throw new Error('no second raid');
     const post = second.forumPostId ?? '';
     made.storage.rows.delete(second.id);
-    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
-    expect(regionSaid(answerOf(pressed))).toBe(
+    expect(outcome(await made.submit(dialog, KEEP))).toBe(
       `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
         'log says what failed.\n1 of its raids, trains and meetups was ended already.',
     );
@@ -132,10 +189,9 @@ describe('/region remove: the answers', () => {
 
   it('says when the regions could not be loaded again', async () => {
     const made = await regionCommandsWith();
-    const question = answerOf(await made.use('remove', { region: 'id:3' }));
+    const { dialog } = await asked(made, 'id:3');
     made.directory.load = () => Promise.reject(new Error('connection lost'));
-    const pressed = await made.press(buttonId(question, 'Remove'));
-    expect(regionSaid(answerOf(pressed))).toContain(
+    expect(outcome(await made.submit(dialog))).toContain(
       'The region is removed, but I could not load the regions again: members see the change ' +
         'after the next restart.',
     );
@@ -148,32 +204,30 @@ describe('/region remove: the answers', () => {
       const removed = await remove(id, guildId);
       return removed.removed ? { ...removed, forumChannelId: EAST_FORUM } : removed;
     };
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
-    expect(regionSaid(answerOf(pressed))).toContain(`Its forum <#${EAST_FORUM}> stays as history.`);
+    const { dialog } = await asked(made);
+    expect(outcome(await made.submit(dialog, KEEP))).toContain(
+      `Its forum <#${EAST_FORUM}> stays as history.`,
+    );
     // A row without a forum names none, whatever memory said.
     const other = await regionCommandsWith();
     other.regions.remove = async (id, guildId) => {
       const removed = await remove.call(other.regions, id, guildId);
       return removed.removed ? { ...removed, forumChannelId: null } : removed;
     };
-    const asked = answerOf(await other.use('remove', { region: 'id:1' }));
-    const done = answerOf(await other.press(buttonId(asked, 'Remove, keep the forum')));
-    expect(regionSaid(done)).not.toContain('<#>');
-    expect(regionSaid(done)).not.toContain('Its forum');
+    const done = outcome(await other.submit((await asked(other)).dialog, KEEP));
+    expect(done).not.toContain('<#>');
+    expect(done).not.toContain('Its forum');
   });
 
   it('removes the region and keeps the forum as history', async () => {
     const made = await regionCommandsWith();
     const post = await reported(made, 1);
     made.routes.add(ALICE, 1, 'Loop', [1, 2]);
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    const { dialog } = await asked(made);
+    const submitted = await made.submit(dialog, KEEP);
     await made.settle();
-    expect(regionSaid(sent(pressed.update))).toBe(
-      'Removing the region… this message changes when it is done.',
-    );
-    expect(regionSaid(answerOf(pressed)).split('\n')).toEqual([
+    // The answers after Submit keep their mentions.
+    expect(outcome(submitted).split('\n')).toEqual([
       `Removed the region <#${WEST_CHANNEL}>.`,
       '- 1 active raid, train or meetup was ended; its post says why',
       '- 8 gyms now lie in no region of this server: no raid can be reported there until a ' +
@@ -183,20 +237,19 @@ describe('/region remove: the answers', () => {
       'If members gave themselves a role for this region, take it off the list with ' +
         '`/admin self-roles remove`.',
     ]);
-    expect(buttonsOf(answerOf(pressed))).toEqual([]);
+    expect(buttonsOf(answerOf(submitted))).toEqual([]);
     expect(made.regions.byId(1)).toBeUndefined();
     expect(made.gateway.posts.get(post)).toMatchObject({ archived: true, locked: true });
     expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
     // The channel is no region now: a member asking there is told so.
-    const asked = await made.run('bounds', { userId: MEMBER, roleNames: [] });
-    expect(regionSaid(answerOf(asked))).toContain('This channel is not a region.');
+    const used = await made.run('bounds', { userId: MEMBER, roleNames: [] });
+    expect(regionSaid(answerOf(used))).toContain('This channel is not a region.');
   });
 
-  it('removes the region and deletes its forum when asked', async () => {
+  it('removes the region and deletes its forum when that was picked', async () => {
     const made = await regionCommandsWith();
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
-    expect(regionSaid(answerOf(pressed))).toContain(
+    const { dialog } = await asked(made);
+    expect(outcome(await made.submit(dialog, DELETE))).toContain(
       'Its forum was deleted, with every post in it.',
     );
     expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
@@ -205,9 +258,8 @@ describe('/region remove: the answers', () => {
   it('says when the forum could not be deleted, and that the region is gone all the same', async () => {
     const made = await regionCommandsWith();
     made.gateway.failing.set('deleteChannel', missingPermissions());
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
-    expect(regionSaid(answerOf(pressed))).toContain(
+    const { dialog } = await asked(made);
+    expect(outcome(await made.submit(dialog, DELETE))).toContain(
       `I could not delete its forum <#${WEST_FORUM}> (I need Manage Channels there): delete it ` +
         'by hand. The region is gone all the same.',
     );
@@ -217,11 +269,11 @@ describe('/region remove: the answers', () => {
   it('says that nothing was removed when a party could not be ended', async () => {
     const made = await regionCommandsWith();
     const post = await reported(made, 1);
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const { dialog } = await asked(made);
     made.storage.failing = new Error('connection lost');
-    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    const submitted = await made.submit(dialog, KEEP);
     made.storage.failing = undefined;
-    expect(regionSaid(answerOf(pressed))).toBe(
+    expect(outcome(submitted)).toBe(
       `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
         'log says what failed.',
     );
@@ -231,92 +283,86 @@ describe('/region remove: the answers', () => {
   it('says that the region is still there when its row could not be deleted', async () => {
     const made = await regionCommandsWith();
     await reported(made, 1);
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const { dialog } = await asked(made);
     made.regions.failing = new Error('connection lost');
-    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    const submitted = await made.submit(dialog, KEEP);
     made.regions.failing = undefined;
-    expect(regionSaid(answerOf(pressed)).split('\n')).toEqual([
+    expect(outcome(submitted).split('\n')).toEqual([
       'I could not remove the region, and it is still there (the log says what failed). Try ' +
         'again in a moment.',
       '1 of its raids, trains and meetups was ended before that.',
     ]);
   });
 
-  it('says that the region is gone when somebody removed it in between', async () => {
-    const made = await regionCommandsWith();
-    const first = answerOf(await made.use('remove', { region: 'id:3' }));
-    const second = answerOf(await made.use('remove', { region: 'id:3' }));
-    await made.press(buttonId(first, 'Remove'));
-    const late = await made.press(buttonId(second, 'Remove'));
-    expect(regionSaid(answerOf(late))).toBe('That region no longer exists.');
-  });
-
-  it('keeps the region on Cancel', async () => {
+  it('says that the region is gone when somebody removed it in between, or on a second Submit', async () => {
     const made = await regionCommandsWith();
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    const pressed = await made.press(buttonId(question, 'Cancel'));
-    expect(regionSaid(sent(pressed.update))).toBe('The region was kept.');
-    expect(made.regions.byId(1)).toBeDefined();
+    const first = await asked(made, 'id:3');
+    const second = await asked(made, 'id:3');
+    await made.submit(first.dialog);
+    expect(outcome(await made.submit(second.dialog))).toBe('That region no longer exists.');
+    expect(outcome(await made.submit(first.dialog))).toBe('That region no longer exists.');
   });
 
-  it('ends a party that was made between the question and the press', async () => {
+  it('ends a party that was made between the dialog and its Submit', async () => {
     const made = await regionCommandsWith();
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const { dialog } = await asked(made);
     const post = await reported(made, 2);
-    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
-    expect(regionSaid(answerOf(pressed))).toContain(
+    expect(outcome(await made.submit(dialog, KEEP))).toContain(
       '- 1 active raid, train or meetup was ended; its post says why',
     );
     expect(made.gateway.posts.get(post)?.archived).toBe(true);
   });
 });
 
-describe('/region remove: a question from before plan 8B-4', () => {
-  it('removes on a plain-text question and shows the outcome below it', async () => {
-    for (const label of ['Remove, keep the forum', 'Remove and delete the forum']) {
-      const made = await regionCommandsWith();
-      const question = answerOf(await made.use('remove', { region: 'id:1' }));
-      const pressed = await made.press(buttonId(question, label), { v2Message: false });
-      // Working, then the line that the answer follows below, in plain text.
-      expect(sent(pressed.update).content).toBe(
-        'Removing the region… this message changes when it is done.',
-      );
-      expect(sent(pressed.editReply)).toMatchObject({ content: ANSWERED_BELOW, components: [] });
-      expect(regionSaid(sent(pressed.followUp))).toMatch(/^Removed the region/u);
-      expect(made.regions.byChannel(WEST_CHANNEL)).toBeUndefined();
-    }
-  });
-});
-
-describe('/region remove: staff without Manage Channels', () => {
+describe('/region remove: staff without Manage Channels, and rehearsal mode', () => {
   /** A moderator whose roles do not let them manage channels. */
   const LACKING = { permissions: 0n };
 
-  it('offers only to keep the forum, and says why', async () => {
+  it('offers no choice for the forum, says why, and keeps it on Submit', async () => {
     const made = await regionCommandsWith();
-    const answer = answerOf(await made.use('remove', { region: 'id:1' }, LACKING));
-    expect(regionSaid(answer)).toContain(
-      `Its forum <#${WEST_FORUM}> stays as history (its posts are archived and locked): ` +
-        'deleting it takes the Manage Channels permission, which you lack.',
+    const { dialog } = await asked(made, 'id:1', LACKING);
+    expect(dialog.custom_id).toBe('region:1:remove:keep');
+    expect(dialogChoices(dialog)).toEqual([]);
+    expect(dialogText(dialog)).toContain(
+      'Its forum #west-raids stays as history (its posts are archived and locked): deleting it ' +
+        'takes the Manage Channels permission, which you lack.',
+    );
+    expect(outcome(await made.submit(dialog, {}, LACKING))).toContain(
+      `Its forum <#${WEST_FORUM}> stays as history.`,
     );
-    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Remove, keep the forum', 'Cancel']);
+    expect(made.gateway.deletedChannels).toEqual([]);
   });
 
-  it('refuses in rehearsal mode to delete the forum, and removes nothing', async () => {
+  it('offers no choice for the forum in rehearsal mode, and says why', async () => {
     const rehearsal = new Rehearsal({ allowlist: [MODERATOR], regions: ['west'], staffRoles: [] });
     const made = await regionCommandsWith([], { rehearsal });
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
-    expect(regionSaid(answerOf(pressed))).toBe(REHEARSAL_CHANNELS);
+    const { dialog } = await asked(made);
+    expect(dialog.custom_id).toBe('region:1:remove:keep');
+    expect(dialogText(dialog)).toContain(
+      'Its forum #west-raids stays as history (its posts are archived and locked): rehearsal mode ' +
+        'is on, and I delete no channel now.',
+    );
+    expect(made.regions.byId(1)).toBeDefined();
+  });
+
+  it('refuses in rehearsal mode to delete the forum, and removes nothing', async () => {
+    const made = await regionCommandsWith();
+    const { dialog } = await asked(made);
+    // Rehearsal mode came on after the dialog opened.
+    Object.assign(made.ctx, {
+      rehearsal: new Rehearsal({ allowlist: [MODERATOR], regions: ['west'], staffRoles: [] }),
+    });
+    const submitted = await made.submit(dialog, DELETE);
+    expect(sent(submitted.followUp).content).toBe(REHEARSAL_CHANNELS);
     expect(made.regions.byId(1)).toBeDefined();
     expect(made.gateway.deletedChannels).toEqual([]);
   });
 
-  it('refuses to delete the forum for them, whatever button they send', async () => {
+  it('refuses to delete the forum for one who lost Manage Channels since the dialog opened', async () => {
     const made = await regionCommandsWith();
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    const pressed = await made.press(buttonId(question, 'Remove and delete the forum'), LACKING);
-    expect(regionSaid(answerOf(pressed))).toBe(
+    const { dialog } = await asked(made);
+    const submitted = await made.submit(dialog, DELETE, LACKING);
+    expect(sent(submitted.followUp).content).toBe(
       'Deleting the forum of a region takes the Manage Channels permission, which you lack. ' +
         'Nothing was removed.',
     );
@@ -326,11 +372,20 @@ describe('/region remove: staff without Manage Channels', () => {
 
   it('says who deleted the forum in the audit log of the server', async () => {
     const made = await regionCommandsWith();
-    const question = answerOf(await made.use('remove', { region: 'id:1' }));
-    await made.press(buttonId(question, 'Remove and delete the forum'));
+    await made.submit((await asked(made)).dialog, DELETE);
     expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
     expect(made.gateway.auditReasons.get(WEST_FORUM)).toBe(
       `/region remove by ${made.staff.userId ?? ''}`,
     );
   });
+
+  it('lets only staff submit', async () => {
+    const made = await regionCommandsWith();
+    const { dialog } = await asked(made, 'id:3');
+    const member = await made.submit(dialog, {}, { userId: MEMBER, roleNames: [] });
+    expect(regionSaid(sent(member.reply))).toBe(
+      'Only admins, moderators and bot developers can do that.',
+    );
+    expect(made.regions.byId(3)).toBeDefined();
+  });
 });
diff --git a/src/commands/regions/remove.ts b/src/commands/regions/remove.ts
index 1b136bc4..7f86e4ae 100644
--- a/src/commands/regions/remove.ts
+++ b/src/commands/regions/remove.ts
@@ -1,22 +1,37 @@
-import { ButtonStyle, SlashCommandSubcommandBuilder } from 'discord.js';
+import {
+  SlashCommandSubcommandBuilder,
+  type APIModalInteractionResponseCallbackData,
+  type ChatInputCommandInteraction,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Region } from '../../db/repositories/region-repository.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
+import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
+import {
+  channelInDialog,
+  deferSubmit,
+  dialog,
+  pickedOf,
+  readInTime,
+} from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
+import { answerApart } from '../../discord/late-reply.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
 import { partyWord } from '../../domain/party/party.js';
+import type { ServerChannel } from '../../domain/regions/region-import.js';
 import { count } from '../../render/text.js';
 import type { RemovalOutcome } from '../../services/region-admin-service.js';
 import { chosenRegion, respondWithRegions, withRegionOption } from './region-option.js';
 import {
-  answerRegion,
-  button,
   content,
-  pendingRegions,
   regionQuestion,
   REGION_GONE,
+  REGION_KIND,
   REHEARSAL_CHANNELS,
   regionInSentence,
   regionStaff,
   selfRoleReminder,
-  type ButtonAnswer,
 } from './shared.js';
 
 const parties = (n: number): string =>
@@ -59,10 +74,103 @@ export function goesWith(
   ];
 }
 
+/** The action of the dialog of `/region remove`: `region:<region id>:remove[:keep]`. */
+export const REMOVE_FORM = 'remove';
+
+/** The custom id of the radio group of that dialog: `keep` or `delete` the forum. */
+export const FORUM_INPUT = 'forum';
+
+/** A region as a dialog names it: `the region #west`, or of the deleted channel `1234`. */
+function regionInDialog(region: Region, channels: readonly ServerChannel[]): string {
+  const channel = channels.find((one) => one.id === region.channelId);
+  return channel
+    ? `the region ${channelInDialog(channel.name)}`
+    : `the region of the deleted channel ${region.channelId}`;
+}
+
+/**
+ * The dialog of `/region remove` (plan 8Q), titled `Remove a region`: what goes with the region,
+ * counted, the text channel's line, and the forum's: with a forum the staff member may delete,
+ * the required radio group `Its forum` with nothing picked (Keep it as history, Delete it); with
+ * one they may not (no Manage Channels, or rehearsal mode), no choice and the line that says it
+ * stays and why; without one, that line; then `Submit removes it.`. Channels are named, not
+ * mentioned (`channelInDialog`). Its custom id is `region:<region id>:remove`, or
+ * `region:<region id>:remove:keep` where only keeping is possible: nothing is kept in memory.
+ */
+async function removalDialog(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Promise<APIModalInteractionResponseCallbackData> {
+  const staff = await regionStaff(interaction, ctx);
+  const region = chosenRegion(interaction, ctx, staff);
+  const question = region && (await ctx.regionAdmin.removalQuestion(region.id, staff));
+  if (!question) throw new UserError(REGION_GONE);
+  const channels = ctx.regionAdmin.channelsOf(staff);
+  const going = goesWith(question, 'will');
+  const forumId = question.region.forumChannelId;
+  const hasForum = question.forum === 'there' && forumId !== null;
+  const forum = channelInDialog(channels.find((one) => one.id === forumId)?.name);
+  // Deleting a channel through the bot takes what deleting it by hand takes; in rehearsal mode
+  // the bot deletes no channel at all.
+  const mayDelete = hasForum && staff.mayManageChannels && !ctx.rehearsal;
+  const stays = `Its forum ${forum} stays as history (its posts are archived and locked): `;
+  const forumLine = mayDelete
+    ? `Its forum ${forum} can stay as history or be deleted, as you pick below.`
+    : hasForum
+      ? stays +
+        (staff.mayManageChannels
+          ? 'rehearsal mode is on, and I delete no channel now.'
+          : 'deleting it takes the Manage Channels permission, which you lack.')
+      : question.forum === 'gone'
+        ? 'Its forum is gone already.'
+        : 'It has no forum.';
+  const id = String(question.region.id);
+  return dialog({
+    customId: encodeCustomId({
+      kind: REGION_KIND,
+      id,
+      action: REMOVE_FORM,
+      args: mayDelete ? [] : ['keep'],
+    }),
+    title: 'Remove a region',
+    text: [
+      `Remove ${regionInDialog(question.region, channels)}? This cannot be undone.`,
+      ...(going.length === 0 ? ['Nothing goes with it.'] : going),
+      question.channel === 'there'
+        ? 'Its text channel stays as it is, and no gym is deleted.'
+        : 'No gym is deleted.',
+      forumLine,
+      '',
+      'Submit removes it.',
+    ].join('\n'),
+    ...(mayDelete
+      ? {
+          choice: {
+            id: FORUM_INPUT,
+            label: 'Its forum',
+            options: [
+              {
+                value: 'keep',
+                label: 'Keep it as history',
+                description: 'Its posts are archived and locked.',
+              },
+              {
+                value: 'delete',
+                label: 'Delete it',
+                description: 'Deletes every post in it for good.',
+              },
+            ],
+          },
+        }
+      : {}),
+  });
+}
+
 /**
  * `/region remove`: takes a region off the server, explicitly (a region is never removed by
- * itself). The staff member is asked first, with what the removal does, counted, and what
- * becomes of the region's forum is theirs to choose.
+ * itself). The staff member is asked first in a dialog (`removalDialog`), with what the removal
+ * does, counted (read within `DIALOG_READ_MS`), and what becomes of the region's forum is theirs
+ * to choose. The dialog is the first answer: no `defer`.
  */
 export const removeRegion: SubcommandPart = {
   data: withRegionOption(
@@ -74,69 +182,19 @@ export const removeRegion: SubcommandPart = {
   ),
   help: {
     details:
-      'For a region that is given up, or whose channel was deleted. I ask first and say what ' +
-      'goes with it: its active raids, trains and meetups are ended (their posts say why), ' +
-      'the routes members saved for it are deleted, and its gyms lie in no region of this ' +
-      'server afterwards (they are never deleted). Its text channel is not touched. You ' +
+      'For a region that is given up, or whose channel was deleted. I ask first, in a dialog, ' +
+      'and say what goes with it: its active raids, trains and meetups are ended (their posts ' +
+      'say why), the routes members saved for it are deleted, and its gyms lie in no region of ' +
+      'this server afterwards (they are never deleted). Its text channel is not touched. You ' +
       'choose what becomes of its forum: it can stay as history, with its posts archived and ' +
       'locked, or be deleted with every post in it (if you may manage channels). A region is ' +
       'never removed by itself, also not when its channel is gone: `/region list` shows ' +
       'such a region as a deleted channel, and it can be picked here.',
     examples: ['/region remove region:#north-hills'],
   },
-  defer: 'ephemeral',
   async execute(interaction, ctx) {
-    const staff = await regionStaff(interaction, ctx);
-    const region = chosenRegion(interaction, ctx, staff);
-    const question = region && (await ctx.regionAdmin.removalQuestion(region.id, staff));
-    if (!question) throw new UserError(REGION_GONE);
-    const channels = ctx.regionAdmin.channelsOf(staff);
-    const label = regionInSentence(question.region, channels);
-    const going = goesWith(question, 'will');
-    const forumId = question.region.forumChannelId;
-    const token = pendingRegions.put(interaction.user.id, {
-      what: 'remove',
-      regionId: question.region.id,
-    });
-    const hasForum = question.forum === 'there' && forumId !== null;
-    // Deleting a channel through the bot takes what deleting it by hand takes.
-    const mayDelete = hasForum && staff.mayManageChannels;
-    await answerRegion(
-      interaction,
-      regionQuestion(
-        [
-          content([
-            `Remove ${label}? This cannot be undone.`,
-            ...(going.length === 0 ? ['Nothing goes with it.'] : going),
-            question.channel === 'there'
-              ? 'Its text channel stays as it is, and no gym is deleted.'
-              : 'No gym is deleted.',
-            ...(mayDelete
-              ? [
-                  `Its forum <#${forumId}> can stay as history (its posts are archived and ` +
-                    'locked), or be deleted. **Deleting the forum deletes every post in it for ' +
-                    'good.**',
-                ]
-              : hasForum
-                ? [
-                    `Its forum <#${forumId}> stays as history (its posts are archived and locked): ` +
-                      'deleting it takes the Manage Channels permission, which you lack.',
-                  ]
-                : [question.forum === 'gone' ? 'Its forum is gone already.' : 'It has no forum.']),
-          ]),
-        ],
-        [
-          ...(hasForum
-            ? [
-                button(token, 'keep', 'Remove, keep the forum', ButtonStyle.Danger),
-                ...(mayDelete
-                  ? [button(token, 'delete', 'Remove and delete the forum', ButtonStyle.Danger)]
-                  : []),
-              ]
-            : [button(token, 'keep', 'Remove', ButtonStyle.Danger)]),
-          button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
-        ],
-      ),
+    await interaction.showModal(
+      await readInTime(ctx.log, interaction, () => removalDialog(interaction, ctx)),
     );
   },
   autocomplete: respondWithRegions,
@@ -193,36 +251,44 @@ export function outcomeLines(
 }
 
 /**
- * A button under the question was pressed. Everything is decided again now (the question may
- * be minutes old), by the service, and what the answer counts is what really went; the answer
- * takes the place of the question.
+ * The Submit of the dialog of `/region remove` (`region:<region id>:remove[:keep]`): acknowledged
+ * privately, then everything is decided again now (the dialog may be minutes old), by the
+ * service, and what the answer counts is what really went. Deleting the forum is refused in
+ * rehearsal mode and to a staff member without Manage Channels (lost since the dialog opened),
+ * and nothing is removed then. The answer is a private message of its own.
  */
-const removal =
-  (forum: 'keep' | 'delete'): ButtonAnswer =>
-  async (interaction, ctx, request) => {
-    if (request.what !== 'remove') return;
-    if (forum === 'delete' && ctx.rehearsal) throw new UserError(REHEARSAL_CHANNELS);
-    const staff = await regionStaff(interaction, ctx);
-    if (forum === 'delete' && !staff.mayManageChannels) {
-      throw new UserError(
-        'Deleting the forum of a region takes the Manage Channels permission, which you lack. ' +
-          'Nothing was removed.',
-      );
-    }
-    const before = ctx.regionAdmin.regionOf(request.regionId, staff.guildId);
-    // Named by what the server has before the removal: the channel does not go with it.
-    const label = before
-      ? regionInSentence(before, ctx.regionAdmin.channelsOf(staff))
-      : 'that region';
-    const outcome = await ctx.regionAdmin.remove(request.regionId, staff, forum);
-    const lines =
-      outcome.kind === 'gone'
-        ? [REGION_GONE]
-        : outcomeLines(outcome, label, selfRoleReminder(ctx, 'removed'));
-    await answerRegion(interaction, regionQuestion([content(lines)]));
-  };
-
-export const removeAnswers: Readonly<Record<string, ButtonAnswer>> = {
-  'remove:keep': removal('keep'),
-  'remove:delete': removal('delete'),
-};
+export async function submitRemoval(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  id: CustomId,
+): Promise<void> {
+  const regionId = /^\d{1,9}$/.test(id.id) ? Number(id.id) : undefined;
+  const [fixed] = id.args;
+  const forum =
+    fixed === undefined
+      ? pickedOf(interaction, FORUM_INPUT, ['keep', 'delete'] as const)
+      : fixed === 'keep'
+        ? 'keep'
+        : undefined;
+  if (regionId === undefined || forum === undefined) throw new UserError(STALE_COMPONENT);
+  await deferSubmit(interaction);
+  if (forum === 'delete' && ctx.rehearsal) throw new UserError(REHEARSAL_CHANNELS);
+  const staff = await regionStaff(interaction, ctx);
+  if (forum === 'delete' && !staff.mayManageChannels) {
+    throw new UserError(
+      'Deleting the forum of a region takes the Manage Channels permission, which you lack. ' +
+        'Nothing was removed.',
+    );
+  }
+  const before = ctx.regionAdmin.regionOf(regionId, staff.guildId);
+  // Named by what the server has before the removal: the channel does not go with it.
+  const label = before
+    ? regionInSentence(before, ctx.regionAdmin.channelsOf(staff))
+    : 'that region';
+  const outcome = await ctx.regionAdmin.remove(regionId, staff, forum);
+  const lines =
+    outcome.kind === 'gone'
+      ? [REGION_GONE]
+      : outcomeLines(outcome, label, selfRoleReminder(ctx, 'removed'));
+  await answerApart(interaction, regionQuestion([content(lines)]));
+}
diff --git a/src/commands/regions/shared.ts b/src/commands/regions/shared.ts
index ca533737..4c3df23d 100644
--- a/src/commands/regions/shared.ts
+++ b/src/commands/regions/shared.ts
@@ -60,9 +60,7 @@ export function sayRegion(interaction: Press, text: string): Promise<void> {
 /** What a question of `/region` waits with until the staff member answers. */
 export type PendingRegion =
   /** `/region import`: what the preview said would be imported, as it was planned. */
-  | { what: 'import'; imports: readonly PlannedImport[] }
-  /** `/region remove`: the region. */
-  | { what: 'remove'; regionId: number };
+  { what: 'import'; imports: readonly PlannedImport[] };
 
 /**
  * How long a question of `/region` can be answered. A preview is looked through before it is
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 6e5d422d..e22e9a25 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -48,9 +48,10 @@
  *
  * The controls of `/region` have the kind `region` (`src/commands/regions/controls.ts`), with
  * the token of a pending request as the id, as for `/gym`. Under the preview of `/region
- * import`: `region:<token>:import` and `region:<token>:cancel`; under the question of `/region
- * remove`: `region:<token>:keep` (remove, keep the forum), `region:<token>:delete` (remove and
- * delete the forum) and `region:<token>:cancel`.
+ * import`: `region:<token>:import` and `region:<token>:cancel`. The dialog of `/region remove`
+ * (plan 8Q) carries the region's row id instead of a token: `region:<region id>:remove`, its
+ * radio group `forum` (`keep` or `delete`), or `region:<region id>:remove:keep` where the forum
+ * can only be kept.
  *
  * The buttons under the list of `/admin cleanup-legacy` have the kind `cleanup`
  * (`src/commands/admin/cleanup-legacy.ts`), with the token of the pending list as the id:
diff --git a/test/support/region-commands.ts b/test/support/region-commands.ts
index 2c053525..0793e486 100644
--- a/test/support/region-commands.ts
+++ b/test/support/region-commands.ts
@@ -1,4 +1,9 @@
-import { ComponentType, MessageFlags, PermissionFlagsBits } from 'discord.js';
+import {
+  ComponentType,
+  MessageFlags,
+  PermissionFlagsBits,
+  type APIModalInteractionResponseCallbackData,
+} from 'discord.js';
 import { admin } from '../../src/commands/admin/index.js';
 import { bounds } from '../../src/commands/regions/bounds.js';
 import { regionControls } from '../../src/commands/regions/controls.js';
@@ -12,6 +17,7 @@ import {
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeModal,
   type FakeInteraction,
   type FakeOptions,
   type SentPayload,
@@ -86,7 +92,8 @@ export function attachedText(payload: { files?: readonly unknown[] }, name: stri
  * `/region`, `/bounds` and `/admin` over the fakes of `regionAdminWith`, routed like in the
  * bot, used by a moderator in the channel of West unless a call says otherwise. `use` runs a
  * subcommand of `/region`, `typing` asks for the list of its `region` option, `press` presses
- * a button; each goes through the router and answers the fake interaction to read back.
+ * a button, `submit` sends a dialog the bot showed; each goes through the router and answers the
+ * fake interaction to read back.
  * `file` puts a file where an attachment option finds it (`attachments`).
  */
 export async function regionCommandsWith(
@@ -171,6 +178,22 @@ export async function regionCommandsWith(
     // the message is one from before (`v2Message: false`).
     press: (customId: string, extra: FakeOptions = {}) =>
       handled(fakeButton({ customId, ...staff, v2Message: true, ...extra })),
+    /** Submits a dialog the bot showed (`/region remove`'s), with these choices picked. */
+    submit: (
+      dialog: APIModalInteractionResponseCallbackData,
+      picked: Record<string, string> = {},
+      extra: FakeOptions = {},
+    ) =>
+      handled(
+        fakeModal({
+          customId: dialog.custom_id,
+          form: dialog,
+          picked,
+          ...staff,
+          modalFromCommand: true,
+          ...extra,
+        }),
+      ),
     /** Lets everything that is under way go out. */
     settle: async () => {
       await made.trains.flush();
````

### Task 6: Plan 8Q T6: /location asks in a dialog before a move to another region (8Q-6)

Prototype commit: `f8afc8ea7d387102c34618904bde092677ed2cd3`

A gym of another region opens the dialog "Move the raid to another
region": today's question with the region's channel named (#east, not
mentioned inside a dialog) and "Submit moves it.". The refusals before
asking stay private replies, and a move within the region asks nothing,
as before.

The dialog carries the party, the gym and when the router counted the
use of /location that opened it (location:<party>:move:<gym>:<counted
at>): the pending request goes. Its Submit, with the limit of every
change of a raid as the press had, is acknowledged privately and moves
the raid as the service decides then, the answer (This raid is now at
... Its new post is ...) given before the old post closes; the refusals
are today's. As plan 8S-4 made the press do, a refusal none of the
member's doing gives back the Submit and, through carriesOn, the use of
/location that opened the dialog; a failure after the move was answered
is only logged and the uses stay counted; a failed move says "Nothing
was moved." before the router reports it. A dialog cancelled leaves the
command's use counted. A second Submit finds the raid moved ("This raid
is over."). The question's buttons (location:<token>:yes|no) get the
router's stale answer.

**Files:**

```
 docs/architecture/discord-framework.md |   2 +-
 docs/architecture/parties-and-posts.md |   2 +-
 src/commands/notify-paths.test.ts      |  13 ++--
 src/commands/raids/location.test.ts    | 201 ++++++++++++++++++++++++++++++-----------------------
 src/commands/raids/location.ts         | 150 ++++++++++++++++++---------------------
 src/discord/custom-id.ts               |   4 ++
 6 files changed, 196 insertions(+), 176 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/commands/raids/location.test.ts src/commands/notify-paths.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f8afc8ea7d387102c34618904bde092677ed2cd3 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8Q T6: /location asks in a dialog before a move to another region (8Q-6)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/discord-framework.md
git add -- docs/architecture/parties-and-posts.md
git add -- src/commands/notify-paths.test.ts
git add -- src/commands/raids/location.test.ts
git add -- src/commands/raids/location.ts
git add -- src/discord/custom-id.ts
```

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index d04126c7..c538defb 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -18,7 +18,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete` and in the Submit of a split's dialog, `trains.md`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 - Plan 8S-3: between the guards and the throttle the router asks `checks`, the window a form's submit counts in, of a command (`CommandHandler.checks`, a `ControlThrottle`: `as` its command, else the command's own), a message command and a control (`ComponentHandler.checks(interaction, id)`, the limit `throttle` gives the form, counted where the form is): while that window is full the use is refused (the window's words: "You can use /report again in …", "That was a lot of clicks…"), and either way nothing is counted (`Throttles.wait`), so nobody types into a form only to be refused. `/report` and Report to moderators check `/report`'s window (`REPORT_WINDOW`), Ask the moderators and Appeal their form's (`APPEAL_THROTTLE`). A handler's own check before its form is a quick read (whether the member reported it already: `moderation.md`); when it fails the form opens as before, and the submit's checks stay (two forms open at once, a restart between).
-- Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; `/location`'s question, whose Move it there refused for no post in the other forum gives back the press and the use that asked, plan 8S-4: `CHANGE_THROTTLE` as `location`; a move that landed and was answered before a later step failed is logged and keeps both counted; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids, and since 8S-4 the changes of a raid, in the window of their command). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
+- Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; `/location`'s dialog, whose Submit refused for no post in the other forum gives back the Submit and the use that opened it, plans 8S-4 and 8Q, the time carried in the dialog's custom id: `CHANGE_THROTTLE` as `location`; a move that landed and was answered before a later step failed is logged and keeps both counted; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids, and since 8S-4 the changes of a raid, in the window of their command). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
 
 ## Controls and how a press answers
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index baa20867..6a27cfed 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -18,7 +18,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 - Commands that act on the party of the post they are used in have the guard `requireParty`; the handler asks `partyOf(interaction, ctx)` again and copes with undefined.
 - A time a member types for an existing raid is read by `typedPartyTime(ctx, party, 'hatch' | 'end' | 'meet', text, now)` (`src/commands/raids/raid-input.ts`); handlers read `Date.now()` themselves (their tests fake only `Date`). A boss with only one fast or one charged move has it set wherever a raid gets its boss (`certainMoves`: report, `/boss`, hatch).
-- The raid command for another gym is `/location`, not `/gym`: `/gym` is the gym administration of Phase 5, and one slash command cannot be both a command and a group of subcommands. A gym of another region of the same server moves the raid there: `/location` asks first (its own file, `src/commands/raids/location.ts`, with the question's buttons under the custom-id kind `location`), with no limit of its own (the `CHANGE_THROTTLE` of every change of a raid applies; Matt, 2026-10-11).
+- The raid command for another gym is `/location`, not `/gym`: `/gym` is the gym administration of Phase 5, and one slash command cannot be both a command and a group of subcommands. A gym of another region of the same server moves the raid there: `/location` asks first (its own file, `src/commands/raids/location.ts`), in a dialog since plan 8Q: titled `Move the raid to another region`, today's question with the region's channel named (`#east`, `channelInDialog`; the answers keep their mentions) and `Submit moves it.`; refusals before asking (no such gym, several, a gym with such a raid, none of a region with a forum) stay private replies, and a move within the region asks nothing. The dialog carries the party and the gym (no pending request); its Submit (`locationControls.modal`, `requireGuild`) is acknowledged privately, refused as over (`This raid is over.`) unless the raid it names is the one of the post it is submitted in (`raidOf`), and moves the raid as the service decides then (`raids.setGym`), the answer (`This raid is now at … Its new post is …`) given before the old post closes; a refusal that is none of the member's doing gives back the Submit and the use of `/location` that opened the dialog (`carriesOn`, plan 8S-4: when it was counted is the custom id's last part, `location:<party id>:move:<gym id>:<counted at>`), and a failure after the move was answered is only logged. Command and Submit have no limit of their own (the `CHANGE_THROTTLE` of every change of a raid applies; Matt, 2026-10-11); the buttons of the question before plan 8Q (`location:<token>:yes|no`) get the router's stale answer.
 - A `group` option is free text with autocomplete of the groups the raid has (`respondWithGroups`), read by `typedGroup` (`src/commands/parties/reply.ts`); text that is no group is refused, never ignored.
 - Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`), otherwise "This has ended."
 - Private answers to clicks on a post's controls go through `answerClick` (`ctx.clickAnswers`, `ClickAnswers`): the first click of a member on a party is answered with `reply`, later ones within two seconds are only acknowledged (`deferUpdate`), and the first answer is then edited to the answer of the last click. Only the first interaction of a burst may be given `editReply` (on a `deferUpdate`d click it would edit the post's own message). A refusal is thrown and shown at once. The test context answers every click by itself (window zero).
diff --git a/src/commands/notify-paths.test.ts b/src/commands/notify-paths.test.ts
index 2ce83d86..87008cb4 100644
--- a/src/commands/notify-paths.test.ts
+++ b/src/commands/notify-paths.test.ts
@@ -1,7 +1,8 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { shownDialog } from '../../test/support/dialogs.js';
 import {
-  fakeButton,
   fakeChatInput,
+  fakeModal,
   sent,
   type FakeInteraction,
 } from '../../test/support/fake-interactions.js';
@@ -149,12 +150,12 @@ describe('who is told, and who is left out, by every way a member causes it', ()
     await made.target(7, ALICE, BOB);
     const postId = made.raid().forumPostId ?? '';
     const asked = await made.inPost(ALICE, postId, WEST_FORUM, 'location', { gym: 'g:7' });
-    const row = sent(asked.reply).components?.[0] as {
-      toJSON(): { components: { custom_id: string }[] };
-    };
+    // Moving it asks first, in a dialog (plan 8Q): its Submit moves it.
+    const dialog = shownDialog(asked);
     await made.handle(
-      fakeButton({
-        customId: row.toJSON().components[0]?.custom_id ?? '',
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
         channelId: postId,
         thread: { parentId: WEST_FORUM },
         userId: ALICE,
diff --git a/src/commands/raids/location.test.ts b/src/commands/raids/location.test.ts
index b84b57aa..efa02666 100644
--- a/src/commands/raids/location.test.ts
+++ b/src/commands/raids/location.test.ts
@@ -4,16 +4,24 @@ import {
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeModal,
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
-import { EAST_CHANNEL, EAST_FORUM, WEST_FORUM } from '../../../test/support/gyms.js';
+import { dialogChoices, dialogText, shownDialog } from '../../../test/support/dialogs.js';
+import {
+  EAST_CHANNEL,
+  EAST_FORUM,
+  OTHER_GUILD_ID,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../../test/support/gyms.js';
 import { ALICE, BOB, PARTY_NOW } from '../../../test/support/parties.js';
 import { reportedRaid } from '../../../test/support/party-service.js';
 import { gymsFixture } from '../../../test/support/providers.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { components } from '../../components/index.js';
-import { InteractionRouter } from '../../discord/router.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import type { RaidReport } from '../../services/party-service.js';
 import { CHANGE_THROTTLE } from './change.js';
@@ -42,7 +50,11 @@ async function setup(report: Partial<RaidReport> = {}) {
     await router.handle(interaction as never);
     return interaction;
   };
-  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
+  const where = {
+    channelId: made.postId,
+    thread: { parentId: WEST_FORUM },
+    guildChannelNames: { [EAST_CHANNEL]: 'east' },
+  };
   const run = (options: Record<string, string> = {}, extra = {}) =>
     handle(
       fakeChatInput({
@@ -56,14 +68,18 @@ async function setup(report: Partial<RaidReport> = {}) {
     );
   const answer = async (options?: Record<string, string>) =>
     sent((await run(options)).reply).content;
-  /** A click on the n-th button of the question a use of the command got. */
-  const click = (asked: FakeInteraction, index: number, extra = {}) => {
-    const row = sent(asked.reply).components?.[0] as {
-      toJSON(): { components: { custom_id: string }[] };
-    };
-    const customId = row.toJSON().components[index]?.custom_id ?? '';
+  /** The Submit of the dialog a use of the command opened, by Alice. */
+  const submit = (asked: FakeInteraction, extra = {}) => {
+    const dialog = shownDialog(asked);
     return handle(
-      fakeButton({ customId, ...where, userId: ALICE, displayName: 'Alice', ...extra }),
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        ...where,
+        userId: ALICE,
+        displayName: 'Alice',
+        ...extra,
+      }),
     );
   };
   /** The choices offered while typing the gym. */
@@ -84,7 +100,7 @@ async function setup(report: Partial<RaidReport> = {}) {
     await made.service.flush();
     return made.said().join('\n').split('\n').filter(Boolean);
   };
-  return { ...made, ctx, handle, run, answer, click, offered, lines };
+  return { ...made, ctx, handle, run, answer, submit, offered, lines };
 }
 
 async function raidAt(made: Awaited<ReturnType<typeof setup>>, gymId: number) {
@@ -158,41 +174,38 @@ describe('/location', () => {
 });
 
 describe('/location to a gym of another region', () => {
-  it('asks first, privately, and changes nothing yet', async () => {
+  it('asks first in a dialog, and changes nothing yet', async () => {
     const made = await setup();
     const asked = await made.run({ gym: 'lighthouse' });
-    expect(sent(asked.reply)).toMatchObject({
-      content:
-        `Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>, not in this region. Moving the raid ` +
-        'there gives it a new post in the raid forum of that region, with everybody who is ' +
-        'signed up, and closes this one. Move it?',
-      flags: MessageFlags.Ephemeral,
-    });
-    const row = sent(asked.reply).components?.[0] as {
-      toJSON(): { components: { label: string }[] };
-    };
-    expect(row.toJSON().components.map((button) => button.label)).toEqual([
-      'Move it there',
-      'Cancel',
-    ]);
+    expect(asked.reply).not.toHaveBeenCalled();
+    const dialog = shownDialog(asked);
+    // The gym, and when the use of `/location` was counted (for `carriesOn`, plan 8S-4).
+    expect(dialog.custom_id).toBe(`location:${made.party.id}:move:7:${String(PARTY_NOW)}`);
+    expect(dialog.title).toBe('Move the raid to another region');
+    // The region's channel is named in a dialog, not mentioned.
+    expect(dialogText(dialog)).toBe(
+      'Harbor Lighthouse Mural is in #east, not in this region. Moving the raid there gives it ' +
+        'a new post in the raid forum of that region, with everybody who is signed up, and ' +
+        'closes this one. Move it?\n\nSubmit moves it.',
+    );
+    expect(dialogChoices(dialog)).toEqual([]);
     expect(made.current().gymId).toBe(1);
     expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
   });
 
-  it('moves the raid on yes and answers with the new post before the old one is closed', async () => {
+  it('moves the raid on Submit and answers privately with the new post before the old one is closed', async () => {
     const made = await setup();
     const asked = await made.run({ gym: 'g:7' });
-    const yes = await made.click(asked, 0);
+    const submitted = await made.submit(asked);
     await made.attendance.flush();
     await made.service.flush();
     const [party] = made.store.active();
     expect(party).toMatchObject({ gymId: 7, regionId: 2 });
     expect(party?.id).not.toBe(made.party.id);
-    expect(yes.deferUpdate).toHaveBeenCalledTimes(1);
-    expect(yes.editReply).toHaveBeenCalledTimes(1);
-    expect(sent(yes.editReply)).toEqual({
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(submitted.editReply).toHaveBeenCalledTimes(1);
+    expect(sent(submitted.editReply)).toEqual({
       content: `This raid is now at Harbor Lighthouse Mural. Its new post is <#${party?.forumPostId ?? ''}>.`,
-      components: [],
     });
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
     expect(
@@ -200,76 +213,57 @@ describe('/location to a gym of another region', () => {
     ).toEqual([
       `**Alice** (<@${ALICE}>) moved this raid here from **The Stacks** in <#100000000000000001>.`,
     ]);
+    // A second Submit of the same dialog finds the raid moved: its old self is over.
+    expect(sent((await made.submit(asked)).editReply).content).toBe('This raid is over.');
   });
 
-  it('moves nothing on cancel, and a question is answered once', async () => {
-    const made = await setup();
-    const asked = await made.run({ gym: 'g:7' });
-    const no = await made.click(asked, 1);
-    expect(sent(no.update)).toEqual({ content: 'Nothing was moved.', components: [] });
-    const late = await made.click(asked, 0);
-    expect(sent(late.update)).toEqual({
-      content: 'That choice has expired. Use `/location` again.',
-      components: [],
-    });
-    expect(made.current().gymId).toBe(1);
-  });
-
-  it('is nobody else’s to answer', async () => {
-    const made = await setup();
-    const asked = await made.run({ gym: 'g:7' });
-    const other = await made.click(asked, 0, { userId: BOB });
-    expect(sent(other.reply)).toMatchObject({
-      content: 'That is somebody else’s question.',
-      flags: MessageFlags.Ephemeral,
-    });
-    expect(made.current().gymId).toBe(1);
-    // The member who asked can still answer.
-    await made.click(asked, 0);
-    expect(made.store.active()[0]?.gymId).toBe(7);
-  });
-
-  it('refuses a move to a taken gym of another region without asking first', async () => {
+  it('refuses a move to a taken gym of another region without a dialog', async () => {
     const made = await setup();
     const other = await raidAt(made, 7);
     const refused = await made.run({ gym: 'g:7' });
+    expect(refused.showModal).not.toHaveBeenCalled();
     expect(sent(refused.reply)).toMatchObject({
       content: `That gym already has a raid like this one. Its post is <#${other.forumPostId ?? ''}>.`,
     });
-    expect(sent(refused.reply).components ?? []).toEqual([]);
   });
 
   it('says why nothing moved when that gym got such a raid meanwhile, or the raid has ended', async () => {
     const made = await setup();
     const asked = await made.run({ gym: 'g:7' });
     const other = await raidAt(made, 7);
-    const taken = await made.click(asked, 0);
+    const taken = await made.submit(asked);
     expect(sent(taken.editReply)).toEqual({
       content:
         'Nothing was moved. That gym already has a raid like this one. ' +
         `Its post is <#${other.forumPostId ?? ''}>.`,
-      components: [],
     });
     expect(made.current().gymId).toBe(1);
 
     const again = await made.run({ gym: 'g:8' });
     await made.service.end(made.party.id);
-    const over = await made.click(again, 0);
+    const over = await made.submit(again);
     expect(sent(over.editReply).content).toBe('This raid is over.');
   });
 
+  it('says so when the gym is gone by Submit', async () => {
+    const made = await setup();
+    const asked = await made.run({ gym: 'g:7' });
+    vi.spyOn(made.ctx.gyms, 'get').mockReturnValue(undefined);
+    expect(sent((await made.submit(asked)).editReply).content).toBe('That gym no longer exists.');
+    expect(made.current().gymId).toBe(1);
+  });
+
   it('says what the bot lacks in the other region’s forum when it may not post there', async () => {
     const made = await setup();
     made.gateway.refusePosts.set(EAST_FORUM, ['Create Posts', 'Manage Posts']);
-    const asked = await made.run({ gym: 'g:7' });
-    const yes = await made.click(asked, 0);
-    expect(sent(yes.editReply).content).toBe(
+    const submitted = await made.submit(await made.run({ gym: 'g:7' }));
+    expect(sent(submitted.editReply).content).toBe(
       `Nothing was moved. I am not allowed to make posts in <#${EAST_FORUM}>, the other ` +
         "region's forum: I lack the permissions Create Posts and Manage Posts there. The " +
         "server's staff must give them to me. The raid stays here.",
     );
     made.gateway.refusePosts.set(EAST_FORUM, []);
-    const again = await made.click(await made.run({ gym: 'g:7' }), 0);
+    const again = await made.submit(await made.run({ gym: 'g:7' }));
     expect(sent(again.editReply).content).toBe(
       `Nothing was moved. Discord does not let me make posts in <#${EAST_FORUM}>, the other ` +
         "region's forum. The server's staff must check that I have View Channel, Create Posts, " +
@@ -281,7 +275,7 @@ describe('/location to a gym of another region', () => {
   it.each([
     ['the other forum refused', 'I am not allowed to make posts'],
     ['whose post went while it was made', 'I could not make the post in the other region'],
-  ])('counts no press of "Move it there" %s: none of the member’s doing', async (_, said) => {
+  ])('counts no Submit %s: none of the member’s doing', async (_, said) => {
     const made = await setup();
     if (said.startsWith('I am')) made.gateway.refusePosts.set(EAST_FORUM, ['Manage Posts']);
     // A post deleted the moment it was made: the fake cannot lose one once direct posts work.
@@ -292,18 +286,18 @@ describe('/location to a gym of another region', () => {
       });
     const first = await made.run({ gym: 'g:7' });
     for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
-      const yes = await made.click(n === 0 ? first : await made.run({ gym: 'g:7' }), 0);
-      expect(sent(yes.editReply).content).toContain(`Nothing was moved. ${said}`);
-      // Said in the question's place, once.
-      expect(yes.followUp).not.toHaveBeenCalled();
+      const submitted = await made.submit(n === 0 ? first : await made.run({ gym: 'g:7' }));
+      expect(sent(submitted.editReply).content).toContain(`Nothing was moved. ${said}`);
+      // Said in the answer, once.
+      expect(submitted.followUp).not.toHaveBeenCalled();
     }
-    // One press more than a minute allows: the answered question has expired, no limit hit.
-    const late = await made.click(first, 0);
-    expect(sent(late.update).content).toBe('That choice has expired. Use `/location` again.');
+    // One Submit more than a minute allows: no limit hit, since none counted.
+    const late = await made.submit(first);
+    expect(sent(late.editReply).content).toContain(`Nothing was moved. ${said}`);
     expect(made.current().gymId).toBe(1);
     // Nor did the uses of `/location` that asked count (plan 8S-4): it may be used again.
     const more = await made.run({ gym: 'g:7' });
-    expect(sent(more.reply).content).toContain('Move it?');
+    expect(dialogText(shownDialog(more))).toContain('Move it?');
   });
 
   it('keeps the answer and counts the use of a move that landed before a later step failed', async () => {
@@ -314,29 +308,30 @@ describe('/location to a gym of another region', () => {
       throw new Error('Discord is away');
     });
     for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
-      const yes = await made.click(await made.run({ gym: 'g:7' }), 0);
-      expect(sent(yes.editReply).content).toContain('This raid is now at');
-      expect(yes.followUp).not.toHaveBeenCalled();
+      const submitted = await made.submit(await made.run({ gym: 'g:7' }));
+      expect(sent(submitted.editReply).content).toContain('This raid is now at');
+      expect(submitted.followUp).not.toHaveBeenCalled();
     }
     const more = await made.run({ gym: 'g:7' });
     expect(sent(more.reply).content).toContain('You can use /location again');
   });
 
-  it('counts the use of /location whose move was canceled', async () => {
+  it('counts the use of /location whose dialog was canceled', async () => {
     const made = await setup();
+    // Discord's Cancel tells the bot nothing: the dialog opened, and that use stays counted.
     for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
-      await made.click(await made.run({ gym: 'g:7' }), 1);
+      shownDialog(await made.run({ gym: 'g:7' }));
     }
     const more = await made.run({ gym: 'g:7' });
     expect(sent(more.reply).content).toContain('You can use /location again');
   });
 
-  it('takes the buttons away and reports the failure when the move fails', async () => {
+  it('says that nothing moved and reports the failure when the move fails', async () => {
     const made = await setup();
     const asked = await made.run({ gym: 'g:7' });
     made.gateway.failing.set('createPost', new Error('Discord is away'));
-    const failed = await made.click(asked, 0);
-    expect(sent(failed.editReply)).toEqual({ content: 'Nothing was moved.', components: [] });
+    const failed = await made.submit(asked);
+    expect(sent(failed.editReply)).toEqual({ content: 'Nothing was moved.' });
     expect(failed.followUp).toHaveBeenCalledTimes(1);
     expect(made.current().gymId).toBe(1);
   });
@@ -349,8 +344,7 @@ describe('/location to a gym of another region', () => {
         channelId: party?.forumPostId ?? '',
         thread: { parentId: party?.forumChannelId ?? '' },
       };
-      const asked = await made.run({ gym }, where);
-      return made.click(asked, 0, where);
+      return made.submit(await made.run({ gym }, where), where);
     };
     // Back and forth, more often than the two in ten minutes there once were.
     for (const gym of ['g:7', 'g:1', 'g:8', 'g:2']) await moveTo(gym);
@@ -359,6 +353,39 @@ describe('/location to a gym of another region', () => {
     expect(locationControls.throttle).toBe(CHANGE_THROTTLE);
   });
 
+  it('moves nothing for a Submit that names a party other than the raid of its post', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.run({ gym: 'g:7' }));
+    // Sent from outside the raid's post (a forged custom id, another channel or server).
+    for (const elsewhere of [
+      { channelId: WEST_CHANNEL, thread: undefined },
+      { guildId: OTHER_GUILD_ID, channelId: '600000000000000077', thread: undefined },
+    ]) {
+      const submitted = await made.handle(
+        fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE, ...elsewhere }),
+      );
+      expect(sent(submitted.editReply).content).toBe('This raid is over.');
+    }
+    // And in no server at all.
+    const dm = await made.handle(
+      fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE, isDm: true }),
+    );
+    expect(sent(dm.reply).content).toBe('This only works in a server.');
+    expect(made.current().gymId).toBe(1);
+    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
+  });
+
+  it('gives the buttons of the question it asked before the stale answer', async () => {
+    const made = await setup();
+    for (const action of ['yes', 'no']) {
+      const pressed = await made.handle(
+        fakeButton({ customId: `location:0123456789abcdef:${action}`, userId: ALICE }),
+      );
+      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
+    }
+    expect(made.current().gymId).toBe(1);
+  });
+
   it('is listed with the controls the router reads', () => {
     expect(components).toContain(locationControls);
   });
diff --git a/src/commands/raids/location.ts b/src/commands/raids/location.ts
index 10d8f56f..f4be4465 100644
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -1,51 +1,38 @@
-import {
-  ActionRowBuilder,
-  ButtonBuilder,
-  ButtonStyle,
-  MessageFlags,
-  SlashCommandBuilder,
-} from 'discord.js';
+import { SlashCommandBuilder } from 'discord.js';
 import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
-import { whenCounted } from '../../discord/router.js';
+import { channelInDialog, deferSubmit, dialog } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
-import { raidOf, regionChannelOf, requireRaid } from '../../discord/guards.js';
+import { raidOf, regionChannelOf, requireGuild, requireRaid } from '../../discord/guards.js';
+import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
 import { blocksNewRaid, raidKindOf } from '../../domain/party/raid.js';
 import { problemText } from '../../render/activity.js';
 import { plain, truncate } from '../../render/text.js';
-import { NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
 import { commandRaid, partyOver } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
 import { raidRefusalText } from './raid-changes.js';
 import { gymChoices, reportedGym } from './raid-input.js';
 
-/** The custom-id kind of the question `/location` asks before a move to another region. */
+/**
+ * The custom-id kind of the dialog `/location` opens before a move to another region (plan 8Q):
+ * `location:<party id>:move:<gym id>:<counted at>`, the last when the router counted the use of
+ * `/location` that opened it (`whenCounted`): a move refused for none of the member's doing gives
+ * that use back to its window (`carriesOn`, plan 8S-4).
+ */
 const KIND = 'location';
 /** The name of the command, as the router counts its uses. */
 const LOCATION = 'location';
-const EXPIRED = 'That choice has expired. Use `/location` again.';
+const MOVE_FORM = 'move';
 const NOT_MOVED = 'Nothing was moved.';
 
-/** A move to another region that waits for the member's yes. */
-interface PendingMove {
-  partyId: string;
-  gymId: number;
-  /**
-   * When the router counted the use of `/location` that asked (`whenCounted`): a move refused for
-   * none of the member's doing gives it back to that window (`carriesOn`, plan 8S-4).
-   */
-  countedAt: number;
-}
-
-const pending = new PendingRequests<PendingMove>();
-
 /**
  * `/location`: moves the raid to another gym. The legacy command was `!gym`; the name `/gym`
  * belongs to the gym administration (`/gym add`, …), and one command cannot be both.
  *
  * A gym of the raid's own region is taken at once. A gym of another region means a new post in
- * that region's forum and the end of this one (spec 5.2), so the member is asked first. Such a
- * move has no limit of its own: the one of every change of a raid applies (Matt, 2026-10-11).
+ * that region's forum and the end of this one (spec 5.2), so the member is asked first, in a
+ * dialog (plan 8Q) whose Submit moves it. Such a move has no limit of its own: the one of every
+ * change of a raid applies (Matt, 2026-10-11), to the command and to the Submit.
  */
 export const location: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -62,9 +49,9 @@ export const location: SimpleCommand = {
   help: {
     category: 'raid-crud',
     details:
-      'The gym must not have such a raid already. For a gym of another region I ask first: the ' +
-      'raid then gets a new post in the raid forum of that region, with everybody who is ' +
-      `signed up, and this post is closed with a link to it. ${IN_A_RAID_POST}`,
+      'The gym must not have such a raid already. For a gym of another region I ask first, in a ' +
+      'dialog: the raid then gets a new post in the raid forum of that region, with everybody ' +
+      `who is signed up, and this post is closed with a link to it. ${IN_A_RAID_POST}`,
     examples: ['/location gym:Big Fountain'],
   },
   guards: [requireRaid],
@@ -112,29 +99,25 @@ export const location: SimpleCommand = {
           (post ? ` Its post is <#${post}>.` : ''),
       );
     }
-    const token = pending.put(interaction.user.id, {
-      partyId: party.id,
-      gymId: gym.id,
-      countedAt: whenCounted(interaction) ?? Date.now(),
-    });
-    const button = (action: string, label: string, style: ButtonStyle) =>
-      new ButtonBuilder()
-        .setCustomId(encodeCustomId({ kind: KIND, id: token, action }))
-        .setLabel(label)
-        .setStyle(style);
-    await interaction.reply({
-      content:
-        `${name} is in <#${move.region.channelId}>, not in this region. Moving the raid there gives ` +
-        'it a new post in the raid forum of that region, with everybody who is signed up, and ' +
-        'closes this one. Move it?',
-      components: [
-        new ActionRowBuilder<ButtonBuilder>().addComponents(
-          button('yes', 'Move it there', ButtonStyle.Primary),
-          button('no', 'Cancel', ButtonStyle.Secondary),
-        ),
-      ],
-      flags: MessageFlags.Ephemeral,
-    });
+    // The region's channel by its name: a dialog shows no mention (design 8Q).
+    const where = channelInDialog(
+      interaction.guild?.channels.cache.get(move.region.channelId)?.name,
+    );
+    await interaction.showModal(
+      dialog({
+        customId: encodeCustomId({
+          kind: KIND,
+          id: party.id,
+          action: MOVE_FORM,
+          args: [String(gym.id), String(whenCounted(interaction) ?? Date.now())],
+        }),
+        title: 'Move the raid to another region',
+        text:
+          `${name} is in ${where}, not in this region. Moving the raid there gives it a new ` +
+          'post in the raid forum of that region, with everybody who is signed up, and closes ' +
+          'this one. Move it?\n\nSubmit moves it.',
+      }),
+    );
   },
   async autocomplete(interaction, ctx) {
     const regionName = (channelId: string): string | undefined =>
@@ -156,48 +139,53 @@ export const location: SimpleCommand = {
 };
 
 /**
- * The two buttons under the question of `/location`. A press counts in its own window; one whose
- * move is refused for none of the member's doing (no post in the other forum) gives back both
- * the press and the use of `/location` that asked (`carriesOn`: that use did nothing either).
+ * The Submit of the dialog of `/location` (`location:<party id>:move:<gym id>:<counted at>`), in
+ * a server, with the limit of every change of a raid (refused as over unless the party it names
+ * is the raid of the post it is submitted in, `raidOf`: a custom id could name any party, and
+ * the old question's token held the one `/location` had checked): acknowledged privately (the
+ * new post takes a moment to make), then the raid is moved as the service decides now, and the
+ * answer is given before the old post is closed. A refusal that is none of the member's doing (no post in the other forum) gives back
+ * both the Submit and the use of `/location` that opened the dialog (`carriesOn`: that use did
+ * nothing either). Once the move was answered, a later failure (closing the old post) is only
+ * logged: the move stands and its uses stay counted. The buttons of the question this dialog
+ * replaced (`location:<token>:yes|no`) get the router's stale answer.
  */
 export const locationControls: ComponentHandler = {
   kind: KIND,
+  guards: [requireGuild],
   throttle: CHANGE_THROTTLE,
-  carriesOn: (interaction, id) => {
-    const asked = pending.peek(id.id, interaction.user.id);
-    return typeof asked === 'object'
-      ? { ...CHANGE_THROTTLE, as: LOCATION, countedAt: asked.value.countedAt }
+  carriesOn: (_interaction, id) => {
+    const countedAt = id.action === MOVE_FORM ? Number(id.args[1]) : Number.NaN;
+    return Number.isSafeInteger(countedAt)
+      ? { ...CHANGE_THROTTLE, as: LOCATION, countedAt }
       : undefined;
   },
 
-  async button(interaction, id, ctx) {
-    const taken = pending.take(id.id, interaction.user.id);
-    if (taken === 'not-yours') throw new UserError(NOT_YOURS);
-    if (taken === 'expired') {
-      await interaction.update({ content: EXPIRED, components: [] });
-      return;
-    }
-    if (id.action !== 'yes') {
-      await interaction.update({ content: NOT_MOVED, components: [] });
+  async modal(interaction, id, ctx) {
+    const [gymArg] = id.args;
+    const gymId = gymArg !== undefined && /^\d{1,9}$/.test(gymArg) ? Number(gymArg) : undefined;
+    if (id.action !== MOVE_FORM || gymId === undefined) throw new UserError(STALE_COMPONENT);
+    const partyId = id.id;
+    await deferSubmit(interaction);
+    // Only the raid of the post it is submitted in: the custom id could name any party.
+    if (raidOf(interaction, ctx)?.id !== partyId) {
+      await interaction.editReply({ content: partyOver({ type: 'raid' }) });
       return;
     }
-    const { partyId, gymId } = taken.value;
     const gym = ctx.gyms.get(gymId);
-    if (!gym) {
-      await interaction.update({ content: 'That gym no longer exists.', components: [] });
-      return;
-    }
-    const name = plain(gym.nickname || gym.name);
-    // The new post takes a moment to make.
-    await interaction.deferUpdate();
     let answered = false;
     const say = async (content: string): Promise<void> => {
       answered = true;
-      await interaction.editReply({ content, components: [] });
+      await interaction.editReply({ content });
     };
+    if (!gym) {
+      await say('That gym no longer exists.');
+      return;
+    }
+    const name = plain(gym.nickname || gym.name);
     let outcome;
     try {
-      // The answer is given before this post is closed: the question stands in it.
+      // The answer is given before the old post is closed.
       outcome = await ctx.raids.setGym(partyId, changingMember(interaction), gymId, (party) =>
         say(
           `This raid is now at ${name}.` +
@@ -214,7 +202,7 @@ export const locationControls: ComponentHandler = {
       try {
         await say(NOT_MOVED);
       } catch {
-        // The message may be gone or the token expired; the error below is what matters.
+        // The answer may be gone; the error below is what matters.
       }
       throw err;
     }
@@ -228,7 +216,7 @@ export const locationControls: ComponentHandler = {
         (post ? ` Its post is <#${post}>.` : '');
       await say(text);
       // No post in the other forum (refused, or lost while it was made): none of the member's
-      // doing, so the press goes back.
+      // doing, so the Submit goes back.
       if (outcome.reason === 'posts-refused' || outcome.reason === 'post-not-made') {
         throw new UserError(text, { givesBack: true, said: true });
       }
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index e22e9a25..1049e8e0 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -30,6 +30,10 @@
  * question it asks `gym:<token>:outside-delete` and `gym:<token>:outside-keep`, whose tokens
  * are in `pendingOutside` (the question's token is made of the outcome's: `questionToken`).
  *
+ * The dialog of `/location` before a move to another region (plan 8Q) is
+ * `location:<party id>:move:<gym id>:<counted at>`: the raid (whose post it must be submitted
+ * in), the gym, and when the router counted the use of `/location` (`carriesOn`, plan 8S-4).
+ *
  * The buttons of the view of `/gym show` have the kind `gymview` (`src/commands/gyms/view-controls.ts`),
  * and their id is the number of the gym: `gymview:<gym id>:edit` (opens the form of `/gym
  * edit`), `gymview:<gym id>:elite:1|0` (Make elite / Not elite: what it sets), `gymview:<gym id>:move` (opens the
````

### Task 7: Plan 8Q T7: the dialogs in discord-framework.md, and the staging checklist (8Q-7)

Prototype commit: `f9a87844678e66ac344e237a2e97413aedda8488`

discord-framework.md lists the one-shot questions that are dialogs and
where each area file says more, and says that a command opening a
dialog declares no defer (the example of a defer that is a function is
/counters now; /delete never was one since 8S-2). parties-and-posts.md
names /location's Submit among the answers said in their own reply.

The staging checklist 2026-10-18-phase-8q-staging.md: each dialog opened,
cancelled and submitted, the choices with nothing picked and Discord's
refusal of an empty Submit, the variants without a choice (no Manage
Threads, no Manage Channels), the refusals before opening, a scratch
region in place of the test server's real ones, the old questions of
the previous build pressed after the switch, the phone, and a mention
inside a dialog checked with the raw staging script to learn whether
<#id> renders there. The slow read is tested by the unit tests only.

**Files:**

```
 docs/architecture/discord-framework.md                |  4 +--
 docs/architecture/parties-and-posts.md                |  2 +-
 docs/superpowers/plans/2026-10-18-phase-8q-staging.md | 71 +++++++++++++++++++++++++++++++++++++++
 3 files changed, 74 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f9a87844678e66ac344e237a2e97413aedda8488 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8Q T7: the dialogs in discord-framework.md, and the staging checklist (8Q-7)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/discord-framework.md
git add -- docs/architecture/parties-and-posts.md
git add -- docs/superpowers/plans/2026-10-18-phase-8q-staging.md
```

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index c538defb..830ee655 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -16,7 +16,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 ## The router and deferral
 
-- The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete` and in the Submit of a split's dialog, `trains.md`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
+- The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/counters`); a command that opens a dialog declares none (the dialog is its first answer). A component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of a member's `/delete` from before plan 8S-2, and `deferSubmit` in the Submit of every one-shot dialog, below). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 - Plan 8S-3: between the guards and the throttle the router asks `checks`, the window a form's submit counts in, of a command (`CommandHandler.checks`, a `ControlThrottle`: `as` its command, else the command's own), a message command and a control (`ComponentHandler.checks(interaction, id)`, the limit `throttle` gives the form, counted where the form is): while that window is full the use is refused (the window's words: "You can use /report again in …", "That was a lot of clicks…"), and either way nothing is counted (`Throttles.wait`), so nobody types into a form only to be refused. `/report` and Report to moderators check `/report`'s window (`REPORT_WINDOW`), Ask the moderators and Appeal their form's (`APPEAL_THROTTLE`). A handler's own check before its form is a quick read (whether the member reported it already: `moderation.md`); when it fails the form opens as before, and the submit's checks stay (two forms open at once, a restart between).
 - Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; `/location`'s dialog, whose Submit refused for no post in the other forum gives back the Submit and the use that opened it, plans 8S-4 and 8Q, the time carried in the dialog's custom id: `CHANGE_THROTTLE` as `location`; a move that landed and was answered before a later step failed is logged and keeps both counted; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids, and since 8S-4 the changes of a raid, in the window of their command). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
 
@@ -24,7 +24,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
-- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text, choice })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`) and the split of a train (`trains.md`); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text, choice })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 6a27cfed..09397a37 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -50,7 +50,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Discord: the gateway and the party service
 
-- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split group… and `/group split`), said in its private answer, and the press of "Move it there" of `/location`, said in place of the question, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split group… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
 - `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for trains and meetups, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
diff --git a/docs/superpowers/plans/2026-10-18-phase-8q-staging.md b/docs/superpowers/plans/2026-10-18-phase-8q-staging.md
new file mode 100644
index 00000000..02143a55
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-18-phase-8q-staging.md
@@ -0,0 +1,71 @@
+# Phase 8Q staging checklist: the one-shot questions as dialogs
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Two accounts: **Ash** (Matt's account, a Moderator with Manage Channels: the staff steps) and **Dawn** (the second account, a member). The design is `docs/superpowers/specs/2026-10-18-one-shot-dialogs-design.md`; the split's dialog of plan 8T-H, which these follow, is staged by the 8T checklist (steps 5 to 7, 12, 17, 18, 28).
+
+What every dialog of this plan has in common, checked once in each section: it opens at once over the channel (no "thinking…" before it, no private reply), its title says the act, its text is the question, Discord's own Submit and Cancel close it; Cancel (or Escape) says nothing and changes nothing; after Submit Discord shows its own wait, then a private answer (only the account that submitted sees it). A choice between two ways is a radio group with nothing picked: Submit without a pick is refused by Discord ("This field is required."). Channels inside a dialog are named (`#west`), never mentioned; the private answers after Submit keep their mentions (links that open the channel).
+
+## Before
+
+1. No command definitions change (no new command, option or description): no deploy is needed. No migration, no change of the party document; going back to an older branch needs nothing (a dialog opened by this build and submitted by an older one answers "This control is no longer active.").
+2. Before switching to this build, ask the old questions once and leave them unanswered, for step 30: `/unwant-all` (Dawn, with something on the list), `/delete` in a raid's post (Ash), `/gym delete` (Ash), `/region remove` of a scratch region (Ash; step 19), `/location` to a gym of another region (Dawn, in a raid post of hers), and Close… on an open report's post (Ash: its private question with Archive post and Delete post).
+
+## Remove all
+
+3. Dawn has three wants (`/want`) in the test server. `/unwant-all`: the dialog "Remove all your wants": "Remove all 3 entries of your list for this server? You will get no DMs for Pokémon or raid tiers here any more.", a blank line, "Submit removes them.". Cancel: nothing is said; `/wants` still lists three.
+4. `/unwant-all` again, Submit: privately "Removed 3 entries: your list for this server is empty.". `/unwant-all` once more: privately "Your list for this server is empty: there is nothing to remove." and no dialog.
+5. Dawn adds one want; `/wants`, then "Remove all…" under the list: the same dialog, "Remove the one entry … Submit removes it."; the list stays as it is (not replaced). Submit: the private answer "Removed 1 entry: …" comes as a message of its own, the list above it unchanged until a page button is pressed.
+6. The same for gyms: Dawn targets two gyms (`/target`); `/untarget-all` opens "Remove all your gym targets" ("Remove all 2 of your gyms in this server? …", "Submit removes them."); Submit: "Removed 2 gyms: you have no gyms in this server any more.". "Remove all…" under `/targets` opens it too; with no gyms, `/untarget-all` says "You have no gyms in this server: there is nothing to remove." without a dialog.
+
+## Staff's /delete
+
+7. Dawn reports a raid (`/raid`). Dawn tries `/delete` in its post: Discord does not offer it (Manage Messages); if it is typed anyway, "Only admins and moderators can do that.". Ash `/delete` in the post: the dialog "Close this raid", the text "Close this raid?", the radio group "The post" with "Archive post" ("Keeps it readable and locked.") and "Delete post" ("Removes it with everything written in it: for what nobody should keep reading, like a home address."), nothing picked. Submit without a pick: Discord refuses it. Cancel: nothing changes.
+8. Pick Archive post, Submit: privately "This raid is closed: its gym is free for a new report, and I am archiving and locking its post."; the post says who closed it and is archived and locked.
+9. A second raid: Delete post, Submit: the post is deleted with its thread (the private answer may vanish with it: that is expected, as before). A meetup's and a train's `/delete` are titled "Close this meetup", "Close this train".
+10. A third raid in a forum where the bot lacks Manage Threads (take it away in the forum's permissions for the bot's role first, and give it back after): `/delete` opens the dialog without a choice: "Close this raid?", then "Its post will be archived (kept readable and locked): I can't delete posts in #<forum> (Manage Threads is missing there), so deleting it is not offered. Delete it yourself if nobody should keep reading it.", then "Submit archives its post.". The forum is named, not a link. Submit: the post is archived.
+11. Open the dialog of a fourth raid with Manage Threads in place, take Manage Threads away while it is open, pick Delete post and Submit: privately "I can't delete posts in <#forum> (Manage Threads is missing there). Archive it, or delete it yourself." (a mention here), and the raid is still active. Give Manage Threads back.
+
+## The report post
+
+12. Dawn makes a meetup and reports it (`/report`); in the moderators' channel Ash presses Close… on the report's post: the dialog "Close this meetup" with "Close this meetup?" and the radio group "The post"; Refuse place… "Refuse this place" with "Refuse this place for good, and close this meetup?"; Block maker… "Block the maker" with "Block its maker from creating meetups here, and close this meetup?". Cancel each: the report is still open.
+13. Close…, pick Archive post, Submit: privately "Closed: the meetup is over, and its post archived."; the report's post is redrawn for everybody (the decision, no buttons), as before.
+14. Another report decided already (Dismiss it first): Close… answers at once privately "**Ash** (…) decided this already …: dismissed." and no dialog opens. A dialog of a report opened before somebody decided it answers the same at Submit.
+15. A report of a meetup in a forum where the bot lacks Manage Threads: Close… opens without a choice ("Its post will be archived … #<forum> …", "Submit archives its post."). With the dialog open and Manage Threads taken away meanwhile (step 11's way), Delete post and Submit: the private answer says the bot can't delete posts there, with one button "Archive post": pressing it archives the post and closes the report at once.
+
+## Deleting a gym
+
+16. Ash `/gym delete gym:` a test gym that a train's route and a saved route have: the dialog "Delete a gym": "Delete **<name>** (#<n>)? This cannot be undone.", "With it go:" and its lines, "Submit deletes it."; the gym's name shows bold in the dialog. Cancel: the gym is still there (`/gym show`).
+17. Submit: privately "Deleted **<name>** (#<n>).", "With it went:" and what really went; the train's post says why its stop went.
+18. `/gym show` of another test gym, Delete…: the same dialog; the view stays as it was. Submit: privately "Deleted …" as a message of its own. A gym with an active raid: `/gym delete` and Delete… answer privately "A raid is at … A gym cannot be deleted while a raid is there …" and no dialog opens.
+
+## Removing a region
+
+19. Do not remove one of the 28 real Pittsburgh regions of the test server (`var/stage/TEST-SERVER-STATE.md`): make a scratch region first, with its own channel and forum (`/region import` of a small KML for a new channel, or the region editor), and end with it removed.
+20. Ash `/region remove region:` the scratch region: the dialog "Remove a region": "Remove the region #<channel>? This cannot be undone.", what goes with it, "Its text channel stays as it is, and no gym is deleted.", "Its forum #<forum> can stay as history or be deleted, as you pick below.", "Submit removes it.", and the radio group "Its forum" with "Keep it as history" ("Its posts are archived and locked.") and "Delete it" ("Deletes every post in it for good."), nothing picked. Cancel: the region is still there (`/region list`).
+21. Pick Keep it as history, Submit: privately "Removed the region <#channel>." with mentions, what went with it, "Its forum <#forum> stays as history.", and the self-roles reminder where roles are on.
+22. A second scratch region, Delete it, Submit: "Its forum was deleted, with every post in it."; the forum is gone from the channel list.
+23. Optional, with a staff role that lacks Manage Channels (a test role given to Ash for the step, then taken away): the dialog has no choice and says "Its forum #<forum> stays as history (its posts are archived and locked): deleting it takes the Manage Channels permission, which you lack."; Submit keeps the forum.
+
+## /location to another region
+
+24. Dawn reports a raid in West; in its post `/location gym:` a gym of another region: the dialog "Move the raid to another region": "<gym> is in #<region>, not in this region. Moving the raid there gives it a new post in the raid forum of that region, with everybody who is signed up, and closes this one. Move it?", "Submit moves it.". Cancel: the raid stays.
+25. Submit: privately "This raid is now at <gym>. Its new post is <#post>." (a link); then the old post closes with its link line. `/location` to a gym of West answers at once without a dialog ("This raid is now at …"). A gym that has such a raid: the refusal privately, no dialog.
+    The 8S-4 staging step 10 (a move refused because the bot may not make posts in the other region's forum) now runs through the dialog: Submit answers privately "Nothing was moved. I am not allowed to make posts in <#forum> …", and neither the Submit nor the `/location` use that opened the dialog counts (`/location` can be used again at once, `CHANGE_THROTTLE` times over).
+
+## A mention inside a dialog (to learn, not to pass)
+
+26. Whether Discord shows a channel mention (`<#id>`) inside a dialog's text is not known (the design names channels instead). Claude extends the staging script `var/stage/dialog-check.mts` (git-ignored, the raw dialogs checked for 8T-H) by a fourth button that opens a dialog of one text display with a channel mention, a user mention and a role mention, for example `In <#WEST_CHANNEL>, by <@DAWN>, for <@&MODERATOR_ROLE>.` (the test server's ids); Matt runs it as before, on his go-ahead. Note for each on desktop and phone whether it shows as a link with the name, as the raw `<#…>`, or as "#unknown"; write it into the follow-ups ("From the staging run of 8Q"). If channel mentions render, a later small change may go back to mentions in the dialogs.
+
+## Throttles, the slow read, old questions
+
+27. Ash closes twenty raids within a minute with `/delete` (the command has no limit; each Submit counts against twenty a minute): the twenty-first Submit answers "That was a lot of clicks. Try again in …". (Optional: it takes twenty raids.)
+28. The slow read (no dialog and "That took me too long to look up: try again in a moment." when what a dialog needs is not read within two seconds) is tested by the unit tests only: it needs a database slower than Discord's three seconds.
+29. Two dialogs at once: Discord shows one dialog at a time per account; opening a second (another `/unwant-all` from another window) replaces the first. Note what the client does.
+30. The questions left unanswered in step 2, pressed now: "Keep them" / "Remove all 3" of `/unwant-all`, "Archive post" / "Delete post" of `/delete`, "Move it there" / "Cancel" of `/location`, and the report question's "Delete post" answer "This control is no longer active."; "Delete" / "Keep" of `/gym delete` and "Remove, keep the forum" / "Remove and delete the forum" / "Cancel" of `/region remove` say that the question has expired. Nothing changes, except the report question's "Archive post": it has the same custom id as the button kept under a deletion refused at Submit (step 15), so it archives the post and closes the report at once, without a dialog; press it last, on a report that may be closed.
+
+## Phone
+
+31. On the phone: each dialog's title (none cut), its text with the bold gym name and the lines of what goes with a gym or a region, the radio groups with their descriptions and nothing picked, Discord's refusal of Submit without a pick, and the private answers after Submit.
+
+## Rollback
+
+Nothing to undo: no migration, no stored change. Dialogs opened on this build and submitted after going back answer "This control is no longer active." (the old build has no Submit of these kinds); questions asked on the old build and pressed on this one answer as in step 30.
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8q HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8q-one-shot-dialogs.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other through the npm scripts.
2. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8Q"), the Gantt chart and memory.

## Staging checklist

`docs/superpowers/plans/2026-10-18-phase-8q-staging.md` (task 7): on the dev application and the test server, each step with Matt's go-ahead; no deploy is needed (no command definition changed). Step 26 learns whether a channel mention renders inside a dialog.
