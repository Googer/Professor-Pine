import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import {
  dialog,
  openToken,
  type DialogChoice,
  type DialogField,
  type DialogOption,
} from '../discord/dialog.js';
import { startTimeOf } from '../domain/party/timed.js';
import { clockTime, zoneLabel } from '../domain/web/clock.js';
import {
  TRAIN_AT_END,
  TRAIN_KINDS,
  type TrainAtEnd,
  type TrainKind,
  type TrainParty,
} from '../domain/party/party.js';
import { sameStop, stopHandle, type StopRef } from '../domain/party/stops.js';
import {
  cannotMove,
  cannotReverse,
  currentStop,
  destinationOf,
  nextStop,
  placeOf,
  routeFinished,
  targetOf,
  turnAhead,
} from '../domain/party/train.js';
import type { ControlIconName } from '../domain/pogo/game-icons.js';
import { customIconText, PARTY_KIND, type ControlIcons } from './party-controls.js';
import { count, endSentence, plain, truncate } from './text.js';
import type { TrainPlaces } from './train-post.js';
import { stopLabel } from './train-stops.js';
import {
  AT_END_DESCRIPTIONS,
  AT_END_EMOJI,
  AT_END_MENU_LABELS,
  NO_ROUTE_YET,
  TRAIN_KIND_DESCRIPTIONS,
  TRAIN_KIND_EMOJI,
  TRAIN_KIND_QUESTION,
  trainKindChoice,
} from './train-words.js';

/*
 * The dialogs of a train's post (plan 8X-G; design talk of 2026-10-22): Move… (`moveDialog`)
 * and Manage… (`manageDialog`), in the place of the Manage train panel. A post control that
 * needs more input opens a dialog (Matt, 2026-10-22).
 */

/** What a dialog of a train is drawn from: its places, and when it opens (the per-open token). */
export interface TrainDialogView extends TrainPlaces {
  now: number;
  /** The application's emoji, for the kinds of Manage…'s menu (`trainKindEmoji`). */
  icons?: ControlIcons;
}

/** The application's emoji of the kinds of a train that have one: the game's max icons. */
const TRAIN_KIND_ICON: Readonly<Partial<Record<TrainKind, ControlIconName>>> = {
  dynamax: 'pinedmax',
  gigantamax: 'pinegmax',
};

/**
 * The emoji of a kind of train in Manage…'s menu: the application's emoji of the game's Dynamax
 * or Gigantamax icon as message text where it has one, else the plain one (`TRAIN_KIND_EMOJI`).
 */
export function trainKindEmoji(kind: TrainKind, icons: ControlIcons = {}): string {
  const icon = TRAIN_KIND_ICON[kind];
  return (icon === undefined ? undefined : customIconText(icons, icon)) ?? TRAIN_KIND_EMOJI[kind];
}

/**
 * The action of Move…'s dialog: `party:<id>:moveform:<place>[:<move>:<target>]:~<token>`, the
 * move and where it leads in the custom id when it is the one move left (no choice: a radio
 * group takes two to ten).
 */
export const MOVE_FORM = 'moveform';

/** The radio group of Move…'s dialog; a choice is `<move>:<target>` (`targetOf`). */
export const MOVE_INPUT = 'move';

/** The moves Move… offers; Finish is Manage…'s. */
export const DIALOG_MOVES = ['next', 'previous', 'skip'] as const;
export type DialogMove = (typeof DIALOG_MOVES)[number];

export function isDialogMove(value: string | undefined): value is DialogMove {
  return (DIALOG_MOVES as readonly (string | undefined)[]).includes(value);
}

/** Discord's room for a choice's label and its description. */
const CHOICE_ROOM = 100;
/** The room of each of the two stops a Skip names in its label. */
const SKIP_NAME_ROOM = 40;

/** A move Move… offers: where it leads, its choice's label, and the sentence of Submit alone. */
export interface OfferedMove {
  move: DialogMove;
  target: string;
  label: string;
  /** The names whole, where the label had to cut them; undefined where it did not. */
  description: string | undefined;
  /** What Submit does, where this is the one move left: `Submit moves it to **X**.` */
  sentence: string;
}

