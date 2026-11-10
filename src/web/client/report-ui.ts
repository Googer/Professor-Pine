import * as L from 'leaflet';
import type { GeoView } from '../../domain/web/geo-data.js';
import { PLACES_FROM } from './cluster.js';
import { byId, say } from './common.js';
import type { DistanceUnits } from './distance.js';
import { SheetFocus } from './layers-ui.js';
import { sameControl } from './list-ui.js';
import type { MapSpot } from './max-ui.js';
import { pickAgainPressed } from './pick-again.js';
import { renderNode, type MapGym, type PageNode } from './popup.js';
import type { FormClaim, FormHold } from './raid-forms.js';
import {
  NEAREST_COUNT,
  NEAREST_SPARE,
  nearestLines,
  pickBox,
  pickLive,
  TAP_A_STOP,
  regionHolding,
  type NearPlace,
  type Nearest,
} from './report-flow.js';
import {
  REPORT_ICONS,
  type ReportIcon,
  type ReportKindId,
  type ShapeElement,
} from './report-icons.js';
import { REPORT_KINDS, reportMenuNode, type ReportKind, type ReportPick } from './report-menu.js';
import { gymSpawnPlace, pressedWhere, type SpawnPlace } from './spawn-forms.js';
import { newTrainButton } from './train-forms.js';
import type { LatLon } from './view.js';

/**
 * The Report button of the live map in the page (plan 8M-9A; design "Reporting", A7): in the
 * header on a wide screen (`#report-button`, hidden in the template until a member who may report
 * is known), over the map at the bottom right on a phone (a Leaflet control above "Show where I
 * am"), and a line of its own at the top of the phone's list, which shows the map first. Members
 * only, as the other write controls (`offered`: not logged out, not read-only).
 *
 * Step 1 is the menu of what (`reportMenuNode`), a sheet on a phone and a small panel under the
 * button on a wide screen, a dialog for the keyboard as the layers' sheet is (`SheetFocus`: Escape
 * and Cancel close it). Steps 2 and 3 are `ReportFlow`'s, a controller over the hold and what the
 * page gives it (R1-2: tested without a page): step 2 holds the side pane's box as route mode does
 * (an aside claim of the hold, `take(false, true)`), its heading focused (R1-3), the fitting places
 * drawn whatever the layers say (`picks`) and ringed on the map (`mark`), the nearest few listed
 * with their distances (a raid's from the gyms the page has; a max battle's from the Power Spots
 * of the view, the map flown to where you are at their zoom, A4), and a tap on one or on its line
 * goes on to step 3, the kind's own form with the place, the claim let go first so that the form
 * takes its own (A6): a raid's report form in the gym's popup, or the raid standing there; a max
 * battle's form in the spot's popup, or the battle there. A tap on the map while a max battle or
 * a spawn is picked puts a pin, whose line in the box opens the form there (R1-1: a double tap
 * only zooms). A train and a meetup have no step 2: their forms ask their place (A5).
 */

/** What the page says of Report while another form is open. */
const FORM_OPEN = 'Close the form that is open first.';

