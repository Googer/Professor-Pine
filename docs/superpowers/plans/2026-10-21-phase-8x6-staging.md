# Phase 8X-6 staging checklist: `/counters` for max battles (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member). The conventions are `docs/architecture/utilities.md` (`/counters`, the Pokebattler gateway). Pokebattler's max party endpoint is undocumented (its developer page lists other endpoints): a 400 or 404 from it may mean refused parameters as well as an unknown boss.

## Before

1. This build includes 8X-3 (party state version 13, migration 025): its checklist's step 1 applies. Matt deploys the commands (`/counters` gains the max tiers and `role:`): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`.

## Max teams

2. (Rewritten for plan 8X-I: Pokebattler's four roles, the Lobby link. Deploy the commands first, step 1: `/counters role:` offers Attacker, Defensive, Healer, Shielder.) `/counters boss:Azelf tier:Dynamax 5★` (or the current Dynamax 5★): the answer's head with the boss's picture and types, "your role: Attacker (an attacker and two chargers)" (the default) and the small print "Pokebattler’s suggested team, as its Lobby builds it"; one "**Attacker** · …" with "-# max phase only · <moves>" and two "**Charger** · …" with "-# fills the Max Meter · <moves>" (Hydreigon, Blissey and Metagross for Azelf on 2026-10-24), each with its picture; "Other attackers" and "Other chargers", five each; the small print with level 40, no weather, best friends and the Max move levels; Change options…, "Lobby on Pokebattler" and the credit. The button opens `https://www.pokebattler.com/max/<BOSS>/PARTY`, whose Attacker team (its "Your role" Attacker) matches. The log has no "max battle team had parts not of the shape known" warning.
3. Each other role, the button `/max/<BOSS>/PARTY` for every one: Defensive (one "**Attacker**", two "**Defender** · …" with "-# charges the meter, takes hits · …", "Other attackers" and "Other defenders"), Healer (one "**Healer** · …" with "-# heals the team · …", two Defenders, "Other healers" and "Other defenders"), Shielder (three "**Shielder** · …" with "-# shields and taunts · …", one "Other shielders"): each team's slots match the Lobby's for the same "Your role". Before the deploy (or on a client that still has the old list) an old choice answers as its new role, as the head line says: Attackers + charger, Balanced and All attackers as Attacker; Shielder and Healer as the new Shielder and Healer.
4. Levels 20 and 50 (the small print says the level used), weather Rainy, Windy and Fog, friendship none: each answers (no "Pokebattler does not know…"). Level 41 is refused in words.
5. `/counters boss:Machamp tier:Gigantamax` (or the current Gigantamax boss): Gigantamax attackers named "Gigantamax <name>" with their pictures; `boss:Gigantamax Machamp` without a tier the same; `boss:Uxie tier:Gigantamax` refused at once ("Uxie has no Gigantamax battle in the game…"), not counted (three more uses still go). `boss:Toxtricity tier:Gigantamax`: answers.
6. Refusals for a max tier, each uncounted: `moveset`, `shadow`, `mega`, a Pokébox level; `role:` with a raid tier.
7. In a max battle's post (report one with `/max`): `/counters` takes its boss and tier, answers in the post; `/counters boss:Uxie` in a Gigantamax battle's post is refused. In a train's post: the raid counters as before; a train boss that is no raid boss now asks for `tier:`.
8. Change options…: a dialog with role, level, weather, friendship; Submit by the asker updates the answer; by another member gives them a private copy.
9. A boss typed without a tier that is a max boss and no raid boss now (Uxie before 10-24): its max tier is taken; the `moveset` autocomplete offers nothing.

## Left over from 8B-2's staging

9a. **`/counters` in a raid train's post (from 8B-2 step 4a):** Matt, in a raid train that has a boss: the answer is public and is for the train's boss (raid counters); "Change options…" works as in a raid's post. (A Dynamax or Gigantamax train's post: 8X-4's checklist.)
9b. **A boss with many movesets (from 8B-2 step 6):** `/counters boss:Mew tier:T5`, or any boss with more than 24 movesets: "Boss moves" lists 25 options (the average and 24 movesets); pick the last one with `/counters moveset:` first, then open the dialog: that moveset is selected and among the 25.
9c. **A private answer in an ordinary channel (from 8B-2 step 7):** Googer, `/counters boss:<boss>` in a region channel, then `/counters boss:Uxie tier:Dynamax 5★` there: "Change options…" by Googer changes each private answer in its place (no second answer).
9d. **A Pokébox (from 8B-2 step 8):** Googer, with `/settings pokebattler-id` saved: in the bot's DM, `/counters boss:<boss> level:My Pokébox on Pokebattler`: a private answer, "with your best counters", nicknames and CP in the lines, "Your Pokébox on Pokebattler" in the small print, and the user number nowhere in the text. Its dialog offers "My Pokébox on Pokebattler", selected; a change updates the DM answer in its place. In a raid's post, Matt (with an id saved) picks the Pokébox in the dialog of his public answer: he gets a private answer, the public one stays. A member without an id sees no Pokébox in the dialog. For a max tier no dialog offers the Pokébox (and step 6 refuses it typed).
9e. **A raid that ends (from 8B-2 step 10):** a public answer in a post whose raid then ends (`/delete`, or wait): "Change options…" on it gives a private answer, and the archived post stays archived (not reopened). The same in a max battle's post that ends.

## The raid counters' link

10. `/counters boss:Yveltal` (or a current 5★): Full results opens `https://www.pokebattler.com/raids/YVELTAL?includeShadow=0&includeMegas=0` on the new site. Also a shadow raid (`/raids/<BOSS>_SHADOW_FORM`), a mega (`/raids/<BOSS>_MEGA`) and a boss outside the page's default tier (`tier:T3`): note what the site shows (the address carries no tier, level, weather or friendship).

## After

11. Record the results in the follow-ups file ("From the staging run of 8X-6").
