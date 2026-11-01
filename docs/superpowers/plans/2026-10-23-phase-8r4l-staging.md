# Phase 8R-4L staging checklist: grunt lineups reported apart (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Plan:** `2026-10-23-phase-8r4l-grunt-lineups.md` (its head lists the decisions).
- **Conventions:** `docs/architecture/stop-reports.md`, "Team GO Rocket".

Run it with the 8R-2 and 8R-4 checklists. The lineups are ScrapedDuck's on the day: the steps need a grunt type with two lineups (on 2026-10-22 the water grunts and the untyped grunts). If none has two that day, note it and run what can be run.

## Before

1. **No migration and no command change** for this plan; 8R-4's steps cover the deploy.
   - Watch the log at start for the lineups read.
   - Any other checkout started on the dev database since then leaves the water and untyped grunts out of its own list until its next refresh. That is expected.

## Choosing

2. `/rocket report who:` with nothing typed: one choice per grunt type, as before, with no lineups.
3. Type `water`: "Water-type grunt · Mudkip, Tentacool, Krabby", "Water-type grunt · Magikarp, Feebas" (or the day's lineups, in the feed's order), then "Water-type grunt · not sure which". `magikarp` finds the three too.
4. `who:` typed in full as `water` reports "not sure which", whose catches are both lineups'.
5. A type with one lineup is one choice, as before.

## Reports

6. **A lineup.** Tester reports the Magikarp lineup at an East stop.
   - The message's heading is "Water-type grunt", and its catches are that lineup's only. The answer names it.
   - Take back works.
7. **The same lineup again** at that stop: "Already reported: … Water-type grunt · Magikarp, Feebas" with the link.
8. **"Not sure which" over a lineup:** Already reported.
9. **Narrowing.** Googer reports "not sure which", then Tester reports the Magikarp lineup at the same stop.
   - The same message is edited, not deleted: same link, the narrower catches, Tester as reporter, a new end time.
   - Tester's answer says "(was: Water-type grunt, not sure which)".
   - A DM sent for the first report still opens the message.
   - Googer's old Take back answers that the report changed and removes nothing.
   - Tester's Take back works.
10. **The other lineup over a lineup:** the message is edited again, and the answer names the lineup it was.
11. **A hideout** at that stop replaces the grunt as before.

## Wants and DMs

12. **A type want.** Tester holds `grunt:water`. Googer reports "not sure which", then the other lineup within the hour.
    - One DM only.
    - Googer, the first reporter, gets none.
    - Tester's narrowing of Googer's grunt gives Googer no DM either.
13. **A Shadow want.** Tester holds a Shadow want of a catch of one lineup only.
    - A report of the other lineup: no DM.
    - A report of that lineup, or "not sure which": a DM.

## The map (server side only; the page waits for the map's UX pass)

14. `GET /api/rocket-options` lists the water type's lineups with `value`, `label` and `catches`.
15. A POST with a lineup's value reports it. A stale fingerprint answers `LINEUPS_CHANGED`.
16. A take-back with an older `madeAt` answers 409.

## After

17. Note the results in the follow-ups file, under "From the staging run of 8R-…".
