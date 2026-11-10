# Phase 8Q staging checklist: the one-shot questions as dialogs

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Two accounts: **Ash** (Matt's account, a Moderator with Manage Channels: the staff steps) and **Dawn** (the second account, a member). The design is `docs/superpowers/specs/2026-10-18-one-shot-dialogs-design.md`; the split's dialog of plan 8T-H, which these follow, is staged by the 8T checklist (steps 5 to 7, 12, 17, 18, 28).

What every dialog of this plan has in common, checked once in each section: it opens at once over the channel (no "thinking…" before it, no private reply), its title says the act, its text is the question, Discord's own Submit and Cancel close it; Cancel (or Escape) says nothing and changes nothing; after Submit Discord shows its own wait, then a private answer (only the account that submitted sees it). A choice between two ways is a radio group with nothing picked: Submit without a pick is refused by Discord ("This field is required."). Channels inside a dialog are named (`#west`), never mentioned; the private answers after Submit keep their mentions (links that open the channel).

## What is still to run (2026-10-22)

Run elsewhere already: staff's `/delete` with Archive post (step 8's path) passed in the 8X staging run (a pin battle's moderators' notice, Delete → the dialog → "Closed by Googer") and in the 8X-F run (a reported max battle, "Close this max battle", archived; follow-ups, "From the staging run of 8X-F"). Everything else here has not run. 8R-4 left Remove all… as it was (its checklist, step on `/wants`), so steps 3–6 stand.

