import { formKeys } from './form-keys.js';
import { formHome } from './form-home.js';
import type { PressAnswer } from './press-answer.js';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { MapTrain } from '../../domain/web/party-data.js';
import {
  CONDUCTOR_CHANGES,
  ROUTE_EDITS,
  type ConductorChange,
  type RouteEdit,
  type SavedRoutesView,
} from '../../domain/web/train-data.js';
import { getJson, say } from './common.js';
import type { Me } from './notice.js';
import { renderNode, type MapGym } from './popup.js';
import { readerZone } from './post-time.js';
import type { FormClaim, FormHold } from './raid-forms.js';
import { fieldsOf, sayInForm, sayUnder } from './raid-ui.js';
import {
  conductorBody,
  newTrainButton,
  routeEditBody,
  routeEditor,
  RouteEdits,
  routeModeEnds,
  sendTrainForm,
  spotsHint,
  StopDrag,
  edgeScroll,
  startBody,
  startForm,
  type FirstStop,
  type RouteEditorFilled,
  type RouteEditValues,
  type TrainAnswered,
  type TrainBody,
} from './train-forms.js';

/**
 * The trains of the live map in the page (plan 8M-5, spec 3.7): "New train" in the side panel
 * opens the start form there; "Edit route" in a train's popup puts the map in route mode for it
 * (the route editor in the side panel, the stops numbered on the map, a gym clicked added as the
 * next stop, one edit at a time); "Move…" opens the moves in the popup, which stay
 * open after a move as the post's does; the conductor buttons press at once. One form or mode at
 * a time (`FormHold`, shared with the raid and spawn forms); the start form and route mode are
 * forms of the trains' box, under which the list is drawn (`aside`). After a success the map
 * refreshes (`done`).
 */
export interface TrainUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  /** The server's regions with their names, as `/api/geo` gives them. */
  regions: GeoView['regions'];
  /** The server's zone, which reads a typed start (review N4); left out: not named. */
  zone?: () => string;
  /** The gyms by id, as `/api/geo` gives them: the stops' names. */
  gyms: ReadonlyMap<number, MapGym>;
  /** The form that is open, shared with the raid and spawn forms. */
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
  /** Where the start form and the route editor are drawn: a box of the side panel. */
  tools: HTMLElement;
  /** The train's stops numbered on the map in route mode, and none once it ends. */
  overlay: { show(train: MapTrain): void; clear(): void };
  /** Closes the popup that is open (route mode works in the side panel and on the map). */
  closePopup(): void;
  /** After something went through: the list again, and the train's popup opened when given. */
  done(train: MapTrain | undefined): Promise<void>;
  /** The list again, nothing opened: drawn once the form that holds lets go. */
  refresh(): Promise<void>;
  /**
   * The list as the page has it, drawn anew at once (without asking the server): as route mode
   * starts and ends, so that the routed train's own line leaves and comes back with it.
   */
  redrawn(): void;
  /**
   * An answer for a train's answer line under its post's buttons (plan 8M-11A, S9): the
   * conductor's buttons, presses of the post's member part.
   */
  answered(partyId: string, answer: PressAnswer, from: Element): void;
  /**
   * Whether the map shows Power Spots to tap (plan 8M-8C, R5: their layer on, zoomed in far
   * enough); left out: it does.
   */
  spotsShown?: () => boolean;
  /**
   * Route mode began (true) or ended (false): the gyms' and Power Spots' dots are Tab stops only
   * meanwhile (re-review N1, `RouteFocus`). Left out: nobody is told.
   */
  routeMode?: (on: boolean) => void;
  /**
   * A stop dragged in the route editor (plan 8M-11B, S24): its new legs on the map, from the stop
   * it would follow and to the one it would precede (`dropLegs`) as it would land at `to`, and
   * none once the drag ends, however it ends. Left out: the map shows nothing of it.
   */
  dragLine?: { show(train: MapTrain, from: number, to: number): void; clear(): void };
  /**
   * A stop's handle held (S25): the map's touch zoom and dragging off (`holdMap`); the function it
   * gives back, called when the drag ends however it ends, puts back those that were on. Left
   * out: the map is not held.
   */
  holdMap?: () => () => void;
}

/** What the page says of a form while another one is open. */
const FORM_OPEN = 'Close the form that is open first.';

function isRouteEdit(value: string | undefined): value is RouteEdit {
  return (ROUTE_EDITS as readonly (string | undefined)[]).includes(value);
}

function isConductorChange(value: string | undefined): value is ConductorChange {
  return (CONDUCTOR_CHANGES as readonly (string | undefined)[]).includes(value);
}

