# Phase 8M-10 staging checklist: the region editor on the map

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the steps that need his hand on the editor.

- **Accounts:** Googer (owner, staff: Manage Server and a moderator role), Tester (a member, no staff role).
- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m10-editor-toggle/design.md` (goals 1 to 8, rulings C1 to C14).
- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Admins"; "Follows the device's light or dark").
- **Conventions:** `docs/architecture/web.md` ("The region editor on the map (plan 8M-10)", "The region editor (plans 8M-2, 8M-2F)").
- **Devices:** a desktop browser, light and dark, at 1280 and 1024 pixels and narrowed to 1023 and 800; a phone for step 4.
- **Do not save** on the test server unless Matt says so: every step but 15 stages edits and takes them back (Undo, or the browser's storage cleared). Step 15 saves one small change and saves it back.

## Before

0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: it reads `dist/web/assets.json` once at startup. No migration, no setting, no command change: no deploy.
1. **The test server's regions.** The dev database's regions of the test server (`var/stage/TEST-SERVER-STATE.md`). Note one corner two regions share (the outlines after a Fix all share theirs exactly) and one overlap or gap Fix… is offered for, or make one by moving a corner apart in step 12 first.

## Who is offered it (goal 1, C1, C6, C7)

2. **Staff.** As Googer on the map from 1024 pixels: the account menu (the name's button) holds "Edit regions" above Log out. In devtools' network, `/api/me` answers `mayEditRegions: true`, and loading the map asks Discord nothing more than before (the directory's look-up).
3. **Not staff.** As Tester: no "Edit regions"; `/api/me` says `mayEditRegions: false`. Open `/s/<guild>/map?edit=regions` by hand: the live map, and "Only staff of this server may edit its regions." under the header; `/api/regions/edit` answered 403 with those words, and nothing of the editor shown. The editor's files (`editor-….js` and `.css`) are loaded before that 403 (the data decides, after them): expected, they hold no data of the server.
4. **Narrow.** As Googer narrowed to 1023: no "Edit regions" in the menu; widen the window back to 1280 without reloading: the menu has it again. At 800 and on a phone, `/region edit`'s button (or `/s/<guild>/regions/edit`): the live map with "Edit regions on a wider screen (1024 pixels or more).", the address without `?edit=regions`; nothing else breaks (the list, Layers).

## Turning it on and off (goals 2 and 3, C4, C5, C8, C9)

5. **On.** At 1280, the live map zoomed into one region, "Edit regions": "Opening the region editor…" under the header until the editor shows (throttle the network to see it); the live map, the list pane, the layers' row, Report, Find and the item make way for the editor: its own map at the same place and zoom, its panel on the right, the tool row "Back to the map", Undo, Redo, Fix all slivers…, Load KML, Export KML, Save…, "Move shared corners together" (ticked). The address ends `?edit=regions`. Zoom out past the live map's least zoom and pan beyond its margin: no limit. In devtools' network: `editor-….js` and `.css` loaded once, then `/api/regions/edit`; while the editor is on no `/api/parties` nor `/api/stop-reports` for a minute (twice the 20 s), also after hiding and showing the tab. While it is on, resize the window and switch the device between light and dark: no `/api/parties/…/post` nor places asked for.
6. **Off.** "Back to the map": the live map at the editor's view (also after the resize of step 5: not shifted) (zoomed back within its own limits and margin if the editor went beyond them), the layers as they were (a layer turned off before stays off), the list, Report; `/api/parties` and `/api/stop-reports` asked at once, then every 20 s; with the PokéStops or Power Spots layer on at street level, `/api/stops` or `/api/powerspots` asked once for the view shown, not once per resize of step 5; the address without `?edit=regions`. Turn it on again: no second load of the editor's files, `/api/regions/edit` asked again (the staff check, fresh), the edits staged before still staged (Undo offered).
7. **A form holds.** Open a raid's Meet… (or route mode of a train, or the Report button's step 2), then "Edit regions": "Close the form first.", the editor stays off. Close the form: it turns on.
8. **The address.** `/region edit` in Discord as Googer, its button: the login link lands on `/s/<guild>/regions/edit`, which leads to `/s/<guild>/map?edit=regions` with the editor on. Logged out, `/s/<guild>/regions/edit` is the login page as before (401); as Tester, 403 "Only staff of this server may edit its regions." With `/api/geo` blocked in devtools (request blocking), open `/s/<guild>/map?edit=regions` again: the editor fitted to the server's regions, not the default view of Pittsburgh's center at zoom 11.
8b. **Another account (optional, a second staff account).** In one tab with the editor turned on and off once as Googer, log out and in as the other staff account in a second tab, then press "Edit regions" in the first: "You are logged in as someone else now: reload the page.", the editor stays off. (A member who is not staff gets the staff refusal first.)
9. **Discord away (optional).** With the bot's network to Discord cut for a moment after step 5: turning the editor on as Googer shows it read-only ("Discord cannot be reached just now, so the editor is read-only.", no Geoman tools, Save off); Tester's `?edit=regions` gets "Discord cannot be reached just now, so I cannot tell whether you are staff."

## The look (goal 4, C10, C11)

10. **Light and dark.** At 1280 and 1024, light and dark (switch the device): the header one row (the title "Pine" below 1280), the tool row's buttons gray with Save… blurple, the panel's headings, rows, the selected region's card with "Remove and delete its forum" red, Save…'s preview as a card; Geoman's tools readable in dark. No sentence names a color: "1 outline cannot be saved." (with a red square beside it, after drawing a region that crosses itself), "In no region: …" with an orange dot; "#name: theirs is drawn dashed." with a dashed swatch only when a region was saved by somebody else meanwhile (during step 15, in a second tab with a change of the same region staged).
11. **"No overlaps or gaps."** With every overlap and gap fixed (stage a Fix all slivers… if any are left): "No overlaps or gaps." in green where the list was; while the next check runs after an edit (the panel says "The overlaps and gaps are being worked out."), it is not said.

## Fix in view and shared corners (goals 5 and 7, C12, C13)

12. **Shared corners.** In edit mode (Geoman's edit tool), drag the noted shared corner: both regions' outlines follow it as it moves, both staged; one Undo takes both back. Untick "Move shared corners together" and drag it again: only the dragged region's corner moves (a gap or overlap appears in the list). Reload: the switch is still unticked; tick it. A corner on another region's side (a T-junction) moves alone. A corner shared with another server's outline (dashed gray) comes apart from it.
13. **Fix….** Scroll the panel to the bottom, then Fix… of an overlap or gap: the box at the map's top right corner, its choices inside it, Apply and Cancel at its foot in sight without scrolling; the map fitted to the sliver left of the box. Take each choice: dashed on the map, Apply staged as one change ("Fixed, as one change: Undo takes it back."); Undo. With the keyboard alone (Tab to Fix…, Enter): the focus goes into the box (its title, once the choices came), stays on a choice taken, and Cancel puts it on the panel, never on the page.
14. **Fix all slivers….** The box with its question, Leave it, Stop here and Cancel at its foot; the map at each stretch beside the box; Cancel. With the keyboard and a screen reader (NVDA or Narrator): each question, the first and every one after Leave it or a choice taken, is read from its first line ("… fixed so far."), where the focus goes.

## Save (optional, Matt's go-ahead)

15. **One save.** Move one shared corner a few meters, Save…: the preview names both regions; Save these changes: saved, the editor reloaded with the new outlines. While the preview and the save are being sent, "Back to the map" is off, its title "Wait for the answer of the preview or the save." (devtools' network throttling makes the moment long enough to see). Then move it back and save again. Nothing else is saved.

## After

16. **Back to how it was.** Clear the editor's staged edits (Undo to the start, or the browser's storage `pine-region-edits:<guild>:<user>`), the switch ticked, the map's layers as before the run.
