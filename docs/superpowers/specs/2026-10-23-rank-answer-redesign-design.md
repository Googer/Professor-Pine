# `/rank`'s answer, redesigned (2026-10-23)

Agreed with Matt on 2026-10-23 from the mockups in
`2026-10-23-rank-answer-mockups.html` (panels A, A2, B, C and E2, with the "🧬 Family" toggle).
It follows the `/rank` fixes of the same day (follow-ups, "From the /rank fixes"): the ranks are
pvpivs.com's, Super Megas are ranked up to the levels they add, the links name pvpivs.com's
Pokémon.

## What the answer shows

One components-v2 message, its colour by the share of the best stat product as today.

1. **Head** (a section, the picture beside it): `### <name> <a>/<d>/<s>`, then the league's icon
   and name (`<:leagueultra:…> Ultra League`, the plain name where the emoji is missing), then
   `**Rank N** of 4,096 · P%` (or "Too strong for … already at level 1").
2. **Levels**: one text display per level cap shown (50, and 51, Super Mega's 52 and 53 by
   today's rules). The heading line ends in a link to that ranking on pvpivs.com, written in the
   text: `**Up to level 51 (best buddy)** · rank 214 · 95.98% · [🔗](<url>)`. A link in the text
   costs no component (a link button beside the block would cost two). The CP line and the best
   combination as today.
3. **Family** (when shown; the section's heading is "Family", the word pvpivs.com uses):
   - **A, while it fits**: each member a section with its picture beside it (a member without a
     picture: a text display alone). Its text: `▸ **Mega Malamar** · rank 280 · 95.44%` (▸ only
     on the Pokémon shown), then in small print its CP at its level and the other levels'
     ranks where they differ from its level 50 rank (`-# 3436 CP at level 50 · best buddy: rank
     214 · Super Mega: 217, with best buddy: 229`).
   - **B, when A would pass Discord's 40 components**: the members as one text display, one line
     each (`▸ **Eevee** · rank 1,255 · 86.74% · best buddy: 1,234`), fitted with `fitItems` as
     today; only the head keeps a picture. The choice is made by counting the built message
     (`countComponents`), never by naming a Pokémon: today only Eevee's line (nine) needs B.
   - A Pokémon alone in its family says "<name> does not evolve." as today.
4. **Small print**: `-# 🔗 opens that ranking on pvpivs.com`, and the filter line when there is
   one.
5. **Buttons**, one row: the four leagues as their icons alone (Little Cup, Great, Ultra,
   Master; the shown one pressed and disabled as today; a league whose emoji is missing shows
   its word), then the toggle `🧬 Family`: blue (Primary) while the family is shown, grey
   (Secondary) while it is hidden, the same words either way.
6. **"Show another of the family…"**: a select menu on a row of its own whenever the family has
   more than one member, shown or hidden (Matt: it costs little). Each option is a member: its
   name, and `Rank N · P%` as its description; no option its default, so the closed menu shows its placeholder (Matt, after the staging). Picking one
   draws the answer for that Pokémon with the same IVs, league, filter and family state.

The answer's buttons and menu answer as the buttons do today (`pressAnswer`: the member who
asked changes the answer for everybody, anybody else gets a private copy), with the same
throttle and no guard of the PvP channel.

## Custom ids

- The buttons keep `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>`.
- The menu: `rank:<key>:pick:<league>:<a>-<d>-<s>:<filter>:<0|1>`, the picked value a catalogue
  key. `rankControls.select` reads it, checks that the picked Pokémon is in the family of `<key>`
  (else the stale-control answer), and answers as a button press would for that key.

## Pictures

- A Pokémon's picture is `pokemonPicture` as today. A **mega** whose icon PokeMiners' icon list
  lacks (13 of 61 on 2026-10-23: Mega Malamar, Mega Mewtwo X and Y, Mega Dragonite, …) shows its
  portrait from PokeMiners' `Images/Mega Portraits 512x512` folder, whose file list is read with
  the icons' (a new setting `settings.gameData.megaPortraitsUrl`, with a default, so no settings
  file needs it; the address of a portrait is `raw.githubusercontent.com/…/<file>`). A file name
  in neither list is never guessed. Leek Duck's CDN has icons for the 13 too, but Mega Malamar's
  is a poor render: the portrait it is.
