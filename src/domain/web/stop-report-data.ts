/**
 * What the live map's reports at stops read and send (plan 8R-3; design 8, 9.16), as a page reads
 * it. Types, lists and their words alone, with no import of the server's code: a page's bundle
 * (`src/web/client/`) may take them.
 */

import type { Unconfirmed } from '../stops/unconfirmed.js';

/** A stop as a report keeps it (its snapshot: still shown when the stop is renamed or gone). */
export interface MapStop {
  /** The stop's key: a Wayfarer id, or `pine-<id>` for a stop of Pine's own. */
  key: string;
  name: string;
  /** Its address line; null for none. */
  address: string | null;
  /** To six decimals. */
  lat: number;
  lon: number;
}

/**
 * A reward of a task, or a Pokémon a Rocket report can give: what it is (`encounter`, an `item`,
 * Mega Energy as `energy`), its name, `value` (what a filter matches and `/want` names: the
 * value of a reward's choice, `pokemon:<catalogue key>`, `item:<item key>`, `energy:<dex>`; null
 * for one the game data does not know), how many (0 where none is said, and for an encounter),
 * whether it can be shiny, and its picture where the page may load it.
 */
export interface MapReward {
  kind: 'encounter' | 'item' | 'energy';
  name: string;
  value: string | null;
  quantity: number;
  shiny: boolean;
  image?: string;
}

/** What every report on the map has. */
interface MapStopReportBase {
  /**
   * The report's id: what `POST …/stop-reports/<id>/remove` takes back, and a research report's
   * `sameAs` in `POST …/research` reports again at more stops while it stands (once it is gone,
   * a listed one's by its `task` with `more: true`: review R4, F3).
   */
  id: number;
  stop: MapStop;
  /**
   * When it was made, epoch milliseconds: with `id` its version (plan 8R-4L, review L1: a grunt
   * refined in place keeps its id), sent back as the take-back's `madeAt`.
   */
  madeAt: number;
  /** When it ends, epoch milliseconds. */
  endsAt: number;
  /** Who reported it, by the name shown then, as text ("a member" where none was kept). */
  reporter: string;
  /** Whether this member may take it back here: their own, or any for staff; never read-only. */
  mayTakeBack: boolean;
  /**
   * Where it is on Discord: the message of the post "Today’s Stops" in the board that holds a
   * task or a hideout, a grunt's own message; absent where there is none the member may see.
   */
  link?: string;
  /**
   * What Find on the map finds it by (plan 8M-12, `reportSearch` of `src/domain/stops/`): its
   * words folded as `searchTokens` reads them, each once (research: the task's and every
   * reward's, a Pokémon's form and costume; Rocket: who, the lineup's Pokémon, `rocket`).
   */
  words: string[];
}

/**
 * Why a report is not confirmed (plan 8M-12): the domain's `Unconfirmed`
 * (`src/domain/stops/unconfirmed.ts`, a type without imports, which `reportSearch` gives).
 */
export type MapUnconfirmed = Unconfirmed;

/**
 * What Find says of a report not confirmed (plan 8M-12): "not confirmed: one of 6 encounters",
 * "reward not reported", "not confirmed: one of 2 lineups".
 */
export function unconfirmedWords(unconfirmed: MapUnconfirmed): string {
  switch (unconfirmed.kind) {
    case 'one-of':
      return `not confirmed: one of ${String(unconfirmed.count)} ${unconfirmed.encounters ? 'encounters' : 'rewards'}`;
    case 'no-reward':
      return 'reward not reported';
    case 'not-sure-which':
      return `not confirmed: one of ${String(unconfirmed.count)} lineups`;
  }
}

/**
 * Field research reported at a stop, of the period on now: the task's text (`typed`: a member
 * typed it in full, no task of the list), its category (null for a typed one), `task` its
 * version (plan 8R-5: `<task key>:<reward hash>` for one reward, the task's key alone for "one
 * of"; `typed:<key>[:<hash>]` for a typed one: the same version at several stops has the same),
 * its rewards (the one reward, or those "one of" stands for), and whether it is "one of" (`oneOf`,
 * R13: the reward is not known yet; a report of before plan 8R-5 with every reward of its task is
 * one too). The same version at more stops ("Same task at more stops…") is reported by sending
 * the report's `id` as `sameAs` while it stands; once it is gone (narrowed or replaced since), a
 * listed report's `task` as the report's `task` with `more: true` (review R4, F3: asked about and
 * answered as more stops; a typed one's `task` is no task of the list, and is refused). A bare
 * key of before plan 8R-5 whose rewards are only items names no one reward: `PICK_THE_REWARD`.
 */
