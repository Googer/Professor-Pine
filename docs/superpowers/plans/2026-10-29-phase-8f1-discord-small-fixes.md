# Phase 8F-1: Discord's Small Fixes Before the Cutover: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Discord side's last small fixes before the cutover: no Elite egg without a hatch time, a cut Power Spot name that fits other regions asks instead of guessing, no #bot-updates post for an import that changed no gym, the catch CP in a max battle's post, the admin guide's line, and every command's help in paragraphs.

- **Task 1:** no timeless Elite egg (8E-1): `eggNeedsHatchTime(tier)` (`src/domain/pogo/raid-tier.ts`); the screenshot decision's reason `elite-egg-time`; `RaidChangeService.setBoss` refusing a change that would leave an Elite egg without a hatch time; a test pinning that `moveBossTier` cannot make one.
- **Task 2:** a cut Power Spot name counts as clear only when exactly one spot in the server fits (8X-S): a mention asks, passive reading reports nothing.
- **Task 3:** `gymListSummary` gives nothing when no gym changed (8W-3), the import's three sentences, the guides' line (2E-2).
- **Task 4:** `maxCatchCp` (`src/domain/pogo/cp.ts`, level 20, IVs 10–15, never weather-boosted), the catalogue's method, battle-only forms caught as their base form, `**Catch CP** min–max` as the boss's last line in a max battle's post.
- **Task 5:** every command's and subcommand's help in paragraphs of at most 320 characters, joins with a blank line, a test over every command and config (`src/commands/help-paragraphs.test.ts`).

**Tech stack:**
- TypeScript 6.0, Node 26, discord.js 14, Vitest.
- No new dependency, no migration, no setting, no command definition changes (no deploy).

**Spec:** `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, section "Plan 8F-1" (approved by Matt 2026-10-29). With it: the brief `.superpowers/sdd/2026-10-29-small-pass/brief-8f1.md` (git-ignored).

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8f1` (tip `6d8d26c6`), one commit per task, on `small-pass` ebb00168.
- Each commit typechecks and passes its tests.
- On the final tip the full check (11,045 tests), the build and the database suite (623 tests) passed.

