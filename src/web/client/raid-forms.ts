import type {
  RaidChange,
  RaidMovesView,
  RaidOptionsView,
} from '../../domain/web/raid-options-data.js';
import { pressParty, type PressSteps, type Pressed } from './parties.js';
import type { MapGym, PageNode } from './popup.js';
import { zoneHint } from './post-time.js';

/**
 * Reporting and changing raids on the live map (plan 8M-4, spec 3.6), the parts that need no
 * Leaflet: the forms as trees of nodes (`renderNode` sets every text as text; the pick lists of
 * `/api/raid-options` and the moves of a raid's boss), the bodies they send, and sending one
 * with the page's CSRF token as a press is sent. What a member types is read by the server with
 * the commands' readers; the page only says what is missing.
 */

/** The longest time a command takes (its option's length). */
const TIME_LENGTH = 40;

const option = (value: string, text: string, selected: boolean): PageNode => ({
  tag: 'option',
  text,
  attributes: { value, ...(selected ? { selected: '' } : {}) },
});

/**
 * The boss and egg pick list as `/raid` offers it: nothing picked at first, the current bosses
 * grouped by tier in the list's order, then the eggs.
 */
function bossSelect(options: RaidOptionsView, picked: string | undefined): PageNode {
  const tiers = new Map<string, PageNode[]>();
  for (const boss of options.bosses) {
    const group = tiers.get(boss.tier) ?? [];
    group.push(option(boss.value, boss.name, boss.value === picked));
    tiers.set(boss.tier, group);
  }
  return {
    tag: 'select',
    attributes: { name: 'boss' },
    children: [
      option('', 'Pick the boss or the egg', picked === undefined || picked === ''),
      ...[...tiers].map(([tier, children]): PageNode => ({
        tag: 'optgroup',
        attributes: { label: tier },
        children,
      })),
      {
        tag: 'optgroup',
        attributes: { label: 'Eggs' },
        children: options.eggs.map((egg) =>
          option(egg.value, `${egg.tier} egg`, egg.value === picked),
        ),
      },
    ],
  };
}

/** What the time of a report is, by what is picked: when an egg hatches, when a raid ends. */
export function timeLabel(picked: string): string {
  return picked.startsWith('b:') ? 'Ends in' : 'Hatches in';
}

const timeInput = (name: string, value: string | undefined): PageNode => ({
  tag: 'input',
  attributes: {
    name,
    type: 'text',
    maxlength: String(TIME_LENGTH),
    placeholder: 'minutes, or a time like 6:15pm',
    autocomplete: 'off',
    ...(value === undefined ? {} : { value }),
  },
});

const labelled = (text: string, className: string, ...children: PageNode[]): PageNode => ({
  tag: 'label',
  className,
  children: [{ tag: 'span', text }, ...children],
});

/** The line under a form where its answer is said. */
const answerLine: PageNode = { tag: 'div', className: 'form-answer', attributes: { hidden: '' } };

/** "Report raid" in a gym's popup (spec 3.6). */
export function reportButton(gymId: number): PageNode {
  return {
    tag: 'button',
    className: 'report-raid',
    text: 'Report raid',
    attributes: { type: 'button', 'data-report': String(gymId) },
  };
}

/**
 * "Report raid" in the box a click opens the form in (`report-box`): in a gym's own popup only;
 * a gym that shows a raid offers the raid instead (plan 8M-8A, review N5: `gymWithRaidBoxes`;
 * one raid per gym of any kind, plan 8E: an elite raid is not reported beside a standard one,
 * nor the reverse).
 */
export function reportBox(gymId: number): PageNode {
  return { tag: 'div', className: 'report-box place-control', children: [reportButton(gymId)] };
}

/**
 * Whether a report's answer closes its form: it went through (whether or not it names the raid
 * to open), or names the raid already there, which the page opens instead.
 */
export function reportClosesForm(answer: RaidAnswered): boolean {
  return answer.ok || answer.raid !== undefined;
}