/** A stop by its label (`stopLabel`), raw: a choice shows no markdown. */
function labelOf(view: TrainPlaces, ref: StopRef | undefined): string {
  return ref === undefined ? 'an unknown stop' : stopLabel(view.stop(ref));
}

/** A stop in the dialog's text: its label in bold, made plain, no link. */
function boldOf(view: TrainPlaces, ref: StopRef | undefined): string {
  return `**${plain(labelOf(view, ref))}**`;
}

/** A label of a prefix and a name, the name cut to fit; with the whole name where it was cut. */
function named(prefix: string, name: string): { label: string; description: string | undefined } {
  const label = `${prefix}${truncate(name, CHOICE_ROOM - prefix.length)}`;
  return {
    label,
    description: label === `${prefix}${name}` ? undefined : truncate(name, CHOICE_ROOM),
  };
}

/** What Next does from where the train is, as Move… offers it. */
function nextMove(view: TrainPlaces): OfferedMove {
  const { party } = view;
  const target = targetOf(party, 'next');
  const next = nextStop(party);
  if (next === undefined) {
    return {
      move: 'next',
      target,
      label: 'Next: finish the route',
      description: undefined,
      sentence: 'Submit finishes the route.',
    };
  }
  const name = labelOf(view, next);
  const bold = boldOf(view, next);
  switch (turnAhead(party)) {
    case 'round':
      return {
        move: 'next',
        target,
        ...named('Next: round to ', name),
        sentence: endSentence(`Submit takes it round to ${bold}`),
      };
    case 'back':
      return {
        move: 'next',
        target,
        ...named('Next: turn back to ', name),
        sentence: endSentence(`Submit turns it back to ${bold}`),
      };
    default:
      return {
        move: 'next',
        target,
        ...named('Next: ', name),
        sentence: endSentence(`Submit moves it to ${bold}`),
      };
  }
}

/** What Previous beside "Next: turn back to" says it does (plan 8X-H, G2, Matt 2026-10-23). */
export const UNDO_DESCRIPTION =
  'Back one stop, still heading for the end: undoes a Next made by mistake';

/**
 * Where Previous takes the train, as Move… offers it; of a finished route, by its number. At the
 * last stop of a turn-back route Next turns back to the very stop Previous goes to, but the route
 * reversed (`train.ts`: Next reverses it, Previous keeps the direction): Previous is the undo of
 * a Next made by mistake, after which the train still heads for the end, and says so (review
 * R10: both stay).
 */
function previousMove(view: TrainPlaces): OfferedMove {
  const { party } = view;
  const to = destinationOf(party, 'previous');
  const ref = to.route[to.stop];
  const target = targetOf(party, 'previous');
  if (!routeFinished(party) && turnAhead(party) === 'back') {
    const prefix = 'Previous: back to ';
    const suffix = ' (undo)';
    return {
      move: 'previous',
      target,
      label: `${prefix}${truncate(labelOf(view, ref), CHOICE_ROOM - prefix.length - suffix.length)}${suffix}`,
      // The name whole, where cut, is Next's description: the same stop.
      description: UNDO_DESCRIPTION,
      sentence: endSentence(`Submit takes it back to ${boldOf(view, ref)}`),
    };
  }
  if (routeFinished(party)) {
    const number = `stop ${String(to.stop + 1)}`;
    return {
      move: 'previous',
      target,
      ...named(`Previous: back to ${number}, `, labelOf(view, ref)),
      sentence: endSentence(`Submit takes it back to ${number}, ${boldOf(view, ref)}`),
    };
  }
  return {
    move: 'previous',
    target,
    ...named('Previous: ', labelOf(view, ref)),
    sentence: endSentence(`Submit takes it back to ${boldOf(view, ref)}`),
  };
}

