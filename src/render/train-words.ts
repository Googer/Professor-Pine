import type { TrainAtEnd, TrainKind } from '../domain/party/party.js';
import {
  currentStop,
  destinationOf,
  nextStop,
  routeFinished,
  turnAhead,
} from '../domain/party/train.js';
import { count, endSentence, memberText, type NamedMember } from './text.js';
import type { TrainPlaces } from './train-post.js';
import { stopInWords, stopLink, type PostStop } from './train-stops.js';
import { TRAIN_KIND_WORDS } from '../domain/web/party-data.js';

/**
 * What a train of each kind is called (plan 8X-4; design 6.1), worded once for every place that
 * names it, the map's data among them (plan 8X-5: kept in `src/domain/web/party-data.ts`, which a
 * page may take).
 */
export { TRAIN_KIND_WORDS };

/** What setting the kind on the map answers (plan 8X-5): `This train is a Gigantamax Train now.` */
export function trainKindSentence(kind: TrainKind): string {
  return `This train is a ${TRAIN_KIND_WORDS[kind]} now.`;
}

/**
 * The question the kind answers, in `/train kind:`'s hint and over Manage…'s menu (plan 8X-G,
 * Matt 2026-10-22): a train's stops can be gyms or power spots whatever its kind.
 */
export const TRAIN_KIND_QUESTION = 'What the train is mainly for';

/** A kind as a choice of `/train kind:` and Manage…'s menu name it (plan 8X-G). */
const TRAIN_KIND_CHOICES: Readonly<Record<TrainKind, string>> = {
  raid: 'Raids',
  dynamax: 'Dynamax Battles',
  gigantamax: 'Gigantamax Battles',
};

/** A kind as a choice of `/train kind:` and Manage…'s menu name it: `Dynamax Battles`. */
export function trainKindChoice(kind: TrainKind): string {
  return TRAIN_KIND_CHOICES[kind];
}

/** One line under a kind's option in the panel's menu: what the kind changes. */
export const TRAIN_KIND_DESCRIPTIONS: Readonly<Record<TrainKind, string>> = {
  raid: 'Members choose their groups themselves',
  dynamax: 'Lobbies form on the spot: the groups have no size',
  gigantamax: 'Join fills the groups up to a Gigantamax lobby',
};

/**
 * The words of what a train does at the end of its route (`TrainAtEnd`), worded once for every
 * place that names it: the choices of `/train`'s option `at-end`, Manage…'s menu and the map's
 * panel, the lines of the post and `/route show`.
 */

/** What a choice or a menu option is called. */
export const AT_END_LABELS: Readonly<Record<TrainAtEnd, string>> = {
  finish: 'Finish',
  loop: 'Loop',
  'turn-back': 'Turn back',
};

/** One line under the menu option. */
export const AT_END_DESCRIPTIONS: Readonly<Record<TrainAtEnd, string>> = {
  finish: 'The train stops at the last stop',
  loop: 'After the last stop comes the first',
  'turn-back': 'The route is run backwards from the end',
};

/** A sentence of what the train does at the end of its route (`/route show`, a loaded route). */
export function atEndSentence(atEnd: TrainAtEnd): string {
  switch (atEnd) {
    case 'finish':
      return 'At the end it finishes the route.';
    case 'loop':
      return 'At the end it loops back to the first stop.';
    case 'turn-back':
      return 'At the end it turns back and runs the route backwards.';
  }
}

/** How a line says the mode was set: "set the train to …". */
export function atEndSetWords(atEnd: TrainAtEnd): string {
  switch (atEnd) {
    case 'finish':
      return 'to finish at the last stop';
    case 'loop':
      return 'to loop';
    case 'turn-back':
      return 'to turn back at the end';
  }
}

/**
 * The labels of the options of Manage…'s menu of what the train does at the end of its route
 * (and of the panel before plan 8X-G): Discord shows the chosen one alone while a menu is
 * closed, so each says it in full (the choices of `/train` keep the short `AT_END_LABELS`).
 */
export const AT_END_MENU_LABELS: Readonly<Record<TrainAtEnd, string>> = {
  finish: 'Finish at the last stop',
  loop: 'Loop: back to the first stop',
  'turn-back': 'Turn back at the end',
};

/** The emoji of the options of the menu of what the train does at the end of its route. */
export const AT_END_EMOJI: Readonly<Record<TrainAtEnd, string>> = {
  finish: '🏁',
  loop: '🔁',
  'turn-back': '↩️',
};

/** The emoji of the options of the menu of the kind of a train. */
export const TRAIN_KIND_EMOJI: Readonly<Record<TrainKind, string>> = {
  raid: '⚔️',
  dynamax: '🔴',
  gigantamax: '🌋',
};

/**
 * What Next does from where the train is, in words: `Next is X`, and at the last stop `It is
 * the last stop: Next finishes the route`, `Next goes round to X` (a loop) or `Next turns back to
 * X`. `link` shows a stop.
 */