/**
 * Whether "Report raid" is offered, at each draw: by the last list of parties, which is served
 * only to a member and is read-only while Discord cannot say they are one; before the first list,
 * by what `/api/me` said when the page loaded (`atLoad`: a member, not read-only).
 */
export function reportOffered(atLoad: boolean, view: { readOnly: boolean } | undefined): boolean {
  return view === undefined ? atLoad : !view.readOnly;
}

/** What a report form holds, kept when it is drawn anew (a region to pick, say). */
export interface ReportValues {
  boss: string;
  time: string;
  region: string;
}

/** The server's zone, which reads a form's typed times, and the reader's own. */
export interface FormZones {
  zone: string;
  reader: string;
}

/**
 * The hint of a form's typed times (`zoneHint`, review N4) as nodes: none where the reader's zone
 * is the server's. Shared by the forms of raids, trains and meetups.
 */
export function zoneHintNodes(zone: string, reader: string): PageNode[] {
  const hint = zoneHint(zone, reader);
  return hint === undefined ? [] : [{ tag: 'p', className: 'hint', text: hint }];
}

/**
 * The form of a report at a gym: the boss or egg, the time ("Hatches in" or "Ends in", minutes
 * or a clock time), and the region where the gym lies in several of the server's.
 */
export function reportForm(
  gym: MapGym,
  options: RaidOptionsView,
  regionNames: ReadonlyMap<number, string>,
  filled: Partial<ReportValues> = {},
  reader: string = options.zone,
): PageNode {
  const regions = gym.regionIds.flatMap((id) => {
    const name = regionNames.get(id);
    return name === undefined ? [] : [{ id, name }];
  });
  return {
    tag: 'div',
    className: 'raid-form',
    attributes: { 'data-form': 'report', 'data-gym': String(gym.id) },
    children: [
      { tag: 'strong', className: 'name', text: gym.name },
      labelled('Raid', 'form-row', bossSelect(options, filled.boss)),
      labelled(timeLabel(filled.boss ?? ''), 'form-row time-row', timeInput('time', filled.time)),
      ...zoneHintNodes(options.zone, reader),
      ...(regions.length > 1
        ? [
            labelled('Region', 'form-row', {
              tag: 'select',
              attributes: { name: 'region' },
              children: [
                option('', 'Pick the region', (filled.region ?? '') === ''),
                ...regions.map((region) =>
                  option(String(region.id), region.name, String(region.id) === filled.region),
                ),
              ],
            }),
          ]
        : []),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          {
            tag: 'button',
            className: 'press',
            text: 'Report',
            attributes: { type: 'button', 'data-submit': 'report' },
          },
          {
            tag: 'button',
            className: 'press',
            text: 'Cancel',
            attributes: { type: 'button', 'data-cancel': '' },
          },
        ],
      },
      answerLine,
    ],
  };
}

/** A body to send, or what the member must fill in first. */
export type FormBody = { body: Record<string, string | number> } | { text: string };

/** The body of a report (`POST /s/<guild>/api/raids`). */
export function reportBody(gymId: number, values: ReportValues): FormBody {
  const boss = values.boss.trim();
  if (boss === '') return { text: 'Pick the boss or the egg first.' };
  const time = values.time.trim();
  const region = Number(values.region);
  return {
    body: {
      gym: gymId,
      boss,
      ...(time === '' ? {} : { time }),
      ...(values.region !== '' && Number.isInteger(region) ? { region } : {}),
    },
  };
}

const moveSelect = (name: string, unchanged: string, moves: RaidMovesView['fast']): PageNode => ({
  tag: 'select',
  attributes: { name },
  children: [
    option('', unchanged, true),
    ...moves.map((move) => option(move.id, move.name, false)),
  ],
});

/** Said while a boss is picked in the form of a change, whose moves are the raid's boss's. */
export const MOVES_LATER = "The new boss's moves are set in Manage… afterwards.";