/** What `ReportFlow` needs of the page. */
export interface ReportFlowDeps {
  hold: Pick<FormHold<unknown>, 'take' | 'release' | 'editing'>;
  say(text: string): void;
  /** Step 2's box drawn into the side pane's box; none: the box given back to "New train". */
  showBox(box: PageNode | undefined): void;
  /** Step 2's changing part (`pickLive`) drawn anew in the box, the box and its focus kept (R2-2). */
  showLive(live: PageNode): void;
  /** The focus on step 2's heading (R1-3). */
  focusBox(): void;
  /** Whether the focus is in step 2's box. */
  focusInBox(): boolean;
  /** The focus back on the Report button. */
  focusReport(): void;
  /** The map's look while step 2 picks (`map.css`: the fitting places ringed, the rest dimmed). */
  mark(pick: ReportPick | undefined): void;
  /** The gyms and places step 2 draws, drawn or taken away. */
  placesChanged(): void;
  /** The parties drawn anew (the raids drawn for a raid's step 2, C1; the rings let taps through). */
  redrawn(): void;
  /** The popup open, or the phone card, closed (review B7). */
  closePopup(): void;
  /** Step 1's menu (← Back). */
  openMenu(): void;
  /** Runs after the event being handled (a tap a popup opens on). */
  later(run: () => void): void;
  /** The server's regions with their outlines (a train's region prefilled). */
  regions: GeoView['regions'];
  /** The gyms of the map, the nearest of which step 2 of a raid lists. */
  gyms: ReadonlyMap<number, MapGym>;
  /** Where distances are from: your location once the browser said, else the map's middle. */
  origin(): LatLon;
  units: DistanceUnits;
  /**
   * The map flown to a place at the zoom the Power Spots are drawn from (A4); `landed` once it is
   * there (R2-4).
   */
  flyTo(place: LatLon, landed: () => void): void;
  /** The pin of step 2 (R1-1), or none. */
  showPin(point: LatLon | undefined): void;
  /**
   * A raid's step 3 (A5): the raid that stands at the gym opened (true), as the gym's popup offers
   * it (one raid per gym, plan 8E), where the map draws it; false where none is drawn there.
   */
  openRaid(gym: MapGym): boolean;
  /** A raid's step 3 at a gym without one: its report form in the gym's popup. */
  toRaidForm(gym: MapGym): void;
  /** A max battle's step 3 at a Power Spot: the battle there opened (true), where one is drawn. */
  openBattle(spotId: string): boolean;
  /** A max battle's step 3 at a Power Spot without one: its form in the spot's popup. */
  toMaxForm(spot: MapSpot): void;
  /** A max battle's step 3 at a pin: the form of an unlisted power spot there. */
  maxAt(point: LatLon): void;
  /**
   * A spawn's step 3: its form at the pin, reporting at the gym, PokéStop or Power Spot tapped for
   * it (`place`) itself, as `/wild near:` does (Matt, 2026-11-07); at a point, a pin.
   */
  spawnAt(point: LatLon, place?: SpawnPlace): void;
  /**
   * The kinds without a step 2 (A5): a new train's form, its region prefilled where one region
   * alone holds your location or the map's middle (`regionHolding`); a new meetup's form with its
   * own picking of a place already started.
   */
  startTrain(region: number | undefined): void;
  startMeetup(): void;
  /**
   * Research's or Team GO Rocket's step 3 at a PokéStop (plan 8M-9B, B9): the research form in the
   * side pane, the Rocket form in the stop's popup, with the stop.
   */
  toStop(kind: 'research' | 'rocket', stop: MapSpot): void;
  /**
   * The `count` nearest Power Spots (`spots`) or PokéStops (`stops`) of a point, wherever they
   * are (plan 8M-11A: `/api/powerspots` or `/api/stops` with `near=` and `count=`), or `failed`.
   */
  nearest(
    pick: 'spots' | 'stops',
    at: LatLon,
    count: number,
  ): Promise<readonly MapSpot[] | 'failed'>;
}

/**
 * Steps 2 and 3 of the Report button (R1-2): what is picked, its claim of the hold, the nearest
 * places, the pin, and what each tap leads to, over `ReportFlowDeps`.
 */
export class ReportFlow {
  private picking:
    | {
        kind: ReportKind;
        claim: FormClaim;
        nearest: Nearest | undefined;
        places: Map<string, NearPlace>;
        pin: LatLon | undefined;
        /** The gym, PokéStop or Power Spot the pin was put at by a tap, if so (a spawn's place). */
        pinPlace: SpawnPlace | undefined;
        /** How the pin's line names that place, with its kind ("Market Fountain (PokéStop)"). */
        pinName: string | undefined;
        /** Why the pin cannot be reported where it is (review B6: in no region), if so. */
        refused: string | undefined;
        /** The map on its way to the Power Spots (R2-4): its zoom on the way says nothing. */
        flying: boolean;
        /** What a tap that took nothing said (plan 8M-9B: "Tap a PokéStop."), if so. */
        note: string | undefined;
        /**
         * The nearest came from the server (plan 8M-11A): the view's places, which the map draws,
         * no longer take their place in the list.
         */
        served: boolean;
      }
    | undefined;

