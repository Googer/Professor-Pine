# Phase 8M-11B staging checklist: trains and clusters on the map, and the invite

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives Discord and the map in its own tab; Tester is on Matt's phone.

- **Accounts:** Googer (the owner, staff) and Tester (a member, no staff role). Step 24 also needs somebody outside the test server: Matt decides how (step 23).
- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m11b-trains-clusters/design.md`.
- **Design:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11B: trains and clusters on the map").
- **Conventions:** `docs/architecture/web.md` ("The fix pass: trains and clusters (plan 8M-11B)").
- **Devices:** a desktop browser, light and dark, at 1280 pixels; Matt's phone (touch, the docked pane, the phone card).
- **Findings:** each step names the finding it closes (S13, S24, S25, S27, follow-ups "From the staging run of the web polish"), or the invite (Matt, 2026-10-28).

## Before

0. **The page built, the setting, the bot started after them.**
   - Run `npm run web:build`.
   - In Discord, as Googer, make an invite to the test server that does not expire (Server Settings › Invites, or Invite People › Edit invite link › Expire after: Never), and put it in `var/stage/settings.json` under `web`: `"invites": { "<TEST_GUILD_ID>": "https://discord.gg/<code>" }`.
   - Start (or restart) the bot. No migration and no command change, so no deploy.
1. **Trains to look at.** In one region, all three with Googer as the conductor and Tester signed up:
   - **Line**, a train of four gyms, at the end "Finish", at stop 2;
   - **Round**, a train of three gyms, at the end "Loop", at stop 1;
   - **Back**, a train of three gyms, at the end "Turn back", at stop 1.

   Pick gyms a few streets apart, so that every leg is long on the screen at zoom 15.

## A train's line shows its way (S27)

2. **Done and ahead.** On the desktop map at zoom 15, the Trains layer on, look at **Line**:
   - the leg from stop 1 to stop 2 is faint;
   - the two legs after stop 2 are drawn as before (orange, not faint), each with a small orange arrowhead at its middle pointing toward the next stop;
   - the faint leg has no arrowhead.
3. **The arrowheads follow the zoom.** Zoom out step by step: the arrowheads stay at the middle of their legs and keep pointing the right way at every zoom, and go away once a leg is shorter than about 40 pixels on the screen. Zoom back in: they come back. Pan the map: they move with it.
4. **Moving on.** On **Line**, Move… › Next: the leg just traveled turns faint and loses its arrowhead. Move… › Previous: it is drawn as ahead again.
5. **A loop.** Look at **Round**: its closing leg, from the last stop back to the first, is dashed, with an arrowhead pointing to the first stop. Move… › Next twice (to the last stop), then Next again (round to the first stop): every leg is drawn as ahead again, and the closing leg stays dashed with its arrowhead.
6. **A turn-back train.** Look at **Back**:
   - Move… › Next to the last stop: the leg back to the stop before is drawn as ahead, with its arrowhead pointing back, and the rest is faint (BR-4);
   - Move… › Next (it turns back): the legs ahead now run back toward the first stop, their arrowheads pointing back.
7. **Finished.** Manage… › "Finish it here" on **Line**: its whole line is faint, with no arrowhead. Do the same on **Round**: no closing leg any more, and no arrowhead.
8. **A loop of two stops.** Make a train of two gyms, at the end "Loop": the line and its dashed way back lie on one another, and the two arrowheads are apart (each two thirds of the way along its leg), not on top of each other at the middle.
9. **A shuttle of two stops (BR-4).** Make a train of two gyms, at the end "Turn back". Before its first move the leg to the second gym is ahead, its arrowhead pointing there. Move… › Next: the leg traveled is faint and the way back is drawn over it as ahead, its arrowhead pointing back to the first gym. Move… › Next again (it turns): the same, pointing the other way. Its line is never all faint while it runs; Manage… › "Finish it here" makes it all faint, with no arrowhead.
10. **The popups.** A click on a faint leg, on a leg ahead and on a loop's dashed leg each opens the train's popup (the phone card on the phone). The arrowheads take no click (a click on one goes to the line or the map under it).
11. **Light and dark, and the phone.** Steps 2 and 5 in dark, and on the phone: the arrowheads are the train's color of each theme, readable over the tiles.
12. **Route mode is unchanged.** "Edit route" on **Line**: route mode's dashed line and its numbered stops as before, and the train's own line (faint legs and arrowheads) is not drawn while it is edited.

## The drag shows where a stop will land (S24)

13. **On the desktop.** In route mode on **Line** (four stops), drag stop 3's handle with the mouse:
    - as it moves over the rows, the map shows two dotted orange legs: from the stop it would follow to it, and from it to the stop it would precede;
    - the row under the pointer stays marked in the list;
    - over row 1 there is one leg (to the stop it would precede), over row 4 one leg (from the stop it would follow).
14. **Every way the drag ends clears it.** The dotted legs go when the stop is dropped on another row (it moves), dropped where it was (nothing is sent), and on Escape. Start a drag and, with a second finger on the phone, tap a gym (it is added): the legs go, and the drag moves nothing.
15. **On the phone.** The same with a finger in the docked pane: the legs show on the map above while the stop is dragged, and go when it is let go.

## A held stop holds the map (S25)

16. **The edge case of the staging (8M-8C 28a).** On the phone in route mode, hold a stop's handle with one finger and, with another, pinch and drag the map: the map neither zooms nor moves.
17. **The map comes back.** Let go of the handle: pinch and drag the map; it zooms and moves as before. Do it again after a drag ended by a drop, and after one ended by the browser taking the pointer back (scroll the pane with the other finger, if the phone does).

## Fewer, smoother gym clusters (S13)

18. **Fewer clusters zoomed out.** Turn on the Gyms layer and zoom out over Pittsburgh to zoom 12, then 11: far fewer clusters than at the staging of 2026-10-28 (the cell is 120 pixels at 12 and below, 90 at 13 and 14, 60 from 15). Matt's eye: are they too few or too many at 12, 13 and 14? (The numbers are `cellPixels` in `src/web/client/cluster.ts`.)
19. **Smooth zooming.** Zoom in and out between 11 and 16 with the wheel and on the phone with a pinch: no long freeze at the end of a zoom, as in S13. Optional: a Performance recording in devtools while zooming from 11 to 14 and back, for the plan's notes.
20. **A cluster changes in place.** At zoom 13, with a cluster in view, have Googer report a raid at one of its gyms (on Discord): at the next poll the cluster's count goes down by one and the raid is drawn; the cluster does not blink.
21. **A tap on a cluster** still zooms in on its gyms, also after a zoom (its marker may have been given to another cluster): each cluster zooms in on its own gyms.
22. **Nothing redrawn for nothing.** At zoom 12, leave the map for a minute without any change: the clusters do not blink at the polls.

## An invite for a visitor who is not a member

23. **Matt decides who plays the visitor** (somebody logged in with Discord, not in the test server):
    - **A fresh account outside the server, if Matt has one:** a fresh browser profile (Chrome: a new person; or a private window), logged in to Discord as that account. Nothing changes for Tester.
    - **Tester, who leaves the test server and joins again:** only if Tester can rejoin, which the invite of step 0 allows (it is the link the button opens). Tester loses its roles and sign-ups in the test server by leaving: end Tester's parties first. Matt says which, or skips steps 24 to 26.
24. **The invite.** As the visitor, open the map's address (`/s/<TEST_GUILD_ID>/map`) and log in with Discord:
    - the header says "You are not a member of this server." and under it the button "Join the server on Discord";
    - it opens the invite in a new tab (in that tab's devtools console, `window.opener` is `null`);
    - on the phone (also at 360 pixels) the button is on a line of its own under the not-a-member line, its words wrapping, and nothing of the header runs off the screen.
25. **Joining.** Join the server through the invite. Wait until a full minute has passed since the map was last loaded as the visitor, then reload it: the visitor is a member, the button is gone, and the parties are shown. No new login is asked. (A reload within that minute may still show the button: the member directory keeps its answer for a minute, `CACHE_MS`.)
26. **Who never sees it.**
    - Logged out (a private window, not logged in): the header has "Log in with Discord" only.
    - Googer and Tester, members: no button.
    - Optional, with `web.memberRole` set for a run to a role Tester lacks: Tester sees the role line ("…you need the … role in this server.") and no invite. Put the setting back after.
27. **A wrong invite stops the start (optional).** With `"invites": { "<TEST_GUILD_ID>": "https://example.com/abc" }` the bot does not start, and its message names `web.invites` and says it must be `https://discord.gg/<code>` or `https://discord.com/invite/<code>`. Put the right one back, and start it again.

## After

28. **Back to how it was.** End the test trains (or let them end). Keep `web.invites` in the stage settings or take it out, as Matt likes; if Tester left and rejoined, give Tester back its roles.
