# 8T-H: the split's confirmation as a dialog

Approved mockup: `.superpowers/sdd/2026-10-18-phase-8th-split-dialog/split-dialog-v4.html` (git-ignored; the conductor's dialog, one radio choice per group). It replaces the confirmation half of 8T's mockup (`split-v1.html`, section 2) and the part "The confirmation" of `2026-10-17-train-split-design.md`; everything else of 8T (what a split does, who may split what, `splitTrain`, `splitGroupAs`, the posts, 8T-F's one transaction, 8T-G's conductor) stays as it is.

## Why

Matt, 2026-10-18, at the second staging run of 8T: the private confirmation becomes a Discord dialog (modal), because "it also avoids having to scroll to find the reply to answer it". In a busy post the reply lands under everything else, and a member who pressed "Split group…" twice had two confirmations to answer (staging step 18). A dialog opens over the post at once, and Discord shows a member one dialog at a time.

## Goals

- "Split group…" on a train's post and `/group split letter:X` open a dialog in place of the private reply.
- The dialog says what the split does as the reply says it now.
- The conductor and staff, who may split several groups, pick one from a list that names who is in each group.
- After Submit, a short private answer: `Split off: <link>`, or the reason it was not.

## Non-goals

- No change to what a split does, who may split which group, the posts or the party state (version 11 stays; no migration).
- The other one-shot questions that become dialogs (Remove all…, `/delete`, the report post, gym delete, `/region remove`, `/location`) are the next plan, not this one.

## Anti-goals

- Submit must never split a group the member did not mean: nothing is picked when the conductor's dialog opens.
- A group renamed, or replaced by another under its letter, while the dialog was open is never split (the group's mark, `groupMark`, as now). Who is in the group is not part of the mark: who is in it at the moment of the split goes (8T's rule; see "Decided").

## The two dialogs

Title of both: `Split a group off the train`. Buttons: Discord's own Submit and Cancel (Cancel closes the dialog; nothing is said and nothing is split).

**One group** (the member may split exactly one group by the button, or `/group split letter:X` named the group, whoever asks, the conductor and staff included): one text display with today's confirmation text without its heading, the menu and the buttons:

> Group **B (Fast)** leaves **Saturday Loop** and becomes a train of its own, **Saturday Loop (Fast)**:
> - the same route, at the same stop (stop 3 of 7: Schenley Fountain), the same end mode, boss and start
> - Dawn, Iris and Cilan move to it as they are signed up now
> - it has no conductor; Ash stays the conductor of Saturday Loop
>
> Submit splits it off.

**Several groups** (the button, and the member may split two or more: the conductor and staff): a text display with what is the same for every group, then a radio group labelled `Group that leaves`, required, nothing picked:

> The group you pick leaves **Saturday Loop** and becomes a train of its own, named after the group (**Saturday Loop (A)**): the same route, at the same stop (stop 3 of 7: Schenley Fountain), the same end mode, boss and start. Its members move to it as they are signed up now. If group A leaves, you go with it as its conductor, and Saturday Loop has none then.
>
> **Group A** (4 trainers): Ash, Misty, Brock, Gary
> **Group B (Fast)** (3 trainers): Dawn, Iris, Cilan
> **Group C** (2 trainers): Max, May

One choice per group the member may split (`splittableGroups`), in the post's order: `Group B (Fast) · 3 trainers`, the group's name as now and how many trainers it has, guests counted as the post counts them; no description.

**Changed on 2026-10-20 (mockup v6, `.superpowers/sdd/2026-10-18-phase-8th-split-dialog/split-dialog-v6.html`, with v5 its measurements; Matt).** As first built (v4), each choice named its members (cut to 100 characters with `, and N more`) and had a second line with the new train's name and who leads which train. Matt: the second line said the same in every choice, and in-person trains of 40 to 50 people are split into groups of 16 to 18 to fit 20-person lobbies, where a choice could name only about 11 of 17. So who is in each group is now a line per group in the text, everybody named, and the choices only name the group. The new train's name is said once as an example. Who leads is said once, only for the groups whose new train somebody would lead (the conductor's own group, or that of staff in a group). Bullets, one name per line, were measured in the mockup and left out: with a 51-person train in three groups of 17 the phone dialog was about 3½ screens tall, the choices after about 2¾, against about 1⅓ screens with a line per group, the choices after one. When the lines would pass the text's 4,000 characters, every group names the same number and how many more.

A train has at most five groups (A–E) and a radio group holds 2 to 10 choices, so this always fits. The where-text and the conductor wording read `/settings privacy` of the member when the dialog opens (8T-G); the split reads it anew at Submit, as now.

Refusals do not open a dialog: a member who may split no group gets today's private reason (`whyNot`, `splitRefusal`) as a `UserError`.

## Submit

The dialog carries what the reply's controls carried, so that a group that changed in between is refused:

- the one-group dialog's custom id names the party, the group and its mark (`groupMark`), as `splitgo` does now;
- the several-groups dialog's custom id names the party; each choice's value is the group and its mark.

On Submit the answer is deferred privately (making the new post can take more than three seconds), then `splitGroupAs` runs with the mark as `drawn`, and the answer says:

- `Split off: <link to the new post>`;
- for the very group split off meanwhile by somebody else (`splitGroupAs`'s `already`): `Split off: <link>` as now, since what the member asked for is done (my call);
- for a group otherwise changed or gone meanwhile: `The groups of this train changed meanwhile: press Split group… again.` (in place of today's redraw of the confirmation);
- any other refusal: its text as now (`answer.text`); a refusal that is none of the member's doing gives the use back (`givesBack`, `said`), as now;
- a train that is over: `partyOver` as now;
- when the split throws: `The split did not work: nothing was split off.`, and the error goes on to the router, as now.

## What goes

- The private reply, its `splitgo`, `splitno` and `splitpick` controls, the "Splitting group B off…" note (Discord shows its own wait after Submit) and `NOTHING_SPLIT`.
- A press on a control of a confirmation drawn before the upgrade gets the router's stale answer (staging only; production never had the reply).

## Left to the builder

- How the modal and its submit are wired (a `modal` of the party's `ComponentHandler`, as `counters-dialog.ts` does), the custom ids' action names, and the throttles: opening counts as the press of "Split group…" does now, Submit as `splitgo` does now.
- Where the dialog's builder lives (`src/render/train-split.ts` is the natural place) and what becomes of `splitConfirmation` and `splitNote`.
- Tests for: each dialog's content, nothing preselected, labels cut to 100, Submit's outcomes above, the one-group dialog for staff by `/group split`, a refusal not opening a dialog.

## Checked on Discord

Discord's documentation does not say whether a dialog may hold only text (the one-group dialog has no input). Checked on the test server on 2026-10-18 (`var/stage/dialog-check.mts`, Matt): a dialog of one text display opens and submits (its submit carries only the text display), and so do the text with a required radio group of three choices (the value is the group's letter); with nothing picked, Discord itself refuses Submit ("This field is required."), so the bot never gets an empty pick and the text with a checkbox. The one-group dialog stays text only (the checkbox, a fallback, is not needed: "a checkbox form and only one choice was weird").

## Decided

- A change in who is in the group while the dialog is open does not refuse the split (Matt, 2026-10-18: "I think we allow the split"): who is in it at Submit goes, as 8T decided, though the dialog named those who were in it when it opened.

## Documents that change

`docs/architecture/trains.md` (the split's confirmation), `2026-10-17-train-split-design.md` (a pointer to this design), the 8T staging checklist's steps 5–7, 12, 17 and 18, and the follow-ups.
