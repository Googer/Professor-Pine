# Phase 8M-2 staging checklist: the region editor and `/region edit`

Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the editor in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`).

## Before

1. No migration in this plan. `npm run build` (it runs `npm run web:build`): `dist/web/assets/` holds `editor-<hash>.js`, `editor-<hash>.css` and `editor-worker-<hash>.js` beside the map's files, and `dist/web/assets.json` names them under `map` and `editor`.
2. `/region edit` is new: `npm run deploy-commands -- --global` with Matt's go-ahead.
3. A copy of the dev database's `Region` rows (a dump of the table) before anything is saved, to put back after the steps that change regions.

## Who may open it

4. `/region edit` as a moderator of the test server: a private container with the editor's address and "Open the region editor (logs you in)". The button opens "Open the region editor of this server, logged in with the link from /region edit." with "Continue as <account>"; Continue lands on `/s/<id>/regions/edit` without the token. The same button again: the editor's page says "This login link has expired. Log in to edit this server's regions." with "Log in with Discord" and "Or use /region edit in Discord."
5. `/region edit` as a member without a staff role: "Only admins, moderators and bot developers can do that." Logged in on the web as that member (`/maps`, then the editor's address): "Only staff of this server may edit its regions." (403); the map stays theirs.
6. Take the moderator's role away on Discord while the editor is open, then press Save: refused (403) at once, without a restart (the member is fetched fresh). Give it back.
7. The console shows no CSP violation: Leaflet's and Geoman's styles and icons load, the worker starts (`editor-worker-<hash>.js` in the network panel).

## What it shows

8. The test server's regions with their channel names and gym counts; other servers' regions (if any within 2 km) dashed grey and not selectable; gyms green, gyms in no region orange; the layer switch toggles stops (off at first), power spots, Wayfarer gyms Pine did not take, other servers' regions, overlaps and gaps. A stop outside every region is orange.
9. `/s/<id>/api/regions/edit` twice: the second a 304. Its size for the test server, and how long the page takes to show (network panel).

## Drawing

10. Draw a new polygon with Geoman: it is staged ("new region (no channel yet)"), Save is off with "1 new region has no channel yet." Pick a text channel that is no region: the label follows; pick "A new channel…" with a name and a category.
11. Reshape a region (drag a corner, add one in the middle of a side, remove one with a right click): the gym count follows; drag a whole region in drag mode. Make an outline cross itself: it turns red, Save is off with the reason; fix it.
12. Snapping: draw a region beside another; its corners snap to the other's corners and sides (the shared border shows no sliver in the overlap and gap list).
13. Split a region along a drawn line (from outside, across, to outside; click the last point again): the larger part keeps it, the new one asks for its channel; "Swap with …" exchanges them. A line that does not go across says so.
14. Remove a region (keep its forum), another (delete its forum, as a moderator with Manage Channels; without it the button is not offered); Restore one.
15. Undo and redo step through every edit; reload the page: everything staged is still there (localStorage `pine-region-edits:<guild>:<user>` in the storage panel); a private window starts empty.

## Overlaps and gaps

16. Make an overlap on purpose (drag a side into a neighbour): after a moment it is shaded red and listed first as "New overlap of … m², #a and #b: …", Save is off with "Your changes make 1 new overlap." Pull the side back: it is gone. A gap the same way (between three regions).
17. Load Pittsburgh's real regions (the production dump's `Region` rows restored into the dev database, or `/region import` of their export into the test server, with Matt's go-ahead): the lists show the existing overlaps and gaps with their areas and what lies in them (compare with spec 4.3: 124 overlaps over 2,000 m² and about 1,200 smaller; 22 gaps over 2,000 m² and about 590 smaller; time how long the worker takes after an edit, and whether the page stays responsive meanwhile); none of them blocks Save; an edit elsewhere saves.
18. Beside a densely traced neighbour of Pittsburgh's (an outline of hundreds of corners along a township line), reshape the shared border by hand: drag a corner of the hand-drawn region onto the traced border, add one, move one. Note how often Save is refused for a new sliver (a thin overlap or gap along the border) before 8M-2F's Fix exists, and how wide those slivers are, for 8M-2F.

## Saving

19. Save…: the preview in `/region import`'s words ("Saving would give 1 new region and 1 new outline. Nothing is changed yet.", **Would be imported**, the channels and categories it would create, gyms left in no region, **Would be removed** with what goes with each). Cancel changes nothing.
20. Save these changes: the outcome region by region; the new channel and its category exist on Discord, with a forum; the removed region's forum kept or deleted as chosen; the staged list is empty afterwards (localStorage cleared); `/region list` shows the same; the bot's log has `regions were saved in the web editor` with numbers only.
21. A partial save: stage a new region on a channel, delete that channel on Discord, then save: the outcome says it was not imported, and it stays staged.
22. Two editors at once (two tabs, or a tab and `/region import`): change a region in one and save; save a change of the same region in the other: "Changed by somebody else", theirs dashed blue; "Take theirs" drops the staged change, "Keep mine" saves it over theirs on the next Save.
23. With the bot unable to reach Discord (Matt pulls the network for a moment, if at all): the editor opens read-only with "Discord cannot be reached just now, so the editor is read-only.", no channel offered, Save off; a save sent anyway answers 503.

## KML

24. Export KML: `<server name>-regions.kml` with the staged changes; `/region import` of that file in Discord previews "outline unchanged" for the saved regions.
25. Load KML (the Pittsburgh export, or a file from Google My Maps): the areas named after regions reshape them, others become new regions (of the channels they name, or new channels in the category of their description); one Undo takes the whole file back. A KMZ says to export KML instead.

## Afterwards

26. Put back the `Region` rows from step 3 if the test server's regions should be as before; delete the channels and categories made for the test.

## Left open (to the follow-ups if not settled here)

- How long the worker takes for Pittsburgh's outlines, and how long a save's own check takes in its thread (`SaveCheckWorker`; the bot's log stays live meanwhile), and whether a preview of a whole city's edit stays under its 10 s limit.
- The page on a phone (Geoman's tools on touch).
- Fix and "Fix all slivers", the worst-first list on first open: plan 8M-2F.
