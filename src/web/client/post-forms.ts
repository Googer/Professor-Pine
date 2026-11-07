import type {
  MapClose,
  MapMeet,
  MapParty,
  MapRegroup,
  MapReport,
} from '../../domain/web/party-data.js';
import { groupLine } from '../../render/group-words.js';
import { MEET_TIME_NOW, meetTimeLabel, NO_MEETING_TIME } from '../../render/meet-words.js';
import {
  archiveOnlyText,
  closeQuestion,
  closeTitle,
  REMOVAL_CHOICES,
  REMOVAL_LABEL,
} from '../../render/removal-words.js';
import { sendButton } from './form-buttons.js';
import { pressParty, type PressSteps, type Pressed } from './parties.js';
import type { PageNode } from './popup.js';
import { safeHref } from './post-draw.js';
import { postTime, type TimeShown } from './post-time.js';

/**
 * The post's controls that open a dialog on Discord, as forms of the live map (plan 8M-8B), the
 * parts that need no DOM: each form as a tree of nodes in Discord's dialog look (its title, its
 * text, its choice, Submit and Cancel), drawn in the place of the post (`formPlace`: a popup, a
 * line of the list, the phone card), its body, and sending it with the page's CSRF token as a
 * press is sent. What the dialog says and decides is the server's, sent with the list (Group…'s
 * choices) or asked when the form opens; the page only words times in the reader's own zone.
 */

/** Where a form's times are shown: the reader's own zone and language, as a post's are. */
export interface FormTimes {
  now: number;
  time?: TimeShown;
}

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** The line a form says its answer on, hidden until there is one. */
const answerLine: PageNode = {
  tag: 'p',
  className: 'form-answer',
  attributes: { hidden: '', role: 'status' },
};

/** Submit and Cancel, as Discord's dialogs have them. */
function dialogButtons(submit: string): PageNode {
  return {
    tag: 'div',
    className: 'form-buttons',
    children: [
      sendButton('Submit', { 'data-submit': submit }),
      {
        tag: 'button',
        className: 'press secondary',
        text: 'Cancel',
        attributes: { type: 'button', 'data-cancel': '' },
      },
    ],
  };
}

/**
 * A radio choice as Discord's dialog draws it: its label over the choices, each with its words
 * (after an icon where the page has one) and a line under them; the first picked to start with, as
 * the dialog marks it.
 */
export function radioChoice(
  name: string,
  label: string,
  choices: ReadonlyArray<{ value: string; label: string; line?: string; icon?: PageNode }>,
  picked: string | undefined,
): PageNode {
  return {
    tag: 'fieldset',
    className: 'form-choice',
    children: [
      { tag: 'legend', text: label },
      ...choices.map((choice): PageNode => ({
        tag: 'label',
        className: 'choice',
        children: [
          {
            tag: 'input',
            attributes: {
              type: 'radio',
              name,
              value: choice.value,
              ...(choice.value === picked ? { checked: '' } : {}),
            },
          },
          {
            tag: 'span',
            className: 'choice-words',
            children: [
              choice.icon === undefined
                ? { tag: 'span', className: 'choice-label', text: choice.label }
                : {
                    tag: 'span',
                    className: 'choice-label',
                    children: [choice.icon, { tag: 'span', text: choice.label }],
                  },
              ...(choice.line === undefined
                ? []
                : [{ tag: 'span', className: 'choice-line', text: choice.line }]),
            ],
          },
        ],
      })),
    ],
  };
}

/** A form in Discord's dialog look: its title, its parts, Submit and Cancel, its answer. */
export function dialogForm(
  form: string,
  partyId: string,
  title: string,
  parts: PageNode[],
): PageNode {
  return {
    tag: 'div',
    className: 'post-form',
    attributes: { 'data-form': form, 'data-party': partyId, role: 'group', 'aria-label': title },
    children: [
      { tag: 'h4', className: 'form-title', text: title },
      ...parts,
      dialogButtons(form),
      answerLine,
    ],
  };
}

/** The note box's button to the post (plan 8M-11A, S9). */
export const OPEN_THE_POST = 'Open the post on Discord';

/**
 * The note box of a button whose answer is "do this on Discord" (plan 8M-11A, S9): in the form's
 * place, its words (`discordNote`: "A new group is started on Discord.") over the post's link as a
 * button ("Open the post on Discord", where the page may link it) and Back, which puts the post
 * back as Cancel does.
 */
export function noteBox(party: MapParty, text: string, origin: string, guild: string): PageNode {
  const href = safeHref(party.link, origin, guild);
  return {
    tag: 'div',
    className: 'post-form note-box',
    attributes: { 'data-form': 'note', 'data-party': party.id, role: 'group', 'aria-label': text },
    children: [
      { tag: 'p', className: 'form-text', text },
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          ...(href === undefined
            ? []
            : [
                {
                  tag: 'a',
                  className: 'press primary',
                  text: OPEN_THE_POST,
                  attributes: { href, ...NEW_TAB },
                },
              ]),
          {
            tag: 'button',
            className: 'press secondary',
            text: 'Back',
            attributes: { type: 'button', 'data-cancel': '' },
          },
        ],
      },
    ],
  };
}

