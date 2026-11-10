# Phase 8M-11C staging checklist: the region editor

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives the map in its own tab as Googer; Matt's hand is needed where a step says so (a touch device, a right click Claude's tab cannot make).

- **Accounts:** Googer (the owner, staff: Manage Server and a moderator role). One staff account is enough: no step needs Tester but step 6's glance.
- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m11c-region-editor/design.md`.
- **Design:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11C: the region editor").
- **Conventions:** `docs/architecture/web.md` ("The fix pass: the region editor (plan 8M-11C)", "The region editor on the map (plan 8M-10)", "The region editor (plans 8M-2, 8M-2F)").
- **Devices:** a desktop browser with a mouse, light and dark, at 1280 and 1024 pixels and narrowed to 1023; the browser's device emulation of a tablet (touch) at 1280 or wider; Matt's phone for step 5.
- **Findings:** each step names the finding it closes (S29 to S32, follow-ups "From the staging run of the web polish"). Steps 22 to 29 are the steps of `2026-10-28-phase-8m10-staging.md` left unrun on 2026-10-28 that one staff account can do (Geoman's drags, Fix… on a gap, Fix all, a save, the address's logged-out and blocked-geo parts).
- **Do not save** on the test server but in step 28, which saves one small change and saves it back (Matt's go-ahead). Every other step stages edits and takes them back (Undo, or the browser's storage cleared).

## Before

0. **The page built, the bot started after it.** Run `npm run web:build`, then start (or restart) the bot: it reads `dist/web/assets.json` once at startup, and `/api/me` now answers `userId`. No migration, no setting, no command change: no deploy.
1. **The test server's regions.** The dev database's regions of the test server (`var/stage/TEST-SERVER-STATE.md`, Pittsburgh's 28). Note:
   - one corner two regions share (the outlines after a Fix all share theirs exactly), and if there is one, a corner three share;
   - that the test server's regions are clean ("No overlaps or gaps."): steps 24 and 25 make a gap by moving a shared corner apart.
2. **The browser's storage clean.** In devtools › Application › Local storage of the map's origin, no `pine-region-edits:<guild>:<Googer's id>` yet (or note what it holds).

## A computer with a mouse (S29)

3. **Desktop with a mouse.** As Googer at 1280: the account menu holds "Edit regions" above Log out. Narrow the window to 1023: the item is gone; widen it back to 1280 without a reload: it is back.
4. **A touch screen, wide.** In devtools' device toolbar, a tablet in landscape at 1280 or wider (iPad Pro, 1366 by 1024, touch), reload:
   - the account menu has no "Edit regions";
   - open `/s/<guild>/map?edit=regions` in that tab: the live map, the line "Edit regions on a computer with a mouse and a screen 1024 pixels wide or more.", the address without `?edit=regions`, nothing broken (the list, Layers).
   - Turn the device toolbar off and reload: the item is back.
5. **The phone (Matt).** On the phone, `/region edit`'s button in Discord (or `/s/<guild>/regions/edit`): the live map with the same line, the address without `?edit=regions`.
6. **Tester (glance, optional).** As Tester nothing changes: no "Edit regions", `?edit=regions` answers "Only staff of this server may edit its regions."

## The places clustered (S30)

7. **Zoomed out.** As Googer at 1280, "Edit regions" over the whole of Pittsburgh (zoom 11):
   - the gyms and the Power Spots are circles with a count, each layer's in its own corner of a cell (gyms top left, Power Spots bottom right), filled in the color of its dots (gyms green, Power Spots purple);
   - a cluster that holds a place in no region has an orange ring; one whose places are all in a region keeps the pale gray ring;
   - "In no region: …" in the panel as before.
   - The editor opened and draws without a freeze (on 2026-10-28 the first opening took 30 to 40 s with every place drawn at once: observation O1). Note how long it takes from "Edit regions" to the drawn map.
8. **The layer switch.** Open the layer switch (top right):
   - tick "Stops (many: off at first)": its clusters (blue, top right of each cell) appear at once;
   - untick "Gyms": the gyms' clusters go; tick it again: back;
   - "Wayfarer gyms Pine did not take", "Other servers' regions" and "Overlaps and gaps" toggle as before.
9. **Zooming and panning.** Zoom in step by step to 16: the clusters split as the cells shrink (120 pixels at 12 and below, 90 at 13 and 14, 60 at 15), and from 16 every place is a dot, a place in no region edged in orange, its name on hover. Pan: the places come with the view, no freeze. A click on a cluster zooms in on its places.
10. **The warning follows an edit.** In Geoman's edit mode, drag a corner of a region so that a gym near its border leaves it, and drop: that gym's dot (zoomed in) is edged in orange, and zoomed out the cluster that holds it gets an orange ring; Undo: both back to how they were.
11. **Light and dark.** Switch the device to dark and back: the clusters' colors and counts readable in both, the rings visible.

## What is unsaved (S31)

12. **The line in the editor.** Stage three edits of two regions (move a corner of region B, then a corner of region A twice, more than two seconds apart; each a corner no other region shares, so that the move stays in its own region): the panel's first line, under the tools, says "2 regions have unsaved changes. They wait here until you save or undo them." Undo once: still 2 (region A's first move remains). Undo again: "1 region has unsaved changes. It waits here until you save or undo it." Redo twice: "2 regions …".
13. **Back to the map.** "Back to the map": the live map at once, no question asked. Open the account menu: "Edit regions · 2 unsaved".
14. **Kept per server and member.** In devtools' network, `/api/me` answers `userId` (Googer's id); in Local storage the key is `pine-region-edits:<guild>:<Googer's id>`. Reload the page: the menu still says "Edit regions · 2 unsaved".
15. **Undone to nothing.** "Edit regions", Undo until Undo is off: no line in the panel. "Back to the map": the menu says "Edit regions" alone.
16. **Where nothing is kept.** A private window logged in as Googer (its own storage): "Edit regions" without a count.

