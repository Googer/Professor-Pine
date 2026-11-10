# Phase 8M-8B staging checklist: the post's controls as forms of the map

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.

- **Accounts:** Googer (owner, staff), Tester (a member), and a third account for the completion question and the groups where one is at hand.
- **Brief:** `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its last section, "After the builder check", X1 to X10).
- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's popup is its post", "After the builder check").
- **Conventions:** `docs/architecture/web.md` ("A party's popup is its post", "The post's controls as forms").
- **Devices:** a desktop browser (light and dark), an Android phone and an iPhone if at hand, Discord's in-app browser and the phone's own.
- **Compare with Discord:** every form beside its dialog on Discord: the same title, words, choices and answers.

## Before

0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs.
2. **Parties:** Googer reports a raid with times (an egg hatching in 20 minutes) and a hatched raid; Tester joins the hatched one; a second group on it (Googer: Group… → a new group on Discord, label "by the fountain"). A train and a meetup at a pin. No moderators' channel at first (`settings.channels.moderation` unset), then with it (step 22).
3. **The view's version:** a page opened before the deploy keeps its posts by their old keys; after the deploy every post is asked for anew once (the view's version and the table `CONTROLS` are in every key: the network tab shows `post?k=` with new keys).

## Who may change a raid (X5)

4. **Anybody the map shows the raid to.** As Tester, not signed up for the egg: "Change…" is in the member's part and Set time… opens the change form; set the hatch, the boss and the moves: each goes through, in the commands' words, and the post on Discord says Tester did it. As Tester barred from West's forum (an overwrite): the raid is not on the map, and a change sent by hand (the browser's console, the change's address) answers 403.
5. **Read-only.** With Discord away for the bot (block its network a moment, or the preview's `ME=readonly`): no Change…, Set time… off.

## +1, −1 and the completion question

6. **+1 and −1.** As Tester on the hatched raid, press +1 twice and −1 once in the popup: the post's line on Discord says "Tester +1", the answers are the buttons' ("You are coming with 1 more."); +1 at the most one may bring says so. As somebody not signed up, −1 says "You are not signed up for this raid."; +1 signs them up as interested.
7. **Their limit.** 30 presses a minute between Discord and the map: the 31st, on either, says "That was a lot of clicks…".
8. **The completion question.** Googer and Tester Here on the hatched raid; Googer presses Done (Discord or the map). Tester's popup shows "Have you completed this raid?" with "Without an answer by 2:52 PM I will take it that you have." (in Tester's own zone) and Yes, done / Not yet; on the phone the card's summary shows it too. Not yet: Tester is Here again, and the question message on Discord goes; Yes, done: Tester is done. Googer's popup never shows the question.

## Group…

9. **Change group.** As Tester (in A) on the raid of two groups: Group… opens "Change group" in the popup, in Discord's dialog look: "You're in group A.", the other group with "1 trainer · meeting at …" (in the reader's zone) and "Start a new group on Discord →" (the post's link). Submit: "You are coming, in group B.", the post on Discord moves Tester; the popup comes back with the post as it is now.
10. **One way.** Where only one group is left to move to, no choice: "… Submit moves you to group B.".
11. **Stale.** Open the form, then on Discord let the other group go (its member leaves) or move Tester there; Submit: "Group B has changed since: press Group… again." (or "You are no longer signed up: press Group… again." after Tester left on Discord).
12. **Refused before it opens.** As a member who completed the raid: Group… says "You are done with this raid. Use Join or Here if you are back." under the buttons, in the place of the post's link. Read-only: Group… is off.
13. **A newcomer.** Several groups: Group… goes to the "Which group?" menu (as in 8M-8A). One group, Tester not signed up and others signed up: "Join a group" with group A; Submit signs Tester up as coming.
13a. **Only a new group.** One group, Tester signed up in it with others: Group… opens no form; the line under the buttons says "Start a new group on Discord →" with the post's link (review W-1).
13b. **A stale move.** With "Change group" open, let the group picked go on Discord, then Submit: the refusal is said, the form closes and the popup shows Group… as it is now (review W-2); the focus is back on Group… (review W-5).

## Meet…

14. **The times.** As Tester on the raid with times: Meet… (the ⏰ icon) opens "Meeting time for group B" (or "Meeting time") with "When does your group meet?": the in-game RSVP times and the five-minute times of the next hour, in the reader's zone, the hatch first on an egg, chosen to start with; the group's own time said ("· Your group's meeting time now") and "No meeting time" last once it has one. Compare with Discord's dialog: the same times.
15. **Set and remove.** Pick a time: "The meeting time of group B is 2:30 PM (in 30 min). I have told the others."; the others are pinged in the post, as on Discord. "No meeting time": "The meeting time of group B is canceled.".
16. **Its window.** Three a minute between `/meet`, Meet… on Discord and the map: the fourth opening says "You can use /meet again in …" and opens nothing.
17. **Refused.** Not signed up: "You are not signed up for this raid." under the buttons; a raid without times: "This raid has no times yet: "Set time…" gives them.". Open the form, wait until its time is past (or move to another group on Discord), Submit: "That time is no longer offered: press Meet… again." / "Your group changed meanwhile: try again.".

## Staff's Delete… (X1)

18. **Who sees it.** Googer: "Delete…" in the map's line beside Open on Discord, on every party; Tester: none.
19. **Archive.** Googer: Delete… on the train: "Close this train" with "The post": Archive post / Delete post, nothing picked; Submit without a pick says "Pick Archive post or Delete post first."; Archive post: "This train is closed: I am archiving and locking its post."; the popup or card closes, the train leaves the map, its post on Discord says "This train was closed by **Googer** (@Googer)." and is archived.
20. **Delete.** On the meetup: Delete post: "This meetup is closed: I am deleting its post."; the post is gone on Discord.
21. **Archive only.** Take Manage Threads from the bot in West's forum: the form says the post will be archived and why, naming "#west-raids", and Submit archives; a form opened before the permission went says "I can't delete posts in #west-raids (Manage Threads is missing there). Archive it, or delete it yourself." for Delete post. A report of the party that was open reads "Closed by Googer".

21a. **Only its own popup closes.** Googer submits Delete… on one party, and opens another party's popup before the answer comes: the other popup stays open (review W-6).
21b. **A moderator who lost the role.** Give the third account the Moderator role, open the map with it, then take the role away while its map still shows Delete… (wait less than a minute, the directory's): its Submit is refused 403 "Only admins and moderators can do that." by the fresh fetch, and nothing is closed.

## Report… (X2)

21c. **Hidden, not barred.** Tester without the role that lets him see West's forum (nobody keeps him out): West's raid is on his map, he changes its hatch (allowed, C1), and his map's line has no Report… (review W-7; Matt to confirm with C1).
21d. **Not sent.** With the moderators' channel set and the bot refused there for a moment (take its Send Messages): Report… says "I could not send your report to the moderators. Try again later."; the use is given back (five more reports still go through within the hour).

22. **Into the post.** Without the moderators' channel, as Tester: Report… opens "Report this raid to the moderators", "What is wrong?" (1,000 characters); a reason of spaces: "Say what is wrong, so that the moderators know what to look at."; a reason: "I have put your report into the post, for the moderators.", the staff roles pinged in the post as `/report` pings them.
23. **To the moderators.** With `settings.channels.moderation` set: "Sent to the moderators."; the report's post in the moderators' channel names Tester and the reason; opening Report… again: "You already reported this." under the buttons, the form not opened. A report on Discord (`/report`) of the same party by Tester is refused the same way.
24. **Its window.** Five an hour between `/report`, the Apps menu and the map: the sixth opening says "You can use /report again in …".

## The forms on the page

25. **Held.** With a form open in a popup, the other controls that open a form are off (Report raid, Change…, New train, Group…, Meet…, Delete…, Report…); Cancel, Escape and closing the popup each let it go.
26. **In the list and the card.** Open a party from the list (a line shown with its post): each form opens under its line; on a phone (360–414 px) each opens in the card, and closing the card lets it go.
27. **Light and dark** on the desktop and the phone: the forms are on Discord's dialog background, readable in both.
28. **Max battles.** Not drawn on the page yet (8M-9): `GET /s/<guild>/api/parties/<a max battle's id>/meet` answers its five-minute times (the browser), and the completion question of a max battle's Done reaches the map's `asked` in `/api/parties`'s JSON.
