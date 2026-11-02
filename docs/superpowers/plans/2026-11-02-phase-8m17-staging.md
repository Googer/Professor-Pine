# Staging of 8M-17: the map's and the region editor's tours

Needs Matt's go-ahead (a real login). Checked before merge in a browser on a stub server with fake lists (no Discord): desktop 1280x800 and phone 375x812, member and visitor, the editor's four steps. Not checked there: what follows.

1. **First visit, member, desktop.** With `pine-map-tour` gone from the browser's storage, open the map: the tour opens once the list is drawn. Press a layer's toggle on Layers: the map follows. Open More: the ring holds More and its menu.
2. **Phone, real device.** Layers: the button opens the sheet over the tour, Done returns to it. Reading the map points at a marker when one is in view, the card clear of it. Report points at the round button. Turn the phone mid-tour: the ring and the card follow.
3. **Dark theme**, both ways of getting it: the card, the sample marker and the dimming read well.
4. **Skip and Escape** end it; a reload does not bring it back; "Map tour" in the menu does, and closes a popup or the phone's list first. With a form open it says to close the form.
5. **A visitor** logged out, then logging in: the short tour, then the member's tour once. On a server without `DISCORD_CLIENT_SECRET`: the step points at the `/maps` line.
6. **Logged in without the map's role:** the short tour, its last steps at the line that says what is lacking.
7. **Staff:** open the editor from the menu for the first time: its tour opens over it; "Editor tour" in the menu while on, "Map tour" while off. Opened by `/region edit`'s link in a fresh browser: the editor's tour, not the map's.
8. **The keyboard:** Tab on Layers goes through the toggles, More and the card and round, with More open or closed; Shift+Tab back; Escape ends the tour and closes More.
9. **A busy server:** live updates redraw under the tour with the ring staying on target.
