# Forms in the side pane (plan 8M-22)

Agreed with Matt on 2026-11-18. It replaces the rule of 2026-10-30 ("if a form can be anchored to a place, it is"; web.md, "Where a form is").

## Why

A research report at a stop on a phone held upright: the stop had no report yet, so it opened as a plain Leaflet popup (`places-ui.ts:231`; plain places never open as the phone card). "Report research here" drew the form inside that popup, about 400 px wide and capped at `popupMaxHeight`. The task list is a scroll box of its own (`.task-list`, `max-height: 40vh`, `map.css:3577`) inside the scrolling popup: two scroll bars to reach the reward ("one of Drampa, Duraludon"), then the map had to be panned to reach Report. Matt: "UI consistency is why I think we actually want it for _anything_."

## The rule

1. **Once a place is picked, every form opens in one place of its own:** on a wide screen (768 px and up) the side pane's box; narrower, the bottom card (`.party-card`, up to 85vh, one scroll). The popup or card of the place it was opened from closes; the form's heading names the place ("Report field research · East Fountain").
2. **Which forms** (the inventory of 2026-11-18, every form that opens from a popup, the card or a line of the list):
   - reports: raid, max battle (at a Power Spot and at a pin), spawn (at a place and at a point), Team GO Rocket, field research, Same task at more stops…, a new meetup, a new train;
   - the post's forms: a raid's Manage… / Set time…, Group…, Meet…, Delete…, Report… (to moderators), a train's Move…, Manage… and Split…, a meetup's Manage….
   - Questions that come up inside a form move with it: Rocket's hideout question, research's contradiction question.