export function trainUi(deps: TrainUiDeps) {
  const { guild, hold } = deps;
  const gym = (id: number) => deps.gyms.get(id);

  /** Sends a body to an address of the trains with the page's token. */
  const send = async (
    url: string,
    body: Record<string, unknown>,
  ): Promise<{ text: string } & TrainAnswered> => {
    const sent = await sendTrainForm(deps.csrf.get(), {
      post: async (token) => {
        const reply = await fetch(url, {
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
    return sent;
  };

  /** Sends a form's body with its buttons off meanwhile; what is missing is said under it. */
  const sendForm = async (form: HTMLElement, url: string, body: TrainBody) => {
    if ('text' in body) {
      sayUnder(form, body.text);
      return undefined;
    }
    const buttons = form.querySelectorAll('button');
    for (const each of buttons) each.disabled = true;
    const sent = await send(url, body.body);
    for (const each of buttons) each.disabled = false;
    return sent;
  };

  const trainUrl = (train: MapTrain, path: string) =>
    `/s/${guild}/api/trains/${encodeURIComponent(train.id)}/${path}`;

  /** The trains' box shows "New train" again. */
  const toolsIdle = (): void => {
    deps.tools.replaceChildren(renderNode(newTrainButton(), document));
  };

  /** The start form, while it is open. */
  let starting: FormClaim | undefined;

  /**
   * Route mode: the train being arranged, its claim, its saved routes once they came, and what
   * the member typed or picked in the editor, kept across its redraws.
   */
  let routing:
    | {
        claim: FormClaim;
        train: MapTrain;
        saved: SavedRoutesView | undefined;
        filled: RouteEditorFilled;
        /** What is said under the editor, until the next edit: a redraw says it again. */
        said?: string;
        /** What the train's making said ("Train here"): said with the answer of its first stop. */
        made?: string;
      }
    | undefined;

  /** The route editor's controls but Done, off while edits wait or are on their way. */
  const editorControls = (on: boolean): void => {
    for (const control of deps.tools.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      '.route-editor button:not([data-cancel]), .route-editor select',
    )) {
      control.disabled = !on;
    }
  };

  /**
   * The edits of route mode, one at a time (`RouteEdits`): a gym clicked meanwhile waits, its
   * body made from the train the answer before gave. An edit that begins ends a drag that is on
   * (a second finger tapping a gym), so its release queues no move against the route before
   * (branch review B1).
   */
  const edits = new RouteEdits({
    train: () => routing?.train,
    send: (edit, body) => sendEdit(edit, body),
    busy: (on) => {
      editorControls(!on);
      if (on) endDrag?.();
    },
  });

  /** A stop dragged in the route editor (plan 8M-8C, R6). */
  const drag = new StopDrag();
  /** Ends the drag that is on, what it marked and listens for with it; none without one. */
  let endDrag: (() => void) | undefined;

  /**
   * Dragging a stop by its handle in the stop list, with a mouse, a pen or a finger (pointer
   * events, the handle `touch-action: none` in `map.css`, the pointer captured by it): not while
   * edits wait or are on their way; the row it would land at marked as the pointer moves, the
   * list's pane scrolled while the pointer is near its top or bottom (`edgeScroll`, review C9);
   * a drop is one `/route move` with the route as it was when the drag began. Only the pointer
   * that began it is followed, and it ends without a move when that pointer is lost (the
   * browser's `pointercancel`, `lostpointercapture`), on Escape, and when the editor is drawn
   * anew (`drawRoute`; review C2). The keyboard's way is up, down and the position menu.
   */
  const dragsIn = (editor: HTMLElement): void => {
    const rows = (): HTMLElement[] => [...editor.querySelectorAll<HTMLElement>('li')];
    /** The dragged stop's legs on the map, drawn again only where it would land elsewhere. */
    let lineTo: ((to: number | undefined) => void) | undefined;
    let shownTo: number | undefined;
    const mark = (at: number | undefined): void => {
      rows().forEach((row, index) => {
        const others = row.className.split(' ').filter((name) => name !== 'drop-target');
        row.className = [...others, ...(index + 1 === at ? ['drop-target'] : [])].join(' ');
      });
      lineTo?.(at);
    };
    const boxes = () => rows().map((row) => row.getBoundingClientRect());
    /** The pane the stop list scrolls in (the side pane, docked under the map on a phone). */
    const pane = (): HTMLElement | null => deps.tools.closest<HTMLElement>('#parties');
    /** Where the pointer was last, and the frame that scrolls the pane, while one is asked. */
    let lastY = 0;
    let frame: number | undefined;
    const scrolling = (): void => {
      frame = undefined;
      const scroller = pane();
      if (!drag.active || !scroller) return;
      const step = edgeScroll(lastY, scroller.getBoundingClientRect());
      if (step === 0) return;
      scroller.scrollTop += step;
      mark(drag.over(lastY, boxes()));
      frame = requestAnimationFrame(scrolling);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') endDrag?.();
    };
    editor.addEventListener('pointerdown', (event) => {
      const handle =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('.drag-handle')
          : null;
      if (!handle || !routing || drag.active) return;
      const { train } = routing;
      const from = Number(handle.dataset.drag);
      if (!drag.begin(from, train.route, edits.busy, event.pointerId)) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      document.addEventListener('keydown', escape);
      // The map held while the handle is (S25), and the stop's legs drawn where it is (S24).
      const letGo = deps.holdMap?.();
      lineTo = (to) => {
        if (to === undefined || to === shownTo) return;
        shownTo = to;
        deps.dragLine?.show(train, from, to);
      };
      shownTo = undefined;
      lineTo(from);
      endDrag = () => {
        endDrag = undefined;
        drag.cancel();
        mark(undefined);
        document.removeEventListener('keydown', escape);
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
        lineTo = undefined;
        deps.dragLine?.clear();
        letGo?.();
      };
    });
    editor.addEventListener('pointermove', (event) => {
      if (!drag.follows(event.pointerId)) return;
      lastY = event.clientY;
      mark(drag.over(event.clientY, boxes()));
      const scroller = pane();
      if (frame === undefined && scroller && edgeScroll(lastY, scroller.getBoundingClientRect())) {
        frame = requestAnimationFrame(scrolling);
      }
    });
    editor.addEventListener('pointerup', (event) => {
      if (!drag.follows(event.pointerId)) return;
      drag.over(event.clientY, boxes());
      const dropped = drag.drop();
      endDrag?.();
      if (dropped === undefined) return;
      void edits.add('move', {
        from: String(dropped.from),
        to: String(dropped.to),
        drawn: dropped.drawn,
      });
    });
    for (const lost of ['pointercancel', 'lostpointercapture'] as const) {
      editor.addEventListener(lost, (event) => {
        if (drag.follows(event.pointerId)) endDrag?.();
      });
    }
  };

  /**
   * Draws the route editor and the numbered stops anew, from the train as it is now, with the
   * name typed and the saved route picked in the editor drawn before (`changed` overrides them).
   * A stop being dragged in the editor before is dropped nowhere (review C2).
   */
  const drawRoute = (changed: RouteEditorFilled = {}): void => {
    if (!routing) return;
    endDrag?.();
    const { train, saved } = routing;
    const before = deps.tools.firstElementChild;
    // What the editor before showed of them (not a field it did not have: no saved routes while
    // they load, no name without stops).
    const held =
      before instanceof HTMLElement &&
      before.dataset.form === 'route' &&
      before.dataset.party === train.id
        ? fieldsOf(before)
        : {};
    routing.filled = {
      ...routing.filled,
      ...(held.name === undefined ? {} : { name: held.name }),
      ...(held.route === undefined ? {} : { route: held.route }),
      ...changed,
    };
    const editor = renderNode(
      routeEditor(train, gym, saved?.routes, routing.filled, deps.spotsShown?.() ?? true),
      document,
    );
    editor.addEventListener('click', (event) => {
      editClicked(editor, event);
    });
    editor.addEventListener('change', (event) => {
      moveChosen(event);
    });
    dragsIn(editor);
    deps.tools.replaceChildren(editor);
    if (routing.said !== undefined) sayInForm(editor, routing.said);
    if (edits.busy) editorControls(false);
    deps.overlay.show(train);
  };

  const loadSaved = async (): Promise<void> => {
    const shown = routing;
    if (!shown) return;
    try {
      shown.saved = await getJson<SavedRoutesView>(trainUrl(shown.train, 'routes'));
    } catch {
      shown.saved = { routes: [] };
      say('Your saved routes could not be loaded. Try again in a moment.');
    }
    if (routing === shown) drawRoute();
  };

  /**
   * Ends route mode: the editor and the numbers go, the map is drawn anew with the train's popup
   * open (`opened`; none for a train that is gone).
   */
  const endRoute = async (opened: MapTrain | undefined): Promise<void> => {
    const ended = routing;
    if (!ended) return;
    endDrag?.();
    routing = undefined;
    toolsIdle();
    deps.overlay.clear();
    deps.routeMode?.(false);
    hold.release(ended.claim);
    // The train's own line again, also when the list did not change meanwhile.
    deps.redrawn();
    await deps.done(opened);
  };

  /**
   * Sends one edit of the route (its turn in `edits`) and takes its answer in: the editor and
   * the numbers are drawn anew from the train it gives, whether the edit went through or was
   * refused; an answer that the train is gone ends route mode; one that gives no train for
   * another reason (too many clicks, Discord away) is said and changes nothing. What is missing
   * is said under the editor.
   */
  const sendEdit = async (edit: RouteEdit, body: TrainBody): Promise<void> => {
    const shown = routing;
    if (!shown) return;
    const editor = deps.tools.firstElementChild;
    const under = (text: string): void => {
      shown.said = text;
      const now = deps.tools.firstElementChild;
      if (now instanceof HTMLElement) sayUnder(now, text);
      else say(text);
    };
    if ('text' in body) {
      shown.said = body.text;
      if (editor instanceof HTMLElement) sayUnder(editor, body.text);
      else say(body.text);
      return;
    }
    const sent = await send(trainUrl(shown.train, `route/${edit}`), body.body);
    if (routing !== shown) {
      say(sent.text);
      return;
    }
    if (routeModeEnds(sent)) {
      say(sent.text);
      await endRoute(undefined);
      return;
    }
    if (sent.train) shown.train = sent.train;
    // A saved route was saved, loaded or forgotten: its list as it is now.
    if (sent.ok && (edit === 'save' || edit === 'forget')) shown.saved = undefined;
    // The name a route was saved under is done with.
    drawRoute(sent.ok && edit === 'save' ? { name: '' } : {});
    const { made } = shown;
    shown.made = undefined;
    under(made === undefined ? sent.text : `${made} ${sent.text}`);
    if (shown.saved === undefined) void loadSaved();
  };

  const editClicked = (editor: HTMLElement, event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !routing) return;
    if (target.dataset.cancel !== undefined) {
      void endRoute(routing.train);
      return;
    }
    const edit = target.dataset.edit;
    if (!isRouteEdit(edit)) return;
    const fields = fieldsOf(editor);
    const values: RouteEditValues = {
      stop: target.dataset.stop,
      from: target.dataset.from,
      to: target.dataset.to,
      route: fields.route,
      name: fields.name,
    };
    void edits.add(edit, values);
  };

  /** A position picked in a stop's "move to" list: one `/route move`. */
  const moveChosen = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !routing) return;
    const from = target.dataset.moveFrom;
    if (from === undefined || target.value === from) return;
    void edits.add('move', { from, to: target.value });
  };

  /** Puts the map in route mode for a train: only while no other form is open. */
  const startRoute = (train: MapTrain, made?: string): void => {
    const claim = hold.take(false, true);
    if (!claim) {
      say(FORM_OPEN);
      return;
    }
    deps.closePopup();
    routing = {
      claim,
      train,
      saved: undefined,
      filled: {},
      ...(made === undefined ? {} : { made }),
    };
    deps.routeMode?.(true);
    // The train's own line leaves the map at once: route mode's numbers take its place.
    deps.redrawn();
    drawRoute();
    void loadSaved();
  };

  /**
   * The start form in the side panel, in place of "New train"; with `first` ("Train here") it names
   * the place, and from a popup or card (`control`) it is drawn there, in the place of the control;
   * the train it makes has the place added in route mode, as a tap on the place adds it. A form gone
   * with its popup meanwhile opens nothing over what the member does now: the train is said and the
   * place added without route mode.
   */
  const openStart = (
    prefilled?: number,
    focusFirst = false,
    first?: FirstStop,
    control?: HTMLButtonElement | null,
  ): void => {
    // A form at a place in its popup, as a raid's report; route mode then has the side pane.
    const box = control?.parentElement;
    const home = formHome(
      {
        tools: deps.tools,
        hold,
        closePopup: () => {
          deps.closePopup();
        },
        idle: toolsIdle,
      },
      box && control ? { box, control } : undefined,
    );
    const claim = home.open();
    if (!claim) {
      say(FORM_OPEN);
      return;
    }
    if (first && home.inPane()) deps.closePopup();
    if (home.inPane()) starting = claim;
    const regions = deps.regions.map((region) => ({ id: region.id, name: region.name }));
    const form = renderNode(
      startForm(
        regions,
        prefilled === undefined ? {} : { region: String(prefilled) },
        deps.zone ? { zone: deps.zone(), reader: readerZone() } : undefined,
        first?.name,
      ),
      document,
    );
    const close = () => {
      if (starting === claim) starting = undefined;
      home.close();
    };
    formKeys(form);
    form.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        close();
        return;
      }
      if (target.dataset.submit !== 'train') return;
      const fields = fieldsOf(form);
      const body = startBody(
        {
          name: fields.name ?? '',
          region: fields.region ?? '',
          time: fields.time ?? '',
          atEnd: fields.atEnd ?? '',
        },
        first?.kind,
      );
      void sendForm(form, `/s/${guild}/api/trains`, body).then(async (sent) => {
        if (!sent) return;
        if (!sent.ok) {
          sayUnder(form, sent.text);
          return;
        }
        if (!hold.holds(claim)) {
          say(sent.text);
          if (first && sent.train?.may.arrange) {
            const body = routeEditBody('add', sent.train, first.stop);
            if ('body' in body) {
              const added = await send(trainUrl(sent.train, 'route/add'), body.body);
              say(`${sent.text} ${added.text}`);
            }
          }
          await deps.done(undefined);
          return;
        }
        close();
        say(sent.text);
        // A new train has no stops: its route is laid at once, by who may.
        if (sent.train?.may.arrange) {
          startRoute(sent.train, first && sent.text);
          if (first) void edits.add('add', first.stop);
        } else await deps.done(sent.train);
      });
    });
    home.draw(form);
    // From the Report button (plan 8M-9A, R1-3): its first field takes the focus.
    if (focusFirst) form.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  };

  /**
   * Takes or gives up the conductor role at once, as `/conductor` does, with whose the role was
   * as the train was drawn (a press against a role that changed meanwhile is refused).
   */
  const pressConductor = async (button: HTMLButtonElement, train: MapTrain): Promise<void> => {
    const change = button.dataset.conductor;
    if (!isConductorChange(change)) return;
    button.disabled = true;
    const sent = await send(trainUrl(train, `conductor/${change}`), conductorBody(train));
    button.disabled = false;
    deps.answered(train.id, { text: sent.text, ok: sent.ok }, button);
    await deps.done(sent.ok || sent.train ? (sent.train ?? train) : undefined);
  };

  return {
    /**
     * A click on "New train" (`newTrainButton`): the start form in its place; from the Report
     * button (plan 8M-9A, A5) with its region prefilled where one region alone holds the place.
     */
    newTrainClicked(region?: number, focusFirst = false): void {
      openStart(region, focusFirst);
    },

    /**
     * A click on "Train here" in a gym's or a Power Spot's popup: the start form with the place
     * as its first stop, its region prefilled where one region alone holds the place.
     */
    trainHereClicked(first: FirstStop, region?: number, control?: HTMLButtonElement | null): void {
      openStart(region, true, first, control);
    },

    /**
     * A click on a train's action in its popup or the side panel (`data-route-train`,
     * `data-conductor`): `train` is the train as the list has it. Move… and Manage… are the
     * post's dialogs as forms (`post-forms-ui.ts`, plan 8M-8C).
     */
    actionClicked(button: HTMLButtonElement, train: MapTrain): void {
      if (button.dataset.routeTrain !== undefined) startRoute(train);
      else if (button.dataset.conductor !== undefined) void pressConductor(button, train);
    },

    /**
     * A gym clicked on the map: in route mode it is added as the next stop of the train being
     * arranged, after the edits that wait (true: its popup is not wanted); otherwise nothing
     * (false).
     */
    gymClicked(clicked: MapGym): boolean {
      if (!routing) return false;
      void edits.add('add', { gym: clicked.id });
      return true;
    },

    /**
     * A Power Spot of the map's layer tapped (plan 8M-8C, R5): in route mode it is added as the
     * next stop, by its key, as a gym clicked is (true: its popup is not wanted); otherwise
     * nothing (false).
     */
    spotClicked(spot: { id: string; title: string }): boolean {
      if (!routing) return false;
      void edits.add('add', { spot: `w${spot.id}` });
      return true;
    },

    /**
     * The map's Power Spots came into sight or went (their layer, the zoom): the route editor's
     * hint says so, nothing else of it drawn anew (a field keeps what is typed and the focus).
     */
    placesChanged(): void {
      const hint = deps.tools.querySelector<HTMLElement>('.route-editor .spots-hint');
      if (hint) hint.textContent = spotsHint(deps.spotsShown?.() ?? true);
    },

    /** The train in route mode, if any: the list leaves its line to route mode's numbers. */
    routing(): MapTrain | undefined {
      return routing?.train;
    },

    /** Whether the trains' box holds the start form or the route editor: the list keeps it. */
    inTools(): boolean {
      return starting !== undefined || routing !== undefined;
    },
  };
}

export type TrainUi = ReturnType<typeof trainUi>;