One more check for the radio dialogs (`/delete`, Close…, Refuse place…, Block maker…, `/region remove`): 8X found that Discord's client shows a dialog's last submitted values when the same custom id opens again, and these ids have no per-open token yet (follow-ups, "From Phase 8T-H"). After a refused Submit (step 11's Manage Threads taken away), reopen the dialog on web, Android and iPhone: is the old pick (Delete post) shown picked, where the design wants nothing picked?

## Before

1. No command definitions change (no new command, option or description): no deploy is needed. No migration, no change of the party document; going back to an older branch needs nothing (a dialog opened by this build and submitted by an older one answers "This control is no longer active.").
2. Before switching to this build, ask the old questions once and leave them unanswered, for step 30: `/unwant-all` (Dawn, with something on the list), `/delete` in a raid's post (Ash), `/gym delete` (Ash), `/region remove` of a scratch region (Ash; step 19), `/location` to a gym of another region (Dawn, in a raid post of hers), and Close… on an open report's post (Ash: its private question with Archive post and Delete post).

## Remove all

3. Dawn has three wants (`/want`) in the test server. `/unwant-all`: the dialog "Remove all your wants": "Remove all 3 entries of your list for this server? You will get no DMs for Pokémon or raid tiers here any more.", a blank line, "Submit removes them.". Cancel: nothing is said; `/wants` still lists three.
4. `/unwant-all` again, Submit: privately "Removed 3 entries: your list for this server is empty.". `/unwant-all` once more: privately "Your list for this server is empty: there is nothing to remove." and no dialog.
5. Dawn adds one want; `/wants`, then "Remove all…" under the list: the same dialog, "Remove the one entry … Submit removes it."; the list stays as it is (not replaced). Submit: the private answer "Removed 1 entry: …" comes as a message of its own, the list above it unchanged until a page button is pressed.
6. The same for gyms: Dawn targets two gyms (`/target`); `/untarget-all` opens "Remove all your gym targets" ("Remove all 2 of your gyms in this server? …", "Submit removes them."); Submit: "Removed 2 gyms: you have no gyms in this server any more.". "Remove all…" under `/targets` opens it too; with no gyms, `/untarget-all` says "You have no gyms in this server: there is nothing to remove." without a dialog.

## Staff's /delete

7. Dawn reports a raid (`/raid`). Dawn tries `/delete` in its post: Discord does not offer it (Manage Messages); if it is typed anyway, "Only admins and moderators can do that.". Ash `/delete` in the post: the dialog "Close this raid", the text "Close this raid?", the radio group "The post" with "Archive post" ("Keeps it readable and locked.") and "Delete post" ("Removes it with everything written in it: for what nobody should keep reading, like a home address."), nothing picked. Submit without a pick: Discord refuses it. Cancel: nothing changes.
8. Pick Archive post, Submit: privately "This raid is closed: its gym is free for a new report, and I am archiving and locking its post."; the post says who closed it and is archived and locked.
9. A second raid: Delete post, Submit: the post is deleted with its thread (the private answer may vanish with it: that is expected, as before). A meetup's and a train's `/delete` are titled "Close this meetup", "Close this train".
10. A third raid in a forum where the bot lacks Manage Threads (take it away in the forum's permissions for the bot's role first, and give it back after): `/delete` opens the dialog without a choice: "Close this raid?", then "Its post will be archived (kept readable and locked): I can't delete posts in #<forum> (Manage Threads is missing there), so deleting it is not offered. Delete it yourself if nobody should keep reading it.", then "Submit archives its post.". The forum is named, not a link. Submit: the post is archived.
11. Open the dialog of a fourth raid with Manage Threads in place, take Manage Threads away while it is open, pick Delete post and Submit: privately "I can't delete posts in <#forum> (Manage Threads is missing there). Archive it, or delete it yourself." (a mention here), and the raid is still active. Give Manage Threads back.

## The report post

12. Dawn makes a meetup and reports it (`/report`); in the moderators' channel Ash presses Close… on the report's post: the dialog "Close this meetup" with "Close this meetup?" and the radio group "The post"; Refuse place… "Refuse this place" with "Refuse this place for good, and close this meetup?"; Block maker… "Block the maker" with "Block its maker from creating meetups here, and close this meetup?". Cancel each: the report is still open.
13. Close…, pick Archive post, Submit: privately "Closed: the meetup is over, and its post archived."; the report's post is redrawn for everybody (the decision, no buttons), as before.
14. Another report decided already (Dismiss it first): Close… answers at once privately "**Ash** (…) decided this already …: dismissed." and no dialog opens. A dialog of a report opened before somebody decided it answers the same at Submit.
15. A report of a meetup in a forum where the bot lacks Manage Threads: Close… opens without a choice ("Its post will be archived … #<forum> …", "Submit archives its post."). With the dialog open and Manage Threads taken away meanwhile (step 11's way), Delete post and Submit: the private answer says the bot can't delete posts there, with one button "Archive post": pressing it archives the post and closes the report at once.

## Deleting a gym

16. Ash `/gym delete gym:` a test gym that a train's route and a saved route have: the dialog "Delete a gym": "Delete **<name>** (#<n>)? This cannot be undone.", "With it go:" and its lines, "Submit deletes it."; the gym's name shows bold in the dialog. Cancel: the gym is still there (`/gym show`).
17. Submit: privately "Deleted **<name>** (#<n>).", "With it went:" and what really went; the train's post says why its stop went.
18. `/gym show` of another test gym, Delete…: the same dialog; the view stays as it was. Submit: privately "Deleted …" as a message of its own. A gym with an active raid: `/gym delete` and Delete… answer privately "A raid is at … A gym cannot be deleted while a raid is there …" and no dialog opens.

## Removing a region

19. Do not remove one of the 28 real Pittsburgh regions of the test server (`var/stage/TEST-SERVER-STATE.md`): make a scratch region first, with its own channel and forum (`/region import` of a small KML for a new channel, or the region editor), and end with it removed.
20. Ash `/region remove region:` the scratch region: the dialog "Remove a region": "Remove the region #<channel>? This cannot be undone.", what goes with it, "Its text channel stays as it is, and no gym is deleted.", "Its forum #<forum> can stay as history or be deleted, as you pick below.", "Submit removes it.", and the radio group "Its forum" with "Keep it as history" ("Its posts are archived and locked.") and "Delete it" ("Deletes every post in it for good."), nothing picked. Cancel: the region is still there (`/region list`).
21. Pick Keep it as history, Submit: privately "Removed the region <#channel>." with mentions, what went with it, "Its forum <#forum> stays as history.", and the self-roles reminder where roles are on.
22. A second scratch region, Delete it, Submit: "Its forum was deleted, with every post in it."; the forum is gone from the channel list.
23. Optional, as Dawn, not Ash: Ash's roles grant Manage Channels, and roles add up, so another role on Ash would change nothing. Before the step, Matt gives Dawn a role named `Bot Developer` (Server Settings › Roles; create it if the server has none) whose permissions grant nothing, in particular neither Manage Channels nor Administrator, and checks that none of Dawn's other roles grants them (Server Settings › Members › Dawn's roles). The name passes the guard of `/region` (`requireBotManagement`: admins, moderators and bot developers by role name); `/region` needs Manage Server by default (its `default_member_permissions`, which Discord enforces), so Matt also allows the `Bot Developer` role for `/region` in Server Settings › Integrations › Professor Pine (Dev instance) for the step (an override of the command for that role, which does not grant Manage Channels). Dawn runs `/region remove` of a third scratch region: the dialog has no choice and says "Its forum #<forum> stays as history (its posts are archived and locked): deleting it takes the Manage Channels permission, which you lack."; Submit keeps the forum. Afterwards Matt takes the `Bot Developer` role off Dawn again (and deletes it if it was made for the step) and removes the Integrations override, so that Dawn is a member again for the other steps.

## /location to another region

24. Dawn reports a raid in West; in its post `/location gym:` a gym of another region: the dialog "Move the raid to another region": "<gym> is in #<region>, not in this region. Moving the raid there gives it a new post in the raid forum of that region, with everybody who is signed up, and closes this one. Move it?", "Submit moves it.". Cancel: the raid stays.
25. Submit: privately "This raid is now at <gym>. Its new post is <#post>." (a link); then the old post closes with its link line. `/location` to a gym of West answers at once without a dialog ("This raid is now at …"). A gym that has such a raid: the refusal privately, no dialog.
    The 8S-4 staging step 10 (a move refused because the bot may not make posts in the other region's forum) now runs through the dialog: Submit answers privately "Nothing was moved. I am not allowed to make posts in <#forum> …", and neither the Submit nor the `/location` use that opened the dialog counts (`/location` can be used again at once, `CHANGE_THROTTLE` times over).

## A mention inside a dialog (to learn, not to pass)

26. Whether Discord shows a channel mention (`<#id>`) inside a dialog's text is not known (the design names channels instead). Claude extends the staging script `var/stage/dialog-check.mts` (git-ignored, the raw dialogs checked for 8T-H) by a fourth button that opens a dialog of one text display with a channel mention, a user mention and a role mention, for example `In <#WEST_CHANNEL>, by <@DAWN>, for <@&MODERATOR_ROLE>.` (the test server's ids); Matt runs it as before, on his go-ahead. Note for each on desktop and phone whether it shows as a link with the name, as the raw `<#…>`, or as "#unknown"; write it into the follow-ups ("From the staging run of 8Q"). If channel mentions render, a later small change may go back to mentions in the dialogs.

## Throttles, the slow read, old questions

27. Ash closes twenty raids within a minute with `/delete` (the command has no limit; each Submit counts against twenty a minute): the twenty-first Submit answers "That was a lot of clicks. Try again in …". (Optional: it takes twenty raids.)
28. The slow read (no dialog and "That took me too long to look up: try again in a moment." when what a dialog needs is not read within two seconds) is tested by the unit tests only: it needs a database slower than Discord's three seconds.
29. Two dialogs at once: Discord shows one dialog at a time per account; opening a second (another `/unwant-all` from another window) replaces the first. Note what the client does.
30. The questions left unanswered in step 2, pressed now: "Keep them" / "Remove all 3" of `/unwant-all`, "Archive post" / "Delete post" of `/delete`, "Move it there" / "Cancel" of `/location`, and the report question's "Delete post" answer "This control is no longer active."; "Delete" / "Keep" of `/gym delete` and "Remove, keep the forum" / "Remove and delete the forum" / "Cancel" of `/region remove` say that the question has expired. Nothing changes, except the report question's "Archive post": it has the same custom id as the button kept under a deletion refused at Submit (step 15), so it archives the post and closes the report at once, without a dialog; press it last, on a report that may be closed.

## Phone

31. On the phone: each dialog's title (none cut), its text with the bold gym name and the lines of what goes with a gym or a region, the radio groups with their descriptions and nothing picked, Discord's refusal of Submit without a pick, and the private answers after Submit.

## Rollback

Nothing to undo: no migration, no stored change. Dialogs opened on this build and submitted after going back answer "This control is no longer active." (the old build has no Submit of these kinds); questions asked on the old build and pressed on this one answer as in step 30.
