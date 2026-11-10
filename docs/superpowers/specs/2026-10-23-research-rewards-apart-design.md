# Research rewards reported apart (plan 8R-5): design

Status: agreed with Matt 2026-10-23, for review. Builds on 8R-1 (`2026-10-21-stop-reports-design.md`, `docs/architecture/stop-reports.md`) and 8R-4 (costumed rewards stay apart, `rewardKey`).

## The game facts (Matt, 2026-10-23)

- A task Leek Duck lists with several "Possible Rewards" is in the game several tasks of the same text, each with one reward. A stop has one of them all day, the same for every player (not drawn per player, as the 8R-1 design and the memory said).
- Item and Mega Energy rewards (and any other reward that is not an encounter) are shown on the task before it is done: the reporter always knows which it is.
- An encounter reward is not shown before the task is done: the task only says it is an encounter. Where the task has two or more possible encounters, the reporter knows which only after finishing it. With one possible encounter there is no doubt: the game still does not show it, but the task pool has only that one (so a task of one encounter and some items, seen as "an encounter", is that encounter).
- Members do report a task before finishing it. That report says "one of" the possible encounters; a later report at the same stop that names the encounter narrows it.

## What changes for members

1. **One choice per task and reward.** `/research report task:` and the map's pick list offer "Make 3 Great Curveball Throws in a row · Gible", "… · Bulbasaur" and so on: one choice per reward of the task, in the page's order. A task of one reward is one choice, as today.
2. **"One of" for encounters.** A task with two or more encounter rewards also offers "Make 3 Great Curveball Throws in a row · one of Gible, Bulbasaur, …" (its encounters only, the items and Mega Energy left out), after the task's own choices. A task whose encounters are one has no "one of".
3. **Typing finds the version.** The typed words are matched against the task's text and the reward's name, as today (`gible` finds the Gible version and the "one of" that holds Gible). With nothing typed, the first 25 choices of the list in its order, as today: the list is longer, so typing matters more (Matt accepts the clutter).
4. **Narrowing at a stop** (one research report per stop and period, as today):
   - **Narrowing**: a reward over a "one of" of the same task, where the "one of" holds that reward, replaces it without asking. The answer says "(was: one of …)".
   - **Saying less**: a "one of" over one of its own rewards is "Already reported", because the reward says more (as 8R-4L's "not sure which", S10).
   - **The same version again** is "Already reported".
   - **Every other report is a contradiction, and asks first** (Matt, 2026-10-23, R7). This covers another reward of the same task, a "one of" over an item or Mega Energy version, and another task. See "Matt's rulings", R7.
   - *Default (Claude):* a contradiction of the reporter's own report is replaced without asking, since they know they are correcting it.
5. **Wants and DMs.**
   - A reward's report tells the members who want that reward, as today's rules for one reward.
   - A "one of" report tells the members who want any of its encounters; the DM says "one of Gible, Bulbasaur, …" so they know it may not be theirs.
   - A narrowing to a reward a member wants, where that member was told of the "one of" at that stop, sends a short second DM confirming it ("Confirmed: the reward at **Stop** is **Gible**."). A member who wants it but was not told of the "one of" gets the usual DM. A narrowing to a reward the member does not want sends nothing (Matt).
   - A correction from one reward to another tells the new reward's wanters as usual; nothing to the old one's.
6. **The pinned post** groups by task, then by version under it: each reward's stops, then the "one of" stops. A DM's "Go to post" links the message holding that version.
7. **A task typed in full** with `reward:` is unchanged (one reward, or none).

## How it is kept

- **Subject keys.** A reward's version is `<task key>:<reward hash>` (the hash an FNV-1a of `rewardKey`, 8 hex digits, so a choice's value stays far under 100 characters); a "one of" is the task key alone. A report's detail keeps the rewards it stands for (the one reward, or the "one of"'s encounters), so the post, the DMs and the map read the detail as today. No migration.
- **Reports made before the switch** have the task key and every reward in their detail: they read as a "one of" whose rewards include the items too. They last until the period ends (one day); nothing converts them.
- **A choice gone from the list** (a reward hash the task no longer has, after the hourly read) is `TASK_LIST_CHANGED`, as a task key gone is today.
- **The decision** "already" versus replace is made with the stop's row locked, as Rocket's `saveUnless` does (`decideResearch`, pure, beside `decideRocket`). A report of several stops gets each stop's outcome; the answer lists the stops already reported apart.
- **News** for the notifier: a stop whose subject changed. A narrowing carries the "one of" it replaced, so the notifier can tell confirmations from first DMs: the "told" memory (`researchTold`) is keyed by the subject, so a confirmation is the case "this member was told of the replaced subject at this stop".
- **`/want`** is unchanged: wants are by reward, as today.
- **"Same task at more stops…"** reports the same version (reward or "one of").

