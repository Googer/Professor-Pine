# Meetup safety: design (plans 8S-1, 8S-2)

Brainstormed with Matt on 2026-10-17. Builds on plan 8D (party posts with a Where section; a meetup's place is a snapshot of a gym, PokéStop or power spot, or a pin). Research behind it: https://claude.ai/artifact/VLqQhTqtYy6PqW7BNK8V5W and the follow-ups section "Meetup safety".

## Why

A meetup is announced in a semi-public server. Somebody could use one to send people to a private home: one of a member, or of somebody who is not on Discord and does not play. `/delete` alone is not enough, since it waits for somebody to ask, and moderators rarely notice on their own. So a meetup at a place that might be private is held for a moderator, and nothing is posted until one approves it.

It has never happened with the legacy bot's meetups; this is a precaution (Matt), more needed now that meetups are easier to find on the web map. So the safeguard should stay light: few requests for moderators, and nothing slower for the usual meetup at a park or a gym.

## Matt's decisions

### The lighter rule (Matt chose it over zoning data; the data is a later option)

- **Pins** (a maps link or coordinates) always need a moderator's approval. An approval of a pin counts for that meetup only, never for the spot.
- **Wayspots** (a gym, PokéStop or power spot): allowed, unless the name looks like a front-yard feature: a little free library, apartments, a home business. Niantic refuses private homes as Wayspots, so these leftovers are the risk. A flagged Wayspot needs a moderator's approval.
- **Place rulings** override the name rule. A Wayspot a moderator approved is allowed for good. A place a moderator refused "from now on" is refused for good.
- **Meetups only**, not raids or trains.
- **Staff skip the check:** a meetup made by an admin, a moderator or the owner (`isStaff`) is posted at once, wherever it is. So the shared check takes whether the maker is staff, and so does 8M-5's call of it.
- **No zoning or OpenStreetMap data, and no web map layer.** If pin requests swamp the moderators, the zoning version of the research can come later.

### `/meetup` changes (8S-1, on top of 8D)

- `/meetup` asks every time for: name, place (`near`, now **required**), start time and description. The description is entered in the same form `/info` opens. Today the start and description come later in the post; now they come at creation, because the moderators need them and a held meetup has no post.
- A meetup's place never changes after creation. Meetups have no `/location` (raids keep it) and no separate free-text "where": details like "inside, by the children's section" go in the description. 8D's review fixes already make the place fixed and drop "where"; 8S makes `near`, the start and the description required.
- After posting, `/info`, `/name`, `/meet` and `/end` work as today. An edited description is not reviewed again: the Report button (8S-2) and `/delete` cover that.

### What the member sees

- **Allowed place:** the meetup is posted at once, as today.
- **Place that needs approval:** a private reply says the meetup "needs a moderator's approval" and that they will be told by DM. Nothing is posted, and nobody else sees anything. The member is never told why.
- **Refused place:** "A meetup can't be held there." No request is made.
- **Outcome by DM:** approved (with a link to the post), refused, or expired.

### The moderators' channel

- Configured as `settings.channels.moderation` (a channel name, like the other channels). It must be staff-only and never the public bot updates channel (Matt).
- **Unset:** meetup safety is off: every place is allowed as today, and there are no requests or blocks. The bot's start logs a warning, and `cutover-check` warns.
- **One components-v2 post per request**, showing:
  - who asked, named with `memberText`, so a moderator can open their profile and DM them;
  - the place, with its kind, title, address and a Map link;
  - the meetup's name, start time and description.
- **Buttons:**
  - **Approve:** posts the meetup and allows the place for good. Not offered for a pin.
  - **Approve once:** posts the meetup without a ruling.
  - **Refuse:** no meetup, no ruling.
  - **Refuse from now on:** no meetup, and the place is refused for good.
  - **Block member:** refuses this request and blocks the member, see below.
- Only staff may press: admins, moderators and the owner (`isStaff`, as for `/delete`). Others are refused privately.
- Once decided, the post is edited to the outcome and who decided, with the buttons gone. The first decision wins; a second press is told it was already decided.

### Expiry

- A request expires after 48 hours or an hour before the meetup's start, whichever comes first.
- An expired request's post is edited to "Expired" and the member is told by DM.

### Blocking and appeals

- A block stops the member from creating meetups on that server, by command and from the web map alike (the block is part of the shared check), and lasts until a moderator lifts it.
- Blocking also refuses the member's other pending requests (their posts edited, no DM for each beyond the one about the block) and closes their active meetups (Matt). These end as `/delete` ends them, with a line saying the moderators closed it.
- A blocked member who tries `/meetup` is told they can't create meetups on this server, with an **Appeal** button.
- **Appeal** opens a form ("Why should the block be lifted?"). The appeal goes to the moderators' channel as a components-v2 post with **Lift block** and **Keep block**.
- The member is told the outcome by DM.
- One open appeal at a time. After a Keep block, no new appeal for seven days.

## 8S-2 (after 8S-1)

- **Report** on a meetup's post: a member sends the meetup (place and description) to the moderators' channel.
  - Throttled; one report per member and meetup.
  - Moderators can refuse the place from now on (if it's a Wayspot), close the meetup, block its maker, or dismiss the report.
  - Matt's rule: a reported place that is refused is refused for good.
- **`/admin places`:** the rulings (allowed, refused, by whom, when), pending requests, blocked members and open appeals, with undo or lift for each.

## Constraints

- 8S-1 is prototyped on 8D after its review fixes. The 8D session confirmed on 2026-10-17 that those fixes keep `/location` for raids only, remove meetup `where` everywhere (also from state version 10), and fix a meetup's place at creation. It will report the model as planned. 8S rebases onto 8D's merge.

- CLAUDE.md applies throughout:
  - components-v2 everywhere;
  - controls through `custom-id.ts`, with their own guards and throttles;
  - `DmSender` for every DM;
  - repositories own column names;
  - additive migrations, numbered by the next free number at merge (the wayfarer session may take 019; tell it);
  - text members wrote shown through `plain()`, and in DMs through `plainNoLinks`.
- Requests, rulings, blocks and appeals live in the database and survive a restart. A press on a request post after a restart must still work (no `PendingRequests` for them).
- The check is a pure function in `src/domain/`: (place, rulings, flagged names) → allowed, needs review, or refused.
- 8M-5 (wayfarer session: meetups from the web map) must call the same check, and may end in "sent to the moderators" instead of a post. Tell that session the check's signature once planned.
- Never contact Discord without Matt's go-ahead. Staging is a checklist Matt runs with the bot on the test server.

## Calls left to the builder (Claude's, not Matt's)

- **Flagged names:** a default list of words and phrases in code (from the research: little free library, apartment(s), condo(s), townhome(s), residence, private, home business types), matched case-insensitively on word boundaries in the Wayspot's title. A server can add words with a settings list.
- **Rulings are kept per server**, keyed by the place's kind and id: the gym id, or the Wayfarer id of a stop or power spot. A pin has no ruling.
- **A start too soon to review:** if the place needs approval and the request would expire at once (the start is less than an hour away), the member is told the place needs a moderator's approval and to pick a start at least two hours ahead.
- **The moderators' post can't be sent** (no channel found, no permission): the member is told the meetup could not be sent for approval and to try later. This is logged; nothing is stored.
- **Approval checks again:** on approval the meetup is made through the usual `PartyService.createMeetup`. A failure there (no forum, a bad name) is told to the moderator and the member, and the request is marked failed.
- **Throttle:** `/meetup`'s throttle counts requests like meetups.
- **Withdrawing:** the member can't withdraw a pending request in 8S-1.
- **Rehearsal mode:** the moderators' channel is found like any other channel.
- **Documentation:** a new architecture file, `docs/architecture/meetup-safety.md`, added to the area index; `/help`, the guides and the settings example updated.
