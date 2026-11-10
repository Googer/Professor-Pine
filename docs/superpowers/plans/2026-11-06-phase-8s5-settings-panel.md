# Phase 8S-5: One /settings Panel, and the Words of Settings and Stats: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matt, 2026-11-06: `/settings` takes no options and answers privately with one components-v2 panel that changes in place, in place of eleven subcommands and `/settings show`; the words of `/settings` and `/stats` get the readability pass `/help` got.

- **Task 1, the panel:** every setting's line with its control. The four pings share a row of buttons carrying name and state ("Shouts: on"); the boss and new-train DMs, the history and the boards have a button beside them; the status and the privacy a menu (the stored option marked `default`); the Pokebattler id "Change…", a dialog with the saved id in it, checked in the handler's guard before it counts; the wants and gyms counts a Show that answers apart with exactly what `/wants` and `/targets` answer. Every control sets a state (`settings:<x>:set:on|off`), never toggles what it reads; a press re-reads, writes, redraws with a line of what changed ("That was on already." when nothing did). In a DM the panel leaves out what is set per server and says so in one line. The old subcommands go; a client that still sends one opens the panel (`formerSubcommands`). `settingsLines` stays one function for the panel and `/admin member-settings`. The fullest panel is 36 components.
- **Task 2, history off asks first:** "Turn off…" counts, in time, the records that name the member (`namedIn`, the opt-out's own count query, one path) and whether they are on the boards; where it takes something away, the dialog "Turn your history off" ("This takes your Discord id off N records (they still count) and takes you off the boards. Submit turns it off."), otherwise off at once. The Submit counts 5 in 10 minutes (`HISTORY_OFF_THROTTLE`); every other control the panel's one write window.
- **Task 3, nothing names a former subcommand:** the DMs' Stop answers, `/counters`, `/train`'s help and note, the boards' line, `/stats me` without the history, the card's Share refused, the web's history page; words the web serves too say "in /settings on Discord" (`IN_SETTINGS_ON_DISCORD`). `src/text-settings.test.ts` refuses a former subcommand anywhere in the sources (migrations excepted). `/help settings` carries the history's disclosure.
- **Task 4, `/stats`' words:** description and help in short paragraphs; "Nothing of yours is in my history for 2026."; "Your history, all time" / "History of **Ash** in 2026"; "Bosses beaten most"; the Share refusals and note shorter. On the web the page and its account-menu item are "Your history".
- **Task 5, docs.**

**Tech stack:** TypeScript 6.0, discord.js 14, Kysely, MySQL 8.4, Vitest.

**Brief:** `.superpowers/sdd/8s-5-settings-panel/brief.md` (its review S1–S22 and the rulings). Reviews: `review-a.md`, `review-b.md` there; every changed text, before and after: `words-before-after.md` there.

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8s5`, one commit per task, rebased onto main-dev `23fe588e`. Every commit passed the typecheck and its own tests. On the tip before the rebase (only two docs' paragraphs changed in it), the full check (12,425), the build's typecheck and the web build, and the database suite (736) pass.

**Reviews (Opus):**
- **The brief** (S1–S22): the history-off question a dialog (the house rule for a question asked once), asked only when it takes something away; set-state controls, never toggles; Show after `/wants`' and `/targets`' guards, answered apart; slow writes acknowledged first; the Pokebattler dialog; one count path (`namedIn`); the web's words without a panel; one write window; the component count; `settingsLines` shared; everything that named the old subcommands; the words pass.
- **The prototype in two halves.** Mechanics (A1–A7, Minor): the Pokebattler Submit validated in the guard so a refused one costs nothing and opening the dialog counts nothing; a dialog without its field `STALE_COMPONENT`; three accepted races documented; tests. Words (B1–B14): every suggested wording taken.
- **The re-review of the fixes** (R1, R2 Minor): the history-on sentence; "Discord id", not "name", for what the opt-out removes, since "Name on reports and trains" is the privacy line.

**Conventions:** `CLAUDE.md`, `docs/architecture/discord-framework.md`, `members-and-roles.md`, `history.md`, `testing.md`. Work in `var/wt-8s5` on `settings-panel`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8s-5-settings-panel/tasks/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `840b6019` | 8S-5 task 1: /settings is one private panel that changes in place |
| 2 | `28f133c3` | 8S-5 task 2: turning the history off asks first, in a dialog |
| 3 | `70bbd001` | 8S-5 task 3: nothing names a subcommand /settings had |
| 4 | `30eaf742` | 8S-5 task 4: the words of /stats, and "Your history" on the web |
| 5 | `787c15ad` | 8S-5 task 5: docs of the /settings panel |

After task 5, `git diff 787c15ad HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update` and **the global deploy** (`sh ~/pine-dev.sh deploy-commands --global`: `/settings` loses its subcommands). No migration. Googer and Tester.

1. `/settings` in a server: one private panel, every line with its state; the four pings' row; the DMs, history and boards buttons; the status and privacy menus with the stored option marked; "Pokebattler user id: none" and "Change…"; Wants and Gyms with Show.
2. Each control: the line changes in place with a line of what changed; pressing a state already set says "That was on already."; the status and privacy menus; the Pokebattler dialog with a valid id, an empty one (cleared), and "abc" (refused, nothing counted).
3. Show of Wants and of Gyms answers apart, exactly as `/wants` and `/targets` do.
4. History off for a member with records: the dialog with the count; Cancel changes nothing; Submit turns it off and says how many records it took the id off; boards off with it. History off for a member with none: off at once. Boards on while history is off: both on.
5. `/settings` in a DM with the bot: the panel without the server's lines, and the one line saying they are set per server.
6. If Discord still delivers an old subcommand from a client that has not reloaded, it opens the panel (Discord may refuse it first: then nothing to check).
7. `/stats me` with the history off (the short words), with nothing in a year ("Nothing of yours is in my history for 2026."), and the card's title "Your history, …"; Share's title "History of …".
8. `/help settings` and `/help stats`: short paragraphs, the history's disclosure; the web's account menu and page say "Your history".
9. `/admin member-settings` on Tester: the same lines, neutral words.