- Everywhere `pokemonPicture` is used, a mega gains its portrait the same way (raid posts of a
  mega boss take the feed's picture first, as today).

## League icons

Four application emoji from PokeMiners' `Images/Combat`: `GBL_littlecup.png`,
`pogo_great_league.png`, `pogo_ultra_league.png`, `pogo_master_league.png`, named `leaguelittle`,
`leaguegreat`, `leagueultra`, `leaguemaster`, uploaded by `npm run emoji:upload` (Matt runs it
with `--apply`; production's application needs them at the cutover: the runbook's emoji step
covers it). Found through `ctx.emoji` like the type icons; missing ones fall back to words.

## The family's members (a fix found while designing)

`catalogue.evolutionLine` makes Burmy's family 8: Burmy's three cloaks are entries of kind
`form` with Burmy's stats that each evolve into their Wormadam, so each became a first stage. A
form that only changes the look (kind `form`, the same stats and types as its species' entry of
the same Pokédex number) is **folded into its species** (Matt, 2026-10-23), both ways: as a
parent its evolutions count as the species', and an evolution into it is an evolution into its
species. Burmy's family is then Burmy, the three Wormadam (their stats differ), Mothim;
Shellos and Gastrodon's East and West Sea are Shellos → Gastrodon; Flabébé's colours one
Flabébé; Deerling's seasons, Scatterbug's patterns likewise. Asked by such a form's key, the family is its species' family as it stands (the species listed, ▸ on it: `catalogue.familyMember`). Every
member of a family has the same family (one set from any member), which the menu's check relies
on.

## Settled after the review (2026-10-23)

- **Emoji refused on a button**: these are the first answers with custom emoji on buttons. When
  Discord refuses the message for an emoji (`refusedPart(err) === 'emoji'`), the answer calls
  `ApplicationEmoji.refused()` and is sent once more with the leagues' words, as posts recover.
  The finder's emoji text (`<:leagueultra:id>`) is turned into a button's `{ id, name }`.
- **Portraits**: the file of a mega's portrait is its icon candidate with `.portrait.png` in place
  of `.icon.png` (`pm687.fMEGA.portrait.png`). Served from a constant beside `POKEMON_ICON_BASE`,
  `https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Mega%20Portraits%20512x512/`
  (the space encoded). The portrait names travel inside `PokemonIcons` (one object, saved with the
  icons in the game data cache), so every path that carries the icons (raid, max and party posts,
  `/counters`) gets them, resolved in `iconAddress`. Read from `settings.gameData.megaPortraitsUrl`
  (a default in the schema; a settings file without it loads, tested). A failed or cut-short
  portrait listing never empties the icon list, nor the reverse; the "icons owed" retry covers
  both; every caller that builds the game data service passes the setting.
- **League emoji**: `LEAGUE_ICON_NAMES` beside the other game icon names, sources from the pinned
  pogo_assets commit (checked to have them, else the pin moves), within `MAX_ICON_BYTES`;
  `cutover-check` then expects them; utilities.md's list of names grows.
- **Cost**: a menu option's description is the member's level 50 rank and share (`Rank N · P%`,
  "Too strong for this league" where it cannot be in it), so a hidden family costs one ranking per
  member; `SpreadMemo` keeps 200 rankings instead of 50.
- **A or B**: B when A passes 40 components **or** the text budget. "Family" is a text display of
  its own; the filter shares the small print's text display with the 🔗 line. B's text budget
  counts the level headings' links. The small print's 🔗 line is left out when nothing is ranked
  (too strong already at level 1).
- **The menu**: options are plain names (no markdown escapes: a menu shows none), at most 100
  characters, at most 25 options (no family has more than 25: tested over the whole game data).
  The select takes exactly one value; a value that is not a key of the family answers as a stale
  control; an answer whose `<key>` is gone answers as the buttons do today. A member who is not
  the asker gets a private copy; their client may keep showing their pick in the public menu until
  it is redrawn (Discord's behaviour, accepted; a staging step).
- **Custom ids**: the longest key (`zygarde_complete_fifty_percent`) leaves `pick` ids about 65
  characters; `encodeCustomIdIfFits` stays. When one does not fit, the answer has no buttons and
  no menu (the links are in the text).
- **Words**: the slash option keeps its name `evolutions` (typed commands keep working), its
  description and `/help`'s text say "family"; 🧬 is the toggle button's `emoji`, not in its label.

## Tests (test-first)

- The layout: head with the league's emoji (and its word without it); a level heading with its
  masked link; the small print line; A's member sections with pictures and ▸; B when A passes 40,
  made from a long line in a test (not by Eevee's name), and Eevee's answer within 40.
- The buttons: icon-only leagues (words without emoji), the toggle's style in both states, the
  menu with its options and default, present with the family hidden, absent for a Pokémon alone.
- The menu's select: the asker's answer changes; another member gets a private copy; a value
  outside the family is refused as stale.
- Pictures: a mega in the icon list keeps its icon; a mega only in the portraits list gets the
  portrait; one in neither gets none.
- Burmy's family is five; Gastrodon East is in Shellos → Gastrodon; for every entry of the game
  data every member of its family has the same family, and no family has more than 25.
- A deleted league emoji: the answer is sent again with words and `refused()` is called.
- The portraits: the listing read, saved and loaded with the icons; one listing failing leaves the
  other; the portrait address encoded; a raid post of a portrait-only mega gets its picture.
- The settings default; `iconSources()` and `cutover-check` with the league names; the longest
  key's `pick` id fits; a select with a value outside the family; A at exactly 40 with a filter;
  the small print without the 🔗 line when nothing is ranked.
- `expectV2Sendable` for every shape (A with four levels and three members, B, the family hidden).
