# Phase 8M-3 staging checklist: parties on the live map, and joining them

Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role).

## Before

1. No migration and no command change in this plan: no deploy. `npm run build` (it runs `npm run web:build`): `dist/web/assets/map-<hash>.js` is new.
2. Two forums of the test server: West's, which Tester can see, and another region's forum that Tester cannot see by their roles (no role of theirs has View Channel there; nobody set an overwrite for Tester). Note which is which.
3. In West: a raid reported with `/raid` at a gym of West (an egg with a hatch time some 20 minutes ahead), a train with a route of three gyms of West moved to its second stop, and a meetup with a start and end time. In the other forum: a raid at one of its gyms.

## The list and its look

4. Logged out, the map shows only regions and gyms; the network panel shows no `/api/parties` request.
5. Googer logs in with `/maps`: within a moment the raids appear as markers on their gyms with the egg's picture (the boss's after it hatches), the train as a line over its three gyms with the second stop marked, the meetup in the side panel on the right (on a phone width, under the map). The console shows no CSP violation (the pictures load from `raw.githubusercontent.com` / `cdn.leekduck.com`).
6. A raid's popup: the gym's name, its address line (when the gym has one) and "Directions" (Google Maps in a new tab, as the gym's own popup), "Level 5 raid (egg)" (and "Hatches as …" when the boss is known), "Hatches at 2:30 PM" with "in 18 min" counting down (it changes within 15 s of a minute passing, without a reload), the counts ("Interested 1 · Coming 0 · Here 0"), the buttons Interested, Join, Here, and "Open the post", which opens the post in the Discord app or web client. A second raid at the same gym (an elite raid, or another tier reported there): still one marker; its popup names the gym once and lists both raids, each with its own time, counts, buttons and post.
7. The train's popup: its name, "Starts at …", "At stop 2 of 3: <gym>" with that gym's address line and "Directions", the counts, the buttons, "Open the post"; the same popup from a click on the train's line, which stays open when the list changes (somebody joins the train on Discord meanwhile). The meetup's item: name, "Starts …", "Ends …", the counts, the buttons, the post.
8. Nobody is named anywhere on the map: not the reporter (also one who reported anonymously: report a raid as a member with `/settings` privacy on), not the attendees; the response of `/s/<id>/api/parties` in the network panel holds no name or member id.

## Joining from the map

9. Googer presses Join on West's raid: the notice says "You are coming."; the popup now says "You: Coming" and the counts "Coming 1"; the post on Discord lists Googer under Coming and says "**Googer** (@Googer) is coming." in its line; the network panel shows `/api/parties` asked at once after the press.
10. Here, Interested and Leave the same way, each as the post's button answers; Leave takes Googer off the post.
11. A raid with two groups (`/group new` on Discord first): the popup counts each group and offers "Join A" and "Join B"; Join B puts Googer in group B on the post.
12. After the raid has hatched (or one reported hatched): Done appears; pressing it answers as the post's Done ("You are done." or that the others were asked), and the completion question appears in the post as usual.
13. Done on an egg cannot be pressed (no button); a press sent anyway (the network panel's "Edit and resend" with `done`) answers "This raid has not hatched yet."
14. Press Join on the map and click Join on the post within the same minute 30 times between them (or with a scratch script against the dev server): the 31st is refused on whichever side: on the map "That was a lot of clicks. Try again in …", on Discord the same words privately.

## A forum Tester cannot see

15. Tester logs in with `/maps` (Matt's browser): they see the raid of the other forum on the map although they cannot see the forum on Discord.
16. Tester presses Join on it: "You are coming."; within seconds the forum appears for Tester on Discord (an overwrite of their own on the forum, View Channel, Read Message History, Send Messages in Threads), the post lists Tester, the bot's log says "let a member into a forum".
17. Tester presses Leave: the forum disappears for Tester again; the log says "took back the access of a member to a forum".
18. A moderator keeps Tester out of that forum on purpose (an overwrite for Tester that denies View Channel): within a minute Tester's map no longer shows that forum's raid (the barred answer is kept a minute); a press sent anyway (resend from the network panel) is refused (403) and nothing changes on the post. Remove the overwrite afterwards.
19. A forum kept for a role, not barred (spec 2.5, by design: the map crosses region roles): hide a forum from @everyone and allow View Channel to a role Tester does not have, as a server with a verification role (`Verified`) does for all its forums, or a region role for one. Tester's map shows that forum's raid, and Join lets Tester into the forum on Discord (step 16): nobody named Tester in an overwrite, so the forum is not `barred`. Undo the role's overwrite afterwards. Then the map's member role (Matt, 2026-10-17: unverified members browse the map read-only, as somebody not logged in): stop the bot, set `"memberRole": "Verified"` in `settings.web` (a role Tester does not have; make it on the test server if it has none), start the bot. Tester reloads the map: regions and gyms only, no parties, the header "You are not a member of this server."; `/s/<id>/api/parties` answers 403 and `/s/<id>/api/me` `member: false`; a Join resent from the network panel answers 403 and the post does not change. Give Tester the role: within a minute (the directory keeps its answer a minute) a reload shows the parties and Join works; take the role back and a press within that minute is still refused (403, Discord asked afresh). Matt's account (an administrator) sees the parties throughout. Remove `memberRole` afterwards and start the bot again.
20. A moderator times Tester out for a few minutes (Discord's Timeout): a press on the map answers "You are timed out in this server, so you cannot do that now." and nothing changes on the post; after the timeout is removed the press goes through. Optional, where the test server has membership screening (Server Settings, Safety Setup, Rules screening) and a new account is at hand: before it accepts the rules, a press answers "Finish this server's membership screening first."
21. A member who is not in the test server (a third account, if one is at hand, or Tester after leaving the server): logged in through Discord, the map shows no parties; `/s/<id>/api/parties` answers 403, and a press (resent from the network panel) 403 too.

## Polling and 304s

22. With the map open and visible: `/s/<id>/api/parties` every 20 seconds in the network panel, answered 304 while nothing changes (the browser sends `If-None-Match`); a change on Discord (somebody joins the raid on the post) shows on the map within 20 seconds, and that answer is a 200.
23. Switch to another tab for a minute: no requests meanwhile; back on the map, one at once, then every 20 seconds again.
24. Restart the bot with the map open (Matt): the next press first gets 403 (the CSRF key changed), the page asks `/api/me` for the new token and the press goes through once; the notice says the press's answer.
25. The party ends while its popup is open (`/delete` on Discord, or the clock): the next refresh takes the marker away; a press sent before that answers "This has ended." (or "This raid is over." for Done).
26. The bot's log: one info line "a party was pressed on the map" per press with user, guild, party, action, outcome; no name, no text; the debug lines of `/api/parties` by route pattern only.

## Not staged

- Read-only while Discord cannot be reached: the bot would have to lose Discord while the web server keeps serving, which cannot be arranged safely on this machine (pulling the network also cuts the browser's way to Discord's login and the tunnel). The unit and route tests cover it (`party-viewers.test.ts`, `parties.test.ts`, `party-press.test.ts`): a member confirmed within 30 minutes gets the list without buttons and "Discord cannot be reached just now, so the map is read-only." on a line of its own (`#read-only`, hidden again when Discord is back), anybody else 503; a press answers 503.

## Afterwards

27. End the raids, the train and the meetup made for the test; remove any overwrite set by hand in steps 18 and 19, and Tester's timeout of step 20.

## Left open (to the follow-ups if not settled here)

- Settled (Matt, 2026-10-17): a forum hidden from @everyone and allowed to a role is not `barred` (step 19), as the map crosses region roles; a server whose members must be verified names the role in `settings.web.memberRole`, and a member without it browses the map as somebody not logged in.
- How the markers look on a phone, and whether 36 px pictures are the right size; whether a raid at a gym in two regions shows once (it does: one marker per gym).
- Whether 20 seconds is quick enough or a stream (SSE) should follow (spec 3.4).
