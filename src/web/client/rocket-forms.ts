import type {
  MapReward,
  RocketOptionsView,
  RocketWhoOption,
} from '../../domain/web/stop-report-data.js';
import type { PageNode } from './popup.js';
import type { StopAnswered } from './stop-forms.js';

/*
 * The Team GO Rocket form of the live map (plan 8M-9B, goal 9; B8: in the stop's popup or card, as
 * the max battle form is in a Power Spot's), the part with no page in it: who as a menu in
 * `/rocket`'s order (`/api/rocket-options`: grunt types, leaders, Giovanni with his note, the
 * decoy), the catches' pictures of the choice, and for a type of two lineups which lineup (each by
 * its first slot with its catches, then "Not sure which", the type's own key); the lineups said to
 * be out of date where they are. Its Submit (`submitRocket`) sends `{ who, stop }` to
 * `POST …/api/rocket` and does what the answer says by its machine parts (B4): made, the form
 * closes; the same grunt there, "Already reported" and its stop's popup; a hideout there, the
 * hideout question as a confirm (Replace sends it again with `replacing`, Cancel sends nothing);
 * the lineups changed (`reason: 'list-changed'`), the lists asked for again keeping the type; a
 * stop gone (404, B6), the page's own words; anything else (posted nowhere, too many), its words.
 */

/** What the form holds: who (a choice's key) and the lineup (a lineup's value, or the type's key). */
export interface RocketValues {
  who: string;
  lineup: string;
}

/** What the form shows besides its lists: what was filled in, the hideout question asked. */
export interface RocketFormState {
  filled: Partial<RocketValues>;
  /** The hideout question (422 `asks.replacing`): its words and the hideout's id. */
  replacing?: { text: string; id: number };
  /**
   * Its report is on its way: every control is drawn off (branch review W3, as research's review
   * F3), the menu and the lineups too, whatever draws the form meanwhile.
   */
  sending?: boolean;
}

/** The form's controls, each drawn off while its report is sent (`RocketFormState.sending`). */
function offWhileSending(node: PageNode, state: RocketFormState): PageNode {
  if (state.sending !== true) return node;
  const off = (one: PageNode): PageNode => ({
    ...one,
    ...(['button', 'select', 'input'].includes(one.tag)
      ? { attributes: { ...one.attributes, disabled: '' } }
      : {}),
    ...(one.children === undefined ? {} : { children: one.children.map(off) }),
  });
  return off(node);
}

/** The words of a stop that is gone (B6, the page's own: a 404 says nothing more). */
export const STOP_GONE = 'That PokéStop is gone: pick another.';

/** "Report Rocket here" in the box a click opens the form in (`rocket-box`), in a stop's popup. */
export function rocketBox(stop: { key: string; name: string }): PageNode {
  return {
    tag: 'div',
    className: 'rocket-box place-control',
    children: [
      {
        tag: 'button',
        className: 'press',
        text: 'Report Rocket here',
        attributes: { type: 'button', 'data-report-rocket': stop.key, 'data-stop-name': stop.name },
      },
    ],
  };
}

const option = (value: string, text: string, selected: boolean): PageNode => ({
  tag: 'option',
  text,
  attributes: { value, ...(selected ? { selected: '' } : {}) },
});

/** Small pictures of catches, each named. */
function catchPictures(catches: readonly MapReward[]): PageNode[] {
  const shown = catches.flatMap((caught): PageNode[] =>
    caught.image === undefined
      ? []
      : [
          {
            tag: 'img',
            className: 'small-picture',
            attributes: {
              src: caught.image,
              alt: caught.name,
              title: caught.name,
              draggable: 'false',
            },
          },
        ],
  );
  return shown.length === 0 ? [] : [{ tag: 'div', className: 'small-pictures', children: shown }];
}

/** The choice of the form's who, if any. */
export function chosenWho(
  options: RocketOptionsView,
  filled: Partial<RocketValues>,
): RocketWhoOption | undefined {
  return options.choices.find((choice) => choice.key === filled.who);
}

/** The lineup question of a type of two lineups: each by its first slot, then "Not sure which". */
function lineupPart(choice: RocketWhoOption, picked: string | undefined): PageNode[] {
  const lineups = choice.lineups ?? [];
  if (lineups.length === 0) return [];
  const radio = (value: string, label: string, catches: readonly MapReward[]): PageNode => ({
    tag: 'label',
    className: 'choice',
    children: [
      {
        tag: 'input',
        attributes: {
          type: 'radio',
          name: 'lineup',
          value,
          ...(value === picked ? { checked: '' } : {}),
        },
      },
      {
        tag: 'span',
        className: 'choice-words',
        children: [
          { tag: 'span', className: 'choice-label', text: label },
          ...catchPictures(catches),
        ],
      },
    ],
  });
  return [
    {
      tag: 'fieldset',
      className: 'form-choice',
      children: [
        { tag: 'legend', text: 'Which lineup?' },
        ...lineups.map((lineup) => radio(lineup.value, lineup.label, lineup.catches)),
        radio(choice.key, 'Not sure which', []),
      ],
    },
  ];
}

/**
 * The form at a stop: who, the catches of the choice (and Giovanni's note), which lineup for a
 * type of two; the lineups said to be out of date; or, once the server asked it, the hideout
 * question in its words with Replace and Cancel.
 */
