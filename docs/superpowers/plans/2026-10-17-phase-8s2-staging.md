# Phase 8S-2 staging checklist: reports to the moderators, asks about places, /places (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: a member without staff roles (the reporter), a second member (the maker of meetups and author of a message), a moderator (Admin or Moderator role; a second moderator without Manage Server for step 4). The moderators' channel `meetup-review` of 8S-1 is set (`channels.moderation`) and staff-only. The design is `docs/superpowers/specs/2026-10-17-moderation-reports-design.md`; the conventions `docs/architecture/moderation.md` and `meetup-safety.md`.

## Before

1. Migration 022 (`ModerationReport`, `ModerationReportReason`, `MeetupPlaceAsk`, new columns of `MeetupPlaceRuling`) runs at the start, additive only; check `kysely_migration` for its name (renumbered at the merge if another branch took 022).
2. New commands: `/report`, `/places`, the message command "Report to moderators", and `/delete` now with Manage Messages. Register them, only on Matt's go-ahead: `npm run deploy-commands -- --global`. A client may need Ctrl+R.
3. As the member: `/delete` is not offered; "Report to moderators" is in the Apps menu of a message (right-click; a long press on a phone); `/help command:delete` says to use `/report`; `/help` lists "Report to moderators" under its name.
4. As the moderator without Manage Server but with Manage Messages: `/delete` and `/places` are offered (`/admin` is not).

## Party reports

5. As the reporter, `/report` in a meetup's post: a form "Report this meetup to the moderators". Send it: "Sent to the moderators."; nothing in the meetup's post, nobody pinged. In `#meetup-review`: "Reported meetup" with its lines, who created it, Where (with Map), its information, the reason with the reporter, and Close…, Refuse place…, Block maker…, Dismiss, Go to post.
6. As the second member, report the same meetup: the same post shows two reasons (not a second post). The reporter again: "You already reported this."
7. The Apps menu on the meetup's post, on its line in the region channel, and on its copy (`/status` in the post): each opens the same form, and the reason joins the same report. On a raid's post: the report shows Close… and Dismiss alone; at a gym with a nickname, "officially …" beside it.
8. On another message of the bot (a summary post, an answer): "Nothing to report there."
9. Six reports within the hour: the sixth "You can use /report again in …"; a form of white space alone is refused and not counted.

## Decisions

10. As the reporter (non-staff) press Dismiss: "Only admins and moderators can do that."
11. As the moderator, Close… on a meetup's report: privately "Close this meetup?" with Archive post / Delete post. Archive: the meetup's post says "This meetup was closed by the moderators." and is archived; the report's post "Closed by …: its post is archived." without buttons.
12. Close… → Delete post on another report: the forum post is gone, with its link line; the report says "its post is deleted."
13. Refuse place… → Archive on a meetup at a PokéStop: the place is refused (a `/meetup` there says "A meetup can't be held there."); `/places place:<stop>` shows the ruling "from a report" with a link to the report's post.
14. Block maker… → Delete post: the maker gets one DM, their other meetups are archived with the moderators' line, `/meetup` answers them with Appeal.
15. Deny the bot Manage Threads in the region's forum, then Close… → Delete post: "I can't delete posts in #… (Manage Threads is missing there)…", the report stays open; Archive works. Put it back.
16. A reported meetup ended by its maker (`/end` in the past): the report's post says "Ended: the meetup was over before a moderator decided." without buttons. Another reported meetup closed by the moderator with `/delete` → Archive post: the report's post says "Closed by …: its post is archived." with Go to post; a third with `/delete` → Delete post: "Closed by …: its post is deleted." without Go to post.
17. Restart with a report open: its buttons still work; two moderators pressing at once: the second is told who decided.
18. A reported train with a copy in another channel (a stop in another region, or `/status` in a region channel): Close… → Delete post: the post, its copy and its link line are gone; the report says "its post is deleted." without Go to post.

## Message reports

