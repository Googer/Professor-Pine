# Phase 8R-2 staging checklist: Team GO Rocket reports (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member). The conventions are `docs/architecture/stop-reports.md` and `notifications-and-dms.md`. Run after (or with) 8R-1's checklist; the lineups are ScrapedDuck's on the day.

## Before

1. This build includes 8R-1 (migration 027) and 8R-2's migration **028**. Matt deploys the commands (`/rocket` new; `/want`'s targets): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`.
2. The log at start has the Rocket lineups read (or taken from the database).

## Grunts

3. Tester, `/rocket report who:<a grunt type> stop:<an East stop>`: the private answer names the stop, what can be caught and when it goes, with Take back; East's channel gets the grunt's message (the grunt, a gallery of the catches, the stop with its address and picture, the reporter). With the decoy: note how the single-catch gallery looks (decision 9).
4. The same grunt type at the same stop: "Already reported" with a link to the message; nothing posted, no DM.
5. Another grunt type at that stop: the first message is deleted at once, the new one posted; the answer says what it replaced.
6. After 30 minutes the message is gone. A restart within the 30 minutes: the message stays and goes at its time.
7. Take back on the answer, and `/rocket remove stop:` by Tester (own) and by Googer (anyone's): the message goes. An old answer's Take back after a newer report of the same grunt: the newer one stays.
8. A stop in two regions (if the test server has one): a message in each channel.

## Hideouts

9. Googer, `/rocket report who:Arlo stop:<an East stop>`: no message; the pinned post "Today at the stops" gets a Team GO Rocket hideouts section with Arlo at that stop (made if the day had no post). Giovanni's choice says to report him only when sure.
10. Tester, a grunt at Arlo's stop: a dialog "Arlo was reported here today … Replace Arlo's report with the … grunt?" **on Android and on iPhone**; Cancel reports nothing; Submit replaces Arlo (the post drops him) and posts the grunt.
11. A hideout at a grunt's stop replaces it without asking; the grunt's message goes.
12. The pinned post with research and hideouts both, and spilling into a second message on a busy day.

## Wants and DMs

13. Tester, `/want target:dragon` (choose Dragon-type grunt), `any leader`, `giovanni`, `decoy`: written at once, no dialog; `/wants` lists them. `/want target:no type` finds "Grunt (no type)"; `none` typed in full is still zero IVs.
14. Googer reports a Dragon-type grunt: Tester gets one DM at once with a link to the message and the note about one DM an hour per grunt type; a second Dragon grunt elsewhere within the hour: no DM. Googer (the reporter) gets none.
15. Googer reports Cliff: Tester (any leader) gets a DM linking to the pinned post; Cliff again at the same stop: no second DM.
16. `/want target:<a Pokémon in today's lineups>`: the Shadow box shows; ticked, a grunt with it among its catches DMs Tester.
17. A DM's Stop buttons take the Rocket targets off; `/unwant`, `/unwant-all` too.

## Rehearsal mode

18. With rehearsal mode on: a grunt report posts no message; the answer says until when; DMs only to the allowlist and without a link.

## After

19. Record the results in the follow-ups file ("From the staging run of 8R-2").