/** A group's choice by its letter and stamp, as Group…'s move sends it back. */
const wayValue = (way: { group: string; stamp: string }): string => `${way.group}:${way.stamp}`;

/**
 * Group…'s form (plan 8M-8B), as the post's dialog: its title and text as the server worded them,
 * the groups to move to or join as a radio choice (the first picked; none to choose where one way
 * is left: the text says what Submit does), each with how many are in it and its meeting time in
 * the reader's zone; where a new group is a way, the post's link (it needs a word with the others).
 */
export function regroupForm(
  party: MapParty,
  regroup: Extract<MapRegroup, { choices: unknown }>,
  times: FormTimes,
  origin: string,
  guild: string,
): PageNode {
  const clock = (at: number): string => postTime(at, 't', times.now, times.time);
  const choices = regroup.choices.map((way) => ({
    value: wayValue(way),
    label: way.label,
    line: groupLine(
      way.size,
      way.meeting === undefined ? undefined : way.meeting === null ? null : clock(way.meeting),
    ),
  }));
  const [first] = choices;
  const href = safeHref(party.link, origin, guild);
  return dialogForm('regroup', party.id, regroup.title, [
    { tag: 'p', className: 'form-text', text: regroup.text },
    ...(choices.length > 1
      ? [radioChoice('way', regroup.label, choices, first?.value)]
      : first === undefined
        ? []
        : [{ tag: 'input', attributes: { type: 'hidden', name: 'way', value: first.value } }]),
    ...(regroup.newGroup && href !== undefined
      ? [
          {
            tag: 'a',
            className: 'to-discord',
            text: 'Start a new group on Discord →',
            attributes: { href, ...NEW_TAB },
          },
        ]
      : []),
  ]);
}

/** The value of "No meeting time" in Meet…'s menu. */
const NO_MEETING = 'none';

/**
 * Meet…'s form (plan 8M-8B, X4), as the post's dialog: its title and text, the menu "When does
 * your group meet?" of the times the server offers now, named in the reader's own zone with the
 * dialog's words (`meetTimeLabel`; the group's own time said so), "No meeting time" last while the
 * group has one, the time the server chose to start with picked. Nothing is typed: no zone hint.
 */
export function meetForm(party: MapParty, meet: MapMeet, times: FormTimes): PageNode {
  const clock = (at: number): string => postTime(at, 't', times.now, times.time);
  const option = (value: string, text: string, picked: boolean): PageNode => ({
    tag: 'option',
    text,
    attributes: { value, ...(picked ? { selected: '' } : {}) },
  });
  return dialogForm('meet', party.id, meet.title, [
    { tag: 'p', className: 'form-text', text: meet.text },
    {
      tag: 'label',
      className: 'form-field',
      children: [
        { tag: 'span', className: 'form-label', text: meet.label },
        {
          tag: 'select',
          attributes: { name: 'time' },
          children: [
            ...meet.times.map((time) =>
              option(
                String(time.at),
                time.at === meet.set
                  ? `${meetTimeLabel(time, clock(time.at))} · ${MEET_TIME_NOW}`
                  : meetTimeLabel(time, clock(time.at)),
                time.at === meet.picked,
              ),
            ),
            ...(meet.set === null ? [] : [option(NO_MEETING, NO_MEETING_TIME, false)]),
          ],
        },
      ],
    },
  ]);
}

/** The body of Meet…'s Submit: the group drawn, by its letter and stamp, and the time chosen. */
export function meetBody(meet: MapMeet, picked: string | undefined): PostFormBody {
  const base = { group: meet.group, stamp: meet.stamp };
  if (picked === NO_MEETING) return { body: { ...base, time: null } };
  const time = meet.times.find((one) => String(one.at) === picked);
  return time === undefined ? { text: 'Pick a time first.' } : { body: { ...base, time: time.at } };
}

/**
 * Staff's Delete… (plan 8M-8B, X1), as `/delete`'s dialog: `Close this raid`, its question, and
 * the choice "The post" with nothing picked, Archive post or Delete post (`REMOVAL_CHOICES`);
 * where the bot may not delete the post, no choice: the text says it will be archived and why,
 * the forum named (`archiveOnlyText`).
 */
export function closeForm(party: MapParty, close: MapClose): PageNode {
  // `/delete`'s words, the party named as the server sent it (review W-4).
  const question = closeQuestion(close.word);
  return dialogForm('close', party.id, closeTitle(close.word), [
    {
      tag: 'p',
      className: 'form-text',
      text: close.mayDelete ? question : archiveOnlyText(question, close.forum),
    },
    close.mayDelete
      ? radioChoice(
          'removal',
          REMOVAL_LABEL,
          REMOVAL_CHOICES.map(({ value, label, description }) => ({
            value,
            label,
            line: description,
          })),
          undefined,
        )
      : { tag: 'input', attributes: { type: 'hidden', name: 'removal', value: 'archive' } },
  ]);
}

