# Phase 8X-4 staging checklist: train kinds and Power Spot stops (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member); a third account where a step says so. Look at the steps marked **phone** on Android and on an iPhone. The design is `docs/superpowers/specs/2026-10-20-max-battles-design.md`, section 6; the conventions are `docs/architecture/trains.md` ("Kinds and Power Spots"), `parties-and-posts.md`, `history.md`, `web.md`. The steps marked "(from 8B-3 step N)" are 8B-3's staging steps never run (follow-ups, "From the staging run of 8B-1 to 8B-4 …"), adapted: the panel is "Manage train…" now. A route of four stops is called A, B, C, D below.

## Before

1. **The shared dev database.** This build writes parties at **state version 14**; an older bot cannot read those rows (trains and every other party). Check `var/stage/TEST-SERVER-STATE.md`, note that 8X-4 is being staged, and end every party made here before an older bot starts on the dev database again. **Migration 026** (`PartyHistoryStop.wayspotId`, `PartyHistory.trainKind`, the backfill of `raid` for trains already recorded) runs at the bot's start: additive; note in the state file that the dev database is then at 026. 8X-3's checklist (state 13, migration 025) can run in the same session.
2. Matt deploys the commands (`/train` gains `kind` and `start`; `/route add`'s option is now `stop`): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`. Until then an old client's `/route add gym:` fails as an unexpected error.
3. The dev database's Power Spots are Pittsburgh's from the Wayfarer import: check the test region has some near its gyms (for mixed routes).

## Kinds and planned trains

4. `/train name:Lake kind:Max Battle Train: Dynamax battles`: the heading `### Max Battle Train: Lake`, the forum tags `Train` and `Max battle`; the region link line and the new-train DM (Tester, new-train DMs on) say "A new Max Battle Train has been announced…". A raid train's DM still says "A new train has been announced".
5. **Planned ahead:** `/train name:Wild Area kind:Gigantamax Train: Gigantamax battles start:<a date two weeks away> 10am`: the post shows the start; the train is not archived a day later (it has a time); `/train start:none` is refused, uncounted ("A new train has no start to remove: leave `start` out."); an unreadable start is refused, uncounted.
6. **phone** **Manage train…** on the planned train (no route yet), for the maker: the panel `### Manage the train`, "This train has no route yet", only the kind menu ("Raid Train: raids", "Max Battle Train: Dynamax battles", "Gigantamax Train: Gigantamax battles", each with its line). Pick Raid Train: the heading changes, `Max battle` leaves the tags, a line in the post says who changed it. Pick Gigantamax again.
7. **Lobbies follow the kind:** in the Gigantamax train, three accounts Join: the group line shows `3/100 coming`; switch to Max Battle Train: no cap shown, no split-up note; switch to Raid Train: the split-up note returns past `lobbies.raid` as before. Groups already made stay.
8. `/counters` in the posts: a Dynamax train with a boss that is a listed Dynamax boss gives the max team at its tier; with a boss no max list names, `tier:` is asked; a Gigantamax train uses Gigantamax; a raid train gives the raid counters (8X-6's 9a).

## Power Spot stops

9. `/route add stop:` on the max train: the list with nothing typed shows the region's Power Spots first, then gyms, each marked `(Power Spot)` / `(gym)`; typed text that fits a gym and a spot equally offers the spot first. On a raid train, gyms first. Add two spots and two gyms: the post's route lists `<title> (Power Spot)`, Where shows a spot's Wayfarer picture, address and Map.
10. **Typed text without picking** (raid train): a gym's full name adds the gym; a Power Spot's full name that no gym has adds the spot; a name several gyms fit says "Several places fit"; a spot named exactly what was typed beats a gym that only contains the words (plan decision 1), also when several gyms contain them (plan 8X-F). The mirror case on the max train: a gym's exact full name adds the gym though several Power Spots contain all its words (the staging's "Allegheny Station" against "Allegheny County Fire Station" and "West Mifflin #3 Volunteer Fire Company - Allegheny County Station 295"); a part of the name that fits the gym no better still says "Several places fit".
11. **Moving through spots:** Next, Previous, Skip and Finish through a spot; the movement message names it and pings as at a gym; Reverse at the first stop; Loop and Turn back with a spot at the end. Gym targets fire only at gym stops.
12. **A copy in another region:** a spot stop in another region of the server makes the train's copy there, as a gym stop does.
13. **Saved routes:** `/route save` a mixed route; `/route load` it in a new train: the same stops; delete one of its gyms with the gym tools: the saved route keeps its spots ("left without a stop" counts only routes with none).
14. **History:** after the train ends, in `pine-dev-mysql`: `PartyHistory.trainKind` is `gigantamax` / `dynamax` / `raid`; `PartyHistoryStep` has a `spot` step with the bare Wayfarer id; `PartyHistoryStop.wayspotId` is set for a spot stop. Trains recorded before 026 have `trainKind` `raid`.
15. **Big groups:** in a Gigantamax train with many sign-ups (or the fake test, `pings-in-messages.test.ts`), train movement pings everybody in as many messages as it takes, the text in the first.

## The map

16. The map shows the mixed train: its line passes through the spots, its ring stands at a spot when the train is there, route mode numbers the spots; a spot's popup line "… (Power Spot)" with Directions. "Manage…" opens the panel headed "Manage the train". The route editor still adds gyms only (8X-5 adds spots).

## Left over from 8B-3's staging

17. **Reverse once per panel (from 8B-3 step 7):** at A, press Reverse twice quickly on one panel: the route is reversed once; the second press says "That button no longer leads where it said." above the fresh panel. Tester's panel drawn before Googer's Reverse: his Reverse says the same, and the route stays.
18. **Who may change the mode (from 8B-3 step 11):** Tester, signed up and no conductor yet, opens Manage train…; then Googer runs `/conductor set`; then Tester picks Loop in his panel: the mode is set (the post says "**Tester** … set the train to loop."), and his panel loses its controls with "This train has a conductor: only they and the moderators can move it." Tester's Manage train… now gives that refusal instead of a panel. Tester opens the panel again (no conductor), leaves the train (`/leave`), then picks Loop in the open panel: "You are not signed up for this train." and the mode stays. The kind menu the same.
19. **A stale panel (from 8B-3 step 12):** Googer and Tester (no conductor) each open the panel at stop 1; Googer presses Next; Tester picks Loop in his old panel: refused with "The train has moved on meanwhile." above the fresh panel, the mode unchanged. Tester's Reverse on an old panel the same.
20. **The commands (from 8B-3 step 15):** `/next` at the last stop of a looping train answers with a text that begins "The train is at stop 1 of 4: A. Next is B."; of a finishing one, at the last stop, one that begins "The train is at stop 4 of 4: D. It is the last stop: Next finishes the route." (both end with " I am telling the others." when others are signed up). With a spot as D, its name as in the post.
21. **A copy in another region's channel (from 8B-3 step 16):** a train whose route has a stop in another region: the copy there shows the same route line ("loops" / "turns back at the end") and "Next gym", without "Manage train…"; after a turn the copy lists the new order too.
22. **A DM about a new train (from 8B-3 step 17):** Tester, new-train DMs on: the brief of the train reads as before ("At …"), nothing about the mode or the kind is missing that the post shows in a word.
23. **The current last stop of a loop or turn-back train is removed (from 8B-3 step 18):** `/route remove` of the stop the train is at, the last one: a looping train goes on at the first stop, a turning one has the rest reversed and stands at the stop before the removed one; a movement message goes out and who was here is coming again. A finishing train, or a route left with one stop, finishes as before.

## After

24. End every party made here; update `var/stage/TEST-SERVER-STATE.md` (state version 14, migration 026); record the results in the follow-ups file ("From the staging run of 8X-4").
