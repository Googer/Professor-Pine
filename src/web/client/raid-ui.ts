import { formKeys } from './form-keys.js';
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
import { focusBack } from './post-forms.js';
import type { PressAnswer } from './press-answer.js';
import { readerZone } from './post-time.js';
import type { ReportKindId } from './report-icons.js';
import {
  changeForm,
  changesAsked,
  type FormHold,
  formPlace,
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
 * popup (also one that shows raids) opens the report form in its place; "Manage…" in a raid's
 * popup opens the change form in place of that raid. The pick lists come from
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
   * The form that is open (`FormHold`), one at a time: taken by the click that opens a form,
   * let go when it closes; the party list is not drawn anew under it.
   */
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
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
  const send = async (form: HTMLElement, url: string, body: FormBody, inForm = false) => {
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
    return sent;
  };

  /**
   * Opens the report form of a gym in `box`, in place of its button: only while no other form is
   * open, and only when the box is still in the page once the lists came (its popup may have
   * closed meanwhile).
   */
  const openReport = async (
    box: HTMLElement,
    gym: MapGym,
    restore: () => void,
    /** The Report button's step 3 (plan 8M-9A, R1-3): the boss menu takes the focus. */
    focusFirst = false,
    /** Opened by a tap in step 2: "← Another gym" (`addPickAgain`). */
    again?: ReportKindId,
  ) => {
    const { hold } = deps;
    const claim = hold.take(formPlace(box));
    if (!claim) return;
    let lists: RaidOptionsView;
    try {
      lists = await options();
    } catch {
      hold.release(claim);
      say(NO_OPTIONS);
      return;
    }
    if (!hold.ready(claim, box.isConnected)) return;
    const form = renderNode(reportForm(gym, lists, deps.regionNames, {}, readerZone()), document);
    addPickAgain(form, again);
    const boss = form.querySelector<HTMLSelectElement>('select[name="boss"]');
    const label = form.querySelector<HTMLElement>('.time-row span');
    boss?.addEventListener('change', () => {
      if (label) label.textContent = timeLabel(boss.value);
    });
    const close = () => {
      restore();
      hold.release(claim);
    };
    formKeys(form);
    form.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) close();
      if (target.dataset.submit !== 'report') return;
      const values = fieldsOf(form);
      void send(
        form,
        `/s/${guild}/api/raids`,
        reportBody(gym.id, {
          boss: values.boss ?? '',
          time: values.time ?? '',
          region: values.region ?? '',
        }),
      ).then(async (sent) => {
        if (!sent || !reportClosesForm(sent)) return;
        // A form gone with its popup meanwhile: the list again, and nothing opened over what
        // the member does now.
        if (!hold.holds(claim)) {
          await deps.done(undefined);
          return;
        }
        // A new raid, or the raid that was there already: the list again, and the raid opened.
        close();
        await deps.done(sent.raid);
      });
    });
    box.replaceChildren(form);
    hold.fit();
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
   * Opens the change form of a raid in place of its section of a popup or of the side panel, as
   * `openReport` opens a report's.
   */
  const openChange = async (section: HTMLElement, raidId: string, control: HTMLElement) => {
    const { hold } = deps;
    // Outside a popup (a line of the list), its claim goes with its form (fix round 1).
    const popup = formPlace(section);
    const claim = hold.take(popup, false, popup ? undefined : () => section.isConnected);
    if (!claim) return;
    let lists: RaidOptionsView;
    try {
      lists = await options();
    } catch {
      hold.release(claim);
      say(NO_OPTIONS);
      return;
    }
    const known = await moves(raidId);
    if (!hold.ready(claim, section.isConnected)) return;
    const before = [...section.childNodes];
    const form = renderNode(changeForm({ id: raidId }, lists, known, readerZone()), document);
    const close = () => {
      section.replaceChildren(...before);
      hold.release(claim);
      // The release may have drawn the popup anew: the control in it as it is now.
      focusBack(liveControl(control));
    };
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
      hold.fit();
    });
    formKeys(form);
    form.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        close();
        return;
      }
      if (target.dataset.submit === undefined) return;
      void submit();
    });
    /** What was filled in, one change after another; a refusal stops there, the form kept. */
    const submit = async () => {
      const asked = changesAsked(fieldsOf(form));
      let raid: Parameters<typeof deps.done>[0];
      const went: string[] = [];
      for (const { change, body } of asked) {
        const url = `/s/${guild}/api/raids/${encodeURIComponent(raidId)}/${change}`;
        const sent = await send(form, url, { body }, true);
        if (sent === undefined) return;
        if (!sent.ok) {
          const told = [...went, sent.text].join(' ');
          // A form gone with its popup meanwhile: said where the member looks now.
          const here = hold.holds(claim);
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
      }
      // Done: the answer in the post's answer line (plan 8M-11A, review fix F4), then the list
      // again, which shows the raid as it is now. A form gone with its popup meanwhile opens
      // nothing over what the member does now.
      const answer = { text: went.length === 0 ? NOTHING_CHANGED : went.join(' '), ok: true };
      if (!hold.holds(claim)) {
        deps.answered(raidId, answer, control);
        await deps.done(undefined);
        return;
      }
      // The post back in the page first: its answer line takes the answer.
      close();
      deps.answered(raidId, answer, control);
      await deps.done(raid);
    };
    section.replaceChildren(form);
    hold.fit();
  };

  /** A click on "Report raid" (`reportBox`): the form in place of the button, in its box. */
  const reportClicked = (
    button: HTMLButtonElement,
    gym: MapGym,
    focusFirst = false,
    again?: ReportKindId,
  ): void => {
    const box = button.parentElement;
    if (!box) return;
    void openReport(
      box,
      gym,
      () => {
        box.replaceChildren(button);
      },
      focusFirst,
      again,
    );
  };

  return {
    /** "Report raid" for a gym's own popup; a click opens the form in its place. */
    reportControl(gym: MapGym): HTMLElement {
      const box = renderNode(reportBox(gym.id), document);
      const button = box.querySelector('button');
      button?.addEventListener('click', () => {
        reportClicked(button, gym);
      });
      return box;
    },

    /** A click on "Report raid" in the popup of a gym that shows raids. */
    reportClicked,

    /** A click on "Manage…" of a raid: its form in place of the raid's section. */
    changeClicked(button: HTMLButtonElement): void {
      const raidId = button.dataset.changeRaid;
      const section = button.closest<HTMLElement>('.raid');
      if (raidId === undefined || !section) return;
      void openChange(section, raidId, button);
    },
  };
}

export type RaidUi = ReturnType<typeof raidUi>;
