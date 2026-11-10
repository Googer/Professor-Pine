# Campfire meetups: links only (design)

Matt, 2026-10-28: Pine points members to the official Campfire meetups (Scopely's Community Ambassador and Community Leader meetups) with links. It never fetches anything from Campfire.

Research: `var/research/campfire/notes.md` (git-ignored). In short:
- Campfire's discover map reads a GraphQL API without a login.
- Scopely Explore's terms (§6, last modified 2026-07-15) forbid bots, crawlers and data-mining tools, and forbid anything that would "extract, scrape, or index the Services or Content".
- The detail answers also carry members' ids and names.
- A layer fed by polling is therefore out, for the same reason as the official game map: by hand only, never automated.

## What is built

1. **One constant.** `CAMPFIRE_DISCOVER_URL = 'https://campfire.scopely.com/discover'`, in one module that both the bot and the web page can import (the page imports pure modules of `src/domain/`).
   - The link cannot point at a region: the site keeps the chosen location to itself and takes no center in its address. The visitor picks the area on Campfire.
   - No setting: the link is the same for every instance and every server.

2. **`/meetup`'s help.** One sentence at the end of `details`, in the help's own voice:
   > "Official meetups by Community Ambassadors are on Campfire: https://campfire.scopely.com/discover"

   Only `/help meetup` and its autocomplete text change; the command's options and replies stay as they are.

3. **The web map.** One line at the foot of "What's going on":
   - **Where:** the desktop's side pane, and the phone's List view.
   - **Words:** "Official meetups: Campfire", a link that opens in a new tab with `rel="noopener noreferrer"`.
   - **Shown:** whenever the Meetups layer is offered, also to visitors who are logged out or not members. It is public and says nothing about the server.
   - **Built:** as a node through `renderNode`, like every other link on the page.
   - **Not touched:** the layer registry, the counts and the list's groups.

4. **Members' own Campfire links.** Nothing is built.
   - A bare `https://campfire.scopely.com/discover/meetup/<id>` typed into a meetup's information, or into `/info`, already shows as a link in the post (`plain()` keeps bare addresses).
   - In DMs it is broken on purpose (`plainNoLinks`), as for every member's text.

5. **A guard.** A unit test reads the sources under `src/` and `packages/` and refuses `niantic-social-api` and `campfire.scopely.com/graphql`, so a later change cannot start fetching by accident. It follows the pattern of `src/text-distances.test.ts`.

## Not built

- **A map layer of Campfire meetups, or anything that polls.** Refused by the terms. It would also need one request per meetup for the names, and would receive members' personal data.
- **Matching Pine's meetups to Campfire's.** It would need the data.
- **An "On Campfire" button on a meetup's post** when its information holds a Campfire meetup link. It is possible without any fetch, but it adds a control to a crowded post for a link that already works in the text. Open question 2.

## Rulings (Matt, 2026-10-28)

1. **Where the web link sits:** at the foot of the list, as above, not in the Layers sheet or "More".
2. **No "On Campfire" button** on a meetup's post, for now.

The design is approved.

## Size and checks

One small plan, perhaps one or two tasks:
- the constant and the help sentence (help tests);
- the list's foot line (a `list-ui` or `what-is-on` test, and the phone header test if the pane's height changes);
- the guard test.

There is no migration, no setting, no Discord command change to deploy, and no staging beyond a look at `/help meetup` and the page on desktop and phone.
