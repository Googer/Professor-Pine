import { formKeys } from './form-keys.js';
import { formHome, type FormHome } from './form-home.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { GeoView } from '../../domain/web/geo-data.js';
import { MEETUP_CHANGES, type MeetupChange, type StopsView } from '../../domain/web/meetup-data.js';
import type { MapMeetup } from '../../domain/web/party-data.js';
import { getJson, say } from './common.js';
import { liveControl } from './list-ui.js';
import {
  editorAfter,
  editorAfterTimes,
  editorStep,
  editorTyped,
  gymPick,
  meetupChangeBody,
  meetupEditor,
  meetupTimesBody,
  newMeetupBody,
  newMeetupForm,
  PlacePicking,
  regionChosenBy,
  sendMeetupForm,
  StopLoads,
  stopFromMeetupButton,
  stopPick,
  stopsBox,
  type EditorState,
  type MapBox,
  type MapStop,
  type MeetupAnswered,
  type MeetupBody,
  type NewMeetupValues,
  type PickedPlace,
} from './meetup-forms.js';
import type { Me } from './notice.js';
import { readerZone } from './post-time.js';
import { renderNode, type MapGym } from './popup.js';
import { focusBack } from './post-forms.js';
import { formPlace, NOTHING_CHANGED, type FormHold } from './raid-forms.js';
import type { PressAnswer } from './press-answer.js';
import { fieldsOf, sayInForm, sayUnder } from './raid-ui.js';
import { newTrainButton } from './train-forms.js';

/**
 * The meetups of the live map in the page (plan 8M-5M, spec 3.7): "New meetup" in the side
 * panel's box (and "Hold meetup here" in a gym's popup, the gym as its place) opens the form of a new
 * meetup there; "Pick on the map" puts the map in "pick a place" mode, in which a gym clicked (its
 * dot or the marker of its raids), a PokéStop clicked (the stops of the view are shown meanwhile,
 * from `/api/stops`) or a point of the map clicked becomes its place, and no popup opens; "Manage…"
 * in a meetup's popup or item opens its editor in the place of its post, as a train's and a raid's
 * do, whose Submit sends what was changed. One form at a time (`FormHold`, shared with the raid, spawn
 * and train forms): a new meetup's is a form of the box (`aside`), under which the list is drawn.
 * After a success the map refreshes (`done`).
 */
export interface MeetupUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  /** The server's regions with their outlines, as `/api/geo` gives them. */
  regions: GeoView['regions'];
  /** The gyms by id, as `/api/geo` gives them. */
  gyms: ReadonlyMap<number, MapGym>;
  /** The form that is open, shared with the other forms. */
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release' | 'fit'>;
  /** The side panel's box, where the forms are drawn. */
  tools: HTMLElement;
  /** The server's zone (`PartiesView.zone`), in which the editor shows the times. */
  zone(): string;
  /**
   * The PokéStops of "pick a place" mode on the map: shown (each clicked calls `picked`), and the
   * map's view as a box to ask them for; `moved` is called after the map moved, until `clear`.
   */
  stops: {
    box(): MapBox;
    show(stops: readonly MapStop[], picked: (stop: MapStop) => void): void;
    clear(): void;
    moved(run: () => void): () => void;
  };
  /** Closes the popup that is open (a form with no place yet, or picking one, has the side panel). */
  closePopup(): void;
  /** A Submit's answer for the meetup's answer line in its post, once the post is back. */
  answered(meetupId: string, answer: PressAnswer, from: Element): void;
  /** A refusal said under a form that stays: its popup shaken, its card nudged. */
  refused(form: HTMLElement): void;
  /** After something went through: the list again, and the meetup's popup opened when given. */
  done(meetup: MapMeetup | undefined): Promise<void>;
  /** The list as the page has it, drawn anew at once (as picking starts and ends). */
  redrawn(): void;
}

/** What the page says of a form while another one is open. */
const FORM_OPEN = 'Close the form that is open first.';

/** What the page says when the PokéStops cannot be loaded or there are more than it shows. */
const NO_STOPS = 'The PokéStops could not be loaded. Click a gym or a point of the map.';
const MORE_STOPS = 'Zoom in to see every PokéStop here.';