  /** The latest ask for the server's nearest, settled once its answer is drawn (or dropped). */
  nearestCame: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ReportFlowDeps) {}

  /** Whether step 2 draws these places now, whatever the layers say. */
  picks(pick: ReportPick): boolean {
    return this.picking?.kind.pick === pick;
  }

  /** Whether the side pane's box holds step 2: the list keeps it. */
  inTools(): boolean {
    return this.picking !== undefined;
  }

  /** A kind chosen in step 1. */
  choose(kind: ReportKind): void {
    if (kind.pick === 'form') {
      if (kind.id === 'train') {
        this.deps.startTrain(regionHolding(this.deps.origin(), this.deps.regions));
      } else this.deps.startMeetup();
      return;
    }
    this.start(kind);
  }

  /** Step 2 of a kind: the hold taken, the box drawn and focused, the places drawn. */
  private start(kind: ReportKind): void {
    const { deps } = this;
    const claim = deps.hold.take(false, true);
    if (!claim) {
      deps.say(FORM_OPEN);
      return;
    }
    const origin = deps.origin();
    this.picking = {
      kind,
      claim,
      nearest: undefined,
      places: new Map(),
      pin: undefined,
      pinPlace: undefined,
      pinName: undefined,
      refused: undefined,
      flying: false,
      note: undefined,
      served: false,
    };
    deps.closePopup();
    if (kind.pick === 'gyms') {
      // Every gym is known to the page: the nearest of them at once.
      const gyms = [...deps.gyms.values()].map((gym): NearPlace => ({
        id: String(gym.id),
        name: gym.name,
        lat: gym.lat,
        lon: gym.lon,
      }));
      this.picking.places = new Map(gyms.map((gym) => [gym.id, gym]));
      this.picking.nearest = nearestLines(gyms, origin, deps.units);
    } else if (kind.pick === 'spots' || kind.pick === 'stops') {
      // A4: the map flies to where you are (else stays at its middle) at the zoom the Power Spots
      // are drawn from, whose answer for that box lists the nearest (`spotsCame`); the PokéStops
      // alike (plan 8M-9B, B9: `stopsCame`).
      this.picking.nearest = 'loading';
      this.picking.flying = true;
      const flight = this.picking;
      deps.flyTo(origin, () => {
        flight.flying = false;
      });
      // The five nearest wherever they are (plan 8M-11A), not only those the view holds: five
      // more asked for, of a point sent rounded, and the five nearest the exact one listed (F-B8).
      const pick = kind.pick;
      this.nearestCame = deps.nearest(pick, origin, NEAREST_COUNT + NEAREST_SPARE).then(
        (answer) => {
          this.nearestServed(flight, answer);
        },
        () => undefined,
      );
    }
    deps.mark(kind.pick);
    deps.showBox(pickBox(kind, this.picking.nearest));
    deps.placesChanged();
    deps.redrawn();
    deps.focusBox();
  }

  /**
   * Step 2's changing part drawn anew (the nearest came, a pin was put): only it, never the box,
   * whose controls and focus stay (R2-2).
   */
  private draw(): void {
    const open = this.picking;
    if (open) {
      this.deps.showLive(
        pickLive(open.kind, open.nearest, open.pin, open.refused, open.note, open.pinName),
      );
    }
  }

  /**
   * Step 2 ends: its claim let go, the box given back, its places and pin gone, the parties drawn
   * anew (`redraw`: not from inside their own draw, R1-9), the focus back on Report where it was in
   * the box (`focus`: not for a step 3, whose form takes it).
   */
  private end(how: { redraw?: boolean; focus?: boolean } = {}): void {
    const open = this.picking;
    if (!open) return;
    const { deps } = this;
    const hadFocus = how.focus === true && deps.focusInBox();
    this.picking = undefined;
    deps.showBox(undefined);
    deps.hold.release(open.claim);
    deps.placesChanged();
    if (how.redraw !== false) deps.redrawn();
    deps.mark(undefined);
    deps.showPin(undefined);
    if (hadFocus) deps.focusReport();
  }

  /** Cancel. */
  cancel(): void {
    this.end({ focus: true });
  }

  /** ← Back: step 1 again. */
  back(): void {
    this.end();
    this.deps.openMenu();
  }

  /**
   * Escape while step 2 is on (R1-3): an open popup closes, and only that; else step 2 ends. False
   * outside step 2, and while another sheet is open (the layers', `sheetOpen`, R2-5): the key is
   * not the Report button's.
   */
  escape(popupOpen: boolean, sheetOpen = false): boolean {
    if (!this.picking || sheetOpen) return false;
    if (popupOpen) this.deps.closePopup();
    else this.cancel();
    return true;
  }

  /**
   * Whether Report is offered now, asked at each draw of the list: step 2 ends where it is not,
   * without drawing the parties anew inside their own draw (R1-9).
   */
  refresh(offered: boolean): void {
    if (!offered) this.end({ redraw: false, focus: true });
  }

  /** Step 2 ends for step 3: the claim let go first, so that the form takes its own. */
  private toStep3(): void {
    this.end();
  }

  /** A gym picked in step 2 of a raid (A5): the raid standing there opened, else its form. */
  private gymPicked(gym: MapGym): void {
    this.toStep3();
    if (!this.deps.openRaid(gym)) this.deps.toRaidForm(gym);
  }

  /** A Power Spot picked in step 2 of a max battle: its battle opened, else its form. */
  private spotPicked(spot: MapSpot): void {
    this.toStep3();
    if (!this.deps.openBattle(spot.id)) this.deps.toMaxForm(spot);
  }

  /**
   * The pin of step 2 put (R1-1): shown on the map and in the box, which opens the form there; a
   * point in no region is said to be in none on its line, step 2 going on (review B6: by the
   * outlines, as a long press says it, `pressedWhere`).
   */
  private pinAt(point: LatLon, place?: SpawnPlace, name?: string): void {
    const open = this.picking;
    if (!open) return;
    const where = pressedWhere(point, this.deps.regions);
    open.pin = point;
    open.pinPlace = place;
    open.pinName = place && name;
    open.refused = 'text' in where ? where.text : undefined;
    this.deps.showPin(point);
    this.draw();
  }

  /**
   * A gym (its dot or the marker of its raids) tapped: in step 2 of a raid, step 3 there; of a
   * spawn, the pin at its place; of another kind, nothing (review B7b). True: its own popup is not
   * wanted.
   */
  gymClicked(gym: MapGym): boolean {
    const pick = this.picking?.kind.pick;
    if (pick === 'gyms') {
      this.gymPicked(gym);
      return true;
    }
    if (pick === 'point') {
      const name = gym.nickname !== null && gym.nickname !== '' ? gym.nickname : gym.name;
      this.pinAt({ lat: gym.lat, lon: gym.lon }, gymSpawnPlace(gym), `${name} (gym)`);
      return true;
    }
    // Dimmed while another kind's places are picked (a max battle's Power Spots): the tap is
    // taken and does nothing, as a battle's is in a raid's step 2 (review B7b).
    return pick !== undefined;
  }

  /**
   * A Power Spot tapped (or a max battle's marker, `battle`, which opens as it would, step 2
   * ending once the tap is through): in step 2 of a max battle, step 3 there; of a spawn, the pin
   * at its place. A battle's marker, dimmed while another kind is picked, does nothing then
   * (review B7).
   */
  spotClicked(
    spot: { id?: string; title?: string; lat: number; lon: number },
    battle = false,
  ): boolean {
    const pick = this.picking?.kind.pick;
    if (pick === 'spots') {
      if (battle || spot.id === undefined) {
        this.deps.later(() => {
          this.end();
        });
        return false;
      }
      this.spotPicked({ id: spot.id, title: spot.title ?? '', lat: spot.lat, lon: spot.lon });
      return true;
    }
    if (pick === 'point') {
      const { id, title, lat, lon } = spot;
      this.pinAt(
        { lat, lon },
        id === undefined ? undefined : { kind: 'powerspot', id, lat, lon },
        title === undefined || title === '' ? undefined : `${title} (Power Spot)`,
      );
      return true;
    }
    return battle && pick !== undefined;
  }

  /**
   * A point of the map tapped: in step 2 of a max battle or a spawn, the pin there (true); of a
   * report at a stop, nothing but "Tap a PokéStop." (plan 8M-9B: a report needs a stop, no pin).
   */
  mapClicked(point: LatLon): boolean {
    const open = this.picking;
    const pick = open?.kind.pick;
    if (open && pick === 'stops') {
      open.note = TAP_A_STOP;
      this.draw();
      return true;
    }
    if (pick !== 'point' && pick !== 'spots') return false;
    this.pinAt(point);
    return true;
  }

  /** A PokéStop picked in step 2 of a report at a stop (plan 8M-9B): its kind's step 3 there. */
  private stopPicked(stop: MapSpot): void {
    const open = this.picking;
    if (!open || (open.kind.id !== 'research' && open.kind.id !== 'rocket')) return;
    const kind = open.kind.id;
    this.toStep3();
    this.deps.toStop(kind, stop);
  }

  /**
   * A PokéStop tapped (its dot, or the marker of its reports; B9): in step 2 of a report at a stop,
   * step 3 there; of a spawn or a max battle, the pin at its place (review B6); of another kind,
   * nothing (its marker dimmed). True: its own popup is not wanted.
   */
  stopClicked(stop: MapSpot): boolean {
    const pick = this.picking?.kind.pick;
    if (pick === undefined) return false;
    if (pick === 'stops') this.stopPicked(stop);
    else if (pick === 'point' || pick === 'spots') {
      const { id, lat, lon } = stop;
      // A spawn's pin at the stop is the stop itself; a max battle's is a pin there.
      this.pinAt(
        { lat, lon },
        pick === 'point' ? { kind: 'stop', id, lat, lon } : undefined,
        `${stop.title} (PokéStop)`,
      );
    }
    return true;
  }

  /** "Report here" on the pin's line: step 3 there. */
  pinPicked(): void {
    const open = this.picking;
    const pin = open?.pin;
    if (!open || pin === undefined || open.refused !== undefined) return;
    this.toStep3();
    if (open.kind.pick === 'spots') this.deps.maxAt(pin);
    else this.deps.spawnAt(pin, open.pinPlace);
  }

  /** A line of the nearest places picked, by its place's id. */
  nearPicked(id: string): void {
    const open = this.picking;
    const place = open?.places.get(id);
    if (!open || !place) return;
    if (open.kind.pick === 'gyms') {
      const gym = this.deps.gyms.get(Number(id));
      if (gym) this.gymPicked(gym);
    } else if (open.kind.pick === 'spots') {
      this.spotPicked({ id: place.id, title: place.name, lat: place.lat, lon: place.lon });
    } else if (open.kind.pick === 'stops') {
      this.stopPicked({ id: place.id, title: place.name, lat: place.lat, lon: place.lon });
    }
  }

  /**
   * The Power Spots of the view came (A4), could not be had or are not drawn at this zoom (R1-6):
   * step 2 of a max battle lists the nearest, or says why it has none.
   */
  spotsCame(answer: readonly MapSpot[] | 'failed' | 'zoom'): void {
    this.placesCame('spots', answer);
  }

  /** The PokéStops of the view, as the Power Spots' (plan 8M-9B, B9): a report at a stop's. */
  stopsCame(answer: readonly MapSpot[] | 'failed' | 'zoom'): void {
    this.placesCame('stops', answer);
  }

  /**
   * The server's nearest came for the step 2 that asked (plan 8M-11A): they are its list, the
   * nearest first; a failure leaves the list to the view's places, as before.
   */
  private nearestServed(
    asked: NonNullable<ReportFlow['picking']>,
    answer: readonly MapSpot[] | 'failed',
  ): void {
    const open = this.picking;
    if (open !== asked || answer === 'failed') return;
    const places = answer.map((spot): NearPlace => ({
      id: spot.id,
      name: spot.title,
      lat: spot.lat,
      lon: spot.lon,
    }));
    for (const place of places) open.places.set(place.id, place);
    open.served = true;
    open.nearest = nearestLines(places, this.deps.origin(), this.deps.units);
    this.draw();
  }

  /** The places of the view came for the step 2 that asks for them: its nearest, or why none. */
  private placesCame(
    pick: 'spots' | 'stops',
    answer: readonly MapSpot[] | 'failed' | 'zoom',
  ): void {
    const open = this.picking;
    if (open?.kind.pick !== pick) return;
    // The server's nearest are the list once they came (plan 8M-11A).
    if (open.served) return;
    if (typeof answer === 'string') {
      // On its way the map passes zooms the Power Spots are not drawn from (R2-4).
      if (answer === 'zoom' && open.flying) return;
      open.nearest = answer;
    } else {
      const places = answer.map((spot): NearPlace => ({
        id: spot.id,
        name: spot.title,
        lat: spot.lat,
        lon: spot.lon,
      }));
      open.places = new Map(places.map((place) => [place.id, place]));
      open.nearest = nearestLines(places, this.deps.origin(), this.deps.units);
    }
    this.draw();
  }
}

