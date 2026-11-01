# Phase 8S-1 staging checklist: meetup safety (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Three accounts are needed: a member without staff roles (the maker), a moderator (Admin or Moderator role), and a second member without staff roles who is given View Channel on the moderators' channel by a member overwrite (for step 14: a non-staff member who can see the buttons). The rehearsal step (28) needs the maker on `settings.rehearsal.allowlist`: rehearsal mode answers only staff and the allowlist, and a staff member's meetup is never held. The design is `docs/superpowers/specs/2026-10-17-meetup-safety-design.md`; the conventions `docs/architecture/meetup-safety.md`.

## Before

1. Migration 019 (`MeetupRequest`, `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`) runs at the start, additive only; the dev database is at 018 before it (check `kysely_migration`). The plan renumbers it at the merge if another branch took 019 first (8M-4S): check the number in `kysely_migration` against the file's name.
2. `/meetup` has new required options `near` and `start`: register the commands again, only on Matt's go-ahead (`npm run deploy-commands -- --global`). A client may need Ctrl+R.

## With the safety off

3. Start without `channels.moderation` (blank or absent): the log warns once per server that meetup safety is off.
4. As the maker, a pin (`near:` coordinates, start in three hours): posted at once, no form step skipped (the form still asks for the information).

## Turning it on

5. Make a text channel `meetup-review` on the test server that only staff can see (deny View Channel to @everyone; allow it to the staff roles and to Professor Pine), add `"moderation": "meetup-review"` under `channels` in the settings, and restart: no warning for the test server.
6. Start warnings: rename the channel (or set the setting to a name the server lacks) and restart: one warning that the server has no text channel of that name. Then deny the bot Send Messages there and restart: one warning that the bot cannot post in it. Put both back.
7. Two channels of that name: make a second, newer text channel also named `meetup-review`, staff-only too, in which the bot is denied Send Messages, and restart. `warnAtStart` checks the first channel of that name the server lists: a warning that the bot cannot post in it, or none, by which of the two comes first (note which). As the maker, a meetup at a pin (as in step 11): the request goes to the older channel, the one the bot may post in (`findChannel` takes the oldest it may post in), never to the second. Delete the second channel (and Refuse the request) before going on.
8. The settings refuse a moderators' channel that is another channel of theirs: set `"moderation"` to the name `bot-updates` has (then `mod-bot-lab`'s) and start: the bot does not start, and the error names `channels.moderation` ("must be a channel of its own, not the bot-updates channel …"). Put `meetup-review` back.

## /meetup

9. As the maker: `/meetup name:Picnic near:<a park PokéStop> start:<in three hours>`: a form "About this meetup" asks for the information (required). Send it: the meetup is posted at once with its start and information, the answer links to the post, and the post shows no line about a new start. Send the form once with nothing but spaces in it (Discord may refuse an empty field itself): "Say what there is to know about the meetup…".
10. `start:` that cannot be read, one in the past (with a date: a bare time already past today is read as tomorrow's), `none`: refused before the form, and none of them counts against the two meetups a quarter of an hour. The help (`/help meetup`) names `near`, `start`, the form and the moderator's approval.

## Requests

11. As the maker, a pin: the form, then "Your meetup needs a moderator's approval…"; nothing in the forum or the region channel. In `#meetup-review`: "Meetup waiting for approval" with the name, the start, the maker named (open their profile from it), the region, Where (📍 line with Map), the information, when it expires, and Approve once, Refuse, Block member (no Approve, no Refuse from now on).
12. As the maker, a PokéStop whose title has "Little Free Library" (or a word added under `meetupSafety.flaggedWords`): the same, with the stop's picture beside Where and five buttons. A gym whose official name has a flagged word but whose nickname does not: held too.
13. As the moderator: `/meetup` at a pin is posted at once. A start less than two hours ahead at a pin, as the maker: refused before the form, asking for two hours.

## Decisions

14. As the second member (non-staff, with View on `#meetup-review`), press Approve on a post: "Only admins and moderators can do that." privately.
15. As the moderator, Approve on step 12's request: the private answer links to the post; the post is made as the maker asked (they are signed up as interested, "Created by" them); the moderators' post shows "Approved by …" without buttons; the maker gets a DM with Go to post naming the meetup. `/meetup` at the same stop by the maker is now posted at once.
16. Approve once on step 11's pin: posted; another `/meetup` at the same coordinates is held again.
17. Refuse and Refuse from now on on two new requests: the maker's DMs say it was not approved (never why); a later `/meetup` at the refused stop answers "A meetup can't be held there." before the form.
18. Press a decided post's old button from a second client (or two moderators at once): "… decided this already …".
19. Restart the bot with a request pending: its buttons still work.
20. A request at a pin with a start three hours ahead: about two hours later (an hour before the start) the post turns "Expired" and the maker gets a DM; a press on it says "This request has expired: nobody decided in time."

## Blocks and appeals

21. With the maker owning an active meetup and one more pending request: Block member on a request. The other request's post turns "Refused … its maker was blocked", the meetup's post says "This meetup was closed by the moderators." and is archived, and the maker gets one DM about the block, naming the server. Block member on a second request of theirs: no second DM.
22. Block while the form is open: the maker runs `/meetup` (allowed place), a moderator blocks them over another request before they send the form; on sending: "You can't create meetups on this server." with Appeal.
23. As the maker, `/meetup` with a `near` nobody knows (`near:qwxzy`) and a `start` that cannot be read: "You can't create meetups on this server." with Appeal, not the refusal of the place or the start (the block is asked first).
24. As the maker, `/meetup` anything: "You can't create meetups on this server." with Appeal. Press it: the form "Why should the block be lifted?". Send: the appeal is in `#meetup-review` with who blocked them and when, Lift block and Keep block. Press Appeal again: the appeal is with the moderators already.
25. Keep block: the post says when they may appeal again (a relative time); the maker's DM names the server and says when; Appeal now says the same.
26. In the database, set that appeal's `decidedAt` back eight days (or block a second test member), appeal again and Lift block: the post shows "Lifted by …" and still says who blocked them and when; the maker's DM names the server and says they can create meetups there again, and `/meetup` works.
27. Delete an open appeal's post by hand, and in the database set its `createdAt` back eight days: within a minute the sweep closes it (the maker gets a DM that they may appeal again), and Appeal opens the form again.

## Rehearsal mode

28. In rehearsal mode (Matt, 2026-10-17: the moderators' posts go through to the staff-only channel), with the maker on the allowlist and not staff: a request (a pin) and an appeal (after a Block) reach `#meetup-review`; nothing else of the bot is posted outside the posts of rehearsed parties (the region channel gets no link to a new post), and nothing but meetup safety's own posts reaches `#meetup-review` (the exception is meetup safety's gateway, not the channel's name: the log shows "rehearsal: no message outside the posts of parties" for any other send).

## Cutover check

29. `npm run cutover:check` (only on Matt's go-ahead): a `moderation` PASS line with the channel; without the setting a WARN that meetup safety is off; with a channel the bot may not post in, a WARN naming the permissions (View Channel, Send Messages, Embed Links); with the channel visible to @everyone, a WARN to make it staff-only; with a role that is no staff role (say Mystic) allowed View Channel there, a WARN naming that role; an announcement channel of that name counts as none.
