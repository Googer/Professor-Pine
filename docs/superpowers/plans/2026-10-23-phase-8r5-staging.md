# Phase 8R-5 staging checklist: research rewards reported apart (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Plan:** `2026-10-23-phase-8r5-research-rewards.md`.
- **Design:** `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md`.
- **Conventions:** `docs/architecture/stop-reports.md`, "Reports and `/research`".

Run it with the 8R-1 checklist. The tasks are Leek Duck's on the day: the steps need a task with two or more encounters, one with one encounter and items, and one with items only. Note the ones used.

## Before

1. **No migration and no command change** for this plan (only the autocomplete's values change). The deploy is covered by 8R-1's and 8R-4's steps.
   - Reports stored before this build last until their period ends. A task of several rewards reads as "one of"; one of a single reward reads as that reward.

## Choosing

2. `/research report task:` with nothing typed: one choice per reward, "Task · Gible", and after a task's choices, "Task · one of Gible, Bulbasaur, …" when it has two or more encounters. A task of one reward is one choice, as before.
3. Type a Pokémon of a "one of" (`gible`): its own choice, and the "one of" with Gible named first. Type `curveball gible`: the words are matched across the task and the reward.
4. A task with one encounter and items: one choice per item and one for the Pokémon, with no "one of".
5. Where Leek Duck lists a plain and a costumed version of one Pokémon: "(costumed)" on the costumed one, here and on every later surface.
6. A task typed in full, with nothing picked from the list:
   - without `reward:`, a task of one reward is that reward, and one of two or more encounters is its "one of";
   - otherwise it is refused with "pick the reward from the list";
   - with `reward:`, it is the reward named.

## Reports at one stop

7. **Narrowing.** Tester reports "one of" at an East stop, then Googer reports Gible there: no question; the answer says "(was: one of …)"; the pinned post moves the stop under "Gible".
8. **Saying less.** Tester reports "one of" over Gible there: "Already reported: … Gible at **Stop**, by **Googer** <time>" with a link, no Take back and no "Same task at more stops…".
9. **The same report again:** Already reported.
10. **A contradiction.** Tester reports Bulbasaur, an item reward of the task, or another task over Googer's Gible.
    - A dialog "Replace field research?" lists the stop as an **unticked** checkbox, naming what stands there, who reported it and when. The time must be whole: check one with a long task text.
    - Cancel: nothing is reported.
    - Submit unticked: "Already reported" for that stop.
    - Submit ticked: replaced, and the answer names what it replaced.
11. **Your own report.** Googer contradicts his own report: replaced without asking.
12. **Several stops.** One report at three stops, one contested and two free:
    - the dialog lists only the contested one, and says the others are reported too;
    - with all three contested, it does not say so.
13. **The dialog across midnight** (if the time allows): open the dialog before midnight and submit after it. The answer is "The research period of that report has ended…", and nothing is reported.

## Same task at more stops…

14. From a "one of" answer: the menu leaves out stops where any reward of the task stands. A pick that meets a contradiction opens the dialog with "you picked".
15. After the first report was narrowed by someone else, the menu still reports the "one of" at more stops.

## DMs

16. **A reward's report.** Tester wants Gible (Research box). Googer reports Gible: one DM. Googer reports Bulbasaur elsewhere: no DM.
17. **A "one of" report.** Googer reports "one of" at a stop: Tester gets a DM saying "one of", with Gible named first.
18. **Confirmation.** Googer narrows it to Gible: Tester gets a short "Confirmed: the reward at **Stop** is **Gible**." A narrowing to Bulbasaur: no DM.
19. **A quick narrowing.** Googer reports "one of" and narrows it at once, before the DM goes out: Tester gets only the usual Gible DM.
20. **Two regions** (a stop in East, one in West): a narrowing at both, where Tester was told of the "one of" at both, gives a confirmation in each region.

## The pinned post

21. One block per task, with a line per reward and its stops, and a line "one of …" with its stops. A task of one reward keeps the old heading. A typed task without a reward among typed versions shows "reward not said". A DM's "Go to post" opens the message holding the task.

## The map (server side only; the page waits for the map's UX pass)

22. `GET /api/research-options` gives each task's `versions` (`value`, `label`, `oneOf`). A report on the map gives `oneOf`.
23. A POST that contradicts answers 422 with `asks.reports` (and `asks.hidden` for stops not shown), uncounted. With `replacing`, it reports. When every stop is already reported, it answers 409 and is counted.
24. `more: true` with a listed `task` after `sameAs` gives 409: it reports, asking in the "you picked" words.

## After

25. Note the results in the follow-ups file, under "From the staging run of 8R-…".