function nextWords(view: TrainPlaces, link: (stop: PostStop) => string): string {
  const { party } = view;
  const next = nextStop(party);
  if (next === undefined) return 'It is the last stop: Next finishes the route';
  const where = link(view.stop(next));
  switch (turnAhead(party)) {
    case 'round':
      return `Next goes round to ${where}`;
    case 'back':
      return `Next turns back to ${where}`;
    default:
      return `Next is ${where}`;
  }
}

/**
 * Where a member moves a train from (plan 8X-H, G3): a typed command (`/previous`), or the post's
 * Move… (which has no Previous of its own: the dialog offers it), on Discord and on the live map
 * alike since plan 8M-8C (R1: the map's panel with its Previous button is gone).
 */
export type TrainSurface = 'command' | 'post';

/** What takes a finished route back, named as the member has it where they moved the train. */
const BACK_FROM_THE_END: Readonly<Record<TrainSurface, string>> = {
  command: '`/previous`',
  post: 'Move…',
};

/** Of a finished route: what takes the train back, and to where. */
function finishedWords(
  view: TrainPlaces,
  link: (stop: PostStop) => string,
  surface: TrainSurface,
): string {
  const { route } = view.party.train;
  const back = destinationOf(view.party, 'previous').stop;
  const ref = route[back];
  return (
    `The train has finished its route of ${count(route.length, 'stop')}. ` +
    endSentence(
      `${BACK_FROM_THE_END[surface]} takes it back to stop ${back + 1}: ` +
        (ref === undefined ? '' : link(view.stop(ref))),
    )
  );
}

/** What is said of a train without a route, in the answer to a command and in Manage…. */
export const NO_ROUTE_YET = 'This train has no route yet. Add its stops with `/route add`.';

/**
 * Where a train is on its route and what comes next, as a member is told it in the answer to a
 * move (`/next` and the others, Move…'s and Manage…'s Submit, on Discord and on the map). Of a
 * finished route it says where Previous leads, which is how a Finish that was a mistake is taken
 * back: to the stop the train was at, or to the last stop of a route that remembers none;
 * Previous named as the member has it there (`surface`: `/previous` or Move…).
 */
export function whereText(view: TrainPlaces, surface: TrainSurface): string {
  const { party } = view;
  const { route, stop } = party.train;
  if (route.length === 0) return NO_ROUTE_YET;
  const link = (shown: PostStop) => stopLink(shown);
  if (routeFinished(party)) return finishedWords(view, link, surface);
  const at = currentStop(party);
  const here = endSentence(
    `The train is at stop ${stop + 1} of ${route.length}: ${at === undefined ? '' : link(view.stop(at))}`,
  );
  return `${here} ${endSentence(nextWords(view, link))}`;
}

/** How a train got to where it is, for the message that tells the members. */
export interface Movement {
  /**
   * On to a stop, back to one, on past one, to the end of the route, round from its end to its
   * start (a loop), or back along it from its end (a train that turns back).
   */
  kind: 'to' | 'back' | 'skip' | 'finished' | 'round' | 'turn';
  /** The stop the train is at now (not for `finished`), as it is now. */
  at?: PostStop;
  /** The stop that was left out, for `skip`, and for `round` and `turn` by a skip. */
  skipped?: PostStop | undefined;
  /** The stop the train turned back at, for `turn`. */
  turnedAt?: PostStop | undefined;
  /** The member who moved the train. */
  by: NamedMember;
}

/** A stop that cannot be named in a movement (none was given). */
const UNKNOWN_STOP = '**an unknown stop**';

/**
 * What the post is told when the train has moved: where it is going, with the link to the
 * place, and who moved it. The mentions of the members are the caller's.
 */
export function movementText(movement: Movement): string {
  const by = `Moved by ${memberText(movement.by)}.`;
  if (movement.kind === 'finished') return `The train has finished its route. ${by}`;
  const where = movement.at === undefined ? UNKNOWN_STOP : stopLink(movement.at);
  // A sentence that ends with a place ends once (plan 8X-F: "Inc.." read twice).
  if (movement.kind === 'back')
    return `${endSentence(`The train is moving back to ${where}`)} ${by}`;
  const skipping =
    movement.kind !== 'to' && 'skipped' in movement
      ? `, skipping ${movement.skipped === undefined ? UNKNOWN_STOP : stopInWords(movement.skipped)}`
      : '';
  if (movement.kind === 'round') {
    return `${endSentence(`The train is going round again, back to ${where}${skipping}`)} ${by}`;
  }
  if (movement.kind === 'turn') {
    const turned = movement.turnedAt === undefined ? UNKNOWN_STOP : stopInWords(movement.turnedAt);
    return `${endSentence(`The train is turning back at ${turned}, on to ${where}${skipping}`)} ${by}`;
  }
  return `${endSentence(`The train is moving to ${where}${skipping}`)} ${by}`;
}
