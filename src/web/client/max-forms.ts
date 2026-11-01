import type {
  MaxEndChoice,
  MaxNeed,
  MaxOptionsView,
  MapMaxTier,
} from '../../domain/web/max-data.js';
import type { MapMax } from '../../domain/web/party-data.js';
import { pressParty, type PressSteps, type Pressed } from './parties.js';
import type { PageNode } from './popup.js';
import { radioChoice } from './post-forms.js';
import { zoneHintNodes } from './raid-forms.js';
import type { PointRegion } from './spawn-forms.js';

/**
 * Reporting a max battle on the live map (plan 8M-9A; the server side is plan 8X-5's
 * `POST /s/<guild>/api/maxes`, which runs `/max`'s readers and `reportMaxAs`), the parts that need
 * no Leaflet: "Report max battle here" in a Power Spot's popup, the form as a tree of nodes over
 * `/api/max-options` (the bosses grouped by tier in the list's order, the featured marked; a boss
 * typed that is on no list, with its tier; the end, optional; the region where the place lies in
 * several), the ending-soon question as the server asks it (its words and choices, sent back with
 * the report), the body, reading an answer, and what the form does after one. Every rule is the
 * server's: the page reads `needs`, `regions` and `soon`, never a boss list or an end of its own,
 * and asks for the lists again after any other refusal (A3: a boundary may have changed them).
 */

/** As much as `/max` takes of a boss and of an end (its options' lengths). */
const BOSS_LENGTH = 100;
const END_LENGTH = 40;

/** The boss menu's choice of a boss on no list: its name typed, with its tier. */
export const ANOTHER_BOSS = 'another';

/** What a max battle form holds, kept when it is drawn anew. */
export interface MaxValues {
  /** A boss's value of the list, or `ANOTHER_BOSS`. */
  boss: string;
  /** A boss typed (with `ANOTHER_BOSS`). */
  typed: string;
  /** Its tier, for a boss typed (`D1` to `G`), or empty. */
  tier: string;
  /** The end as typed (minutes, or a clock time), or empty for the usual end. */
  end: string;
  region: string;
  /** The ending-soon choice: `<value>:<end>`, or empty. */
  soon: string;
}

/** The ending-soon question as the server asked it (`MaxAnswer.soon` and its words). */
export interface SoonQuestion {
  text: string;
  choices: MaxEndChoice[];
}

/** What the form is drawn from: what was filled in, the regions to pick from, the question. */
export interface MaxFormState {
  filled: Partial<MaxValues>;
  regions: PointRegion[];
  soon?: SoonQuestion;
  /**
   * A battle at this point was refused to a member blocked from pins (`needs: 'listed-spot'`,
   * R1-4): Report is off, and "← Pick a Power Spot" leads back to the spots.
   */
  pinRefused?: true;
}

/** Where a report is: a Power Spot Pine keeps (by its Wayfarer id), or a point of the map. */
export type MaxWhere = { spot: string; name: string; lat: number; lon: number } | MaxPoint;
export interface MaxPoint {
  lat: number;
  lon: number;
}

/** "Report max battle here" in the box a click opens the form in (`max-box`), in a spot's popup. */
export function maxBox(spotId: string): PageNode {
  return {
    tag: 'div',
    className: 'max-box place-control',
    children: [
      {
        tag: 'button',
        className: 'report-max',
        text: 'Report max battle here',
        attributes: { type: 'button', 'data-report-max': spotId },
      },
    ],
  };
}

const option = (value: string, text: string, selected: boolean): PageNode => ({
  tag: 'option',
  text,
  attributes: { value, ...(selected ? { selected: '' } : {}) },
});

const labelled = (
  text: string,
  children: PageNode[],
  attributes: Record<string, string> = {},
): PageNode => ({
  tag: 'label',
  className: 'form-row',
  attributes,
  children: [{ tag: 'span', text }, ...children],
});