/** What the page's side of the Report button needs beyond the controller's. */
export interface ReportUiDeps extends Omit<
  ReportFlowDeps,
  | 'say'
  | 'showBox'
  | 'showLive'
  | 'focusBox'
  | 'focusInBox'
  | 'focusReport'
  | 'mark'
  | 'openMenu'
  | 'later'
  | 'flyTo'
  | 'showPin'
> {
  map: L.Map;
  /** The side pane's box, where step 2 is drawn (the trains' "New train" otherwise). */
  tools: HTMLElement;
  /** Whether the member may report now (`reportOffered`). */
  offered(): boolean;
  /** Whether a popup or the phone card is open (Escape closes it alone, R1-3, review B7). */
  popupOpen(): boolean;
  /** The phone card closes as the menu opens. */
  closeCard(): void;
  /** On a phone, the map in place of the list. */
  showMap(): void;
  /** Tells `listener` each answer of the Power Spots of the view, or why there is none (A4, R1-6). */
  onSpots(listener: (spots: readonly MapSpot[] | 'failed' | 'zoom') => void): void;
  /** Tells `listener` each answer of the PokéStops of the view, or why none came (B9). */
  onStops(listener: (stops: readonly MapSpot[] | 'failed' | 'zoom') => void): void;
}

const SVG = 'http://www.w3.org/2000/svg';

