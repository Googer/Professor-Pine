# Pictures at the stops, and the 8R staging's small fixes: design

Status: agreed with Matt 2026-10-23, for review. Comes from the staging of 8R-1 to 8R-5 (follow-ups, "From the staging run of 8R-1 to 8R-5"). Mockups: `2026-10-23-stop-pictures-mockups.html` (only what was agreed). Builds on `docs/architecture/stop-reports.md` and `notifications-and-dms.md`.

## The problem (staging, 2026-10-23)

- Leek Duck's Pokémon icons (`pokemon_icons_crop/…`) are not square. Discord shows a thumbnail as a square and crops the rest, so Larvitar loses its head and feet, in the pinned post and in DMs.
- The pinned post has one picture per task: the first reward's, even where the block lists other rewards' stops (Rare Candy beside Golden Razz Berry stops; Larvitar beside Gible's).
- A "one of" DM shows the task's first reward (Larvitar for a member who wants Gible), as if the reward were known.
- A hideout shows the Pokémon caught; members may look for the leader.
- The grunt message carries a gallery of every possible catch: large, and it says more than is known.

## The rule for every picture

1. **Square.** Every picture is padded to a square with transparent edges, centred and not scaled up, as the raid eggs are (`scripts/eggs/make-eggs.ts`), so Discord's square thumbnail crops nothing.
2. **Known: the Pokémon.** When the Pokémon is known (a research reward named, a confirmation, a grunt lineup with one possible catch, a decoy with one), its picture.
3. **Not known: the encounter picture.** While it is not (a "one of", a grunt "not sure which", a lineup with two or more possible catches), the game's generic encounter picture (PokeMiners `Images/Quests/QuestPokemonReward.png`, 128×126, transparent). Matt: it says "this may not be yours" before a word is read.
4. **Items and Mega Energy:** their own picture, as today, padded.
5. **Leaders and Giovanni:** their portrait, Leek Duck's `assets/img/rocket/leader-cliff.png`, `leader-arlo.png`, `leader-sierra.png`, `boss-giovanni.png` (128×128, square already). Matt leans this way; the Pokémon caught stays in the text ("Cliff · catch Cubone").
6. **No picture** where there is none (a typed task without a reward, a feed without an image), as today.

## Where it applies

### The pinned post "Today at the stops"

- **A picture on every reward line** (each version of a task is a section with its own thumbnail), not one per task. The task's text is a line of its own above its versions. A task of one version keeps one block, as today.
- **"One of" lines** carry the encounter picture.
- **Hideouts:** a leader or Giovanni with the portrait; a decoy with its catch while the lineup has one, else the encounter picture.
- **A day too busy for one message:** the item and Mega Energy pictures go first, then the post spills into more messages as today; Pokémon pictures stay. (Each picture is a section and a thumbnail, about three of a message's 40 components.)

### Direct messages

- **Research:** a "one of" DM, the encounter picture; a reward's DM, that reward (padded); the confirmation, the Pokémon.
- **Rocket:** a grunt whose catch is open, the encounter picture; one possible catch, that Pokémon; a leader or Giovanni, the portrait. (Drawn by the same rule; not discussed apart.)

### The grunt message in a region channel

- **One picture beside the heading** (a section with a thumbnail) by the rule above; **no gallery**. "Catch one of …" stays in the text. The stop's Wayfarer photo stays beside "Where".
- Decoys and leaders have no message (they are hideouts in the pinned post).

### The post's layout and Discord's limits (review Q3, Q4)

- **Pictures per task:** at most 6 reward lines of a task carry a picture (Pokémon first, then items, in the list's order); the rest are text. Consecutive lines without a picture share one text display. A version with no stop shown (the post's 15-stop cap per task and its "…and N more stops" line) has no section and no picture. So a block stays well under a message's 40 components.
- **A busy day, decided for the whole post:** lay the post out with every picture; if that needs more than one message, lay it out again without the item and Mega Energy pictures (the encounter picture and the portraits count as Pokémon). If it still needs more, it spills as today. The same input always gives the same layout, so redraws do not flicker.

### During an event's window (Matt, 2026-10-23, after the review)

Under an intra-day event or a big event's hours the day's research stays in the post: members want to know what they can get as soon as the event's hours end. The window's tasks come first, with pictures. Below them a section **"Back at <time>, after <event>"** holds the day's tasks and stops, **without pictures**, so that they read as not on now, and a busy event day spills less. It replaces the single line "The day's research comes back at …". Hideouts belong to the day and stay as they are. Nothing changes in storage or in the decision.

### A busy day, after the whole-branch review (Matt, 2026-10-24)

No reported task is cut for pictures. The whole-post decision goes on step by step and takes the first layout that places every block: every picture; without item and Mega Energy pictures; one picture per task (its first pictured line); no pictures. Only when even that does not fit does the post spill and count tasks away as before. During an event's window the hideouts come before the section "Back at …", so that section is what is cut first.

### Narrowing and pictures (review Q9)

A grunt narrowed in place (8R-4L) takes the picture its new catches give (the encounter picture to the one Pokémon, or back). DMs already sent are not edited.

## How the pictures are served

*Default (Claude):* as the eggs, by the bot's web server.

- **A `StopPictures` service** (review Q1): an async `prepare(feedUrls)` fetches and pads what is missing, and a synchronous `url(feedUrl)` gives renderers the padded picture's address, or the feed's address while a picture is not ready or its fetch failed. The renderers stay pure and take `url` as a lookup. `prepare` runs where the pinned post is redrawn (after `POST_DELAY_MS`), and before the notifier's DMs and the grunt messages are sent. A failed fetch is remembered for a while, so an outage of Leek Duck is not tried again on every redraw.
- **Safety:** a fetch takes only the hosts the feeds' checks allow (`leekDuckPicture`'s `cdn.leekduck.com`, and the encounter picture's address), with a byte limit and sharp's `limitInputPixels`. The key is a hash of the source address, never the address itself.
- **Kept on disk** in `var/pictures/` (git-ignored; `/app/var` is the stack's writable volume), with a bound on its size, so a restart does not fetch everything again; the route's index is read from the folder. A picture is fetched again after 7 days, so a picture Leek Duck changes at the same address is renewed. Memory holds an index with a bound (`BoundedMap`).
- **The route:** `GET /pictures/<key>.png` for pictures the service made and nothing else, with the eggs' thirty-day cache and a `?v=` of the content.
- **Before the web server listens** (`serving()`) and **without a public address** (the web server off or local): the feed's address (cropped, as today), and PokeMiners' raw address for the encounter picture (128×126, almost square). No attachments: the pinned post may hold more pictures than a message's ten files, and every edit would carry them again (review Q2). A post drawn during the start's catch-up keeps the feed's addresses until its next redraw.
- **Leaders' portraits** are constants in `src/domain/rocket/` (they pass the same host check); one that fails to load shows no picture. The map's data follows the post: a hideout's picture is the portrait (`stop-report-view`, `web.md`), and the encounter picture's origin joins `pictureOrigins` (review Q6).

## The small fixes from the staging

1. **The DMs' reason line** for an item says "Rare Candy · Research", the shape of "Gible · Research" (today "Rare Candy (research)").
2. **"Pinned" leaves the answer:** every answer says `In the post "Today at the stops" of #…`. The bot cannot know whether the post will be pinned when it answers: the post is drawn a moment later, and an answer may name several channels (review Q7).
3. **A changed grunt** (a narrowing or another lineup): the answer says "Changed in #…", not "Posted in".
4. **`/want rocket`:** a whole-word match ranks above a match inside a word, so "Team GO Rocket" comes before Rowlet.
5. **"one of" in the task search** finds the "one of" choices.
6. **"Already reported" does not count against the throttle** (Matt), in `/research report`, "Same task at more stops…" and the map (today a 409 there is counted). *Default (Claude):* the same for `/rocket report` and its map route. A use that reports at any stop still counts, also when other stops were already reported (review Q8). On Discord the use is given back after the answer (a `UserError` with `givesBack` and `said`, or the router's give-back); on the map the research and Rocket "already" answers are given back as the `asks` answers are (`givenBackOnTheMap`).

7. **The post's name** (Matt, 2026-10-23, after the review): "Today at the stops" becomes **"Today's Stops"** everywhere: the post's heading and its "continued" line, the answers (fix 2 reads `In the post "Today's Stops" of #…`), the summary post's link, help texts and docs.

Not changed: "Loading options failed" once (Discord's side); the phone dialogs' missing Cancel (Discord's layout).

## Out of scope

- The map's page (its UX pass).
- Costumed rewards' pictures: they come from the feed as today, padded.