export interface MapResearch extends MapStopReportBase {
  task: string;
  text: string;
  category: string | null;
  typed: boolean;
  oneOf: boolean;
  rewards: MapReward[];
  /**
   * The rewards in short as the post's reward line says them (plan 8M-9B, `rewardLine`): `Rare
   * Candy ×3`, `one of Dratini, Bagon, Axew +4`; empty for a typed task without its reward.
   */
  rewardText: string;
  /**
   * The picture of its reward line in the post of the stops (plan 8M-9B, B2: the one reward's, the
   * encounter picture for "one of"; none for a typed task without its reward), as the post names
   * it, only where the page may load it.
   */
  picture?: string;
  /** Why it is not confirmed (plan 8M-12): "one of" its rewards, or no reward said. */
  unconfirmed?: MapUnconfirmed;
}

/**
 * A grunt reported at a stop, for its half hour: who (`grunt:water`; a lineup `grunt:water:male`),
 * its name (the type's), the catches, and a lineup's label (plan 8R-4L, B9: its first slot in
 * short, `Magikarp, Feebas`), which the page shows beside the name; the gender never.
 */
export interface MapGrunt extends MapStopReportBase {
  who: string;
  /**
   * Its grunt type's key (plan 8M-9B, `typeKeyOf`: a lineup's `grunt:water:male` is
   * `grunt:water`), which a filter by grunt type matches.
   */
  typeKey: string;
  name: string;
  catches: MapReward[];
  lineup?: string;
  /**
   * Its picture as its message shows it (plan 8M-9B, B2: the one catch's, else the encounter
   * picture), only where the page may load it: the popup shows it, the marker the Rocket icon.
   */
  picture?: string;
  /** A type of two lineups reported "not sure which" (plan 8M-12): not confirmed. */
  unconfirmed?: MapUnconfirmed;
}

/**
 * A hideout reported at a stop for the day (a leader, Giovanni, the decoy): who (`leader:arlo`,
 * `giovanni`, `decoy`), its name, the catches, and its picture as the post of the stops shows it beside
 * the hideout (plan 8R-6: a leader's or Giovanni's portrait, a decoy's one catch or the encounter
 * picture; only from `pictureOrigins`).
 */
export interface MapHideout extends MapStopReportBase {
  who: string;
  name: string;
  catches: MapReward[];
  picture?: string;
}

/**
 * Today's reports at the stops of a server as the member may see them
 * (`GET /s/<guild>/api/stop-reports`): the research of the period on now (`event`: the research
 * event whose tasks these are, null on an ordinary day), how many of the day's research reports
 * wait under an intra-day event's window and when they come back (`waiting`, as the post of the stops
 * says it), the grunts standing, the day's hideouts; the posts' zone.
 */
export interface StopReportsView {
  zone: string;
  event: string | null;
  research: MapResearch[];
  waiting: { stops: number; at: number } | null;
  grunts: MapGrunt[];
  hideouts: MapHideout[];
  /** Discord cannot be reached just now: what the list says may be old (polled as without a stream). */
  readOnly: boolean;
}

/**
 * A version of a task as `/research` offers it (plan 8R-5, R13): its value (what a report sends
 * as `task`), its label (`Gible`, `Rare Candy ×3`, `one of Gible, Larvitar, Beldum`), and
 * whether it is "one of".
 */
export interface ResearchVersionOption {
  value: string;
  label: string;
  oneOf: boolean;
  /**
   * The rewards it stands for (plan 8M-9B, review F2: `TaskVersion.rewards`, a reward listed twice
   * once; "one of" its encounters), their pictures as the task's rewards name them.
   */
  rewards: MapReward[];
}

/**
 * A task as `/research` lists it (`GET /s/<guild>/api/research-options`): its key, text,
 * category, rewards, and its versions (plan 8R-5: one per reward, then "one of"), whose value a
 * report sends as `task`.
 */
export interface ResearchTaskOption {
  key: string;
  text: string;
  category: string;
  rewards: MapReward[];
  versions: ResearchVersionOption[];
}