## Not in this plan

- The map's page (waits for the map's UX pass, as 8R-3).
- Telling a member that a "one of" they were told of turned out to be another reward (Matt: nothing).

## Review (2026-10-23): defaults taken

- **R1.** `ResearchTaskService` works out each task's versions when it sets the list, since it has the catalogue: the value, the label, the rewards, and `byVersion(value)`. The autocomplete, `readTask`, the map's options and "Same task at more stops…" read only that. A version gone after a list or game-data change is `TASK_LIST_CHANGED`.
- **R2.** `readTask` recognises `<16 hex>:<8 hex>` before the typed fallback. A listed task's full text, or a bare key:
  - with `reward:`, it is the version whose reward matches;
  - without `reward:`, it is the only reward, else the "one of" when the task has two or more encounters, else refused with "pick the reward from the list".
- **R3.** The notifier's line is keyed by the task (`research:<server>:<task key>`; for a typed task, the whole subject), so every version of a task is worked off in order.
- **R4.** A report of several stops sends one member one confirmation DM naming every stop it confirms. If any stop is new for them, they get the usual DM naming every untold stop instead. The DM's variant includes its kind.
- **R5.** A confirmation means the member was told of this task's "one of" at this stop (`researchTold` for the bare task key). The reporter of the replaced "one of" counts as told, as Rocket's `alsoActors`.
- **R8.** The outcome gains `already` per stop. If every stop was already reported, the answer has no Take back and no "Same task at more stops…", and the use counts, as Rocket's `already` does. The words follow `alreadyReported` with a link to the post's message. The map's POST returns the already-reported stops too.
  - "Same task at more stops…" for a "one of" also leaves out stops where any version of the task stands.
  - `decideResearch` takes an ended report as nothing.
- **R9.** The pinned post has one block per task, with a sub-line per version followed by its stops, and one picture. Every version and the bare key map to the block's message. Tasks are ordered by their total stops, and the counts are of tasks. The subject is parsed by `researchSubjectOf`, never by splitting on `:`.
- **R10.** A bare-key report counts as "one of" (in words, narrowing and confirmations) only where its detail holds two or more rewards. Otherwise a report of its reward is "again".
- **R11.** A typed task's subject is `typed:<text key>:<reward hash>`, so typed tasks narrow and correct as listed ones do.
- **R12.**
  - A costumed version is labelled "(costumed)".
  - A "one of" label puts the matched reward first.
  - A "one of" DM names the member's reward first.
  - Typed words match across the task's text and the version's reward together (`curveball gible`).
- **R13.** `researchOptions` gives `versions: { value, label, oneOf }[]` per task, and `MapResearch` gives `oneOf`.
- **R14.** "Same task at more stops…" carries its version in the custom id, so a base report that was narrowed meanwhile does not stop it.
- **R15.** A report under an intra-day window decides only against its own period's row, so no `standingAt`.

## Matt's rulings on the review

- **R6 (2026-10-23).** When a "one of" announcement's turn comes, it re-reads its reports (`stopReports.kept`) and leaves out every stop whose report was replaced. Wanters of the reward get the usual DM from the narrowing.

- **R7 (2026-10-23).** Every report that contradicts the one standing at a stop asks first. A contradiction is anything but a narrowing, saying less, or the same version again (point 4). The first case raised was a "one of" over an item version of the same task. Before anything is reported, a dialog asks, as Rocket's hideout question does:
  - It lists each contested stop as a checkbox, **unticked**, with what stands there, who reported it and when. The reporter must go out of their way to overrule it.
  - Stops with no contest are not listed and are reported on Submit.
  - On Submit, ticked stops are replaced and unticked ones answer "Already reported".
  - Cancel reports nothing.
  - The map's POST answers `asks` with the same stops.

## Questions for review

- Is "one of" listing encounters only right where a task mixes encounters and items (rare)? The item versions stay their own choices.
- Should the 25-choice list with nothing typed show one choice per task (merged, not reportable) instead? This design says no: every choice must be reportable.