/** Skip as Move… offers it: `Skip <next stop>, go to <stop after>`, each name cut to 40. */
function skipMove(view: TrainPlaces): OfferedMove {
  const { party } = view;
  const to = destinationOf(party, 'skip');
  const skipped = labelOf(view, to.skipped);
  const after = labelOf(view, to.route[to.stop]);
  const label = `Skip ${truncate(skipped, SKIP_NAME_ROOM)}, go to ${truncate(after, SKIP_NAME_ROOM)}`;
  const whole = `Skip ${skipped}, go to ${after}`;
  return {
    move: 'skip',
    target: targetOf(party, 'skip'),
    label,
    description: label === whole ? undefined : truncate(`${skipped}, then ${after}`, CHOICE_ROOM),
    sentence: endSentence(
      `Submit skips ${boldOf(view, to.skipped)} and moves it to ${boldOf(view, to.route[to.stop])}`,
    ),
  };
}

/**
 * Whether Previous leaves the train exactly where Next does, the route in the same order (a loop
 * of two stops: both go to the other stop). The turn is not compared: at the end of a turn-back
 * route Next reverses the route and Previous does not, so they differ (plan 8X-H, review R10).
 */
function previousIsNext(view: TrainPlaces): boolean {
  const next = destinationOf(view.party, 'next');
  const previous = destinationOf(view.party, 'previous');
  return (
    next.stop === previous.stop &&
    next.route.length === previous.route.length &&
    next.route.every((stop, index) => sameStop(stop, previous.route[index]))
  );
}

/**
 * The moves Move… offers from where the train is, in the order Next, Previous, Skip; a move
 * that cannot be made from here (`cannotMove`) is left out, not shown switched off, and so is
 * Previous where it is the very move Next is (`previousIsNext`, plan 8X-H, G2).
 */
export function offeredMoves(view: TrainPlaces): OfferedMove[] {
  const offers: Record<DialogMove, (view: TrainPlaces) => OfferedMove> = {
    next: nextMove,
    previous: previousMove,
    skip: skipMove,
  };
  const possible = DIALOG_MOVES.filter((move) => cannotMove(view.party, move) === undefined);
  const same = possible.includes('next') && possible.includes('previous') && previousIsNext(view);
  return possible
    .filter((move) => !(same && move === 'previous'))
    .map((move) => offers[move](view));
}

/**
 * Where the train is and what Next does, as Move… and Manage… say it at the top: the panel's
 * words (`At stop 2 of 4: X`, `Next is Y`), the stops in bold and without links (whether a
 * dialog's links can be clicked is not known); of a finished route only that it is (plan 8X-H,
 * G3): Move… says once, under it, where Submit takes it; Manage… says nothing of Previous.
 */
export function trainStateText(view: TrainPlaces): string {
  const { party } = view;
  const { route, stop } = party.train;
  if (routeFinished(party)) {
    return `The train has finished its route of ${count(route.length, 'stop')}.`;
  }
  const here = `At stop ${String(stop + 1)} of ${String(route.length)}: ${boldOf(view, currentStop(party))}`;
  const next = nextStop(party);
  if (next === undefined) return `${here}\nIt is the last stop: Next finishes the route`;
  const where = boldOf(view, next);
  switch (turnAhead(party)) {
    case 'round':
      return `${here}\nNext goes round to ${where}`;
    case 'back':
      return `${here}\nNext turns back to ${where}`;
    default:
      return `${here}\nNext is ${where}`;
  }
}

/**
 * Move… (plan 8X-G, design talk item 5): for who may move the train, a dialog with where it is
 * (`trainStateText`) and one radio choice "Where to" of the moves that can be made from
 * here (`offeredMoves`): Next picked to start with (Android picks the first, which it is), then
 * Previous and Skip; each choice `<move>:<target>`, where it leads (`targetOf`). With one move
 * left (a finished route: Previous alone; stop 1 of a route of two: Next alone) there is no
 * choice (a radio group takes two to ten): the text says what Submit does and the custom id
 * carries the move. The custom id carries where the train was (`placeOf`), so a Submit after
 * somebody else moved it changes nothing, and ends in a per-open token (`openToken`).
 */
