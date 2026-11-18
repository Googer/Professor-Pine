import { isOff } from './form-buttons.js';
import { liveCheck, type FormCheck } from './form-check.js';
import { formKeys } from './form-keys.js';
import { formHome, type FormHome, type FormFrame } from './form-home.js';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { MaxOptionsView } from '../../domain/web/max-data.js';
import type { MapMax } from '../../domain/web/party-data.js';
import { getJson, say } from './common.js';
import { sameControl } from './list-ui.js';
import {
  ANOTHER_BOSS,
  answerFocus,
  fieldToFocus,
  maxBox,
  maxForm,
  maxMissing,
  sendMaxForm,
  submitMax,
  type MaxField,
  type MaxFormState,
  type MaxValues,
  type MaxWhere,
} from './max-forms.js';
import type { Me } from './notice.js';
import { addPickAgain } from './pick-again.js';
import { renderNode } from './popup.js';
import { readerZone } from './post-time.js';
import type { ReportKindId } from './report-icons.js';
import type { FormHold } from './raid-forms.js';
import { fieldsOf, sayUnder } from './raid-ui.js';
import { regionsAt, spawnPoint } from './spawn-forms.js';

/**
 * The max battle form of the live map in the page (plan 8M-9A): "Report max battle here" in a
 * Power Spot's popup opens it in place of its button; a point of the map picked in the Report
 * button's step 2 opens it in a popup of its own there, an "Unlisted power spot" (`maxAt`). The
 * pick lists come from `/api/max-options` (the browser revalidates them by their ETag), asked for
 * again after any refusal but the ending-soon question and the regions (A3). It is held like the
 * other forms (`FormHold`, one form at a time). A battle made, joined, or there with another boss
 * closes the form and is opened (`done`).
 */
export interface MaxUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  /** The server's regions with their outlines, as `/api/geo` gives them. */
  regions: GeoView['regions'];
  /** The form that is open, shared with the other forms. */
  hold: Pick<FormHold<unknown>, 'editing'>;
  /** Where the forms open (plan 8M-22, `formHome`): the side pane, the place's popup closed. */
  frame: FormFrame;
  /**
   * The pin of the Report button's step 2 (`report-pin`) at a point, fixed while its form is open;
   * what takes it away.
   */
  pinAt(point: { lat: number; lon: number }): () => void;
  /** After a report: the list again, and the battle it names opened. */
  done(max: MapMax | undefined): Promise<void>;
  /**
   * "← Pick a Power Spot" of a battle at a point refused to a member blocked from pins (R1-4):
   * back to the Power Spots to pick one (the Report button's step 2); none: the form only closes.
   */
  pickSpot?(): void;
}

/** A Power Spot as the map has it from `/api/powerspots`. */
export interface MapSpot {
  id: string;
  title: string;
  lat: number;
  lon: number;
}

/** The name of a report's place at a point of the map: what `/max` calls a pin. */
export const UNLISTED_SPOT = 'Unlisted power spot';

/** What the page says when the pick lists cannot be loaded. */
const NO_OPTIONS = 'The bosses could not be loaded. Try again in a moment.';

/** What the page says of a point picked while another form is open. */
const FORM_OPEN = 'Close the form that is open first.';

