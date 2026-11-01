# Max battle screenshots: design

Status: agreed with Matt on 2026-10-22, reviewed (section 9). The follow-up "Screenshots of max battles" of
8X (`phase-0-follow-ups.md`, "From Phase 8X…"): what Pine does with a screenshot of a max battle.

## 1. What is there already

- **The reader** (merged 2026-10-22, 62fb3b9f and db1897c3; `docs/superpowers/ocr-improvements.md`)
  reads a max battle's screen as `ScreenText.max`: `form` (`dynamax` | `gigantamax`), `species`
  (as read, without the form), `powerSpot` (the Power Spot's name as read, in capitals, its line's
  confidence not kept yet), `box` (the boss's line; the heads are counted just above it). The
  countdown and the clock are read as on a raid screen. On the ten max screens of Matt's folders
  (`var/ocr/matt-2026-10-22-max`, `…-22b`) kind, species, Power Spot and heads are 10 of 10.
- **The report** (`screenshotReport`) makes no raid of a max screen: `not-a-raid-screen`, so every
  flow refuses it today.
- **`/max`** (8X-3, `src/commands/max/`) reports through `reportMaxAs` (shared with the map): one
  max battle per Power Spot (`maxAt`, `addMaxUnlessTaken`), the default end at the rotation's
  boundary or `settings.maxBattles.lastBattle` (21:00), refused after it, the ending-soon dialog;
  `/boss` changes a max battle's boss (`changeMaxBoss`), never between Dynamax and Gigantamax.

## 2. How a max screenshot reaches Pine

- **A mention and passive reading** tell the kind of screen by themselves: a max screen goes the
  max way, a raid screen the raid way, anything else is refused as today.
- **`/max screenshot:`**, a new attachment option. What is typed wins over what was read, as
  `/raid` does: `boss:` over the species and tier, `spot:` over the Power Spot, `end:` over the
  countdown. With `screenshot:` neither `boss:` nor `spot:` is required (today both are). New
  command options: the commands are deployed again.
- **`/raid screenshot:` given a max screen** is refused: "That's a max battle: use `/max
  screenshot:`, or post it with a mention." `/max screenshot:` given a raid screen is refused the
  other way round ("That's a raid: use `/raid screenshot:` …").

## 3. The Power Spot

- The name read is searched among the server's Power Spots (`PlaceFinder`, kind `powerspot`),
  fuzzy and without minding case or a lost space (`JUNIPER'SSWING CORNER`), the channel's region
  first.
- One clear match: the battle is there. Several: the member is asked which, a menu as the gym
  question of a raid screenshot (`gymCandidates`, `menuDescription`), and `withSpot(id)` decides
  again. None: refused, "I don't know a Power Spot called … here: use `/max spot:`". No pin is
  made from a screenshot (the screen has no place).
- **A Power Spot Pine is missing:** when the name was read surely (its line's confidence at least
  about 0.9, the reading keeps it) and no Power Spot is even a guess, the refusal adds "I've let
  the staff know Pine may be missing this Power Spot", and the moderators' channel
  (`settings.channels.moderation`) gets a note: "A screenshot in #<channel> showed the Power Spot
  "<name>", which Pine doesn't know. A new Wayspot export may be due (`/gym import`)." At most one
  note per name per server per seven days (a `BoundedMap` in memory: a restart may note a name
  once more). Without a moderators' channel, a log line only. A name read poorly gets no note.

## 4. The boss and its tier

- The species and the form are looked up in the max boss list (8X-2's, Gigantamax listed apart).
  A listed boss: its tier from the list; the heads only add a doubt when they disagree (as a
  raid's `heads-boss-conflict`).
- Not listed: the species (Pokémon search, any Pokémon the game master says can Dynamax or
  Gigantamax, as `/max` accepts it typed) with the tier from the heads: 1 to 5 heads Dynamax 1★
  to 5★, 6 heads Gigantamax (the form read must agree; it decides when the heads were not read).
  No species found, or neither tier nor form: asked as `/max` asks (`tier:`), or refused for a
  mention ("I couldn't tell which boss: use `/max`").

- **Eternamax** (Matt, 2026-10-22): Eternatus is the one boss of Eternamax battles, which are
  Gigantamax battles in all but the name (the same restrictions, a lobby of 100). 8X already lists
  it at tier `G` (`max-bosses.ts`, Pokebattler's `ETERNATUS_ETERNAMAX`) with its own picture. Here
  the reader takes "Eternamax" as the form (its own value `eternamax`, a Gigantamax battle for
  everything but the label). The label itself is 8X's, not this work's (Matt: separate from
  screenshots): "Eternamax" wherever 8X says "Gigantamax" for Eternatus (`maxBossTitle`,
  `maxBossChoiceName`, the post's heading and thread title), a follow-up for 8X's next small fix
  plan. Trains and lobbies treat it as Gigantamax.

## 5. The end, and when it is refused

- **The end is the screen's countdown** (the moment the screenshot was taken plus the countdown),
  capped at `lastBattle` (21:00). The countdown is the truth (Matt, 2026-10-22): during an event it
  ends at the rotation (say 15:00), outside events it runs to the small hours (about 04:59), which
  the cap makes 21:00. A screenshot is in this more exact than `/max`, which guesses the rotation.
- The moment the screenshot was taken is a raid screenshot's (`takenAtFromFileName`, the clock,
  else guessed from the upload); a moment that is not sure (guessed, or the file and the clock
  disagree) is used and said in the post as a raid's (`timeUncertain`) until `/end` confirms it. A
  sure moment (a dated file name or a clock read surely) is exact however old (8X-S prototype review, A5).
- **Refused:** taken at or after `lastBattle` ("Max battles are over for today: they can be fought
  from 06:00 to 21:00.", `/max`'s words: the game still shows the battle, but it cannot be fought
  before it goes); a countdown already over ("That battle has ended."); a countdown ending at or before
  `firstBattle` (06:00) ("That battle ends before max battles can be fought (06:00)": yesterday's
  battle seen in the small hours; the remaining time tells it from a new day's, which ends after
  06:00 and is accepted, capped at 21:00). Matt may look between 05:00 and 06:00 whether a new
  day's battles are already up.
- No ending-soon question for a screenshot: a countdown within five minutes of its end is reported
  as it is.
- An old Gigantamax screen shows its timer without hours (`16:57`), which the reader does not take
  as a countdown: the end is then `/max`'s default (the rotation or 21:00), the moment as above.

## 6. A battle already at the spot

- **The same boss:** the member joins it as their automatic status says, and the answer links the
  post, as a screenshot of an existing raid does.
- **Another boss, the screenshot clearly newer:** its moment is known (a clock read surely or a
  file name, never guessed) and later than when the post got its current boss. The boss is changed
  through `changeMaxBoss` (the rotation), the end becomes the screenshot's, and the post says
  "Boss changed to <boss> from a screenshot by <member>". The members stay signed up.
- **Another boss otherwise** (a guessed moment, or older than the post's boss): refused as `/max`
  refuses it, the post named and `/boss` suggested. A change between Dynamax and Gigantamax is
  refused even when newer (8X: the lobby size would jump): "report it anew".

## 7. The rest, as for raids

The screenshot is kept (`ScreenshotStore`) and copied to the review folder by the same rules;
`/read-screenshot` shows a max reading (form, species, Power Spot, heads, countdown, its end);
the throttles, guards and the forum bar (`maxBarred`) are `/max`'s; a member blocked from meetups
is not refused (no pin). A max battle's post has no "Screenshot feedback" button (8X's layout), so
feedback on a max screenshot is given through `/read-screenshot`. `ocr:review` counts max
screenshots apart.

## 8. Changes elsewhere

- The design of max battles (`2026-10-20-max-battles-design.md`, Q9) says the game's timer counts
  down to 21:00; it counts down to the rotation's end during events and to the small hours (about
  04:59) otherwise. Corrected with this work.
- The reader keeps the Power Spot line's confidence in `MaxText` (for section 3).

## 9. From the review (2026-10-22)

A fresh review read the design against the code. Its answers, taken where they follow the code
or the raid flow:

- **State, version 15.** `MaxDetails` gains `bossSince` (when the boss was set: at creation, by
  `/boss`, by a screenshot; versions 1–14 read it as `createdAt`), for section 6's "clearly newer",
  and `screenshot: { id, timeUncertain } | null` (as a raid's `raid.screenshot`), for section 5's
  uncertain time, for `inUse` keeping the screenshot while the battle lasts, and cleared by
  `/end` (`MaxChangeService.setEnd`).
- **One change in the store.** Section 6 is one new `MaxChangeService` method taking the boss, the
  end and the screenshot's moment, deciding inside one `PartyStore.update` under the spot's lock:
  the same boss joins, a newer screenshot changes boss and end together, anything else is refused
  (`reportMax`'s `taken`). `changeMaxBoss` answers an interaction and is not reused.
- **The Power Spot matcher** (section 3) is its own, over the server's Power Spot titles: letters
  and digits only (case, spaces and punctuation dropped, so `JUNIPER'SSWING CORNER` matches), a
  name cut short taken as a prefix. Clear: exactly one title matches so; otherwise every title at
  least 80% alike is offered in the menu. "Not even a guess" (the missing-spot note): no title 80%
  alike; the note's `BoundedMap` is keyed by the normalised name.
- **Another region:** as raids. A clear spot in the channel's own region is reported unasked;
  in another region a mention asks (the menu), `/max screenshot:` confirms as `/raid` does.
- **Typed values save an unusable screenshot** (`/max screenshot:` with `boss:` and `spot:`
  typed, the picture unreadable or the reader busy) as `/raid`'s `typedOnly` does, without the
  ending-soon question; a screen of the wrong kind is refused even then (the wrong picture). A
  typed `boss:` on no list without `tier:` takes the tier from the heads read, else `WHICH_TIER`.
- **Smaller:** the boss-change line names the member through `doer(party, member)` (anonymous
  reporters); `/max`'s throttle covers `/max screenshot:` only, mentions keep the per-image
  `screenshot` throttle; `/max screenshot:`'s private answer carries the feedback row
  (`feedbackRow`), as `/raid`'s does, since the post has no feedback button; the kept record gets
  a max shape (the spot picked as a Wayspot id, the max boss list as `bosses`); the cap at
  `lastBattle` is that of the day the screenshot was taken.

Matt's answers to the three that change what members see (2026-10-22):

- **A screenshot joining the same boss** moves the post's end only later, never earlier, and only
  on a clean read: the moment known (a clock read surely or a file name, never guessed) and a
  countdown that ends at a rotation (before `lastBattle` that day), not the all-day kind that runs
  to about 05:00 the next day. Otherwise the end stays as it is.
- **The other kind** (Gigantamax at a Dynamax battle's spot, or the reverse) is refused, the post
  named, without the `/boss` hint, as `/max` does. With battles reported to end at their rotation
  this should not happen.
- **Passive reading** never asks which Power Spot and never sends the moderators' note. When the
  spot is unclear or unknown it says so in its short public reply (as the passive reply of 7B,
  pinging the member and gone after `messageCleanupDelayError`): "I couldn't tell which Power Spot
  this is: use `/max screenshot:`". It may change a boss under section 6's rule, and its reply then
  says so.

## 10. Plan

One plan after 8X, about the size of 7B: the decision (a max outcome beside the raid's: report,
ask which spot, refuse with its reasons), `ScreenshotService`'s max path through `reportMaxAs` and
`changeMaxBoss`, `/max screenshot:`, `/raid`'s refusal, the missing-spot note, `/read-screenshot`'s
max reading, the texts, `ocr:review`. Prototyped and reviewed as usual; its staging needs max
battles on the test server's Power Spots and the commands deployed.
