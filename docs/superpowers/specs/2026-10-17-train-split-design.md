# Splitting a group off a raid train (plan 8T)

Matt, 2026-10-17. Mockup: `.superpowers/sdd/2026-10-17-phase-8t-train-split/split-v1.html` (sections 1 and 2) and `split-v2.html` (section 3), git-ignored; approved in chat.

## Why

A raid train keeps all its groups at one stop: one route, one current stop (`trains.md`). Matt does not want per-group positions. The usual case: a few players are faster than the main group and would rather keep moving than wait. Today they must `/route save`, start a train of their own and `/route load` it. Instead they form a group of their own in the train's post (often before the train starts, labelled e.g. "Fast"), and when the main group holds them back, or right away, they **split** it off: the group becomes a train of its own with the same route, and they move at their own pace.

## Goals

- One action turns a group of a train into a new train in the same forum, carrying the route and everything else the train had arranged, with that group's members signed up there as they were.
- Both posts say, in their small print, where the other train is, as a link to its post.
- The members who moved are pinged in the new post, so they know to use it rather than the old one.
- Hard to do by mistake: a private "are you sure?" step every time.

## Non-goals

- Per-group positions on one train (Matt: separate trains instead).
- Merging two trains back together.
- Splitting raids or meetups (a meetup has one group; a raid's groups share one gym and boss and have no reason to split).
- Splitting from the live map (8M-5). It may follow in a later plan (Matt's call). So that it is easy then (the web session's advice, 2026-10-17): one function shaped like `train-changes.ts`'s `*As`, e.g. `splitGroupAs(ctx, { party, member, group, …drawn })`, doing the service call and answering the command's words (a refusal without Discord objects); "who may" as a pure domain check beside `mayNotArrange` (e.g. `mayNotSplit`); the store refusing a stale group with a reason (e.g. `group-changed`) that a web route could map to 409. `/group split` and the post's controls both call it, each in its own throttle window. Nothing under `src/web/` changes in this plan: the map redraws from its polls, and its drawn state (stop list, current stop, conductor seen) is checked inside the store, so a split that moves the conductor answers the map's `conductor-changed` as designed (web session, 2026-10-17).

## Anti-goals

- A public one-click split in the post: the post's button only opens the private confirmation.
- Splitting that loses or duplicates a member: everyone of the group ends up in exactly one of the two trains, whatever happens in between (a press, a leave, the clock).
- A post over Discord's limits: the worst case is 38 of 40 components today (five groups, the longest route, picture); the new button makes 39.

## Who may split

- The train has two groups or more (otherwise there is nothing to split from; refused).
- The **conductor** may split off any group.
- A **member of the group** (signed up in it, any status) may split their own group off, unless the conductor is in that group (then only the conductor and staff may).
- With no conductor, any member of the group may.
- **Staff** (`isStaff`) may split any group (Claude's call).
- A train that has ended, or whose group is gone by the time of the press, is refused with the usual words.

## Where

- **In the post:** a grey `✂️ Split group…` button in the row of "Move train…" and "Whole route", only while the train has two groups or more (not on copies in other regions, like "Move train…": the layout's `move: false` covers it, Claude's call). It is a party control (`party:<id>:split`), with the party controls' guards and `ACTION_THROTTLE`. Anybody may press it; it answers privately: the confirmation when the presser may split at least one group, otherwise why not.
- **As a command:** `/group split letter:<group>` in the post, beside `/group join`, `new`, `label`; autocomplete offers only the groups the member may split. It answers with the same private confirmation.

## The confirmation (private, mockup section 2)

Replaced by a dialog (plan 8T-H, Matt, 2026-10-18): `2026-10-18-train-split-dialog-design.md`. What follows is the confirmation as 8T built it.

One components-v2 message (`v2.ts`), like the Move train panel:

- `### Split a group off the train`
- "Group **B (Fast)** leaves **Saturday Loop** and becomes a train of its own, **Saturday Loop (Fast)**:" then what that means: the same route, at the same stop (`stop 3 of 7: <gym>`, or "not started" / no route as the train is), the same end mode, boss and start; who moves (the group's members by name, cut to fit); who will be the conductor of each train.
- A menu of the groups only when the presser may split more than one (the command's letter, or the only group, is the default).
- `✂️ Split it off` (danger style) and `Cancel`.
- Its controls carry what the confirmation was drawn from (at least the group, and enough of the train's state that a stale press is refused, as the panel's do), and a press on a train that changed in a way that matters (the group gone, the train ended, the presser no longer allowed) is refused with the reason and the confirmation drawn anew or closed. Whether membership changes since drawing matter is the builder's call: the members who are in the group **at the moment of the split** move.

## The new train

- Name: `<old name> (<group label>)`, or `<old name> (<letter>)` when the group has no label; cut to the name's limit.
- Same server, region and forum; same route (through the functions of `train.ts`, never built by hand), current stop, `finishedFrom`, `atEnd`, boss, start time, end time, description and anything else of `timed` the train has. A split before the train started keeps the planned route and start.
- One group (A), with the old group's label and meeting time if it had one (a train's groups have none: `party-wide-start`).
- Members: everyone of the group as they are (status, +1s, remote, team, name), and nobody else; their history on the new train starts at the split (see Data). They leave the old train.
- Conductor: the old train's conductor when they were in the group (the old train then has none); otherwise the presser when they are in the group and their privacy is not Anonymous; otherwise none (staff or the conductor splitting a group they are not in, or an Anonymous presser: as a `/train` made anonymously, the new train has none until `/conductor set`, and anyone signed up may move it). Claude's call; the Anonymous case Matt's ruling after the staging run (2026-10-17). The confirmation says so ("it has no conductor").
- Maker: the presser (`makerName` theirs). With the presser not signed up in the group (staff, or the conductor of the old train), the new train still names them as maker in "Created by" (Claude's call; anonymous privacy honoured as for `/train`).
- No new-train DMs to wanters (the people in it already know; Matt agreed). Region copies, access grants and the summary follow as for any new train.

## The old train

- Loses that group and its members; its other groups keep their letters (Claude's call: renaming groups would confuse who is where). If the group that new sign-ups land in (the newest) was the one split off, the newest remaining group takes over.
- Keeps its route, stop, mode and times. Keeps its conductor unless they left with the group.

## Linking the two (mockup section 3, draft 2)

- The old post's small print: `Group B (Fast) went its own way: <link to the new post>`, one line per split; a train may be split more than once, so the lines are listed newest first and cut with "…and N more" like other lists (Claude's call on the cap).
- The new post's small print: `Split off from <link to the old post>`.
- The links stay after either train ends (the archived post is still there).
- A line in each thread says who did it, without a second link: old `Dawn split group B (Fast) off into a train of its own.`, new `Dawn split this train off with group B (Fast).` The doer is named through `doer` / `memberText` as the other lines.
- The new post pings the members who moved (Matt: "so they know to interact with it instead of the original"), once, as the train's movement message does: `withMentions`, honouring each member's `mentions` setting (Claude's call), never the presser.

## Data

- **Party state document version 11**: a train keeps `splitFrom` (the other party's id and post id) and `splitOff` (a list of `{ partyId, postId, group label or letter }`, bounded). Version 10 is read with neither. 8S-1 does not change the version (checked 2026-10-17 against `proto-8s1`).
- **Party history** (Matt, 2026-10-17: each train records what happened on it): each train is recorded on its own, nothing is moved between records.
  - The old train keeps the group's members as its attendees up to the split, with their times and how far they got there. They leave it at the split by a step of a new kind (`split`, not `left`), so they count as attendees but not as `departed`; their `status` at the end is null as for one who left, and `leftAt` is the split's time. Its stops up to the split stay its own, and so do its counts (`ending` `completed` when anybody was at the train before or after).
  - The new train's history starts at the split: its members sign up then (`signedUpAt`, and `joinedAt` / `hereAt` at the split for those coming or here), its first stop is where it was split (arrived at the split's time, or at its start when split before it started), its `createdAt` the split's time.
  - A member who rode both is counted in both: that is what happened.
  - The new train's record names the party it was split from (`PartyHistory.splitFromId`, nullable, the `partyId` of the old train, no foreign key; a migration that adds a column, additive). It is only a link: it takes nothing from the other record. Migration number: the next free one when this plan merges (8S-1 holds 019; the 8M session takes none; tell the 8S and 8M sessions).

## Atomicity (constraint, approach left to the builder)

Two parties change: the new one is created and gets its post, the old one loses a group. The store changes one party at a time. The builder chooses the order and the take-back, as `PartyService.relocate` does for a raid moving region (new party first, `takeBack` when the old change fails). What must hold: nobody is in both trains or in neither once it settles; the old train is never left without its post; a failure leaves the old train as it was and no stray new post. Plan 8T-F writes both trains in one transaction (`PartyStore.updateBoth`): the old train's loss of the group and the new train's carry-over commit together, so the only recovery left is taking back a new post whose split never committed.

## Constraints

- CLAUDE.md's conventions: domain pure (`src/domain/party/`), changes through `PartyStore.update`, custom ids through `custom-id.ts`, private answers as components-v2, `UserError` for refusals, text through `plain()` / `memberText`.
- The post's worst case with the button stays sendable with every copy (`expectSendable`).
- Never contact Discord while building; staging only with Matt.

## Left to the builder

- Module layout (a pure `splitTrain` in `train.ts` or a file of its own; a `TrainService.split` or `PartyService` method).
- The exact words of refusals and of the help texts (`/help group split`).
- The confirmation's custom ids and what state they carry.

## Claude's calls, for Matt to check

1. Staff may always split.
2. Conductor of the new train: the old conductor if they went with the group, else the presser if in the group, else none.
3. The old train keeps its group letters (B gone leaves A, C).
4. The button is not on copies in other regions.
5. The move ping honours members' `mentions` setting.
6. Several splits of one train each get a line in its small print, newest first.