export function maxUi(deps: MaxUiDeps) {
  const { guild, hold } = deps;
  const options = (): Promise<MaxOptionsView> =>
    getJson<MaxOptionsView>(`/s/${guild}/api/max-options`);

  const send = async (form: HTMLElement, body: Record<string, unknown>, check?: FormCheck) => {
    const buttons = form.querySelectorAll('button');
    for (const each of buttons) each.disabled = true;
    const sent = await sendMaxForm(deps.csrf.get(), {
      post: async (token) => {
        const reply = await fetch(`/s/${guild}/api/maxes`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
          body: JSON.stringify(body),
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
    // The check again (plan 8M-22), the answer kept on the line.
    check?.run(true);
    return sent;
  };

  /** What the form holds, its ending-soon choice the radio checked. */
  const valuesOf = (form: HTMLElement): MaxValues => {
    const fields = fieldsOf(form);
    const soon = form.querySelector<HTMLInputElement>('input[name="soon"]:checked');
    return {
      boss: fields.boss ?? '',
      typed: fields.typed ?? '',
      tier: fields.tier ?? '',
      end: fields.end ?? '',
      region: fields.region ?? '',
      soon: soon?.value ?? '',
    };
  };

  /**
   * Draws the form in the side pane once the lists came, while it still holds; `finish` closes it
   * (and lets the hold go): `back` to where the member was, or `done`.
   */
  const openForm = async (
    home: FormHome,
    where: MaxWhere,
    name: string | undefined,
    finish: (how: 'back' | 'done') => void,
    /** The Report button's step 3 (R1-3): the form's first field takes the focus. */
    focusFirst = false,
    /** Opened by a tap in step 2: "← Another Power Spot" (`addPickAgain`). */
    again?: ReportKindId,
  ): Promise<void> => {
    let lists: MaxOptionsView;
    try {
      lists = await options();
    } catch {
      say(NO_OPTIONS);
      if (home.holds()) finish('back');
      return;
    }
    if (!home.holds()) return;
    const box = home.element();
    let state: MaxFormState = {
      filled: {},
      regions: regionsAt(spawnPoint(where.lat, where.lon), deps.regions),
    };
    /**
     * Draws the form anew, the field named taking the focus (`fieldToFocus`); after an answer
     * (`answer`, review B4) the control that had it, found again, else `answerFocus`'s.
     */
    const draw = (focus?: MaxField | 'answer'): void => {
      const active = document.activeElement;
      const had = active instanceof HTMLElement && box.contains(active) ? active : undefined;
      const form = renderNode(maxForm(name, lists, state, readerZone()), document);
      addPickAgain(form, again);
      const boss = form.querySelector<HTMLSelectElement>('select[name="boss"]');
      // A boss on no list is typed, with its tier: those rows only for it.
      boss?.addEventListener('change', () => {
        for (const row of form.querySelectorAll<HTMLElement>('[data-typed]')) {
          row.hidden = boss.value !== ANOTHER_BOSS;
        }
      });
      // Report off until a boss is picked, and at a pin refused (plan 8M-22).
      const check = liveCheck(form, () => maxMissing(valuesOf(form), state));
      formKeys(form);
      form.addEventListener('click', (event) => {
        clicked(form, event, check);
      });
      home.draw(form);
      if (focus === 'answer') {
        // The question asked takes it on its checked choice, which is read with its words.
        // Not after a pin refused (review B4b): the control that had it, Report, is off.
        const again =
          state.soon === undefined && state.pinRefused !== true && had
            ? sameControl(form, had)
            : null;
        (again ?? form.querySelector<HTMLElement>(answerFocus(state)))?.focus();
      } else if (focus !== undefined) {
        form.querySelector<HTMLElement>(fieldToFocus(focus, state.filled))?.focus();
      }
    };
    const said = (text: string): void => {
      const shown = box.firstElementChild;
      if (shown instanceof HTMLElement) sayUnder(shown, text);
      else say(text);
    };
    const clicked = (form: HTMLElement, event: Event, check: FormCheck): void => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        finish('back');
        return;
      }
      // A member blocked from pins (R1-4): back to the Power Spots, the form closed.
      if (target.dataset.pickSpot !== undefined) {
        finish('done');
        deps.pickSpot?.();
        return;
      }
      if (target.dataset.submit !== 'max' || isOff(target)) return;
      const values = valuesOf(form);
      void submitMax(where, values, lists, state, {
        send: (body) => send(form, body, check),
        options,
        holds: () => home.holds(),
      }).then(async (after) => {
        switch (after.kind) {
          case 'missing':
            sayUnder(form, after.text);
            return;
          case 'gone':
            // A form gone with its popup meanwhile: the words, and the list again.
            say(after.text);
            await deps.done(undefined);
            return;
          case 'close':
            finish('done');
            say(after.text);
            await deps.done(after.max);
            return;
          case 'draw':
            if (!home.holds()) return;
            lists = after.lists;
            state = after.state;
            draw(after.focus ?? 'answer');
            // The ending-soon question is its words over its choices: not said again under them.
            if (state.soon === undefined) said(after.text);
        }
      });
    };
    draw(focusFirst ? 'boss' : undefined);
  };

  /**
   * A click on "Report max battle here" (`maxBox`), or the Report button's step 3 at a Power Spot
   * (`control` the Report button): the form in the side pane, the spot's popup closed.
   */
  const maxClicked = (
    control: HTMLElement | null,
    spot: MapSpot,
    focusFirst = false,
    again?: ReportKindId,
  ): void => {
    const home = formHome(deps.frame, { control, place: () => spot.title });
    if (!home.open()) return;
    void openForm(
      home,
      { spot: spot.id, name: spot.title, lat: spot.lat, lon: spot.lon },
      undefined,
      (how) => {
        home.close(how);
      },
      focusFirst,
      again,
    );
  };

  return {
    /** "Report max battle here" for a Power Spot's popup; a click opens the form in its place. */
    maxControl(spot: MapSpot): HTMLElement {
      const box = renderNode(maxBox(spot.id), document);
      const button = box.querySelector('button');
      button?.addEventListener('click', () => {
        maxClicked(button, spot);
      });
      return box;
    },

    /** A click on "Report max battle here" found in a spot's popup. */
    maxClicked,

    /**
     * A point of the map picked for a max battle (the Report button's step 2): the form of an
     * unlisted power spot in the side pane, step 2's pin at the point while it is open (plan
     * 8M-22, Matt's ruling 3), `where` read once here; the server names the point (the nearest
     * Power Spot within 50 meters, else a pin), as `/max` takes a maps link. Cancel gives the focus
     * to `control` (the Report button).
     */
    maxAt(
      point: { lat: number; lon: number },
      focusFirst = false,
      control?: HTMLElement | null,
    ): void {
      if (hold.editing) {
        say(FORM_OPEN);
        return;
      }
      const at = spawnPoint(point.lat, point.lon);
      const home = formHome(deps.frame, { control });
      if (!home.open()) return;
      const unpin = deps.pinAt(at);
      void openForm(
        home,
        at,
        UNLISTED_SPOT,
        (how) => {
          unpin();
          home.close(how);
        },
        focusFirst,
      );
    },
  };
}

export type MaxUi = ReturnType<typeof maxUi>;
