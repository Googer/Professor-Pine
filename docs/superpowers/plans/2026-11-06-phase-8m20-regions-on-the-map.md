# Phase 8M-20: Your Regions on the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matt's idea (2026-11-05, follow-ups "Hidden regions follow the map's rule"): the Region outlines show a member which regions they see on Discord (solid), which only the map shows them (dashed) and which they are kept out of (fainter dashes); "Your regions…" in the menu under their name joins or leaves the self-assigned roles that open regions, through the service `/iam` uses.

- **Task 1, one rule:** `viewsWith(channel, member, roleIds)` in the gateway mirrors discord.js's `memberPermissions` over any set of roles (owner, base permissions, Administrator, @everyone's, the roles', the member's own overwrite); `memberAccess` decides `visible` through it; `PartyGateway.memberGates(guild, member, gates, fresh)` answers held roles, access, `seesWith` and `denials`.
- **Task 2, the view:** `GET /s/<guild>/api/regions/mine` (members; the member the directory's paced look left in the cache): per region with an outline (`hasOutline`, shared with `/api/geo`) its state, Join where only the map shows it (a roster role that opens it, with what `planChange` would also open or give back), Leave for every held takeable role that opens it (whether it closes the region, what else keeps it open); kept out only by an own denial of View Channel or a denying role that is not self-assignable; `readOnly` while Discord cannot be asked; access only with the roles feature off.
- **Task 3, join and leave:** `POST /s/<guild>/api/regions/<id>/join|leave` `{ role }`: address limit and `postGuard`, `actingOnTheMap` (its member now with `roleIds` and `fetchedAt`), a fresh re-check (403 kept out, 409 visible or no longer opening), the throttle shared with the role menus, `selfRoles.change`; `/iam`'s words (`gaveWords`, `tookWords`) through `pageWords`; after a change the member fetched fresh, `PartyViewers.forget` (stamped), the new view, and `AccessService.memberChanged` so a party's forum stays open after a Leave.
- **Task 4, the page:** outline styles (restyled on theme change and after a press), the "Your regions…" box in the side pane (opened from the account menu, rows updated in place with a live line, focus kept, Escape and the popup/card/sheet rules of Report, hover and tap highlight), asked again when the list comes back live.
- **Task 5, words and docs:** `/help iam` and `/help iamnot`, the tour's step "Choosing Your Regions" (waiting up to 3 s for the view), `web.md`, `members-and-roles.md`, `parties-and-posts.md`, `testing.md`, the follow-ups' "From Phase 8M-20".

**Brief:** `.superpowers/sdd/8m-20-regions-on-the-map/brief.md` (review R1–R15 and rulings; Matt's questions Q1–Q4 ruled by the reviewer's recommendation, in the follow-ups for his objection), `round1.md` (A1–A8, B1–B13).

**Every diff in this plan was run before the plan was written** (throwaway branch `proto-8m20`, one commit per task on main-dev `8d5d2716`; each commit passed both typechecks, prettier, eslint and its tests).

**Conventions:** `CLAUDE.md`, `docs/architecture/web.md`, `members-and-roles.md`, `parties-and-posts.md`, `testing.md`. Work in `var/wt-8m20` on `regions-on-the-map`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8m-20-regions-on-the-map/tasks/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `4542e362` | 8M-20 T1: viewsWith and the gateway's memberGates |
| 2 | `d2562d33` | 8M-20 T2: the view of a member's regions on the map |
| 3 | `aee3e632` | 8M-20 T3: joining and leaving a region's role on the map |
| 4 | `c649dab3` | 8M-20 T4: Your regions on the map's page |
| 5 | `4fd32cc1` | 8M-20 T5: words, the tour's step and the docs of Your regions |

After task 5, `git diff 4fd32cc1 HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update` (`npm run web:build` is part of the image's build), no migration, no deploy. Googer and Tester; the test server's region roles as self-assigned roles (`/admin self-roles`), some regions hidden from @everyone and opened by a role. The steps are in the follow-ups, "From Phase 8M-20".