export function moveDialog(view: TrainDialogView): APIModalInteractionResponseCallbackData {
  const { party } = view;
  const form = moveForm(view);
  const token = openToken(view.now);
  const [only] = form.moves;
  if (form.moves.length === 1 && only !== undefined) {
    return dialog({
      customId: encodeCustomId({
        kind: PARTY_KIND,
        id: party.id,
        action: MOVE_FORM,
        args: [form.place, only.move, only.target, token],
      }),
      title: form.title,
      text: form.text,
    });
  }
  const options: DialogOption[] = form.moves.map((offered) => ({
    value: `${offered.move}:${offered.target}`,
    label: offered.label,
    ...(offered.description === undefined ? {} : { description: offered.description }),
  }));
  return dialog({
    customId: encodeCustomId({
      kind: PARTY_KIND,
      id: party.id,
      action: MOVE_FORM,
      args: [form.place, token],
    }),
    title: form.title,
    text: form.text,
    choice: {
      id: MOVE_INPUT,
      label: form.label,
      options,
      ...(options[0] === undefined ? {} : { picked: options[0].value }),
    },
  });
}

/**
 * What Move… says and offers (plan 8X-G), apart from Discord's dialog, so that one builder serves
 * the dialog and the live map's form (plan 8M-8C): its title; its text (where the train is,
 * `trainStateText`, and with one move left what Submit does); where the train is (`placeOf`),
 * which a Submit carries; the label of its choice; the moves offered (`offeredMoves`), Next first
 * and picked.
 */
export interface MoveForm {
  title: string;
  /** Discord's markdown: the map makes it text of the page. */
  text: string;
  place: string;
  label: string;
  moves: OfferedMove[];
}

/** Move… as `moveDialog` draws it (`MoveForm`), without Discord's parts. */
export function moveForm(view: TrainPlaces): MoveForm {
  const moves = offeredMoves(view);
  const state = trainStateText(view);
  const [only] = moves;
  return {
    title: 'Move the train',
    text: moves.length === 1 && only !== undefined ? `${state}\n\n${only.sentence}` : state,
    place: placeOf(view.party),
    label: 'Where to',
    moves,
  };
}

/**
 * The action of Manage…'s dialog:
 * `tmanage:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>` (`party:` of a dialog opened
 * before it was a kind of its own). `place` is where the train was
 * (`placeOf`), `first` the stop the route began with (`stopHandle`; `-` without a route), `mode`
 * and `kind` the train's own as the dialog showed them, a letter each (`AT_END_CODES`,
 * `KIND_CODES`): Submit changes only what was picked otherwise (review R5), so that a dialog
 * opened before somebody else changed the mode does not set it back.
 */
export const MANAGE_FORM = 'manageform';

/**
 * The kind of Manage…'s dialog (`MANAGE_KIND:<id>:manageform:…`): of its own, so that a Submit with
 * a start counts in `/meet`'s window and any other as the post's controls do (`manageControls`).
 */
export const MANAGE_KIND = 'tmanage';

/** The custom ids of Manage…'s lines for the start and the end. */
export const MANAGE_START_INPUT = 'start';
export const MANAGE_END_INPUT = 'end';

/**
 * Manage…'s lines for the start (Matt, 2026-10-30), as `/meet` reads it, and the end (Matt,
 * 2026-11-07), as `/end` reads it: the map's form's labels and placeholders (`manageForm` of
 * `train-post-forms.ts`), what they are now under the label, as the map says it above its line.
 * Blank keeps what is set, so that a form opened before somebody else set it does not set it back
 * (review R5).
 */
function timeFields(
  party: TrainParty,
  zone: string,
  now: number,
): { start: DialogField; end: DialogField } {
  const nowWords = (words: string, at: number | null): string =>
    `${words}: ${at === null ? 'none' : `${clockTime(at, zone, now)}${zoneLabel(zone)}`}`;
  return {
    start: {
      id: MANAGE_START_INPUT,
      label: 'Starts',
      maxLength: 40,
      placeholder: '6:15pm, in 30, or cancel',
      description: nowWords('Starts now', startTimeOf(party)),
    },
    end: {
      id: MANAGE_END_INPUT,
      label: 'Ends',
      maxLength: 40,
      placeholder: '8pm, in 90, or none',
      description: nowWords('Ends now', party.endTime),
    },
  };
}

