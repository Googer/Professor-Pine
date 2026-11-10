# Phase 8R-4 staging checklist: want enhancements (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Design:** `docs/superpowers/specs/2026-10-22-costume-form-wants-design.md` and its mockups.
- **Plan:** `2026-10-22-phase-8r4-want-enhancements.md` (its head lists the rulings).
- **Conventions:** `docs/architecture/notifications-and-dms.md`.

Staged together with 8R-1, 8R-2 and 8R-3. Their checklists run first, or alongside: `/want`'s steps there are the 8R-1 dialog, which this plan replaces, so read them against this one.

## Before

1. The dev database gets migration 030, which adds the `costumed` columns. It needs 8X-F's 029, already merged.
   - Check `npm run migrate` or the first start's log.
   - Note it in `var/stage/TEST-SERVER-STATE.md`.
2. **The game data's version is 7.** The first start downloads the game master again, and a failed download refuses the start. Watch the log for the download and the costume count.
3. **Deploy the commands** (`/want`'s option is optional now; `/unwant` gains "Team GO Rocket"), in a cmd terminal:

   ```bash
   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
   ```

4. The events feed is read at start, and so are the Leek Duck pages of global events that are on (the log names them). An event with costumed spawns should be on, or about to start: Halloween 2026 Part I runs 2026-10-27 to 11-01.

## The dialog

5. **Pikachu, a first want:** `/want pikachu` outside any post.
   - The dialog is "Pikachu: what for?" with no box ticked, and Submit is refused until one is.
   - The Costumes checkbox reads "Only costumed Pikachu". There is no Which field: Pikachu has one entry.
   - Tick Research and Costumed, then Submit. The answer reads "Costumed Pikachu: Research".
6. **Reopening:** `/want pikachu` again. Remove now shows, and Research and Costumed are ticked as stored. Discord's client must not bring back other values (the per-open token): untick in one opening, cancel, then open again.
7. **Corsola:** `/want corsola`.
   - Which Corsola shows both forms ticked, and the field is required on a first want.
   - Untick Corsola, keep Galarian, tick Spawns, Submit. `/wants` reads "Corsola (Galarian): Spawns".
   - `/unwant galarian corsola` while holding the species row says the species covers it.
8. **Charizard:** Which shows Charizard, Mega Charizard X and Mega Charizard Y. Five fields in all (the text, Tell me about, Which, Costumes, Remove).
   - Tick Spawns only with a mega ticked: the answer says the mega is raids only.
   - Tick every form, Raids and Costumed (W1): a Mega Charizard raid still DMs (staff `/admin boss` or the boss list).
9. **Arceus:** Which is a dropdown of 18 forms. Pick 17: `/wants` says "Arceus (17 of 18 forms)". There is no Research box (a mythical), and no Tell me about field if only Raids can happen.
10. **Mew:** `/want mew` writes at once, with no dialog.
11. **Unown:** `/want unown` has no Which field. `/want unown a` opens a dialog of its own for that letter.
12. **Untick everything** on a held want with Remove shown, then Submit. The want is gone, boxes the dialog didn't show included (W6: the empty checkbox group must arrive as no values, not as an error).
13. **The Remove checkbox** on a held want removes every row of the species.

## `/want` in a post

14. In a raid's post, `/want` with nothing typed gives that boss's dialog with only Raids ticked.
    - A shadow raid's post ticks Shadow.
    - An egg's post opens the tier's dialog.
    - A max battle's post ticks Dynamax or Gigantamax.
15. In a region channel, `/want` alone answers "Name a Pokémon …". Ten of those in a row are not throttled, while real uses still are.

## Change…

16. **A DM with Change…:**
    - Report a spawn or research that Tester wants. Tester's DM has Change… instead of Stop, after the text, named "Costumed Pikachu · Research" or alike.
    - Press it: the dialog for that server.
    - Submit: the button turns to a disabled Changed, and the answer follows below. With Remove ticked it reads Removed.
    - Two reasons of one species in one DM share one button.
17. Change… on a DM whose want Tester has since removed answers privately "… is not on your list". It never writes.
18. **`/wants`:**
    - The order: Pokémon A–Z, then Tier 5 raids, then Team GO Rocket, then items, Perfect IVs, Zero IVs.
    - Change… on a line opens its dialog. Submit updates the list in place with the answer as a note.
    - Remove on an IV line stays one press. Remove all… is unchanged.

## Team GO Rocket

19. `/want rocket` and `/want water grunt` open the Team GO Rocket dialog: Grunts as a dropdown of 20, Leaders as checkboxes, Remove when held.
    - Pick Water and Fire grunts, Arlo and Giovanni. `/wants` reads "Team GO Rocket: Fire and Water grunts, Arlo, Giovanni" with Change….
    - A grunt DM's Change… opens the same dialog.
    - Nothing picked, submitted on a first want, says "Nothing picked".
    - `/unwant` "Team GO Rocket" removes them all.

## Costumes

20. **Costumed raids:**
    - With a costumed boss on the list (Leek Duck's raid list, or staff `/admin boss` with a costume id), a Costumed Pikachu want gets the raid DM.
    - A plain Pikachu raid sends no DM to a costumed-only want.
    - A plain Pikachu want gets both.
21. **Costumed research:** a costumed reward on the task list (a "wearing" name or picture) fires Costumed Pikachu, and a plain reward doesn't.
22. **Costumed spawns:** while a global event that lists a costumed spawn is on:
    - `/wild zubat` says "Reported: a wild costumed Zubat", and so do the message's heading and the DM.
    - Outside such an event it is plain.
    - A city event (Wild Area: Sendai) never counts.

## After

23. Note the results in the follow-ups file, under "From the staging run of 8R-…".