## A shared corner deleted (S32)

These need a right click on a corner in Geoman's edit mode (the pencil tool on the left); Claude's tab can do it with the browser's own right click, or Matt does.

17. **In every region that has it.** "Move shared corners together" ticked. Right click the noted corner two regions share: it is gone from both outlines (one border straight across now), both regions staged; the panel's line says "2 regions have unsaved changes. They wait here until you save or undo them." (with nothing staged before). One Undo: both corners back, and the line gone. Redo: both gone, "2 regions …" again; Undo again.
18. **Refused.** Draw a small triangle (Geoman's polygon tool, three corners) with one corner snapped onto the noted shared corner. Right click that corner: nothing is deleted from any region, and the line "Not deleted: new region (no channel yet) would have fewer than three corners." shows under the header. Right click one of the triangle's other corners (shared with nobody): nothing is deleted either, and the same line shows ("Not deleted: new region (no channel yet) would have fewer than three corners."; branch review BR-1: a triangle's corner is refused whether or not it is shared, with the switch on or off). Drag one of the triangle's corners onto a neighboring corner of its own and let go: the triangle snaps back as it was, nothing is staged, and the line "Not changed: new region (no channel yet) would have fewer than three corners." shows (branch review BR-4). Undo the triangle (it was one edit).
19. **The switch off.** Untick "Move shared corners together" and right click the shared corner again: it goes from the region whose corner was clicked alone (a gap or overlap shows in the list once checked). Undo; tick the switch again.
20. **Not shared.** A corner no other region has (and a corner of one region that lies on another's side, a T-junction): right click deletes it from its own region alone, as before. Undo.
21. **Another server's outline (if one is drawn near the test server's regions):** a corner one of our regions shares with another server's dashed gray outline: right click deletes ours alone; the other server's outline stays.

## The 8M-10 steps left (one staff account)

From `2026-10-28-phase-8m10-staging.md`; not run on 2026-10-28 ("Not run: … 12-15 (Geoman drags and Fix… need a gap: Matt's hand), 16", and step 8's logged-out and blocked-geo parts).

22. **Shared corners dragged (8M-10 step 12).** In edit mode, drag the noted shared corner: both regions' outlines follow it as it moves, both staged; one Undo takes both back. Untick "Move shared corners together" and drag it again: only the dragged region's corner moves (a gap or overlap appears in the list). Reload: the switch is still unticked; tick it. A corner on another region's side (a T-junction) moves alone. A corner shared with another server's outline (dashed gray) comes apart from it.
23. **A gap to fix.** With the switch unticked, drag the shared corner of step 22 a few meters apart, so that the list shows a gap (or an overlap) with "Fix…". Keep it for steps 24 and 25.
24. **Fix… (8M-10 step 13).** Scroll the panel to the bottom, then Fix… of the gap: the box at the map's top right corner, its choices inside it, Apply and Cancel at its foot in sight without scrolling; the map fitted to the sliver left of the box. Take each choice: dashed on the map; Apply stages it as one change ("Fixed, as one change: Undo takes it back."); Undo. With the keyboard alone (Tab to Fix…, Enter): the focus goes into the box (its title, once the choices came), stays on a choice taken, and Cancel puts it on the panel, never on the page.
25. **Fix all slivers… (8M-10 step 14).** Fix all asks only about a stretch with a place in it: make the gap of step 23 hold a gym or a stop (drag the corner further, over one) to see the box (corrected by plan 8M-13). The box with its question, Leave it, Stop here and Cancel at its foot; the map at each stretch beside the box; Cancel. With the keyboard and a screen reader (NVDA or Narrator, Matt): each question, the first and every one after Leave it or a choice taken, is read from its first line ("… fixed so far."), where the focus goes. Then Undo to nothing (the panel's line gone), and tick the switch.
26. **The address, logged out (8M-10 step 8, part).** In a private window, `/s/<guild>/regions/edit`: the login page (401) with "Log in with Discord" and "/region edit", as before.
27. **The address without the live map (8M-10 step 8, part).** Block `/api/geo` in Chrome's devtools: the Network panel's "Request conditions" takes a URLPattern, so give the full address (`https://<host>/s/<guild>/api/geo`). The page reads it only at its load: reload after blocking, then open `/s/<guild>/map?edit=regions` as Googer: the editor fitted to the server's regions, not the default view of Pittsburgh's center at zoom 11. Unblock it. (Corrected by plan 8M-13.)
28. **One save (8M-10 step 15; Matt's go-ahead).** Move one shared corner a few meters (the switch ticked), Save…: the preview names both regions; Save these changes: saved, the editor reloaded with the new outlines, the panel's line gone, and back on the map the menu says "Edit regions" alone. While the preview and the save are being sent, "Back to the map" is off, its title "Wait for the answer of the preview or the save." (devtools' network throttling makes the moment long enough to see). Then move it back and save again. Nothing else is saved.
29. **Discord away (8M-10 step 9, optional).** With the bot's network to Discord cut for a moment: turning the editor on as Googer shows it read-only ("Discord cannot be reached just now, so the editor is read-only.", no Geoman tools, Save off); the clusters are drawn as in step 7.

## After

30. **Back to how it was.** Undo to nothing (or clear `pine-region-edits:<guild>:<Googer's id>` in Local storage), the switch ticked, the device toolbar off, the editor's layer switch as before (Stops off), the map's layers as before the run.