/**
 * The boss menu as `/max` offers it: nothing picked at first, the bosses grouped by tier in the
 * list's order (the featured first, as the list has them, and marked), then a boss on no list.
 */
function bossSelect(options: MaxOptionsView, picked: string | undefined): PageNode {
  const tiers = new Map<string, PageNode[]>();
  for (const boss of options.bosses) {
    const group = tiers.get(boss.tier) ?? [];
    group.push(
      option(
        boss.value,
        boss.featured ? `${boss.name} (featured)` : boss.name,
        boss.value === picked,
      ),
    );
    tiers.set(boss.tier, group);
  }
  return {
    tag: 'select',
    attributes: { name: 'boss' },
    children: [
      option('', 'Pick the boss', picked === undefined || picked === ''),
      ...[...tiers].map(([tier, children]): PageNode => ({
        tag: 'optgroup',
        attributes: { label: tier },
        children,
      })),
      {
        tag: 'optgroup',
        attributes: { label: 'Not on the list' },
        children: [option(ANOTHER_BOSS, 'Another boss (type its name)', picked === ANOTHER_BOSS)],
      },
    ],
  };
}

/**
 * The form of a max battle report at a Power Spot or a point (`name`: "Unlisted power spot" in a
 * popup of its own; none in a spot's popup, which names the spot already): the boss, a boss typed with its tier (rows shown only for it, `data-typed`), the
 * end (optional: no default end shown, the server's is `/max`'s), the region where the place lies
 * in several; and, once the server asked it, the ending-soon question in its words, in place of
 * the typed end (the choice is the end). Times typed are read in the server's zone
 * (`zoneHintNodes`), as are the question's labels.
 */
export function maxForm(
  name: string | undefined,
  options: MaxOptionsView,
  state: MaxFormState,
  reader: string = options.zone,
): PageNode {
  const { filled, regions, soon } = state;
  const typed = filled.boss === ANOTHER_BOSS;
  const typedRow: Record<string, string> = typed
    ? { 'data-typed': '' }
    : { 'data-typed': '', hidden: '' };
  const soonChoices = (soon?.choices ?? []).map((choice) => ({
    value: `${choice.value}:${String(choice.end)}`,
    label: choice.label,
  }));
  // The choice checked before while the question asked again still offers it, else the first
  // (review B3: new choices after a boundary passed would check none).
  const soonPicked =
    soonChoices.find((choice) => choice.value === filled.soon)?.value ?? soonChoices[0]?.value;
  return {
    tag: 'div',
    className: 'raid-form max-form',
    attributes: { 'data-form': 'max' },
    children: [
      ...(name === undefined ? [] : [{ tag: 'strong', className: 'name', text: name }]),
      labelled('Boss', [bossSelect(options, filled.boss)]),
      labelled(
        'Its name',
        [
          {
            tag: 'input',
            attributes: {
              name: 'typed',
              type: 'text',
              maxlength: String(BOSS_LENGTH),
              placeholder: 'The boss as the game names it',
              autocomplete: 'off',
              ...(filled.typed === undefined ? {} : { value: filled.typed }),
            },
          },
        ],
        typedRow,
      ),
      labelled(
        'Its tier',
        [
          {
            tag: 'select',
            attributes: { name: 'tier' },
            children: [
              option('', 'Pick its tier', (filled.tier ?? '') === ''),
              ...options.tiers.map((tier) =>
                option(tier.value, tier.tier, tier.value === filled.tier),
              ),
            ],
          },
        ],
        typedRow,
      ),
      ...(soon === undefined
        ? [
            labelled('Ends in', [
              {
                tag: 'input',
                attributes: {
                  name: 'end',
                  type: 'text',
                  maxlength: String(END_LENGTH),
                  placeholder: 'optional: minutes, or a time like 6:15pm',
                  autocomplete: 'off',
                  ...(filled.end === undefined || filled.end === '' ? {} : { value: filled.end }),
                },
              },
            ]),
          ]
        : [radioChoice('soon', soon.text, soonChoices, soonPicked)]),
      ...zoneHintNodes(options.zone, reader),
      ...(regions.length > 1
        ? [
            labelled('Region', [
              {
                tag: 'select',
                attributes: { name: 'region' },
                children: [
                  option('', 'Pick the region', (filled.region ?? '') === ''),
                  ...regions.map((region) =>
                    option(String(region.id), region.name, String(region.id) === filled.region),
                  ),
                ],
              },
            ]),
          ]
        : []),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          {
            tag: 'button',
            className: 'press primary',
            text: 'Report',
            attributes: {
              type: 'button',
              'data-submit': 'max',
              ...(state.pinRefused ? { disabled: '' } : {}),
            },
          },
          {
            tag: 'button',
            className: 'press',
            text: 'Cancel',
            attributes: { type: 'button', 'data-cancel': '' },
          },
          ...(state.pinRefused
            ? [
                {
                  tag: 'button',
                  className: 'press',
                  text: '← Pick a Power Spot',
                  attributes: { type: 'button', 'data-pick-spot': '' },
                },
              ]
            : []),
        ],
      },
      // Told as it is said (review B4), as a post's forms tell theirs.
      { tag: 'div', className: 'form-answer', attributes: { hidden: '', 'aria-live': 'polite' } },
    ],
  };
}

