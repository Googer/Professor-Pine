import { isOff, missingOf } from './form-buttons.js';
import { liveCheck, type FormCheck } from './form-check.js';
import { formKeys } from './form-keys.js';
import { formHome, type FormFrame } from './form-home.js';
import type {
  RaidChange,
  RaidMovesView,
  RaidOptionsView,
} from '../../domain/web/raid-options-data.js';
import { getJson, say } from './common.js';
import { liveControl } from './list-ui.js';
import type { Me } from './notice.js';
import { addPickAgain } from './pick-again.js';
import { renderNode, type MapGym } from './popup.js';
import type { PressAnswer } from './press-answer.js';
import { readerZone } from './post-time.js';
import type { ReportKindId } from './report-icons.js';
import {
  changeForm,
  changeMissing,
  changesAsked,
  NOTHING_CHANGED,
  reportBody,
  reportBox,
  reportClosesForm,
  reportForm,
  sendRaidForm,
  timeLabel,
  type FormBody,
  type RaidAnswered,
} from './raid-forms.js';

/**
 * The raid forms of the live map in the page (plan 8M-4, spec 3.6): "Report raid" in a gym's
 * popup (also one that shows raids) opens the report form, "Manage…" in a raid's popup the change
 * form, in the side pane or on a phone the card (plan 8M-22, `formHome`). The pick lists come from
 * `/api/raid-options` (the browser revalidates them by their ETag), the moves from the raid's own
 * address. Every text is set as text (`renderNode`). After a success the party list is asked for
 * at once and the raid's popup opened (`done`); a refusal is said under the form and in the
 * notice.
 */
export interface RaidUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  /** The names of the server's regions by id, as `/api/geo` gives them. */
  regionNames: ReadonlyMap<number, string>;
  /** After a report or a change went through: the list again, and the raid opened. */
  done(raid: RaidAnswered['raid']): Promise<void>;
  /**
   * Where the forms open (plan 8M-22, `formHome`): the side pane, the place's popup closed; the
   * form that is open holds the page's `FormHold`, one at a time.
   */
  frame: FormFrame;
  /**
   * The answer of a raid's Manage… that went through, for its post's answer line (plan 8M-11A,
   * review fix F4), as a press's; `from` the control that opened the form.
   */
  answered(raidId: string, answer: PressAnswer, from: Element): void;
  /** A refusal that keeps the change form: the form shaken (`shake`, plan 8M-11A). */
  refused(form: HTMLElement): void;
}

/**
 * The controls that open a form ("Report raid", "Manage…", "Report spawn here" (a PokéStop's
 * too, `data-spawn-at`, and a Power Spot's, `data-spawn-spot`), and of trains
 * "New train", "Edit route", "Move…", "Manage…", "Split…", and of meetups "New meetup", "Meetup
 * here" (a PokéStop's too), "Manage…", and "Report max battle here") under `root`, on or off; with them the choices of a gym's raids, which draw the
 * popup or phone card anew (review W-3).
 */
export function formControls(root: ParentNode, on: boolean): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    'button[data-report], button[data-change-raid], button[data-spawn], button[data-spawn-at], ' +
      'button[data-spawn-spot], ' +
      'button[data-show-raid], ' +
      'button[data-new-train], button[data-train-here], button[data-route-train], ' +
      'button[data-move-train], ' +
      'button[data-manage-train], button[data-split-train], ' +
      'button[data-new-meetup], button[data-meetup-here], button[data-meetup-at-stop], ' +
      'button[data-edit-meetup], ' +
      'button[data-regroup], button[data-meet], button[data-close-party], ' +
      'button[data-report-party], button[data-report-max], ' +
      // The reports at stops' (plan 8M-9B).
      'button[data-report-rocket], button[data-report-research], button[data-take-back], ' +
      'button[data-same-task]',
  )) {
    button.disabled = !on;
  }
}

/** What the page says when the pick lists cannot be loaded. */
const NO_OPTIONS = 'The pick lists could not be loaded. Try again in a moment.';

/** The values of a form's fields by name. */
export function fieldsOf(form: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input[name], select[name], textarea[name]')) {
    values[field.name] = field.value;
  }
  return values;
}

/** Says a form's answer under it, and in the notice. */
export function sayUnder(form: HTMLElement, text: string): void {
  sayInForm(form, text);
  say(text);
}

/**
 * Says a form's answer under it alone (plan 8M-11A): a form of a party's post, whose answers stay
 * where the member looks, out of the notice band.
 */
export function sayInForm(form: HTMLElement, text: string): void {
  const line = form.querySelector<HTMLElement>('.form-answer');
  if (line) {
    // An answer after a press is read as it comes (plan 8M-22: the line is live only for what is
    // said after a press, not while the form's check writes it as the member types).
    line.setAttribute('aria-live', 'polite');
    line.textContent = text;
    line.hidden = false;
  }
}

