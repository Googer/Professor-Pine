/**
 * What the live map's trains read and send (plan 8M-5, spec 3.7), as the page reads it. Types
 * and lists alone, with no import of the server's code: the page's bundle (`src/web/client/`)
 * takes them.
 */

import type { MapAtEnd, MapTrain, MapTrainKind } from './party-data.js';

export type { MapAtEnd, MapTrainKind };

/** The kinds of train, in the order `/train kind:` and Manage…'s menu offer them (plan 8X-5). */
export const MAP_TRAIN_KINDS: readonly MapTrainKind[] = ['raid', 'dynamax', 'gigantamax'];

/** What a train may do at the last stop of its route, in the order `/train` offers them. */
export const MAP_AT_ENDS: readonly MapAtEnd[] = ['finish', 'loop', 'turn-back'];

/**
 * The moves the map presses (`POST /s/<guild>/api/trains/<id>/move/<move>`, body
 * `{ from, target }`). Finish, Reverse, the mode and the kind are Manage…'s (plan 8M-8C, R1: the
 * presses `finish`, `reverse`, `at-end` and `kind` of the old panel answer 404).
 */
export const PANEL_PRESSES = ['next', 'previous', 'skip'] as const;
export type PanelPress = (typeof PANEL_PRESSES)[number];

/**
 * A choice of a train's form on the map (plan 8M-8C), as its Discord dialog has it
 * (`DialogOption`): its value, its words, the line under them (the description), and the emoji a
 * menu shows before them.
 */
export interface MapFormOption {
  value: string;
  label: string;
  line?: string;
  emoji?: string;
}

/** A choice of a train's form: its label over the options, and the one picked to start with. */
export interface MapFormChoice {
  label: string;
  options: MapFormOption[];
  picked?: string;
}

/**
 * What Manage… showed, sent back with its Submit (plan 8M-8C, as the dialog's custom id carries
 * it): where the train was (`placeOf`), the stop the route began with (`stopHandle`, `-` without a
 * route), the mode and the kind it showed picked. Only what is picked otherwise is applied.
 */
export interface ManageShownBody {
  from: string;
  first: string;
  atEnd: MapAtEnd;
  kind: MapTrainKind;
}

/**
 * Manage… on the map (plan 8M-8C, `GET /s/<guild>/api/trains/<id>/manage`), as the post's dialog
 * is drawn now (`manageForm`): its title, its text as text of the page, "The route" where more
 * than Keep is left, "At the end of the route" (not for a train without a route), "What the
 * train is mainly for", the start and end as they are for who may arrange the train, whose
 * lines the page draws (a dialog of Discord has no room for an end), and what it showed.
 */
export interface MapManage {
  title: string;
  text: string;
  route?: MapFormChoice;
  atEnd?: MapFormChoice;
  kind: MapFormChoice;
  /** `zone`: the server's, which reads what is typed. */
  times?: { zone: string; startTime: number | null; endTime: number | null };
  shown: ManageShownBody;
}

/**
 * Split… on the map (plan 8M-8C, `GET /s/<guild>/api/trains/<id>/split`), as the post's dialog is
 * drawn now for the member (`splitForm`): its title, its text as text of the page (what becomes
 * of the group, who moves and who leads; with several, who is in each group, a line each), and
 * either the one group it asks about with its mark (`only`: Submit splits it) or the choice of
 * the group that leaves (`choice`, nothing picked; each value `<group>:<mark>`).
 */
export interface MapSplit {
  title: string;
  text: string;
  only?: { group: string; mark: string };
  choice?: MapFormChoice;
}

/**
 * The Submit of Split… on the map (`POST …/split`): the group by its letter and the mark the form
 * was drawn with (`groupMark`), so that a group called otherwise or gone since is refused.
 */
export interface SplitBody {
  group: string;
  mark: string;
}

/**
 * The Submit of Manage… on the map (`POST …/manage`): what it showed, and what is picked (the
 * route left out where the form had none, the mode for a train without a route).
 */
export interface ManageBody {
  shown: ManageShownBody;
  picked: { kind: MapTrainKind; route?: 'keep' | 'reverse' | 'finish'; atEnd?: MapAtEnd };
}

/**
 * Taking the conductor role and giving it up (or taking it off another, for staff), as
 * `/conductor set` and `/conductor clear` do (`POST …/conductor/<change>`, body `{ who }`: whose
 * the role was when the page drew the button, `ConductorSeen`).
 */
export const CONDUCTOR_CHANGES = ['take', 'give-up'] as const;
export type ConductorChange = (typeof CONDUCTOR_CHANGES)[number];

/**
 * Whose the conductor role was as the page drew a train (`MapConductor.who`, `none` for null):
 * a conductor's button carries it, and one drawn when it was another is refused.
 */
export const CONDUCTOR_SEEN = ['none', 'other', 'you'] as const;
export type ConductorSeen = (typeof CONDUCTOR_SEEN)[number];

/**
 * What starting, arranging or moving a train answers: whether it was done, the command's words
 * as plain text, and the train as the member now sees it on the map, when there is one to show
 * (also after a refusal, so that the page draws it as it is now).
 */
export interface TrainAnswer {
  ok: boolean;
  text: string;
  train?: MapTrain;
  /**
   * A refusal of what was typed (a time of Manage… that cannot be read, or two out of order), with
   * nothing changed: the form stays, with what was picked, though its other refusals close it.
   */
  keepsForm?: true;
}

/**
 * The edits of a train's route the map makes (`POST /s/<guild>/api/trains/<id>/route/<edit>`),
 * each as its `/route` subcommand does it. Every one but `forget` carries the route it was drawn
 * from (`drawn`, the train's `route` as the page had it).
 */
export const ROUTE_EDITS = ['add', 'remove', 'move', 'clear', 'save', 'load', 'forget'] as const;
export type RouteEdit = (typeof ROUTE_EDITS)[number];

/** A route the member saved for the region of a train, as the map lists it. */
export interface SavedRouteView {
  /** What a load or a forget names. */
  id: number;
  /** Empty for a route of the legacy bot saved without one. */
  name: string;
  stops: number;
  atEnd: MapAtEnd;
}

/** The member's saved routes of a train's region (`GET /s/<guild>/api/trains/<id>/routes`). */
export interface SavedRoutesView {
  routes: SavedRouteView[];
}

/**
 * The body of a new train (`POST /s/<guild>/api/trains`): the region it is made in (any region
 * of the server, by id as `/api/geo` lists it), its name, when it starts as `/meet` takes it (a
 * clock time, a date and a time, or `in 30`), what it does at the end of its route, and its kind.
 */
export interface TrainStartBody {
  region: number;
  name: string;
  time?: string;
  atEnd?: MapAtEnd;
  /** What it goes to (plan 8X-5, as `/train kind:`); left out: raids. */
  kind?: MapTrainKind;
}