**Reviews:**
- **The prototype:** an Opus review found 1 Important (Eternamax's catch CP read from its battle form, about 4,600) and 2 Minor (a "provisional" note left in the docs; the widest-boss test picked by name length, not rendered length).
- **Fix round 1:** folded in (battle-only forms caught as their base form; the note removed; the test measures the rendered post).

**Conventions:** read `CLAUDE.md` and `docs/architecture/screenshots.md`, `parties-and-posts.md`, `gyms-and-regions.md`, `wayfarer.md`, `utilities.md`, `discord-framework.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck and its own test files.
- The full check, the build and the database suite run once, on the tip (after 8M-13's tasks, which share the branch).
- Work in `../Professor-Pine-smallpass` on `small-pass`; never commit in the main checkout.

## Review Focus

- An Elite egg never stands without a hatch time: not from `/raid`, a screenshot, `/boss`, `/admin boss add` or `autoset`; a legacy timeless egg already standing is left alone.
- Passive reading never guesses a Power Spot from a cut name that fits spots in other regions; the equal-title rule is unchanged.
- An import that only adds or removes stops says nothing in #bot-updates; one that changes gyms still does.
- A max battle's post stays within its limits with the widest boss and the catch CP line.
- The help keeps its words: only paragraph breaks and the listed rewordings change.

---

### Task 1: 8F-1 task 1: no timeless Elite egg

Prototype commit: `d8be1eeab388db2a1b1027fb7d4fcbe2ade12d6d`

A screenshot whose result is an Elite egg without a time (its stage not
read, also an Elite egg typed over such a read) is refused by decide with
elite-egg-time, before any gym is asked. RaidChangeService.setBoss (/boss,
the map's Change...) refuses a change that would make an Elite egg
without a hatch time, whatever the raid was, with Matt's words.
eggNeedsHatchTime is the one rule for /raid, the screenshots and the
change; a test pins that moveBossTier never makes an Elite egg.

**Files:**

```
 docs/architecture/parties-and-posts.md     |  2 +-
 docs/architecture/screenshots.md           |  2 +-
 src/commands/raids/raid-input.ts           |  5 ++++-
 src/domain/ocr/screenshot-decision.test.ts | 41 +++++++++++++++++++++++++++++++++++++++++
 src/domain/ocr/screenshot-decision.ts      | 16 ++++++++++++----
 src/domain/party/boss-move.test.ts         | 14 ++++++++++++++
 src/domain/party/party.ts                  |  2 ++
 src/domain/pogo/raid-tier.ts               |  9 +++++++++
 src/render/activity.test.ts                |  6 ++++++
 src/render/activity.ts                     |  6 ++++++
 src/render/screenshot-reading.test.ts      |  3 +++
 src/render/screenshot-reading.ts           |  2 ++
 src/services/raid-change-service.test.ts   | 35 ++++++++++++++++++++++++++++++++++-
 src/services/raid-change-service.ts        | 18 ++++++++++++------
 14 files changed, 147 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/ocr/screenshot-decision.test.ts src/domain/party/boss-move.test.ts src/render/activity.test.ts src/render/screenshot-reading.test.ts src/services/raid-change-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d8be1eeab388db2a1b1027fb7d4fcbe2ade12d6d -- src test docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8F-1 task 1: no timeless Elite egg`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index c7c16ca4284336a177f93dd98cdb2681808dd647..871c2082776c76a005afc0a87d9f7fce0005c946 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -28,7 +28,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 ## Raids
 
 - **One raid per gym, of any kind** (plan 8E; Matt, 2026-10-26: an elite raid shows its egg on the gym, usually from the evening before, so it blocks a standard raid there, and a standard raid blocks an elite one; EX raids once coexisted with normal ones, elite raids do not). The rule is `raidStandingAt(raids, guildId, gymId, now, except?)` over `standsAtGym(raid, guildId, gymId, now)` (`src/domain/party/raid.ts`: a raid of the server at the gym and `blocksNewRaid`, whatever its tier), and nothing else decides it: `PartyStore.raidAt(guildId, gymId, now)` (every report through `addRaidUnlessTaken`, with the reported party's `guildId`: `/raid`, screenshots, the map's `POST /api/raids`, `relocate`; and `/location`'s refusal before its dialog) and `RaidChangeService`'s check of a change of gym, tier or times (`gym-taken`; a raid that already stood at the gym may be changed whatever else is there, its tier from standard to elite and back included). A raid stands at a gym for its server only (review E7, as `maxAt`): a gym that two servers share takes a raid in each, though the gym's lock (`withGymLock`) stays one per gym. A report that meets a raid of the other kind joins it as one of another tier does (`exists`, the automatic status; nothing of the report, tier, boss or times, is applied to it). Raids are not compared by kind (`raidKindOf`) for this anywhere; `raidKindOf` serves the durations only. Two raids stored at one gym before plan 8E (a standard and an elite) are left as they are: each runs out by its clock and may still be changed at its own gym, and `raidAt` answers the older (`active()` is oldest first); the map's gym popup lists more than one raid only for them (`web.md`).
-- **An Elite egg is reported with its hatch time** (review 8E-1 of plan 8E; a provisional ruling, Matt to confirm): without one it would stand for the whole elite incubation (`eliteRaidIncubateDuration`, about a day) and, by the rule above, keep every other report off its gym. `reportedTime` (`src/commands/raids/raid-input.ts`) refuses it with `ELITE_EGG_NEEDS_TIME`, the one check that `/raid`, the map's `POST /api/raids` and a typed report beside a screenshot that could not be read all go through (the page has no check of its own). An Elite raid seen hatched (a boss named, or `hatched`) without a time stands its usual 30 minutes, as before. A screenshot that was read carries its countdown and is not refused: one whose countdown or stage could not be read (`ScreenshotRaid.time` undefined: no countdown, `countdown-long`, the stage unknown) still reports an Elite egg without a time, and so does a typed Elite egg beside a read screenshot that showed none. A change does not ask it either: `/boss` or 8X-J's `moveBossTier` making a timeless egg Elite leaves it timeless.
+- **An Elite egg is reported with its hatch time** (review 8E-1 of plan 8E; Matt, 2026-10-29): without one it would stand for the whole elite incubation (`eliteRaidIncubateDuration`, about a day) and, by the rule above, keep every other report off its gym. `reportedTime` (`src/commands/raids/raid-input.ts`) refuses it with `ELITE_EGG_NEEDS_TIME`, the one check that `/raid`, the map's `POST /api/raids` and a typed report beside a screenshot that could not be read all go through (the page has no check of its own). An Elite raid seen hatched (a boss named, or `hatched`) without a time stands its usual 30 minutes, as before. Which eggs need the time is `eggNeedsHatchTime` (`src/domain/pogo/raid-tier.ts`), asked by every path below. Plan 8F-1 closed the two other paths (Matt, 2026-10-29): a screenshot whose result is an Elite egg without a time (its stage not read, also an Elite egg typed over such a read) is refused by `decide` with `elite-egg-time`, before any gym is asked; and `RaidChangeService.setBoss` (`/boss`, the map's Change…) refuses a change whose result is an Elite egg without a hatch time, whatever the raid was, with the `PartyProblem` `elite-egg-time` ("once staff delete this egg, report it again with `/raid` and its hatch time": `/hatch` judges a time by the egg's current tier, so it cannot set one hours ahead). 8X-J's `moveBossTier` moves only raids with a boss, so it never makes an Elite egg (pinned by a test).
 - What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, and staff's `moveBossTier` (plan 8X-J: an `/admin boss add` that moves a boss to another tier of its group moves the running raids through the same `apply`, with no member, so no `noteMember` and no notifier; a raid the move would put in the way of another is left, which since plan 8E cannot happen for a raid: only a running raid moves, `blocksNewRaid`, and a running raid stands at its gym already, so the `in-the-way` count stays only as a guard), each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time…" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares; a report that would put the member in a forum somebody keeps them out of (the forum the new raid would go to, or that of the raid that stands at the gym now, `raidAt`, which may stand in another region's forum; a raid over by the clock bars nothing, review 8E-2: `reportBarred`, the map's check too) is refused with `REPORT_BARRED` (plan 8M-6), by `/raid`'s guard before its throttle for a gym typed outright, and once the gym is known (`withGym`) for one chosen from a menu or read from a screenshot (counted then), and again on "Report it there" after the question about a gym of another region (the access may have changed since); a failure of Discord to say propagates. A screenshot posted in a region channel is checked the same way before it is reported, unasked or once its gym is picked (`reportShot`, `screenshots.md`). The check reads `parties.active()` and asks Discord before the report, outside `PartyStore.update`, so when two members report a gym of two regions within moments, the first one's raid may appear in a forum the second's check did not see; the report therefore asks again where it would join a raid already at the gym (plan 8W-3: `RaidReport.mayJoin`, `mayJoinAs` / `mayJoinNoting` of `report.ts`, asked once the raid to join is known, not for the region's own forum, which every caller checked already; inside `PartyStore.update` a raid whose forum is not the one asked about any more is not joined either) and answers `barred` (`REPORT_BARRED`; the map 403, Discord away 503; a screenshot `unknown-access`) without signing them up; such a refusal comes after the throttle, so it counts as a use of `/raid` (on the map too, `raid-report.test.ts`). What is left is a change of the member's own access between that question and the write, as for any check of access. It decides inside the store under the locks of the gyms concerned, refuses a change after which the raid would stand at a gym where another raid of its server stands (`raidStandingAt`, plan 8E), moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
 - The post of an egg shows the game's egg (`raidEggName`, `src/domain/pogo/raid-eggs.ts`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture, the boss it names and where Where says it is (`place`: the gym's name as the post shows it, its point and address line; plan 8M-6), decided as for the post. The pictures are square (plan 8D-F, Matt, 2026-10-17: PokeMiners' icons are 112 by 128 and a phone crops a thumbnail to a square, cutting the egg's bottom off): `scripts/eggs/make-eggs.ts` (`npm run eggs:make`, the one step that downloads them, from `RAID_EGG_PICTURES_URL`'s pinned commit) padded each with transparency to a square of its longer side, the egg centred and unscaled, into `pictures/eggs/`, which is committed and in the image; nothing is fetched at run time, and `settings.raidEggPicturesUrl` is retired (`RETIRED_SETTINGS`). `EggPictures` (`src/services/egg-pictures.ts`, `PartyServiceOptions.eggPictures`) says where a post takes one from: once the web server listens (`src/app.ts` calls `serving()`, through `picturesServed` of `src/app-wiring.ts` with the pictures of the stops, when `startWebServer` answered true, so a port it could not take leaves the files) with `settings.web` at a public address that is not this machine's, the bot's own web server (`<publicUrl>/eggs/<name>.png?v=<8 hex>`, the start of the file's SHA-256, so that a cached picture never hides an egg made again; `web.md`); otherwise, and until then, the message carries the file and shows it as `attachment://<name>.png` (`RaidPostView.eggFile`, `PostLayout.pictureFile`, `PartyBrief.pictureFile`). Every post message says which files it has (`files`, `[]` when none: `postMessage`), and an edit that says so replaces the files the message had (`editAs` sends `attachments: []` and the files uploaded again; a conversion sends them through the REST route with `attachments` by index, `uploadsOf`), as Discord documents it: an edit keeps only the attachments it names. So the egg's file is uploaded again with every edit while it is an egg (some 22 KB), and the edit at hatch takes it away. A copy in another channel and the direct message's brief carry the same file. Where the bot may not attach files Discord answers Missing Permissions (50013), not Invalid Form Body: `isRefusedFile` (`src/discord/party-gateway.ts`, over `looksLikeRefusedFile`: 50013, 50035, 40005 or an error of reading the file, for a message that carries files) has a post, its edit and a copy sent once more without the file (`PostVariant.files: false`: the egg left out, pictures by address kept; `postForms`, `sendInForms`, `src/services/refused-files.ts`), and then in its other forms if Discord refuses one (`FormTrail`, below the controls); once a form without the file goes through (also one that needed plain emoji or no pictures as well), the forum, the post or the channel of copies is remembered for ten minutes (`RefusedFiles`, shared by `PartyService` and `PartyMirrors`), so that its next messages go without the file at once, with no refused call and no warning each time; a post made by its line of text after the first way had its file refused edits the line in without the file at once. Invalid Form Body is never noted as refused files (when a post is made it is taken as a refused first message; an edit or a copy refused so may have been refused for what it holds): only another refusal of the file is.
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 5e86d39148858cb437b9147fe8eb4fcb21dff026..d85cc5c12f02130b1dbe4b92f470369115117c2b 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -11,7 +11,7 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 ## The report and the decision
 
 - `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain; a CP that fits no boss takes the one boss of the heads' tier one digit off when the name read is clearly its; when no listed boss fits a hatched raid, a Pokémon of the game data (`ReportContext.pokemon`) whose raid CP at the heads' tier is the CP read or one digit off and whose name is nearly exactly the name read, clearly no other's, is taken as `/raid t5 azelf` takes it, by the same rule, `bossAtTier` (`utilities.md`; Matt, 2026-10-25: the readers decide as the commands do): off the list it is an `UnlistedRaidBoss` with the doubt `boss-unlisted` ("The boss is on no list of current raid bosses: …"), reported and posted as `/raid` with its tier typed reports it (`screenshotBoss`); listed in another level or as the other shadow kind, or the plain Pokémon in a mega raid, it is no boss), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). What is done with it is `decide` (below); its doubts are what the "Screenshot feedback" button shows. The gym's name may run onto a second line read together with other text (the caption of the gym's picture: "AMBASSADOR PROGRAM C 0 murit Outgoing", which the picture's rule cuts away): the line just under the name is kept as read (`ScreenText.gymBelow`), and when no try of `gymOfText` is clear, its words that look like a name's (`NAME_LIKE`: capitalized, or a number) are added and tried again (Matt, 2026-10-24, "Pittsburgh Campsite -" and "Outgoing").
-- Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `readPanes(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
+- Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `readPanes(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an Elite egg without a time `elite-egg-time` (plan 8F-1, before the gym is asked), an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
 - A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, the Pokémon search narrowed to the max bosses `/max` takes (`typedMaxBoss`: listed, also before the game master has it as one, or let battle so by the game) and the species the list has in any form (of every Pokémon on an Eternamax screen: the game data lists Eternatus for no max battle; Matt, 2026-10-25: before, a search of what the game lets battle found Kingler for a cut-short "Kingdr" beside a listed Kingdra) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon `/max` takes off the list in a tier of the screen's kind (`typedMaxBoss`'s `others`) with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown's at a whole minute (`wholeMinute`: the next one after a clock's moment, which says the minute only, the nearest after a file's; review S-4) capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), an all-day Dynamax countdown (one that runs past the last battle time) at the start of a max event later that day (`dayBattleEnd`, as `/max`'s default, Q-B: on a Max Battle Day the day's spots show their countdown to about 05:00 in the morning too, and the event's bosses replace them at its start; a countdown to a rotation, an event's battle up early, is kept; Matt, 2026-10-24), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `capped`: the end is the day's last battle time, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old, and never with an end typed beside it, review F-5), with no ending-soon question; a default end (no countdown) passed by the upload is `over-for-today` too. `withSpot(report, spot)` puts in the spot a member chose. A species on the boss list counts though the game master does not have it as a max boss yet (the read name looked up among every Pokémon when the max-able search finds nothing; Matt, 2026-10-24: Pokebattler listed Azelf at 5★ first, and "Azelf" read found no boss).
 - `ScreenshotService.readPanes` tells the kind of screen of each pane by its reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search (`ctx.pokemon.find`, best fit, with the filter the report gives it), the catalogue, the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:` refuses a max screen, "That is a max battle: use `/max screenshot:`, or post it with a mention." (`MAX_SCREEN_FOR_RAID`), also beside a typed boss and gym (the wrong picture: no `typedOnly`); the mention and passive reading take either kind ("On Discord"); `/read-screenshot` shows a max reading (below). Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
diff --git a/src/commands/raids/raid-input.ts b/src/commands/raids/raid-input.ts
index e5cf919d45223f57935244c95287683961fdb6d5..1d23fa2301563cfc40070dc60ac98efc4ff50f6b 100644
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -7,6 +7,7 @@ import { bossAtTier, MEGA_LEVELS } from '../../domain/pogo/boss-at-tier.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import type { RaidBoss } from '../../domain/pogo/raid-bosses.js';
 import {
+  eggNeedsHatchTime,
   isRaidLevel,
   RAID_LEVELS,
   raidDurationKind,
@@ -657,7 +658,9 @@ export function reportedTime(
 ): { hatch: number } | { end: number } | undefined {
   const kind = raidDurationKind(reported.tier);
   if (text === null || text.trim() === '') {
-    if (kind === 'elite' && reported.boss === null) throw new UserError(ELITE_EGG_NEEDS_TIME);
+    if (reported.boss === null && eggNeedsHatchTime(reported.tier)) {
+      throw new UserError(ELITE_EGG_NEEDS_TIME);
+    }
     return undefined;
   }
   const { settings } = ctx.config;
diff --git a/src/domain/ocr/screenshot-decision.test.ts b/src/domain/ocr/screenshot-decision.test.ts
index 9b1f7eb883b444fdee9367b66d93817f02cfb1fe..921f0f14af4d3b77e1efdcef38c50ba19e8bb23e 100644
--- a/src/domain/ocr/screenshot-decision.test.ts
+++ b/src/domain/ocr/screenshot-decision.test.ts
@@ -148,6 +148,47 @@ describe('decide', () => {
     }
   });
 
+  it('refuses an Elite egg whose hatch time it could not read, before asking which gym', () => {
+    const elite = { level: 'Elite', shadow: false } as const;
+    const noStage = report({ tier: elite, stage: null, time: null, doubts: ['stage-unknown'] });
+    expect(decide(noStage)).toEqual({ kind: 'refuse', reason: 'elite-egg-time' });
+    const unclear = report({
+      tier: elite,
+      stage: null,
+      time: null,
+      gym: { read: 'Plant', searched: 'Plant', gymId: 9, place: 'local', clear: false },
+      doubts: ['gym-unclear', 'stage-unknown'],
+    });
+    expect(decide(unclear)).toEqual({ kind: 'refuse', reason: 'elite-egg-time' });
+    // With its countdown, hatched, or past its hatch, it is reported as before.
+    expect(decide(report({ tier: elite }))).toMatchObject({
+      kind: 'report',
+      raid: { hatched: false, time: { hatch: 601_000 } },
+    });
+    expect(
+      decide(report({ tier: elite, stage: 'hatched', time: null, doubts: ['no-time'] })),
+    ).toMatchObject({ kind: 'report', raid: { hatched: true, time: undefined } });
+    expect(
+      decide(report({ tier: elite, time: { hatch: 1_000 }, doubts: ['time-past'] })),
+    ).toMatchObject({ kind: 'report', raid: { hatched: true } });
+  });
+
+  it('refuses an Elite egg typed over a read without a stage, unless a time is typed too', () => {
+    const unknown = report({ stage: null, time: null, doubts: ['stage-unknown', 'no-time'] });
+    const eliteEgg = {
+      tier: { level: 'Elite', shadow: false },
+      boss: null,
+      hatched: false,
+    } as const;
+    expect(decide(withTyped(unknown, { boss: eliteEgg }))).toEqual({
+      kind: 'refuse',
+      reason: 'elite-egg-time',
+    });
+    expect(
+      decide(withTyped(unknown, { boss: eliteEgg, time: { hatch: 5_000_000 } })),
+    ).toMatchObject({ kind: 'report', raid: { hatched: false, time: { hatch: 5_000_000 } } });
+  });
+
   it('asks rather than report a raid without a tier', () => {
     expect(decide(report({ tier: null, doubts: ['tier-unknown'] }))).toEqual({
       kind: 'ask',
diff --git a/src/domain/ocr/screenshot-decision.ts b/src/domain/ocr/screenshot-decision.ts
index 023e530b053ca646f6b708fd684cf608f174e7fc..bf6066424070f54c76b3e4ae9e2a20a28dbc9276 100644
--- a/src/domain/ocr/screenshot-decision.ts
+++ b/src/domain/ocr/screenshot-decision.ts
@@ -1,5 +1,5 @@
 import type { RaidBoss } from '../pogo/raid-bosses.js';
-import type { RaidTier } from '../pogo/raid-tier.js';
+import { eggNeedsHatchTime, type RaidTier } from '../pogo/raid-tier.js';
 import type { ReportBoss, ReportDoubt, ScreenshotReport } from './screenshot-report.js';
 
 /**
@@ -11,8 +11,12 @@ import type { ReportBoss, ReportDoubt, ScreenshotReport } from './screenshot-rep
  * remain are what the "Screenshot feedback" button shows.
  */
 export type ScreenshotDecision =
-  /** `raid-over`: by its countdown the raid has already ended. */
-  | { kind: 'refuse'; reason: 'not-a-raid-screen' | 'no-gym' | 'raid-over' }
+  /**
+   * `raid-over`: by its countdown the raid has already ended. `elite-egg-time`: an Elite egg
+   * whose hatch time is not known (plan 8F-1, 8E-1): it would stand its whole incubation and
+   * block every other report at its gym, so it is reported only with `/raid` and its time.
+   */
+  | { kind: 'refuse'; reason: 'not-a-raid-screen' | 'no-gym' | 'raid-over' | 'elite-egg-time' }
   /** The gym is not clear (or the tier, which a raid screen always has): the member chooses. */
   | { kind: 'ask'; doubts: ReportDoubt[] }
   | { kind: 'report'; raid: ScreenshotRaid; doubts: ReportDoubt[] };
@@ -132,7 +136,7 @@ const UNCERTAIN: readonly ReportDoubt[] = ['time-guessed', 'time-stale', 'time-s
  * of the screenshot was known: then the countdown gave the hatch exactly), with the boss it was
  * read with or the one a hatch would give it, and refused when that end has passed too (one
  * whose tier was not read is asked about like any raid without a tier). A countdown longer
- * than a raid lasts is left out.
+ * than a raid lasts is left out. An Elite egg without its hatch time is refused (8E-1).
  */
 export function decide(report: ScreenshotReport, context: DecideContext): ScreenshotDecision {
   const { doubts } = report;
@@ -153,6 +157,10 @@ export function decide(report: ScreenshotReport, context: DecideContext): Screen
     boss = report.boss ?? context.autoset(report.tier) ?? null;
     time = { end };
   }
+  // Refused before the gym is asked: no gym picked could make it a raid.
+  if (report.tier && eggNeedsHatchTime(report.tier) && !hatched && time === undefined) {
+    return { kind: 'refuse', reason: 'elite-egg-time' };
+  }
   if (!report.gym.clear || report.tier === null) return { kind: 'ask', doubts };
   // The countdown of an egg past its hatch gives the hatch exactly only when the moment of the
   // screenshot is known (by its file or its clock), however long ago that was.
diff --git a/src/domain/party/boss-move.test.ts b/src/domain/party/boss-move.test.ts
index 895f95a59e564e6bc3bd78de6a65abdbf2d50114..3b40d047e6c1b30e44591cf77d86a3bcf2de7008 100644
--- a/src/domain/party/boss-move.test.ts
+++ b/src/domain/party/boss-move.test.ts
@@ -90,6 +90,20 @@ describe('bossTierMoved (plan 8X-J)', () => {
     expect(bossTierMoved(egg, move, rules, at('2026-10-13T15:45'))).toBe(egg);
   });
 
+  // Plan 8F-1 (8E-1): only a raid with a boss moves, so a move to Elite never makes an Elite egg,
+  // which would need its hatch time.
+  it('never makes an Elite egg, with or without a hatch time', () => {
+    const T5: RaidTier = { level: 'T5', shadow: false };
+    const toElite: BossTierMove = {
+      boss: { key: 'mewtwo', names: ['Mewtwo'] },
+      from: [T5],
+      to: { level: 'Elite', shadow: false },
+    };
+    const egg = testRaid({ tier: T5 });
+    expect(egg.raid.boss).toBeNull();
+    expect(bossTierMoved(egg, toElite, rules, PARTY_NOW)).toBe(egg);
+  });
+
   it('never moves a raid by a max move, nor a max battle by a raid move', () => {
     const raid = testRaid({ tier: T3, boss: { key: 'sneasel' } });
     expect(bossTierMoved(raid, SNEASEL, rules, PARTY_NOW)).toBe(raid);
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index d407573d26a22f215e78fe8e5db29f720d6790cd..e1ccbf42fa15a680e3e4ede3a73e453a57ab540c 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -655,6 +655,8 @@ export type PartyProblem =
   | 'start-after-end'
   /** Another raid of this kind already holds the gym. */
   | 'gym-taken'
+  /** The change would make an Elite egg without its hatch time (plan 8F-1, 8E-1). */
+  | 'elite-egg-time'
   /** Another max battle already holds the spot (plan 8X-3: a later end of an ended one). */
   | 'spot-taken'
   /**
diff --git a/src/domain/pogo/raid-tier.ts b/src/domain/pogo/raid-tier.ts
index 2b6b71d260080430250f4774dafff3609d8eb0c5..f09d5f9652211f1d90e6cae03386f899df1509dc 100644
--- a/src/domain/pogo/raid-tier.ts
+++ b/src/domain/pogo/raid-tier.ts
@@ -134,6 +134,15 @@ export function raidDurationKind(tier: RaidTier): RaidKind {
   return DURATION_KIND[tier.level];
 }
 
+/**
+ * Whether an egg of this tier is made only with its hatch time (review 8E-1 of plan 8E, plan
+ * 8F-1): without it an Elite egg would stand its whole incubation, about a day, and keep every
+ * other report off its gym. `/raid`, the map, the screenshot readers and a change of tier ask it.
+ */
+export function eggNeedsHatchTime(tier: RaidTier): boolean {
+  return raidDurationKind(tier) === 'elite';
+}
+
 export function sameRaidTier(a: RaidTier, b: RaidTier): boolean {
   return a.level === b.level && a.shadow === b.shadow;
 }
diff --git a/src/render/activity.test.ts b/src/render/activity.test.ts
index 342abbebe91b76109b7c7c594324be4166f48984..099b0a7bbc219399c022a58a8e636c725abdb7dc 100644
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -132,6 +132,12 @@ describe('problemText', () => {
     );
   });
 
+  it('says how an Elite egg without its hatch time is reported (8E-1)', () => {
+    expect(problemText('elite-egg-time', { maxNumber: 21 }, 'raid')).toBe(
+      'An Elite egg needs its hatch time: once staff delete this egg, report it again with `/raid` and its hatch time.',
+    );
+  });
+
   it('says what a train refuses: its route, its moves, its conductor', () => {
     const said = (reason: PartyProblem) => problemText(reason, { maxNumber: 21 }, 'train');
     expect(said('not-attending')).toBe('You are not signed up for this train.');
diff --git a/src/render/activity.ts b/src/render/activity.ts
index d0222e5cc7e573926559e30ca0f517e40e86b7d4..58a5e9c23817eb00ecbd8d663da91a1ac2179842 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -134,6 +134,12 @@ export function problemText(
       return `You are done with this ${word === 'max battle' ? word : 'raid'}. Use Join or Here if you are back.`;
     case 'gym-taken':
       return 'That gym already has a raid.';
+    case 'elite-egg-time':
+      // Matt, 2026-10-29 (A): `/hatch` judges a time by the egg's tier, so it cannot set it.
+      return (
+        'An Elite egg needs its hatch time: once staff delete this egg, report it again with ' +
+        '`/raid` and its hatch time.'
+      );
     case 'spot-taken':
       return 'That spot has another max battle by now: this one stays as it is.';
     case 'max-kind-change':
diff --git a/src/render/screenshot-reading.test.ts b/src/render/screenshot-reading.test.ts
index 6bc919954c0a9d68141ae1414b1986c8d6b65d92..9e3e73c40597666c9e3361b5a25f201a46a37d9e 100644
--- a/src/render/screenshot-reading.test.ts
+++ b/src/render/screenshot-reading.test.ts
@@ -144,6 +144,9 @@ describe('shortReading', () => {
   it('words a refusal', () => {
     expect(refusalWords('no-gym')).toMatch(/gym/);
     expect(refusalWords('raid-over')).toBe('By its countdown this raid has already ended.');
+    expect(refusalWords('elite-egg-time')).toBe(
+      'I could not read when this Elite egg hatches: report it with `/raid` and its hatch time.',
+    );
   });
 });
 
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index 3f32fe07ccfc5500168c1f981218978d03b98792..afefef35ad32d3cd4cf24a694cc5ad1320f23d5e 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -431,6 +431,8 @@ export function refusalWords(reason: string, passive = false): string {
       return 'I could not find the gym of this screenshot among this server’s gyms.';
     case 'raid-over':
       return 'By its countdown this raid has already ended.';
+    case 'elite-egg-time':
+      return 'I could not read when this Elite egg hatches: report it with `/raid` and its hatch time.';
     case 'two-screens':
       return TWO_SCREENS;
     case 'several':
diff --git a/src/services/raid-change-service.test.ts b/src/services/raid-change-service.test.ts
index 1c2110fa64232749f26e2a44d4b46b3430b33169..08f5509df9a33d614af36e4eccbcf582d2f3abd5 100644
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -299,6 +299,34 @@ describe('RaidChangeService: boss and moves', () => {
     expect(await lines(made)).toEqual([`**Alice** (<@${ALICE}>) changed this to: T3 egg.`]);
   });
 
+  it('refuses to make an Elite egg without a hatch time, whatever the raid was (8E-1)', async () => {
+    const eliteEgg = { tier: ELITE, boss: null, label: 'Elite egg' };
+    for (const report of [{}, { boss: { key: 'yveltal' } }] as const) {
+      const made = await reportedRaid(report);
+      const before = made.current();
+      expect(await made.raids.setBoss(made.party.id, alice, eliteEgg)).toEqual({
+        kind: 'refused',
+        reason: 'elite-egg-time',
+      });
+      expect(made.current()).toBe(before);
+      expect(await lines(made)).toEqual([]);
+    }
+    // With its hatch time it may become one, and an Elite boss needs no time.
+    const timed = await reportedRaid({ time: { hatch: HATCH } });
+    expect(await timed.raids.setBoss(timed.party.id, alice, eliteEgg)).toMatchObject({
+      kind: 'ok',
+      changed: true,
+    });
+    const boss = await reportedRaid();
+    expect(
+      await boss.raids.setBoss(boss.party.id, alice, {
+        tier: ELITE,
+        boss: { key: 'yveltal' },
+        label: 'Yveltal (Elite)',
+      }),
+    ).toMatchObject({ kind: 'ok', changed: true });
+  });
+
   it('changes nothing for the boss the raid has', async () => {
     const made = await reportedRaid({ boss: { key: 'yveltal' } });
     const outcome = await made.raids.setBoss(made.party.id, alice, {
@@ -673,7 +701,12 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
       }),
     ).toMatchObject({ kind: 'ok', changed: true });
     expect(
-      await made.raids.setBoss(standard.id, bob, { tier: ELITE, boss: null, label: 'Elite egg' }),
+      // A boss: an Elite egg would need a hatch time (plan 8F-1).
+      await made.raids.setBoss(standard.id, bob, {
+        tier: ELITE,
+        boss: { key: 'yveltal' },
+        label: 'Yveltal (Elite)',
+      }),
     ).toMatchObject({ kind: 'ok', changed: true });
   });
 
diff --git a/src/services/raid-change-service.ts b/src/services/raid-change-service.ts
index 9a5565289f1234988253484d7b3c6ee3cd0e4d61..b55c1ed62f2a10b4478a7bc5909c5af5e5a1fece 100644
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -29,7 +29,7 @@ import {
   timeConfirmed,
 } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
-import type { RaidTier } from '../domain/pogo/raid-tier.js';
+import { eggNeedsHatchTime, type RaidTier } from '../domain/pogo/raid-tier.js';
 import type { RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
 import { doer } from '../render/activity.js';
@@ -228,6 +228,8 @@ export class RaidChangeService {
   /**
    * The boss, or the tier of an egg (`boss` null); `label` is how the line names it (`Yveltal
    * (T5)`, `T3 egg`), already made plain by the caller (`reportedBoss`). A boss with only one fast or one charged move has it set (`certainMoves`).
+   * Refused with `elite-egg-time` when it would make an Elite egg without its hatch time, whatever
+   * the raid was (plan 8F-1, 8E-1).
    */
   setBoss(
     partyId: string,
@@ -241,15 +243,19 @@ export class RaidChangeService {
     return this.apply(
       partyId,
       member,
-      (party, rules, now) => ({
-        ok: true,
-        party: setBoss(
+      (party, rules, now) => {
+        const next = setBoss(
           party,
           { tier: change.tier, boss: change.boss, ...certainMoves(entry) },
           rules,
           now,
-        ).party,
-      }),
+        ).party;
+        const timelessElite =
+          next.raid.boss === null && next.hatchTime === null && eggNeedsHatchTime(next.raid.tier);
+        return next !== party && timelessElite
+          ? refused('elite-egg-time')
+          : { ok: true, party: next };
+      },
       (party) =>
         change.boss === null
           ? `${said(party, member, 'changed this', 'This was changed')} to: ${change.label}.`
````

### Task 2: 8F-1 task 2: a cut Power Spot name that fits other regions asks

Prototype commit: `3bf0b55bf6d79cc1e03400b61e85111146137186`

matchPowerSpot takes a name cut short as clear only when it starts the
title of one Power Spot in the whole server: one of the channel's region
and others elsewhere are candidates, the region's first. A mention or
/max screenshot: asks with the existing pick list; read passively such a
screenshot reports nothing (Matt, 2026-10-29: a missed report is safer
than a wrong spot). A title equal to the whole name still wins.

**Files:**

```
 docs/architecture/screenshots.md             |  2 +-
 src/commands/screenshots/mention.max.test.ts | 36 ++++++++++++++++++++++++++++++++++++
 src/domain/ocr/power-spot-match.test.ts      | 12 ++++++++++++
 src/domain/ocr/power-spot-match.ts           | 11 ++++++++---
 4 files changed, 57 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/screenshots/mention.max.test.ts src/domain/ocr/power-spot-match.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3bf0b55bf6d79cc1e03400b61e85111146137186 -- src test docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8F-1 task 2: a cut Power Spot name that fits other regions asks`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index d85cc5c12f02130b1dbe4b92f470369115117c2b..2ed641dc7920019e260c37b371d1eb9a55009f16 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -13,7 +13,7 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 - `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain; a CP that fits no boss takes the one boss of the heads' tier one digit off when the name read is clearly its; when no listed boss fits a hatched raid, a Pokémon of the game data (`ReportContext.pokemon`) whose raid CP at the heads' tier is the CP read or one digit off and whose name is nearly exactly the name read, clearly no other's, is taken as `/raid t5 azelf` takes it, by the same rule, `bossAtTier` (`utilities.md`; Matt, 2026-10-25: the readers decide as the commands do): off the list it is an `UnlistedRaidBoss` with the doubt `boss-unlisted` ("The boss is on no list of current raid bosses: …"), reported and posted as `/raid` with its tier typed reports it (`screenshotBoss`); listed in another level or as the other shadow kind, or the plain Pokémon in a mega raid, it is no boss), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). What is done with it is `decide` (below); its doubts are what the "Screenshot feedback" button shows. The gym's name may run onto a second line read together with other text (the caption of the gym's picture: "AMBASSADOR PROGRAM C 0 murit Outgoing", which the picture's rule cuts away): the line just under the name is kept as read (`ScreenText.gymBelow`), and when no try of `gymOfText` is clear, its words that look like a name's (`NAME_LIKE`: capitalized, or a number) are added and tried again (Matt, 2026-10-24, "Pittsburgh Campsite -" and "Outgoing").
 - Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `readPanes(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an Elite egg without a time `elite-egg-time` (plan 8F-1, before the gym is asked), an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
-- A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, the Pokémon search narrowed to the max bosses `/max` takes (`typedMaxBoss`: listed, also before the game master has it as one, or let battle so by the game) and the species the list has in any form (of every Pokémon on an Eternamax screen: the game data lists Eternatus for no max battle; Matt, 2026-10-25: before, a search of what the game lets battle found Kingler for a cut-short "Kingdr" beside a listed Kingdra) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon `/max` takes off the list in a tier of the screen's kind (`typedMaxBoss`'s `others`) with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown's at a whole minute (`wholeMinute`: the next one after a clock's moment, which says the minute only, the nearest after a file's; review S-4) capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), an all-day Dynamax countdown (one that runs past the last battle time) at the start of a max event later that day (`dayBattleEnd`, as `/max`'s default, Q-B: on a Max Battle Day the day's spots show their countdown to about 05:00 in the morning too, and the event's bosses replace them at its start; a countdown to a rotation, an event's battle up early, is kept; Matt, 2026-10-24), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `capped`: the end is the day's last battle time, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old, and never with an end typed beside it, review F-5), with no ending-soon question; a default end (no countdown) passed by the upload is `over-for-today` too. `withSpot(report, spot)` puts in the spot a member chose. A species on the boss list counts though the game master does not have it as a max boss yet (the read name looked up among every Pokémon when the max-able search finds nothing; Matt, 2026-10-24: Pokebattler listed Azelf at 5★ first, and "Azelf" read found no boss).
+- A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, the Pokémon search narrowed to the max bosses `/max` takes (`typedMaxBoss`: listed, also before the game master has it as one, or let battle so by the game) and the species the list has in any form (of every Pokémon on an Eternamax screen: the game data lists Eternatus for no max battle; Matt, 2026-10-25: before, a search of what the game lets battle found Kingler for a cut-short "Kingdr" beside a listed Kingdra) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon `/max` takes off the list in a tier of the screen's kind (`typedMaxBoss`'s `others`) with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); of equal titles exactly one in the channel's region, else exactly one in the server, is clear, of titles a cut name starts only exactly one in the server (plan 8F-1, Matt 2026-10-29: one here and others elsewhere are asked with a mention or `/max screenshot:`, and read passively report nothing, `MAX_SPOT_UNTOLD`, a missed report being safer than a wrong spot); otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown's at a whole minute (`wholeMinute`: the next one after a clock's moment, which says the minute only, the nearest after a file's; review S-4) capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), an all-day Dynamax countdown (one that runs past the last battle time) at the start of a max event later that day (`dayBattleEnd`, as `/max`'s default, Q-B: on a Max Battle Day the day's spots show their countdown to about 05:00 in the morning too, and the event's bosses replace them at its start; a countdown to a rotation, an event's battle up early, is kept; Matt, 2026-10-24), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `capped`: the end is the day's last battle time, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old, and never with an end typed beside it, review F-5), with no ending-soon question; a default end (no countdown) passed by the upload is `over-for-today` too. `withSpot(report, spot)` puts in the spot a member chose. A species on the boss list counts though the game master does not have it as a max boss yet (the read name looked up among every Pokémon when the max-able search finds nothing; Matt, 2026-10-24: Pokebattler listed Azelf at 5★ first, and "Azelf" read found no boss).
 - `ScreenshotService.readPanes` tells the kind of screen of each pane by its reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search (`ctx.pokemon.find`, best fit, with the filter the report gives it), the catalogue, the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:` refuses a max screen, "That is a max battle: use `/max screenshot:`, or post it with a mention." (`MAX_SCREEN_FOR_RAID`), also beside a typed boss and gym (the wrong picture: no `typedOnly`); the mention and passive reading take either kind ("On Discord"); `/read-screenshot` shows a max reading (below). Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
 - Screenshots that keep disagreeing with the boss list (plan 8X-J, design `2026-10-25-max-boss-tier-fix-design.md` section 2; the reader itself is unchanged: it keeps the list's tier). `ScreenshotService` records an observation of every read, from the reader's own report (never what was typed), the passive ones refused included, at the upload time (review I4), through its `tierWatch` (`ListTierWatch`, `src/services/list-tier-watch.ts`). What a screenshot says against the list is pure (`src/domain/ocr/list-tier-doubt.ts`): `maxTierObservation`, a listed Dynamax boss with heads read and `heads-boss-conflict` (Gigantamax never); `raidTierObservation` (review B1), a hatched raid without a boss whose CP and name at the heads' tier fit a Pokémon (`pokemonByCpAndName`, the very search `unlistedBossOf` makes) that the list has at another tier of the same kind (`bossAtTier`'s `listed-elsewhere`, plain and shadow apart, megas never), never an Elite raid on either side nor `heads-unverified` (6, 7 heads). A screenshot whose moment is known (by its file's name or a clock) and lies more than a day before the upload is no sighting (`momentTooOld`, review J10). An observation is the server, family, boss key, list's tier, heads' tier, member, place (the gym or Power Spot, its id or name as read) and time; `ListTierWatch` keeps a day of them per server in memory (a `BoundedMap`, 500 a server) and asks `listTierDoubt(observations, now)`: a sighting `LIST_TIER_SIGHTINGS` (3) screenshots show in `LIST_TIER_WINDOW_MS` (24 hours), from any members, a member and place counted once (Matt's answer 1). Then the moderators are told (`ModerationReports.listTier`, `moderation.md`) with the boss as the list has it now (none when it no longer has it so: staff fixed it) and, for a boss an add put there, that add's number, both as `familyReport` gives them (review J8); nothing outside a region channel. Members' answers are unchanged.
 
diff --git a/src/commands/screenshots/mention.max.test.ts b/src/commands/screenshots/mention.max.test.ts
index 463d1e2de07de49dbef28c0395edbe2700316d12..9f3438d65fea55c5449d9947ff5d97d882a473d1 100644
--- a/src/commands/screenshots/mention.max.test.ts
+++ b/src/commands/screenshots/mention.max.test.ts
@@ -41,6 +41,15 @@ const POND = keptRow(2, {
   lon: TEST_SPOT.lon,
 });
 
+/** A Power Spot of the East region whose name begins as the test spot's (plan 8F-1). */
+const PAVILION = keptRow(3, {
+  id: 'c0ffee00c0ffee00c0ffee00c0ffee02.16',
+  kind: 'powerspot',
+  title: 'Gazebo of the Pavilion',
+  lat: 40.05,
+  lon: -79.95,
+});
+
 async function setup(
   options: { passive?: boolean; safety?: SafetyOptions; rows?: WayspotRow[] } = {},
 ) {
@@ -204,6 +213,20 @@ describe('a max battle’s screenshot posted with a mention of the bot', () => {
     expect(did).toContain('deleted');
   });
 
+  // Plan 8F-1 (Matt, 2026-10-29): a cut name that fits a spot here and one elsewhere is asked.
+  it('asks about a name cut short that fits a spot of the region and one of another', async () => {
+    const made = await setup({ rows: [PAVILION] });
+    const { replies } = await made.post(maxReading('GAZEBO OF THE PA'));
+    expect(made.store.active()).toEqual([]);
+    expect(menuOf(replies[0]).options).toEqual([
+      { label: 'Gazebo of the Park', value: TEST_SPOT.id },
+      { label: 'Gazebo of the Pavilion', value: PAVILION.id, description: 'east' },
+    ]);
+    // The whole name is still the spot of that name, unasked.
+    await made.post(maxReading(), {}, 'b.png');
+    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ id: TEST_SPOT.id });
+  });
+
   it('asks about a clear Power Spot of another region, naming its region in the menu', async () => {
     const made = await setup();
     const { replies } = await made.post(maxReading(), { channelId: EAST_CHANNEL });
@@ -330,6 +353,19 @@ describe('a max battle’s screenshot read passively', () => {
     expect(made.store.active()).toEqual([]);
   });
 
+  // Plan 8F-1 (Matt, 2026-10-29): a missed report is safer than a wrong spot.
+  it('reports nothing for a name cut short that fits a spot of the region and one of another', async () => {
+    const made = await setup({ passive: true, rows: [PAVILION] });
+    const { replies } = await made.post(maxReading('GAZEBO OF THE PA'));
+    expect(made.store.active()).toEqual([]);
+    expect(replies[0]?.content).toBe(
+      `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
+    );
+    // The whole name is still reported.
+    await made.post(maxReading(), {}, 'b.png');
+    expect(made.store.active()).toHaveLength(1);
+  });
+
   // Review S-1 (Matt, 2026-10-23): an event's picture of a boss has no countdown, a battle's
   // screen has one.
   it('does nothing at all with a screen without a countdown, whatever its Power Spot', async () => {
diff --git a/src/domain/ocr/power-spot-match.test.ts b/src/domain/ocr/power-spot-match.test.ts
index 8e3f6c318860c34c8a136d97700d25d9a027dae1..51a2b820023b0abd22bda0e29982eb31b607db96 100644
--- a/src/domain/ocr/power-spot-match.test.ts
+++ b/src/domain/ocr/power-spot-match.test.ts
@@ -52,6 +52,18 @@ describe('matchPowerSpot', () => {
     });
   });
 
+  it('asks about a cut name that fits a spot of the region and spots elsewhere (plan 8F-1)', () => {
+    // "Old Lantern Foun…" starts a title in the region and one elsewhere: the member chooses.
+    expect(matchPowerSpot('OLD LANTERN FOUN', SPOTS)).toEqual({
+      kind: 'candidates',
+      spots: [SPOTS[1], SPOTS[3]],
+    });
+    // Fitting a spot of the region only, or one spot elsewhere only, it stays clear.
+    const only = SPOTS.filter((spot) => spot.id !== 'b1');
+    expect(matchPowerSpot('OLD LANTERN FOUN', only)).toEqual({ kind: 'clear', spot: SPOTS[1] });
+    expect(matchPowerSpot('COPPERLEAF MU', SPOTS)).toEqual({ kind: 'clear', spot: SPOTS[4] });
+  });
+
   it('offers every title at least 80% alike when none matches outright, the region’s first', () => {
     const match = matchPowerSpot('OLD LANTERN FOUNTIAN', SPOTS);
     expect(match.kind).toBe('candidates');
diff --git a/src/domain/ocr/power-spot-match.ts b/src/domain/ocr/power-spot-match.ts
index 1221b3afbd139590da396cb808ef4206becbd77b..4a1275b58832d1141a39c177a9c3de98faf49097 100644
--- a/src/domain/ocr/power-spot-match.ts
+++ b/src/domain/ocr/power-spot-match.ts
@@ -61,8 +61,10 @@ function onlyOne(found: readonly SpotTitle[]): SpotTitle | undefined {
  * it is the start of (a name cut short), matches. Equal titles come first (review A4: "MAPLE
  * BENCH" is "Maple Bench", not "Maple Bench East"): exactly one in the channel's region, or
  * failing any there, exactly one in the server, is clear; only without an equal title are the
- * titles it is the start of looked at so. Otherwise every match and every title at least 80%
- * alike is a candidate, the region's first; none: unknown.
+ * titles it is the start of looked at, and one of them is clear only when it is the only one in
+ * the server (plan 8F-1: a cut name that fits a spot of the region and spots of other regions is
+ * asked). Otherwise every match and every title at least 80% alike is a candidate, the region's
+ * first; none: unknown.
  */
 export function matchPowerSpot(read: string | null, spots: readonly SpotTitle[]): SpotMatch {
   const name = read === null ? '' : spotNameKey(read);
@@ -72,7 +74,10 @@ export function matchPowerSpot(read: string | null, spots: readonly SpotTitle[])
     name.length >= CUT_NAME_MIN
       ? spots.filter((spot) => !equal.includes(spot) && spotNameKey(spot.title).startsWith(name))
       : [];
-  const clear = equal.length > 0 ? onlyOne(equal) : onlyOne(starts);
+  // A cut name is clear only when it fits one spot of the whole server (plan 8F-1, Matt
+  // 2026-10-29): one of the region and others elsewhere is asked, a missed report being safer
+  // than a wrong spot.
+  const clear = equal.length > 0 ? onlyOne(equal) : starts.length === 1 ? starts[0] : undefined;
   if (clear) return { kind: 'clear', spot: clear };
   const matches = [...equal, ...starts];
   const alike = spots
````

### Task 3: 8F-1 task 3: no bot-updates post for a stop-only import

Prototype commit: `04b361ca272795fc9fdfcb1708651218b4db8b49`

gymListSummary posts only when a gym was added, renamed, moved or
deleted (8W-3, Matt 2026-10-29): an import, or the review queue's
gathered counts, that changed only PokéStops or Power Spots posts
nothing, and the stop-only heading goes. A post with gym changes still
gives the stop counts. The import's three sentences that promise the
post say it comes when gyms changed.

The admin guides (2E-2): to keep a member out of a region's forum for
good, a permission overwrite on that forum; the region's role is not
enough, and Sync permissions removes Pine's overwrites until the hourly
sweep puts them back.

**Files:**

```
 docs/architecture/gyms-and-regions.md        |  2 +-
 docs/architecture/wayfarer.md                |  2 +-
 docs/guides/migrating-a-legacy-instance.md   |  1 +
 docs/guides/new-instance.md                  |  2 ++
 src/commands/gyms/import.test.ts             | 12 ++++++++++--
 src/commands/gyms/import.ts                  | 10 +++++-----
 src/render/gym-summary.test.ts               |  7 ++-----
 src/render/gym-summary.ts                    | 24 ++++++++++--------------
 src/services/gym-admin-service.test.ts       | 32 +++++++++++++++++++++++++++++++-
 src/services/wayfarer-import-service.test.ts | 10 ++++------
 10 files changed, 67 insertions(+), 35 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/gyms/import.test.ts src/render/gym-summary.test.ts src/services/gym-admin-service.test.ts src/services/wayfarer-import-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 04b361ca272795fc9fdfcb1708651218b4db8b49 -- src test docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8F-1 task 3: no bot-updates post for a stop-only import`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 50d21bfb983a3339a9fc3eae4a81b737fffc6d91..b4d2d1c835b0809fc2b0c5d01c92ddb3f324a7a6 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -35,7 +35,7 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 - The views of a gym are components-v2 messages of `GYM_COLOUR` (`renderGymView`, staff: the heading `### [Name (Nickname)](<place>)`, the address Google gave and `regionsSentence`, the map, the description, `**Notice**`, `**Keywords:**`, `**Gym targets:**`, `**Elite raid gym:**`, `**Nearest gym:**`, nearby places and `Gym #<id> · <lat>, <lon>` in small print, a Map button; `renderMemberGymView` for `/find-gym`: no elite mark, the regions, the map, the description, the notice, **Raids now**, `Gym #<id>`, a Map button); every text is cut to its room (`SHOWN`, `HEADING`) so that the worst case is within `TEXT_BUDGET`: what staff or Google wrote is cut before it is escaped, the lines above a view are kept whole while they fit (`fitLines`, "…and N more lines"; a first line too long by itself is cut by `cutMarkdown`, `src/render/text.ts`, which never cuts inside a code span, a link, a mention or an escape and takes out an emphasis marker left open: finished markdown, plan 8W-3), and `namesakeNote` names its namesakes within `NAMESAKES_SHOWN`. Every message of the `/gym` flows is v2 from first to last (`gymQuestion` for questions and answers, `gymViewMessage(ctx, place, gym, lines, controls)` for a view with what a change did above it, `answerGym` and `sayGym` to show them); the answer of a change has no buttons but the Map link. Tests read them with `said` (the sentences above a view), `gymViewOf` (title, lines, facts, small print, pictures) and `gymOf` (`test/support/gym-commands.ts`).
 - The view of `/gym show` has Edit…, Make elite / Not elite, Move… and Delete… beside its Map link (`viewControls`, `src/commands/gyms/view-controls.ts`): the custom-id kind `gymview`, `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0` (what Make elite / Not elite sets, so that a view drawn before somebody else changed the mark does what its label says), the form `gymview:<gym id>:place` (titled by the gym's tidied name, cut to 38) and the dialog of a deletion `gymview:<gym id>:delete`, nothing kept in memory, the guard of `/gym` and no throttle (as `/gym`), a gym gone or out of reach refused with `VIEW_GONE`. Edit… opens the form of `/gym edit` (`openEditForm`, `fromView`: its answer is a message of its own and the view stays; a refusal of it too, and the form opened again from that refusal is answered in its place); Make elite sets the mark and shows the view anew in place with what it did and the buttons as they now are (a gym gone during the press is said in the view's place); Move… opens a form of one input read by `readLocation` and answers as `/gym move` does (`moveGymTo`) in a private message of its own (`deferReply`, then `answerGym`); Delete… opens the dialog of `/gym delete` (plan 8Q; below), not deferred before it.
 - `/gym delete` and Delete… ask in a dialog (plan 8Q, `deleteDialog` in `src/commands/gyms/delete.ts`): titled `Delete a gym`, today's question (`Delete **Name** (#6)? This cannot be undone.`, then `Nothing refers to it.` or `With it go:` and its lines) and `Submit deletes it.`; the gym and what refers to it (`GymAdminService.references`) read within `DIALOG_READ_MS` (`readInTime`); a raid at the gym refused privately, without a dialog. `/gym delete` declares no `defer`. The dialog carries only the gym's number (`gymview:<gym id>:delete`, a `modal` of `gymViewControls`, the guard of `/gym`): nothing is kept in `pendingGyms`. Its Submit (`deleteGymNow`) is acknowledged privately and decides everything again (`GymAdminService.delete`: a gym gone or of another server's regions only is `That gym no longer exists.`, also for a second Submit; a raid reported since keeps it), answering in a message of its own. Discord's Cancel replaces Keep; the buttons of the question before plan 8Q (`gym:<token>:delete|cancel`) find no request and say that it expired.
-- A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced. What changes the gym list in bulk (a Wayfarer import, the answers of its review queue, the deletion of the gyms beyond a scanned area) is one summary instead (`gymListSummary`, `src/render/gym-summary.ts`: what changed, never what made it (Matt, 2026-10-16), "Professor Pine has added 30 gyms, renamed 1, and moved 1.", the serial comma before the last of three or more; then, for an import, what it changed of the PokéStops and Power Spots, "It also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots." (`wayfarer.md`), alone under the heading "The PokéStops and Power Spots changed" when no gym changed; counts of nothing are left out; a name changed only in spaces or capitals, `tidiesName`, is no rename): `GymAdminService.batch(place, source, work)` posts its summary at the end, the review's (`source` `review`, also `delete(…, 'review')`) gathered per server and posted `REVIEW_SUMMARY_MS` after the last answer (`flush` posts what waits; a crash loses the counts of those minutes, the changes themselves stand: ruled in plan 8W-3 not to keep them in the database, which would take a migration, a repository and its twin, and a timer taken up at start with the place of the summary for a post that only counts what members can see on the map and the posts). One gym added alone is `gymAnnouncement(gym, regions, map)`, a components-v2 message with its map (Matt, 2026-10-15: like `/find-gym`; `GymAdminOptions.maps`, fetched only once a channel was found, the announcement going without it when it fails); a deletion is `gymRemovedLine`. `announce` takes the messages to try in order: one Discord refuses (a file where the bot may not attach files, a map file gone) is followed by the next (the gym without its map); the map is fetched only once a channel was found, and a gym gone by then is not announced. The fake gateway's `refuseFiles` refuses a sent message with files.
+- A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced. What changes the gym list in bulk (a Wayfarer import, the answers of its review queue, the deletion of the gyms beyond a scanned area) is one summary instead (`gymListSummary`, `src/render/gym-summary.ts`: what changed, never what made it (Matt, 2026-10-16), "Professor Pine has added 30 gyms, renamed 1, and moved 1.", the serial comma before the last of three or more; then, for an import, what it changed of the PokéStops and Power Spots, "It also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots." (`wayfarer.md`); nothing is posted when no gym was added, renamed, moved or deleted, however many PokéStops and Power Spots changed (8W-3, plan 8F-1; the import's own answer gives every count, and the review queue's gathered stop counts go out only with a gym's change); counts of nothing are left out; a name changed only in spaces or capitals, `tidiesName`, is no rename): `GymAdminService.batch(place, source, work)` posts its summary at the end, the review's (`source` `review`, also `delete(…, 'review')`) gathered per server and posted `REVIEW_SUMMARY_MS` after the last answer (`flush` posts what waits; a crash loses the counts of those minutes, the changes themselves stand: ruled in plan 8W-3 not to keep them in the database, which would take a migration, a repository and its twin, and a timer taken up at start with the place of the summary for a post that only counts what members can see on the map and the posts). One gym added alone is `gymAnnouncement(gym, regions, map)`, a components-v2 message with its map (Matt, 2026-10-15: like `/find-gym`; `GymAdminOptions.maps`, fetched only once a channel was found, the announcement going without it when it fails); a deletion is `gymRemovedLine`. `announce` takes the messages to try in order: one Discord refuses (a file where the bot may not attach files, a map file gone) is followed by the next (the gym without its map); the map is fetched only once a channel was found, and a gym gone by then is not announced. The fake gateway's `refuseFiles` refuses a sent message with files.
 
 ## Regions
 
diff --git a/docs/architecture/wayfarer.md b/docs/architecture/wayfarer.md
index 0502dd51358f37f370ba4af8d1ccb80bf49afcec..b372391a90beaf399d2548fa2b517f9fe3776b7f 100644
--- a/docs/architecture/wayfarer.md
+++ b/docs/architecture/wayfarer.md
@@ -25,7 +25,7 @@ The true list of gyms from Wayfarer: the export file and its parts, S2 cells and
 
 ## The kept Wayspots
 
-- Every Wayspot of an applied import is kept (plan 8W-2): table `Wayspot` (migration `2026_10_16_017_wayspot`; a migration merged after it must sort after it, since Kysely refuses an earlier name once 017 ran on a database: 8H's is `2026_10_16_018_party_history`, 016 stays unused; first merge wins, the second renumbers above it, and only a merged migration, or one that already sorts after everything merged, is run on the dev database. The table: the Wayfarer id, `kind`, `formerKind` (the kind before an import last saw it as another; `stop` for a promoted stop), place, title and address plain (not entity-encoded: nothing legacy reads it; cut to 255), picture (`pictureOf`, the address as Wayfarer gives it; a message shows it through `wayspotPicture`: https, `=s400`), `firstSeen` (when an import first kept it: the import's time), `lastSeen` (when the scan of the newest file that saw it was made, `scanTimeOf`: the file's `finishedAt`, else `startedAt`, else the import's time, never later than the import's time: a file dated in the future would freeze its rows); not per server) behind `WayspotStorage` (`WayspotRepository`: `all`, `gone`, `saveFromImport({ upsert, remove, gone }, importedAt, scannedAt, startedAt)` in one transaction of chunks of 500, `remove(ids)`; twin `MemoryWayspots`, both run `wayspotCases`). The pure part is `planKept` (`src/domain/wayspots/keep.ts`, rows `kept.ts`): every Wayspot of the file but those whose id is a Pine gym's `pogoId` (of any server) after the import, which live in `Gym` (a row of one is deleted); a kept row not in the file is marked gone where the file covered its cell (`coveredCells`; plan 8W-3: the row stays with `kind` `gone`, its kind before in `formerKind` and its `lastSeen` the time of the scan that found it gone, never read by `all`; no column was added, ruling: tombstones are kept for good, a few thousand rows at most: nothing prunes them, and every preview and import reads them all, `WayspotStorage.gone`, with the kind each had, `GoneWayspot` (a stop where it is not known, `UNKNOWN_GONE_KIND`, so that no tombstone is left out); one brought back keeps that kind as its `formerKind`, and a Wayfarer gym added that was such a stop counts as one, `promoted`), and a Wayspot a newer scan found gone (`KeptInput.gone`, from `WayspotStorage.gone`) is not brought back by an older file (a newer one brings it back, keeping its `firstSeen`); the storage keeps these guards itself whatever the caller planned (plan 8W-3: an upsert never overwrites a row, kept or gone, last seen after the file's scan, by MySQL's row alias `AS new` with `IF(Wayspot.lastSeen > new.lastSeen, …)`, `lastSeen` assigned last; a row is marked gone only when not seen since the file's scan started, or at its own scan time), so that imports that were not one after the other cannot undo each other either; a row last seen after the file's scan (another server's newer scan) is neither changed nor deleted nor counted (a week-old file does not undo a fresh scan; only a gym that is it now takes it), and one another scan saw after the file's scan started (`scanStartOf`: `startedAt`, else `finishedAt`, never later than the import) is not deleted (a row last seen exactly at the file's scan time is its own: an earlier import of the same scan); moves and renames are silent; `WayspotCounts` counts stops and Power Spots `added`, `changed` (kind, title, place, address or picture), `gone` (also a stop that became a gym), and `gyms` (kept Wayfarer gyms written, said nowhere and no reason to offer an import). The import reads the kept rows under its lock, writes them after the gyms (`Unrecorded` `wayspots` when it fails or they cannot be read; the gyms stand, and a gym added is then not known to have been a PokéStop) and stores the counts in its row as `wayspots*`; preview and outcome say them in one line (a preview that cannot read them logs it and says nothing of them), and an import that changes only stops and Power Spots is offered (`changesNothing`, `changesWayspots`). A Wayfarer gym whose adding failed stays a kept `gym` row. A review's Same as (`applyMatch`) and New gym delete the row of the Wayspot the gym now is; New gym gives the gym the kept row's picture. A Wayfarer gym added whose kept row was a stop (`wasStop`) is counted by `GymBatch.add(…, { promoted: true })`: the summary says "Professor Pine has added 12 gyms (3 of them were PokéStops)". The summary also says what the import changed of the stops and Power Spots (`planKept`'s `byKind`, `WayspotChanges`, given to the batch by `GymBatch.countWayspots` once they are written), each count by its kind: "It also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots."; its `gone` is only what left Wayfarer's map, not a stop that became a gym (unlike `WayspotCounts.gone`, which the preview says): a stop Wayfarer now shows as a gym, taken by a Pine gym or not, is counted neither as removed nor as a stop. Its `changed` is only a new kind, a new title or a move over `NOTICED_MOVE_METRES` 10 (`noticeable`): a new address or picture alone is written but not said, so that routine re-imports post nothing (the preview's `changed` still counts them). Real export (43,057): `planKept` 0.2 s, the first write 1.9 s, a write of all again 1.2 s.
+- Every Wayspot of an applied import is kept (plan 8W-2): table `Wayspot` (migration `2026_10_16_017_wayspot`; a migration merged after it must sort after it, since Kysely refuses an earlier name once 017 ran on a database: 8H's is `2026_10_16_018_party_history`, 016 stays unused; first merge wins, the second renumbers above it, and only a merged migration, or one that already sorts after everything merged, is run on the dev database. The table: the Wayfarer id, `kind`, `formerKind` (the kind before an import last saw it as another; `stop` for a promoted stop), place, title and address plain (not entity-encoded: nothing legacy reads it; cut to 255), picture (`pictureOf`, the address as Wayfarer gives it; a message shows it through `wayspotPicture`: https, `=s400`), `firstSeen` (when an import first kept it: the import's time), `lastSeen` (when the scan of the newest file that saw it was made, `scanTimeOf`: the file's `finishedAt`, else `startedAt`, else the import's time, never later than the import's time: a file dated in the future would freeze its rows); not per server) behind `WayspotStorage` (`WayspotRepository`: `all`, `gone`, `saveFromImport({ upsert, remove, gone }, importedAt, scannedAt, startedAt)` in one transaction of chunks of 500, `remove(ids)`; twin `MemoryWayspots`, both run `wayspotCases`). The pure part is `planKept` (`src/domain/wayspots/keep.ts`, rows `kept.ts`): every Wayspot of the file but those whose id is a Pine gym's `pogoId` (of any server) after the import, which live in `Gym` (a row of one is deleted); a kept row not in the file is marked gone where the file covered its cell (`coveredCells`; plan 8W-3: the row stays with `kind` `gone`, its kind before in `formerKind` and its `lastSeen` the time of the scan that found it gone, never read by `all`; no column was added, ruling: tombstones are kept for good, a few thousand rows at most: nothing prunes them, and every preview and import reads them all, `WayspotStorage.gone`, with the kind each had, `GoneWayspot` (a stop where it is not known, `UNKNOWN_GONE_KIND`, so that no tombstone is left out); one brought back keeps that kind as its `formerKind`, and a Wayfarer gym added that was such a stop counts as one, `promoted`), and a Wayspot a newer scan found gone (`KeptInput.gone`, from `WayspotStorage.gone`) is not brought back by an older file (a newer one brings it back, keeping its `firstSeen`); the storage keeps these guards itself whatever the caller planned (plan 8W-3: an upsert never overwrites a row, kept or gone, last seen after the file's scan, by MySQL's row alias `AS new` with `IF(Wayspot.lastSeen > new.lastSeen, …)`, `lastSeen` assigned last; a row is marked gone only when not seen since the file's scan started, or at its own scan time), so that imports that were not one after the other cannot undo each other either; a row last seen after the file's scan (another server's newer scan) is neither changed nor deleted nor counted (a week-old file does not undo a fresh scan; only a gym that is it now takes it), and one another scan saw after the file's scan started (`scanStartOf`: `startedAt`, else `finishedAt`, never later than the import) is not deleted (a row last seen exactly at the file's scan time is its own: an earlier import of the same scan); moves and renames are silent; `WayspotCounts` counts stops and Power Spots `added`, `changed` (kind, title, place, address or picture), `gone` (also a stop that became a gym), and `gyms` (kept Wayfarer gyms written, said nowhere and no reason to offer an import). The import reads the kept rows under its lock, writes them after the gyms (`Unrecorded` `wayspots` when it fails or they cannot be read; the gyms stand, and a gym added is then not known to have been a PokéStop) and stores the counts in its row as `wayspots*`; preview and outcome say them in one line (a preview that cannot read them logs it and says nothing of them), and an import that changes only stops and Power Spots is offered (`changesNothing`, `changesWayspots`). A Wayfarer gym whose adding failed stays a kept `gym` row. A review's Same as (`applyMatch`) and New gym delete the row of the Wayspot the gym now is; New gym gives the gym the kept row's picture. A Wayfarer gym added whose kept row was a stop (`wasStop`) is counted by `GymBatch.add(…, { promoted: true })`: the summary says "Professor Pine has added 12 gyms (3 of them were PokéStops)". The summary also says what the import changed of the stops and Power Spots (`planKept`'s `byKind`, `WayspotChanges`, given to the batch by `GymBatch.countWayspots` once they are written), each count by its kind: "It also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots."; its `gone` is only what left Wayfarer's map, not a stop that became a gym (unlike `WayspotCounts.gone`, which the preview says): a stop Wayfarer now shows as a gym, taken by a Pine gym or not, is counted neither as removed nor as a stop. Its `changed` is only a new kind, a new title or a move over `NOTICED_MOVE_METRES` 10 (`noticeable`): a new address or picture alone is written but not said, so that routine re-imports post nothing (the preview's `changed` still counts them). An import that changed no gym posts nothing at all, its stop and Power Spot counts said only in its answer (8W-3, plan 8F-1). Real export (43,057): `planKept` 0.2 s, the first write 1.9 s, a write of all again 1.2 s.
 - The places Google gave around a PokéStop or Power Spot (plan 8W-6) live in a table of their own, `WayspotPlaces`, keyed by the Wayspot's id with the point and kind they were asked for: the import's upsert of `Wayspot` neither reads nor clears them; a Wayspot moved by more than a few meters or of another kind waits in the line again, and one that became a gym or was found gone loses them (`gyms-and-regions.md`, the line).
 - `ctx.wayspots` is `WayspotDirectory` (`src/services/wayspot-directory.ts`): loaded at start (after the regions) and after every applied import, empty until then; it also holds the stops of Pine's own (plan 8R-1, `setPineStops` from `PineStopService`: kind `stop`, `pineServer` set, keyed `pine-<id>`, in the regions of their own server only; each change bumps both generations; `stop-reports.md`); `byId`, `all`, `inRegion(channelId)`, `regionsOf(id)` (by the outlines, worked out again when `RegionDirectory.generation` changes), `near(point, metres, kinds?)`, `forget(ids)` (an id forgotten while a load reads stays forgotten when the load ends), a `generation` that changes with every load, forget and change of the regions (the region editor of 8M-2 rebuilds on it), and a `contentGeneration` that changes only with what the Wayspots are (every load; not the regions, not a forget: what is built of them passes over a forgotten one through `inRegion` and `byId`), with `whenChanged(listener)` called after each change of it (the search indexes of `PlaceFinder` are built on it, and `PartyService` shows the meetups near a PokéStop or Power Spot anew, plan 8D). `near` also names a pin: `PlaceFinder.pin` takes the nearest gym of the server or kept PokéStop or Power Spot within 50 m.
 
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index e02fd2b9881c1b20d8e94c095b8f3ae12871c0b0..99a7b64094da2f5217a132ce53c8c9725937252b 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -352,5 +352,6 @@ The first only says what it would do, line by line: which rows it would add, and
 - **Updates**: `./pine update` backs up the database, fetches the newest code, rebuilds and restarts what changed. It refuses to run if you changed files of the repository yourself: your own files are `.env` and `pine-settings.json`, which git ignores. After you edit `pine-settings.json`, run `./pine restart`.
 - **Google, after the first `/gym import`** (with a `GOOGLE_API_KEY`): the gyms the import added get their nearby places (and an address where Wayfarer gave none) from Google over the following weeks, then the PokéStops and Power Spots of your regions, a share each day. The bot asks at most a monthly budget that stays within Google's free amounts (by default 4,500 places searches, 500 of them kept for gyms you add or move by hand and `/gym refresh`, and 9,000 addresses: `googleLookupsPerMonth`, `googleLookupsReserve`, `googleGeocodesPerMonth`), counted from the 1st at midnight Pacific time, when Google's free amounts reset; the busiest regions go first if the legacy history (4.11) was imported. `/gym google` (staff) shows how many wait, the month's use and when this server's gyms will be done. Google counts the free amounts per billing account, not per key: if another installation's key (a test instance, say) bills to the same account, split the budget between them.
 - **Health**: `./pine status` and `./pine logs pine`. The bot's owner (`OWNER_ID`) gets a direct message when the bot crashes and restarts, when it is stuck, or when a backup fails. A watchdog service restarts the bot when it stays stuck or off Discord for several minutes.
+- **Keeping a member out of a region**: to keep a member out of a region's forum for good, give them a permission overwrite on that forum that denies View Channel (or deny it to a role they hold); taking away the region's role is not enough. A member overwrite takes the forum out of sync with its category; "Sync permissions" removes the bot's own overwrites, which its hourly sweep puts back where they are still needed.
 - The details of the stack (health checks, the watchdog, backups, restore): [operations.md](../architecture/operations.md).
 - **Help**: ask in the official Professor Pine Discord, https://discord.com/invite/8FkjJVe.
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index ae72de5ac16fe3afcde036d1e117cb884c9df5da..3dcb3aca499f7c2fefb39d89d84a44b251324b91 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -174,6 +174,8 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), its tags, and a pinned post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days), under which the bot posts "Today’s Stops" (the day's field research and Team GO Rocket hideouts). Members can use commands in that post (report research or Team GO Rocket where they see what is reported), but it keeps only the bot's lists: what a member writes there is deleted at once (the bot needs Manage Messages in the forum), and the member is told by DM once a day; a screenshot posted there is read first and answered by DM. A member with Manage Messages there (a moderator) keeps their message. Reactions on the bot's lists there are removed too, the next time the bot changes that list or starts (the party posts in the same forum keep their reactions). The post has a slowmode of 45 seconds, a value Discord's menu does not offer, so the bot knows it as its own (it keeps a member from flooding the board; commands and the bot are not held by it, and a moderator without Bypass Slowmode waits 45 seconds between their own messages there). A moderator may give the board another slowmode and the bot keeps it, except exactly 6 hours, which the bot sets back to 45 seconds (it was the bot's own mark before). A moderator may lock it; the bot leaves a lock alone, and `/admin setup-forums` says so. The region's channel gets a short line the first time a task, a leader or Giovanni is reported there in a day, deleted at midnight. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
+To keep a member out of a region's forum for good, give them a permission overwrite on that forum that denies View Channel (or deny it to a role they hold); taking away the region's role is not enough. A member overwrite takes the forum out of sync with its category; "Sync permissions" removes the bot's own overwrites, which its hourly sweep puts back where they are still needed.
+
 Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a Power Spot: the Power Spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with Power Spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: "Today’s Stops" in the region's board shows it, and a task new that day gets a line in the region's channel), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in "Today’s Stops" in the board), `/want` and a report of that boss by somebody else. `/help` lists everything.
 
 ## 8. Running it
diff --git a/src/commands/gyms/import.test.ts b/src/commands/gyms/import.test.ts
index 6cc175d8d503422146408edc712410ca97f5f60c..e346079d343018eabd3c3f3cbb9217a7ea5171cf 100644
--- a/src/commands/gyms/import.test.ts
+++ b/src/commands/gyms/import.test.ts
@@ -237,6 +237,10 @@ describe('/gym import: its help', () => {
     expect(text(settings.wayspotTool)).not.toMatch(
       /npm run|dist\/|\.user\.js|Tampermonkey|zoom|drag|\bpans?\b|the map\b/i,
     );
+    // Only a change of gyms is posted (8W-3).
+    expect(text(settings.wayspotTool)).toContain(
+      'When gyms changed, the channel for bot updates gets one summary of what changed.',
+    );
   });
 });
 
@@ -737,6 +741,10 @@ describe('/gym import: the buttons', () => {
     expect(linesOf(question)[0]).toMatch(
       /^Delete \d+ gyms? of this server that lies? in no region/,
     );
+    // Only a change of gyms is posted (8W-3): kept for their raids, none would go.
+    expect(linesOf(question).at(-1)).toBe(
+      'When gyms go, the channel for bot updates is told how many went, in one post.',
+    );
     expect(labelsOf(question)).toEqual([
       `Delete ${beyond.length} ${beyond.length === 1 ? 'gym' : 'gyms'}`,
       'Keep them',
@@ -885,8 +893,8 @@ describe('/gym import: the buttons', () => {
       '- 2 took the name Wayfarer gives them',
       '- 2 moved to where Wayfarer has them',
       '- 1 got its picture from Wayfarer',
-      'Added 2 new gyms. The channel for bot updates is told what the import changed, in one ' +
-        'post.',
+      'Added 2 new gyms. Since gyms changed, the channel for bot updates is told what the ' +
+        'import changed, in one post.',
       '2 gyms are in the review queue (1 to match, 1 never found in Wayfarer). `/gym review` ' +
         'shows them one at a time.',
       '5 gyms where the scan did not reach were left alone.',
diff --git a/src/commands/gyms/import.ts b/src/commands/gyms/import.ts
index 60444f1cecb23fc00a8ddb1177e3b609d85ed923..7b6c271b8668d32e0baba7eb6bce95f9de2164d0 100644
--- a/src/commands/gyms/import.ts
+++ b/src/commands/gyms/import.ts
@@ -730,8 +730,8 @@ export function renderImportOutcome(outcome: WayfarerOutcome): string[] {
   const lines: string[] = [...foundLines(counts, true)];
   if (counts.added > 0) {
     lines.push(
-      `Added ${count(counts.added, 'new gym')}. The channel for bot updates is told what the ` +
-        'import changed, in one post.',
+      `Added ${count(counts.added, 'new gym')}. Since gyms changed, the channel for bot updates ` +
+        'is told what the import changed, in one post.',
     );
   }
   if (counts.untitled > 0) {
@@ -847,8 +847,8 @@ export const importGyms: SubcommandPart = {
       'there are never added, but the report lists them as `outside`, so you see where an ' +
       'outline should grow. Gyms of this server in no region and beyond the area a finished ' +
       'scan of every region covered are listed as `beyond`: once the import is done, a button ' +
-      'offers to delete them, after a question that names them. The channel for bot updates ' +
-      'gets one summary of what changed.',
+      'offers to delete them, after a question that names them. When gyms changed, the channel ' +
+      'for bot updates gets one summary of what changed.',
     examples: ['/gym import file:pine-wayspots-2026-10-15.json.gz'],
   },
   defer: 'ephemeral',
@@ -1043,7 +1043,7 @@ async function askOutside(
               `${counted(raids, 'gym', 'has', 'have')} an active raid and ${raids === 1 ? 'is' : 'are'} kept.`,
             ]
           : []),
-        'The channel for bot updates is told how many went, in one post.',
+        'When gyms go, the channel for bot updates is told how many went, in one post.',
       ],
       [
         button(
diff --git a/src/render/gym-summary.test.ts b/src/render/gym-summary.test.ts
index e5c5b8955feee27860295190f19477ab016c1cb9..7bf73f1989699b74bd24f4c77b0e8da809b4e6bb 100644
--- a/src/render/gym-summary.test.ts
+++ b/src/render/gym-summary.test.ts
@@ -75,11 +75,8 @@ describe('gymListSummary', () => {
     );
   });
 
-  it('says the PokéStops and Power Spots alone under their own heading when no gym changed', () => {
-    expect(textOf(gymListSummary(wayspots({ added: 1_500 }, { added: 1 })))).toBe(
-      '### The PokéStops and Power Spots changed\nProfessor Pine has added 1,500 PokéStops and ' +
-        '1 Power Spot.',
-    );
+  it('says nothing when no gym changed, however many PokéStops and Power Spots did (8W-3)', () => {
+    expect(gymListSummary(wayspots({ added: 1_500 }, { added: 1 }))).toBeUndefined();
   });
 
   it('says nothing of nothing, and adds counts up', () => {
diff --git a/src/render/gym-summary.ts b/src/render/gym-summary.ts
index 099e7a4300104a5ce2cee3a292c5807e76c42dab..e27637976ba60634ccb35bb75ebf0eabac468bd2 100644
--- a/src/render/gym-summary.ts
+++ b/src/render/gym-summary.ts
@@ -132,25 +132,21 @@ function wayspotWords({ wayspots }: GymListChanges): string {
 /**
  * The post: one container of the gym colour, its heading and a sentence of the gyms ("Professor
  * Pine has added 2,596 gyms, renamed 169, and moved 109."), then one of the PokéStops and power
- * spots ("It also added 120 PokéStops and 3 Power Spots."); with no gym changed, the PokéStops
- * and power spots alone under a heading of their own. It pings nobody. Undefined when nothing
- * changed.
+ * spots ("It also added 120 PokéStops and 3 Power Spots."). It pings nobody. Undefined when no
+ * gym was added, renamed, moved or deleted (8W-3, Matt 2026-10-29: the PokéStops and Power Spots
+ * alone are no news for the channel; the import's own answer counts them).
  */
 export function gymListSummary(changes: GymListChanges): V2Message | undefined {
-  if (!anyChanges(changes)) return undefined;
-  const sentences: string[] = [];
-  if (anyGymChanges(changes)) sentences.push(`Professor Pine has ${gymWords(changes)}.`);
-  if (anyWayspotChanges(changes)) {
-    const start = sentences.length > 0 ? 'It also' : 'Professor Pine has';
-    sentences.push(`${start} ${wayspotWords(changes)}.`);
-  }
-  const heading = anyGymChanges(changes)
-    ? 'The gym list changed'
-    : 'The PokéStops and Power Spots changed';
+  if (!anyGymChanges(changes)) return undefined;
+  const sentences = [`Professor Pine has ${gymWords(changes)}.`];
+  if (anyWayspotChanges(changes)) sentences.push(`It also ${wayspotWords(changes)}.`);
   return {
     v2: true,
     components: [
-      container(GYM_COLOUR, [textDisplay(`### ${heading}`), textDisplay(sentences.join(' '))]),
+      container(GYM_COLOUR, [
+        textDisplay('### The gym list changed'),
+        textDisplay(sentences.join(' ')),
+      ]),
     ],
   };
 }
diff --git a/src/services/gym-admin-service.test.ts b/src/services/gym-admin-service.test.ts
index ac72bbd559fb62cb86ee2a498e44c4c337f917fb..d5e7dc95a29d5fdef13376eb9b76b8a91eda73d0 100644
--- a/src/services/gym-admin-service.test.ts
+++ b/src/services/gym-admin-service.test.ts
@@ -1320,13 +1320,43 @@ describe('GymAdminService.batch', () => {
       return Promise.resolve();
     });
     await settle(made);
+    // The second import changed no gym: it posts nothing (8W-3).
     expect(announced(made).map((message) => textOf(message))).toEqual([
       '### The gym list changed\nProfessor Pine has added 1 gym. It also added 3 PokéStops and 1 ' +
         'Power Spot, changed 2 Power Spots, and removed 1 PokéStop.',
-      '### The PokéStops and Power Spots changed\nProfessor Pine has changed 1 PokéStop.',
     ]);
   });
 
+  it('posts the review queue’s gathered counts only when a gym changed among them (8W-3)', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const made = await gymAdminWith();
+      const stopOnly = {
+        stops: { added: 0, changed: 1, gone: 0 },
+        powerSpots: { added: 0, changed: 0, gone: 0 },
+      };
+      await made.admin.batch(STAFF_PLACE, 'review', (ops) => {
+        ops.countWayspots(stopOnly);
+        return Promise.resolve();
+      });
+      await vi.advanceTimersByTimeAsync(REVIEW_SUMMARY_MS);
+      await settle(made);
+      expect(announced(made)).toEqual([]);
+      // Gathered with a gym's change, the stops are counted in its post.
+      await made.admin.batch(STAFF_PLACE, 'review', async (ops) => {
+        ops.countWayspots(stopOnly);
+        await ops.add({ name: 'Clock Tower', ...FREE });
+      });
+      await vi.advanceTimersByTimeAsync(REVIEW_SUMMARY_MS);
+      await settle(made);
+      expect(announced(made).map((message) => textOf(message))).toEqual([
+        '### The gym list changed\nProfessor Pine has added 1 gym. It also changed 1 PokéStop.',
+      ]);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
   it('adds a block of gyms in one transaction, their nearest gyms worked out once for it', async () => {
     const made = await gymAdminWith();
     const library = gymOf(made, 1);
diff --git a/src/services/wayfarer-import-service.test.ts b/src/services/wayfarer-import-service.test.ts
index e183e98af4a55bdabfd2d21ed1a1a3fe9748bc47..3fe5db479e936161d0c13863c772c2eede78b704 100644
--- a/src/services/wayfarer-import-service.test.ts
+++ b/src/services/wayfarer-import-service.test.ts
@@ -1111,19 +1111,17 @@ describe('WayfarerImportService: the kept Wayspots', () => {
     await made.wayfarer.apply(STAFF_PLACE, file);
     const unseen = wayspot(9, 'Shelter', { lat: 40.5, lon: -80.5 }, { kind: 'stop' });
     await made.wayspotStore.saveFromImport({ upsert: [keptOf(unseen)], remove: [] }, 1);
+    await settle(made);
+    const before = announced(made).length;
 
     const without = { ...file, wayspots: file.wayspots.filter((one) => one.id !== idOf(4)) };
     const preview = await made.wayfarer.preview(STAFF_PLACE, without);
     expect(preview.wayspots).toEqual({ added: 0, changed: 0, gone: 1, gyms: 0 });
     const outcome = await made.wayfarer.apply(STAFF_PLACE, without);
     expect(outcome.wayspots).toEqual({ added: 0, changed: 0, gone: 1, gyms: 0 });
-    // The second import changes no gym: its summary says the stop alone.
+    // The second import changes no gym: it posts nothing (8W-3).
     await settle(made);
-    expect(
-      announced(made)
-        .map((message) => textOf(message))
-        .at(-1),
-    ).toBe('### The PokéStops and Power Spots changed\nProfessor Pine has removed 1 PokéStop.');
+    expect(announced(made)).toHaveLength(before);
     expect(await ids(made)).toEqual([idOf(5), idOf(9)]);
   });
 
````

### Task 4: 8F-1 task 4: catch CP in a max battle's post

Prototype commit: `7e85ff7ee8822d5932f0c6b8a8fb7689ff61ba10`

The max post's boss lines gain the catch CP after the weaknesses: IVs
10/10/10 to 15/15/15 at level 20, never weather boosted, so without
weather icons. maxCatchCp sits beside raidCatchCp in
src/domain/pogo/cp.ts and is reached through the catalogue's caught
entry as raidCatchCp is; a boss without an entry shows no boss lines.
The post still fits Discord with the widest boss.

**Files:**

```
 docs/architecture/parties-and-posts.md |  2 +-
 src/domain/pogo/catalogue.test.ts      | 17 +++++++++++++++++
 src/domain/pogo/catalogue.ts           | 30 +++++++++++++++++++++++++++---
 src/domain/pogo/cp.test.ts             |  6 +++++-
 src/domain/pogo/cp.ts                  | 23 ++++++++++++++++++++++-
 src/render/max-post.test.ts            | 29 +++++++++++++++++++++++++++--
 src/render/max-post.ts                 | 12 ++++++++++--
 7 files changed, 109 insertions(+), 10 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/pogo/catalogue.test.ts src/domain/pogo/cp.test.ts src/render/max-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7e85ff7ee8822d5932f0c6b8a8fb7689ff61ba10 -- src test docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8F-1 task 4: catch CP in a max battle's post`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 871c2082776c76a005afc0a87d9f7fce0005c946..8caf7c5d7af965ca0f00d8d6757cbec416d6ed1a 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -38,7 +38,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a Power Spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
 - One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same Power Spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status; answered "There is already a max battle against <the battle's boss> at this spot: <post>." whatever the report named, "…: its post is being made." without a post, and on the map without the post, plan 8X-F), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the Power Spots that fit what is typed (`nearChoices`), and with nothing typed the region's Power Spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
 - How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax, `bossSince` set to the change's moment; `setEnd` also confirms a screenshot's guessed time, `maxTimeConfirmed`, even when the end stays, said in the post as "confirmed the end time"; `fromScreenshot`, plan 8X-S: a screenshot of the battle at its spot, decided by the pure `screenshotAtBattle` (`src/domain/party/max.ts`) inside one change without the spot's lock: the same boss joins by the automatic status in a group of the lobby size (`lobbySize` option), at whatever tier of its kind (the tier is `/boss`'s; Matt, review r4 A2), its end moved only later and only on a clean read (a sure moment and a countdown that ends at a rotation), "set the end time from a screenshot"; a clean read of the end it has confirms its time (`maxTimeConfirmed`, without a line; A3), and a moved or confirmed end makes the screenshot the post's, unless it was not kept (its id null: the post's own stays, its time no guess any more; A4); another boss of the kind on a sure moment newer than `bossSince` changes boss, tier and end, "Boss changed to <boss> from a screenshot by <member>, until <end>." (`doer`; meeting times after the new end cancelled), told to the notifier as `/boss`; anything else refused, `max-other-boss` or `max-kind-change`, the battle named; a battle whose end came meanwhile is `gone`. The look first and the report of a free spot are `reportMaxShotAs` (`src/commands/max/max-shot.ts`): the end checked against the clock first (review R11), a battle there whose post is still being made left to `reportMaxAs`, which waits for the post (review r4 A1), `mayJoin` before the change, `reportMaxAs` once with the screenshot and the boss since its sure moment (R10)). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
-- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …` (under it, while it is on and its end was guessed from a screenshot, `UNCERTAIN_MAX_TIME`, which names `/end` only; a max battle's kept screenshot stays while it is active, `screenshotIdOf` in `shown()`), the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (Power Spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a Power Spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
+- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …` (under it, while it is on and its end was guessed from a screenshot, `UNCERTAIN_MAX_TIME`, which names `/end` only; a max battle's kept screenshot stays while it is active, `screenshotIdOf` in `shown()`), the boss's types and weaknesses, then `**Catch CP** min–max` (plan 8F-1: `catalogue.maxCatchCp`, `maxCatchCp` of `src/domain/pogo/cp.ts`, IVs 10 to 15 at level 20, never weather boosted, so without weather icons; no moves, random from the pool), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (Power Spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a Power Spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
 - A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known Power Spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
 
 ## Meetups and timed parties
diff --git a/src/domain/pogo/catalogue.test.ts b/src/domain/pogo/catalogue.test.ts
index a515bbec34cfd3cab48532d1f2ffddd08e75010b..48b6c04501b2c48d487d1fcb348bda99653a5ac1 100644
--- a/src/domain/pogo/catalogue.test.ts
+++ b/src/domain/pogo/catalogue.test.ts
@@ -193,6 +193,23 @@ describe('PokemonCatalogue: what a raid gives you (values from Bulbapedia, "Raid
     expect(catalogue.raidCatchCp(entry('latios')).min).toBe(2090);
   });
 
+  it('gives a max battle’s catch the plain raid range, never boosted (plan 8F-1)', () => {
+    const plainRaid = catalogue.raidCatchCp(entry('latios'));
+    expect(catalogue.maxCatchCp(entry('latios'))).toEqual({
+      min: plainRaid.min,
+      max: plainRaid.max,
+    });
+    // A fused form is caught as its base species, as from a raid.
+    expect(catalogue.maxCatchCp(entry('kyurem_white'))).toEqual(
+      catalogue.maxCatchCp(entry('kyurem')),
+    );
+    // Eternamax Eternatus is fought; plain Eternatus is caught.
+    expect(catalogue.maxCatchCp(entry('eternatus_eternamax'))).toEqual(
+      catalogue.maxCatchCp(entry('eternatus')),
+    );
+    expect(catalogue.maxCatchCp(entry('eternatus')).max).toBeLessThan(3_000);
+  });
+
   it('answers for the base Pokémon of a fused form', () => {
     for (const [fused, base] of [
       ['kyurem_white', 'kyurem'],
diff --git a/src/domain/pogo/catalogue.ts b/src/domain/pogo/catalogue.ts
index 7d7ee3b80f7f9fd02802376091984aa739fa2ff2..9afacc4e67f620c6e6bcf34416ef9c90d6210ef1 100644
--- a/src/domain/pogo/catalogue.ts
+++ b/src/domain/pogo/catalogue.ts
@@ -1,4 +1,10 @@
-import { cpMultiplierAt, raidCatchCp, type RaidCatchCp } from './cp.js';
+import {
+  cpMultiplierAt,
+  maxCatchCp,
+  raidCatchCp,
+  type MaxCatchCp,
+  type RaidCatchCp,
+} from './cp.js';
 import type { GameData, Move, PokemonEntry } from './game-master.js';
 import {
   POKEMON_TYPES,
@@ -26,6 +32,12 @@ const FUSED_FORMS: ReadonlySet<string> = new Set([
   'calyrex_shadow_rider',
 ]);
 
+/**
+ * Forms that are only fought, never caught: beating Eternamax Eternatus catches plain Eternatus
+ * (plan 8F-1, review F1).
+ */
+const BATTLE_ONLY_FORMS: ReadonlySet<string> = new Set(['eternatus_eternamax']);
+
 /** Read-only lookups over the parsed game data. */
 export class PokemonCatalogue {
   private readonly keys = new Map<string, PokemonEntry>();
@@ -310,9 +322,21 @@ export class PokemonCatalogue {
     return raidCatchCp(this.caught(entry).stats, this.data.cpMultipliers, shadow);
   }
 
-  /** What a raid against this entry gives you: the species for a mega or fused form. */
+  /**
+   * CP range of the Pokémon you catch from a max battle (plan 8F-1), never boosted. Dynamax and
+   * Gigantamax are key sets over ordinary entries, so the entry is the species' or form's own.
+   */
+  maxCatchCp(entry: PokemonEntry): MaxCatchCp {
+    return maxCatchCp(this.caught(entry).stats, this.data.cpMultipliers);
+  }
+
+  /**
+   * What a battle against this entry gives you: the species for a mega, a fused form or a
+   * battle-only form (Eternamax Eternatus).
+   */
   private caught(entry: PokemonEntry): PokemonEntry {
-    const base = entry.kind === 'mega' || FUSED_FORMS.has(entry.key);
+    const base =
+      entry.kind === 'mega' || FUSED_FORMS.has(entry.key) || BATTLE_ONLY_FORMS.has(entry.key);
     return base ? (this.species(entry.dex) ?? entry) : entry;
   }
 }
diff --git a/src/domain/pogo/cp.test.ts b/src/domain/pogo/cp.test.ts
index 563f5507036d125b57bf455b8d189f4bfbf99c23..9cae834b434bd6f2a0b3497894e1ddce474dba91 100644
--- a/src/domain/pogo/cp.test.ts
+++ b/src/domain/pogo/cp.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { gameDataFixture } from '../../../test/support/game-data.js';
-import { combatPower, cpMultiplierAt, raidBossCp, raidCatchCp } from './cp.js';
+import { combatPower, cpMultiplierAt, maxCatchCp, raidBossCp, raidCatchCp } from './cp.js';
 
 const multipliers = gameDataFixture().cpMultipliers;
 const MEWTWO = { attack: 300, defense: 182, stamina: 214 };
@@ -55,6 +55,10 @@ describe('raid CP', () => {
     });
   });
 
+  it('gives a max battle’s catch range at level 20 only: never boosted (plan 8F-1)', () => {
+    expect(maxCatchCp(MEWTWO, multipliers)).toEqual({ min: 2294, max: 2387 });
+  });
+
   it('gives the CP shown on the boss from the stamina of its raid level', () => {
     expect(raidBossCp(MEWTWO, 15000)).toBe(54148);
   });
diff --git a/src/domain/pogo/cp.ts b/src/domain/pogo/cp.ts
index b61a56aa4f6807b4482ddbe9891070d9f95b9178..0469a333d361bca032e5460625521657816192a5 100644
--- a/src/domain/pogo/cp.ts
+++ b/src/domain/pogo/cp.ts
@@ -9,7 +9,7 @@ export interface Ivs {
 const PERFECT: Ivs = { attack: 15, defense: 15, stamina: 15 };
 /** The lowest IVs a raid catch can have. */
 const RAID_FLOOR: Ivs = { attack: 10, defense: 10, stamina: 10 };
-/** Level of a raid catch, and of one boosted by the weather. */
+/** Level of a raid catch (and a max battle's), and of one boosted by the weather. */
 const RAID_CATCH_LEVEL = 20;
 const RAID_BOOSTED_LEVEL = 25;
 
@@ -70,6 +70,27 @@ export function raidCatchCp(
   };
 }
 
+export interface MaxCatchCp {
+  min: number;
+  max: number;
+}
+
+/**
+ * The CP range of a Pokémon caught from a max battle (plan 8F-1): IVs 10/10/10 to 15/15/15 at
+ * level 20, as a raid's, but never boosted by the weather (checked 2026-10-29: no source shows
+ * a boosted max catch).
+ */
+export function maxCatchCp(
+  stats: PokemonEntry['stats'],
+  multipliers: readonly number[],
+): MaxCatchCp {
+  const level = cpMultiplierAt(multipliers, RAID_CATCH_LEVEL);
+  return {
+    min: combatPower(stats, RAID_FLOOR, level),
+    max: combatPower(stats, PERFECT, level),
+  };
+}
+
 /** The CP shown on a raid boss, which depends on the stamina the raid level gives it. */
 export function raidBossCp(stats: PokemonEntry['stats'], bossStamina: number): number {
   return Math.floor(
diff --git a/src/render/max-post.test.ts b/src/render/max-post.test.ts
index d9c745128cd113b91341b90b743ced4054cc7d9b..2aa7c85fa0e0dbbc0560c1177ba32849650fbc11 100644
--- a/src/render/max-post.test.ts
+++ b/src/render/max-post.test.ts
@@ -73,8 +73,19 @@ describe('renderMaxPost: the heading (design 3.3)', () => {
     expect(lines[1]).toBe(`Until ${stamp(END)} (${stamp(END, 'R')}).`);
     expect(lines[2]).toBe('**Types** Fighting');
     expect(lines[3]).toMatch(/^\*\*Weaknesses\*\* /);
-    // No catch CP and no moves (design 3.3: a follow-up if wanted).
-    expect(heading).not.toMatch(/Catch CP|Moveset/);
+    // The catch CP at level 20, never boosted, without weather (plan 8F-1); no moves (Matt:
+    // random from the pool).
+    const cp = machamp ? catalogue.maxCatchCp(machamp) : { min: 0, max: 0 };
+    expect(lines[4]).toBe(`**Catch CP** ${cp.min}–${cp.max}`);
+    expect(lines).toHaveLength(5);
+    expect(heading).not.toMatch(/Moveset/);
+  });
+
+  it('shows no boss lines for a boss without a catalogue entry', () => {
+    const [heading = ''] = textDisplays(
+      post(testMax(), { boss: { name: 'Newmon', shiny: false } }).message,
+    );
+    expect(heading).not.toMatch(/Types|Weaknesses|Catch CP/);
   });
 
   it('names a Gigantamax battle without stars, its picture beside the heading', () => {
@@ -262,6 +273,20 @@ describe('renderMaxPost: groups, controls and the rest', () => {
     expect(textOf(post(party).message)).toContain('-# Reported by ');
     expectSendable(post(party));
     expectSendable(post(endParty(party), { now: END }));
+    // The boss whose lines are longest as the heading draws them (types, weaknesses and the
+    // catch CP; plan 8F-1), named at length, with every copy.
+    const width = (entry: (typeof catalogue.all)[number]) =>
+      textDisplays(post(testMax(), { boss: { name: 'X', entry, shiny: false } }).message)[0]
+        ?.length ?? 0;
+    const [widest] = catalogue.all
+      .map((entry) => ({ entry, width: width(entry) }))
+      .sort((a, b) => b.width - a.width)
+      .map(({ entry }) => entry);
+    if (!widest) throw new Error('no Pokémon');
+    const boss = { name: '*'.repeat(100), entry: widest, shiny: true, image: 'https://x.test/a' };
+    expect(textOf(post(party, { boss }).message)).toContain('**Catch CP**');
+    expectSendable(post(party, { boss }));
+    expectSendable(post(endParty(party), { now: END, boss }));
   });
 });
 
diff --git a/src/render/max-post.ts b/src/render/max-post.ts
index 920e3acf73bebcab3bbe4c91cadc08734eb6ffe8..339f33590178ea69a75dfa793c4a4ce184e38fd2 100644
--- a/src/render/max-post.ts
+++ b/src/render/max-post.ts
@@ -162,11 +162,19 @@ function describeEnd(view: MaxPostView): string[] {
   return [timesOf(view), ...(uncertain ? [UNCERTAIN_MAX_TIME] : [])];
 }
 
-/** The lines about the boss: its types and what it is weak to (no catch CP, no moves). */
+/**
+ * The lines about the boss: its types, what it is weak to and the CP it is caught with (level 20,
+ * never boosted, so no weather: plan 8F-1); no moves (Matt: random from the pool).
+ */
 function bossLines(view: MaxPostView): string[] {
   const { entry } = view.boss;
   if (!entry) return [];
-  return [typesLine(entry, view.emoji), ...weaknessLines(view.catalogue, entry, view.emoji)];
+  const cp = view.catalogue.maxCatchCp(entry);
+  return [
+    typesLine(entry, view.emoji),
+    ...weaknessLines(view.catalogue, entry, view.emoji),
+    `**Catch CP** ${cp.min}–${cp.max}`,
+  ];
 }
 
 /** `**Gazebo of the Park** (Power Spot)`: a spot's first words, made safe by `text`. */
````

### Task 5: 8F-1 task 5: help in paragraphs

Prototype commit: `6d8d26c6f02f29bbe84529a80e4864816cfcdb16`

Every command's and subcommand's help details are broken into short
paragraphs separated by a blank line: one idea each, at most three
sentences, which /help keeps in its one text display. The joined texts
join with a blank line: /raid's and /max's screenshot part, alsoAs's
note, the short forms of /rank. The words stay; four sentences over the
limit are cut in two (/rocket report, /admin setup-forums, /region
import, /counters' run for max battles). A unit test refuses a paragraph
over 320 characters in every command and subcommand, with screenshots on
and off.

**Files:**

```
 docs/architecture/utilities.md              |  1 +
 src/commands/admin/boss-list.ts             |  6 +++---
 src/commands/admin/boss-overrides.ts        |  8 ++++----
 src/commands/admin/cleanup-legacy.ts        |  4 ++--
 src/commands/admin/save-party.ts            |  2 +-
 src/commands/admin/self-roles.ts            |  6 +++---
 src/commands/admin/setup-forums.ts          | 10 +++++-----
 src/commands/gyms/add.ts                    |  4 ++--
 src/commands/gyms/delete.ts                 |  2 +-
 src/commands/gyms/duplicates.ts             |  2 +-
 src/commands/gyms/edit.ts                   |  2 +-
 src/commands/gyms/google.ts                 |  2 +-
 src/commands/gyms/import.ts                 | 10 +++++-----
 src/commands/gyms/move.ts                   |  4 ++--
 src/commands/gyms/review.test.ts            |  2 +-
 src/commands/gyms/review.ts                 |  4 ++--
 src/commands/gyms/show.ts                   |  2 +-
 src/commands/help-paragraphs.test.ts        | 74 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/max/max.ts                     | 12 ++++++------
 src/commands/meetups/info.ts                |  2 +-
 src/commands/meetups/meetup.ts              | 10 +++++-----
 src/commands/meetups/places.ts              |  2 +-
 src/commands/notifications/targets.ts       |  2 +-
 src/commands/notifications/wants.ts         | 22 +++++++++++-----------
 src/commands/notifications/wild.test.ts     |  8 ++++----
 src/commands/notifications/wild.ts          | 14 +++++++-------
 src/commands/parties/attendance.ts          |  2 +-
 src/commands/parties/delete.ts              |  2 +-
 src/commands/parties/group.ts               |  4 ++--
 src/commands/parties/meet.ts                | 10 +++++-----
 src/commands/parties/report.ts              |  4 ++--
 src/commands/parties/shout.ts               |  4 ++--
 src/commands/raids/boss.ts                  |  6 +++---
 src/commands/raids/change.ts                |  8 ++++----
 src/commands/raids/raid.ts                  | 10 +++++-----
 src/commands/regions/edit.ts                |  2 +-
 src/commands/regions/export.ts              |  2 +-
 src/commands/regions/import.ts              | 12 ++++++------
 src/commands/regions/list.ts                |  2 +-
 src/commands/regions/remove.ts              |  6 +++---
 src/commands/research/research.ts           |  8 ++++----
 src/commands/rocket/rocket.test.ts          |  2 +-
 src/commands/rocket/rocket.ts               |  8 ++++----
 src/commands/roles/iam.ts                   |  4 ++--
 src/commands/screenshots/read-screenshot.ts |  4 ++--
 src/commands/settings/settings.ts           | 10 +++++-----
 src/commands/stops/pokestop.ts              |  2 +-
 src/commands/trains/move.ts                 |  6 +++---
 src/commands/trains/route.ts                | 10 +++++-----
 src/commands/trains/split.ts                |  4 ++--
 src/commands/trains/train.ts                | 14 +++++++-------
 src/commands/util/counters.test.ts          |  6 +++---
 src/commands/util/counters.ts               | 20 ++++++++++----------
 src/commands/util/help.test.ts              |  2 +-
 src/commands/util/rank.ts                   |  8 ++++----
 src/commands/util/request.ts                |  2 +-
 src/discord/command.ts                      |  2 +-
 57 files changed, 239 insertions(+), 164 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/gyms/review.test.ts src/commands/help-paragraphs.test.ts src/commands/notifications/wild.test.ts src/commands/rocket/rocket.test.ts src/commands/util/counters.test.ts src/commands/util/help.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 6d8d26c6f02f29bbe84529a80e4864816cfcdb16 -- src test docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8F-1 task 5: help in paragraphs`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index a1db4e62d910fc945a6d03c2973ab07960af880c..778319b6c8709d1170ca0953aa1040e565763e26 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -68,3 +68,4 @@ Designs `docs/superpowers/specs/2026-10-28-events-forum-design.md` and `2026-10-
 ## /help
 
 - `/help` answers with components-v2 pages for the member alone (`src/commands/util/help-render.ts`, plan 8B-2): the overview (each group with its commands' names, a command's other forms beside it, and the menu "Show a group…"), a group (a line per command with what it does, "Details of a command…" in one or two menus, "◀ All groups"), a command (what it does, **Usage**, **Examples**, "◀ <its group>", "All groups", and for a command with groups of subcommands "Subcommands of a group…"); `/help command:<command> <group>` and a subcommand's page lead one level up ("◀ /admin"; a subcommand of a group to its group, "◀ /admin boss"). The controls are the kind `help` (`help:overview:group`, `help:group:<category>:command|more|overview`, `help:command:<path>:back|overview|subgroup`; the id is the kind of page, the action which page, the first argument what the control does) and `update` the page; an example may hold `DATE_EXAMPLE` (`{date}`, `src/discord/command.ts`), shown as the date three days from today in `settings.timezone` (`dateExample`, `src/domain/time/clock-input.ts`; plan 8X-G: a fixed date goes stale once deployed, as the hint of `/train start:` and the time refusal's example did; the refusal of a time of a train or meetup says it the same way, `timedTimeHint`, and the deployed hints name no date, "month-day and time"); who is staff is asked anew with every press, and a staff page is answered as one that does not exist; `MEMBER_READ_THROTTLE`.
+- A command's or subcommand's `help.details` is written in short paragraphs separated by a blank line (plan 8F-1, Matt 2026-10-29): one idea each, at most three sentences and 320 characters, kept by `/help` (the text is one text display). Texts joined from parts join with a blank line (`/raid`'s and `/max`'s screenshot part, `alsoAs`'s note, the short forms of `/rank`). `src/commands/help-paragraphs.test.ts` refuses a longer paragraph in every command and subcommand, with screenshots on and off.
diff --git a/src/commands/admin/boss-list.ts b/src/commands/admin/boss-list.ts
index 17e27b404bcbf142f737160af3c831bc98357dda..1f20480b462db2f34c7513a398718a1b13adff21 100644
--- a/src/commands/admin/boss-list.ts
+++ b/src/commands/admin/boss-list.ts
@@ -301,10 +301,10 @@ export const listBosses: SubcommandPart = {
       'The bosses tier by tier as members see them. Each says whether it came from the feed ' +
       '(and how the feed entry was identified: by its picture, its name or both) or from an ' +
       'override, and what overrides act on it with their number and expiry; an add that moves ' +
-      "a boss from the feed's tier says which. A boss the game " +
+      "a boss from the feed's tier says which.\n\nA boss the game " +
       'data does not know yet is listed by the name the feed gives, with its ids. Hidden ' +
       'bosses and overrides that change nothing are listed apart; an override older than 30 ' +
-      'days, or one the feed has made pointless, is marked "old?". Where max battles are on, ' +
+      'days, or one the feed has made pointless, is marked "old?".\n\nWhere max battles are on, ' +
       "the max bosses follow (Pokebattler's feed), with the bosses it lists ahead of their start " +
       'under Coming; a max battle tier shows that tier only.',
     examples: ['/admin boss list', '/admin boss list tier:T5', '/admin boss list tier:Gigantamax'],
@@ -457,7 +457,7 @@ export const syncBosses: SubcommandPart = {
   help: {
     details:
       'Reads the feed at once and says what changed. A read that fails leaves the list as it ' +
-      'was. The game data (names, stats, forms) is not read again by this. With `max:True` it ' +
+      'was.\n\nThe game data (names, stats, forms) is not read again by this. With `max:True` it ' +
       "reads the max boss feed (Pokebattler's) instead.",
     examples: ['/admin boss sync', '/admin boss sync max:True'],
   },
diff --git a/src/commands/admin/boss-overrides.ts b/src/commands/admin/boss-overrides.ts
index 8fb03784e8801591c6860cd1c2149fb669c8834c..97fe92ca6640a3a9d86ad419f1417d7b8419ce55 100644
--- a/src/commands/admin/boss-overrides.ts
+++ b/src/commands/admin/boss-overrides.ts
@@ -332,10 +332,10 @@ export const addBoss: SubcommandPart = {
     details:
       'For a boss the feed has not listed yet (a leak, an event) or lists wrongly. A max ' +
       'battle tier (Dynamax 1★ to 5★, Gigantamax) changes the max boss list where max battles ' +
-      'are on. A boss has one tier at a time among the Dynamax tiers, the raid tiers (Elite ' +
+      'are on.\n\nA boss has one tier at a time among the Dynamax tiers, the raid tiers (Elite ' +
       'included) and the shadow raid tiers: adding it at one of them moves it there, and the ' +
       "feed's listing of it at another tier of the same kind is left out while the add lasts " +
-      '(Gigantamax and mega tiers are kinds of their own). Battles running at the tier it ' +
+      '(Gigantamax and mega tiers are kinds of their own).\n\nBattles running at the tier it ' +
       'moved from, in every server, move with it, said in their posts; removing the add does ' +
       `not move them back (\`/boss\` fixes one battle). It lasts ${String(DEFAULT_DAYS)} days unless you give \`days\`; \`days:0\` keeps ` +
       'it until you remove it with `/admin boss remove`. Adding it again replaces the earlier one.',
@@ -445,10 +445,10 @@ export const autosetBossPart: SubcommandPart = {
   help: {
     details:
       'An egg of the tier hatches as this Pokémon when nobody says otherwise, and it is a boss ' +
-      'of the tier. A tier with one boss does that by itself; this is for a tier with several. ' +
+      'of the tier. A tier with one boss does that by itself; this is for a tier with several.\n\n' +
       `It lasts ${String(DEFAULT_DAYS)} days unless you give \`days\` (\`days:0\` for good). ` +
       'A tier has one choice: a new one replaces the earlier one, which then is no boss of the ' +
-      "tier unless the feed lists it. It moves the boss from the feed's tier as `add` does. " +
+      "tier unless the feed lists it.\n\nIt moves the boss from the feed's tier as `add` does. " +
       'Raid tiers only: a max battle has no egg.',
     examples: ['/admin boss autoset pokemon:Yveltal tier:T5'],
   },
diff --git a/src/commands/admin/cleanup-legacy.ts b/src/commands/admin/cleanup-legacy.ts
index b4db7ebe438ac952591a690270274d616b0511dc..240a9ceee77836d6b8d618b77892874e63c8b449 100644
--- a/src/commands/admin/cleanup-legacy.ts
+++ b/src/commands/admin/cleanup-legacy.ts
@@ -273,9 +273,9 @@ export const cleanupLegacy: SubcommandPart = {
     details:
       'For the move from the legacy bot. Lists the channels of its parties in this server: those ' +
       'its files of active parties name (the folder LEGACY_PARTIES_DIR), and those it left behind, ' +
-      'found by their category, their name and the bot’s own first message. What only looks like ' +
+      'found by their category, their name and the bot’s own first message.\n\nWhat only looks like ' +
       'such a channel is listed apart and never deleted, and so are the channels of its trains, ' +
-      'meetups and saved parties, which stay as plain channels. Nothing is deleted until you press ' +
+      'meetups and saved parties, which stay as plain channels.\n\nNothing is deleted until you press ' +
       `"Delete" under the list, within ${CLEANUP_MINUTES} minutes; the channels then go one at a time.`,
     examples: ['/admin cleanup-legacy'],
   },
diff --git a/src/commands/admin/save-party.ts b/src/commands/admin/save-party.ts
index 73669957e989a54bec42b48dcf1db82551ad9a7f..9736a8ae68193828050327afc8778aabe740cec6 100644
--- a/src/commands/admin/save-party.ts
+++ b/src/commands/admin/save-party.ts
@@ -24,7 +24,7 @@ export const saveParty: SubcommandPart = {
     details:
       'Use it in the post of a raid, a max battle, a train or a meetup. A kept post stays open after that has ended: ' +
       'nothing warns that it will be archived and nothing archives it, until you run this with ' +
-      '`keep:False` or close it with `/delete`. The post says who kept it. Used anywhere ' +
+      '`keep:False` or close it with `/delete`. The post says who kept it.\n\nUsed anywhere ' +
       'else without an option, it lists the posts that are kept. For admins and moderators.',
     examples: ['/admin save-party', '/admin save-party keep:False'],
   },
diff --git a/src/commands/admin/self-roles.ts b/src/commands/admin/self-roles.ts
index 5efbfb623816fb244d5030b97a81969788970707..509c54546a8c95955639dd744a1c5835ecac69fc 100644
--- a/src/commands/admin/self-roles.ts
+++ b/src/commands/admin/self-roles.ts
@@ -220,10 +220,10 @@ const add: SubcommandPart = {
     details:
       'Makes a role of this server one that members can give themselves with `/iam`, or changes ' +
       'the description, the aliases and the group of one that is. An option you leave out stays ' +
-      'as it is; aliases you give replace the ones it had. I never hand out a role that grants a ' +
+      'as it is; aliases you give replace the ones it had.\n\nI never hand out a role that grants a ' +
       'permission of moderation or administration (in the server or through the settings of a ' +
       'channel), a role whose name makes its holder staff of mine (admin, moderator, bot ' +
-      'developer), a role an integration manages, or a role that is not below my own. You can ' +
+      'developer), a role an integration manages, or a role that is not below my own.\n\nYou can ' +
       'add a role only if you could give it to somebody yourself: ' +
       'with the Manage Roles permission and a role of your own above it, or as the owner of the ' +
       'server.',
@@ -572,7 +572,7 @@ const group: SubcommandPart = {
     details:
       'Roles are offered to members group by group: one menu per group in `/iam`, in the order ' +
       'of the groups, and the roles without a group last under "Other". With `pick-one` a ' +
-      'member can hold only one role of the group: taking another gives the first one back. ' +
+      'member can hold only one role of the group: taking another gives the first one back.\n\n' +
       'Put a role into a group with `/admin self-roles add`. An option you leave out stays as ' +
       'it is.',
     examples: [
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index b1db330aad322d567a9a29b6bbef87db6f395aa9..72fdb612a2969fae9e6d63fba7f2410cd3d34d46 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -234,13 +234,13 @@ export const setupForums: SubcommandPart = {
     details:
       'For each region of this server: creates the forum for its raids, max battles, trains ' +
       "and meetups next to the region's channel if it has none (named after the channel, " +
-      '`-board`; a forum of another one-word ending is renamed), adds the tags that are missing, ' +
-      'and posts and pins the board ("Today and coming up", with "Today’s Stops" below it). ' +
-      'Members can use commands in the board; what they write there is deleted (I need Manage ' +
-      'Messages in the forum). A board that stands is pinned again, and one locked before ' +
+      '`-board`; a forum of another one-word ending is renamed).\n\nIt adds the tags that are ' +
+      'missing, and posts and pins the board ("Today and coming up", with "Today’s Stops" below ' +
+      'it). Members can use commands in the board; what they write there is deleted (I need Manage ' +
+      'Messages in the forum).\n\nA board that stands is pinned again, and one locked before ' +
       'members could use it is opened once; a lock a moderator sets later stays. Nothing else ' +
       'that is already there changes, so it is safe to run again. A forum whose region is gone ' +
-      'is named and left alone. Where the settings name an events forum (`channels.events`), ' +
+      'is named and left alone.\n\nWhere the settings name an events forum (`channels.events`), ' +
       'it is made too, in the category of bot-updates, with posts made by me alone, and its ' +
       'listing "Events" is posted, pinned and locked.',
     examples: ['/admin setup-forums'],
diff --git a/src/commands/gyms/add.ts b/src/commands/gyms/add.ts
index 80458b059f39c46361d335411e5b56a01a91ef38..326a7215a77ed968262b04eca3a455c87c92a1df 100644
--- a/src/commands/gyms/add.ts
+++ b/src/commands/gyms/add.ts
@@ -230,9 +230,9 @@ export const addGym: SubcommandPart = {
   help: {
     details:
       `${HOW_TO_LOCATE} A link to the place from Google Maps (also the short link its app ` +
-      'shares), Apple Maps or the Ingress intel map is read as well. I show ' +
+      'shares), Apple Maps or the Ingress intel map is read as well.\n\nI show ' +
       'what I understood and ask before anything is stored; "Add with details…" opens a form ' +
-      'for a nickname, a description, a notice and keywords. A gym may lie outside every ' +
+      'for a nickname, a description, a notice and keywords.\n\nA gym may lie outside every ' +
       'region. Its address and the places around it are fetched from Google afterwards.',
     examples: [
       '/gym add location:https://maps.google.com/?q=40.4406,-79.9959… name:Big Fountain',
diff --git a/src/commands/gyms/delete.ts b/src/commands/gyms/delete.ts
index 4026bea25bf9a6dd4c7f581dfa97d03f311e36d7..4f2330b2d1d6943b80d5d01dc21492c4537b29a9 100644
--- a/src/commands/gyms/delete.ts
+++ b/src/commands/gyms/delete.ts
@@ -80,7 +80,7 @@ export const deleteGym: SubcommandPart = {
       'For a gym that no longer exists in the game. I ask first, in a dialog, and say what ' +
       'goes with it: it is taken off the route of every active train (the train’s post says ' +
       'why) and off every saved route, and members who have it as a gym target lose that ' +
-      'target. It cannot be deleted while a raid is there. A gym that was only put down ' +
+      'target.\n\nIt cannot be deleted while a raid is there. A gym that was only put down ' +
       'wrongly is moved with `/gym move` instead.',
     examples: ['/gym delete gym:Big Fountain'],
   },
diff --git a/src/commands/gyms/duplicates.ts b/src/commands/gyms/duplicates.ts
index 578a651f29cb48bb3ab1b25948b1bbf4a0a5803e..90ef273cabb3e84d7628daa009203a4d1fc49682 100644
--- a/src/commands/gyms/duplicates.ts
+++ b/src/commands/gyms/duplicates.ts
@@ -52,7 +52,7 @@ export const duplicateGyms: SubcommandPart = {
       'Gyms of one region with the same name (several Starbucks) can be told apart only by a ' +
       'nickname: in the menu `/raid` shows, and when a screenshot names one. This lists them, ' +
       'per region of this server, with their numbers and descriptions; give each a nickname ' +
-      'with `/gym edit`. Names are compared by their letters and digits alone (case, accents, ' +
+      'with `/gym edit`.\n\nNames are compared by their letters and digits alone (case, accents, ' +
       'spaces and punctuation do not count: "P.N.C. Park" is "PNC Park"); a gym with a ' +
       'nickname of its own is not listed.',
     examples: ['/gym duplicates'],
diff --git a/src/commands/gyms/edit.ts b/src/commands/gyms/edit.ts
index 2daf56e3a99ae8c4760564485a468b54b9e57ccf..d64d89af6ceb3e70d8e5fd4e1968ad54e3229b17 100644
--- a/src/commands/gyms/edit.ts
+++ b/src/commands/gyms/edit.ts
@@ -95,7 +95,7 @@ export const editGym: SubcommandPart = {
     details:
       'A form opens with the texts as they are: change what you want and send it. A nickname, ' +
       'description or notice that you empty is removed; the keywords you leave are the ' +
-      'keywords it has. Only the fields you changed are written. The notice is shown in ' +
+      'keywords it has. Only the fields you changed are written.\n\nThe notice is shown in ' +
       'every raid post at the gym. To move a gym use `/gym move`, to mark it as an elite raid ' +
       'gym `/gym elite`.',
     examples: ['/gym edit gym:Big Fountain'],
diff --git a/src/commands/gyms/google.ts b/src/commands/gyms/google.ts
index 08fafd7d03babd3ec304a42b7bbc0508849cde0e..f55d41cbe76fe4501a94c1902bfe9a6aeb03f797 100644
--- a/src/commands/gyms/google.ts
+++ b/src/commands/gyms/google.ts
@@ -159,7 +159,7 @@ export const googleLine: SubcommandPart = {
       'Gyms are also found by the names of the places around them, and PokéStops and Power ' +
       'Spots too, which I ask Google for one at a time within a monthly budget that stays ' +
       'within its free amounts: gyms first, the busiest regions first, then PokéStops and Power ' +
-      'Spots a little every day. This says how many of this server wait, how much of the ' +
+      'Spots a little every day.\n\nThis says how many of this server wait, how much of the ' +
       'month’s budget is used, and when they will be done at this pace.',
     examples: ['/gym google'],
   },
diff --git a/src/commands/gyms/import.ts b/src/commands/gyms/import.ts
index 7b6c271b8668d32e0baba7eb6bce95f9de2164d0..af589ef2a3e32093aac32141b5ab5b24f128251a 100644
--- a/src/commands/gyms/import.ts
+++ b/src/commands/gyms/import.ts
@@ -834,18 +834,18 @@ export const importGyms: SubcommandPart = {
   help: {
     details: (settings) =>
       'The true list of gyms is Wayfarer’s. The export is made by the Pine Wayspot export ' +
-      `tool: ask for it at ${settings.wayspotTool}. It takes the KML file of \`/region export\`. ` +
+      `tool: ask for it at ${settings.wayspotTool}. It takes the KML file of \`/region export\`.\n\n` +
       `Attach the file it saves (${EXPORT_NAME}) here; an export too large for one upload ` +
       `is saved in up to ${MAX_EXPORT_PARTS} parts (\`…-part1of3.json.gz\` and so on): attach ` +
-      'every part at once, as `file`, `file2` and so on, in any order. I show what the ' +
+      'every part at once, as `file`, `file2` and so on, in any order.\n\nI show what the ' +
       'import would do ' +
       'before anything is changed: gyms found in Wayfarer take the Wayspot’s name and place, ' +
-      'Wayfarer gyms that no gym is are added, and every gym is listed in the attached report. ' +
+      'Wayfarer gyms that no gym is are added, and every gym is listed in the attached report.\n\n' +
       'An import never deletes a gym: what needs a person (which Wayspot a gym is, a gym ' +
-      'Wayfarer no longer has) goes to the review queue of `/gym review`. The scan also goes a ' +
+      'Wayfarer no longer has) goes to the review queue of `/gym review`.\n\nThe scan also goes a ' +
       `little beyond the regions (${distanceWords(DEFAULT_SCAN_MARGIN, settings.distanceUnits)} unless set otherwise): Wayfarer gyms found ` +
       'there are never added, but the report lists them as `outside`, so you see where an ' +
-      'outline should grow. Gyms of this server in no region and beyond the area a finished ' +
+      'outline should grow.\n\nGyms of this server in no region and beyond the area a finished ' +
       'scan of every region covered are listed as `beyond`: once the import is done, a button ' +
       'offers to delete them, after a question that names them. When gyms changed, the channel ' +
       'for bot updates gets one summary of what changed.',
diff --git a/src/commands/gyms/move.ts b/src/commands/gyms/move.ts
index adac6305e28fac78261597522a740e46460a031a..c059c5305038263fdf43b6a616055a6119b1ce61 100644
--- a/src/commands/gyms/move.ts
+++ b/src/commands/gyms/move.ts
@@ -199,10 +199,10 @@ export const moveGym: SubcommandPart = {
   help: {
     details: (settings) =>
       `${HOW_TO_LOCATE} The location is read as for ` +
-      '`/gym add`. The gym keeps its texts, its raids and its ' +
+      '`/gym add`.\n\nThe gym keeps its texts, its raids and its ' +
       'place on train routes; its address and the places around it are fetched again, and ' +
       'the regions it lies in follow its new place. I ask first when the new place is more ' +
-      `than ${distanceWords(FAR_MOVE_METRES, settings.distanceUnits)} away or right beside another gym. This corrects where a gym is: to ` +
+      `than ${distanceWords(FAR_MOVE_METRES, settings.distanceUnits)} away or right beside another gym.\n\nThis corrects where a gym is: to ` +
       'move a raid to another gym, use `/location` in the raid’s post.',
     examples: ['/gym move gym:Big Fountain location:40.4406, -79.9959'],
   },
diff --git a/src/commands/gyms/review.test.ts b/src/commands/gyms/review.test.ts
index ed2d5fe378ecbec8eae1b759894834b0e85a9dc2..eef7a38dd8ebf6ad40fe2f169e6bab864301a00e 100644
--- a/src/commands/gyms/review.test.ts
+++ b/src/commands/gyms/review.test.ts
@@ -685,7 +685,7 @@ describe('/gym review: the answers to an item to match', () => {
     const details = gym.subcommands.get('review')?.help?.details;
     expect(typeof details === 'string' && details).toContain(
       '"None of these" says the Wayfarer gyms listed are other gyms: the next import adds them. ' +
-        '"Keep" and "None of these" stand until the Wayspots near the gym change. Skip for now ' +
+        '"Keep" and "None of these" stand until the Wayspots near the gym change.\n\nSkip for now ' +
         '(to the end of the queue) is for when you are not sure.',
     );
   });
diff --git a/src/commands/gyms/review.ts b/src/commands/gyms/review.ts
index 7ba1ae2e5a59ac1658eba881abfe8d961f613654..91f8619ac562c6818f65467984205b08dd7913d3 100644
--- a/src/commands/gyms/review.ts
+++ b/src/commands/gyms/review.ts
@@ -529,10 +529,10 @@ export const reviewGyms: SubcommandPart = {
       'What `/gym import` could not decide by itself waits here, oldest first: which Wayspot ' +
       'nearby a gym is ("Same as", or "New gym" when the Wayspot is another gym), a gym ' +
       'Wayfarer no longer has (Delete or Keep), a gym Wayfarer never had (Delete, or Not in ' +
-      'Wayfarer for a sponsored gym, which imports then leave alone). Every gym can be deleted ' +
+      'Wayfarer for a sponsored gym, which imports then leave alone).\n\nEvery gym can be deleted ' +
       'from here (I ask first). "None of these" says the Wayfarer gyms listed are other gyms: ' +
       'the next import adds them. "Keep" and "None of these" stand until the Wayspots near the ' +
-      'gym change. Skip for now (to the end of the queue) is for when you are not sure. Each ' +
+      'gym change.\n\nSkip for now (to the end of the queue) is for when you are not sure. Each ' +
       'answer shows the next gym; staff may answer the queue together.',
     examples: ['/gym review'],
   },
diff --git a/src/commands/gyms/show.ts b/src/commands/gyms/show.ts
index 88175ca5cf710312651d3a7d10257d78c4872edb..3440cff0709ac6de2b33afac1cd1399f3d21c033 100644
--- a/src/commands/gyms/show.ts
+++ b/src/commands/gyms/show.ts
@@ -19,7 +19,7 @@ export const showGym: SubcommandPart = {
       'Name, nickname and number, a link to the place, description, notice, whether it is an ' +
       'elite raid gym, keywords, the regions of this server it lies in, the nearest gym, how ' +
       'many members have it as a gym target, and the address and nearby places Google gave, ' +
-      'by which it is also found, with its map. Buttons under it edit its texts, mark it as an ' +
+      'by which it is also found, with its map.\n\nButtons under it edit its texts, mark it as an ' +
       'elite raid gym or take the mark away, move it and delete it, as the commands do. Pick ' +
       'the gym from the list, or give its number.',
     examples: ['/gym show gym:Big Fountain', '/gym show gym:#123'],
diff --git a/src/commands/help-paragraphs.test.ts b/src/commands/help-paragraphs.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4974e29bba977c87e831eb18f3a85d741e612326
--- /dev/null
+++ b/src/commands/help-paragraphs.test.ts
@@ -0,0 +1,74 @@
+import { describe, expect, it } from 'vitest';
+import { TEST_ENV } from '../../test/support/test-env.js';
+import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
+import { loadEnv } from '../config/env.js';
+import type { Config } from '../config/index.js';
+import { loadSettings, type Settings } from '../config/settings.js';
+import type { CommandHelp, CommandModule } from '../discord/command.js';
+import { commands } from './index.js';
+
+/** The longest paragraph `/help` may show (plan 8F-1): one idea, at most three sentences. */
+const PARAGRAPH = 320;
+
+const settings = loadSettings(TEST_SETTINGS_PATH);
+const env = loadEnv(TEST_ENV);
+/** The test settings with screenshots read and not read. */
+const configs: Config[] = [true, false].map((enabled) => ({
+  env,
+  settings: { ...settings, ocr: { ...settings.ocr, enabled } },
+}));
+
+/** Every form of a command an installation may offer: as listed, and for each configuration. */
+function formsOf(command: CommandModule): CommandModule[] {
+  return [command, ...configs.map((config) => command.forConfig?.(config) ?? command)];
+}
+
+/** Every details text of a command and of each of its subcommands, by where it stands. */
+function detailsOf(command: CommandModule, given: Settings): [string, string][] {
+  const name = `/${command.data.name}`;
+  const said = (details: CommandHelp['details']): string | undefined =>
+    typeof details === 'function' ? details(given) : details;
+  const own = said(command.help.details);
+  const subs = command.subcommands
+    ? [...command.subcommands].map(([path, sub]) => [`${name} ${path}`, said(sub.help?.details)])
+    : [];
+  return [[name, own], ...subs].filter((pair): pair is [string, string] => pair[1] !== undefined);
+}
+
+describe('/help in paragraphs (plan 8F-1)', () => {
+  it('breaks every command’s and subcommand’s details into paragraphs of at most 320 characters', () => {
+    const tooLong: string[] = [];
+    let texts = 0;
+    for (const command of commands) {
+      for (const form of formsOf(command)) {
+        for (const config of configs) {
+          for (const [where, text] of detailsOf(form, config.settings)) {
+            texts++;
+            for (const paragraph of text.split('\n\n')) {
+              if (paragraph.length > PARAGRAPH) {
+                tooLong.push(`${where} (${paragraph.length}): ${paragraph.slice(0, 60)}…`);
+              }
+            }
+          }
+        }
+      }
+    }
+    expect(texts).toBeGreaterThan(100);
+    expect([...new Set(tooLong)]).toEqual([]);
+  });
+
+  it('keeps no paragraph empty, nor one that starts or ends in white space', () => {
+    for (const command of commands) {
+      for (const form of formsOf(command)) {
+        for (const config of configs) {
+          for (const [where, text] of detailsOf(form, config.settings)) {
+            for (const paragraph of text.split('\n\n')) {
+              expect(paragraph.trim(), where).toBe(paragraph);
+              expect(paragraph, where).not.toBe('');
+            }
+          }
+        }
+      }
+    }
+  });
+});
diff --git a/src/commands/max/max.ts b/src/commands/max/max.ts
index f036237bd69a4edbb36e432fa33f90966e02175b..24cf62b67d5c4cd089a2970515c42fb09517b5ef 100644
--- a/src/commands/max/max.ts
+++ b/src/commands/max/max.ts
@@ -257,17 +257,17 @@ const DETAILS =
   "Creates a post for a max battle in the raid forum of the spot's region. Pick the boss and " +
   'the Power Spot from the lists that appear while you type (the bosses of an event that is ' +
   'on come first); a Pokémon that can Dynamax may be typed in full, with `tier` when it is on ' +
-  'no list. A spot Pine does not know can be given as a maps link or coordinates: it becomes ' +
-  'an unlisted power spot. A battle lasts until the end of its rotation (the next half hour ' +
+  'no list.\n\nA spot Pine does not know can be given as a maps link or coordinates: it becomes ' +
+  'an unlisted power spot.\n\nA battle lasts until the end of its rotation (the next half hour ' +
   'in a short event, the next hour all day and for Gigantamax), otherwise until the last ' +
-  'battle of the day, or the start of a max event later that day; `end` sets another. If the ' +
+  'battle of the day, or the start of a max event later that day; `end` sets another.\n\nIf the ' +
   'spot already has a battle of that boss, you are shown its post instead; one ending within ' +
   'five minutes is asked about first.';
 
 const SCREENSHOT_DETAILS =
-  ' Or attach a screenshot of the max battle instead: I read the Power Spot, the boss, its ' +
+  'Or attach a screenshot of the max battle instead: I read the Power Spot, the boss, its ' +
   'tier and the time left from it, and ask only when I am not sure which Power Spot it is. ' +
-  'What you type beside it counts instead of what I read. A screenshot newer than the boss of ' +
+  'What you type beside it counts instead of what I read.\n\nA screenshot newer than the boss of ' +
   'the battle already at the spot changes its boss, unless you typed the boss or the Power ' +
   'Spot. The screenshot is kept for a while and may be used to improve the reader.';
 
@@ -276,7 +276,7 @@ function maxCommand(screenshots: boolean): SimpleCommand {
     data: maxData(screenshots),
     help: {
       category: 'raid-crud',
-      details: screenshots ? DETAILS + SCREENSHOT_DETAILS : DETAILS,
+      details: screenshots ? `${DETAILS}\n\n${SCREENSHOT_DETAILS}` : DETAILS,
       examples: [
         '/max boss:machamp spot:Gazebo',
         '/max boss:gigantamax machamp spot:40.4406, -79.9959 end:20',
diff --git a/src/commands/meetups/info.ts b/src/commands/meetups/info.ts
index ed81ade98bdcea6d9e741824f4309c64fab0824d..e7a194bab648935309c1c0f01d4c630d1fde552e 100644
--- a/src/commands/meetups/info.ts
+++ b/src/commands/meetups/info.ts
@@ -98,7 +98,7 @@ export const info: SimpleCommand = {
     category: 'meetup',
     details:
       'Use it in the post of the meetup. A form opens with the text as it is now: where to ' +
-      'meet, what to bring, how long it goes. What you send is shown in the post under ' +
+      'meet, what to bring, how long it goes.\n\nWhat you send is shown in the post under ' +
       '"Meeting Information"; sent back empty, it removes the text. The post says who changed it.',
     examples: ['/info'],
   },
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index ceadafe97a02fe955a47dbefcafa9f872d13e27b..a3e9dbaf4df8d90214c33a9728abb983b852dfae 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -267,16 +267,16 @@ export const meetup: SimpleCommand = {
     details:
       'For anything that is not a raid at one gym: a Community Day in the park, a trade ' +
       'evening. Use it in the channel of a region; the meetup gets a post in the forum of that ' +
-      'region, and you are marked as interested. `near` says the gym or PokéStop ' +
+      'region, and you are marked as interested.\n\n`near` says the gym or PokéStop ' +
       'it is near (pick one from the list that appears while you type), or a place you paste ' +
       'as a link from a maps app or as coordinates; the post shows the place with a map link, ' +
-      'and it cannot be changed afterwards. `start` says when it starts. A form then asks what ' +
-      'there is to know: where exactly to meet, what to bring. A meetup at a pin, or at a place ' +
+      'and it cannot be changed afterwards.\n\n`start` says when it starts. A form then asks what ' +
+      'there is to know: where exactly to meet, what to bring.\n\nA meetup at a pin, or at a place ' +
       "that might be somebody's home, needs a moderator's approval before it is posted: you " +
       'are told by direct message once they have decided (so give a start at least two hours ' +
-      'ahead). In the post, change when it starts with `/meet`, set when it ends with `/end`, ' +
+      'ahead).\n\nIn the post, change when it starts with `/meet`, set when it ends with `/end`, ' +
       'change the information with `/info`, and rename it with `/name`. Members sign up with ' +
-      'the buttons, as for a raid. A meetup is archived an hour after it is over: after its ' +
+      'the buttons, as for a raid.\n\nA meetup is archived an hour after it is over: after its ' +
       'end, or without one a day after its start. One whose start was removed goes a day after ' +
       'it was made, or after its last time was removed; its post says when. Official meetups ' +
       `by Community Ambassadors are on Campfire: ${CAMPFIRE_DISCOVER_URL}`,
diff --git a/src/commands/meetups/places.ts b/src/commands/meetups/places.ts
index 79994a720a5aac3f974724782a752002207093c7..d5ec8671469f3e22009be63621691bbbe61469b7 100644
--- a/src/commands/meetups/places.ts
+++ b/src/commands/meetups/places.ts
@@ -110,7 +110,7 @@ export const places: SimpleCommand = {
     details:
       'For admins and moderators. With a place: whether meetups there are allowed or refused ' +
       'for good, who decided, when and from which post, with Undo ruling (a meetup there is ' +
-      'then checked by its name again; nobody is told). Without: refused and allowed places, ' +
+      'then checked by its name again; nobody is told).\n\nWithout: refused and allowed places, ' +
       'pending meetup requests, asks about places, blocked members (with Lift block), open ' +
       'appeals and open reports, each with a link to its post in the moderators’ channel. ' +
       'Server Settings › Integrations decide who sees it (Manage Messages by default).',
diff --git a/src/commands/notifications/targets.ts b/src/commands/notifications/targets.ts
index 35d8254e437eb32040056b304dd195488c5809e8..bdfe6bcfc739e302b1bf6452f28f2eb8c0dc6b6e 100644
--- a/src/commands/notifications/targets.ts
+++ b/src/commands/notifications/targets.ts
@@ -184,7 +184,7 @@ export const target: SimpleCommand = {
     details:
       'Makes a gym one of your gyms in this server: you get a direct message when a raid is ' +
       'reported there. Pick the gym from the list that appears while you type; any gym of ' +
-      'this server can be picked from any channel. In the post of a raid or a train you can ' +
+      'this server can be picked from any channel.\n\nIn the post of a raid or a train you can ' +
       'leave `gym` out, for the gym of that raid or the stop the train is at.',
     examples: ['/target gym:Big Fountain', '/target'],
   },
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 2aa7eac7e353afe6c19cdb141b2c8cb972e29dd3..6d1b812cfb914c60995cc82fb97266fbdace159f 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -484,24 +484,24 @@ export const want: SimpleCommand = {
     details:
       'Puts a Pokémon, a raid tier, perfect or zero IVs, or a research reward (an item such as ' +
       'Rare Candy, or Mega Energy) on your list for this server: you get a direct message when ' +
-      'one is reported in a region you can see. For a Pokémon a dialog asks what for: Raids, ' +
+      'one is reported in a region you can see.\n\nFor a Pokémon a dialog asks what for: Raids, ' +
       'Dynamax and Gigantamax max battles, Spawns, Research (field research that may reward ' +
       'it) and Shadow (shadow raids and Team GO Rocket catches), each only where the game has ' +
-      'it; tick what you want, and untick everything to take it off. Where a Pokémon has ' +
+      'it; tick what you want, and untick everything to take it off.\n\nWhere a Pokémon has ' +
       'several forms (megas included, which are told for raids only) it asks which; every form ' +
       'ticked is the whole species, forms that come later included. Where it can wear a ' +
       'costume, "Only costumed" narrows the want to costumed ones (any costume); unticked, ' +
-      'costumed ones come too. Picking a form from the list (`Galarian Corsola`) opens its ' +
+      'costumed ones come too.\n\nPicking a form from the list (`Galarian Corsola`) opens its ' +
       'species with that form ticked. Remove takes the Pokémon off your list. A raid tier asks ' +
-      'about its raids and its shadow raids. ' +
+      'about its raids and its shadow raids.\n\n' +
       '`/want rocket` (or a grunt type, a leader or Giovanni) asks in one dialog which grunt ' +
       'types (at most one direct message an hour for each), the untyped and decoy grunts, ' +
-      'Cliff, Arlo, Sierra, any leader and Giovanni you want. Wanting something again shows ' +
-      'what you ticked. A first want opens with no box ticked, and Submit waits till one is. ' +
+      'Cliff, Arlo, Sierra, any leader and Giovanni you want.\n\nWanting something again shows ' +
+      'what you ticked. A first want opens with no box ticked, and Submit waits till one is.\n\n' +
       'In the post of a raid or a max battle, `/want` alone is its boss (an egg: its tier; a ' +
       'boss Pine does not know yet has to be named), and the dialog ticks that kind of battle ' +
       'only (Raids, Shadow for a shadow raid, Dynamax or Gigantamax), also for a Pokémon you ' +
-      'type there; anywhere else, name a Pokémon. Pick from the list that appears while you ' +
+      'type there; anywhere else, name a Pokémon.\n\nPick from the list that appears while you ' +
       'type, or type a name or a tier such as `t5`, `mega`, `elite`, `perfect` or `zero`.',
     examples: [
       '/want target:Dratini',
@@ -998,10 +998,10 @@ export const unwant: SimpleCommand = {
     details:
       'Takes a Pokémon, a raid tier, perfect or zero IVs, a research reward or a Team GO Rocket ' +
       'target off your list for this server, whatever you ticked for it. A Pokémon takes all ' +
-      'its forms off with it. A form (`Galarian Corsola`) is taken off where you want it by ' +
+      'its forms off with it.\n\nA form (`Galarian Corsola`) is taken off where you want it by ' +
       'itself; where your want of the whole species covers it, nothing is taken off, and ' +
-      '`/want` on the species changes which forms. Unown’s letters are wants of their own. ' +
-      '"Team GO Rocket" takes every Rocket want off; a grunt type or leader, that one alone. The ' +
+      '`/want` on the species changes which forms. Unown’s letters are wants of their own.\n\n' +
+      '"Team GO Rocket" takes every Rocket want off; a grunt type or leader, that one alone.\n\nThe ' +
       'list that appears while you type shows what is on it; you can also type the name as for ' +
       '`/want`. To keep some of what you ticked, use `/want` again instead.',
     examples: ['/unwant target:Mewtwo', '/unwant target:t5'],
@@ -1209,7 +1209,7 @@ export const wants: SimpleCommand = {
     details:
       'Shows your list for this server, ten to a page: each Pokémon once with its forms and what ' +
       'you want it for (`Dratini: Raids, Research, Shadow`), by name, then the raid tiers, Team ' +
-      'GO Rocket, the research rewards and perfect or zero IVs. A Pokémon or a tier has Change…, ' +
+      'GO Rocket, the research rewards and perfect or zero IVs.\n\nA Pokémon or a tier has Change…, ' +
       'which opens its dialog (Remove there takes it off); the others a Remove button. "Remove ' +
       'all…" asks before it empties the list.',
     examples: ['/wants'],
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index 660e4af9834ff7d971bbf5034a74780dd2f60436..11b56cdfbb27bf048dff8bff8d87f551e09a9745 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -346,7 +346,7 @@ describe('/wild', () => {
     const settings = { ...made.ctx.config.settings, wildSpawnExceptions: listed };
     // Before anything read the list, the help does not guess at names.
     expect(textDisplays(renderCommandHelp(wildCommand, settings))[0]).toContain(
-      'ultra beasts do not, with few exceptions. `details`',
+      'ultra beasts do not, with few exceptions.\n\n`details`',
     );
     const { ctx, entries } = createTestContext({
       regions: made.regions,
@@ -383,18 +383,18 @@ describe('/wild', () => {
     // The help names what the game data knew, by its names: not `Nobody`, and no key.
     const help = textDisplays(renderCommandHelp(wildCommand, settings))[0] ?? '';
     expect(help).toContain(
-      'ultra beasts do not, except Articuno, Tapu Koko and Giratina. `details`',
+      'ultra beasts do not, except Articuno, Tapu Koko and Giratina.\n\n`details`',
     );
     // Another settings object with the same list reads the same.
     const same = { ...settings, wildSpawnExceptions: [...listed] };
     expect(textDisplays(renderCommandHelp(wildCommand, same))[0]).toBe(help);
     const none = renderCommandHelp(wildCommand, { ...settings, wildSpawnExceptions: [] });
-    expect(textDisplays(none)[0]).toContain('ultra beasts do not. `details`');
+    expect(textDisplays(none)[0]).toContain('ultra beasts do not.\n\n`details`');
     // The usual list is read here, as the start of the bot reads it: whether an earlier test
     // happened to read it must not matter.
     wildExceptionsOf(made.ctx);
     const usual = textDisplays(renderCommandHelp(wildCommand, made.ctx.config.settings))[0];
-    expect(usual).toContain('ultra beasts do not, except Uxie, Mesprit and Azelf. `details`');
+    expect(usual).toContain('ultra beasts do not, except Uxie, Mesprit and Azelf.\n\n`details`');
   });
 
   it('does not offer what never appears in the wild, nor suggest it', async () => {
diff --git a/src/commands/notifications/wild.ts b/src/commands/notifications/wild.ts
index e87b0efff5c87db6c5bc542847a12e0fdbaeb64b..bc95ac13c3a55ba41dbc0348b8df3e252707172b 100644
--- a/src/commands/notifications/wild.ts
+++ b/src/commands/notifications/wild.ts
@@ -267,22 +267,22 @@ export const wildCommand: SimpleCommand = {
     details: (settings) =>
       'Tells the region about a Pokémon you met in the wild. Use it in the channel of a ' +
       'region (or in its forum or a post there): the report goes into the region’s channel ' +
-      `and is removed after ${String(SPAWN_MINUTES)} minutes, because spawns do not last. ` +
+      `and is removed after ${String(SPAWN_MINUTES)} minutes, because spawns do not last.\n\n` +
       (settings.features.notifications
-        ? 'Members who put that Pokémon on their list with `/want` get a direct message. '
+        ? 'Members who put that Pokémon on their list with `/want` get a direct message.\n\n'
         : '') +
       'Any Pokémon that appears in the wild can be reported, a form as that form (`Alolan ' +
       'Rattata`); megas, legendary and mythical Pokémon and ultra beasts do not' +
       exceptionsClause(settings.wildSpawnExceptions) +
-      '. `details` says where it is and is needed: a report is of no use ' +
-      'without it. `near` names a gym, PokéStop or Power Spot it is near: pick one from the ' +
+      '.\n\n`details` says where it is and is needed: a report is of no use ' +
+      'without it.\n\n`near` names a gym, PokéStop or Power Spot it is near: pick one from the ' +
       'list that appears while you type (your region’s first; each says its street or the gym ' +
       'nearest to it), or paste a link to the place from a maps app, or its coordinates ' +
-      '(`40.4406, -79.9959`): the report shows it with a map link. `iv` says that you checked it ' +
+      '(`40.4406, -79.9959`): the report shows it with a map link.\n\n`iv` says that you checked it ' +
       'and its IVs are perfect or zero' +
       (settings.features.notifications
-        ? ', which also tells the members who asked for those. '
-        : '. ') +
+        ? ', which also tells the members who asked for those.\n\n'
+        : '.\n\n') +
       `You can make ${limitWords(WILD_THROTTLE)}.`,
     examples: [
       '/wild pokemon:Dratini details:by the fountain on Market Street',
diff --git a/src/commands/parties/attendance.ts b/src/commands/parties/attendance.ts
index 8afc51363fd90fecd938a6dc8343033a606ce1ce..c323debf0a3aa5a1b37795e87afb8e67ab25d1ca 100644
--- a/src/commands/parties/attendance.ts
+++ b/src/commands/parties/attendance.ts
@@ -186,7 +186,7 @@ export const done: SimpleCommand = {
     category: 'basic-raid',
     details:
       'Marks you as done. The others of your group who are here are asked whether they are done ' +
-      'too; without an answer they count as done after a few minutes. A train or meetup has nothing to ' +
+      'too; without an answer they count as done after a few minutes.\n\nA train or meetup has nothing to ' +
       `complete: there it takes you off the list, like \`/leave\`. ${IN_A_POST}`,
   },
   guards: [requireParty],
diff --git a/src/commands/parties/delete.ts b/src/commands/parties/delete.ts
index 7da33f4aca554e5f68e7e02344a8bc3bfcf1f6bd..ff924faf6cb843a384a063bb0e16cda863866444 100644
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -221,7 +221,7 @@ export const deleteParty: SimpleCommand = {
     details:
       'For admins and moderators: closes the raid, max battle, train or meetup of the post you use it in. ' +
       'It asks first, in a dialog, whether to archive its post (it stays readable and locked) ' +
-      'or to delete the post with everything written in it. Members tell the moderators with ' +
+      'or to delete the post with everything written in it.\n\nMembers tell the moderators with ' +
       '`/report`. Server Settings › Integrations decide who sees it (Manage Messages by default).',
     examples: ['/delete'],
   },
diff --git a/src/commands/parties/group.ts b/src/commands/parties/group.ts
index 11a1273c1ca66f8c5e659fa985bc166daeb2c591..833763fbeb7661ec8c2cf101978c04947eb59868 100644
--- a/src/commands/parties/group.ts
+++ b/src/commands/parties/group.ts
@@ -47,10 +47,10 @@ const newGroup: SubcommandPart = {
     details:
       'For more trainers than one lobby holds, or for trainers who want to raid apart from ' +
       "the others. The post's Interested, Join and Here then ask a newcomer which group; who " +
-      'signs up without choosing (+1, Remote, the commands) lands in the newest group. A group ' +
+      'signs up without choosing (+1, Remote, the commands) lands in the newest group.\n\nA group ' +
       'nobody is in goes, unless it has a label or a meeting time, so a new group is refused ' +
       'while you are alone in such a group: it would change nothing. A raid, max battle or train has at ' +
-      'most five groups. The same as Group… on the post, which also takes a label.',
+      'most five groups.\n\nThe same as Group… on the post, which also takes a label.',
   },
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
diff --git a/src/commands/parties/meet.ts b/src/commands/parties/meet.ts
index 0929805b83872d1ef004b6cd9b3afb28b0e0adf2..e4c9c53078a196a2fe4ac981dbaacc9ed7e74908 100644
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -92,18 +92,18 @@ export const meet: SimpleCommand = {
     category: 'basic-raid',
     details:
       'In the post of a raid: sets the meeting time of the group you are in and tells the ' +
-      'others of the group. The time must lie between now (or the hatch) and the end of the ' +
+      'others of the group.\n\nThe time must lie between now (or the hatch) and the end of the ' +
       'raid; `hatch` means the hatch time, `cancel` removes the meeting time (on the post, the ' +
       "button with the game's Select Time icon offers the in-game RSVP times). A while after it, " +
-      'those who are here are asked whether they are done. In the post of a max battle: the same, ' +
+      'those who are here are asked whether they are done.\n\nIn the post of a max battle: the same, ' +
       'but the time lies between now and the end of the battle, which has no hatch (no `hatch`; ' +
-      'the button offers the five-minute times of the next hour). In the post of a train or ' +
+      'the button offers the five-minute times of the next hour).\n\nIn the post of a train or ' +
       'meetup: sets when ' +
       'it starts, for everybody, and tells the others who are signed up. Give a clock ' +
       'time, a date and a time, or `in 30` for minutes from now (a bare number is an hour ' +
-      'there); `cancel` removes the start. A time without a date is read on the day the party ' +
+      'there); `cancel` removes the start.\n\nA time without a date is read on the day the party ' +
       'starts, or else the day it ends, while that day is still to come, and otherwise on ' +
-      `today's date; a date comes first, month-day (\`${DATE_EXAMPLE} 6pm\`). ` +
+      `today's date; a date comes first, month-day (\`${DATE_EXAMPLE} 6pm\`).\n\n` +
       'You must be signed up.',
     examples: ['/meet time:6:15pm', '/meet time:hatch', `/meet time:${DATE_EXAMPLE} 6:15pm`],
   },
diff --git a/src/commands/parties/report.ts b/src/commands/parties/report.ts
index a82af92392aefc9b51e03e8194a6c8bbf9788242..8189743c2c212688f1b8dafb5714acbb1d26ff6e 100644
--- a/src/commands/parties/report.ts
+++ b/src/commands/parties/report.ts
@@ -185,8 +185,8 @@ export const report: SimpleCommand = {
     details:
       'Use it in the post of the raid, max battle, train or meetup. A form asks what is wrong (a meetup at ' +
       "somebody's home, a duplicate raid, something hurtful); only the moderators read it, and " +
-      'they decide what to do. To report one message, use **Report to moderators** in the Apps ' +
-      'menu of the message. It takes the place of `/delete`, which is for moderators now. What ' +
+      'they decide what to do.\n\nTo report one message, use **Report to moderators** in the Apps ' +
+      'menu of the message.\n\nIt takes the place of `/delete`, which is for moderators now. What ' +
       'nobody comes to needs no report: it goes away by itself after it ends.',
     examples: ['/report'],
   },
diff --git a/src/commands/parties/shout.ts b/src/commands/parties/shout.ts
index 4b3781dab987fba031ca1ca9b50140b644d23989..1a8555f3b20c87f4302f2b91b814da4ce93b762c 100644
--- a/src/commands/parties/shout.ts
+++ b/src/commands/parties/shout.ts
@@ -40,9 +40,9 @@ export const shout: SimpleCommand = {
       'For members who are signed up for the raid, max battle, train or meetup. ' +
       'Says your message in the post and pings everybody else who is signed up and not done, ' +
       'in every group, unless they switched such pings off; with `group:True` only the others ' +
-      'of your own group (in a party of several groups). However many they are, everybody is ' +
+      'of your own group (in a party of several groups).\n\nHowever many they are, everybody is ' +
       'pinged, in several messages if it takes them. For what cannot wait: the lobby is ' +
-      'starting, the gym was wrong. Use it in the post of the raid, max battle, train or meetup.',
+      'starting, the gym was wrong.\n\nUse it in the post of the raid, max battle, train or meetup.',
     examples: [
       '/shout message:Starting the lobby in two minutes',
       '/shout message:Our lobby is up, join now group:True',
diff --git a/src/commands/raids/boss.ts b/src/commands/raids/boss.ts
index 83473f97f0a51234f055157829876faec2b04e19..3e615bccd99741378b05b871e923b8e11d8a6ddd 100644
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -103,11 +103,11 @@ export const boss: SimpleCommand = {
     category: 'raid-crud',
     details:
       'For an egg whose boss is known now, or a raid that was reported wrongly. The times stay ' +
-      'as they are: naming the boss does not hatch the egg. A boss that has only one fast or ' +
-      `one charged move gets it set. ${IN_A_RAID_POST} In the post of a train: says which ` +
+      'as they are: naming the boss does not hatch the egg.\n\nA boss that has only one fast or ' +
+      `one charged move gets it set. ${IN_A_RAID_POST}\n\nIn the post of a train: says which ` +
       'Pokémon the train is after, which the post then shows with its weaknesses and catch ' +
       'CP. It may be any Pokémon, also one that is no boss right now; a train has no tier, ' +
-      'and `none` takes the boss off again. In the post of a max battle: the boss of the ' +
+      'and `none` takes the boss off again.\n\nIn the post of a max battle: the boss of the ' +
       'rotation, picked from the max bosses (its tier follows it); a Dynamax boss on no list ' +
       'needs `tier:`, as with `/max`. A Dynamax battle cannot become a Gigantamax one, nor ' +
       'the other way round.',
diff --git a/src/commands/raids/change.ts b/src/commands/raids/change.ts
index 67ab4728ec46bdc35e01166825280a2f063885dd..f0e5f83b19564dc4be2db5575db179352a253044 100644
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -137,12 +137,12 @@ export const end: SimpleCommand = {
     category: 'raid-crud',
     details:
       'In the post of a raid: sets the end time; the hatch time follows from it. Give the ' +
-      'minutes that are left or a clock time. In the post of a max battle: sets when it ends, ' +
-      'within its day and never after the last battle time. In the post of a train or meetup: sets when it ends. Give ' +
+      'minutes that are left or a clock time.\n\nIn the post of a max battle: sets when it ends, ' +
+      'within its day and never after the last battle time.\n\nIn the post of a train or meetup: sets when it ends. Give ' +
       'a clock time, a date and a time, or `in 90` for minutes from now (a bare number is an ' +
-      'hour there); `none` removes the end. A time without a date is read on the day the ' +
+      'hour there); `none` removes the end.\n\nA time without a date is read on the day the ' +
       'party starts, or else the day it ends, while that day is still to come, and otherwise ' +
-      `on today's date; a date comes first, month-day (\`${DATE_EXAMPLE} 9pm\`). A ` +
+      `on today's date; a date comes first, month-day (\`${DATE_EXAMPLE} 9pm\`).\n\nA ` +
       'train or meetup without an end is taken to be over a day after it started; one without any time ' +
       'is archived a day after it was made, or after its last time was removed.',
     examples: [
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index 117a63919ca118647033609e6cb59b17d5edb93f..094b26ed91e66ffc565cc6ef9e6c7be2fbbb4bfd 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -591,15 +591,15 @@ function raidData(screenshots: boolean) {
 
 const DETAILS =
   "Creates a post for the raid in the raid forum of the gym's region. Pick the boss (or the " +
-  'tier, for an egg) and the gym from the lists that appear while you type. The time is ' +
+  'tier, for an egg) and the gym from the lists that appear while you type.\n\nThe time is ' +
   'optional, except for an Elite egg, which needs its hatch time: minutes from now (`20`) or a ' +
-  'clock time (`6:15pm`); for an egg it is when the egg hatches, for a boss when the raid ends. ' +
+  'clock time (`6:15pm`); for an egg it is when the egg hatches, for a boss when the raid ends.\n\n' +
   'If the gym already has a raid, you are shown its post instead.';
 
 const SCREENSHOT_DETAILS =
-  ' Or attach a screenshot of the raid instead: I read the gym, the time, the tier and the ' +
+  'Or attach a screenshot of the raid instead: I read the gym, the time, the tier and the ' +
   'boss from it, and ask only when I am not sure which gym it is. What you type beside it ' +
-  'counts instead of what I read. The screenshot is kept for a while: others can see it from ' +
+  'counts instead of what I read.\n\nThe screenshot is kept for a while: others can see it from ' +
   'the post of the raid, and it may be used to improve the reader. A screenshot of a max ' +
   'battle goes to `/max`.';
 
@@ -608,7 +608,7 @@ function raidCommand(screenshots: boolean): SimpleCommand {
     data: raidData(screenshots),
     help: {
       category: 'raid-crud',
-      details: screenshots ? DETAILS + SCREENSHOT_DETAILS : DETAILS,
+      details: screenshots ? `${DETAILS}\n\n${SCREENSHOT_DETAILS}` : DETAILS,
       examples: [
         '/raid boss:t5 gym:Big Fountain time:25',
         '/raid boss:yveltal gym:Library time:6:15pm',
diff --git a/src/commands/regions/edit.ts b/src/commands/regions/edit.ts
index 3df40a7d0309386ce188c9b93ad00a17fadedf69..ea004b3b34475bdfaa966c8219656e6ac23d70dc 100644
--- a/src/commands/regions/edit.ts
+++ b/src/commands/regions/edit.ts
@@ -20,7 +20,7 @@ export const editRegions: SubcommandPart = {
   help: {
     details:
       'Gives you the address of the region editor, on a map in your browser, and a button that ' +
-      'opens it and logs you in (it works once, within five minutes). There you draw new ' +
+      'opens it and logs you in (it works once, within five minutes).\n\nThere you draw new ' +
       'regions, reshape, move, split and remove them, see the gyms, stops and Power Spots in ' +
       'no region and where regions overlap or leave gaps, load and export KML, and save: you ' +
       'see what a save would do first, in the words of `/region import`. Only you see the answer.',
diff --git a/src/commands/regions/export.ts b/src/commands/regions/export.ts
index 79f974f2765a214613a29ae1678c2c5ed98b0fa7..38dcd245a92533a4d2354a2e8a1ae3147acdcbad 100644
--- a/src/commands/regions/export.ts
+++ b/src/commands/regions/export.ts
@@ -40,7 +40,7 @@ export const exportRegions: SubcommandPart = {
     details:
       `With a region, or in the channel of one: the outline of that region as a file. Anywhere ` +
       `else: all regions of this server in one file, \`${EXPORT_FILE}\` (in several, ` +
-      '`regions-2.kml` and on, when they are more than one import takes). Each area is named ' +
+      '`regions-2.kml` and on, when they are more than one import takes).\n\nEach area is named ' +
       'after its channel, with the category of the channel as its description, so that ' +
       '`/region import` puts every outline back where it was. Open the file in a map editor ' +
       '(Google My Maps: Import) to change an outline. A region without an outline is left out.',
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
index 821c8e715db0d021e49de00d28b10768910525f1..a38c8d4d88759915e1df473b63abde7d5e0ba79b 100644
--- a/src/commands/regions/import.ts
+++ b/src/commands/regions/import.ts
@@ -765,19 +765,19 @@ export const importRegions: SubcommandPart = {
     details:
       'Draw each region as a shape in a map editor such as Google My Maps, and name it after ' +
       'its channel ("North ' +
-      `Hills" stands for #north-hills). ${HOW_TO_KML} Attach the file, and I show what the ` +
+      `Hills" stands for #north-hills). ${HOW_TO_KML}\n\nAttach the file, and I show what the ` +
       'import would do before anything is changed: which channels get a new outline, which ' +
-      'become regions, how many gyms lie in each, and what is left out and why. For a name ' +
+      'become regions, how many gyms lie in each, and what is left out and why.\n\nFor a name ' +
       'that no channel has I create the channel (if you may manage channels), in the ' +
       'category the shape’s description names (or one named after the shape), or, when that ' +
       `category is full (Discord allows ${MAX_CATEGORY_CHANNELS} channels in one, and forums ` +
-      'count), in the next of its name ("North 2"); the preview ' +
+      'count), in the next of its name ("North 2").\n\nThe preview ' +
       'lists every channel and category it would create, and the button says how many. One ' +
       `import creates at most ${MAX_NEW_CHANNELS} channels: import the same file again for ` +
-      'the rest. Every region that has no forum gets one (or takes back the forum it had, ' +
-      'when it was removed and its forum kept). With `channel`, the file is for that one ' +
+      'the rest.\n\nEvery region that has no forum gets one (or takes back the forum it had, ' +
+      'when it was removed and its forum kept).\n\nWith `channel`, the file is for that one ' +
       'channel: its only shape, or the one ' +
-      `named after the channel. An outline may have up to ${MAX_OUTLINE_CORNERS} corners and ` +
+      `named after the channel.\n\nAn outline may have up to ${MAX_OUTLINE_CORNERS} corners and ` +
       'must not cross itself; holes are ignored. `/region export` gives the outlines back as ' +
       'a file.',
     examples: ['/region import file:regions.kml', '/region import file:north.kml channel:#north'],
diff --git a/src/commands/regions/list.ts b/src/commands/regions/list.ts
index 2bbe815b755b09580e76204a12c0bce94473a8b2..2c4a6c8dbc15e6d2bdf766882af032dd6f5c3c03 100644
--- a/src/commands/regions/list.ts
+++ b/src/commands/regions/list.ts
@@ -45,7 +45,7 @@ export const listRegions: SubcommandPart = {
     details:
       'A line per region: its channel, how many gyms lie in it (and how many of them are ' +
       'elite raid gyms), its active raids, max battles, trains and meetups, and what is wrong with it: no ' +
-      'outline, a channel or a forum that is gone, no forum yet. Below that: how many gyms ' +
+      'outline, a channel or a forum that is gone, no forum yet.\n\nBelow that: how many gyms ' +
       'lie in no region of any server, and the forums whose region is gone. A region whose ' +
       'channel is gone stays until you remove it with `/region remove`.',
     examples: ['/region list'],
diff --git a/src/commands/regions/remove.ts b/src/commands/regions/remove.ts
index c1d6cb1dc0111085d4cbf9c5a9aad36fc3f585f2..bdd488bb6558c4fb9609ec4a0742e79acb173fd5 100644
--- a/src/commands/regions/remove.ts
+++ b/src/commands/regions/remove.ts
@@ -188,12 +188,12 @@ export const removeRegion: SubcommandPart = {
   ),
   help: {
     details:
-      'For a region that is given up, or whose channel was deleted. I ask first, in a dialog, ' +
+      'For a region that is given up, or whose channel was deleted.\n\nI ask first, in a dialog, ' +
       'and say what goes with it: its active raids, max battles, trains and meetups are ended (their posts ' +
       'say why), the routes members saved for it are deleted, and its gyms lie in no region of ' +
-      'this server afterwards (they are never deleted). Its text channel is not touched. You ' +
+      'this server afterwards (they are never deleted).\n\nIts text channel is not touched. You ' +
       'choose what becomes of its forum: it can stay as history, with its posts archived and ' +
-      'locked, or be deleted with every post in it (if you may manage channels). A region is ' +
+      'locked, or be deleted with every post in it (if you may manage channels).\n\nA region is ' +
       'never removed by itself, also not when its channel is gone: `/region list` shows ' +
       'such a region as a deleted channel, and it can be picked here.',
     examples: ['/region remove region:#north-hills'],
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index e8850e78390cec140c3b2a6f9edc1e56b4207c19..10630a6d75bb8e20ca8e115cd216d89e059913ca 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -470,17 +470,17 @@ const reportResearch: SubcommandPart = {
       'Reports the field research task of up to five PokéStops at once. Pick the task from the ' +
       'list that appears while you type: a task has a choice for each of its rewards, and one ' +
       'of several Pokémon also "one of" its Pokémon, for a task not done yet (the game shows ' +
-      'which only then). The list finds tasks by their rewards too (`dratini`). Pick the stops ' +
+      'which only then).\n\nThe list finds tasks by their rewards too (`dratini`). Pick the stops ' +
       'from theirs (your region’s first, then those nearest the stops you picked already; ' +
       'with nothing typed, the stops within ' +
       `${distanceWords(MORE_STOPS_METRES, settings.distanceUnits)} of them, nearest first), ` +
-      'or paste a maps link to a stop. A report replaces ' +
+      'or paste a maps link to a stop.\n\nA report replaces ' +
       'your own at a stop today, and a "one of" by one of its Pokémon. Another member’s report ' +
       'is asked about first: tick the stops whose report you replace. The same report again, ' +
-      'or one that says less, is "Already reported". "Today’s Stops" on the region’s board ' +
+      'or one that says less, is "Already reported".\n\n"Today’s Stops" on the region’s board ' +
       '(its forum’s pinned post, where you can report too) shows every task of the day, a ' +
       'task new today gets a line in ' +
-      'the region’s channel, and members who want a reward get a direct message. A task ' +
+      'the region’s channel, and members who want a reward get a direct message.\n\nA task ' +
       'missing from the list can be typed in full, with its ' +
       '`reward`. Your answer offers the same task at more stops nearby and takes the report ' +
       `back. You can make ${String(settings.research.throttle.uses)} reports in ` +
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index db352b8d81cf6e983fd4f5cd6367c03e6cb37ac2..6ae7568c3d32a51b6e9e26e42113d64a321e9d97 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -1025,7 +1025,7 @@ describe('/rocket report’s help (plan 8R-9)', () => {
         distanceUnits,
       });
       expect(textDisplays(message)[0]).toContain(
-        `with nothing typed, the PokéStops within ${distanceWords(2_000, distanceUnits)} of ` +
+        `With nothing typed, those are the PokéStops within ${distanceWords(2_000, distanceUnits)} of ` +
           'the stop where you last reported today, research or Team GO Rocket (also where that ' +
           'report has ended or someone has changed it since; one you took back does not count)',
       );
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index b927a32cddbd309efdfc421df723a0f26d9c1b7d..4f9fbfcb3dbdb2ba702e4d4186517b9982d594f1 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -247,19 +247,19 @@ const reportRocket: SubcommandPart = {
       'Reports who of Team GO Rocket is at a PokéStop. Pick them from the list that appears ' +
       'while you type (it finds them by what can be caught too: `dratini`), and the stop from ' +
       'theirs (your region’s first), or paste a maps link to a stop. The stops list puts the ' +
-      'stops near where you last reported first: with nothing typed, the PokéStops within ' +
+      'stops near where you last reported first.\n\nWith nothing typed, those are the PokéStops within ' +
       `${distanceWords(MORE_STOPS_METRES, settings.distanceUnits)} of the stop where you last ` +
       'reported today, research or Team GO Rocket (also where that report has ended or ' +
       'someone has changed it since; one you took back does not count), nearest first; of stops that fit what you type alike, ' +
-      'the nearer to it. A grunt is posted in the ' +
+      'the nearer to it.\n\nA grunt is posted in the ' +
       `region’s channel for ${String(settings.rocket.gruntMinutes)} minutes; a leader, Giovanni ` +
       'or a decoy grunt goes in "Today’s Stops" on the region’s board until midnight (a ' +
       'leader or Giovanni new today with a line in the region’s channel; you can report from ' +
       'the board too), and keeps grunts ' +
-      `away from the stop all day. ${GIOVANNI_ONLY_WHEN_SURE} A ` +
+      `away from the stop all day.\n\n${GIOVANNI_ONLY_WHEN_SURE}\n\nA ` +
       'stop has one report: a newer one replaces it (a grunt where a hideout was reported asks ' +
       'first), and the same grunt twice is answered with the report that stands. Members who ' +
-      'want it get a direct message. Your answer takes the report back. You can make ' +
+      'want it get a direct message. Your answer takes the report back.\n\nYou can make ' +
       `${String(settings.rocket.throttle.uses)} reports in ` +
       `${String(settings.rocket.throttle.minutes)} minutes; up to ` +
       `${String(settings.rocket.throttle.uses)} answers of "Already reported" in that time do not count.`,
diff --git a/src/commands/roles/iam.ts b/src/commands/roles/iam.ts
index aa6dfee8f8f69ddfeb4425d2f85893f470f0ccff..ec3768a3704294eadc96153a78ba81ce02007280 100644
--- a/src/commands/roles/iam.ts
+++ b/src/commands/roles/iam.ts
@@ -121,9 +121,9 @@ export const iam: SimpleCommand = {
     category: 'roles',
     details:
       'The roles this server lets its members take themselves: your region, your team and the ' +
-      'like. Without `role` you get menus, one per group of roles, with your own roles ticked: ' +
+      'like.\n\nWithout `role` you get menus, one per group of roles, with your own roles ticked: ' +
       'tick and untick, and a menu takes effect when you close it. With `role` you get that ' +
-      'one role: pick it from the list that appears while you type. Of some groups of roles ' +
+      'one role: pick it from the list that appears while you type.\n\nOf some groups of roles ' +
       '(teams) you can hold only one: taking another one gives the first back. `/iamnot` ' +
       'takes a role away again.',
     examples: ['/iam', '/iam role:Mystic'],
diff --git a/src/commands/screenshots/read-screenshot.ts b/src/commands/screenshots/read-screenshot.ts
index 0c4758b172a3330e0100e266c77c16c2a5ac8a71..ceb921f376d016ca96bf4a09e9456966d888e74b 100644
--- a/src/commands/screenshots/read-screenshot.ts
+++ b/src/commands/screenshots/read-screenshot.ts
@@ -170,8 +170,8 @@ export const readScreenshot: SimpleCommand = {
       'Reads the screenshot and tells you, privately, what I read on it and what I make of it: ' +
       'the gym, the time, egg or hatched, the tier and the boss, each as read and as ' +
       'understood; of a max battle the Power Spot, the time, the tier and the boss. Nothing is ' +
-      'reported. Tell me with the buttons whether I read it right: ' +
-      'screenshots with your answer are kept for a while to improve the reader. Outside a ' +
+      'reported.\n\nTell me with the buttons whether I read it right: ' +
+      'screenshots with your answer are kept for a while to improve the reader.\n\nOutside a ' +
       'region channel the gym is looked for among all of this server’s gyms.',
     examples: ['/read-screenshot screenshot:(a raid screenshot)'],
   },
diff --git a/src/commands/settings/settings.ts b/src/commands/settings/settings.ts
index 869f1baaa4839d4ae05baba4d2cc7b5c5e7fc253..58fea49c02ce67c02d1a099881c3d511f032aaff 100644
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -49,7 +49,7 @@ const FLAGS: readonly FlagSetting[] = [
     details:
       'The switch for every ping of you as a member in a post: shouts, new groups and meeting ' +
       'times, the moves of a train, the question whether you have completed a raid, the word ' +
-      'of a raid that has moved to another region, the warning before a post is archived. ' +
+      'of a raid that has moved to another region, the warning before a post is archived.\n\n' +
       'While it is off none of them pings you; the messages are still written in the post.',
     underMentions: false,
     dm: false,
@@ -287,7 +287,7 @@ const show: SubcommandPart = {
     details:
       'Lists your settings for pings and direct messages, the status you get when you report ' +
       'a raid, whether your reports name you, and your friend code and in-game name when ' +
-      'you registered them. In a server it also says whether you are told of new trains ' +
+      'you registered them.\n\nIn a server it also says whether you are told of new trains ' +
       'there, and how many Pokémon, raid tiers, rewards and gyms you are notified about there.',
     examples: ['/settings show'],
   },
@@ -391,12 +391,12 @@ const history: SubcommandPart = {
     details:
       'Professor Pine keeps a history of every raid, max battle, train and meetup of this server that has ' +
       'ended: what it was, where and when, and how many signed up, came and completed it. You ' +
-      'always count in it, without your name. With this on, your Discord id is kept as well with ' +
+      'always count in it, without your name.\n\nWith this on, your Discord id is kept as well with ' +
       'what you do from now on (what you sign up for, when, and how far you get), for statistics ' +
       'of your own later. Off takes your id out of everything kept so far: it all still counts, ' +
-      'without it. While a raid, max battle, train or meetup is still going on, I keep who signed up and ' +
+      'without it.\n\nWhile a raid, max battle, train or meetup is still going on, I keep who signed up and ' +
       'when, as I must to run it; when it ends, only the ids of members who opted in are kept, ' +
-      'and the rest is deleted. It is set per server: use it in the server you mean, not in a DM ' +
+      'and the rest is deleted.\n\nIt is set per server: use it in the server you mean, not in a DM ' +
       'with me. The history of the old bot, from before this one, is never tied to you.',
     examples: [`/settings ${HISTORY.name} enabled:True`, `/settings ${HISTORY.name} enabled:False`],
   },
diff --git a/src/commands/stops/pokestop.ts b/src/commands/stops/pokestop.ts
index bf0fe2350ff58ef3cf5a2d6b7187d27f0894e209..c7b6acc077d413962882226a6d2bab6bd94bde9b 100644
--- a/src/commands/stops/pokestop.ts
+++ b/src/commands/stops/pokestop.ts
@@ -172,7 +172,7 @@ const addStop: SubcommandPart = {
     details: (settings) =>
       'Adds a PokéStop that the Wayfarer export does not have (sponsored stops are missing there) ' +
       'to this server. `at` is the link Pokémon GO shares for the stop, a maps link or ' +
-      'coordinates; it must lie in a region of this server. Members then find it wherever a ' +
+      'coordinates; it must lie in a region of this server.\n\nMembers then find it wherever a ' +
       `PokéStop is asked for. Within ${distanceWords(PINE_STOP_NEAR_METRES, settings.distanceUnits)} of another ` +
       'PokéStop I ask before adding it: it may be listed already.',
     examples: ['/pokestop add name:Coffee Corner at:40.4406, -79.9959 address:12 Market Street'],
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index cfd3a3e444a8579723807d8da9823f175ec2189f..9654d5802d11695ee5c277d3d6edd6634096b606 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -96,10 +96,10 @@ function moveCommand(
     help: {
       category: 'train',
       details:
-        `${details} ${here}, and the others are told where ` +
-        'the train is going, with a ping for those who allow it. While the train has a ' +
+        `${details}\n\n${here}, and the others are told where ` +
+        'the train is going, with a ping for those who allow it.\n\nWhile the train has a ' +
         'conductor, only they and the moderators can move it; otherwise anybody who is signed ' +
-        `up can. ${button} Use it in the post of the train.`,
+        `up can.\n\n${button} Use it in the post of the train.`,
       examples: [`/${name}`],
     },
     guards: [requireTrain],
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index a397f7bda012fd856aceb64576f8e05620b85f4c..40c407f25c1845d1cc2c2c5748d64155522435f9 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -104,7 +104,7 @@ const show: SubcommandPart = {
     details:
       'Shows you every stop in order: those the train has left struck through, the one it is ' +
       'at marked, each a link to Google Maps, and what the train does ' +
-      'at the end of a route of two stops or more. The post shows where the train is and the ' +
+      'at the end of a route of two stops or more.\n\nThe post shows where the train is and the ' +
       'next stops (a route of three stops or fewer whole); its button "Route" shows ' +
       'you this list too.',
     examples: ['/route show'],
@@ -401,11 +401,11 @@ const add: SubcommandPart = {
     details:
       'You must be signed up (moderators need not be). The stop is a gym or a Power Spot (where ' +
       'max battles are), and may lie in another region of this server: the list says what each ' +
-      `is and where. A ${TRAIN_KIND_WORDS.dynamax} or ${TRAIN_KIND_WORDS.gigantamax} is offered ` +
+      `is and where.\n\nA ${TRAIN_KIND_WORDS.dynamax} or ${TRAIN_KIND_WORDS.gigantamax} is offered ` +
       `Power Spots first, a ${TRAIN_KIND_WORDS.raid} gyms, among places that fit as well. ` +
       'On a route with a stop the list puts nearby places first: of places that fit alike, the ' +
       'nearer to the last stop; with nothing typed, the gyms and Power Spots nearest it, with ' +
-      'their distances. ' +
+      'their distances.\n\n' +
       'A stop is on a route once, and a route ' +
       `has at most ${MAX_ROUTE_STOPS} stops. A stop added to a route that was finished makes ` +
       'the train go on there, which moves the train: with a conductor only they and the ' +
@@ -754,7 +754,7 @@ const load: SubcommandPart = {
     details:
       'The route of the train is replaced, and the train is at its first stop: that moves the ' +
       'train, so with a conductor only they and the moderators can do it, and otherwise you ' +
-      'must be signed up. The train then does at the end what it did when the route was ' +
+      'must be signed up.\n\nThe train then does at the end what it did when the route was ' +
       'saved (finish, loop or turn back). Gyms and Power Spots that no longer exist are left out.',
     examples: ['/route load route:Downtown loop'],
   },
@@ -815,7 +815,7 @@ export const route = commandGroup({
     category: 'train',
     details:
       'Use it in the post of the train. A stop is a gym or a Power Spot. The current stop ' +
-      'follows its place through every change of the route: the train stays where it is. A saved route keeps the order of its stops ' +
+      'follows its place through every change of the route: the train stays where it is.\n\nA saved route keeps the order of its stops ' +
       'and what the train does at its end (finish, loop or turn back); loading it sets both. ' +
       'The route is reversed, or finished, in the dialog of the button "Manage…" on the post.',
   },
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
index b1b2484bae85523af691fcbdbb6b1a722e9fc5dd..1f1753c7fb4a5268fdac35b2b985b450fec7a6dd 100644
--- a/src/commands/trains/split.ts
+++ b/src/commands/trains/split.ts
@@ -189,9 +189,9 @@ export const splitGroupPart: SubcommandPart = {
       'Makes a group of this train a train of its own, for those who want to go at their own ' +
       'pace: the same route, at the same stop, with the same end mode, boss and start, and the ' +
       "group's members moved there. Both posts link the other, and the members who moved are " +
-      'pinged in the new one. You are asked first, in a dialog. A member of the group may split ' +
+      'pinged in the new one.\n\nYou are asked first, in a dialog. A member of the group may split ' +
       'it off, unless the conductor is in it; the conductor and the moderators may split any ' +
-      'group. The same as the button "Split…" on the post. Only in the post of a train.',
+      'group.\n\nThe same as the button "Split…" on the post. Only in the post of a train.',
     examples: ['/group split letter:B'],
   },
   throttle: ACTION_THROTTLE,
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index cdb57b530252d0246cbbf86fbbdba2d707cd67cd..79805883b931f28f6dd800739f89b92e695c6ba4 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -97,23 +97,23 @@ export const train: SimpleCommand = {
   help: {
     category: 'train',
     details:
-      'For a group that goes from gym to gym, or Power Spot to Power Spot. Use it in the channel ' +
+      'For a group that goes from gym to gym, or Power Spot to Power Spot.\n\nUse it in the channel ' +
       'of a region; the train gets a post in the forum of that region. You are signed up for it ' +
       'as `/settings auto-status` says (interested unless you changed it; coming for Here), and ' +
-      'the post names you unless your `/settings privacy` is Anonymous. In the post, `/route ' +
+      'the post names you unless your `/settings privacy` is Anonymous.\n\nIn the post, `/route ' +
       'add` adds the gyms and Power Spots it visits (also of other regions), `/meet` sets when ' +
       'it starts and `/end` when it ends, `/boss` says which Pokémon it is after, and ' +
-      '`/conductor set` makes you the one who moves it. Members sign up with the buttons, as ' +
-      'for a raid, and the button "Move…" or `/next` takes it to its next stop. `at-end` ' +
+      '`/conductor set` makes you the one who moves it.\n\nMembers sign up with the buttons, as ' +
+      'for a raid, and the button "Move…" or `/next` takes it to its next stop.\n\n`at-end` ' +
       'says what the train does at the last stop: it finishes the route (the default), loops ' +
       'back to the first stop, or turns back and runs the route backwards; the button "Manage…" ' +
-      `changes that later, and reverses or finishes the route. \`kind\` says what the train is mainly for: raids (a ` +
+      `changes that later, and reverses or finishes the route.\n\n\`kind\` says what the train is mainly for: raids (a ` +
       `${TRAIN_KIND_WORDS.raid}, the default), Dynamax battles (a ${TRAIN_KIND_WORDS.dynamax}: ` +
       `lobbies form on the spot) or Gigantamax battles (a ${TRAIN_KIND_WORDS.gigantamax}: Join ` +
       'fills its groups up to a Gigantamax lobby); "Manage…" changes that later too, ' +
-      'also before the train has a stop. `start` says when it starts, as `/meet` takes it, so ' +
+      'also before the train has a stop.\n\n`start` says when it starts, as `/meet` takes it, so ' +
       'that a train planned days ahead says so from the first; its route can wait until the ' +
-      'day. A train is archived an hour after it is over: after its end, or without one a day ' +
+      'day.\n\nA train is archived an hour after it is over: after its end, or without one a day ' +
       'after its start. One without any time goes a day after it was made; its post says when.',
     examples: [
       '/train name:Saturday legendaries',
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index 82a65a1c9268515b2afea8d4cedb53ff95caefb7..65690a48b473e1538e0502c6c4279175a72741b7 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -486,11 +486,11 @@ describe('/counters: more in the posts of parties', () => {
         'Pokebattler suggests for your `role`',
     );
     expect(details).toContain('levels 20 to 50 in steps of five');
-    expect(details).toContain('with a link to Pokebattler’s Lobby, where it builds such teams');
+    expect(details).toContain('A link leads to Pokebattler’s Lobby, where it builds such teams');
     // Pokebattler's four trainer roles (Matt, 2026-10-24).
     expect(details).toContain(
-      '`role` as Pokebattler defines it (Attacker, an attacker and two chargers, unless you name ' +
-        'another: Defensive, Healer or Shielder)',
+      '`role` as Pokebattler defines it.\n\nThe role is Attacker (an attacker and two chargers) ' +
+        'unless you name another: Defensive, Healer or Shielder.',
     );
     expect(described('role')).toBe(
       'For a max battle: your role as Pokebattler defines it; Attacker when left out',
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index adf41a41c0d8d3d80339546ae63dbcb3c7640e83..b44b715b39c85e915b7d39c1be0571eced514aca 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -914,24 +914,24 @@ export const counters: SimpleCommand = {
     details:
       'The twelve best counters against a raid boss, as Pokebattler simulates the raid: the ' +
       'time to win, how often a counter faints, and how many trainers it takes, with a link ' +
-      'to the full results. In the post of a raid the boss and tier are that raid’s and ' +
+      'to the full results.\n\nIn the post of a raid the boss and tier are that raid’s and ' +
       'everybody there sees the answer; elsewhere name the boss, and only you see it. A boss ' +
       'you name in the post of a raid is simulated in that raid’s tier unless you name ' +
-      'another with `tier`. Without more it assumes counters at level 40, no weather and best ' +
-      'friends, and leaves out shadow Pokémon and megas. `level` can also be your own Pokébox ' +
+      'another with `tier`.\n\nWithout more it assumes counters at level 40, no weather and best ' +
+      'friends, and leaves out shadow Pokémon and megas.\n\n`level` can also be your own Pokébox ' +
       'on Pokebattler (save your user id with `/settings pokebattler-id`); that answer is ' +
       'always for you alone. A Pokébox lists its shadow Pokémon and megas too, unless ' +
-      '`shadow` or `mega` is False. "Change options…" under an answer opens a dialog with ' +
+      '`shadow` or `mega` is False.\n\n"Change options…" under an answer opens a dialog with ' +
       'its attackers, weather, friendship, boss moves and what else to list: the member who ' +
       'asked changes the answer for everybody, anybody else gets an answer of their own. The ' +
-      'options of an answer are kept for a day. With a max battle tier, in the post of a max ' +
+      'options of an answer are kept for a day.\n\nWith a max battle tier, in the post of a max ' +
       `battle, or in the post of a ${TRAIN_KIND_WORDS.dynamax} (the boss at its Dynamax tier) or ` +
       `${TRAIN_KIND_WORDS.gigantamax}, it shows the team of three Pokebattler suggests for your ` +
-      '`role` as Pokebattler defines it (Attacker, an attacker and two chargers, unless you ' +
-      'name another: Defensive, Healer or Shielder), each Pokémon with its moves and a few others ' +
-      'that would do, at levels 20 to 50 in steps of five, with the weather and friendship you ' +
-      'name, with a link to Pokebattler’s Lobby, where it builds such teams; boss moves, shadow ' +
-      'Pokémon, megas and a Pokébox do not apply there. A boss you name ' +
+      '`role` as Pokebattler defines it.\n\nThe role is Attacker (an attacker and two chargers) ' +
+      'unless you name another: Defensive, Healer or Shielder. Each Pokémon comes with its ' +
+      'moves and a few others that would do, at levels 20 to 50 in steps of five, with the ' +
+      'weather and friendship you name.\n\nA link leads to Pokebattler’s Lobby, where it builds ' +
+      'such teams; boss moves, shadow Pokémon, megas and a Pokébox do not apply there. A boss you name ' +
       'that is no raid boss now is taken in the max battle tier it is a boss of.',
     examples: [
       '/counters',
diff --git a/src/commands/util/help.test.ts b/src/commands/util/help.test.ts
index 4e79cbf63c7fbbc9b70c29f362495e796dbd1036..131df2b10c2330fc713e78bf301fcaf7c9d36eff 100644
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -99,7 +99,7 @@ describe('/help: a command with another name', () => {
   it('explains the other name as the command, and says whose name it is', async () => {
     const message = await ask({ options: { command: 'hmm' } }, named);
     expect(textDisplays(message)[0]).toBe(
-      '### /hmm\nSay you are interested\n\n`/hmm` is another name for `/interested`. Marks ' +
+      '### /hmm\nSay you are interested\n\n`/hmm` is another name for `/interested`.\n\nMarks ' +
         'you as interested.',
     );
   });
diff --git a/src/commands/util/rank.ts b/src/commands/util/rank.ts
index 8718666d245d3ebd2838da8ac128821e7e7885aa..67d9e0dbfdd8e29058fbfe7610ed78066d7365a1 100644
--- a/src/commands/util/rank.ts
+++ b/src/commands/util/rank.ts
@@ -362,9 +362,9 @@ function rankDetails(settings: Settings): string {
     'Where a Pokémon with these IVs stands among all 4,096 combinations in a league: its ' +
     'rank by stat product, its share of the best, the CP and level it can reach, and the ' +
     'best combination. Up to level 50, and up to 51 (a best buddy) where that differs; a ' +
-    'Super Mega also up to the levels it adds. Its family and a link to each ranking on ' +
+    'Super Mega also up to the levels it adds.\n\nIts family and a link to each ranking on ' +
     'pvpivs.com come with it. ' +
-    '`filter` ranks only the combinations a trade, a raid or a lucky trade can give. ' +
+    '`filter` ranks only the combinations a trade, a raid or a lucky trade can give.\n\n' +
     `Use it under ${settings.categories.pvp} or in a DM with me.`
   );
 }
@@ -380,7 +380,7 @@ export const rank: SimpleCommand = {
   help: {
     category: 'util',
     details: (settings) =>
-      `${rankDetails(settings)} \`/little\`, \`/great\`, \`/ultra\` and \`/master\` are ` +
+      `${rankDetails(settings)}\n\n\`/little\`, \`/great\`, \`/ultra\` and \`/master\` are ` +
       '`/rank` in that league.',
     examples: [
       '/rank pokemon:Medicham attack:0 defense:15 stamina:15',
@@ -408,7 +408,7 @@ function leagueRank(league: League): SimpleCommand {
     help: {
       category: 'util',
       details: (settings) =>
-        `\`/${league}\` is \`/rank\` in the ${LEAGUE_NAMES[league]}. ${rankDetails(settings)}`,
+        `\`/${league}\` is \`/rank\` in the ${LEAGUE_NAMES[league]}.\n\n${rankDetails(settings)}`,
       examples: [`/${league} pokemon:Medicham attack:0 defense:15 stamina:15`],
     },
     formOf: 'rank',
diff --git a/src/commands/util/request.ts b/src/commands/util/request.ts
index 1001809cc7ec63172c6cbf504e7df880eb706580..36453feeec38210a33231d8d16ff5d0f71db09ad 100644
--- a/src/commands/util/request.ts
+++ b/src/commands/util/request.ts
@@ -153,7 +153,7 @@ export const request: SimpleCommand = {
     details:
       'Sends what you write to the people who keep the gym list, as a request about one gym. ' +
       'In the post of a raid or train it is about the gym of that raid or the stop the train ' +
-      'is at; elsewhere pick the gym with `gym`. Your name and the server go with it, nothing ' +
+      'is at; elsewhere pick the gym with `gym`.\n\nYour name and the server go with it, nothing ' +
       'else of you. Three requests in half an hour at most.',
     examples: [
       '/request text:This gym was renamed to Town Hall Fountain',
diff --git a/src/discord/command.ts b/src/discord/command.ts
index 153b6800ae570c6fae394b9ce129674948e26f11..daa2fb55a494343f47ca7259bf408b5437374221 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -229,7 +229,7 @@ export function alsoAs(command: SimpleCommand, name: string, description?: strin
       ...command.help,
       details: (settings) => {
         const own = typeof details === 'function' ? details(settings) : details;
-        return own === undefined ? note : `${note} ${own}`;
+        return own === undefined ? note : `${note}\n\n${own}`;
       },
       // The examples show it used by its own name.
       ...(command.help.examples
````

## After the last task

- [ ] `npm run check > var/smallpass-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 6d8d26c6f02f29bbe84529a80e4864816cfcdb16 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