3. **Stay where they are:** Take back's question on a stop report (one line, Yes/No, about the report beside it: moving it would hide what is taken back) and the note box "This is done in the post on Discord." (a notice, nothing sent). Any other one-line confirmation found while building is listed in the plan, not decided quietly.
4. **A form that needs the map** ("Add stops…", a meetup's "Pick on the map", route mode, step 2 of the Report button): on a wide screen it is in the side pane already and stays there; on a phone it moves from the card to the side pane docked under the map (`body.form-docked`, as today) while the map is needed, and back into the card when that ends ("Done adding", a place picked), with what was typed. Route mode and step 2 have no card part: they stay docked as today.
5. **Already in the pane, unchanged in place:** step 2 of the Report button, Your regions…, the route editor. They get the pinned row (below) where they have a sending button.

## The form's frame

6. **The buttons are pinned** to the bottom of the side pane or the card; the form scrolls above them, one scroll only. The row: **[Report] [Cancel] ← Another …** as today (sending button first, left-aligned), then the **missing line**, small muted text right of the buttons, wrapping below them where the row is too narrow. The buttons never move with the line's text.
7. **Report is off until the page's check passes.** Each form's pure check (`researchBody`, `reportBody`, `maxBody`, `spawnBody`, `rocketBody`, `startBody`, `newMeetupBody`, `meetupChangeBody`, `regroupBody`, `meetBody`, `closeBody`, `moveBody`, `manageBody`, `splitBody`; for a raid's change form `changesAsked`, empty → "Nothing changed yet.") runs on every input and change, and its `text` is the missing line; no text, the line is empty and Report is on. The same function still answers the press, so nothing is checked twice.
   - Off is `aria-disabled="true"` with the look of off, not `disabled`: the button keeps the focus and a press says the missing line (the shake of a refusal), so a keyboard or screen-reader user learns why. The line is `aria-live="polite"`.
   - The server's own refusals (a raid's time out of range, a boss no longer listed) still come after the press, said as today.
   - A form with no check (Report… to moderators, whose server refuses only whitespace) keeps Report on; the line stays empty.
   - "Sending…" keeps every control off as today (`offWhileSending`).
8. **Field research's task list folds** once a task is picked: the chosen task (and its version) in one line with "Change", which opens the list again. The list itself no longer has its own `max-height`: it scrolls with the form. This is the root of the two scroll bars and is done whatever the form's place.

## The parts it touches

- `form-home.ts`: `formHome` opens in the pane (wide) or the form card (phone), never in an anchor box; the anchor is kept only to give the focus back to the control on Cancel (`liveControl`). `toPane` becomes the phone's hop to the docked pane and a new `toCard` the way back.
- Raid (`raid-ui.ts`), max (`max-ui.ts`), spawn (`spawn-ui.ts`), Rocket (`rocket-ui.ts`), the post's forms (`post-forms-ui.ts`) and a meetup's Manage… (`meetup-ui.ts`) move from `hold.take(formPlace(box))` to `formHome`. Research, a new meetup and a new train already use it.
- `phone-card.ts`: a form mode of the card, opened over whatever the card showed (also from a plain popup), always whole, no summary; the hold's claim is `inCard`. The card's × and Escape are the form's Cancel; a swipe down does not close a form (a slip of the finger would lose what was typed).
- `form-buttons.ts`: the pinned row and the missing line, built once for every form (`formRow(send, cancel, extras, missing)`), and the wiring of each form's check to its fields' input events.
- `map.css`: the pane's and the card's form layout (a column whose body scrolls and whose row does not), the missing line, `aria-disabled` buttons, `.task-list` without its own scroll; the `place-control` hiding rules for a form in a popup go.
- Plain popups (`places-ui.ts`, `gyms-ui.ts`) keep their buttons; a form opened from them closes them. Whether they open as the card on a phone is not part of this plan (question for Matt, below).
- `FormHold`: `formPlace` keeps `'card'` and `false`; `true` (a form in a Leaflet popup) has no caller left but the spawn's and max's popups at a point, which become a pin drawn on the map with the form in the pane or card.
- The tours (`tour.ts`) point at no form or popup; they are unchanged and checked once on the built page.
- No server route, no migration, no command change.

## Tests

- Pure: the row (`form-buttons`), each check's missing line, the task list's fold, `afterSwipe` in form mode.
- The isolated tests that draw a form inside a popup or card (party-layer-draw ~15–20, form-home 6, raid-ui 10, post-forms-ui 10, meetup-ui ~8, train-ui ~6, party-layer 1, spawn-ui 1) are rewritten to the pane and the form card; a test per kind that its form opens in the pane on a wide screen and in the card on a phone, the popup closed, Cancel giving the focus back to its control.
- `npm run check`, `npm run web:build`, then a look at the built page at desktop and phone width (no Discord: the page's tests and a local static check only; staging waits for Matt).

## Decided after the review (2026-11-18)

The fresh review's points the builder decides, taken as recommended:

- **The claim:** a pane form takes the aside claim (`take(false, true)`); a card form takes `'card'`, never aside, so `form-docked` stays off. The list goes on being drawn under a pane form, so a party may end while its form is open: the server's 409 `gone` is said and nothing ended is reopened. A list turning read-only leaves an open form alone; the server refuses and the read-only line is said.
- **The hop's order:** `toPane` moves the claim to aside before anything closes the card; `toCard` takes `'card'` only after `card.open` (whose `onClose` for a new key runs `cardClosed`). A test each way.
- **The card in form mode:** the handle is hidden; the focus goes to the form's heading on opening; the card is named by the form's heading (`named()`); × and Escape (also with the focus on ×) go through the form's Cancel.
- **Off, not disabled:** Report is `aria-disabled`; every Submit handler returns early on it (a `click()` passes through `aria-disabled`); `formKeys`' Enter treats it as off; after sending, the check runs again. Max's `pinRefused` comes under the rule, its missing line pointing to "← Pick a Power Spot".
- **One line under a form:** the missing line is the form's `.form-answer` line; the check writes it on input; a server refusal stays until the next input. It is not `aria-live`: Report names it with `aria-describedby`, so it is read when Report gets the focus; a press on an off Report says it once (cleared, then written on the next frame, as the regions box does).
- **The checks:** raid's `reportBody` (raid-forms.ts) and the moderators' `reportBody` (post-forms.ts, no check) are told apart; a meetup's Manage… is off with "Nothing changed yet." as a raid's is; research says "Loading…" with Report off until its lists come; max's "battle ends soon" question moves with its form.
- **Step 3 of the Report button** opens the form straight in the pane or card, without opening the place's popup first.
- **The phone keyboard:** the card's height in `dvh` with `visualViewport` where the keyboard covers it; checked on a phone at Matt's staging.
- **The row's layout:** while a form shows, `#parties` does not scroll; the form's body does, the row below it stays; the row stays inside the form element (`formKeys`, `addPickAgain`). The route editor's Done is its sending button.
- **The place under the heading:** a post form's title stays Discord's dialog title (`manage-match.test.ts`); the place is a line of its own under it; with several stops, the first stop and "+2".
- **Dead code goes:** `inPopup`, `popupClosed`, `fit`, `keepingFocus`, `heldContent` under pane forms and the `place-control` rules, where nothing uses them any more.
- **A window resized across 768 px** with a form open closes nothing: the form stays where it opened until it closes.
- **The task list's fold:** "Change" opens the list with the focus on its search field; on `list-changed` the list opens again, the version picked where the new lists have it.
- **The plan is 8M-22** (8M-21 names Manage… on Discord). web.md's rules rewritten with it: "Where a form is", "Field research's form", the post's forms, the raid form's hold, the phone card "not under a form", S16, step 2's step 3.

## Matt's rulings (2026-11-18, "Yes, all four")

1. **Cancel goes back to where you were.** Wide: the place's popup opens again, the focus on the control that opened the form. Phone: the card shows what it showed before (the form a layer over its content), the focus on that control; a form opened from a plain popup opens that popup again. A success opens the post as today (`openNext` / `openPopup`), so its answer lands in the post's answer line; a party that ended meanwhile is not reopened. A form opened by the Report button's step 3 gives the focus back to the Report button.
2. **Only Cancel, × and Escape close a form in the card**, all three as its Cancel. A tap on the map does nothing while a form is in the card; a tap on another marker, a second long press, or anything else that would open a popup or the card says "Close the form that is open first." (`FORM_OPEN`) and opens nothing. Every UI's `closePopup` dependency leaves a card holding a form alone.
3. **The spawn and max forms at a point** have step 2's pin (`report-pin`) at the point, fixed while the form is open and taken away when it closes; their `where` is read once at opening. On a phone the map pans the point clear above the card (as `card.height` panning does today).
4. **Plain places on a phone stay Leaflet popups** (they hold only buttons now). Opening them as the card is left for later (follow-ups).
