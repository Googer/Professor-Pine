import type { MapMeet, MapParty, MapReport } from '../../domain/web/party-data.js';
import type { MapManage, MapSplit } from '../../domain/web/train-data.js';
import {
  manageBody,
  manageForm,
  moveBody,
  moveForm,
  splitBody,
  splitForm,
} from './train-post-forms.js';
import { getJson } from './common.js';
import { formKeys } from './form-keys.js';
import type { Me } from './notice.js';
import { renderNode, type PageNode } from './popup.js';
import {
  closeBody,
  closeForm,
  focusBack,
  formStep,
  meetBody,
  meetForm,
  noteBox,
  regroupBody,
  regroupForm,
  reportBody,
  reportForm,
  sendPostForm,
  type FormTimes,
  type PostFormBody,
} from './post-forms.js';
import { liveControl, sameControl } from './list-ui.js';
import { formPlace, type FormHold } from './raid-forms.js';
import { fieldsOf, sayInForm } from './raid-ui.js';
import { readerZone } from './post-time.js';
import type { PressAnswer } from './press-answer.js';

/**
 * The post's controls that open a dialog on Discord, as forms of the live map in the page (plan
 * 8M-8B): each form opens in the place of the party's post (in its popup, its line of the list or
 * the phone card: `formPlace`), held like the other forms (`FormHold`: one at a time, the list
 * not drawn anew under it), closed by Cancel or Escape, which put the post back. A form that went
 * through, or whose party has ended, closes and the list is asked for again; a refusal is said
 * under the form and in the notice, and the form stays.
 */
export interface PostFormsDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'ready' | 'release' | 'fit'>;
  /** Where the page is now: Pine's origin, the reader's times. */
  origin(): string;
  times(): FormTimes;
  /** After a form went through, or its party ended: the list again, which shows it as it is. */
  done(): Promise<void>;
  /**
   * A party closed (Delete…) or found over: its popup or phone card closes; the party as the form
   * was opened for it (review N-3: a poll may have taken it out of the list meanwhile).
   */
  closeParty(party: MapParty): void;
  /**
   * An answer for the party's answer line (plan 8M-11A, S9): a form that closed (done, or refused
   * where a refusal closes it), or one that did not open; `from` is where it was pressed, whose
   * popup or card a refusal shakes.
   */
  answered(party: MapParty, answer: PressAnswer, from: HTMLElement): void;
  /**
   * A refusal said under a form that stays (plan 8M-13, A2): the page moves the form's popup or
   * card (`refusalMoves`: the card bounces, a popup shakes).
   */
  refused(party: MapParty, form: HTMLElement): void;
}

