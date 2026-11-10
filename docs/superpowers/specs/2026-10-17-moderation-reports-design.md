# Reports to the moderators and the places' list: design (plan 8S-2)

Brainstormed with Matt on 2026-10-17, after 8S-1 (meetup safety) was merged and staged and 8M-5M (meetups from the web map) was merged. It replaces the short "8S-2" section of `2026-10-17-meetup-safety-design.md`, which named a Report button and `/admin places` (now `/places`, below). The conventions of what 8S-1 built are in `docs/architecture/meetup-safety.md`.

## Why

A member who sees something wrong on the server needs a way to tell the moderators. That might be a meetup at what looks like a private home, a duplicate raid, or a hurtful message. The moderators then review it and decide whether to act (Matt). Today the only way is a member's `/delete`. It writes "X asks for this raid to be deleted" and the reason into the party's own post, where everybody reads it, and it pings the staff roles once. Nothing is recorded and there is nothing to press: a moderator has to notice the ping and run `/delete` themselves.

8S-1 gave the server a moderators' channel (`settings.channels.moderation`) with posts that carry buttons and survive a restart. 8S-2 sends members' reports through it as well, for every kind of party and for single messages.

The moderators also need to look up a place's ruling. The common case (Matt) is a member who hears "A meetup can't be held there" and asks a moderator why: the moderator must find the ruling and be able to undo it. The member also deserves a way to get the moderators' attention for a refused place, but not right after it was refused.

## Goals

- One private way for a member to report a party (raid, train or meetup) or a single message to the moderators, with a reason, from a phone or a computer.
- Moderators act on a report from its post: they close or delete the party, or delete the message. For a meetup they can also refuse the place for good or block the maker.
- A moderator can look up any place's ruling, see everything open (requests, asks, blocks, appeals, reports), and undo or lift from there.
- A member can ask the moderators to allow a refused place, once the place has been refused for a while.
- Two leftovers of 8S-1: Block member on a request that was refused or has expired, and the gym's official name in the moderators' post.

## Non-goals and anti-goals

- **No new buttons on party posts.** The bottom row is already full on a phone (8D-G). Reports go through a command and Discord's Apps menu.
- **No moderation of members beyond meetups.** Timeout, kick and ban are Discord's own tools. The moderators' post names the author as a link to their profile, and that is enough (Matt).
- **No public trace of a report.** When the moderators' channel exists, nothing appears in the party's post and no role is pinged. That would accuse a maker in front of everyone before a moderator has looked.
- **No outcome sent to the reporter.** The reporter is told only that their report was sent. Asking about a refused place is different: the member asked for a decision and gets it by DM, as with a block appeal.
- **Raids and trains never lead to a ruling.** Closing a reported raid or train ends that one party. Its gym or route is never refused for good (Matt).
- **No `/abuse` alias.** One command name is enough, and "abuse" accuses before anyone has looked.

## Matt's decisions

### Reporting

- **`/report`** replaces the member side of `/delete`. It works for every party kind, inside the party's post, and asks why in a form, as `/delete` asks today.
- **"Report to moderators"** is a message command in Discord's Apps menu (right-click, or a long press on a phone). It decides what to report from the message it was used on:
  - **A party's post, a copy of it in another channel, or its link line in the region channel:** the party report, the same as `/report`.
  - **Any other message**, including a member's chat inside a party's post: a report of that message alone. The moderators' post shows who wrote it, in which channel and when, and a jump link. It keeps a copy of the text and the names of any attachments, so the moderators still see what was said once the message is deleted. It has the buttons **Delete message** and **Dismiss**.
