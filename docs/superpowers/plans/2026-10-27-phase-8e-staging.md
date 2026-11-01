# Phase 8E staging checklist: an elite raid blocks its gym

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Brief:** `.superpowers/sdd/2026-10-27-phase-8e-elite-blocks-gym/design.md`.
- **Ruling:** one raid per gym, of any kind (Matt, 2026-10-26: an elite raid shows its egg on the gym, usually the evening before).
- **Conventions:** `docs/architecture/parties-and-posts.md` ("Raids", the first point).
- **Gyms:** three gyms of one region, A, B and C, none of them with a raid, and a gym D of another region.

## Before

0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
1. **No migration, no command option change:** no deploy needed. `/location`'s changed sentence is its `/help` text, not its slash-command description.
2. **Tester's automatic status** is Interested (`/settings`), so that a join is visible in the post.

## Reports at a gym that has a raid of the other kind

3. **`/raid`, elite where a standard raid stands.** Googer: `/raid` a T5 egg at A with a hatch time. Tester: `/raid` an Elite egg at A with another hatch time. The answer: "There is already a raid at A. Its post is #…. You have been marked as interested." No second post; A's post is still a T5 egg with Googer's hatch time, and Tester is in it as interested.
4. **`/raid`, standard where an elite raid stands.** Googer: `/raid` an Elite egg at B with a hatch time. Tester: `/raid` a T5 boss at B with an end time. The same answer for B; B's post is still an Elite egg, its times unchanged, no boss named.
5. **A screenshot, elite at A.** `/raid screenshot:` with a screenshot of an elite egg at hand, `gym:` A and `time:` (its hatch time) typed, by a third account that is not in A's raid yet (Tester joined it in step 3, and a member already in the raid is told nothing new); without a third account, Tester leaves A's raid first. Before counting the step, check that the reply's reading names the raid Elite (an answer that read another tier proves nothing about the two kinds: try another screenshot). The reply: "There is already a raid at A. Its post is #…. You have been marked as interested." (or the automatic status of that account). A's post stays a T5 egg with Googer's hatch time.
6. **A screenshot, standard at B** (when a standard screenshot of B's gym is at hand, or with `/raid screenshot:` and `gym:` B typed; again a member not in B's raid): the same for B, which stays an elite egg.
7. **The map.** A's and B's popups show their raid and no "Report raid". Open "Report raid" at C on the map, then report an Elite egg at C on Discord with a hatch time, then send the map's form (a T5 egg): the answer under the form is "There is already a raid at C. …", the form closes and C's popup shows the elite raid; no second raid at C on Discord.

## Changes into a taken gym

8. **`/location` within the region.** In C's post, `/location gym:A`: "That gym already has a raid. Its post is #…."; the raid stays at C.
9. **`/location` to another region.** Report a raid at D (an Elite egg with a hatch time), then in A's post `/location gym:D`: refused at once in the same words, no dialog.
10. **A tier change at its own gym goes through.** In A's post, `/boss pokemon:` and pick "Elite egg" from the list: A's raid becomes an elite egg (its title `Elite egg · A`), its times worked out again; nothing is refused. Then `/boss pokemon:` "T5 egg": back to a standard raid.
11. **`/help location`:** "The gym must not have a raid already. …"

## An Elite egg needs its hatch time (review 8E-1)

12. **Refused without one, on Discord and on the map.** Tester: `/raid` an Elite egg at a free gym (a new one, or C after its raid was deleted) without `time:`: "An Elite egg shows when it hatches: give its hatch time, in minutes from now (`20`) or as a clock time (`6:15pm`)." No post. On the map, "Report raid" at that gym, pick the Elite egg and leave the time empty: the same words under the form (the backticks left out), no raid. An Elite boss (hatched) without a time is still taken; `/help raid` says "The time is optional, except for an Elite egg, which needs its hatch time".

## After

13. `/delete` every raid of the test.