/** An element of Pine's own drawing as SVG, with what is in it. */
function shapeElement(element: ShapeElement): SVGElement {
  const made = document.createElementNS(SVG, element.tag);
  for (const [name, value] of Object.entries(element.attributes)) made.setAttribute(name, value);
  for (const child of element.children ?? []) made.append(shapeElement(child));
  return made;
}

/**
 * Pine's own icon as SVG of ours, whole (plan 8M-11A: its view box, its attributes, its elements,
 * strokes and holes kept), in the color of what it stands for (`currentColor`).
 */
function shapeOf(icon: Extract<ReportIcon, { kind: 'shape' }>): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', icon.viewBox);
  for (const [name, value] of Object.entries(icon.attributes)) svg.setAttribute(name, value);
  svg.setAttribute('aria-hidden', 'true');
  for (const element of icon.elements) svg.append(shapeElement(element));
  return svg;
}

/**
 * Draws Pine's own icons into their places (`data-shape`) under `root`. The game's pictures drawn
 * as masks (plan 8M-9B) take theirs from the stylesheet (`map.css`, review F5).
 */
export function drawShapes(root: ParentNode): void {
  for (const place of root.querySelectorAll<HTMLElement>('[data-shape]')) {
    const icon = REPORT_ICONS[place.dataset.shape as ReportKindId] as ReportIcon | undefined;
    if (icon?.kind === 'shape' && place.childElementCount === 0) place.append(shapeOf(icon));
  }
}