export function postFormsUi(deps: PostFormsDeps) {
  const { guild, hold } = deps;

  /**
   * Opens a form in the place of the post of the button pressed, only while no other form is
   * open: the hold is taken at once, then `load` says what to draw (a form that asks the server
   * first waits for it) or why it does not open; drawn only while its claim holds and its place is
   * still in the page. `bodyOf` makes what Submit sends from the form's fields (or what is
   * missing), to `control`.
   */
  const open = async (
    button: HTMLButtonElement,
    control: string,
    party: MapParty,
    load: () => Promise<Opened | { refused: string }>,
    ends = false,
  ): Promise<void> => {
    // A party's post, or its own summary while the page has not got the post (a train's).
    const section =
      button.closest<HTMLElement>('.post-popup') ?? button.closest<HTMLElement>('.party-popup');
    if (!section) return;
    const place = formPlace(section);
    // Outside a popup or the card (a line of the list), its claim goes with its form.
    const claim = hold.take(place, false, place === false ? () => section.isConnected : undefined);
    if (!claim) return;
    const loaded = await load();
    if ('refused' in loaded) {
      hold.release(claim);
      // The release may have drawn the popup anew (review B-1): the answer line of the post as it
      // is now (plan 8M-11A, S20), its popup or card shaken.
      const control = liveControl(button);
      deps.answered(party, { text: loaded.refused, ok: false }, control);
      control.focus();
      return;
    }
    if (!hold.ready(claim, section.isConnected)) return;
    const { form, bodyOf } = loaded;
    const before = [...section.childNodes];
    const element = renderNode(form, document);
    const close = () => {
      section.replaceChildren(...before);
      hold.release(claim);
      // The focus back where it was (review W-5), on the button in the post as it is now (the
      // release may have drawn the popup anew, review B-1).
      focusBack(liveControl(button));
    };
    const submit = async (target: HTMLButtonElement) => {
      const fields = fieldsOf(element);
      // A radio choice is the one checked (`fieldsOf` reads every input by its name), else none.
      const radios = [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
      for (const radio of radios) fields[radio.name] = '';
      for (const radio of radios) if (radio.checked) fields[radio.name] = radio.value;
      const body = bodyOf(fields);
      if ('text' in body) {
        sayInForm(element, body.text);
        return;
      }
      const buttons = [...element.querySelectorAll('button')];
      for (const each of buttons) each.disabled = true;
      const sent = await sendPostForm(deps.csrf.get(), {
        post: async (token) => {
          const reply = await fetch(
            `/s/${guild}/api/${partiesOf(control)}/${encodeURIComponent(party.id)}/${body.path ?? control}`,
            {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
              body: JSON.stringify(body.body),
            },
          );
          return {
            status: reply.status,
            body: (await reply.json().catch(() => undefined)) as unknown,
          };
        },
        me: () => getJson<Me>(`/s/${guild}/api/me`),
      });
      deps.csrf.set(sent.csrf);
      for (const each of buttons) each.disabled = false;
      // A refusal keeps the form, unless its choices may be stale (review W-2: Group…'s came with
      // the list, which is asked for again): said under the form, whose popup or card the page
      // moves (plan 8M-11A; plan 8M-13, A2).
      if (formStep(sent, { refusalCloses: loaded.refusalCloses === true }) === 'stay') {
        sayInForm(element, sent.text);
        deps.refused(party, element);
        target.focus();
        return;
      }
      // Done, or over: the post back (the list draws it as it is now), unless the form went; then
      // the answer in the post's answer line, where the member looks (plan 8M-11A, S9; review
      // BR-1: with the post in the page again, so that the line takes it and a refusal shakes its
      // popup or card). A party closed (or over) closes its popup or card (`ends`).
      if (hold.holds(claim)) close();
      deps.answered(party, { text: sent.text, ok: sent.ok }, liveControl(button));
      if (ends || sent.gone) deps.closeParty(party);
      await deps.done();
      // The list drew the post anew: the focus on its control there (review N-1), as the list
      // finds a focused control again (`sameControl`).
      if (!button.isConnected) sameControl(document, button)?.focus();
    };
    element.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) close();
      else if (target.dataset.submit !== undefined) void submit(target);
    });
    // Escape as Cancel, Enter as Submit, the popup or card under it left open.
    formKeys(element);
    section.replaceChildren(element);
    hold.fit();
    (
      element.querySelector<HTMLElement>('input[type="radio"]:checked, select, textarea') ??
      element.querySelector<HTMLElement>('button[data-submit]') ??
      // The note box (plan 8M-11A): its link to the post, else Back.
      element.querySelector<HTMLElement>('a.press, button[data-cancel]')
    )?.focus();
  };

  /**
   * What a form asks the server before it opens (`GET …/parties/<id>/<control>`): the answer, or
   * why it does not open (its refusal, the window full, a party over), as the page says it.
   */
  const asked = async <T>(partyId: string, control: string): Promise<T | { refused: string }> => {
    try {
      const reply = await fetch(
        `/s/${guild}/api/${partiesOf(control)}/${encodeURIComponent(partyId)}/${control}`,
        { credentials: 'same-origin' },
      );
      const body = (await reply.json().catch(() => undefined)) as unknown;
      if (reply.ok) return body as T;
      const { error, text } = (body ?? {}) as { error?: unknown; text?: unknown };
      const said = typeof error === 'string' ? error : typeof text === 'string' ? text : undefined;
      return { refused: said ?? NOT_OPENED };
    } catch {
      return { refused: NOT_OPENED };
    }
  };

  return {
    /** Group…: its form, from the choices the list carries (`MapAttendance.regroup`). */
    regroupClicked(button: HTMLButtonElement, party: MapParty): void {
      const { regroup } = party.attendance;
      if (regroup === undefined || !('choices' in regroup)) return;
      void open(button, 'regroup', party, () =>
        Promise.resolve({
          form: regroupForm(party, regroup, deps.times(), deps.origin(), guild),
          bodyOf: (fields) => regroupBody(regroup, fields.way),
          refusalCloses: true as const,
        }),
      );
    },

    /** Staff's Delete…: `/delete`'s question, from what the list says (`close`). */
    closeClicked(button: HTMLButtonElement, party: MapParty): void {
      const { close } = party;
      if (close === undefined) return;
      void open(
        button,
        'close',
        party,
        () =>
          Promise.resolve({
            form: closeForm(party, close),
            bodyOf: (fields) => closeBody(fields.removal),
          }),
        true,
      );
    },

    /** Report…: `/report`'s form, once the server said it may open (`GET …/report`), or why not. */
    reportClicked(button: HTMLButtonElement, party: MapParty): void {
      void open(button, 'report', party, async () => {
        const report = await asked<MapReport>(party.id, 'report');
        if ('refused' in report) return report;
        return {
          form: reportForm(party, report),
          bodyOf: (fields) => reportBody(fields.reason),
        };
      });
    },

    /**
     * A train's Move… (plan 8M-8C, R1): the post's dialog as the list carries it
     * (`MapTrain.moves`), uncounted until its Submit (`POST …/trains/<id>/move/<move>`). A refusal
     * closes it (its choices may be stale) and the list is asked for again.
     */
    moveClicked(button: HTMLButtonElement, party: MapParty): void {
      if (party.kind !== 'train' || party.moves === null) return;
      const { moves } = party;
      void open(button, 'move', party, () =>
        Promise.resolve({
          form: moveForm(party.id, moves),
          bodyOf: (fields) => moveBody(moves, fields),
          refusalCloses: true as const,
        }),
      );
    },

    /**
     * A train's Manage… (plan 8M-8C): its form from what the post's dialog shows now (`GET
     * …/trains/<id>/manage`), or why not. A refusal of its Submit closes it (its choices may be
     * stale) and the list is asked for again.
     */
    manageClicked(button: HTMLButtonElement, party: MapParty): void {
      void open(button, 'manage', party, async () => {
        const manage = await asked<MapManage>(party.id, 'manage');
        if ('refused' in manage) return manage;
        return {
          form: manageForm(party.id, manage, Date.now(), readerZone()),
          bodyOf: (fields) => manageBody(manage, fields),
          refusalCloses: true as const,
        };
      });
    },

    /**
     * A train's Split… (plan 8M-8C): the dialog the member would be shown now (`GET
     * …/trains/<id>/split`), or why not. A refusal closes it (its groups may have changed) and the
     * list is asked for again; once split, the list shows both trains.
     */
    splitClicked(button: HTMLButtonElement, party: MapParty): void {
      void open(button, 'split', party, async () => {
        const split = await asked<MapSplit>(party.id, 'split');
        if ('refused' in split) return split;
        return {
          form: splitForm(party.id, split),
          bodyOf: (fields) => splitBody(split, fields),
          refusalCloses: true as const,
        };
      });
    },

    /**
     * Meet…: its form, from what the server offers now (`GET …/meet`), or why not. A refusal of
     * its Submit closes it as Group…'s does (plan 8M-11A, S21: its group or times may be stale),
     * the answer in the answer line.
     */
    meetClicked(button: HTMLButtonElement, party: MapParty): void {
      void open(button, 'meet', party, async () => {
        const meet = await asked<MapMeet>(party.id, 'meet');
        if ('refused' in meet) return meet;
        return {
          form: meetForm(party, meet, deps.times()),
          bodyOf: (fields) => meetBody(meet, fields.time),
          refusalCloses: true as const,
        };
      });
    },

    /**
     * A button whose answer is "do this on Discord" (plan 8M-11A, S9): the note box in the form's
     * place (`noteBox`: Group… where only a new group is left, a button the map has no form of),
     * the post's link as a button, Back or Escape putting the post back.
     */
    noteClicked(button: HTMLButtonElement, party: MapParty, text: string): void {
      void open(button, 'note', party, () =>
        Promise.resolve({
          form: noteBox(party, text, deps.origin(), guild),
          bodyOf: () => ({ text: '' }),
        }),
      );
    },
  };
}

/** A form ready to draw, and what its Submit sends. */
interface Opened {
  form: PageNode;
  bodyOf: (fields: Record<string, string>) => PostFormBody;
  /** A refusal closes the form and the list is asked for again (`formStep`, review W-2). */
  refusalCloses?: true;
}

/** What the page says when a form could not ask the server what it offers. */
const NOT_OPENED = 'That did not get through; try again.';

/** The forms of a train's post (plan 8M-8C), whose addresses are the trains'. */
const TRAIN_FORMS: ReadonlySet<string> = new Set(['move', 'manage', 'split']);

/** Where a form's control is: `/api/trains/<id>/…` for a train's, else `/api/parties/<id>/…`. */
function partiesOf(control: string): 'trains' | 'parties' {
  return TRAIN_FORMS.has(control) ? 'trains' : 'parties';
}

export type PostFormsUi = ReturnType<typeof postFormsUi>;
