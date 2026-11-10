# 8Q: the one-shot questions as dialogs

Follows 8T-H (`2026-10-18-train-split-dialog-design.md`), which turned the train split's private confirmation into a Discord dialog (modal). Matt, 2026-10-18, after a sweep of the 28 private replies with controls: "8T-H first, then all the small / good candidates" (follow-ups, "From the staging run of 8T and 8T-F"); and, going to bed: go ahead "including implementing, not just planning". He was asleep while this design was written: the calls marked **(my call)** are Claude's, for Matt to check in the morning.

## Why

A private "are you sure?" reply lands under everything else in a busy channel or post, and has to be scrolled to; a member can open several. A dialog opens over the channel at once, one at a time, and closes when answered. These six questions are each asked once, are quick to put together, and do not follow a form, so they fit a dialog.

## The six

1. **Remove all…** under `/wants` and `/targets`, and `/unwant-all`, `/untarget-all` (`src/commands/notifications/remove-all.ts`).
2. **Staff's `/delete`** (`src/commands/parties/delete.ts`, `removalQuestion` in `src/render/moderation.ts`).
3. **Close…, Refuse place… and Block maker…** on the moderators' report post (`src/components/moderation-reports.ts`).
4. **Deleting a gym**: Delete… on `/gym show`, and `/gym delete` (`src/commands/gyms/delete.ts`).
5. **`/region remove`** (`src/commands/regions/remove.ts`).
6. **`/location` moving a raid to another region** (`src/commands/raids/location.ts`).

## Rules for all six

- **The dialog is the first answer.** A command that declares `defer` for its question loses it (the router must not defer before `showModal`); a control does not defer before it either. What the question needs from the database (a count, the references of a gym, a report) is read first, as now; these are single indexed reads.
- **A slow read (my call):** if what the question needs is not read within 2 seconds, the dialog is not opened and the member is told privately `That took me too long to look up: try again in a moment.` (Discord gives three seconds for the first answer; a late `showModal` fails for good.) One shared helper, used by all six.
- **The title** says the act (at most 45 characters, Discord's limit); **the text** is today's question, word for word where it fits, without the buttons' words; the dialog's text ends with what Submit does when the act has no choice (`Submit removes them.`, as 8T-H's `Submit splits it off.`).
- **A choice** between two ways (archive or delete a post, keep or delete a forum) is a required radio group with **nothing picked** (my call, as 8T-H: Submit never does the harsher one by default); each choice's description says what it does. When only one way is possible (the bot may not delete there, the member lacks the permission, rehearsal mode), there is no choice: the text says which way it goes and why the other is not offered.
- **Cancel** is Discord's: the dialog closes, nothing is said, nothing changes. The "Keep it", "Keep them", "Cancel" buttons and texts like `Nothing was removed.`/`The gym was kept.` on Cancel go.
- **After Submit** the answer is private: deferred (`deferReply` ephemeral), then today's outcome text (`Removed 12 entries: …`, `Deleted …`, the refusals); everything is decided again at Submit as it is decided at the press today (the gym, the region, the report's status, the party, permissions). Where today's answer replaces the question in place, it is now that private reply.
- **What the dialog carries:** the ids it needs in its custom id (the party, the gym, the region, the report, which list) through `src/discord/custom-id.ts`. The pending-request tokens of these questions go where the dialog makes them unneeded (a dialog is the asker's alone and is submitted once); the builder keeps one where a value does not fit 100 characters or must not be shown (my call).
- **Throttles and guards** as today: opening counts as the question did, Submit as the confirming press did; guards run on both (a dialog may be submitted after a role was taken away).
- **Channels in a dialog's text are named, not mentioned (my call):** whether Discord resolves `<#id>` inside a dialog is not checked (8T-H's check on the test server used bold text only, and Matt was asleep), so a dialog writes `#oakland` from the channel's name (a channel the bot cannot find: `a deleted channel`). The private answers after Submit keep their mentions. Staging checks a mention in a dialog; if it renders, a later small change may go back to mentions.
- **Built on 8T-H (my call):** this plan starts from `typescript-migration` after 8T-H is merged, and reuses 8T-H's dialog pieces (the dialog of text with an optional required radio group, the Submit that defers privately, the section on dialogs in `discord-framework.md`), moving them to a shared place if 8T-H left them in the split's files. The slow-read rule above applies to the split's dialog too (it reads the member's privacy before it opens).
- Components-v2 rule: the private answers after Submit are what they are today (components-v2 where they are today, plain text where they are plain text).

