# Max battles: preliminary plan (not designed, not scheduled)

Matt, 2026-10-17. A record of where the conversation got to, to start the design from when max battle support is taken up. Nothing here is approved for building: the design (brainstorming, mockups, a spec) comes first, as for every plan.

## Why

Max battles (Dynamax and Gigantamax) are a kind of battle Pine does not organise yet. Matt sees them as a party kind very like raids and raid trains: the main differences are the bosses and the point of interest they happen at (Power Spots instead of gyms). Raid trains are possible for every type: conventional raids, Dynamax and Gigantamax.

## What Matt said

- A max battle is like a raid; a max battle train is like a raid train whose stops are Power Spots.
- Pine knows a lobby size for every kind of battle: conventional raids 20 (so today's raid trains too), Dynamax 4, Gigantamax 100 (raised by Niantic from 40). Several groups will be common for Dynamax, rare for Gigantamax.
- Multi-group support (below) is built as part of max battle support, not before.

## How groups work: option (d)

Considered (2026-10-17): (a) all groups in one post, today's design; (b) a main post with the later groups split off into posts of their own; (c) an index post that every group, the first included, splits off from. Chosen as the direction: **(d), which builds on (a)**:

1. **A lobby cap per kind of battle**, a setting rather than a constant (Niantic changes it). Join puts a member in the first group with room and opens a new group when every group is full. A cap Pine never reaches in practice (20 for a raid group) changes nothing.
2. **Groups chosen from one menu** once there are more than two or three: a single select menu (up to 25 options, one component) instead of a Join button per group, so the post's limit of about five groups (components, `MAX_COMPONENTS`) no longer bounds the number of groups. Each group shows as one line (letter, label, time, members against the cap, "3/4"), names folded as 8D-F does.
3. **A group ping**: an action that pings only the members of one's own group, for the cross-group noise that made separate posts tempting.
4. **Splitting stays the way groups go separate**: 8T's split for trains whose groups move at their own pace; a max battle train splits the same way.

Each piece stands alone; the cap and the menu matter only once Dynamax arrives, and the group ping would help today's multi-group raids too.

Why not separate posts per group, (b) or (c): moving between groups would mean moving between posts (today one press); a Dynamax day could put eight posts in the forum for one Power Spot; raids are one per gym and boss (`raidAt`), which sibling posts would have to work around (duplicate check, moves, boss and time changes, screenshots, history). Separate posts pay off only when groups really separate, which the split covers.

## What the legacy data says

The legacy bot's parties (about 186,000, 2018 to 2026; counted from a copy of production's `parties/` folder, 2026-10-17): parties with two groups or more were EX raids 25% (458 of 1,841, up to five groups), tier 5 0.9%, tier 4 0.4%, mega 0.1%, elite none; nearly all in 2018 and 2019, none since 2022; raid trains 1 of 11 (too few to say anything). Matt's experience on trains: groups moving at slightly different paces got confusing, which is what the split (8T) is for.

## What it touches (for the design to work out)

- **A battle kind on raids and trains**: conventional, Dynamax, Gigantamax; bosses per kind (the boss feed, `/raid` and the map's boss choice), the lobby cap from it.
- **Power Spots as places**: found already. The Wayfarer userscript exports them (`kind: powerspot`, `wayfarer.md`), `/gym import` keeps them in `Wayspot` (plan 8W-2), and `WayspotDirectory.near(point, metres, kinds)` and `PlaceFinder` find them (meetups near a power spot, plan 8D); the dev database holds 906 (2026-10-17, beside 1,793 PokéStops and 293 gyms). What is missing is a party and stops (routes, the map, the Whole route, saved routes, stop search) that can point at a Power Spot, not only a gym id. A train's movement, Next, conductor and split work on stops, whatever they are.
- **Attendance**: the cap in Join and in `newGroup`; what happens when a member with +1s does not fit a group's room.
- **The post**: the group menu and one-line groups; the worst case with the most groups within `MAX_COMPONENTS` and every copy.
- **Notifications, the history and the map** for the new kind.

## Open questions

- **Which Power Spots are active.** Matt, 2026-10-17: they rotate more or less nightly; Wayfarer's data has it, but querying it that often is not practical. Campfire is current (likely the same source, queried natively by Niantic's app), but whether it can be integrated is unknown (no public interface is known). A direction to weigh in the design: Pine need not know which are active; a member who reports a max battle at a Power Spot says it is active, as a raid report says a raid is there, and the post could let others say "not here today". Every kept Power Spot stays a possible place, and a saved route keeps its Power Spots whether active tonight or not.
- **The cap counts +1s and remote players** (Matt, 2026-10-17), as the game's lobby does. Max battles can be joined remotely (Matt). A member with +1s who does not fit a group's room is a sizing question for every kind (raids and Gigantamax too, where it rarely comes up), so it is decided once for all of them. **Decided (Matt, 2026-10-17):** Join puts the member with all their +1s in the first group with room for them all, else opens a new group (a member and their +1s are never cut across groups by Pine); a member may still pick a fuller group themself, and the group then shows as over its cap ("5/4") rather than refusing them. Over its cap is a sign that somebody else in the group should move to another group (the post could say so beside the group).
