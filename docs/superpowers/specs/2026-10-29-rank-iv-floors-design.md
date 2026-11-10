# `/rank`: the lowest IVs a Pokémon can have, by itself (2026-10-29)

Agreed with Matt on 2026-10-29, reviewed the same day. `/rank` has a `filter` option (a trade, a
raid or a lucky trade sets the lowest IVs) that the member must pick; nothing applies it when the
Pokémon itself rules low IVs out. pvpivs.com does, from hand-kept lists (mythicals from research
or raids at IV 10, legendaries at 1, shadow legendaries at 6) with lowest levels besides (15 for
research, 20 for raids, 8 for shadows), applied when a visitor picks a Pokémon on its page.

## What Pine does

When the member gives no `filter`, Pine takes the lowest IV from what the game master says of the
Pokémon, with no list kept by hand (Matt: "maintaining a table is a pain because it definitely
changes over time"). One pure function decides it, in this order:

1. **A shadow** (`shadow:` asked, and the Pokémon can be one, `entry.shadow`) that is legendary,
   mythical or an Ultra Beast: **6**. Shadow legendaries come from raids or Giovanni and cannot be
   traded (a shadow is traded only once purified, and is no shadow then). A shadow Darkrai is 6,
   not 10. A shadow ordinary Pokémon: 0.
2. **Untradable, its species untradable too**, and legendary or mythical: **10**. It cannot be
   traded, so it came from a raid, research or a max battle. Mew, Zarude, Deoxys and its forms,
   Darkrai, Diancie, Eternatus and Eternamax, every Zygarde form (Matt).
3. Anything else: **0**:
   - legendaries and Ultra Beasts (wild ones have come with none: GO Tour Johto's dogs, the
     Galarian birds from the daily incense; a good-friend trade's 1 is too thin to rest on, Matt);
   - tradable mythicals: Meltan and Melmetal (wild from the Mystery Box), Pecharunt;
   - fusions and form changes of a tradable species (Kyurem Black and White, Necrozma Dusk Mane,
     Dawn Wings and Ultra, Crowned Zacian and Zamazenta): untradable themselves, they keep the IVs
     of the Pokémon they were made from (Matt);
   - every ordinary Pokémon.

- A **mega** takes its species' floor (Mega Diancie 10, Mega Rayquaza none); no mega can be a
  shadow.
- **No lowest levels** (Matt): events have given Pokémon below their usual level (the Tour's wild
  dogs, the Galarian birds, research Regis, Meltan), and megas are scaled in any league. Leaving
  them out never drops a combination that can exist; Pine's links open pvpivs.com on the same
  combinations (below), so nothing imitates the site's levels.
- **IVs below the floor**: the Pokémon came some other way (a purified one, an event). Pine ranks
  it among all combinations and says so, never refuses.
- A **`filter`** the member gives wins, `None` included (`filter: None` ranks among all), and a
  picked filter still refuses IVs below it, as today.

## Where it comes from

- `GameData.untradable`: the catalogue keys of the entries whose game master item has no
  `isTradable` (each form by its own item; a mega by its species' NORMAL item, as megas are built
  from it), sorted. `GAME_DATA_VERSION` 9. `catalogue.isTradable(entry)`.
- A game master in which no item has `isTradable` (the field renamed) is a `game data warning`,
  and every entry is taken as tradable (never every mythical at 10), as the Dynamax check does.
- `PokemonEntry.class` (`legendary`, `mythical`, `ultra-beast`) and `PokemonEntry.shadow` exist.
- `src/domain/pvp/floors.ts` (pure): `rankedAsShadow(entry, asked)` (asked and `entry.shadow`) and
  `autoFloor(entry, { tradable, speciesTradable, asked })` → `{ floor, reason }` with
  `reason` `shadow` | `untradable` | `none`. Every caller (the command, the family, the head, the
  menu, the links) asks these two, never decides by itself.

## The `shadow` option

- `/rank`, `/little`, `/great`, `/ultra` and `/master` take `shadow:` (true or false, false unless
  given), after `evolutions`; its description and `/help`'s text say what it does.
- The **command alone** refuses `shadow: True` for a Pokémon that cannot be one, before ranking:
  "Mega Rayquaza has no shadow form in the game." A press (a league, the family, the menu) never
  refuses: a member that cannot be a shadow is ranked plainly under a shadow answer.
- It changes only the floor (a shadow's stat product is the same); the head says `Shadow Mewtwo
  10/12/13` where the Pokémon shown is ranked as a shadow; the family's lines and the menu's
  options say "Shadow" before each member ranked as one.

## The answer

- The small print (one text display with the 🔗 line) says the floor in force:
  - a picked filter as today (`-# Filter: Raid, egg or research (IVs from 10)`);
  - an automatic floor and its reason: `-# IVs from 10: Mew cannot be traded, so it came from a
    raid, research or a max battle.` / `-# IVs from 6: a shadow legendary comes from a raid or
    Giovanni.`;
  - the fallback: `-# Ranked among all IVs: 3/15/15 is below the 10 Pine assumes for Mew.`
- `RankView` carries the floor in force (its value and kind: picked, automatic with its reason,
  fallback); the renderer and the links use it. `IV_FLOORS` (the option's choices) is unchanged.
- Each family member is ranked with its own floor (its own automatic floor and fallback, or the
  picked filter for all).
- Every pvpivs.com link carries the floor the rank used and the levels, always: `&f=<n>&min=1` and
  `&max=<cap>` (51 too), since the site otherwise ranks by the floor and levels the visitor saved
  in their browser. A shadow answer's link says shadow (`IVs=a_d_s_true`).

## Custom ids

- The controls' state: `filter` is `IvFloor | 'auto'` (no filter picked: the floor is worked out
  again for the Pokémon a press shows), and a shadow flag:
  `rank:<key>:show:<league>:<a>-<d>-<s>:<filter|auto>:<0|1 family>:<0|1 shadow>`, the same for
  `pick`; the longest key (`zygarde_complete_fifty_percent`) with `ultra-friend` fits in 100.
- An id of today's form (no shadow part) reads its filter as picked (`none` is None) and no shadow,
  so a press on an old answer ranks as it showed.

## Tests (test-first)

- Parser: `GameData.untradable` over the sample, which gains DIANCIE (an untradable mythical with a
  mega), MELTAN, KYUREM (KYUREM tradable; KYUREM_BLACK and KYUREM_WHITE not) and ETERNATUS;
  `mew` is not in the sample, MEWTWO and DEOXYS are (Deoxys's four forms untradable, Mewtwo
  tradable); its sort; the version; the warning when no item has `isTradable`.
- `floors.ts`: Mew, Zarude, Diancie, Mega Diancie, Eternatus, Zygarde 10; Meltan, Melmetal,
  Pecharunt, Mewtwo, Dialga, Nihilego, Kyurem Black, Crowned Zacian 0; shadow Mewtwo 6, shadow
  Darkrai 6, a shadow ordinary Pokémon 0; `rankedAsShadow` false for a mega.
- `/rank`: Mew without a filter of 216 with its small print; Mew 3/15/15 of 4,096 with the
  fallback's sentence; `filter: None` Mew of 4,096; a picked filter still refuses; `shadow: True`
  Mewtwo of 1,000, head "Shadow"; `shadow: True` for a mega refused by the command; a family pick
  of a mega under shadow ranks it plainly; a family member's own fallback (Diancie 3/15/15 beside
  Mega Diancie); links with `f=0`, `min=1`, `max=` and `_true`; a press keeps `auto` and the
  shadow flag; an old id reads as picked; the longest key's ids fit; `/help` within its
  paragraphs' length.
