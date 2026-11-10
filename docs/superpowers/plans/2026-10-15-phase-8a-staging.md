# Phase 8A: staging checklist

The text for the end of the 8A plan. Each step with Matt's go-ahead, on the test server, with the dev application.

1. **Register the commands:** `npm run deploy-commands -- --global` (65 commands: `/interested` and `/hmm` instead of `/maybe`, `/coming`, `/little`, `/great`, `/ultra`, `/master`; descriptions changed).
2. **Emoji:** Matt runs `npm run emoji:upload` (a dry run: it lists what it would upload and their sizes, and ends with a count), then `npm run emoji:upload -- --apply`. Look at the application's emoji in the Developer Portal: 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`.
3. **Start the bot** (Matt, in a terminal). With the bot running, the posts already there are shown anew once the application's emoji are read (types and weather as icons, team icons from the application), one post every quarter of a second, not all at once.
4. **The first message of a forum post:** report a raid. The log says once either "forum posts are made as they are" or "Discord refused a components-v2 first message of a forum post" (with Discord's code). In the second case, no "Setting up this post…" may remain visible in any post, and the log has no refusal of the edit that follows the line (it is converted at once). A raid whose picture Discord refuses is posted without it, with no line of text posted and deleted on the way. A line "could not delete a lost post" names a post id: look for that post and delete it by hand.
5. **Every kind of post** (look at each in the client, desktop and phone):
   - an egg (the egg picture, "Level 5 raid (egg)", times), and an egg whose boss is certain ("Hatches as …");
   - a hatched raid with a boss (picture, Weaknesses and weather as icons, Catch CP, Moveset);
   - a raid with several groups ("Join A", "Join B" beside the groups; Interested, Here, Done below);
   - a raid at an elite raid gym (Location Information; no Remote on an elite raid);
   - a raid reported from a screenshot without times: the buttons "⏰ Set time" and "📷 Screenshot feedback" (their emoji have not been seen on Discord yet);
   - a meetup with information (Meeting Information; Remote is still there, as before 8A);
   - a train with a route, a boss and a conductor ("Move train…" beside the gyms, the route in small print).
6. **Buttons:** press every one. "Join B" when interested, when here and when coming (the first two make you coming in B, the third only moves you); "Join A" while you are in A: interested becomes coming, here stays here; Map opens Google Maps; −1 and +1; Remote; Leave.
7. **Copies:** a remote raid in the remote channel, a raid at an elite raid gym in its channel (the line on top, the picture, all buttons), a train's copy in another region's channel (no "Move train…"), `/status` in a post. Also see what a copy looks like in a channel where the bot lacks Embed Links (thumbnails), if the test server has one.
8. **Edits:** an ordinary edit of a v2 post (a sign-up) must change nothing but the post. An old classic post on the test server (made before 8A, if one is still open) must become v2 by its next edit: the log says once, with Discord's code, that a v2 edit of a classic message was refused and the message converted; nothing else is refused.
9. **Moving a raid:** `/location` to a gym of another region, and once with its new post deleted by hand while it is made (if that can be timed): the answer says the raid stays here.
10. **End:** a raid that ran out and one closed with `/delete`: the last showing without buttons, then archived.
11. **DMs:** a want of the boss: the DM still shows the embed card (Weaknesses with commas or icons; "Raid train after X" for a train) with its stop buttons.
12. **Commands:** `/hmm`, `/interested`, `/coming`, `/join`; `/great pokemon:… attack:… defense:… stamina:…` and the others; `/rank` and `/great` share one limit (thirty in a minute). `/help` (the overview lists `/interested` `/hmm` and `/rank` `/little` … on one line each), `/help command:hmm`, `/help command:great`.
13. **Pings:** "Reported by **Name** (@mention)" in the small print pings nobody.
14. **A long post:** many sign-ups with long names: the lists end in "…and N more", and Discord takes the post (the 4,000 characters of text are an assumption).