/**
 * The form of a change of a raid, as `/hatch`, `/end`, `/boss` and `/moveset` take it, one Submit
 * for what was filled in (`changesAsked`); the moves only when the raid has a boss whose moves are
 * known (`moves`), off while another boss is picked (`raid-ui.ts`), which `MOVES_LATER` says.
 */
export function changeForm(
  raid: { id: string },
  options: RaidOptionsView,
  moves: RaidMovesView | undefined,
  reader: string = options.zone,
): PageNode {
  return {
    tag: 'div',
    className: 'raid-form',
    attributes: { 'data-form': 'change', 'data-party': raid.id },
    children: [
      { tag: 'strong', className: 'name', text: 'Manage the raid' },
      labelled('Hatches in', 'form-row', timeInput('hatch', undefined)),
      labelled('Ends in', 'form-row', timeInput('end', undefined)),
      ...zoneHintNodes(options.zone, reader),
      labelled('Boss', 'form-row', bossSelect(options, undefined)),
      ...(moves
        ? [
            labelled(
              `Moves of ${moves.boss}`,
              'form-row',
              moveSelect('quick', 'Fast move as it is', moves.fast),
              moveSelect('charge', 'Charged move as it is', moves.charged),
            ),
            {
              tag: 'p',
              className: 'hint moves-later',
              text: MOVES_LATER,
              attributes: { hidden: '' },
            },
          ]
        : []),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          {
            tag: 'button',
            className: 'press',
            text: 'Submit',
            attributes: { type: 'button', 'data-submit': 'change' },
          },
          {
            tag: 'button',
            className: 'press',
            text: 'Cancel',
            attributes: { type: 'button', 'data-cancel': '' },
          },
        ],
      },
      answerLine,
    ],
  };
}

/** The body of a change (`POST /s/<guild>/api/raids/<id>/<change>`), from the form's fields. */
export function changeBody(change: RaidChange, values: Record<string, string>): FormBody {
  const field = (name: string): string => (values[name] ?? '').trim();
  switch (change) {
    case 'hatch':
    case 'end': {
      const time = field(change);
      return time === '' ? { text: 'Type the time first.' } : { body: { time } };
    }
    case 'boss': {
      const boss = field('boss');
      return boss === '' ? { text: 'Pick the boss or the egg first.' } : { body: { boss } };
    }
    case 'moves': {
      const quick = field('quick');
      const charge = field('charge');
      if (quick === '' && charge === '') {
        return { text: 'Pick the fast move, the charged move, or both.' };
      }
      return {
        body: { ...(quick === '' ? {} : { quick }), ...(charge === '' ? {} : { charge }) },
      };
    }
  }
}

/** What a Submit answers when nothing in its form was changed, as Manage… of a train does. */
export const NOTHING_CHANGED = 'Nothing changed.';

/** The order a Submit sends a raid's changes in. */
const CHANGES_IN_TURN: readonly RaidChange[] = ['boss', 'hatch', 'end', 'moves'];

/**
 * The changes of a raid a Submit asks for, from the form's fields: those filled in, and never the
 * moves with a boss, for the moves on the form are the old boss's.
 */
export function changesAsked(
  values: Record<string, string>,
): { change: RaidChange; body: Record<string, string | number> }[] {
  const newBoss = (values.boss ?? '').trim() !== '';
  return CHANGES_IN_TURN.flatMap((change) => {
    if (change === 'moves' && newBoss) return [];
    const made = changeBody(change, values);
    return 'text' in made ? [] : [{ change, body: made.body }];
  });
}

/**
 * What the page takes of a report's or a change's answer: whether it was done, and the raid to
 * open (by id and gym). Anything else in it is ignored: the regions of a gym that lies in several
 * the form has from `/api/geo` already.
 */
export interface RaidAnswered {
  ok: boolean;
  raid?: { id: string; gymId: number | null };
}