const TIERS: readonly string[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'G'] satisfies MapMaxTier[];

/** The ending-soon choice of the form (`<value>:<end>`), or none. */
function soonOf(picked: string): { value: 'next' | 'soon'; end: number } | undefined {
  const [value, end] = picked.split(':');
  const at = Number(end);
  if ((value !== 'next' && value !== 'soon') || !Number.isInteger(at)) return undefined;
  return { value, end: at };
}

/**
 * The body of a report (`POST /s/<guild>/api/maxes`), or what the member must fill in first: the
 * spot or the point, the boss (a value of the list, or as typed with its tier when one is picked),
 * the end typed, the region; with the ending-soon choice checked, its value and end in place of a
 * typed end, always (R1-5: whether that end has passed is the server's to say, as the dialog's
 * Submit says it, "That battle has ended meanwhile: nothing was reported.", never the browser
 * clock's; the form then asks for its lists again).
 */
export function maxBody(where: MaxWhere, values: MaxValues): MaxBody {
  const typed = values.boss === ANOTHER_BOSS;
  const boss = (typed ? values.typed : values.boss).trim();
  if (boss === '') return { text: typed ? 'Type the boss first.' : 'Pick the boss first.' };
  const asked = soonOf(values.soon);
  const end = values.end.trim();
  const region = Number(values.region);
  return {
    body: {
      ...('spot' in where ? { spot: where.spot } : { lat: where.lat, lon: where.lon }),
      boss,
      ...(typed && TIERS.includes(values.tier) ? { tier: values.tier } : {}),
      ...(asked === undefined && end !== '' ? { end } : {}),
      ...(values.region !== '' && Number.isInteger(region) ? { region } : {}),
      ...(asked === undefined ? {} : { soon: asked }),
    },
  };
}

/** A report's body to send, or what the member must fill in first. */
export type MaxBody =
  { body: Record<string, string | number | { value: string; end: number }> } | { text: string };

/** What the page takes of a report's answer (`MaxAnswer`), only what it can read. */
export interface MaxAnswered {
  ok: boolean;
  text?: string;
  needs?: MaxNeed;
  max?: MapMax;
  regions?: PointRegion[];
  soon?: { choices: MaxEndChoice[] };
}

const NEEDS: readonly string[] = ['tier', 'listed-spot', 'boss'] satisfies MaxNeed[];

