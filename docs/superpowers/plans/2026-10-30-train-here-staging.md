# Staging checklist: Train here

A train started from a gym's or a Power Spot's popup, with the place as its first stop (Matt, 2026-10-30; the map's alone, no change to `/train`). Run `npm run web:build`, then restart the bot and reload the page.

## On a desktop

1. **A gym's popup.** Tap a gym with no raid: "Train here" under "Meetup here". Press it: the start form opens in the popup, in the button's place, with "First stop: <gym>", the region filled in where one region holds the gym, the name field in focus. The form fits the popup, scrolling if it must.
2. **Start.** Give it a name and press Start: route mode opens with the gym as stop 1, "The train is there now" under the editor, and a tap on another gym adds stop 2. Done opens the train's popup. Its post on Discord says the same route, and "Raid Train".
3. **A gym with a raid.** "Train here" under the raid's post (on a phone, under "Show the whole post" of its card). It starts the same way, and the raid stays.
4. **A Power Spot.** Tap a Power Spot without a battle: "Train here" under "Report max battle here". The form says "First stop: <spot> (Power Spot)". After Start the post says it is a Dynamax train, and Manage… can change that.
5. **Overlapping regions.** A place two regions hold: the region is left to pick, and "Pick the region first." until it is picked.
6. **A form open.** With another form open, "Train here" is off. Cancel in the start form makes no train and puts the popup's "Train here" back.
7. **No Report.** While the start form or the editor is open, the header's Report is gray.

## On a phone

8. **The popup or card goes.** Tap a gym with no raid (a popup, not a card), then "Train here": the form shows in the popup, with no Report line or floating Report over it. Start: the popup closes and the editor shows with the gym as stop 1, nothing in front of it. The same from a raid's card, its whole post shown first.
9. **A Power Spot** the same way.

## Who may not

10. **Logged out, or a read-only map.** No "Train here", as there is no "Meetup here".
11. **A member kept out of the region's forum.** Start is refused in the form, and no train is made.

## Starts, and the one word

13. **Discord.** Manage… on a train without a start: "It has no start time yet." and a line "Starts". Type `in 30`: the answer says when, the post shows it, and the others are told. Open it again and submit blank: "Nothing changed." Type `cancel`: no start any more. Type nonsense: `/meet`'s words, and a fourth start within three minutes is refused while nonsense does not count.
14. **The map.** In the train's Manage…: "Starts now" and "Ends now" over a line for each, no Set. `in 30` and `in 90` set both, answered together; blank keeps them; `cancel` and `none` remove them; nonsense in Ends is refused with nothing changed and the form still open, what was picked kept. A train from 6:00 to 7:00: `8pm` and `9pm` move both later, `4pm` and `5pm` both earlier. An end at or before the start is refused with nothing changed. The post's hint says Manage… or `/meet` sets the start. On Discord the dialog with route, end mode and kind all shown still fits, without Ends.
15. **Who.** Staff not signed up open Manage… without the line. A maker who is not signed up is refused Manage… and `/meet` still works.
16. **The word.** A raid's and a meetup's button on the map, and `/wants` and a DM's want line on Discord, say Manage…. "Edit route" and `/gym show`'s Edit… stay.

## Forms at their place, one Submit

17. **A meetup's Manage….** In the popup, in place of its post, not the side pane; the same in its line of the list and a phone card. Change the name and the end, Submit: the post comes back with both answers in its line. Submit with nothing changed: "Nothing changed." Nonsense in Ends after a new name: the form stays, says the name went through and why the end did not. A meetup from 6:00 to 7:00: `8pm` and `9pm` move both later, `4pm` and `5pm` both earlier, and `10-31 8pm` (a date to come) with `9pm` moves both to that evening. Nonsense in Starts with `9pm` in Ends: refused, and the end has not moved. `8pm` with `7:30pm`: refused, nothing changed. Moving both twice within three minutes works, each move one of `/meet`'s three. A refused Starts cleared by hand: Submit sends the rest. After a refusal Escape still cancels. Cancel puts the post back.
18. **A raid's Manage….** No Set buttons; Submit and Cancel. Fill in an end and a boss: both are done, one Submit. A refused one keeps the form, and what went through is not sent again. Pick a boss: the moves go off and empty, with the hint that the new boss's moves are set in Manage… afterwards; clear it and they are back. Press Manage… again after the boss changed: the new boss's moves.
19. **Meetup here.** In the gym's popup. Type a name, then "Pick again" (the button says "Pick on the map" only while no place is filled): the form goes to the side pane with the name kept, the popup closes, a pick fills the place. "New meetup" stays in the side pane.
20. **Field research.** "Report research here" in a stop's popup, and Report → Field research → a stop: the form in that popup, its search focused from Report. "Add stops…": the form goes to the side pane with the task kept, and taps add stops. "Same task at more stops…" opens in the side pane. A long task list scrolls inside the popup; try it on a phone card too.
21. **A popup closed under a form.** Open any of these in a popup, tap the map: the form goes with the popup and another form can open. Press Start or Make the meetup and close the popup before the answer: it is said in the band, nothing opens over the map, and a train has its first stop.

## Cleanup

12. Archive the trains made here.