export function rocketForm(options: RocketOptionsView, state: RocketFormState): PageNode {
  const { filled, replacing } = state;
  const choice = chosenWho(options, filled);
  const buttons: PageNode =
    replacing === undefined
      ? {
          tag: 'div',
          className: 'form-buttons',
          children: [
            {
              tag: 'button',
              className: 'press primary',
              text: 'Report',
              attributes: { type: 'button', 'data-submit': 'rocket' },
            },
            {
              tag: 'button',
              className: 'press',
              text: 'Cancel',
              attributes: { type: 'button', 'data-cancel': '' },
            },
          ],
        }
      : {
          tag: 'div',
          className: 'form-buttons',
          children: [
            {
              tag: 'button',
              className: 'press danger',
              text: 'Replace',
              attributes: { type: 'button', 'data-replace': String(replacing.id) },
            },
            {
              tag: 'button',
              className: 'press',
              text: 'Cancel',
              attributes: { type: 'button', 'data-cancel': '' },
            },
          ],
        };
  const form: PageNode = {
    tag: 'div',
    className: 'raid-form rocket-form stop-form',
    attributes: { 'data-form': 'rocket' },
    children: [
      ...(replacing === undefined
        ? [
            {
              tag: 'label',
              className: 'form-row',
              children: [
                { tag: 'span', text: 'Who' },
                {
                  tag: 'select',
                  attributes: { name: 'who' },
                  children: [
                    option('', 'Pick who you met', (filled.who ?? '') === ''),
                    ...options.choices.map((one) =>
                      option(one.key, one.name, one.key === filled.who),
                    ),
                  ],
                },
              ],
            },
            ...(choice?.note === undefined
              ? []
              : [{ tag: 'p', className: 'hint', text: choice.note }]),
            ...(choice === undefined ? [] : catchPictures(choice.catches)),
            ...(choice === undefined ? [] : lineupPart(choice, filled.lineup)),
            ...(options.stale
              ? [
                  {
                    tag: 'p',
                    className: 'hint',
                    text: 'The lineups may be out of date: Pine could not read them lately.',
                  },
                ]
              : []),
          ]
        : [
            {
              tag: 'p',
              className: 'form-text',
              attributes: { role: 'alert' },
              text: replacing.text,
            },
          ]),
      buttons,
      { tag: 'div', className: 'form-answer', attributes: { hidden: '', 'aria-live': 'polite' } },
    ],
  };
  return offWhileSending(form, state);
}

/** The body of a Rocket report, or what must be picked first. */
export function rocketBody(
  stop: string,
  options: RocketOptionsView,
  values: Partial<RocketValues>,
  replacing?: number,
): { body: { who: string; stop: string; replacing?: number } } | { text: string } {
  const choice = chosenWho(options, values);
  if (!choice) return { text: 'Pick who you met first.' };
  let who = choice.key;
  if ((choice.lineups ?? []).length > 0) {
    const lineup = values.lineup ?? '';
    if (lineup !== choice.key && !(choice.lineups ?? []).some((one) => one.value === lineup)) {
      return { text: 'Pick the lineup, or Not sure which.' };
    }
    who = lineup;
  }
  return { body: { who, stop, ...(replacing === undefined ? {} : { replacing }) } };
}

/** What the page does after a Rocket report's answer. */
export type RocketAfter =
  /** Something to pick first: said under the form, nothing sent. */
  | { kind: 'missing'; text: string }
  /** The form went away meanwhile: only its words are said. */
  | { kind: 'gone'; text: string }
  /** Made, or the same grunt there: the form closes, the stop's popup opened after the poll. */
  | { kind: 'close'; text: string }
  /** The form drawn again: the hideout question, new lists, or the words of a refusal. */
  | { kind: 'draw'; options: RocketOptionsView; state: RocketFormState; text: string };

/** What `submitRocket` needs: sending, the lists, whether the form still holds. */
export interface RocketSubmitDeps {
  send(body: Record<string, unknown>): Promise<{ text: string; answer: StopAnswered }>;
  options(): Promise<RocketOptionsView>;
  holds(): boolean;
}

/**
 * The Rocket form's Submit (and its Replace): the body, the report, and what the answer leads to,
 * by its machine parts (B4), the words only shown.
 */
export async function submitRocket(
  stop: string,
  options: RocketOptionsView,
  values: Partial<RocketValues>,
  deps: RocketSubmitDeps,
  replacing?: number,
): Promise<RocketAfter> {
  const body = rocketBody(stop, options, values, replacing);
  if ('text' in body) return { kind: 'missing', text: body.text };
  const sent = await deps.send(body.body);
  if (!deps.holds()) return { kind: 'gone', text: sent.text };
  const { answer } = sent;
  // Made; or the same grunt stands there already (`reason: 'already'`, branch review W2: whether
  // or not the map shows it to the member): its stop shows it.
  if (answer.ok || answer.reason === 'already') {
    return { kind: 'close', text: sent.text };
  }
  if (answer.status === 404) return { kind: 'close', text: STOP_GONE };
  const ask = answer.asks?.replacing;
  if (answer.status === 422 && ask !== undefined) {
    return {
      kind: 'draw',
      options,
      state: { filled: values, replacing: { text: sent.text, id: ask } },
      text: sent.text,
    };
  }
  if (answer.reason === 'list-changed') {
    // The lineups changed under the choice: the lists anew, the type kept, its lineup asked again.
    let now = options;
    try {
      now = await deps.options();
    } catch {
      // The lists it has stay.
    }
    const kept = now.choices.some((choice) => choice.key === values.who) ? values.who : undefined;
    return {
      kind: 'draw',
      options: now,
      state: { filled: kept === undefined ? {} : { who: kept } },
      text: sent.text,
    };
  }
  return { kind: 'draw', options, state: { filled: values }, text: sent.text };
}