/** Whether the page is a phone's (`map.css`'s breakpoint). */
const onPhone = (): boolean => window.matchMedia('(max-width: 767px)').matches;

export function reportUi(deps: ReportUiDeps) {
  const { hold, map } = deps;

  const header = byId('report-button') as HTMLButtonElement;
  const floating = document.createElement('button');
  floating.type = 'button';
  floating.className = 'report';
  floating.textContent = 'Report';
  floating.setAttribute('aria-haspopup', 'dialog');
  L.DomEvent.disableClickPropagation(floating);
  const control = new L.Control({ position: 'bottomright' });
  control.onAdd = () => {
    const box = document.createElement('div');
    box.className = 'leaflet-control report-control';
    box.append(floating);
    return box;
  };
  control.addTo(map);
  /** The phone list's own line, which shows the map first. */
  const line = document.createElement('button');
  line.type = 'button';
  line.className = 'report-line';
  line.textContent = 'Report';
  /**
   * Who may report sees Report, but not while a form is open (Matt, 2026-10-30), where it could
   * only say to close that form: off in the header, whose row stays as it is, and gone from the
   * phone's map and list, where it would stand over the form.
   */
  const offerReport = (): boolean => {
    const on = deps.offered();
    const free = on && !hold.editing;
    header.hidden = !on;
    header.disabled = !free;
    floating.hidden = !free;
    line.hidden = !free;
    return on;
  };
  /** The Report button shown now: the header's, or the one over the map on a phone. */
  const reportButton = (): HTMLButtonElement => (onPhone() ? floating : header);

  const wrap = document.createElement('div');
  wrap.className = 'report-wrap';
  wrap.hidden = true;
  document.body.append(wrap);
  const focus = new SheetFocus(wrap, () => [...wrap.querySelectorAll<HTMLElement>('button')]);

  /** The pin of step 2 (R1-1): a marker of ours, taking no taps, made at its first use. */
  let pin: L.Marker | undefined;

  const flow = new ReportFlow({
    ...deps,
    say,
    showBox: (node) => {
      if (node === undefined) {
        deps.tools.replaceChildren(renderNode(newTrainButton(), document));
        return;
      }
      const box = renderNode(node, document);
      drawShapes(box);
      box.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('button') : null;
        if (!(target instanceof HTMLButtonElement)) return;
        const near = target.dataset.reportNear;
        if (target.dataset.reportBack !== undefined) flow.back();
        else if (target.dataset.cancel !== undefined) flow.cancel();
        else if (target.dataset.reportPin !== undefined) flow.pinPicked();
        else if (near !== undefined) flow.nearPicked(near);
      });
      deps.tools.replaceChildren(box);
    },
    showLive: (live) => {
      // The part that stays in the page, its content drawn anew; the focus on a control in it is
      // given back to the same control drawn anew (R2-2).
      const place = deps.tools.querySelector<HTMLElement>('[data-pick-live]');
      if (!place) return;
      const active = document.activeElement;
      const had = active instanceof HTMLElement && place.contains(active) ? active : undefined;
      place.replaceChildren(...renderNode(live, document).childNodes);
      if (had) sameControl(place, had)?.focus();
    },
    focusBox: () => {
      deps.tools.querySelector<HTMLElement>('[data-pick-heading]')?.focus();
    },
    focusInBox: () => {
      const active = document.activeElement;
      return active === document.body || (active !== null && deps.tools.contains(active));
    },
    focusReport: () => {
      reportButton().focus();
    },
    mark: (pick) => {
      const container = map.getContainer();
      container.classList.toggle('report-picking', pick !== undefined);
      for (const each of ['gyms', 'spots', 'stops', 'point'] as const) {
        container.classList.toggle(`pick-${each}`, pick === each);
      }
    },
    openMenu: () => {
      openMenu(reportButton());
    },
    later: (run) => {
      window.setTimeout(run, 0);
    },
    flyTo: (place, landed) => {
      map.once('moveend', landed);
      map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), PLACES_FROM));
    },
    showPin: (point) => {
      if (point === undefined) {
        pin?.remove();
        return;
      }
      pin ??= L.marker([0, 0], {
        icon: L.divIcon({ className: 'report-pin', iconSize: [22, 22] }),
        interactive: false,
        keyboard: false,
      });
      pin.setLatLng([point.lat, point.lon]).addTo(map);
    },
  });
  deps.onStops((answer) => {
    flow.stopsCame(answer);
  });
  deps.onSpots((answer) => {
    flow.spotsCame(answer);
  });

  /** Step 1: the menu, from the button pressed. */
  const openMenu = (opener: HTMLElement): void => {
    // A new report starts afresh: step 2 of another ends.
    flow.cancel();
    if (hold.editing) {
      say(FORM_OPEN);
      return;
    }
    deps.closeCard();
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.addEventListener('click', () => {
      focus.close();
    });
    const menu = renderNode(reportMenuNode(REPORT_KINDS), document);
    drawShapes(menu);
    menu.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const kind = REPORT_KINDS.find((one) => one.id === target.dataset.reportKind);
      if (kind) {
        focus.close();
        flow.choose(kind);
      } else if (target.dataset.cancel !== undefined) focus.close();
    });
    // Under the header's button on a wide screen (a sheet at the bottom on a phone, `map.css`).
    if (!onPhone()) {
      const at = header.getBoundingClientRect();
      menu.style.left = `${String(Math.max(8, Math.min(at.left, window.innerWidth - 276)))}px`;
    }
    wrap.replaceChildren(scrim, menu);
    focus.open(opener);
  };

  header.addEventListener('click', () => {
    openMenu(header);
  });
  floating.addEventListener('click', () => {
    openMenu(floating);
  });
  line.addEventListener('click', () => {
    deps.showMap();
    openMenu(floating);
  });
  // "← Another …" of a form step 2 opened (`addPickAgain`): the form's Cancel, then step 2 of its
  // kind again. Captured: Leaflet stops a click inside a popup from reaching the document.
  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const pressed = pickAgainPressed(event.target, (id) => {
        const kind = REPORT_KINDS.find((one) => one.id === id);
        if (kind) flow.choose(kind);
      });
      if (pressed) event.stopPropagation();
    },
    true,
  );
  // Before Leaflet's own Escape (the map's keyboard closes a popup), so that Escape with a popup
  // open closes the popup alone (R1-3).
  document.addEventListener(
    'keydown',
    (event) => {
      if (focus.key(event.key, event.shiftKey, document.activeElement)) {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Escape') return;
      // In a field, Escape is the field's.
      const typing = document.activeElement?.closest('input, select, textarea') != null;
      // Another sheet open (the layers'): the key is its own (R2-5).
      const sheetOpen = document.querySelector('.sheet-wrap:not([hidden])') !== null;
      if (!typing && flow.escape(deps.popupOpen(), sheetOpen)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  return {
    /** The phone list's own Report line, put at the top of the list. */
    line,

    /**
     * Shown while the member may report (by `/api/me`, then by each list); step 2 ends where it is
     * not (R1-9: asked at the start of the list's draw, which draws the parties itself).
     */
    refresh(): void {
      const on = offerReport();
      if (!on) focus.close();
      flow.refresh(on);
    },

    /** A form took the hold or let it go. */
    formChanged: () => {
      offerReport();
    },

    picks: (pick: ReportPick) => flow.picks(pick),
    inTools: () => flow.inTools(),
    gymClicked: (gym: MapGym) => flow.gymClicked(gym),
    spotClicked: (
      spot: { id?: string; title?: string; lat: number; lon: number },
      battle = false,
    ) => flow.spotClicked(spot, battle),
    mapClicked: (point: LatLon) => flow.mapClicked(point),
    /** A PokéStop tapped, its dot or its reports' marker (plan 8M-9B, B9). */
    stopClicked: (stop: MapSpot) => flow.stopClicked(stop),
    /** The Report button's step 2 of a max battle (← Pick a Power Spot of the max form, R1-4). */
    pickSpots: () => {
      const max = REPORT_KINDS.find((kind) => kind.id === 'max');
      if (max) flow.choose(max);
    },
  };
}

export type ReportUi = ReturnType<typeof reportUi>;