/**
 * The pick lists of a research report: the task list in the page's order, whether it is out of
 * date (`stale`: not read for `settings.research.staleAfterHours`, or never; a task missing from
 * it is typed in full), when it was read, and the rewards a typed task may name besides a
 * Pokémon (`reward`: a value of these, or a Pokémon by `pokemon:<catalogue key>` or its name);
 * the most stops a report names (`maxStops`, `/research report`'s stop options) and the longest
 * task or reward typed in (`maxTyped`), the server's own numbers (branch review W4).
 */
export interface ResearchOptionsView {
  stale: boolean;
  readAt: number | null;
  maxStops: number;
  maxTyped: number;
  tasks: ResearchTaskOption[];
  rewards: Array<{ value: string; name: string }>;
}

/**
 * What the map says of a report naming more stops than `most` (`maxStops`): the research form
 * under itself, and `POST …/api/research`'s 400 (re-review X3 of 8M-9B).
 */
export function stopsAtMost(most: number): string {
  return `A report names ${String(most)} stops at most.`;
}

/**
 * One of a grunt type's two lineups as the map offers it (plan 8R-4L, B9): its key
 * (`grunt:water:male`), the value a report sends as `who` (`<key>#<fingerprint>`, refused as
 * `LINEUPS_CHANGED` once a rotation changed it), its label (the first slot in short, `Magikarp,
 * Feebas`; the gender is never shown), its fingerprint and its catches.
 */
export interface RocketLineupOption {
  key: string;
  value: string;
  label: string;
  fingerprint: string;
  catches: MapReward[];
}

/**
 * Who of Team GO Rocket `/rocket` offers (`GET /s/<guild>/api/rocket-options`): its key (what a
 * report sends as `who`), its name, the catches, whether it is a hideout (it holds its stop all
 * day), and a note to show with it (Giovanni's: report him only when sure). A grunt type of two
 * lineups lists them (`lineups`, plan 8R-4L), in the feed's order; the type's own key is then
 * "not sure which", its catches both lineups'.
 */
export interface RocketWhoOption {
  key: string;
  name: string;
  hideout: boolean;
  catches: MapReward[];
  note?: string;
  lineups?: RocketLineupOption[];
}

/**
 * The pick list of a Rocket report: `/rocket`'s choices in its order; `stale` (not read for
 * `settings.rocket.staleAfterHours`, or never) and when it was read, as the tasks'.
 */
export interface RocketOptionsView {
  stale: boolean;
  readAt: number | null;
  choices: RocketWhoOption[];
}

/**
 * What a report or a take-back on the map answers (`POST …/research`, `POST …/rocket`,
 * `POST …/stop-reports/<id>/remove`): whether it was done, the command's words as plain text, the
 * research reports made (`research`) or the Rocket report made or standing (`grunt`, `hideout`)
 * as the map shows them to the member; for a grunt where a hideout stands, the question
 * (`text`) and the hideout to say Replace to (`asks.replacing`: send the report again with it).
 * Research (plan 8R-5): the reports standing already at stops named (`already`, R8: also a 409
 * where every stop was), and where it contradicts other members' reports, the question (`text`)
 * and those reports (`asks.reports`, R7: send it again with `replacing`, the ids of those to
 * replace; the others keep theirs); those the map does not show the member (in a region they are
 * kept out of, or all where they cannot be shown just now) only by their ids and stops'
 * names (`asks.hidden`, review R5), which `replacing` takes alike.
 */
export interface StopReportAnswer {
  ok: boolean;
  text: string;
  research?: MapResearch[];
  already?: MapResearch[];
  grunt?: MapGrunt;
  hideout?: MapHideout;
  /** Rocket's: `replacing`; research's: `reports`, and `hidden` where any is not shown. */
  asks?: { replacing?: number; reports?: MapResearch[]; hidden?: HiddenReport[] };
  /**
   * The machine part of a refusal a page acts on (plan 8M-9B, B4; the words are only shown):
   * `ended`, the report `sameAs` named is gone (`REPORT_ENDED`: send a listed one's `task` with
   * `more`); `list-changed`, the task list or the lineups changed under the choice
   * (`TASK_LIST_CHANGED`, `LINEUPS_CHANGED`: ask for the pick lists again); `already`, a 409 of
   * a report standing already (every stop of a research report; the same grunt), given back as
   * on Discord: the form closes, whether or not the map shows the member what stands (branch
   * review W2).
   */
  reason?: 'ended' | 'list-changed' | 'already';
}

/** A contested report the map does not show the member (review R5): its id and its stop's name. */
export interface HiddenReport {
  id: number;
  stop: string;
}
