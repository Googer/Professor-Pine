import { formKeys } from './form-keys.js';
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
import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
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
  hold: Pick<FormHold<unknown>, 'editing' | 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
  /** Opens a popup of its own at the point with this content; `close` closes it. */
  popupAt(point: { lat: number; lon: number }, content: HTMLElement): { close(): void };
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

  const send = async (form: HTMLElement, body: Record<string, unknown>) => {
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
   * Draws the form into `box` once the lists came, when its claim still holds and the box is
   * still in the page; `finish` closes it (and lets the hold go).
   */
  const openForm = async (
    box: HTMLElement,
    where: MaxWhere,
    name: string | undefined,
    claim: FormClaim,
    finish: () => void,
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
      if (hold.holds(claim)) finish();
      return;
    }
    if (!hold.ready(claim, box.isConnected)) return;
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
        hold.fit();
      });
      formKeys(form);
      form.addEventListener('click', (event) => {
        clicked(form, event);
      });
      box.replaceChildren(form);
      hold.fit();
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
    const clicked = (form: HTMLElement, event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        finish();
        return;
      }
      // A member blocked from pins (R1-4): back to the Power Spots, the form closed.
      if (target.dataset.pickSpot !== undefined) {
        finish();
        deps.pickSpot?.();
        return;
      }
      if (target.dataset.submit !== 'max') return;
      const values = valuesOf(form);
      void submitMax(where, values, lists, state, {
        send: (body) => send(form, body),
        options,
        holds: () => hold.holds(claim),
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
            finish();
            say(after.text);
            await deps.done(after.max);
            return;
          case 'draw':
            if (!hold.holds(claim)) return;
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

  /** A click on "Report max battle here" (`maxBox`): the form in place of the button. */
  const maxClicked = (
    button: HTMLButtonElement,
    spot: MapSpot,
    focusFirst = false,
    again?: ReportKindId,
  ): void => {
    const box = button.parentElement;
    if (!box) return;
    const claim = hold.take(formPlace(box));
    if (!claim) return;
    void openForm(
      box,
      { spot: spot.id, name: spot.title, lat: spot.lat, lon: spot.lon },
      undefined,
      claim,
      () => {
        box.replaceChildren(button);
        hold.release(claim);
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
     * unlisted power spot in a popup of its own there; the server names the point (the nearest
     * Power Spot within 50 meters, else a pin), as `/max` takes a maps link.
     */
    maxAt(point: { lat: number; lon: number }, focusFirst = false): void {
      if (hold.editing) {
        say(FORM_OPEN);
        return;
      }
      const at = spawnPoint(point.lat, point.lon);
      const box = document.createElement('div');
      box.className = 'max-box';
      box.textContent = 'Loading the bosses…';
      // Opened first: opening it closes any other popup, which must not take the new claim.
      const popup = deps.popupAt(at, box);
      const claim = hold.take(true);
      if (!claim) {
        popup.close();
        return;
      }
      void openForm(
        box,
        at,
        UNLISTED_SPOT,
        claim,
        () => {
          hold.release(claim);
          popup.close();
        },
        focusFirst,
      );
    },
  };
}

export type MaxUi = ReturnType<typeof maxUi>;
