import type { MapMoves } from '../../domain/web/party-data.js';
import type { MapFormChoice, MapManage, MapSplit } from '../../domain/web/train-data.js';
import { MAP_AT_ENDS, MAP_TRAIN_KINDS } from '../../domain/web/train-data.js';
import { nowLine } from './meetup-forms.js';
import type { PageNode } from './popup.js';
import { dialogForm, radioChoice, type PostFormBody } from './post-forms.js';
import { GIGANTAMAX_ICON, REPORT_ICONS, type ReportIcon } from './report-icons.js';
import { iconNode } from './report-menu.js';

/**
 * A train's post's dialogs as forms of the live map (plan 8M-8C), the parts that need no DOM:
 * Move…, Manage… and Split…, drawn in Discord's dialog look in the place of the post as the forms
 * of plan 8M-8B are (`dialogForm`), and their bodies. What a dialog says, offers and picks to
 * start with is the server's (`moveForm`, `manageForm` of `src/render/train-dialogs.ts` and
 * `splitForm` of `src/render/train-split.ts`, the dialogs' own builders); the page only draws it.
 */

/**
 * A choice of a dialog as a radio choice of the form: each option's emoji before its words (a
 * menu of the dialog shows it), its description under them, the one picked to start with checked.
 * The dialog draws the mode and the kind as menus because Android picks a radio group's first
 * choice whatever is marked (review R7); a page checks what it is told, so every choice is a radio
 * choice here, each option with its line in sight.
 */
function choiceOf(
  name: string,
  choice: MapFormChoice,
  icons: Readonly<Record<string, ReportIcon>> = {},
): PageNode {
  return radioChoice(
    name,
    choice.label,
    choice.options.map((option) => {
      const icon = icons[option.value];
      return {
        value: option.value,
        label:
          icon !== undefined || option.emoji === undefined
            ? option.label
            : `${option.emoji} ${option.label}`,
        ...(icon === undefined ? {} : { icon: iconNode(icon) }),
        ...(option.line === undefined ? {} : { line: option.line }),
      };
    }),
    choice.picked,
  );
}

/**
 * The kinds of a train with the game's icons, in place of the emoji of Discord's dialog, where a
 * menu can show nothing else (Matt, 2026-10-30).
 */
const KIND_ICONS: Readonly<Record<string, ReportIcon>> = {
  raid: REPORT_ICONS.raid,
  dynamax: REPORT_ICONS.max,
  gigantamax: GIGANTAMAX_ICON,
};

/** A line of Manage… to type a time on: left blank, it stays as it is. */
const timeRow = (label: string, name: string, placeholder: string): PageNode => ({
  tag: 'label',
  className: 'form-row',
  children: [
    { tag: 'span', text: label },
    {
      tag: 'input',
      attributes: { name, type: 'text', maxlength: '40', autocomplete: 'off', placeholder },
    },
  ],
});

/**
 * Manage…'s form (plan 8M-8C), as the post's dialog: its title and text (where the train is, or
 * that it has no route yet), "The route" where more than Keep is left, "At the end of the route"
 * (not for a train without a route) and "What the train is mainly for", each with the train's own
 * picked to start with; for who may arrange the train its start and end as they are, each over a
 * line to change it, as a meetup's editor has them (`now`, the reader's zone: how they are said).
 */
export function manageForm(
  trainId: string,
  manage: MapManage,
  now: number = Date.now(),
  reader: string = manage.times?.zone ?? 'UTC',
): PageNode {
  const { times } = manage;
  return dialogForm('manage', trainId, manage.title, [
    { tag: 'p', className: 'form-text', text: manage.text },
    ...(manage.route === undefined ? [] : [choiceOf('route', manage.route)]),
    ...(manage.atEnd === undefined ? [] : [choiceOf('atEnd', manage.atEnd)]),
    choiceOf('kind', manage.kind, KIND_ICONS),
    ...(times === undefined
      ? []
      : [
          nowLine('Starts now', times.startTime, times.zone, now, reader),
          timeRow('Starts', 'start', '6:15pm, in 30, or cancel'),
          nowLine('Ends now', times.endTime, times.zone, now, reader),
          timeRow('Ends', 'end', '8pm, in 90, or none'),
        ]),
  ]);
}