- **`/delete` is for staff only.** It is hidden from members in the command list and in `/help`, which tells anyone looking for it to use `/report`. Staff rarely need it once reports reach the channel.
- **Closing a party from a report or by `/delete` offers a choice:** archive the post (as `/delete` does today), or delete the forum post entirely. The latter is for something nobody should keep reading, such as a meetup at a home address.
- **A party report's buttons:**
  - A raid or train: **Close…** and **Dismiss**.
  - A meetup: **Close…**, **Refuse place…** (a gym or PokéStop only, never a pin), **Block maker…** and **Dismiss**.
  - Matt's rule from the 8S spec stands: a reported place that is refused is refused for good. "For good" means a lasting ruling, not a one-off (Matt, after the builder check). It is the same ruling as Refuse from now on: members may ask about it after 14 days (below), and moderators may allow it or undo it.
- **Without a moderators' channel:** `/report` and the Apps-menu entry on a party do what a member's `/delete` does today (the public line and the ping). A report of a message is refused ("This server has no moderators' channel.").

### Asking the moderators about a refused place

- **Who and when:** "A meetup can't be held there." gets an **Ask the moderators** button once the place's refusal is 14 days old (Matt asked for "a week or two"; 14 is Claude's suggestion, which Matt accepted). The days are counted per place, from the refusal or from the last Keep refused, not per member, so a group cannot take turns asking.
- **The form and the post:** the button opens a form ("Why should meetups be allowed here?"). The ask goes to the moderators' channel with:
  - the place;
  - its ruling: who refused it, when, and from which request or report;
  - the member's words;
  - **Allow place** and **Keep refused**.
- **One at a time:** one ask is open per place. Other members are told it is with the moderators already.
- **The outcome:** the member who asked is told by DM. An ask nobody answers expires after seven days, as an appeal does.
- **A blocked member:** is refused by their block before the place is looked at, so they cannot ask.

### `/places` (staff)

- **Visibility (Matt, after the builder check):** `/places` is a command of its own, not under `/admin`. It and the staff-only `/delete` are hidden from members by **Manage Messages** (`default_member_permissions`), not Manage Server as `/admin`, `/gym` and `/region` are, so moderators without Manage Server still see them. Inside, the bot checks staff as everywhere else (`requireManagement`: admins, moderators, the owner). A server can change who sees either command in Server Settings → Integrations. The guides say so.

- **With a place (`/places place:<name>`):** found with the same search and autocomplete as `/meetup near:`. It shows the place's ruling (allowed or refused for good), who made it, when, and the post it came from, with **Undo ruling**. Undoing puts the place back under the name check. The member who asked is not told: the moderator tells them.
- **Without a place:** sections of refused places, allowed places, pending requests, open asks about places, blocked members, open appeals and open reports, paged with arrows when long. Each entry links to its post in the moderators' channel, where its buttons are. Blocked members also get **Lift block** in the list.

## What the reporter and the moderators see

- **The reporter:** gets a private "Sent to the moderators." A second report of the same party or message by the same member answers that they already reported it.
- **Several reporters:** reports of the same party or message gather on one moderators' post while it is open, each reason with its reporter. The post is edited for each new one; it is not sent again.
- **Once decided:** the post shows who decided what and when, and loses its buttons.
- **A party that ends first:** when the party ends by itself (clock, its maker, a move, `/delete`), the post says so and loses its buttons.
- **A message deleted first:** when the message is already gone at Delete message, the post says so and the report is settled.

## Constraints

