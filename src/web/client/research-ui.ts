import { formKeys } from './form-keys.js';
import { formHome, type FormHome } from './form-home.js';
import {
  stopsAtMost,
  type MapResearch,
  type ResearchOptionsView,
} from '../../domain/web/stop-report-data.js';
import { getJson, say } from './common.js';
import type { Me } from './notice.js';
import { renderNode } from './popup.js';
import type { FormHold } from './raid-forms.js';
import { sayUnder } from './raid-ui.js';
import {
  formSubject,
  heldStops,
  pickedFrom,
  researchForm,
  submitResearch,
  taskChanged,
  taskList,
  type PickedStop,
  type ResearchAfter,
  type ResearchBody,
  type ResearchFormState,
  type ResearchMode,
} from './research-forms.js';
import type { DistanceUnits } from './distance.js';
import type { MapSpot } from './max-ui.js';
import {
  nearestLines,
  TAP_A_STOP,
  type NearLine,
  type Nearest,
  type NearPlace,
} from './report-flow.js';
import type { LatLon } from './view.js';
import { sendStop } from './stop-forms.js';
import { newTrainButton } from './train-forms.js';

/*
 * The field research form of the live map in the page (plan 8M-9B, goals 7 and 8; B8): from a
 * stop's popup in the place of its control (`formHome`), else in the side pane's box (docked under
 * the map on a phone), and there while stops are added, an aside claim of the hold, the list drawn
 * under it. "Report research here" in a stop's popup
 * and the Report button's step 3 at a stop open it with the stop; "Same task at more stops…" on a
 * research report opens it with that report's task, picking stops at once. "Add stops…" picks
 * stops on the map: the stops drawn whatever their layer and ringed (`adding`), a tap on one (its
 * dot or its reports' marker) adding it, a tap on open map saying "Tap a PokéStop.". After a
 * report, the reports asked for at once and the first stop's popup opened after the poll (B15).
 */
export interface ResearchUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release' | 'fit'>;
  /** The side pane's box, where the form is drawn without a place, or while it adds stops. */
  tools: HTMLElement;
  /** Closes the popup or card that is open, as the form goes to the side pane. */
  closePopup(): void;
  /** After a report: the reports asked for at once, then the stop's popup opened. */
  done(stopKey: string | undefined): Promise<void>;
  /** The stops to pick drawn or taken away (`adding`), the map's look with them. */
  picking(on: boolean): void;
  /**
   * The map zoomed in to the zoom the PokéStops are drawn from, as the Report button's step 2
   * flies (branch review W6): to `at`, the form's last stop (re-review X2), else where it is;
   * `landed` once it is there.
   */
  zoomIn(at: LatLon | undefined, landed: () => void): void;
  /** Tells `listener` each answer of the PokéStops of the view, or why none came. */
  onStops(listener: (stops: readonly MapSpot[] | 'failed' | 'zoom') => void): void;
  /**
   * Where the nearest stops' distances are from while the form has no stop, as step 2's: your
   * location, else the middle.
   */
  origin(): LatLon;
  units: DistanceUnits;
  /**
   * The research reports the map has now (plan 8M-11A, S18): the stops that hold the form's task
   * already are not offered (`heldStops`).
   */
  research(): readonly MapResearch[];
}

/** What the page says of a form while another one is open. */
const FORM_OPEN = 'Close the form that is open first.';

/** What the page says when the task list cannot be loaded. */
const NO_OPTIONS = 'The task list could not be loaded. Try again in a moment.';