export function raidAnswerOf(body: unknown): RaidAnswered {
  if (typeof body !== 'object' || body === null) return { ok: false };
  const { ok, raid } = body as { ok?: unknown; raid?: unknown };
  const answered: RaidAnswered = { ok: ok === true };
  if (typeof raid === 'object' && raid !== null) {
    const { id, gymId } = raid as { id?: unknown; gymId?: unknown };
    if (typeof id === 'string' && (typeof gymId === 'number' || gymId === null)) {
      answered.raid = { id, gymId };
    }
  }
  return answered;
}

/**
 * A popup's content that, while a form is open in it, is the node already drawn: Leaflet asks a
 * function content again on every `update()` (which fits the popup to the form), and a node
 * drawn anew would wipe the form. Drawn anew whenever no form is open.
 */
export function heldContent<T>(draw: () => T, editing: () => boolean): () => T {
  let drawn: T | undefined;
  return () => {
    if (drawn === undefined || !editing()) drawn = draw();
    return drawn;
  };
}

/** Stops a click where it is: on a popup, before the map sees it (`keepClicksInPopup`). */
const stopClick = (event: { stopPropagation(): void }): void => {
  event.stopPropagation();
};

/**
 * Keeps the clicks in a popup from the map. Leaflet (1.9) leaves a click in a popup alone by
 * walking up from the click's target to the popup when the click reaches the map
 * (`Map._isClickDisabled`); a control that takes its own button out of the page as it is clicked
 * (a form of the post drawn in its place, Cancel putting a gym's buttons back) leaves
 * nothing to walk up from, so Leaflet took it for a click on the map and closed the popup
 * (staging of the web map plans, 2026-10-18). Stopped at the popup's element, a click never
 * reaches the map. Safe to call on every opening: the listener is added once.
 */
export function keepClicksInPopup(element: {
  addEventListener(type: 'click', listener: (event: { stopPropagation(): void }) => void): void;
}): void {
  element.addEventListener('click', stopClick);
}

/**
 * Which popup is open and the key that names it across redraws (`gym:<id>`, `train:<id>`,
 * `route:<id>`), as Leaflet tells it: on opening the map's `popupopen` (`opened`) and then the
 * layer's (`openedAs`), on closing the map's `popupclose` (`closed`) and then the layer's
 * (`closedAs`). The map's close forgets the key too, so that nothing done while Leaflet closes a
 * popup (or opens another, which closes the first) opens it again.
 */
export class OpenPopup<P> {
  private shownPopup: P | undefined;
  private shownKey: string | undefined;

  /** The popup that is open, which a form drawn into it is fitted to. */
  get popup(): P | undefined {
    return this.shownPopup;
  }

  /** The key of the popup that is open, or of the one to open after the list is drawn. */
  get key(): string | undefined {
    return this.shownKey;
  }

  /** The map's `popupopen`. */
  opened(popup: P): void {
    this.shownPopup = popup;
  }

  /** A bound layer's `popupopen`, under its key. */
  openedAs(key: string): void {
    this.shownKey = key;
  }

  /** The map's `popupclose`, before the layer's: the popup shown is closed, with its key. */
  closed(popup: P): void {
    if (this.shownPopup !== popup) return;
    this.shownPopup = undefined;
    this.shownKey = undefined;
  }

  /** A bound layer's `popupclose`. */
  closedAs(key: string): void {
    if (this.shownKey === key) this.shownKey = undefined;
  }

  /** The popup to open once the list is drawn anew (a raid just reported or changed). */
  openNext(key: string): void {
    this.shownKey = key;
  }
}

/**
 * Runs `run` with the focus and the caret kept where they were: Leaflet's `update()` takes a popup's
 * content out of the page and puts it back, also the very node a form holds, which blurs a field
 * being typed in. A control that `run` took away for good is left alone.
 */
