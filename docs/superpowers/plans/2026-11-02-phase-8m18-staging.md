# Staging of 8M-18: `/admin tutorial`

Needs Matt's go-ahead (a deploy of the commands, then Discord). On the test server.

1. In a new text channel, run `/admin tutorial`: the course posts in order, nobody is pinged, the answer says how many.
2. Run it again: "updated", no duplicates. **This proves Discord gives the container's `id` back on a read**, which its reference does not say; if it duplicates instead, the mark must change.
3. Read it on the desktop and a phone, light and dark: the headings, the numbered steps, the icons against the real post's buttons.
4. In a channel of a region, the moderators' channel and a thread: refused, nothing posted.
5. Deny Read Message History, then Send Messages, in the channel: refused, naming it.
6. Deny Use External Emojis in the channel: do the custom icons still show? A gone emoji shows as `:name:`. If so, name that permission in `TUTORIAL_NEEDS`.
7. With another bot-made message and somebody's message in the channel: both untouched after a run.
8. Check every instruction by doing it once: the mention with a screenshot, `/raid`, the buttons, `/want`, `/target`, `/train` with `/route add`, `/meetup`.
