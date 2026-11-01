import { formKeys } from './form-keys.js';
import type { RocketOptionsView } from '../../domain/web/stop-report-data.js';
import { getJson, say } from './common.js';
import type { Me } from './notice.js';
import { renderNode } from './popup.js';
import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
import { sayUnder } from './raid-ui.js';
import {
  rocketForm,
  submitRocket,
  type RocketAfter,
  type RocketFormState,
  type RocketValues,
} from './rocket-forms.js';
import { sendStop } from './stop-forms.js';

/*
 * The Team GO Rocket form of the live map in the page (plan 8M-9B, goal 9; B8): "Report Rocket
 * here" in a stop's popup or card (and the Report button's step 3 at a stop) opens it in place of
 * its button, held as the other forms (`FormHold`); its lists from `/api/rocket-options` (the
 * browser revalidates them by their ETag). After a report or "Already reported", the form closes,
 * its words are said, and the reports are asked for at once, the stop's popup opened after the
 * poll (`done`, B15).
 */
export interface RocketUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  hold: Pick<FormHold<unknown>, 'editing' | 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
  /** After a report: the reports asked for at once, then the stop's popup opened. */
  done(stopKey: string | undefined): Promise<void>;
}

/** What the page says when the pick list cannot be loaded. */
const NO_OPTIONS = 'Team GO Rocket could not be loaded. Try again in a moment.';

export function rocketUi(deps: RocketUiDeps) {
  const { guild, hold } = deps;
  const options = (): Promise<RocketOptionsView> =>
    getJson<RocketOptionsView>(`/s/${guild}/api/rocket-options`);

  /** What the form holds: who, and the lineup checked. */
  const valuesOf = (form: HTMLElement): Partial<RocketValues> => {
    const who = form.querySelector<HTMLSelectElement>('select[name="who"]')?.value;
    const lineup = form.querySelector<HTMLInputElement>('input[name="lineup"]:checked')?.value;
    return { ...(who === undefined ? {} : { who }), ...(lineup === undefined ? {} : { lineup }) };
  };

  /**
   * Sends the report, every control of the form off until the answer (branch review W3), also in
   * a form drawn anew meanwhile (`sending` of the form's state, `state`).
   */
  const send = async (form: HTMLElement, state: RocketFormState, body: Record<string, unknown>) => {
    state.sending = true;
    const controls = form.querySelectorAll<
      HTMLButtonElement | HTMLSelectElement | HTMLInputElement
    >('button, select, input');
    for (const each of controls) each.disabled = true;
    const sent = await sendStop(deps.csrf.get(), {
      post: async (token) => {
        const reply = await fetch(`/s/${guild}/api/rocket`, {
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
    delete state.sending;
    for (const each of controls) each.disabled = false;
    return sent;
  };

  /** Draws the form into `box` once the lists came, while its claim holds and the box is there. */
  const openForm = async (
    box: HTMLElement,
    stop: string,
    claim: FormClaim,
    finish: () => void,
    focusFirst: boolean,
  ): Promise<void> => {
    let lists: RocketOptionsView;
    try {
      lists = await options();
    } catch {
      say(NO_OPTIONS);
      if (hold.holds(claim)) finish();
      return;
    }
    if (!hold.ready(claim, box.isConnected)) return;
    let state: RocketFormState = { filled: {} };
    const draw = (focus?: string): void => {
      const form = renderNode(rocketForm(lists, state), document);
      form.querySelector('select[name="who"]')?.addEventListener('change', () => {
        // A report on its way keeps every control off (branch review W3).
        state = { filled: valuesOf(form), ...(state.sending === true ? { sending: true } : {}) };
        draw('select[name="who"]');
      });
      formKeys(form);
      form.addEventListener('click', (event) => {
        clicked(form, event);
      });
      box.replaceChildren(form);
      hold.fit();
      if (focus !== undefined) form.querySelector<HTMLElement>(focus)?.focus();
    };
    const after = async (done: RocketAfter): Promise<void> => {
      switch (done.kind) {
        case 'missing': {
          const form = box.firstElementChild;
          if (form instanceof HTMLElement) sayUnder(form, done.text);
          return;
        }
        case 'gone':
          say(done.text);
          await deps.done(undefined);
          return;
        case 'close':
          finish();
          say(done.text);
          await deps.done(stop);
          return;
        case 'draw': {
          if (!hold.holds(claim)) return;
          lists = done.options;
          state = done.state;
          // The hideout question takes the focus on Replace, read with its words; else Report.
          draw(state.replacing === undefined ? 'button[data-submit]' : 'button[data-replace]');
          const form = box.firstElementChild;
          // The question is its words over its buttons: not said again under them.
          if (form instanceof HTMLElement && state.replacing === undefined) {
            sayUnder(form, done.text);
          }
        }
      }
    };
    const clicked = (form: HTMLElement, event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        // Cancel sends nothing, the hideout question's too.
        finish();
        return;
      }
      const submitDeps = {
        send: (body: Record<string, unknown>) => send(form, state, body),
        options,
        holds: () => hold.holds(claim),
      };
      if (target.dataset.submit === 'rocket') {
        void submitRocket(stop, lists, valuesOf(form), submitDeps).then(after);
      } else if (target.dataset.replace !== undefined) {
        const replacing = Number(target.dataset.replace);
        void submitRocket(stop, lists, state.filled, submitDeps, replacing).then(after);
      }
    };
    draw(focusFirst ? 'select[name="who"]' : undefined);
  };

  /** A click on "Report Rocket here" (`rocketBox`): the form in place of the button. */
  const rocketClicked = (button: HTMLButtonElement, focusFirst = false): void => {
    const box = button.parentElement;
    const stop = button.dataset.reportRocket;
    if (!box || stop === undefined) return;
    const claim = hold.take(formPlace(box));
    if (!claim) return;
    box.textContent = 'Loading Team GO Rocket…';
    hold.fit();
    void openForm(
      box,
      stop,
      claim,
      () => {
        box.replaceChildren(button);
        hold.release(claim);
      },
      focusFirst,
    );
  };

  return { rocketClicked };
}

export type RocketUi = ReturnType<typeof rocketUi>;