export function keepingFocus(page: { activeElement: Element | null }, run: () => void): void {
  // Whatever has the focus: on anything but a text field the two read as null or undefined.
  const had = page.activeElement as HTMLInputElement | null;
  const from = had?.selectionStart;
  const to = had?.selectionEnd;
  run();
  if (!had || page.activeElement === had || !had.isConnected) return;
  had.focus();
  if (typeof from === 'number' && typeof to === 'number') had.setSelectionRange(from, to);
}

/**
 * What `FormHold` works with: drawing a new list, the popup that is open (Leaflet's), running
 * work after the event being handled (`setTimeout(…, 0)` in the page), and turning the controls
 * that open a form ("Report raid", "Manage…") off and on.
 */
export interface FormHoldDeps<V> {
  draw(view: V): void;
  popup(): { update(): void } | undefined;
  later(run: () => void): void;
  controls(on: boolean): void;
  /** A form took the hold or let it go (fix round 1: the side pane shows the list or the form). */
  changed?(): void;
}

/**
 * The claim of one form on the hold (`FormHold.take`), from the click that opens it until it
 * closes: in a popup, or in the side panel (which no popup's closing takes away). `aside`: in
 * the trains' box at the top of the side panel (the start form, route mode), which a redraw of
 * the list keeps, so the list is drawn under it (plan 8M-5).
 */
export interface FormClaim {
  readonly inPopup: boolean;
  /** In the phone card (review N2): only the card's closing lets it go (`cardClosed`). */
  readonly inCard?: boolean;
  readonly aside?: boolean;
  /**
   * Whether the form is still in the page (fix round 1): a form outside a popup (a change form in a
   * line of the list) whose place a redraw took away lets its claim go (`checkGone`).
   */
  readonly alive?: () => boolean;
}

/**
 * Where a form is (reviews 8A-1, N2), as `FormHold.take` claims it: in the phone card (`'card'`,
 * whose closing alone takes the form with it, `FormHold.cardClosed`), in a Leaflet popup (`true`,
 * `FormHold.popupClosed`), or elsewhere (`false`: the side pane, a line of the list).
 */
export function formPlace(place: Pick<HTMLElement, 'closest'>): boolean | 'card' {
  if (place.closest('.party-card') !== null) return 'card';
  return place.closest('.leaflet-popup') !== null;
}

/**
 * The raid form that is open, one at a time: a click on "Report raid" or "Manage…" takes the
 * hold (`take`) before the form's lists are asked for, and the controls that open the other
 * forms are off until it lets go. While it holds, a popup's content is held (`content`) and a
 * new list waits (`shown`), drawn once the form closes (`release`, by the form that holds it
 * only: a late answer of a form gone with its popup closes nothing of the form open now) or its
 * popup does (`popupClosed`), or the phone card it is in (`cardClosed`). A popup closes inside
 * Leaflet's own handling (also when another one opens): the list is drawn after it, never inside,
 * where a redraw would open the closing popup again beside the new one.
 */
export class FormHold<V> {
  private holder: FormClaim | undefined;
  private waiting: { view: V } | undefined;

  constructor(private readonly deps: FormHoldDeps<V>) {}

  get editing(): boolean {
    return this.holder !== undefined;
  }

  /** Whether a form of the side pane's box holds (the start form, route mode, a meetup's form). */
  get asideHeld(): boolean {
    return this.holder?.aside === true;
  }

  /** Lets the claim go of a form that went away from the page (its `alive`). */
  checkGone(): void {
    const { holder } = this;
    if (holder?.alive && !holder.alive()) this.release(holder);
  }

  /** A popup's content function, held while a form is open (`heldContent`). */
  content<T>(draw: () => T): () => T {
    return heldContent(draw, () => this.editing);
  }

  /**
   * A new list (the parties' poll alone): drawn now, or once no form is open; under a form of the
   * trains' box (`aside`), which the redraw keeps, now. The list drawn anew is `redraw`.
   */
  shown(view: V): void {
    this.checkGone();
    if (this.editing && this.holder?.aside !== true) this.waiting = { view };
    else this.deps.draw(view);
  }

