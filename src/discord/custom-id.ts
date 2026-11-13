/**
 * The custom ids of this bot's controls: `<kind>:<id>:<action>[:<arg>...]`, at most 100
 * characters, no part empty and none with a `:` in it. The second part is always an id: what
 * the control is about (a party's id, the token of a pending question).
 *
 * The buttons under a direct message have the kind `dm`, and their id is the snowflake of the
 * server the message is about: a press comes from a DM, which has no server of its own.
 * `dm:<server>:stop:<reason>` stops one reason the message came for; the reason is spelled as
 * `stopArgs` (`src/domain/notify/reasons.ts`) says: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`,
 * `ts:<level>`, `iv:perfect|zero`, `g:<gym id>`, `boss`, `train`. (The spec's example
 * `dm:stop:pokemon:150` had no id and no server; this replaces it.) Since plan 8R-4 a Pokémon's
 * or a tier's reason has `dm:<server>:change:sp:<dex>[:<form>]` or `…:change:st:<level>`, which
 * opens `/want`'s dialog for that server (`wantbox:…:set2:…:<server>:~<token>`).
 *
 * The controls of `/iam` without a role have the kind `roles` (`src/render/role-menus.ts`). A
 * menu is `roles:<group>:pick:<part>:<page>`: the id is the row id of the group it shows, or
 * `other` for the roles without a group; `part` says which part of a group that needs several
 * menus, `page` the page the message shows, so that it is shown again after the change. The
 * buttons that turn the pages are `roles:page:prev:<page>` and `roles:page:next:<page>`, with
 * the page the message shows. Nothing else about such a message is kept anywhere.
 *
 * The controls of `/gym` have the kind `gym` (`src/commands/gyms/controls.ts`), and their id is
 * the token of a pending request (`PendingRequests`), which holds what the staff member asked
 * for; only they may answer it. Under the question of `/gym add`: `gym:<token>:add`,
 * `gym:<token>:details` (opens the form) and `gym:<token>:cancel`; the form itself is
 * `gym:<token>:form`. The form of `/gym edit` is `gym:<token>:edit`. Under the refusal of
 * either form: `gym:<token>:reopen`, which opens the form again with what was typed. Under the question of
 * `/gym move`: `gym:<token>:move` and `gym:<token>:cancel`. Under the preview of `/gym import`:
 * `gym:<token>:wayfarer-import` and `gym:<token>:wayfarer-cancel`, whose token is one of the
 * import's own pending requests (`pendingImports`, `src/commands/gyms/import.ts`). Under its
 * outcome: `gym:<token>:outside-ask` ("Delete N gyms outside the area…"), and under the private
 * question it asks `gym:<token>:outside-delete` and `gym:<token>:outside-keep`, whose tokens
 * are in `pendingOutside` (the question's token is made of the outcome's: `questionToken`).
 *
 * The dialog of `/location` before a move to another region (plan 8Q) is
 * `location:<party id>:move:<gym id>:<counted at>`: the raid (whose post it must be submitted
 * in), the gym, and when the router counted the use of `/location` (`carriesOn`, plan 8S-4).
 *
 * The buttons of the view of `/gym show` have the kind `gymview` (`src/commands/gyms/view-controls.ts`),
 * and their id is the number of the gym: `gymview:<gym id>:edit` (opens the form of `/gym
 * edit`), `gymview:<gym id>:elite:1|0` (Make elite / Not elite: what it sets), `gymview:<gym id>:move` (opens the
 * form `gymview:<gym id>:place`) and `gymview:<gym id>:delete` (opens the dialog of `/gym
 * delete`, plan 8Q, whose Submit is `gymview:<gym id>:delete` as well, from `/gym delete` too).
 * Nothing else is kept anywhere.
 *
 * The buttons of `/gym review` have the kind `gymreview` (`src/components/gym-review.ts`), and
 * their id is the row id of an item of the review queue (`GymReview.id`), found again for the
 * presser's server: `gymreview:<id>:same:<Wayfarer id>` and `gymreview:<id>:new:<Wayfarer id>`
 * (a candidate is the gym; a candidate is added as a gym), `gymreview:<id>:none`,
 * `gymreview:<id>:keep`, `gymreview:<id>:unlisted` (not in Wayfarer), `gymreview:<id>:delete`
 * (asks first), under that question `gymreview:<id>:confirm` (the deletion) and
 * `gymreview:<id>:back` (to the item), and `gymreview:<id>:skip`. A Wayfarer id is 32 hex digits, a dot and up to three digits, so
 * the longest is 62 characters.
 *
 * The controls of `/region` have the kind `region` (`src/commands/regions/controls.ts`), with
 * the token of a pending request as the id, as for `/gym`. Under the preview of `/region
 * import`: `region:<token>:import` and `region:<token>:cancel`. The dialog of `/region remove`
 * (plan 8Q) carries the region's row id instead of a token: `region:<region id>:remove`, its
 * radio group `forum` (`keep` or `delete`), or `region:<region id>:remove:keep` where the forum
 * can only be kept; either ends in a per-open token `:~<token>` (`openToken`, 2026-10-22), which
 * its Submit leaves out.
 *
 * The buttons under the list of `/admin cleanup-legacy` have the kind `cleanup`
 * (`src/commands/admin/cleanup-legacy.ts`), with the token of the pending list as the id:
 * `cleanup:<token>:delete` and `cleanup:<token>:cancel`.
 *
 * The controls of the operators' `/operator forget` have the kind `forget`
 * (`src/commands/operator/forget.ts`, plan 8G), with the token of the pending look as the id:
 * `forget:<token>:ask` ("Remove…" under the look, which opens the question) and
 * `forget:<token>:remove` (the question's dialog, whose Submit removes).
 *
 * The controls of `/admin settings` have the kind `server` (`src/commands/admin/server-settings.ts`,
 * plan 19A-1), with a setting's key as the id: `server:panel:show` (the menu of the sections),
 * `server:<key>:set` (a channel, category, role or units menu: the value picked, none clears),
 * `server:<key>:set:on|off` (a feature's button: what it sets), `server:<key>:ask` (opens the
 * dialog `server:<key>:set:~<token>`); the flagged words too many to show in a dialog
 * `server:flaggedWords:ask` (the dialog `server:flaggedWords:add:~<token>`) and
 * `server:flaggedWords:ask:remove` (`server:flaggedWords:remove:~<token>`); `server:<key>:unset`
 * (Leave unset, of a setting the settings file named and the fill did not find, which asks),
 * `server:<key>:unset:confirm` (which writes) and `server:<key>:keep` (Keep it closed). The server
 * is the interaction's.
 *
 * The controls about a screenshot have the kind `shot` (`src/commands/screenshots/shot-kind.ts`).
 * With the id of a kept screenshot (twelve URL-safe characters): `shot:<id>:right`,
 * `shot:<id>:wrong` (which opens the form `shot:<id>:form`) and `shot:<id>:show`. With the token
 * of a pending question about the gym of a screenshot posted with a mention of the bot:
 * `shot:<token>:gym` (the menu) and `shot:<token>:cancel`. The button "Screenshot feedback" of a
 * raid's post is the party's own, `party:<party id>:shot`.
 *
 * The controls of a party have the kind `party` and the party's id (`PARTY_ACTIONS`,
 * `src/render/party-controls.ts`). The private panel behind "Manage train…" before plan 8X-G
 * (`party:<id>:move`, which opens Move… since; the panel's controls answer as stale) carried where the train was when it was drawn
 * (`<place>`: the `stopHandle` of its stop, `end` once the route is finished; plan 8X-4: a
 * stop's handle is a gym's id, or the first 8 hex characters of an FNV-1a hash of a power spot's
 * Wayfarer id, `src/domain/party/stops.ts`, checked against the route when pressed: a handle
 * that matches no stop or two is `route-changed`): the moves
 * `party:<id>:next|previous|skip:<place>:<target>` (the handle of the stop the move leads to,
 * or `end`) and `party:<id>:finish:<place>`, `party:<id>:reverse:<place>:<first>` ("Reverse
 * the route"; `<first>` the handle of the stop the route began with, so that a panel reverses
 * it once), and the select menu of what the train does at the end of its route
 * `party:<id>:atend:<place>`, whose value is `finish`, `loop` or `turn-back`. A press decides
 * anew against that place. The menu of the train's kind is `party:<id>:kind` (plan 8X-4; no
 * place: the kind does not depend on where the train is), its value `raid`, `dynamax` or
 * `gigantamax`.
 * "Split…" (`party:<id>:split`, plan 8T) opens a dialog (plan 8T-H): of one group
 * `party:<id>:splitform:<group>:<mark>` (the group's letter and `groupMark`, so that a Submit
 * for a group called otherwise, gone, or given its letter again after a split is refused), of
 * several `party:<id>:splitform`, whose radio group's value is `<group>:<mark>`; both end in a
 * per-open token `:~<token>` (`openToken`, 2026-10-22), which `submitSplit` leaves out.
 * Plan 8X-1B: Interested, Join and Here of a newcomer to a post of several groups open
 * `party:<id>:joinform:<maybe|join|here>[:~<token>]` (the button pressed), whose radio group `group` is `any`
 * or `<group>:<stamp>` (the group's letter and when it was opened, in base 36: a letter can be
 * given again once its group went); "Group…" is `party:<id>:regroup` and its dialog
 * `party:<id>:regroupform[:in][:new | :<group>:<stamp>][:~<token>]` (`in` where it was drawn for a member
 * signed up, `Change group`; then the one way where it asks nothing), its
 * radio group `group` (`new` or `<group>:<stamp>`) and line `label`; "Meet…" is
 * `party:<id>:meet`, its dialog a kind of its own, `meet:<party id>:time:<group>:<stamp>[:~<token>]`, so
 * that its Submit counts in `/meet`'s window, its menu `time` (a moment in ms, or `none`). The
 * letter Join of a post drawn before, `party:<id>:group:<letter>`, still joins its letter.
 * Manage… of a train is `party:<id>:manage`, its dialog a kind of its own,
 * `tmanage:<id>:manageform:…`, so that a Submit with a start counts in `/meet`'s window.
 * Plan 8X-F: the three dialogs end in a per-open token, `:~<when it opened, base 36>`
 * (`openToken`, `src/discord/dialog.ts`: Discord's client keeps a pick per custom id), which
 * their Submits leave out; one drawn before without it submits as before.
 *
 * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
 * (`/targets`; the kinds `wants` and `targets` are the dialogs of `/unwant-all` and
 * `/untarget-all`, `wants:all:remove` and `targets:all:remove`, plan 8Q), and their id is the page the list shows, from 0: `wantlist:<page>:prev`,
 * `wantlist:<page>:next`, `wantlist:<page>:all` ("Remove all…") and
 * `wantlist:<page>:remove:<what>`, where `<what>` is spelled as for the stop buttons of a DM
 * (`stopArgs`: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`, `ts:<level>`, `iv:…`, `g:<gym id>`).
 * Nothing about a list is kept anywhere: a press reads the member's list anew.
 *
 * The buttons under an answer of `/rank` have the kind `rank`, the Pokémon's catalogue key as the
 * id, and everything the ranking they show is made of as the rest:
 * `rank:<key>:show:<league>:<a>-<d>-<s>:<filter>:<0|1>` (the last: the evolution line shown).
 * Nothing is kept anywhere else (`rankButtonId`, `src/render/pvp-rank.ts`).
 *
 * The buttons under the private answer of `/stats regions` (plan 8H-5) have the kind `stats` and
 * the tally as the id: `stats:regions:show:<period>:<note|none>` (another period, in the answer
 * itself; the last part carries whether the answer's note about Share is shown) and
 * `stats:regions:share:<period>` (the tally posted in the channel), the period `month`, `year`
 * or `all` (`src/commands/stats/stats.ts`). Nothing is kept anywhere else.
 *
 * The controls of a page of `/help` have the kind `help`; the id is the kind of page they are on
 * (`overview`, `group`, `command`), the action which page (a category, a command's path), and
 * the first argument what the control does: `help:overview:group` (the menu of groups),
 * `help:group:<category>:command` and `…:more` (the menus of a group's commands),
 * `help:group:<category>:overview`, `help:command:<path>:back`, `…:overview` and `…:subgroup`
 * (`HELP_PAGES`, `src/commands/util/help-render.ts`).
 *
 * The form `/meetup` opens for a meetup's information (plan 8S-1) is `meetup:<token>:form`: the
 * token is that of what the command was used with (name, place, start), kept for half an hour
 * (`src/commands/meetups/meetup.ts`). The buttons of the moderators' post of a meetup held for
 * them have the kind `msafety` and the request's UUID as the id:
 * `msafety:<request id>:approve|approve-once|refuse|refuse-forever|block`
 * (`src/components/meetup-safety.ts`); the request is read from the database. Appeals of a
 * meetup block have the kind `mappeal` (`src/components/meetup-appeal.ts`): Appeal under the
 * refusal of a blocked member is `mappeal:<server>:open` and its form `mappeal:<server>:form`
 * (the server's snowflake), Lift block and Keep block on the moderators' post of an appeal
 * `mappeal:<appeal id>:lift|keep` (its UUID).
 *
 * Reports to the moderators (plan 8S-2): the form of a report is `report:<party id>:party`
 * (`/report`, the Apps menu on a party's post) or `report:<token>:message` (the Apps menu on
 * another message, kept under the token); the buttons of a report's post in the moderators'
 * channel are `mreport:<report id>:close|refuse|block|delete|dismiss` (its UUID); an action that
 * ends a party asks in a dialog (plan 8Q) `mreport:<report id>:<action>` with the radio group
 * `removal` (`archive` or `delete`), or `mreport:<report id>:<action>:archive` where the bot may
 * not delete the post, and the button Archive post under a deletion refused at Submit is
 * `mreport:<report id>:<action>:archive`. The dialog of staff's `/delete` is
 * `pclose:<party id>:close[:archive]`, as a report's. The dialogs (not the button Archive post)
 * end in a per-open token `:~<token>` (`openToken`, `removalDialog`, 2026-10-22), which
 * `removalOf` leaves out. Delete on the moderators' notice of a max
 * battle at a pin is `maxpin:<party id>:delete` (`src/components/max-pin.ts`), which opens that
 * dialog.
 *
 * The owner's buttons under the DM of a request for the Wayfarer export tool (plan 8W-P) are
 * `scriptaccess:<row id>:approve|refuse:<asked at>` (`src/components/script-access.ts`): the row
 * of `ScriptAccess`, read from the database at the press, and the time of the asking the DM was
 * drawn for in base 36 (a request asked again after a refusal is not decided by an old DM).
 *
 * "Change options…" under an answer of `/counters` is `counters:<token>:options`, and the dialog
 * it opens `counters:<token>:dialog`: the token is that of the answer's options, kept for a day
 * (`keptCounters`, `src/commands/util/counters.ts`).
 *
 * The controls of the panel of `/settings` (plan 8S-5, `src/commands/settings/panel.ts`) have the
 * kind `settings` and the setting as the id: `settings:<setting>:set:on|off` sets it to what the
 * button showed it would (`mentions`, `groups`, `shouts`, `train-moves`, `boss-set`,
 * `new-train`, `history`, `leaderboard`), the menus `settings:auto-status:set` and
 * `settings:privacy:set` to the value picked, `settings:history:set:off` may ask first in the
 * dialog `settings:history:forget`, `settings:pokebattler:ask` opens the dialog
 * `settings:pokebattler:set:~<token>`, and `settings:wants:show` / `settings:targets:show`
 * answer with the member's list. The member and the server are the interaction's.
 */