/** The body of Delete…: the way picked (none picked: the page asks for one). */
export function closeBody(picked: string | undefined): PostFormBody {
  return picked === 'archive' || picked === 'delete'
    ? { body: { removal: picked } }
    : { text: 'Pick Archive post or Delete post first.' };
}

/**
 * Report… (plan 8M-8B, X2), as `/report`'s form: its title and its one field, "What is wrong?",
 * as long as the form takes, in the words the server sent when it opened.
 */
export function reportForm(party: MapParty, report: MapReport): PageNode {
  return dialogForm('report', party.id, report.title, [
    {
      tag: 'label',
      className: 'form-field',
      children: [
        { tag: 'span', className: 'form-label', text: report.label },
        {
          tag: 'textarea',
          attributes: {
            name: 'reason',
            maxlength: String(report.maxLength),
            placeholder: report.placeholder,
            rows: '4',
          },
        },
      ],
    },
  ]);
}

/** The body of a report: the reason as typed (the server refuses white space alone, uncounted). */
export function reportBody(reason: string | undefined): PostFormBody {
  return { body: { reason: reason ?? '' } };
}

/**
 * A body to send, or what the member must do first (the page's own words). `path`: the address
 * under the party's where the pick decides it (Move…'s `move/<move>`, plan 8M-8C); else the form's.
 */
export type PostFormBody = { body: Record<string, unknown>; path?: string } | { text: string };

/** The body of Group…'s move: the group picked by its letter and stamp. */
export function regroupBody(
  regroup: Extract<MapRegroup, { choices: unknown }>,
  picked: string | undefined,
): PostFormBody {
  const way = regroup.choices.find((one) => wayValue(one) === picked);
  if (way === undefined) return { text: 'Pick a group first.' };
  return { body: { group: way.group, stamp: way.stamp, signedUp: regroup.signedUp } };
}

/**
 * What a form does after its answer: it stays on a refusal (the member tries again), unless its
 * choices may be stale (`refusalCloses`, review W-2: Group…'s came with the list, which is asked
 * for again), though not one of what was typed alone or of a limit (`keepsForm`); it closes once
 * done or once its party is over.
 */
export function formStep(
  sent: Pick<PostFormSent, 'ok' | 'gone' | 'keepsForm'>,
  form: { refusalCloses?: boolean },
): 'stay' | 'close' {
  if (sent.ok || sent.gone) return 'close';
  return form.refusalCloses === true && sent.keepsForm !== true ? 'close' : 'stay';
}

/**
 * Whether the popup or card under `key` shows the party (review W-6): a raid's is its gym's
 * (`gym:<id>`), a train's its ring's or its line's (`train:<id>`, `route:<id>`), a meetup's its
 * own (`meetup:<id>`), a max battle's its own (`max:<id>`, plan 8M-9A), at a Power Spot or a pin.
 */
export function showsParty(
  key: string,
  party: Pick<MapParty, 'kind' | 'id'> & { gymId?: number | null },
): boolean {
  switch (party.kind) {
    case 'raid':
      return party.gymId != null && key === `gym:${String(party.gymId)}`;
    case 'train':
      return key === `train:${party.id}` || key === `route:${party.id}`;
    case 'meetup':
      return key === `meetup:${party.id}`;
    case 'max':
      return key === `max:${party.id}`;
  }
}

/** The focus back on the button that opened a form, once the form closed (review W-5). */
export function focusBack(button: { isConnected: boolean; focus(): void }): void {
  if (button.isConnected) button.focus();
}

/** What came of a form: the words, the token now, whether it was done, and whether it is over. */
export interface PostFormSent extends Pressed {
  ok: boolean;
  /** The party has ended (409 without anything else to say): the form closes. */
  gone: boolean;
  /** The server refused what was typed alone, or a limit: the form stays whatever else closes it. */
  keepsForm?: true;
}

/**
 * Sends a form with the page's CSRF token as a press is sent (`pressParty`: a 403 of a stale
 * token is tried once more with a new one), and reads whether it was done.
 */
export async function sendPostForm(csrf: string, steps: PressSteps): Promise<PostFormSent> {
  let last: { status: number; body: unknown } | undefined;
  const pressed = await pressParty(csrf, {
    post: async (token) => {
      last = await steps.post(token);
      return last;
    },
    me: () => steps.me(),
  });
  const body = last?.body;
  const ok = typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true;
  // A train's form (plan 8M-8C) is refused 409 with the train as it is now where it was drawn
  // from another state of it (moved on, its route changed): a refusal, not a party that is over.
  const withTrain =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { train?: unknown }).train === 'object';
  // A limit (429, from every route alike) says nothing of the form's choices: what was typed stays.
  const keepsForm =
    last?.status === 429 ||
    (typeof body === 'object' &&
      body !== null &&
      (body as { keepsForm?: unknown }).keepsForm === true);
  return {
    ...pressed,
    ok,
    gone: last?.status === 409 && !withTrain,
    ...(keepsForm ? { keepsForm: true as const } : {}),
  };
}