/** The custom ids of Manage…'s three choices. */
export const MANAGE_ROUTE_INPUT = 'route';
export const MANAGE_AT_END_INPUT = 'atend';
export const MANAGE_KIND_INPUT = 'kind';

/** The values of "The route": keep it, reverse it, finish it at the stop the train is at. */
export const ROUTE_CHOICES = ['keep', 'reverse', 'finish'] as const;
export type RouteChoice = (typeof ROUTE_CHOICES)[number];

/** The letters of the modes and kinds in Manage…'s custom id. */
export const AT_END_CODES: Readonly<Record<TrainAtEnd, string>> = {
  finish: 'f',
  loop: 'l',
  'turn-back': 't',
};
export const KIND_CODES: Readonly<Record<TrainKind, string>> = {
  raid: 'r',
  dynamax: 'd',
  gigantamax: 'g',
};

/** What stands in for the first stop of a route that has none, in Manage…'s custom id. */
export const NO_FIRST = '-';

/**
 * "The route" of Manage…: Keep first and picked, then what `cannotReverse` and the route allow;
 * undefined where only Keep is left. The live map's form offers the same (plan 8M-8C).
 */
export function routeChoice(view: TrainPlaces): DialogChoice | undefined {
  const { party } = view;
  const options: DialogOption[] = [{ value: 'keep', label: 'Keep it as it is' }];
  if (cannotReverse(party) === undefined) {
    // Reverse on a finished route starts it again at its last stop (review r0 B3; r1 wording).
    const prefix = 'Starts the route again from its last stop, ';
    const suffix = ', the other way round';
    const last = labelOf(view, party.train.route.at(-1));
    options.push({
      value: 'reverse',
      label: 'Reverse it',
      ...(routeFinished(party)
        ? {
            description: `${prefix}${truncate(last, CHOICE_ROOM - prefix.length - suffix.length)}${suffix}`,
          }
        : {}),
    });
  }
  if (!routeFinished(party)) options.push({ value: 'finish', label: 'Finish it here' });
  // A radio group takes two to ten: with Keep alone there is nothing to ask (review R1).
  if (options.length < 2) return undefined;
  return { id: MANAGE_ROUTE_INPUT, label: 'The route', options, picked: 'keep' };
}

/** Discord's most components in a dialog, its text included. */
const DIALOG_ROOM = 5;

/**
 * Manage… (plan 8X-G, design talk item 5): for who may move the train and staff, where it is
 * (`trainStateText`), then "The route", a radio choice (Keep it as it is, picked and first;
 * Reverse it where `cannotReverse` allows; Finish it here while the route is not finished; left
 * out when only Keep is left), "At the end of the route" and "What the train is mainly for" as
 * menus (a radio group would have Android pick its first option whatever the train has; review
 * R7), each with the train's own picked. A train without a route is asked its kind alone.
 * `times`: the member may set its start and end (`mayArrange`), asked as the map's form asks
 * them (`timeFields`, in the posts' zone). With all of them Discord's five components are one
 * short (Matt, 2026-11-07): the text is left out, and "Finish it here" says where "here" is.
 */
export function manageDialog(
  view: TrainDialogView,
  times?: { zone: string },
): APIModalInteractionResponseCallbackData {
  const { party } = view;
  const form = manageForm(view);
  const customId = encodeCustomId({
    kind: MANAGE_KIND,
    id: party.id,
    action: MANAGE_FORM,
    args: [
      form.shown.from,
      form.shown.first,
      AT_END_CODES[form.shown.atEnd],
      KIND_CODES[form.shown.kind],
      openToken(view.now),
    ],
  });
  const fields = times === undefined ? undefined : timeFields(party, times.zone, view.now);
  const kind: DialogChoice = {
    ...form.kind,
    // On Discord the kinds show the application's emoji where it has them; the map its icons.
    options: form.kind.options.map((option) => {
      const one = TRAIN_KINDS.find((each) => each === option.value);
      return one === undefined ? option : { ...option, emoji: trainKindEmoji(one, view.icons) };
    }),
  };
  const choices = [form.route, form.atEnd, kind].filter(
    (choice): choice is DialogChoice => choice !== undefined,
  );
  const withText = choices.length + (fields === undefined ? 0 : 2) < DIALOG_ROOM;
  return dialog({
    customId,
    title: form.title,
    ...(withText ? { text: form.text } : {}),
    choices: withText ? choices : choices.map((choice) => finishSaysWhere(view, choice)),
    ...(fields === undefined ? {} : { fields: [fields.start, fields.end] }),
  });
}