## Each one

**1. Remove all.** Title `Remove all your wants` / `Remove all your gym targets`. Text as today (`Remove all 12 entries of your list for this server? You will get no DMs for Pokémon or raid tiers here any more.`), then `Submit removes them.` (`… removes it.` for one). Nothing to remove: the private `none` answer as today, no dialog. `/unwant-all` and `/untarget-all` drop `defer: 'late'`. The list's "Remove all…" button opens the dialog; after Submit, the list itself stays as now (the answer is a private reply). The count is not checked again at Submit, as today: whatever the list holds then is removed.

**2. `/delete`.** Title `Close this raid` (train, meetup). Text: today's second paragraph turned into the choice's descriptions; a radio group `The post`: `Archive post` (`Keeps it readable and locked.`) and `Delete post` (`Removes it with everything written in it: for what nobody should keep reading, such as a home address.`). When the bot may not delete posts in that forum: no choice; the text says the post will be archived, and that deleting it takes Manage Threads in <#forum> (today's refusal, said before instead of after). `defer: 'late'` goes. After Submit: today's `closedWords` and refusals as a private reply (the reply in a post being deleted may go with it: kept as today's `.catch`).

**3. The report post.** Close…, Refuse place… and Block maker… open the dialog of 2. with today's question as the title or first line (`Refuse this place for good, and close this meetup?`); the report is read first, as now, and a report decided already is told privately as now (no dialog). After Submit, today's `reportDecisionWords` privately; the report post is redrawn for everybody as now. `may-not-delete` (Discord refused the deletion at Submit): today's private answer with its single "Archive post" button, which acts at once (a control can no longer open the dialog from a submit; it does not need to).

**4. Deleting a gym.** Title `Delete a gym`. Text as today (`Delete Schenley Fountain (#123)? This cannot be undone.`, then `Nothing refers to it.` or `With it go:` and its lines), then `Submit deletes it.` A raid at the gym: today's refusal privately, no dialog. `/gym delete` drops `defer: 'ephemeral'`; the "Delete…" of `/gym show` no longer defers before asking. After Submit: today's outcome texts privately.

**5. `/region remove`.** Title `Remove a region`. Text as today (what goes with it, the text channel's line); the forum's fate: with a forum the member may delete, a radio group `Its forum`: `Keep it as history` (`Its posts are archived and locked.`) and `Delete it` (`Deletes every post in it for good.`); with a forum they may not delete (no Manage Channels, or rehearsal mode), no choice and today's line saying it stays and why; without a forum, today's line. Then `Submit removes it.` `defer: 'ephemeral'` goes. After Submit: today's outcome lines privately (the permission is checked again: a member who lost Manage Channels meanwhile gets today's refusal and nothing is removed).

**6. `/location`.** Title `Move the raid to another region`. Text as today (`… is in #squirrelbreeze, not in this region. Moving the raid there gives it a new post …`), then `Submit moves it.` Refusals before asking stay private replies; a move within the region needs no question, as now. After Submit: today's answers privately (`This raid is now at … Its new post is …` before the old post closes, as now).

## Non-goals

- The other private replies stay (follow-ups: the import previews, `/admin cleanup-legacy`, the panels used again and again, screenshot feedback, `/rank`); the "possible later" ones (the `/target` picker, a meetup refusal's Ask or Appeal, `/gym add` in one form) are not in this plan.
- No change to what any of the six does once confirmed.

## Documents that change

The architecture files of each area (`notifications-and-dms.md`, `moderation.md`, `gyms-and-regions.md`, `parties-and-posts.md` for `/location` and `/delete`, `discord-framework.md`: a section on dialogs as one-shot questions, with the slow-read rule), the commands' help texts that say "asks first, privately", a staging checklist `docs/superpowers/plans/2026-10-18-phase-8q-staging.md`, and the follow-ups.