  /**
   * The list drawn anew, not a new one (the reports at stops changed, a layer was toggled, the
   * theme changed): `current` is the list the page has. Under a form (not of the trains' box) a
   * newer list that waits keeps its place (branch review W1 of 8M-9B: the parties' poll skips a
   * text it had, so a list replaced here would be lost), and with none waiting `current` waits.
   * `current` is read after a form gone from the page let go (re-review X1): its letting go draws
   * the newer list that waited, which is then the list the page has.
   */
  redraw(current: () => V): void {
    this.checkGone();
    if (this.editing && this.holder?.aside !== true) this.waiting ??= { view: current() };
    else this.deps.draw(current());
  }

  /**
   * A form is being opened: its claim, or none while another form holds. `aside`: a form of the
   * trains' box (`FormClaim.aside`).
   */
  take(place: boolean | 'card', aside = false, alive?: () => boolean): FormClaim | undefined {
    if (this.holder) return undefined;
    const claim: FormClaim = {
      inPopup: place === true,
      ...(place === 'card' ? { inCard: true } : {}),
      ...(aside ? { aside } : {}),
      ...(alive ? { alive } : {}),
    };
    this.holder = claim;
    this.deps.controls(false);
    this.deps.changed?.();
    return claim;
  }

  /** Whether this form is the one that holds. */
  holds(claim: FormClaim): boolean {
    return this.holder === claim;
  }

  /**
   * The form's lists came: whether to draw it. Not when its claim no longer holds (its popup
   * closed meanwhile) or its place is no longer in the page (`connected`); its claim is let go.
   */
  ready(claim: FormClaim, connected: boolean): boolean {
    if (this.holds(claim) && connected) return true;
    this.release(claim);
    return false;
  }

  /** The form was drawn into the popup that is open: the popup fits it. */
  fit(): void {
    this.deps.popup()?.update();
  }

  /**
   * A form closed: when it is the one that holds, the hold lets go, the popup fits what it shows
   * then, the controls are on, and what waited is drawn. Any other claim changes nothing.
   */
  release(claim: FormClaim): void {
    if (!this.holds(claim)) return;
    this.holder = undefined;
    this.deps.controls(true);
    this.deps.changed?.();
    this.deps.popup()?.update();
    this.drawWaiting();
  }

  /**
   * A popup closed: a form in a popup is gone with it, at once; what waited is drawn after
   * Leaflet's handling of the close (`later`), unless a form is open again by then. A form in the
   * side panel stays.
   */
  popupClosed(): void {
    if (!this.holder?.inPopup) return;
    this.letGo();
  }

  /** The phone card closed (review N2): a form in it is gone with it, as `popupClosed` has it. */
  cardClosed(): void {
    if (!this.holder?.inCard) return;
    this.letGo();
  }

  /** The form held is gone with its popup or card. */
  private letGo(): void {
    this.holder = undefined;
    this.deps.controls(true);
    this.deps.changed?.();
    this.deps.later(() => {
      if (!this.editing) this.drawWaiting();
    });
  }

  private drawWaiting(): void {
    if (!this.waiting) return;
    const { view } = this.waiting;
    this.waiting = undefined;
    this.deps.draw(view);
  }
}

/**
 * Sends a report or a change with the page's CSRF token as a press is sent (`pressParty`: a 403
 * of a stale token is tried once more with a new one): the words to say, the token now, and what
 * the answer says of the raid.
 */
export async function sendRaidForm(
  csrf: string,
  steps: PressSteps,
): Promise<Pressed & RaidAnswered> {
  let last: unknown;
  const pressed = await pressParty(csrf, {
    post: async (token) => {
      const answer = await steps.post(token);
      last = answer.body;
      return answer;
    },
    me: () => steps.me(),
  });
  return { ...pressed, ...raidAnswerOf(last) };
}