export const MAX_CUSTOM_ID_LENGTH = 100;
const SEPARATOR = ':';

export interface CustomId {
  kind: string;
  id: string;
  action: string;
  args: string[];
}

export function encodeCustomId(parts: {
  kind: string;
  id: string;
  action: string;
  args?: string[];
}): string {
  const all = [parts.kind, parts.id, parts.action, ...(parts.args ?? [])];
  for (const part of all) {
    if (part === '') throw new Error('custom id parts must not be empty');
    if (part.includes(SEPARATOR)) throw new Error(`custom id part "${part}" contains ":"`);
  }
  const raw = all.join(SEPARATOR);
  if (raw.length > MAX_CUSTOM_ID_LENGTH) {
    throw new Error(
      `custom id is ${raw.length} characters; Discord allows ${MAX_CUSTOM_ID_LENGTH}`,
    );
  }
  return raw;
}

/**
 * As `encodeCustomId`, but undefined for an id that would be longer than Discord allows: for a
 * control whose id carries something of varying length (a catalogue key) and that is knowingly
 * left out when it does not fit. An empty part or a `:` in one still throws.
 */
export function encodeCustomIdIfFits(parts: {
  kind: string;
  id: string;
  action: string;
  args?: string[];
}): string | undefined {
  const length = [parts.kind, parts.id, parts.action, ...(parts.args ?? [])].join(SEPARATOR).length;
  return length > MAX_CUSTOM_ID_LENGTH ? undefined : encodeCustomId(parts);
}

/** Returns undefined for anything not produced by encodeCustomId. */
export function decodeCustomId(raw: string): CustomId | undefined {
  const [kind, id, action, ...args] = raw.split(SEPARATOR);
  if (!kind || !id || !action || args.some((a) => a === '')) return undefined;
  return { kind, id, action, args };
}
