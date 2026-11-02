# The Discord tutorial (plan 8M-18)

Matt, 2026-11-02: a crash course on a few basics, posted in a channel and not interactive, the Discord side of the web's tours (plan 8M-17). In Pittsburgh it replaces what is in `#raid-bot-tutorial`, written for legacy Pine. Rulings: an admin's bot command, not by hand; it reads stylistically like the current tutorial; very clear and concise; the reader knows the game, so it explains Pine and not the game, but for one line on a raid train and what meetups are for.

## Rulings after the design's review (controller, 2026-11-02; these win over what follows)

- **Its own messages are marked:** the container's `id` is `TUTORIAL_MARK`, and a run touches only Pine's messages with it. The other v2 messages of Pine's (a moderators' request with its buttons) would otherwise be overwritten, with no undo. No count refusal then. Staging proves Discord gives the `id` back on a read.
- **Refused first:** in a rehearsal; anywhere but `ChannelType.GuildText`; in a region's channel or one `settings.channels` names; without `TUTORIAL_NEEDS` (`interaction.appPermissions`), each named: without Read Message History Discord answers an empty list, not an error, and a second run would duplicate.
- **What it may say:** by `ctx.commands`, `settings.ocr.enabled`, `settings.web`, `channels.moderation` and `placeFinder.hasStops`. A block with nothing left goes whole.
- **The draft's text is corrected in `src/render/tutorial.ts`, which wins:** `/want` asks what for; no fixed boss in the example; `/route add` is in the train's post; the map does not do everything; Group… moves you or starts a group; Meet… needs times; the post's real icons, Remote among them.
- **The seam:** the handler uses `interaction.channel` directly; the choice of what to do is pure (`tutorialPlan`, `isTutorialMessage`). No factory on the context.
- **On cutover day:** deploy, `emoji:upload`, then run it (a line in the runbook). Staging checks the icons with Use External Emojis denied.

## The command

`/admin tutorial`, run in the channel it goes in. Staff only, as every `/admin`; answers ephemerally how many it posted and updated. Run again, it edits its messages in place and posts or deletes the difference, so that a change of wording means one command. Nothing else is touched: other people's messages stay (the old posts in Pittsburgh are the mods' to delete), and nothing pings.

- **Which messages are its own:** Pine's own messages in that channel with the components-v2 flag that answer nothing (no `reference`), oldest first, from the channel's last 100. No database: the channel is the record. So the channel is meant for this alone, and the help says so. A channel with more than ten such messages (one that is plainly not the tutorial's) is refused with a line rather than edited. Ten is above the course's length.
- **Where:** a text channel where Pine may send and read history; a forum, thread or DM is refused with a `UserError`. A refusal by Discord says which permission is missing.
- **Order** holds because edits are in place and new messages follow. The one exception: a course that grows while other people posted after it. Accepted; delete Pine's and run it again.
- **Timing (Matt's to run):** the commands it names only exist after the cutover, so in Pittsburgh it is run on cutover day. Until then the old text is the right one.

## What it says

Pure, in `src/render/tutorial.ts`: `tutorialMessages(settings, enabledNames, icons)` gives one components-v2 message per block, each one container (`LIST_COLOUR`). A line about a command is left out where the command is not enabled here (`enabledCommands`), so that other servers get what they have: screenshots (`ocr.enabled`), `/maps`' map, research and Rocket. Post buttons are shown by the same icons the posts use (`iconText`, plain emoji until the application has the custom ones).

**Style of the old tutorial:** `__**Underlined bold**__` headings ending with `!` where excited; warm, upbeat, "Simply…", "Professor Pine" by name; an emoji at the start of a line; numbered steps with keycap emoji; commands and examples in `code`; a caveat in `*italics*`. Not carried over: `:bl:` (a custom emoji of Pittsburgh's), the banners and screenshots (not ours to assume on other servers, and they show the old posts).

Draft (each block one message):

1. **Welcome.**
   `__**Meet Professor Pine!**__` Professor Pine is our friendly neighborhood raid bot! Pine has been studying our raid habits and has tools to help us catch our favorite Pokémon. Here are the basics. Credits line: coded by our users Googer, KingKovifor and ForcedUnknown, with special contributions from aallshouse, Exo, msten19, PaintedSandbox and nserror; art by strawbanya; the code at `https://github.com/Googer/Professor-Pine`. (Names as plain text: nobody is pinged.)

2. **Reporting a raid.**
   `__**Create a Raid via Screenshot**__` Simply post an in-game screenshot in your regional channel and mention @Professor Pine, clearly showing the raid egg or boss and the timer. Professor Pine will read it and create the raid for you! You can also attach one to `/raid`.
   `__**Manually Creating a Raid**__` Type `/raid` in your regional channel. Pick from the lists as you type:
   1⃣ `boss` The Pokémon or raid tier `Snorlax` or `T3`
   2⃣ `gym` Type part of its name `Walt`
   3⃣ `time` *Optional:* minutes or an exact time `14` or `3:32pm`
   Professor Pine creates a post for the raid in your region's raid forum.

3. **Finding and joining.**
   `__**Finding a Raid**__` Every raid has its own post in your region's raid forum, with all of them listed in the forum's pinned post. You can also type `/status` in your regional channel!
   `__**Joining a Raid**__` Press the buttons on the post:
   (icon) Interested, but not a commitment
   (icon) Join: you are on your way
   (icon) Here: you have arrived
   (icon) Done: you finished the raid
   👋 Leave if you can no longer make it
   ⬆️ ⬇️ Bringing a friend? Change your count.
   (icon) Set when your group meets. Group… splits the raid into groups.
   *Your status shows on the post, so everyone can see who has arrived.*

4. **Notifications.**
   `__**Get Notified!**__` Professor Pine sends these by DM, so make sure you have those enabled!
   🎯 `/want` Absol: a DM any time it is reported in your regions. Also works for raid tiers and research rewards.
   ⭐ `/target` a gym: a DM when a raid is reported there.
   `/wants` and `/targets` list yours; `/unwant` and `/untarget` take one off.

5. **Other reports.**
   `__**Other Things to Report**__`
   `/max` a max battle at a Power Spot. `/research report` a field research task at a PokéStop. `/rocket report` Team GO Rocket at a PokéStop. `/wild` a rare spawn: say where in `details`.

6. **Trains and meetups.**
   `__**Raid Trains**__` A raid train is a group raiding gym after gym along a route. `/train` in your regional channel creates its post; `/route add` adds the stops. Join with the same buttons!
   `__**Meetups**__` For trades, lure parties or playing as a group: `/meetup` in your regional channel creates its post.

7. **More.**
   `__**For More Help**__` `/maps` opens the live map, where you can do all this too. `/help` shows every command, or ask a Mod.

The wording is the reviewer's and then Matt's to adjust; a test holds every `/command` named to the real list, and `text-spelling` and the distance test already cover the folder.

## Code

`src/render/tutorial.ts` and its test; `src/commands/admin/tutorial.ts` and its test (`SubcommandPart`, `defer: 'ephemeral'`), added to `parts`; the sending through a small `TutorialChannel` port over the channel so that the handler's test needs no Discord; `utilities.md` gets a paragraph. Deploying the new subcommand and running it is Matt's go-ahead.

## Staged by Matt's go-ahead

On the test server: run it in a new channel; run again (edited, not duplicated); phone and desktop, light and dark; custom icons or plain emoji shown; a server with `ocr` off loses the screenshot block.