/** A move's value in Move…'s choice: `<move>:<target>`, as the dialog's. */
const moveValue = (move: { move: string; target: string }): string => `${move.move}:${move.target}`;

/**
 * Move…'s form (plan 8M-8C, R1), as the post's dialog: where the train is (with one move left,
 * what Submit does), then "Where to" of the moves the server offers in their order, each with
 * its line, Next first and picked; with one move no choice.
 */
export function moveForm(trainId: string, moves: MapMoves): PageNode {
  const choices = moves.moves.map((move) => ({
    value: moveValue(move),
    label: move.label,
    ...(move.line === undefined ? {} : { line: move.line }),
  }));
  const [first] = choices;
  return dialogForm('move', trainId, moves.title, [
    { tag: 'p', className: 'form-text', text: moves.text },
    ...(choices.length > 1
      ? [radioChoice('move', moves.label, choices, first?.value)]
      : first === undefined
        ? []
        : [{ tag: 'input', attributes: { type: 'hidden', name: 'move', value: first.value } }]),
  ]);
}

/**
 * The body of Move…'s Submit and its address (`move/<move>`): where the train was when the form
 * was drawn (`from`) and where the move picked leads (`target`).
 */
export function moveBody(moves: MapMoves, fields: Record<string, string>): PostFormBody {
  const picked = moves.moves.find((move) => moveValue(move) === fields.move);
  if (picked === undefined) return { text: 'Pick where to first.' };
  return { path: `move/${picked.move}`, body: { from: moves.place, target: picked.target } };
}

/**
 * Split…'s form (plan 8M-8C), as the post's dialog: its text (what becomes of the group, who moves
 * and who leads; with several, who is in each group, a line each), and for the conductor and staff
 * "Group that leaves" with nothing picked (it is picked on purpose, as on Discord); for the one
 * group a member may split, no choice: the text ends with what Submit does.
 */
export function splitForm(trainId: string, split: MapSplit): PageNode {
  return dialogForm('split', trainId, split.title, [
    { tag: 'p', className: 'form-text', text: split.text },
    ...(split.choice === undefined ? [] : [choiceOf('group', split.choice)]),
  ]);
}

/** The body of Split…'s Submit: the group by its letter and the mark the form was drawn with. */
export function splitBody(split: MapSplit, fields: Record<string, string>): PostFormBody {
  if (split.only !== undefined) return { body: { ...split.only } };
  const picked = split.choice?.options.find((option) => option.value === fields.group)?.value;
  const at = picked?.indexOf(':') ?? -1;
  if (picked === undefined || at < 1) return { text: 'Pick the group that leaves first.' };
  return { body: { group: picked.slice(0, at), mark: picked.slice(at + 1) } };
}

const ROUTE_WAYS = ['keep', 'reverse', 'finish'] as const;

/**
 * The body of Manage…'s Submit: what the form showed, as the server gave it, and what is picked;
 * a part the form did not ask is left out (the server takes it as shown).
 */
export function manageBody(manage: MapManage, fields: Record<string, string>): PostFormBody {
  const kind = MAP_TRAIN_KINDS.find((one) => one === fields.kind);
  if (kind === undefined) return { text: 'Pick what the train is mainly for first.' };
  const route = ROUTE_WAYS.find((one) => one === fields.route);
  const atEnd = MAP_AT_ENDS.find((one) => one === fields.atEnd);
  const start = fields.start?.trim() ?? '';
  const end = fields.end?.trim() ?? '';
  return {
    body: {
      shown: manage.shown,
      picked: {
        kind,
        ...(manage.route === undefined || route === undefined ? {} : { route }),
        ...(manage.atEnd === undefined || atEnd === undefined ? {} : { atEnd }),
        ...(start === '' ? {} : { start }),
        ...(end === '' ? {} : { end }),
      },
    },
  };
}