export function maxAnswerOf(body: unknown): MaxAnswered {
  if (typeof body !== 'object' || body === null) return { ok: false };
  const { ok, text, needs, max, regions, soon } = body as Record<string, unknown>;
  const answered: MaxAnswered = { ok: ok === true };
  if (typeof text === 'string') answered.text = text;
  if (typeof needs === 'string' && NEEDS.includes(needs)) answered.needs = needs as MaxNeed;
  if (Array.isArray(regions)) {
    answered.regions = regions.flatMap((region: unknown): PointRegion[] => {
      if (typeof region !== 'object' || region === null) return [];
      const { id, name } = region as { id?: unknown; name?: unknown };
      return typeof id === 'number' && typeof name === 'string' ? [{ id, name }] : [];
    });
  }
  if (typeof soon === 'object' && soon !== null) {
    const { choices } = soon as { choices?: unknown };
    if (Array.isArray(choices)) {
      answered.soon = {
        choices: choices.flatMap((choice: unknown): MaxEndChoice[] => {
          if (typeof choice !== 'object' || choice === null) return [];
          const { value, label, end } = choice as Record<string, unknown>;
          return (value === 'next' || value === 'soon') &&
            typeof label === 'string' &&
            typeof end === 'number'
            ? [{ value, label, end }]
            : [];
        }),
      };
    }
  }
  if (typeof max === 'object' && max !== null && (max as { kind?: unknown }).kind === 'max') {
    answered.max = max as MapMax;
  }
  return answered;
}

/**
 * What the form does after an answer: closes (made, or a battle there, made by somebody else or
 * of another boss, which the page opens instead); is drawn again with the question or the
 * regions the server asks, keeping what was filled in (a region kept only while it is among them);
 * or, after any other refusal, asks for its lists again (a boundary may have changed them: A3),
 * the question gone. What a refusal needs is acted on (R1-4): a tier or a boss focuses its field
 * (`focus`); a Power Spot for a member blocked from pins turns Report off and offers the spots
 * (`pinRefused`).
 */
export function maxFormAfter(
  answer: MaxAnswered,
  values: MaxValues,
  state: MaxFormState,
):
  | { kind: 'close'; max?: MapMax }
  | { kind: 'redraw'; state: MaxFormState }
  | { kind: 'refetch'; state: MaxFormState; focus?: MaxField } {
  if (answer.ok || answer.max !== undefined) {
    return answer.max === undefined ? { kind: 'close' } : { kind: 'close', max: answer.max };
  }
  if (answer.needs === 'listed-spot') {
    return { kind: 'redraw', state: { filled: values, regions: state.regions, pinRefused: true } };
  }
  if (answer.soon !== undefined && answer.soon.choices.length > 0) {
    return {
      kind: 'redraw',
      state: {
        filled: values,
        regions: state.regions,
        soon: { text: answer.text ?? '', choices: answer.soon.choices },
      },
    };
  }
  if (answer.regions !== undefined && answer.regions.length > 0) {
    const { regions } = answer;
    const kept = regions.some((region) => String(region.id) === values.region);
    return {
      kind: 'redraw',
      state: { filled: kept ? values : { ...values, region: '' }, regions },
    };
  }
  const refetch = { kind: 'refetch' as const, state: { filled: values, regions: state.regions } };
  return answer.needs === 'tier' || answer.needs === 'boss'
    ? { ...refetch, focus: answer.needs }
    : refetch;
}

/** A field of the form a refusal points at (R1-4), by its name. */
export type MaxField = 'tier' | 'boss';

/**
 * The field of the form a refusal's `MaxField` focuses, by selector: the tier menu; for the boss,
 * the name typed where the menu says "Another boss" (R2-3), else the boss menu.
 */
export function fieldToFocus(field: MaxField, filled: Partial<MaxValues>): string {
  if (field === 'tier') return 'select[name="tier"]';
  return filled.boss === ANOTHER_BOSS ? 'input[name="typed"]' : 'select[name="boss"]';
}