- CLAUDE.md applies throughout:
  - components-v2 messages;
  - custom ids through `custom-id.ts`, each control with its own guards and throttle;
  - `DmSender` for every DM;
  - repositories own column names;
  - additive migrations, numbered with the next free number at merge (021 is 8M-5M's; ask the other sessions before numbering);
  - members' words shown through `plain()`, and through `plainNoLinks` in DMs;
  - members named with `memberText` and its kin.
- Reports, asks and their posts live in the database and survive a restart, as 8S-1's requests do. A press on an old post after a restart works, and the first press wins.
- The moderators' channel is the same `settings.channels.moderation`. Its name is the server's choice (`meetup-review` on the test server).
- The bot must not need a privileged intent. Discord sends a message command's target message, text included, with the interaction.
- Deleting a member's message needs Manage Messages in its channel. Deleting a forum post needs Manage Threads. Where the bot lacks one, the button says so ("I can't delete messages in #channel; delete it yourself.") and the report stays open. `cutover-check` warns about these permissions in the forums and region channels and does not fail.
- Rehearsal mode: every post of the moderators' channel from this work goes through meetup safety's rehearsal gateway, as requests and appeals do.
- Never contact Discord without Matt's go-ahead. The new commands need `npm run deploy-commands -- --global` at staging.
- 8T-F (a train split as one transaction) is in progress in another session and changes `PartyStore` and `PartyStorage`. Prototype from a tip that has it if it has merged by then, and rebase otherwise.

## Calls left to the builder (Claude's, not Matt's)

- **Who may report:**
  - Any member who can use commands where the party or message is.
  - Staff may use `/report` too (to hand something to the other moderators).
  - A maker may report their own party.
  - The Apps-menu entry is offered in servers only.
- **Limits:**
  - One report per member per party or message.
  - A throttle per member for reports (five an hour); a guard's refusal does not count.
  - Reasons are required and at most 1,000 characters.
  - An ask about a place has the appeal's throttle.
- **Ending a party from a report:** every action that ends the reported party (Close…, Refuse place…, Block maker…) first asks the moderator privately "Archive the post or delete it?". Then:
  - **Archive:** `PartyService.end` with the moderators' line, as `/delete` today.
  - **Delete:** the same end, then the forum post itself is deleted instead of archived.
  - **Both:** the party history records the end as `/delete` does (`cancelled`).
  - **Block maker:** closes the maker's other meetups archived, as 8S-1 does.
  - **Refuse place:** refuses the place for good, as Refuse from now on does.
  - **Staff `/delete`:** asks the same private question.
- **What the Apps-menu entry does with the bot's own messages:**
  - A party's post, copy or link line: that party.
  - The moderators' posts, DMs, answers and every other message of the bot: "Nothing to report there."
  - A message in a thread or forum post: reported as a message, with the party named when the thread is a party's post.
- **The copy of a reported message:** its text, cut to fit the post, through `plain()`; the names of its attachments (not the files: Discord removes a deleted message's files); its author, channel and time.
- **Storage:** a report table (kind party or message, server, the target, status, the post) and a table of its reasons (reporter, name, text, time), unique per report and reporter. Asks about places as a table of their own, or as 8S-1's appeals with a kind: whichever reads more simply. One migration.
- **Expiry:**
  - An open party report ends with its party.
  - An open message report stays open until decided (the list in `/places` shows it).
  - Asks about places expire after seven days, in the same sweep as appeals.
- **Block member on a decided request (8S-1 review W7):** a request that was refused or has expired keeps a Block member button while its maker is not blocked. Pressing it blocks as from a pending request and edits the post.
- **The official name:** the moderators' post of a request, a report and an ask shows a gym's official name beside its nickname when the two differ ("Plaza Fountain (gym; officially Frog Fountain)", or as reads best).
- **Lift block from the list:** lifts as an appeal's Lift block does, and DMs the member that they can create meetups again.
- **Undo ruling:** removes the ruling row, logged with the moderator. It sends no DM.
- **The message command in the framework:** Pine has none yet. The router, `src/commands/index.ts` (or a list beside it), the deploy script and `/help` gain message commands, documented in `discord-framework.md`. `/help` lists "Report to moderators" under its name.
- **Documentation:**
  - `meetup-safety.md` gains reports, asks and `/places`, or a new `moderation.md` takes the reports, whichever reads better.
  - `/help` for `/report`, `/delete` and `/places`.
  - The guides and announcements: members report with `/report`, `/delete` is staff only.
  - A staging checklist.

## Open for later

- Withdrawing a pending meetup request (8S-1 follow-up), and a member withdrawing a report.
- Whether the party history should record that a party was reported or closed by the moderators.
- A setting for the 14 days, if a server wants another wait.