19. As the reporter, the Apps menu on the second member's message in the region channel (with a picture attached): a form "Report this message to the moderators"; the post shows who wrote it, where and when, a copy of its text, the attachment's name, Go to message, Delete message and Dismiss. On a member's message inside a party's post: "in the post of …". The second member edits the message, then another member reports it: the post keeps the first text and adds "It was edited after the first report: this is what it said then." A forwarded message reported: "**What it said** (forwarded)" with the text and files it forwards.
20. Delete message: the message is gone; the post says "Message deleted by …". On another report, delete the message by hand first, then press Delete message: "Gone: the message was deleted before a moderator did".
21. Deny the bot Manage Messages in the channel, Delete message: "I can't delete messages in #…; delete it yourself.", the report stays open. Put it back.
22. A member's message in the post of a meetup closed with Archive post (archived and locked): report it, Delete message: the message is gone, and the post is archived and locked again afterwards (not left open).
23. The same with the bot denied Manage Threads in that forum (Manage Messages kept): Delete message answers "I can't delete messages in #…; delete it yourself.", the report stays open, and the post was never opened (still archived and locked). Put it back.
24. Without `channels.moderation` (restart with it blank): `/report` puts the reason into the post and pings the staff roles once (as the old `/delete`); a message report is refused "This server has no moderators' channel." Put it back.

## /delete

25. As the moderator, `/delete` in a raid's post: the private question; Archive post closes it as before ("This raid was closed by …", archived, the gym free); on another, Delete post deletes the post.

## Asks about refused places

26. Refuse a stop for good (Refuse from now on on a request). As the maker, `/meetup` there at once: "A meetup can't be held there." without a button. Set the ruling's `ruledAt` 15 days back in the dev database (staging tool), `/meetup` there again: the refusal has Ask the moderators; it opens "Ask about this place"; send it: "Your question is with the moderators…". In `#meetup-review`: the place, the ruling with a link to the request's post, the words, Allow place and Keep refused.
27. As another member, `/meetup` there: "… It is with the moderators already."
28. Keep refused: the maker's DM says it stays refused and when they may ask again; `/meetup` there has no button. Set `keptAt` back 15 days, ask again, Allow place: the DM says meetups are allowed; `/meetup` there posts at once.
29. An ask left open eight days (set `createdAt` back): the next tick expires it, its post says so, the maker is told they may ask again.
30. A refusal with Ask the moderators shown, then a restart of the bot: the button on that old answer still opens the form, and the ask is posted.
31. On the web map, a meetup at a stop refused for good long enough to be asked about: the refusal says "You can ask the moderators about it with /meetup on Discord: its answer has Ask the moderators." and has no button.

## /places and the leftovers

32. `/places`: refused and allowed places, pending requests, open asks, blocked members with Lift block, open appeals, open reports, each with a link to its post; arrows with more than ten entries. Lift block: the member is told by DM and can make meetups again.
33. A blocked member appeals (Appeal under `/meetup`'s refusal); while the appeal is open, Lift block on `/places`: the appeal's post says the block was lifted, without buttons; the member gets one DM; `/places` lists neither the block nor the appeal.
34. `/places place:<the refused stop>`: its ruling; Undo ruling: "Undone by …"; the log has "a ruling of a place was undone"; the stop is checked by its name again.
35. With an ask about a refused stop open, Undo ruling on `/places place:<the stop>`: the ask's post says "Ruling undone on `/places`: a meetup there is checked by its name again." without buttons; `/places` no longer lists the ask.
36. Refuse a request (plain Refuse): its post keeps Block member; press it: the maker is blocked, one DM, the post says who blocked them. An expired request keeps it too.
37. A request at a gym with a nickname: the post shows "(gym; officially …)".

## Rehearsal

38. In rehearsal mode (the reporter on the allowlist), a report goes into `meetup-review`, as requests and appeals do.
39. In rehearsal mode, a report of a member's message outside the posts of rehearsed parties (a region channel), Delete message: "I can't delete messages in #…; delete it yourself.", the message stays, the report stays open, and the log has "rehearsal: no member's message is deleted outside the posts of parties".

## After

40. `./pine cutover-check` (Matt's go-ahead: it reads Discord's REST API) shows a `reports` line: a pass, or a warning naming where the bot lacks Manage Messages or Manage Threads.