/**
 * Where the focus goes in the form drawn anew after an answer that points at no field (review B4:
 * the drawing took the focus away with the old form): the checked choice of the ending-soon
 * question once it is asked, which a screen reader reads with the question's words; else Report,
 * the control pressed (`sameControl` finds the one that had the focus first, in the page). A pin
 * refused (`pinRefused`) turns Report off: "← Pick a Power Spot" takes it (review B4b).
 */
export function answerFocus(state: MaxFormState): string {
  if (state.pinRefused) return 'button[data-pick-spot]';
  return state.soon === undefined ? 'button[data-submit="max"]' : 'input[name="soon"]:checked';
}

/** What `submitMax` needs: sending, the lists, and whether the form still holds. */
export interface MaxSubmitDeps {
  send(body: Record<string, unknown>): Promise<Pressed & MaxAnswered>;
  options(): Promise<MaxOptionsView>;
  /** Whether the form is still the one that holds (its popup may have closed meanwhile). */
  holds(): boolean;
}

/** What came of a Submit, for the page to do. */
export type MaxSubmitted =
  /** Something is missing: said under the form, nothing sent. */
  | { kind: 'missing'; text: string }
  /** The form went away meanwhile: only its words are said. */
  | { kind: 'gone'; text: string }
  /** Made, joined or another boss's battle there: the form closes, the battle opened. */
  | { kind: 'close'; text: string; max?: MapMax }
  /** The form drawn again from these lists and state, the field pointed at focused. */
  | {
      kind: 'draw';
      lists: MaxOptionsView;
      state: MaxFormState;
      text: string;
      focus?: MaxField;
    };

/**
 * The max battle form's Submit (R1-2: the part of `maxUi` with no page in it): the body, the
 * report, and what the answer leads to; after a refusal that is no question and no regions, the
 * lists asked for again (A3), the boss picked kept while they still offer it (`keptPick`), and
 * the lists it had where they cannot be had.
 */
export async function submitMax(
  where: MaxWhere,
  values: MaxValues,
  lists: MaxOptionsView,
  state: MaxFormState,
  deps: MaxSubmitDeps,
): Promise<MaxSubmitted> {
  const body = maxBody(where, values);
  if ('text' in body) return { kind: 'missing', text: body.text };
  const sent = await deps.send(body.body);
  if (!deps.holds()) return { kind: 'gone', text: sent.text };
  const step = maxFormAfter(sent, values, state);
  if (step.kind === 'close') {
    return step.max === undefined
      ? { kind: 'close', text: sent.text }
      : { kind: 'close', text: sent.text, max: step.max };
  }
  if (step.kind === 'redraw') return { kind: 'draw', lists, state: step.state, text: sent.text };
  let now = lists;
  try {
    now = await deps.options();
  } catch {
    // The lists it has stay.
  }
  return {
    kind: 'draw',
    lists: now,
    state: { ...step.state, filled: keptPick(now, values) },
    text: sent.text,
    ...(step.focus === undefined ? {} : { focus: step.focus }),
  };
}

/** What was filled in, its boss kept only while the new lists still offer it (a typed one stays). */
export function keptPick(options: MaxOptionsView, values: MaxValues): MaxValues {
  if (values.boss === '' || values.boss === ANOTHER_BOSS) return values;
  return options.bosses.some((boss) => boss.value === values.boss)
    ? values
    : { ...values, boss: '' };
}

/**
 * Sends a report with the page's CSRF token as a press is sent (`pressParty`: a 403 of a stale
 * token is tried once more with a new one; an answer without words says its `error`): the words,
 * the token now, and what the answer says.
 */
export async function sendMaxForm(csrf: string, steps: PressSteps): Promise<Pressed & MaxAnswered> {
  let last: unknown;
  const pressed = await pressParty(csrf, {
    post: async (token) => {
      const answer = await steps.post(token);
      last = answer.body;
      return answer;
    },
    me: () => steps.me(),
  });
  const read = maxAnswerOf(last);
  return { ...read, ...pressed };
}