export function researchUi(deps: ResearchUiDeps) {
  const { guild, hold } = deps;
  let open:
    | {
        home: FormHome;
        stops: PickedStop[];
        state: ResearchFormState;
        mode: ResearchMode;
        lists: ResearchOptionsView | undefined;
        /**
         * While it adds stops (branch review W6): the PokéStops of the view as the places layer
         * last told them, or why none came; and whether the map is still on its way in.
         */
        near: readonly NearPlace[] | Exclude<Nearest, readonly NearLine[]>;
        flying: boolean;
      }
    | undefined;

  /**
   * Where the form's last stop is (re-review X2, Matt 2026-10-27): the stop added last, "Same task
   * at more stops…"'s report's own until another is added; none without a stop.
   */
  const lastStop = (): LatLon | undefined => {
    if (!open) return undefined;
    const last = open.stops.at(-1);
    if (last) return last.at;
    if (open.mode.kind !== 'more') return undefined;
    const { lat, lon } = open.mode.report.stop;
    return { lat, lon };
  };

  /**
   * The nearest stops of the view not in the report yet (nor "Same task at more stops…"'s report's
   * own), or why there are none: from the form's last stop, measured anew as each is added
   * (re-review X2), else as step 2 measures.
   */
  const nearestNow = (): Nearest | undefined => {
    if (open?.state.adding !== true) return undefined;
    const { near, stops, mode } = open;
    if (typeof near === 'string') return near;
    const own = mode.kind === 'more' ? mode.report.stop.key : undefined;
    // Nor a stop that holds the task already, by Discord's rule (plan 8M-11A, S18).
    const held = heldStops(deps.research(), formSubject(open.state, mode, open.lists), Date.now());
    const left = near.filter(
      (place) =>
        place.id !== own && !held.has(place.id) && !stops.some((stop) => stop.key === place.id),
    );
    return nearestLines(left, lastStop() ?? deps.origin(), deps.units);
  };

  deps.onStops((answer) => {
    if (open?.state.adding !== true) return;
    if (typeof answer === 'string') {
      // On its way the map passes zooms the PokéStops are not drawn from (as step 2's, R2-4).
      if (answer === 'zoom' && open.flying) return;
      open.near = answer;
    } else {
      open.near = answer.map(({ id, title, lat, lon }) => ({ id, name: title, lat, lon }));
    }
    draw();
  });

  const options = (): Promise<ResearchOptionsView> =>
    getJson<ResearchOptionsView>(`/s/${guild}/api/research-options`);

  const send = async (form: HTMLElement, body: ResearchBody) => {
    // Off until the answer, also in a form drawn anew meanwhile (review F3: `sending`).
    const sending = open;
    if (sending) sending.state.sending = true;
    const buttons = form.querySelectorAll('button');
    for (const each of buttons) each.disabled = true;
    const sent = await sendStop(deps.csrf.get(), {
      post: async (token) => {
        const reply = await fetch(`/s/${guild}/api/research`, {
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
    if (sending) delete sending.state.sending;
    for (const each of buttons) each.disabled = false;
    return sent;
  };

  /** What the form is drawn in: a stop's popup, or the side pane's box. */
  const formIsIn = (): HTMLElement => open?.home.element() ?? deps.tools;

  /** The form drawn anew from what it holds; the focus on `focus`, or kept on its control. */
  const draw = (focus?: string): void => {
    if (!open) return;
    const active = document.activeElement;
    const kept =
      active instanceof HTMLInputElement && formIsIn().contains(active)
        ? { name: active.name, at: active.selectionStart }
        : undefined;
    // A nearest stop's button keeps the focus as the list is drawn anew (the next one where it
    // went into the report).
    const near =
      active instanceof HTMLButtonElement && formIsIn().contains(active)
        ? active.dataset.reportNear
        : undefined;
    const nearest = nearestNow();
    if (nearest === undefined) delete open.state.nearest;
    else open.state.nearest = nearest;
    const form = renderNode(researchForm(open.lists, open.stops, open.state, open.mode), document);
    formKeys(form);
    form.addEventListener('click', (event) => {
      clicked(form, event);
    });
    form.addEventListener('input', (event) => {
      typed(event.target, event.isComposing);
    });
    // The fit a word held back while it was composed.
    form.addEventListener('compositionend', fitToForm);
    form.addEventListener('change', (event) => {
      const target = event.target;
      if (open && target instanceof HTMLInputElement && target.name === 'version') {
        open.state.version = target.value;
      }
    });
    open.home.draw(form);
    if (focus !== undefined) form.querySelector<HTMLElement>(focus)?.focus();
    else if (near !== undefined) {
      (
        form.querySelector<HTMLElement>(`button[data-report-near="${CSS.escape(near)}"]`) ??
        form.querySelector<HTMLElement>('button[data-report-near], button[data-add-stops]')
      )?.focus();
    } else if (kept !== undefined) {
      const again = form.querySelector<HTMLInputElement>(`input[name="${kept.name}"]`);
      again?.focus();
      if (again && kept.at !== null) again.setSelectionRange(kept.at, kept.at);
    }
  };

  /** A popup that holds the form fits it; none is fitted for a form in the side pane. */
  const fitToForm = (): void => {
    if (open && !open.home.inPane()) hold.fit();
  };

  /**
   * What is typed: the search (the task list under it drawn anew, the field itself kept: review
   * F3, an IME's word or a phone's keyboard is not cut, so a popup is fitted to the list only
   * between words), the typed task and its reward (kept).
   */
  const typed = (target: EventTarget | null, composing: boolean): void => {
    if (!open || !(target instanceof HTMLInputElement)) return;
    if (target.name === 'query') {
      open.state.query = target.value;
      const list = formIsIn().querySelector('.task-list');
      if (list && open.lists) {
        const fresh = renderNode(taskList(open.lists, open.state), document);
        list.replaceChildren(...fresh.childNodes);
        if (!composing) fitToForm();
      }
    } else if (target.name === 'typedTask' && open.state.typing) {
      open.state.typing.task = target.value;
    } else if (target.name === 'typedReward' && open.state.typing) {
      open.state.typing.reward = target.value;
    }
  };

  const setAdding = (on: boolean): void => {
    if (!open || (open.state.adding === true) === on) return;
    // Picking stops needs the map: a form in a popup goes to the side pane, its state with it.
    if (on && !open.home.toPane()) {
      say(FORM_OPEN);
      return;
    }
    open.state.adding = on;
    deps.picking(on);
    if (!on) return;
    // As the Report button's step 2 (branch review W6): the map in to where the PokéStops are
    // drawn, at the form's last stop (re-review X2), whose answer lists the nearest (`onStops`).
    const now = open;
    now.near = 'loading';
    now.flying = true;
    deps.zoomIn(lastStop(), () => {
      now.flying = false;
    });
  };

  /**
   * A stop added while stops are added (a tap on the map, or its line of the nearest); more than
   * the lists' `maxStops` is said under the form (branch review W4): false, nothing to draw.
   */
  const addStop = (stop: PickedStop): boolean => {
    if (!open) return false;
    if (open.stops.some((one) => one.key === stop.key)) return true;
    // How many stops a report names is the lists' (`maxStops`, branch review W4); before they
    // came (or where they cannot be had: "Same task at more stops…" needs nothing else of them)
    // the server's body refuses more than `/research` takes.
    const most = open.lists?.maxStops;
    if (most !== undefined && open.stops.length >= most) {
      const form = formIsIn().firstElementChild;
      if (form instanceof HTMLElement) {
        sayUnder(form, stopsAtMost(most));
      }
      return false;
    }
    open.stops = [...open.stops, stop];
    if (most !== undefined && open.stops.length >= most) setAdding(false);
    return true;
  };

  const close = (): void => {
    const was = open;
    if (!was) return;
    setAdding(false);
    open = undefined;
    was.home.close();
  };

  const after = async (done: ResearchAfter): Promise<void> => {
    switch (done.kind) {
      case 'missing': {
        const form = formIsIn().firstElementChild;
        if (form instanceof HTMLElement) sayUnder(form, done.text);
        return;
      }
      case 'gone':
        say(done.text);
        await deps.done(undefined);
        return;
      case 'close': {
        const first = open?.stops[0]?.key;
        close();
        say(done.text);
        await deps.done(first);
        return;
      }
      case 'draw': {
        if (!open) return;
        open.lists = done.options;
        // The map picks stops as the state drawn says (a refusal ends "Add stops…").
        setAdding(done.state.adding === true);
        open.state = done.state;
        if (done.mode) open.mode = done.mode;
        // The question takes the focus on its first box, read with its words; else Report.
        draw(
          open.state.asks === undefined
            ? 'button[data-submit]'
            : 'input[name="replacing"], button[data-submit]',
        );
        const form = formIsIn().firstElementChild;
        if (form instanceof HTMLElement && open.state.asks === undefined) {
          sayUnder(form, done.text);
        }
      }
    }
  };

  const clicked = (form: HTMLElement, event: Event): void => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(target instanceof HTMLButtonElement) || !open) return;
    const { cancel, task, typing, addStops, removeStop, submit, reportNear, changeTask } =
      target.dataset;
    if (reportNear !== undefined) {
      // A line of the nearest stops (branch review W6): added as a tap on it adds it; the focus
      // on the next line, for the keyboard.
      const near = typeof open.near === 'string' ? undefined : open.near;
      const place = near?.find((one) => one.id === reportNear);
      if (
        place &&
        addStop({ key: place.id, name: place.name, at: { lat: place.lat, lon: place.lon } })
      ) {
        draw('button[data-report-near], button[data-add-stops], button[data-submit]');
      }
    } else if (cancel !== undefined) {
      // Cancel sends nothing, the contradiction question's too (R7).
      close();
    } else if (changeTask !== undefined) {
      // The task list back, the task kept as the selection (plan 8M-11A, S26).
      const changed = taskChanged(open.state, open.mode, open.lists);
      open.state = changed.state;
      open.mode = changed.mode;
      draw(
        open.state.task === undefined
          ? 'input[name="query"]'
          : `button[data-task="${CSS.escape(open.state.task)}"]`,
      );
    } else if (task !== undefined) {
      open.state.task = task;
      delete open.state.version;
      draw(`button[data-task="${CSS.escape(task)}"]`);
    } else if (typing !== undefined) {
      if (typing === 'start') open.state.typing = { task: '', reward: '' };
      else delete open.state.typing;
      draw(typing === 'start' ? 'input[name="typedTask"]' : 'input[name="query"]');
    } else if (addStops !== undefined) {
      setAdding(addStops === 'start');
      draw('button[data-add-stops]');
    } else if (removeStop !== undefined) {
      open.stops = open.stops.filter((stop) => stop.key !== removeStop);
      draw('button[data-add-stops], button[data-submit]');
    } else if (submit === 'research') {
      const replacing =
        open.state.asks === undefined
          ? undefined
          : [...form.querySelectorAll<HTMLInputElement>('input[name="replacing"]:checked')].map(
              (box) => Number(box.value),
            );
      const now = open;
      void submitResearch(
        now.lists,
        now.stops,
        now.state,
        now.mode,
        {
          send: (body) => send(form, body),
          options,
          holds: () => open === now && now.home.holds(),
        },
        replacing,
      ).then(after);
    }
  };

  /**
   * Opens the form, at a stop in its popup in the place of the control (`control`), else in the
   * side pane: its claim, and the task list asked for.
   */
  const openForm = (
    stops: PickedStop[],
    mode: ResearchMode,
    focus: string | undefined,
    control?: HTMLButtonElement,
  ): void => {
    const box = control?.parentElement;
    const home = formHome(
      {
        tools: deps.tools,
        hold,
        closePopup: () => {
          deps.closePopup();
        },
        idle: () => {
          deps.tools.replaceChildren(renderNode(newTrainButton(), document));
        },
      },
      box && control ? { box, control } : undefined,
    );
    if (!home.open()) {
      say(FORM_OPEN);
      return;
    }
    if (home.inPane()) deps.closePopup();
    const state: ResearchFormState = { query: '' };
    open = { home, stops, state, mode, lists: undefined, near: 'loading', flying: false };
    if (mode.kind === 'more') setAdding(true);
    draw(focus ?? '[data-form-heading]');
    const now = open;
    void options().then(
      (lists) => {
        if (open !== now) return;
        now.lists = lists;
        // Stops tapped before the lists came may fill the report (`maxStops`, branch review W4),
        // or more than fill it: said under the form, before Report is refused (re-review X3).
        if (now.state.adding === true && now.stops.length >= lists.maxStops) setAdding(false);
        draw(mode.kind === 'new' && focus !== undefined ? 'input[name="query"]' : undefined);
        const form = formIsIn().firstElementChild;
        if (now.stops.length > lists.maxStops && form instanceof HTMLElement) {
          sayUnder(form, stopsAtMost(lists.maxStops));
        }
      },
      () => {
        if (open !== now) return;
        const form = formIsIn().firstElementChild;
        if (form instanceof HTMLElement) sayUnder(form, NO_OPTIONS);
        else say(NO_OPTIONS);
      },
    );
  };

  return {
    /**
     * "Report research here" in a stop's popup: the form there with the stop; from the Report
     * button's step 3 (`focus`) its search focused.
     */
    researchClicked(button: HTMLButtonElement, focus?: string): void {
      const stop = pickedFrom(button.dataset);
      if (stop) openForm([stop], { kind: 'new' }, focus, button);
    },

    /** The Report button's step 3 at a stop the map offers no popup's button for. */
    researchAt(stop: PickedStop): void {
      openForm([stop], { kind: 'new' }, 'input[name="query"]');
    },

    /** "Same task at more stops…" on a research report: its task, stops picked at once. */
    sameTaskClicked(report: MapResearch): void {
      openForm([], { kind: 'more', report }, undefined);
    },

    /** Whether "Add stops…" picks stops now: they are drawn whatever their layer, and ringed. */
    adding(): boolean {
      return open?.state.adding === true;
    },

    /** A PokéStop tapped while stops are added: added (true: no popup), else nothing. */
    stopClicked(stop: MapSpot): boolean {
      if (!open || open.state.adding !== true) return false;
      if (addStop({ key: stop.id, name: stop.title, at: { lat: stop.lat, lon: stop.lon } })) draw();
      return true;
    },

    /** A point of the map tapped while stops are added: no pin, "Tap a PokéStop." (true). */
    mapClicked(): boolean {
      if (open?.state.adding !== true) return false;
      const form = formIsIn().firstElementChild;
      if (form instanceof HTMLElement) sayUnder(form, TAP_A_STOP);
      return true;
    },

    /** Whether the side pane's box holds the form: the list keeps it. */
    inTools(): boolean {
      return open?.home.inPane() === true;
    },
  };
}

export type ResearchUi = ReturnType<typeof researchUi>;