/**
 * "The route" with "Finish it here" saying where the train is, plain (a choice shows no
 * markdown), for a Manage… without room for its text: `At stop 2 of 4: The Stacks`.
 */
function finishSaysWhere(view: TrainPlaces, route: DialogChoice): DialogChoice {
  const { party } = view;
  const prefix = `At stop ${String(party.train.stop + 1)} of ${String(party.train.route.length)}: `;
  const where = `${prefix}${truncate(labelOf(view, currentStop(party)), CHOICE_ROOM - prefix.length)}`;
  if (route.id !== MANAGE_ROUTE_INPUT) return route;
  return {
    ...route,
    options: route.options.map((option) =>
      option.value === 'finish' ? { ...option, description: where } : option,
    ),
  };
}

/**
 * What Manage… says, asks and showed (plan 8X-G), apart from Discord's dialog, so that one
 * builder serves the dialog and the live map's form (plan 8M-8C): its title; its text (where the
 * train is, `trainStateText`; without a route `NO_ROUTE_YET`); "The route" where more than Keep is
 * left; "At the end of the route" (not for a train without a route) and "What the train is
 * mainly for", each with the train's own picked; and what it showed (`shown`): where the train
 * was, the stop the route began with (`NO_FIRST` without a route), the mode and the kind. The
 * start and the end are asked apart, on Discord (`timeFields`) and on the map (its `times`).
 */
export interface ManageForm {
  title: string;
  /** Discord's markdown: the map makes it text of the page. */
  text: string;
  route?: DialogChoice;
  atEnd?: DialogChoice;
  kind: DialogChoice;
  shown: { from: string; first: string; atEnd: TrainAtEnd; kind: TrainKind };
}

/** Manage… as `manageDialog` draws it (`ManageForm`), without Discord's parts. */
export function manageForm(view: TrainPlaces): ManageForm {
  const { party } = view;
  const [first] = party.train.route;
  const shown = {
    from: placeOf(party),
    first: first === undefined ? NO_FIRST : stopHandle(first),
    atEnd: party.train.atEnd,
    kind: party.train.kind,
  };
  const kind: DialogChoice = {
    id: MANAGE_KIND_INPUT,
    label: TRAIN_KIND_QUESTION,
    menu: true,
    options: TRAIN_KINDS.map((value) => ({
      value,
      label: trainKindChoice(value),
      description: TRAIN_KIND_DESCRIPTIONS[value],
      emoji: TRAIN_KIND_EMOJI[value],
    })),
    picked: party.train.kind,
  };
  const title = 'Manage the train';
  if (party.train.route.length === 0) {
    return { title, text: NO_ROUTE_YET, kind, shown };
  }
  const atEnd: DialogChoice = {
    id: MANAGE_AT_END_INPUT,
    label: 'At the end of the route',
    menu: true,
    options: TRAIN_AT_END.map((value) => ({
      value,
      label: AT_END_MENU_LABELS[value],
      description: AT_END_DESCRIPTIONS[value],
      emoji: AT_END_EMOJI[value],
    })),
    picked: party.train.atEnd,
  };
  const route = routeChoice(view);
  return {
    title,
    // Of a finished route only that it is: where Previous leads is Move…'s (review r0 B3).
    text: trainStateText(view),
    ...(route === undefined ? {} : { route }),
    atEnd,
    kind,
    shown,
  };
}