/** How long the map rests after it moved before its PokéStops are asked for again. */
const STOPS_REST_MS = 300;

export function meetupUi(deps: MeetupUiDeps) {
  const { guild, hold } = deps;

  /** Sends a body to an address of the meetups with the page's token. */
  const send = async (
    url: string,
    body: Record<string, unknown>,
  ): Promise<{ text: string } & MeetupAnswered> => {
    const sent = await sendMeetupForm(deps.csrf.get(), {
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
  const sendForm = async (form: HTMLElement, url: string, body: MeetupBody) => {
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

  /** The box shows "New train" and "New meetup" again. */
  const toolsIdle = (): void => {
    deps.tools.replaceChildren(renderNode(newTrainButton(), document));
  };

  const regionList = () => deps.regions.map((region) => ({ id: region.id, name: region.name }));

  /**
   * The form of a new meetup, while it is open: its claim, its place, and whether the member chose
   * its region (then a place picked leaves it; else the region follows the place).
   */
  let making: { home: FormHome; place: PickedPlace | undefined; regionChosen: boolean } | undefined;
  /** Stops the PokéStops following the map while picking. */
  let stopFollowing: (() => void) | undefined;

  const picking = new PlacePicking((place) => {
    if (!making) return;
    making.place = place;
    endPicking();
    drawMaking();
  });

  /**
   * The PokéStops of the map's view, to be picked: asked for as picking starts and once the map
   * has rested after it moved, only the last answer shown (`StopLoads`).
   */
  const stopLoads = new StopLoads({
    load: () => {
      const query = new URLSearchParams(
        Object.entries(stopsBox(deps.stops.box())).map(([key, value]) => [key, String(value)]),
      ).toString();
      return getJson<StopsView>(`/s/${guild}/api/stops?${query}`);
    },
    show: (view) => {
      if (!picking.picking) return;
      deps.stops.show(view.stops, (stop) => {
        picking.stopClicked(stop, deps.regions);
      });
    },
    more: (more) => {
      if (more) say(MORE_STOPS);
    },
    failed: () => {
      say(NO_STOPS);
    },
    delayMs: STOPS_REST_MS,
    setTimer: (run, ms) => {
      const timer = window.setTimeout(run, ms);
      return () => {
        window.clearTimeout(timer);
      };
    },
  });

  const startPicking = (): void => {
    picking.start();
    deps.closePopup();
    // The meetups' and trains' markers let clicks through to the gyms meanwhile.
    deps.redrawn();
    stopFollowing = deps.stops.moved(() => {
      stopLoads.moved();
    });
    stopLoads.now();
  };

  const endPicking = (): void => {
    picking.end();
    stopLoads.stop();
    stopFollowing?.();
    stopFollowing = undefined;
    deps.stops.clear();
    deps.redrawn();
  };

  /** Draws the form of a new meetup anew, keeping what was typed (`typed`, when it moved). */
  const drawMaking = (typed?: Partial<NewMeetupValues>): void => {
    if (!making) return;
    const before = making.home.element().firstElementChild;
    const filled: Partial<NewMeetupValues> =
      typed ??
      (before instanceof HTMLElement && before.dataset.form === 'meetup' ? fieldsOf(before) : {});
    const form = renderNode(
      newMeetupForm(regionList(), making.place, filled, picking.picking, making.regionChosen, {
        zone: deps.zone(),
        reader: readerZone(),
      }),
      document,
    );
    formKeys(form);
    form.addEventListener('click', (event) => {
      madeClicked(form, event);
    });
    // A region the member picks stays whatever place is picked; none picked, it follows the place.
    form.addEventListener('change', (event) => {
      const target = event.target;
      if (making && target instanceof HTMLSelectElement && target.name === 'region') {
        making.regionChosen = regionChosenBy(target.value);
      }
    });
    making.home.draw(form);
  };

  const closeMaking = (): void => {
    const open = making;
    if (!open) return;
    if (picking.picking) endPicking();
    making = undefined;
    open.home.close();
  };

  const madeClicked = (form: HTMLElement, event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !making) return;
    if (target.dataset.cancel !== undefined) {
      closeMaking();
      return;
    }
    if (target.dataset.pick === 'start') {
      // Picking needs the map: a form in a popup goes to the side pane, with what was typed.
      const typed = making.home.inPane() ? undefined : fieldsOf(form);
      if (!making.home.toPane()) {
        say(FORM_OPEN);
        return;
      }
      startPicking();
      drawMaking(typed);
      return;
    }
    if (target.dataset.pick === 'stop') {
      endPicking();
      drawMaking();
      return;
    }
    if (target.dataset.submit !== 'meetup') return;
    const fields = fieldsOf(form);
    const body = newMeetupBody(
      {
        name: fields.name ?? '',
        region: fields.region ?? '',
        start: fields.start ?? '',
        end: fields.end ?? '',
        info: fields.info ?? '',
      },
      making.place,
    );
    const open = making;
    void sendForm(form, `/s/${guild}/api/meetups`, body).then(async (sent) => {
      if (!sent) return;
      // A form gone with its popup meanwhile: said, nothing opened or closed over what the member
      // does now, and the list again for what was made.
      const here = making === open && open.home.holds();
      if (!sent.ok) {
        if (here) sayUnder(form, sent.text);
        else say(sent.text);
        return;
      }
      if (!here) {
        if (making === open) making = undefined;
        say(sent.text);
        await deps.done(undefined);
        return;
      }
      closeMaking();
      say(sent.text);
      await deps.done(sent.meetup);
    });
  };

  /**
   * The form of a new meetup, with `place` when one is given: at a place in its popup, in the
   * place of the control (`control`), else in the side panel's box.
   */
  const openMaking = (place: PickedPlace | undefined, control?: HTMLButtonElement): void => {
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
    if (!home.open()) {
      say(FORM_OPEN);
      return;
    }
    if (home.inPane()) deps.closePopup();
    making = { home, place, regionChosen: false };
    drawMaking();
    home.element().querySelector<HTMLElement>('input[name="name"]')?.focus();
  };

  /**
   * Opens a meetup's editor in the place of its post, as `post-forms-ui.ts` opens a train's forms.
   * Submit sends what was changed and puts the post back, as they do; a refusal keeps the form.
   */
  const openEditing = (control: HTMLButtonElement, meetup: MapMeetup): void => {
    const section =
      control.closest<HTMLElement>('.post-popup') ?? control.closest<HTMLElement>('.party-popup');
    if (!section) return;
    const place = formPlace(section);
    // Outside a popup or the card (a line of the list), its claim goes with its form.
    const claim = hold.take(place, false, place === false ? () => section.isConnected : undefined);
    if (!claim) {
      say(FORM_OPEN);
      return;
    }
    const before = [...section.childNodes];
    const open: EditorState = { meetup, filled: {} };
    const close = (): void => {
      section.replaceChildren(...before);
      hold.release(claim);
      // The release may have drawn the popup anew: the control in it as it is now.
      focusBack(liveControl(control));
    };

    /**
     * What was changed, one change after another, both times as one request (the server reads them
     * together and orders them, `setTimesAs`); a refusal stops there, the form kept.
     */
    const submit = async (from: HTMLElement): Promise<void> => {
      let editor = from;
      open.filled = editorTyped(open, fieldsOf(editor));
      const changes = MEETUP_CHANGES.filter((change) => open.filled[change] !== undefined);
      // What is missing is said before anything is sent.
      for (const change of changes) {
        const body = meetupChangeBody(change, open.meetup, open.filled);
        if ('text' in body) {
          sayInForm(editor, body.text);
          return;
        }
      }
      const bothTimes = changes.includes('start') && changes.includes('end');
      const turns: readonly (MeetupChange | 'times')[] = bothTimes
        ? [...changes.filter((change) => change !== 'start' && change !== 'end'), 'times']
        : changes;
      const went: string[] = [];
      for (const change of turns) {
        const body =
          change === 'times'
            ? meetupTimesBody(open.meetup, open.filled)
            : meetupChangeBody(change, open.meetup, open.filled);
        const url = `/s/${guild}/api/meetups/${encodeURIComponent(open.meetup.id)}/${change}`;
        const sent = await sendForm(editor, url, body);
        if (!sent) return;
        const told = [...went, sent.text].join(' ');
        const held = hold.holds(claim);
        // Gone, or no longer the member's to change (`panel` null): the editor closes.
        if (editorStep(held, sent) === 'close') {
          close();
          say(told);
          await deps.done(undefined);
          return;
        }
        if (held) {
          // Drawn from the meetup the answer gives: a field not typed in shows what it has now, a
          // change that went through is not sent again, one typed in keeps its text.
          const typed = fieldsOf(editor);
          const after =
            change === 'times'
              ? editorAfterTimes(open, typed, sent)
              : editorAfter(open, typed, change, sent);
          open.meetup = after.meetup;
          open.filled = after.filled;
          // On the form still, for the keyboard (Escape cancels from inside it), unless the member
          // went elsewhere meanwhile.
          const active = document.activeElement;
          const onForm = active === null || active === document.body || section.contains(active);
          editor = draw();
          if (onForm) editor.querySelector<HTMLElement>('button[data-submit]')?.focus();
        }
        if (!sent.ok) {
          if (!held) say(told);
          else {
            sayInForm(editor, told);
            deps.refused(editor);
          }
          // What went through before it, in other requests or in this one, shows on the post.
          if (went.length > 0 || (sent.went ?? []).length > 0) await deps.done(undefined);
          return;
        }
        went.push(sent.text);
      }
      // Done: the post back first, whose answer line takes the answer; the list again, which shows
      // the meetup as it is now. A form gone with its popup meanwhile only says it.
      const text = went.length === 0 ? NOTHING_CHANGED : went.join(' ');
      if (hold.holds(claim)) {
        close();
        deps.answered(open.meetup.id, { text, ok: true }, control);
      } else say(text);
      await deps.done(undefined);
    };

    const clicked = (editor: HTMLElement, event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        close();
        return;
      }
      if (target.dataset.submit !== undefined) void submit(editor);
    };

    /** Draws the editor anew from the meetup as the last answer gave it, keeping what was typed. */
    const draw = (): HTMLElement => {
      const editor = renderNode(
        meetupEditor(open.meetup, deps.zone(), Date.now(), open.filled, readerZone()),
        document,
      );
      formKeys(editor);
      editor.addEventListener('click', (event) => {
        clicked(editor, event);
      });
      section.replaceChildren(editor);
      hold.fit();
      return editor;
    };
    draw().querySelector<HTMLElement>('input[name="name"]')?.focus();
  };

  return {
    /** A click on "New meetup": its form, without a place yet. */
    newMeetupClicked(pick = false): void {
      openMaking(undefined);
      // From the Report button (plan 8M-9A, A5): its place picked at once, by its own picking.
      if (pick && making) {
        startPicking();
        drawMaking();
      }
    },

    /** A click on "Hold meetup here" in a gym's popup: the form there, the gym its place. */
    meetupHereClicked(gym: MapGym, control?: HTMLButtonElement): void {
      openMaking(gymPick(gym), control);
    },

    /** A click on "Hold meetup here" in a PokéStop's popup: the form there, the stop its place. */
    meetupAtStopClicked(control: HTMLButtonElement): void {
      const stop = stopFromMeetupButton(control.dataset);
      if (stop) openMaking(stopPick(stop, deps.regions), control);
    },

    /** A click on "Manage…" in a meetup's popup or item: its editor in the place of its post. */
    editClicked(control: HTMLButtonElement, meetup: MapMeetup): void {
      openEditing(control, meetup);
    },

    /** A gym clicked on the map: picked while picking (true: no popup), else nothing. */
    gymClicked(gym: MapGym): boolean {
      return picking.gym(gym);
    },

    /** A point of the map clicked: a pin while picking (true), else nothing. */
    mapClicked(point: LatLon): boolean {
      return picking.point(point, deps.regions);
    },

    /** Whether the map is in "pick a place" mode: the parties' markers let clicks through. */
    picking(): boolean {
      return picking.picking;
    },

    /** Whether the box holds a new meetup's form: the list keeps it. */
    inTools(): boolean {
      return making?.home.inPane() === true;
    },
  };
}

export type MeetupUi = ReturnType<typeof meetupUi>;
