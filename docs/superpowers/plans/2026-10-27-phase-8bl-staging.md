# Phase 8B-L staging checklist: raid bosses from Leek Duck's raid manifest (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

**Run 2026-10-27/28:** every step passes (step 5 as Googer; the gap at 20:00 and the change at 06:00 both seen). Results: follow-ups, "From the staging run of 8R-9H and 8B-L".

- **Finding:** B1 of the staging of 8R-9F (follow-ups, "From the staging run of 8R-9F and 8R-9G"): the 1-star list stayed the Palkia week's dragons after Halloween Part I had begun at 10:00 local.
- **Conventions:** `docs/architecture/utilities.md`, "Leek Duck's raid rotations".
- **Accounts:** Googer (owner, staff) and Tester (a member).
- **When:** steps 4 and 5 need a local rotation change (a rotation starting or ending at a local hour, usually 10:00 or 06:00 on a Tuesday or Wednesday, or a Raid Day's start and end); `npm run raid-bosses:check` names the next one.

No command or option changed: no deploy. No migration. The stage settings need no change (`raidBosses.manifestUrl` has its default); step 7 changes them for the run only.

## Before the bot

1. **The check script.** `npm run raid-bosses:check` prints `Source: Leek Duck's raid manifest, https://leekduck.com/raids/manifest.json`, the rotations in force with their local start and end (`settings.timezone` of `data/settings.json`), a shadow rotation among them marked "(shadow)", and `Next change:` with a local time; then the list. The list's tiers are the ones Leek Duck's Raid Bosses page shows when its rotation picker is on the current rotation (not the page as first served, which may be a rotation behind). `npm run raid-bosses:check -- --fallback` prints ScrapedDuck's list, `Source: the fallback feed (--fallback)`.

## The bot

2. **The source line.** Start the bot with the stage settings (the usual command, a new `bot-N.log`). Within a minute of the start (the first read of a run is at once, whatever the stored list's age) the log has one information line `raid bosses read from Leek Duck's raid manifest` with the `rotations` titles; the reads after it add no such line.
3. **The list.** `/boss-tier` (or `/admin boss list` as Googer) shows the bosses of step 1, the shadow bosses among them.
4. **At the next rotation change.** Leave the bot running over the next change of step 1 (`Next change:`: the start of the next rotation, or the end of a rotation another overlaps; a rotation's end that only opens a gap is no change, since its bosses are kept until the next rotation starts, for 24 hours at most). Within a minute of it the log has `raid bosses updated` with the bosses that came and went, and `/admin boss list` shows the new rotation's bosses (with `announceChanges` on, the bot-updates channel says so too). No second source line.
   - **Over a gap** (a rotation ending in the evening, the next starting the next morning, as Halloween Part I at 20:00 and the Giratina week at 06:00): just after the end, `npm run raid-bosses:check` lists the ended rotation as "ended, kept until the next of its kind starts", the source is still the manifest, and the bot's log has no fallback line and no `raid bosses updated`.
5. **A costumed boss by screenshot.** While a rotation with a costumed 1-star boss is in force (Halloween's Pikachu wearing a hat and capelet, or the next costumed one), as Tester post a screenshot of that T1 raid with a mention of the bot in a region channel: the raid is reported with its boss (not a bossless "Level 1" raid), the costumed picture in the post when the game data knows the costume. Without such a rotation on the day, `/raid` of the costumed boss by name in T1 is offered from the list instead; note which was run.

## The fallback

6. **A bad manifest address.** Stop the bot. In `var/stage/settings.json` set `"manifestUrl": "https://leekduck.com/raids/no-such-manifest.json"` in `raidBosses`, and start the bot. At the first read (at once at the start) the log has `raid bosses read from the fallback feed` with a `reason` naming the manifest and 404, and the list is ScrapedDuck's (step 1's `--fallback` list). Later reads add no such line.
7. **Back.** Stop the bot, take the `manifestUrl` line out again, start it: at the next read the log says `raid bosses read from Leek Duck's raid manifest` once more, and the list is step 1's.