export function raidUi(deps: RaidUiDeps) {
  const { guild } = deps;

  const options = (): Promise<RaidOptionsView> =>
    getJson<RaidOptionsView>(`/s/${guild}/api/raid-options`);

  const moves = async (raidId: string): Promise<RaidMovesView | undefined> => {
    try {
      return await getJson<RaidMovesView>(
        `/s/${guild}/api/raids/${encodeURIComponent(raidId)}/moves`,
      );
    } catch {
      return undefined;
    }
  };

  /**
   * Sends a body to an address of the raids with the page's token; disables the form meanwhile.
   * Its answer is said under the form and in the notice band (a report's), or under the form alone
   * where the caller says where else it goes (`inForm`: a change, plan 8M-11A).
   */
  const send = async (
    form: HTMLElement,
    url: string,
    body: FormBody,
    inForm = false,
    check?: FormCheck,
  ) => {
    const tell = inForm ? sayInForm : sayUnder;
    if ('text' in body) {
      tell(form, body.text);
      return undefined;
    }
    const buttons = form.querySelectorAll('button');
    for (const each of buttons) each.disabled = true;
    const sent = await sendRaidForm(deps.csrf.get(), {
      post: async (token) => {
        const reply = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
          body: JSON.stringify(body.body),
        });
        return {
          status: reply.status,
          body: (await reply.json().catch(() => undefined)) as unknown,
        };
      },
      me: () => getJson<Me>(`/s/${guild}/api/me`),
    });
    deps.csrf.set(sent.csrf);
    for (const each of buttons) each.disabled = false;
    // A change's answer that closes the form goes to the post's answer line instead.
    if (!inForm || !sent.ok) tell(form, sent.text);
    // The check again (plan 8M-22): the answer may have emptied fields; it stays on the line.
    check?.run(true);
    return sent;
  };

  /**
   * Opens the report form of a gym in the side pane (plan 8M-22, `formHome`), its popup closed:
   * only while no other form is open. Cancel opens the gym's popup again, the focus on `control`.
   */
  const openReport = async (
    gym: MapGym,
    control: HTMLElement | null,
    /** The Report button's step 3 (plan 8M-9A, R1-3): the boss menu takes the focus. */
    focusFirst = false,
    /** Opened by a tap in step 2: "← Another gym" (`addPickAgain`). */
    again?: ReportKindId,
  ) => {
    const home = formHome(deps.frame, { control, place: () => gym.name });
    if (!home.open()) return;
    let lists: RaidOptionsView;
    try {
      lists = await options();
    } catch {
      // Canceled while it loaded (second review R1): nothing said.
      if (!home.holds()) return;
      home.close('back');
      say(NO_OPTIONS);
      return;
    }
    if (!home.holds()) return;
    const form = renderNode(reportForm(gym, lists, deps.regionNames, {}, readerZone()), document);
    addPickAgain(form, again);
    const boss = form.querySelector<HTMLSelectElement>('select[name="boss"]');
    const label = form.querySelector<HTMLElement>('.time-row span');
    boss?.addEventListener('change', () => {
      if (label) label.textContent = timeLabel(boss.value);
    });
    const bodyNow = (): FormBody => {
      const values = fieldsOf(form);
      return reportBody(gym.id, {
        boss: values.boss ?? '',
        time: values.time ?? '',
        region: values.region ?? '',
      });
    };
    // Report off until a boss or an egg is picked (plan 8M-22).
    const check = liveCheck(form, () => missingOf(bodyNow()));
    formKeys(form);
    form.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) home.close('back');
      if (target.dataset.submit !== 'report' || isOff(target)) return;
      void send(form, `/s/${guild}/api/raids`, bodyNow(), false, check).then(async (sent) => {
        if (!sent || !reportClosesForm(sent)) return;
        // A form gone meanwhile: the list again, and nothing opened over what the member does now.
        if (!home.holds()) {
          await deps.done(undefined);
          return;
        }
        // A new raid, or the raid that was there already: the list again, and the raid opened.
        home.close('done');
        await deps.done(sent.raid);
      });
    });
    home.draw(form);
    if (focusFirst) boss?.focus();
  };

  /** The fields of a raid's change, emptied once it went through. */
  const CHANGE_FIELDS: Readonly<Record<RaidChange, readonly string[]>> = {
    hatch: ['hatch'],
    end: ['end'],
    boss: ['boss'],
    moves: ['quick', 'charge'],
  };

  /**
   * Opens the change form of a raid in the side pane (plan 8M-22), as `openReport` opens a
   * report's; Cancel, and a change that went through, open the raid's popup again (`back`), its
   * answer in the post's answer line.
   */
  const openChange = async (raidId: string, control: HTMLElement) => {
    const home = formHome(deps.frame, { control });
    if (!home.open()) return;
    let lists: RaidOptionsView;
    try {
      lists = await options();
    } catch {
      // Canceled while it loaded (second review R1): nothing said.
      if (!home.holds()) return;
      home.close('back');
      say(NO_OPTIONS);
      return;
    }
    const known = await moves(raidId);
    if (!home.holds()) return;
    const form = renderNode(changeForm({ id: raidId }, lists, known, readerZone()), document);
    // The moves on the form are the old boss's: off and emptied while a boss is picked, and once
    // one went through in a Submit whose later change was refused.
    const bossPicked = form.querySelector<HTMLSelectElement>('select[name="boss"]');
    const moveSelects = form.querySelectorAll<HTMLSelectElement>(
      'select[name="quick"], select[name="charge"]',
    );
    const movesLater = form.querySelector<HTMLElement>('.moves-later');
    let bossWent = false;
    bossPicked?.addEventListener('change', () => {
      const off = bossWent || bossPicked.value !== '';
      for (const select of moveSelects) {
        select.disabled = off;
        if (off) select.value = '';
      }
      if (movesLater) movesLater.hidden = !off;
    });
    // Submit off with "Nothing changed yet." until something is typed (plan 8M-22).
    const check = liveCheck(form, () => changeMissing(fieldsOf(form)));
    formKeys(form);
    form.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        home.close('back');
        return;
      }
      if (target.dataset.submit === undefined || isOff(target)) return;
      void submit();
    });
    /** What was filled in, one change after another; a refusal stops there, the form kept. */
    const submit = async () => {
      const asked = changesAsked(fieldsOf(form));
      let raid: Parameters<typeof deps.done>[0];
      const went: string[] = [];
      for (const { change, body } of asked) {
        const url = `/s/${guild}/api/raids/${encodeURIComponent(raidId)}/${change}`;
        const sent = await send(form, url, { body }, true, check);
        if (sent === undefined) return;
        if (!sent.ok) {
          const told = [...went, sent.text].join(' ');
          // A form gone meanwhile: said where the member looks now.
          const here = home.holds();
          if (!here) say(told);
          // What went through is not sent again: its field is emptied and the post drawn anew.
          else if (went.length > 0) sayInForm(form, told);
          if (went.length > 0) await deps.done(undefined);
          if (here) deps.refused(form);
          return;
        }
        went.push(sent.text);
        raid = sent.raid;
        if (change === 'boss') {
          bossWent = true;
          // The boss field is empty again and the moves off: the hint says where the new boss's
          // are set, and the heading no longer names the old boss.
          const heading = moveSelects[0]?.parentElement?.querySelector('span');
          if (heading) heading.textContent = 'Moves';
        }
        for (const name of CHANGE_FIELDS[change]) {
          const field = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
          if (field) field.value = '';
        }
        check.run(true);
      }
      // Done: the answer in the post's answer line (plan 8M-11A, review fix F4), then the list
      // again, which shows the raid as it is now. A form gone meanwhile opens nothing over what
      // the member does now.
      const answer = { text: went.length === 0 ? NOTHING_CHANGED : went.join(' '), ok: true };
      if (!home.holds()) {
        deps.answered(raidId, answer, control);
        await deps.done(undefined);
        return;
      }
      // The raid's popup open again first (plan 8M-22): its answer line takes the answer.
      home.close('back');
      deps.answered(raidId, answer, liveControl(control));
      await deps.done(raid);
    };
    home.draw(form);
  };

  /**
   * A click on "Report raid" (`reportBox`), or the Report button's step 3 at a gym (`control` the
   * Report button, its popup not opened first): the form in the side pane.
   */
  const reportClicked = (
    control: HTMLElement | null,
    gym: MapGym,
    focusFirst = false,
    again?: ReportKindId,
  ): void => {
    void openReport(gym, control, focusFirst, again);
  };

  return {
    /** "Report raid" for a gym's own popup; a click opens the form in the side pane. */
    reportControl(gym: MapGym): HTMLElement {
      const box = renderNode(reportBox(gym.id), document);
      const button = box.querySelector('button');
      button?.addEventListener('click', () => {
        reportClicked(button, gym);
      });
      return box;
    },

    /** A click on "Report raid" in the popup of a gym that shows raids, or step 3 at a gym. */
    reportClicked,

    /** A click on "Manage…" of a raid: its form in the side pane, done once drawn or not. */
    changeClicked(button: HTMLButtonElement): Promise<void> {
      const raidId = button.dataset.changeRaid;
      if (raidId === undefined) return Promise.resolve();
      return openChange(raidId, button);
    },
  };
}

export type RaidUi = ReturnType<typeof raidUi>;
