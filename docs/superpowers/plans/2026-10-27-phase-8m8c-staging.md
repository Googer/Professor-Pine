# Phase 8M-8C staging checklist: a train's Move…, Manage…, Split… and the route editor on the map

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.

- **Accounts:** Googer (owner, staff), Tester (a member), and a third account for the groups of a split where one is at hand.
- **Brief:** `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its last section, "After the builder check", R1 to R9).
- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's popup is its post": trains).
- **Conventions:** `docs/architecture/web.md` ("A train's dialogs as forms", "Trains on the map"), `docs/architecture/trains.md`.
- **Devices:** a desktop browser (light and dark), an Android phone and an iPhone if at hand (touch dragging), Discord's in-app browser and the phone's own.
- **Compare with Discord:** every form beside its dialog on Discord: the same title, words, choices, picks to start with and answers.

## Before

0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup.
1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs.
2. **Parties:** Googer makes a train "Saturday legendaries" in West with a route of five gyms and a Power Spot of West (the editor or `/route add`); Googer and Tester sign up; Tester opens group B "Fast" (Group… on Discord) and the third account joins it. A second train "Evening run" planned ahead, without a route.
3. **An old page.** A map page opened before the update keeps its old bundle until reloaded. Its Move… still opens the old panel, but the new list no longer carries the panel's data (`MapTrain.moves` replaced `panel`), so the old Move… does nothing at all: no request, no answer. The retired presses answer 404 only when sent directly (devtools: `POST …/trains/<id>/move/finish`, `reverse`, `at-end`, `kind`, R1). Reload: Move… is the new form, and the post's keys change by themselves (`CONTROLS` changed; the view's version did not, `POST_VIEW_VERSION` 1).

## Move… (R1)

4. **The dialog's moves.** As Googer at stop 2: Move… opens "Move the train" in the place of the post: where the train is ("At stop 2 of 6: …", "Next is …"), then "Where to" with Next first and picked, Previous and Skip, each in the dialog's words (Skip's two names, a long name cut with the whole under it). No Finish, no Reverse, no mode. Compare with Move… on Discord, opened at the same moment.
5. **A move.** Submit Next: the form closes, the popup shows the post moved on, the answer is `/next`'s words ("The train is at stop 3 of 6: … I am telling the others."); the post on Discord announces the movement with its ping.
6. **The undo at a turn-back end.** Manage… → "At the end of the route": Turn back; move the train to the last stop: Move… offers "Next: turn back to …", "Previous: back to … (undo)" with "Back one stop, still heading for the end: undoes a Next made by mistake" under it, and Skip.
7. **One move left.** Finish the route (Manage…, step 10): Move… shows no choice, the text ends "Submit takes it back to stop 6, …."; Submit takes it back.
8. **Stale.** Open Move… on the map, move the train with `/next` on Discord, Submit: "The train has moved on since you opened this: The train is at stop …", the form closes and the popup shows the train as it is now.
9. **Who may.** Tester signed up, Googer the conductor: Move… says Discord's words under the post's buttons, "This train has a conductor: only they and the moderators can move it." (press Move… on Discord as Tester: the same sentence); Tester not signed up: "You are not signed up for this train.". Read-only (Discord away for the bot): Move… says "Discord cannot be reached just now, so nothing can be changed. Try again in a moment.".

## Manage… (R2, R4)

10. **The dialog's parts.** As Googer: Manage… opens "Manage the train": where the train is, "The route" (Keep it as it is picked; Reverse it where it can be; Finish it here), "At the end of the route" (Finish at the last stop, Loop, Turn back, with their emoji and lines) and "What the train is mainly for" (Raids, Dynamax Battles, Gigantamax Battles), each with the train's own picked. Compare with Manage… on Discord.
11. **Several parts in one Submit.** Reverse it, Loop and Dynamax Battles: one answer "This train is a Max Battle Train now. The route is reversed. At the end it loops back to the first stop. The train is at …", one line in the post for the three; the forum tag Max battle comes with the kind.
12. **Only what was picked otherwise.** Open Manage… on the map, set Turn back with Manage… on Discord, then Submit the map's form with only the kind changed: the mode stays Turn back. Submit with nothing changed: "Nothing changed.".
13. **Finish it here.** Finish it here: "The train has finished its route of 6 stops. Move… takes it back to stop …", announced in the post as a move.
14. **Stale.** Open Manage…, move the train on Discord, Submit Finish it here with a kind: "The train has moved on since you opened this: … Nothing was changed.".
15. **Without a route.** On "Evening run": Manage… opens with "This train has no route yet. Add its stops with /route add." and the kind alone; Gigantamax Battles: "This train is a Gigantamax Train now.".
16. **Who may.** Tester with a conductor that is not him: Manage… says "This train has a conductor: only they and the moderators can move it." under the buttons (the sentence Discord says before its Manage… opens), and opens nothing. The conductor's buttons (Be the conductor, Stop being the conductor, Take the conductor off) are in the member's part under the post, not in Manage… (R2), and work as before.
17. **Its window.** Thirty presses of the post's controls a minute between Discord and the map: with the window full, Manage… on the map says "That was a lot of clicks…" and opens nothing.

## Split… (R4, R7)

18. **A member of a group.** The third account (in B, not the conductor): Split… opens the one-group form: "Group B (Fast) leaves Saturday legendaries and becomes a train of its own, Saturday legendaries (Fast):", the same route at the same stop, who moves, who leads, "Submit splits it off.". Compare with the dialog on Discord.
19. **Staff and the conductor.** Googer: Split… asks "Group that leaves" with nothing picked, each choice "Group B (Fast) · 2 trainers", who is in each group a line each in the text (names as the post shows them). Submit without a pick: "Pick the group that leaves first.".
20. **The split.** Submit group B: "Split off: Saturday legendaries (Fast)"; the list shows both trains; the old post's small print "Group B (Fast) went its own way: <the new post>" and the new post's "Split off from …" on Discord; the members of B are pinged in the new post. A second Submit of the same form (open it twice): "Split off: …" again, nothing more split.
21. **Stale.** Open Split…, rename group B on Discord, Submit: "The groups of this train changed meanwhile: press Split… again.", the form closes.
22. **Refused before it opens.** Tester in group A with the conductor in it: Split… says why under the buttons ("The conductor is in that group: only they and the moderators can split it off."), nothing opens; a member in no group: "Only a group's members, the conductor and the moderators can split a group off.". Both are the sentences Split… says on Discord for the same member (compare). A train of one group: no Split… on the post at all. A form opened by the conductor, then Submitted after the conductor role went to somebody else in the group: refused with the same words, and the post's controls' window not counted.
23. **A split that fails.** With the bot refused to post in West's forum for a moment: Submit says the post could not be made, in Discord's words, and the use is given back.

## The route editor (R3, R5, R6)

24. **Route for anybody.** Tester (may not arrange the route): Route shows the stops read-only, the train's marked, and under them what lies ahead as the post's small print says it ("Next: 3. … · 4. …, and 2 more to the end"); no Edit route.
25. **Route mode.** Googer: Edit route (once, in the member's part above Route's list; Route has none of its own) opens the editor in the side pane; on a phone the map with the pane docked under it (40%, `body.form-docked`).
26. **Power Spots.** With the Power Spots layer off: the hint says "Tap a gym on the map to add it as the next stop. Turn on Power Spots and zoom in to add a Power Spot."; turn it on and zoom to 16: the hint becomes "Tap a gym or a Power Spot on the map to add it as the next stop." without the editor being drawn anew (a name typed to save under stays). Tap a Power Spot: it is the next stop ("… (Power Spot) is stop 7 of the route."), no popup opens; tap it again: "That stop is on the route already." (the words of `/route add` for the same), nothing sent; a double tap does not zoom the map. With the keyboard in route mode: Tab reaches the gyms' and Power Spots' dots (a screen reader names each as a button), Enter on one adds it. After Done (out of route mode) Tab passes over the dots to the side pane: no dot is a Tab stop; a tap on a Power Spot opens its popup as before.
27. **Dragging with a mouse.** Drag stop 5 by its handle (⠿) onto row 2: the row it would land at is marked as the pointer moves; the drop is one move ("… is stop 2 of the route now, before …"), the numbers on the map follow. A drop where the stop was sends nothing.
28. **Dragging with a finger.** On a phone: drag a stop by its handle (an easy target for a thumb): the page does not scroll by the finger while dragging, the stop moves. With a route longer than the docked pane shows: hold a stop near the pane's bottom (or top) edge: the list scrolls by itself, faster nearer the edge, and the stop lands where it is let go. A drag while an edit is on its way does not begin.
28a. **A drag that ends without a move.** With a mouse: drag a stop, press Escape before letting go: the mark goes, nothing is sent. On a phone: hold a stop by its handle with one finger and tap a gym on the map with another: the gym is added and the editor drawn anew, which ends the drag: lifting the first finger sends nothing. A second finger dragged on the list during a drag moves nothing.
29. **The keyboard.** ↑, ↓ and the position menu still move a stop, one edit each; Tab reaches them; the handles are not in the Tab order.
30. **Stale.** Drag a stop while Tester removes one on Discord: "The route changed meanwhile: here it is as it is now.", the editor drawn from the route as it is now.

## After

31. **Nothing on Discord.** Every map form on Discord is a dialog with the same parts; `CONTROLS` has no "Do this on Discord" left: only "Start a new group on Discord →" in Group… (a Group… case, not a control).
