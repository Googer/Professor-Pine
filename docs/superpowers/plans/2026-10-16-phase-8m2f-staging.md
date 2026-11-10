# Phase 8M-2F staging checklist: Fix, "Fix all slivers" and the worst-first list

Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the editor in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`, with the web settings of 8M-1's and 8M-2's staging (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). 8M-2's checklist (`2026-10-16-phase-8m2-staging.md`) comes first or alongside: this one assumes the editor opens and saves.

## Before

1. No migration and no new command in this plan. `npm run build`: `dist/web/assets/` holds a new `editor-<hash>.js` and `editor-worker-<hash>.js`.
2. A copy of the dev database's `Region` rows (a dump of the table) before anything is saved, to put back afterwards.
3. Pittsburgh's real regions on the test server, as 8M-2's step 17 put them there (the production dump's rows restored into the dev database with their server pointed at the test server, or `/region import` of their outlines): the 28 outlines of the 2026-10-14 dump, with the gyms and Wayspots of the dump where they can be had, so that gym #3092 lies where it does in production (in regions 44 and 56). Note which channel stands for regions 44, 50, 51 and 56 on the test server.

## The list, worst first

4. Clear the staged edits of the test server (storage panel: remove `pine-region-edits:<guild>:<user>`, or Save or Undo everything), then open the editor: the list of overlaps and gaps begins with those holding the most gyms, stops, power spots and Wayfarer gyms, then the largest; the overlap of #3092 (regions 44 and 56) is near the top. Each piece has "Fix…" beside it, or a grey line saying why it cannot be fixed ("Its borders lie more than 150 m apart: draw it by hand.", "It is no sliver between two or three regions: draw it by hand."). In Node all 96 pieces of the dump were fixable: count the grey lines.
5. Make any edit, reload: the list is new first, then by area (8M-2's order). Undo it, reload with nothing staged: worst first again.
6. Time from the page's load to the list (the worker now also finds the stretches: about 25 ms more in Node).

## Fix

7. "Fix…" on the long overlap of regions 50 and 56 (15.9 km): the panel shows "The slivers between #… and #…" with "Take #…'s border", "Take #…'s border", "Take the midline", the midline chosen and drawn dashed on the map; the map fits the strip. Each choice lists every place whose region it changes (in the strip, or beyond it) and where it ends up. Choose each in turn: the dashed line follows. Time from the press to the choices (0.3 s in Node) and whether the page stays responsive meanwhile.
8. Apply: the strip is gone from the list once the check is back, the two outlines meet along the midline, the gym counts follow, and "Fixed, as one change: Undo takes it back." Undo brings both outlines back at once; Redo.
9. A gap where three regions meet (in the dump: regions 44, 51 and 56, or 33, 37 and 43): "Where #…, #… and #… meet", a round marker where they meet with the midline; the marker is the one a drag takes, also over Geoman's markers. Drag it within the gap: "Working out the fix at the corner as dragged…" and Apply is off until the choices come back; then the dashed outlines meet at the marker, and places beyond the gap whose region the new lines would change (if any) are listed under the midline. Drag it out of the gap, across a border: the midline stays shown, with "The corner must stay inside the sliver." under it, and Apply is off. Drag it twice in quick succession (the second drag before the first one's choices are back): the marker stays under the pointer all through the second drag, and the choices shown are those of where it was dropped last. Drag it back into the gap, Apply: the three outlines share the corner. The rule holds the corner near the strip only: land between a corner in the gap and the strip's ends can still change region, and what shows it is the dashed outlines and the places listed under each choice; look at a corner dragged to the gap's edge for both.
10. The gym in two regions (#3092, regions 44 and 56): "Fix…" on their overlap lists "Gym #3092 “…” ends up in #…" under each choice, the region of the border taken; take one, Apply: the gym is counted in one region only, and is no longer listed in an overlap.
11. While a Fix is shown, reshape any region: the Fix is dropped (its dashed lines and marker go). A Fix asked for before the list is back after an edit says "Wait until the overlaps and gaps are worked out."

## Fix all slivers

12. "Fix all slivers…" (in the toolbar; off while the overlaps and gaps are worked out, and with nothing to fix): "Fixing the slivers with nothing in them…", then a question for each stretch whose midline would move a place into another region (one in its slivers, or beyond them): "N stretches fixed so far.", the stretch and "N places would change region. Which line do the regions take?", a button for each choice (hovering one draws it dashed) with where each place ends up, "Leave it", "Stop here", "Cancel". A double click on a choice answers once. Time from the press to the first question (1.8 s in Node with 20,000 places strewn over the city, 0.9 s without), and whether the page stays responsive.
13. Answer a few, leave one, then "Stop here": "Fixed … stretches; left … as they were. Staged as one change: Undo takes it back." (and "… taken back, as it would make a new overlap or gap: draw it by hand" if the fixes together made one the loaded regions lack). One Undo takes everything back; Redo.
14. "Cancel" in the middle: nothing is staged; "Fix all slivers…" again starts afresh (no answer of the one cancelled is shown).
15. Fix all to the end (take the midline or a border for every question): the list of overlaps and gaps holds only what was left and what cannot be fixed; count them. In Node the dump's outlines, with nothing in any sliver, were left with no overlap and no gap; 28 outlines changed, 1,040 corners in all becoming 1,380.

## Save

16. Save… after Fix all: the preview lists 28 changed outlines and the gyms each region gains and loses (none should be in no region that was in one before); "Your changes make …" does not appear (the server's check agrees with the page's). Time the server's check on the real outlines (8M-2's thread, 10 s at most).
17. Save these changes: the outcome region by region; reload: the list of overlaps and gaps is empty (or holds only what was left); `/region list` and the public map show the new outlines; Export KML and look at them in Google My Maps beside the old export.
18. 8M-2's step 18 again: beside a densely traced neighbour, reshape a hand-drawn border so that Save is refused for a new sliver; "Fix…" on it: Apply, and Save goes through.

## Afterwards

19. Put back the `Region` rows from step 2 if the test server's regions should be as before.

## Left open (to the follow-ups if not settled here)

- Whether the corner of three regions is proposed where Matt would put it (across from where two meet along the strip's side, not the centroid of the gap; see the plan's decisions; it may lie a little outside the gap, and only a dragged corner is held to it), and whether its marker is easy to drag beside Geoman's own markers.
- "I could not work this fix out: draw it by hand." (a fix whose work threw in the worker, or a choice whose border was not found where its stretch lies) is not staged: it is tested in Node with work that throws. Nor is a worker error turning Fix and "Fix all slivers…" off (tested in its pure part, `fixesOffered`).
- Whether "Fix all" should count Wayfarer gyms Pine did not take as something in a sliver (it does).
- How the worst-first order reads with Pittsburgh's places: whether "the first time" (nothing staged) is the right test, or a flag once seen.
