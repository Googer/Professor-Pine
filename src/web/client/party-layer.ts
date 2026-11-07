import * as L from 'leaflet';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { PartiesView } from '../../domain/web/party-data.js';
import type { PowerSpotsView } from '../../domain/web/max-data.js';
import type { StopsView } from '../../domain/web/meetup-data.js';
import { NEAREST_COUNT, regionHolding } from './report-flow.js';
import { byId, getJson, say } from './common.js';
import { meetupActions, meetupAtStopBox, meetupHereBox } from './meetup-forms.js';
import { meetupUi } from './meetup-ui.js';
import type { Me } from './notice.js';
import {
  countdown,
  trainPlaces,
  gymOfStop,
  gymRaidsPopup,
  maxPopup,
  meetupPopup,
  partiesAtKey,
  raidsDrawn,
  GroupPicks,
  MapActivity,
  nextPartyMoment,
  Poller,
  pressParty,
  raidPopup,
  raidsAtGyms,
  readOnlyLine,
  trainPopup,
  type ShowContext,
} from './parties.js';
import { listAskLimit, LiveConnection, LiveList, liveSource } from './live.js';
import { RING_TAP_PANE, RING_TAP_PANE_Z, TRAIN_LINE_PANE, TRAIN_LINE_PANE_Z } from './panes.js';
import {
  gymPopup as gymOwnPopup,
  placeHead,
  popupMaxHeight,
  renderNode,
  type MapGym,
  type PageNode,
} from './popup.js';
import {
  FormHold,
  keepClicksInPopup,
  keepingFocus,
  OpenPopup,
  reportOffered,
} from './raid-forms.js';
import { formControls, raidUi } from './raid-ui.js';
import { postFormsUi } from './post-forms-ui.js';
import {
  ANSWER_MS,
  PressAnswers,
  refusalMoves,
  writeAnswer,
  type PressAnswer,
} from './press-answer.js';
import { showsParty } from './post-forms.js';
import { spawnPoint } from './spawn-forms.js';
import { spawnUi } from './spawn-ui.js';
import { maxUi, type MapSpot } from './max-ui.js';
import { reportUi } from './report-ui.js';
import { regionsUi } from './regions-ui.js';
import type { RegionsMineView } from '../../domain/web/region-data.js';
import {
  drawnTrains,
  dropLegs,
  firstStopAtGym,
  firstStopAtSpot,
  holdMap,
  keepTools,
  newTrainButton,
  placedStops,
  trainActions,
  trainHereBox,
  type FirstStop,
} from './train-forms.js';
import { trainUi } from './train-ui.js';
import {
  ARROW_PIXELS,
  arrowElement,
  BADGE_PANE,
  BADGE_PANE_Z,
  badgeAnchor,
  doneFlowLegs,
  legArrows,
  selectedBadges,
  selectedTrainId,
  stopMarkerPixels,
  TRAIN_HIT_PIXELS,
  trainLegs,
  type StopBadge,
  type TrainLeg,
} from './train-line.js';
import { flowDelay } from './train-flow.js';
import { onThemeChange, theme } from './theme.js';
import type { LayerRegistry } from './layer-registry.js';
import { PLACES_FROM, placesWanted } from './cluster.js';
import {
  leadRaid,
  markerSize,
  tapBox,
  type MarkerSize,
  markerNow,
  raidBadge,
  raidMarkerNode,
  ringSizes,
  type RingSize,
} from './raid-marker.js';
import type { DistanceUnits } from './distance.js';
import { WhatIsOn } from './list-ui.js';
import { STREET_ZOOM, withinReach, type LatLon, type ViewStorage } from './view.js';
import { ListRefresh, listLines, paneShows, stopReportLines, waitingNote } from './what-is-on.js';
import {
  trainPlace,
  placeListNode,
  sharedPlace,
  startWords,
  type PlacedThing,
} from './shared-place.js';
import type { MapParty, MapRaid, MapTrain, PostView } from '../../domain/web/party-data.js';
import {
  ALL_RAIDS_HERE,
  gymWithRaidBoxes,
  postPopup,
  raidChoices,
  type PanelsOpen,
  type PlacedContext,
} from './post-draw.js';
import { postTime, readerZone } from './post-time.js';
import { prefetchOrder, PostViews } from './post-views.js';
import { cardWanted, PhoneCard } from './phone-card.js';
import { stopName } from './train-forms.js';
import { stopPlace } from './parties.js';
import type { Place } from './distance.js';
import { stopReportLayer } from './stop-report-layer.js';
import { plainStopPopup, stopPopup, type StopPopupContext } from './stop-popup.js';
import { stopUi } from './stop-report-ui.js';
import { stopFilterUi } from './stop-filter-ui.js';
import { rocketBox } from './rocket-forms.js';
import { rocketUi } from './rocket-ui.js';
import { researchButton, sameTaskButton, type PickedStop } from './research-forms.js';
import { researchUi } from './research-ui.js';
import type { StopReport } from './stop-reports.js';
import type { StopLayer } from './stop-reports.js';
import type { FoundPlacesView } from '../../domain/web/find-data.js';
import { FindSearch, firstFound, foundGroups, type FindState } from './find.js';
import type { ListLine } from './what-is-on.js';

/**
 * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
 * with raids (the picture of its first raid that has one, from the server only), whose popup
 * lists every raid there; trains as lines over their routes with the current stop marked;
 * meetups at their place (plan 8M-5M) and in the side panel, raids at gyms the map does not show
 * there too; every popup and item a
 * tree of nodes set as text (`renderNode`), with the buttons that apply. The list is asked for
 * while the page is visible (`Poller`) every 20 seconds, or while it is live (`live.ts`) at each
 * signal and every 2 minutes, and at once after a press; the browser
 * revalidates it by its ETag (a 304 keeps what it has). A popup open when the list changes is
 * opened again on its new layer. Countdowns run in the page. That the parties are read-only is
 * said on a line of its own (`#read-only`), never in place of what a press answered (`say`).
 */

const EVERY_MS = 20_000;
const COUNTDOWN_MS = 15_000;
/**
 * The posts a list asks for ahead (review 8A-3): those in view first, at most these, well within
 * the post route's 480 a minute (`POSTS_PER_MINUTE`), at a list every 5 seconds on a live map.
 */
export const PREFETCH_POSTS = 20;
/**
 * The pane of the rings of meetups and trains: below Leaflet's markers (600), so that a raid's time
 * badge is drawn over a ring at its gym, and above its overlay pane (400) of the gyms' dots (plan
 * 8M-11A, S2). A ring takes clicks on its line still: it is unfilled, and a marker covers only its
 * own circle.
 */
export const RING_PANE = 'rings';
const RING_PANE_Z = 590;
/** A gym's dot on the map (`main.ts`). */
export const GYM_DOT = { radius: 6, weight: 2 } as const;
/** The ring of a meetup at its place. */
export const MEETUP_RING = ringSizes(undefined).meetup;

/**
 * A flowing path of a train's line (fix round 1 of 8M-13, R1-3): once Leaflet made its element,
 * its animation starts where the clock is in the cycle (`flowDelay`), so that a path drawn anew
 * at each draw of the parties goes on where the one before was. The CSSOM, not a `style`
 * attribute: the CSP lets no inline style in.
 */
function inFlowStep<T extends L.Path>(path: T): T {
  return path.on('add', () => {
    const element = path.getElement();
    if (element && 'style' in element) {
      (element.style as CSSStyleDeclaration).animationDelay = flowDelay(Date.now());
    }
  });
}

/**
 * Where a train is on the map (plan 8S-4): a ring around the gym of its stop, unfilled, so that a
 * click inside it reaches the gym's dot or the marker of its raids, and its line opens the train's
 * popup; on the pane of the rings, under the markers (plan 8M-11A, S2). A train not at a stop yet
 * is a dashed, pale ring at its first gym; drawn in `colour` (the theme's train colour). `interactive` is false while
 * the trains let clicks through (route mode, a meetup's place picked); `renderer` is the rings'
 * SVG renderer on their pane (a canvas would take the clicks inside the ring).
 */
export function trainMarker(
  where: { lat: number; lon: number },
  atStop: boolean,
  interactive: boolean,
  colour: string,
  renderer: L.Renderer,
  // Between the gym's dot and a meetup's ring (plan 8S-4), so that the three at one gym hide none
  // of each other; round a raid's circle where one is drawn at the gym (`ringSizes`, fix round 1).
  size: RingSize = ringSizes(undefined).train,
): L.CircleMarker {
  return L.circleMarker([where.lat, where.lon], {
    ...size,
    renderer,
    color: colour,
    fill: false,
    interactive,
    pane: RING_PANE,
    ...(atStop ? {} : { opacity: 0.6, dashArray: '3 3' }),
  });
}

/**
 * The tap inside a ring (Matt, 2026-10-30): an invisible disc out to the ring's line, never under a
 * tap's size (`tapBox`), on a pane under the dots and markers, whose own taps win.
 */
export function ringTapDisc(
  where: { lat: number; lon: number },
  size: RingSize,
  renderer: L.Renderer,
): L.CircleMarker {
  return L.circleMarker([where.lat, where.lon], {
    radius: tapBox(2 * size.radius + size.weight) / 2,
    stroke: false,
    fillOpacity: 0,
    renderer,
    pane: RING_TAP_PANE,
  });
}

/** Makes the elements of a node; a click on a button in them presses it. */
type Draw = (node: PageNode) => HTMLElement;

/**
 * The layers whose things are drawn at a place, which a tap lists where they share it (plan 8M-7):
 * max battles are the raids' (plan 8M-9A); a stop's reports are research's or Rocket's (plan 8M-9B,
 * B3: a report and a party at one stop, one tap lists both).
 */
export type PlacedLayer = 'raids' | 'trains' | 'meetups' | StopLayer;

/**
 * A raid chosen in the list of a gym's raids (`data-show-raid`; empty: "← All raids here"), in
 * the popup or the phone card that shows it: the choice is kept by gym and the card or popup
 * drawn anew. Not while a form is open (review W-3): drawn anew, the card would lose the form
 * in it; the choices are off then (`formControls`), and a press that came anyway does nothing.
 */
export function chooseRaid(
  choice: string,
  at: {
    editing: boolean;
    cardKey: string | undefined;
    popupKey: string | undefined;
    chosen: Map<number, string>;
    refreshCard(key: string): void;
    updatePopup(): void;
  },
): void {
  if (at.editing) return;
  const gymKey = at.cardKey ?? at.popupKey;
  const gymId = gymKey?.startsWith('gym:') ? Number(gymKey.slice(4)) : undefined;
  if (gymKey === undefined || gymId === undefined) return;
  if (choice === '') at.chosen.delete(gymId);
  else at.chosen.set(gymId, choice);
  if (at.cardKey !== undefined) at.refreshCard(at.cardKey);
  else at.updatePopup();
}

/**
 * A gym's layer (its dot, or the marker of its raids) whose bound popup is opened by our own
 * handler: Leaflet opens a bound popup on a click, and on Enter on a focused marker, before any
 * handler of ours runs, so the handlers `bindPopup` added are taken off and a click or Enter
 * either is taken by `routeClick` (in route mode it adds the gym as a stop: true, no popup) or
 * opens the popup (plan 8M-5). A double click whose clicks route mode took is kept from the map,
 * which would zoom in on it. Call it after `bindPopup`.
 */
export function gymClicks(
  layer: L.Layer,
  routeClick: () => boolean,
  open: () => void = () => layer.openPopup(),
): void {
  layer.off('click').off('keypress');
  /** Whether route mode took the last click: a double click of it is no zoom. */
  let routed = false;
  const clicked = (event: L.LeafletEvent): void => {
    // As Leaflet's own: the click is the layer's, not the map's.
    L.DomEvent.stop(event);
    routed = routeClick();
    if (!routed) open();
  };
  layer.on('click', clicked);
  layer.on('dblclick', (event: L.LeafletEvent) => {
    if (routed) L.DomEvent.stop(event);
  });
  layer.on('keypress', (event: L.LeafletKeyboardEvent) => {
    if (event.originalEvent.key === 'Enter') clicked(event);
  });
}

/**
 * What the map page's gym dots need of the parties: "Report raid" and "Report spawn here", and
 * whether a form is open.
 */
/** What the parties need of the map's frame (plan 8M-7). */
export interface PartyFrame {
  /** The layers: a group of markers per layer, and the list follows them. */
  registry: LayerRegistry;
  /** Called after each draw: the gyms follow (route mode, a place picked, raids drawn). */
  afterDraw: () => void;
  /**
   * Called after a draw of a list the server gave (plan 8M-17), not of the empty one the reports
   * at stops or a change of layers draw before it comes: the page is settled for the map's tour.
   */
  listDrawn?: (list: Pick<PartiesView, 'readOnly'>) => void;
  /** Your location, once the browser said; distances are from the map's middle until then. */
  located: () => LatLon | undefined;
  /** Tells `listener` each new fix of your location. */
  onMove: (listener: () => void) => void;
  /** Where the browser keeps the list's sort. */
  storage: ViewStorage | undefined;
  /** On a phone, the list swapped back for the map before a line is flown to. */
  showMap: () => void;
  /**
   * Find began to show its results, or stopped (plan 8M-12): on a phone the list's sheet opens
   * for them, and closes again where Find opened it.
   */
  finding?: (on: boolean) => void;
  /**
   * A line Find found was picked (plan 8M-12, ruling R1): on a phone the floating box is hidden,
   * its text kept, so that the search button brings it and its results back.
   */
  findPicked?: () => void;
  /** Find's "Back to the list" (branch review BR-3): the box emptied, as its × empties it. */
  findCleared?: () => void;
  /** The text in Find's box now: Find's again once it no longer stands aside (re-review N1). */
  findText?: () => string;
  /**
   * Whether the box thins the gyms changed (`MapRaids.boxThins`, re-review M1): the gyms drawn
   * anew, since their own `input` listener read it before Find took the keystroke.
   */
  boxChanged?: () => void;
  /** The units distances are said in (`settings.distanceUnits`, task 7). */
  units: DistanceUnits;
  /** Route mode began or ended: the dots to add as stops are Tab stops only meanwhile (N1). */
  routeMode?: (on: boolean) => void;
  /** The Report button's step 2 began or ended (plan 8M-9A): the gyms and places it draws follow. */
  placesChanged?: () => void;
  /**
   * Whether a place or a point is picked (`picksPlace`) changed, told as the parties are drawn
   * anew, which every picking does as it starts and ends (plan 8H-4H, review R1: a meetup's place
   * too): the activity layer's circles follow.
   */
  picksChanged?: () => void;
  /** A gym's own popup opened, its dot drawn for it whatever the layer (step 3 of a raid, A6). */
  openGym?: (gym: MapGym) => HTMLElement | undefined;
  /** A Power Spot's popup opened at it (step 3 of a max battle, A6). */
  openSpot?: (spot: MapSpot) => HTMLElement | undefined;
  /**
   * A popup or line of a Power Spot opened (design 2026-11-04): its battle's, or the spot's own
   * in the list of what is on; its address asked for where it has none (`SpotAddresses.fill`).
   */
  spotAddress?: (
    popup: HTMLElement | undefined,
    spot: { id: string | null; address?: string | null },
  ) => void;
  /** Tells `listener` each answer of the Power Spots of the view, or why none came (A4, R1-6). */
  onSpots?: (listener: (spots: readonly MapSpot[] | 'failed' | 'zoom') => void) => void;
  /** A layer's toggle says its filter of the reports at stops, or none (plan 8M-9B, goal 5). */
  filtered?: (layer: StopLayer, words: string | undefined) => void;
  /** Tells `listener` each answer of the PokéStops of the view, or why none came (8M-9B, B9). */
  onStops?: (listener: (stops: readonly MapSpot[] | 'failed' | 'zoom') => void) => void;
  /** A PokéStop's own popup opened at it, whatever the layers draw (step 3 at a stop, B9). */
  openStop?: (stop: MapSpot) => HTMLElement | undefined;
  /**
   * Whether the live map is in use (plan 8M-10, C9): the pollers of the parties and of the
   * reports at stops ask nothing while the region editor is on. Without it, the page's
   * visibility alone.
   */
  activity?: MapActivity;
  /**
   * "Your regions" (plan 8M-20): the member's view of the regions came, or none could be had
   * (undefined): the outlines restyled by it (R14), "Your regions…" offered or not (R11).
   */
  regionsShown?: (view: RegionsMineView | undefined) => void;
  /** A region's outline marked while its row of "Your regions" is hovered; undefined: none. */
  highlightRegion?: (regionId: number | undefined) => void;
}

export interface MapRaids {
  /** Closes the popup and the phone card (plan 8M-17: the map's tour clears the page). */
  closeOpen(): void;
  /** "Your regions…" pressed (plan 8M-20): the box in the side pane, or why not. */
  openRegions(): void;
  /** The first view of "Your regions" asked, settled once it came or failed (B1). */
  regionsLoaded: Promise<unknown>;
  /**
   * "Report raid" and "Report spawn here" for a gym's own popup, when they are offered now
   * (`reportOffered`); none otherwise.
   */
  gymControls(gym: MapGym): HTMLElement[];
  /** A form is open in the popup that is open: its content is held (`heldContent`). */
  editing(): boolean;
  /**
   * A gym clicked on the map: in route mode it is added as the next stop of the train being
   * arranged, and true says its popup is not wanted (plan 8M-5).
   */
  gymClicked(gym: MapGym): boolean;
  /**
   * A Power Spot of the map's layer tapped: in the Report button's step 2 of a max battle it goes on
   * to step 3, of a spawn its place is the point (plan 8M-9A); in route mode it is added as the next
   * stop of the train being arranged (plan 8M-8C, R5). True says its popup is not wanted.
   */
  spotClicked(spot: { id: string; title: string; lat: number; lon: number }): boolean;
  /**
   * A gym is to be clicked (route mode, a meetup's place picked): the map draws every gym,
   * whatever the Gyms layer (plan 8M-7).
   */
  forced(): boolean;
  /** The gyms whose raids are drawn in place of their dot (plan 8M-7). */
  raidGyms(): readonly number[];
  /**
   * A gym's dot tapped (not taken by route mode or a place picked): the list of the things at its
   * place where parties share it (plan 8M-7), else `own`, its own popup.
   */
  gymTapped(gym: MapGym, own: () => void): void;
  /** A PokéStop's or Power Spot's dot tapped: `own`, or the list of what is at its place. */
  placeTapped(
    layer: 'stops' | 'spots',
    place: { id: string; title: string; lat: number; lon: number },
    own: () => void,
  ): void;
  /**
   * What a Power Spot's popup offers (plan 8M-9A): "Report max battle here" while it is offered
   * now (`reportOffered`); none otherwise.
   */
  spotControls(spot: MapSpot): HTMLElement[];
  /** A Power Spot's popup without its controls (`placeHead`). */
  spotPopup(spot: MapSpot & { address?: string | null }): HTMLElement;
  /** The Power Spots whose battle is drawn in place of their dot (A6). */
  battleSpots(): ReadonlySet<string>;
  /**
   * The battle that stands at a Power Spot opened on its own marker, the raids drawn while it
   * shows (true); false where none stands (review B1: a tap of the spot's dot, Raids off).
   */
  openBattle(spotId: string): boolean;
  /**
   * A PokéStop of the map's layer tapped: in the Report button's step 2 of a spawn or a max battle
   * the pin at its place (review B6), as a gym tapped is; true says its popup is not wanted.
   */
  stopTapped(stop: MapSpot): boolean;
  /**
   * The PokéStops or Power Spots are to be tapped (the Report button's step 2, A4): drawn whatever
   * their layer says, as `forced` draws the gyms.
   */
  forcedPlaces(layer: 'stops' | 'spots'): boolean;
  /**
   * Whether a place or a point is being picked (a meetup's place, the Report button's step 2,
   * research's stops, route mode): the activity layer's circles take no tap meanwhile (plan
   * 8H-4H, review P4); the page is told of a change by `picksChanged` (review R1).
   */
  picksPlace(): boolean;
  /** Whether the raids are drawn: their layer on, or a raid's step 2 picking gyms (C1). */
  raidsShown(): boolean;
  /**
   * The PokéStops whose reports are drawn in place of their dot (plan 8M-9B: one marker per stop),
   * by their keys as `/api/stops` names them.
   */
  reportStops(): ReadonlySet<string>;
  /**
   * A PokéStop's popup without reports (plan 8M-9B, B11): its name, how far it is, Directions,
   * and the stop's own actions; its clicks the parties' own.
   */
  stopPopup(stop: { id: string; title: string; lat: number; lon: number }): HTMLElement;
  /**
   * Find's box changed (plan 8M-12): from two letters, after the pause, its results in the list
   * pane; under two, the list as it was.
   */
  find(text: string): void;
  /** Enter in Find's box: the first result picked (once the places come, where none was yet). */
  findFirst(): void;
  /** Whether Find holds a search now (its results shown in the list pane). */
  finding(): boolean;
  /**
   * Whether Find stands aside (branch review BR-1): a gym is to be clicked (route mode, a
   * meetup's place, the Report button's step 2: `forced`) or a form holds the side pane, where
   * the list is hidden. The box is "Find a gym" meanwhile: it thins the gyms, Find takes no word.
   */
  findOff(): boolean;
  /**
   * Whether the box thins the gyms (re-review N1): only while Find stands aside and holds no
   * search, that is, by text typed meanwhile (a keystroke then ends Find's search); a search left
   * in the box thins nothing, so every gym is there to be tapped.
   */
  boxThins(): boolean;
}

/**
 * The marker of a gym's raids (plan 8M-7: `icon`, the first raid's circle of `raidMarkerNode`:
 * its picture in a ring of its tier's color, the time badge, the count going), centered on the
 * gym, named by the lead raid's `heading` (`name`, its `title`; review fix 9); its popup bound
 * by `bind` (the layer's `withPopup`), its clicks taken by `gymClicks` (in route mode a gym with raids is a stop to add like any other, its popup not opened; while a
 * meetup's place is picked, it is the place; else `open`, which lists the things at its place
 * when it shares it). It listens for no `contextmenu`:
 * Leaflet gives a layer a mouse event only when the layer listens for it, so a right click or a
 * long press on a raid's picture or dot reaches the map's own handler, at the pointer, which
 * opens the spawn form there (plan 8M-6; `party-layer-contextmenu.isolated.test.ts`).
 */
export function raidsMarker(
  gym: { lat: number; lon: number },
  icon: L.DivIcon,
  name: string,
  bind: (marker: L.Marker) => L.Marker,
  routeClick: () => boolean,
  open?: () => void,
): L.Marker {
  // Named for a screen reader by the lead raid's heading (review fix 9): Leaflet sets it as the
  // icon's `title`, as text.
  const marker = L.marker([gym.lat, gym.lon], { icon, keyboard: true, title: name });
  bind(marker);
  gymClicks(marker, routeClick, open);
  return marker;
}

/**
 * The marker of a number on a stop of the selected train: its number (`.number`) in a square of
 * its size placed by `anchor` (`badgeAnchor`), on the numbers' pane above every marker and dot.
 * It takes no tap (`interactive: false`, the pane and `map.css`): a tap goes through to what is
 * under it, so a marker or dot keeps its own and tapping another thing changes the selection.
 */
export function badgeMarker(
  badge: StopBadge,
  numberPixels: number,
  anchor: [number, number],
): L.Marker {
  const number = document.createElement('span');
  number.className = 'number';
  number.textContent = String(badge.number);
  return L.marker([badge.lat, badge.lon], {
    icon: L.divIcon({
      html: number,
      className: 'train-badge',
      iconSize: [numberPixels, numberPixels],
      iconAnchor: anchor,
    }),
    pane: BADGE_PANE,
    interactive: false,
    keyboard: false,
  });
}

/** A raid's circle in pixels at a size of its marker (Matt, 2026-10-25). */
function circleOf(
  size: MarkerSize,
  sizes: { raidFull: number; raidMiddle: number; raidSmall: number },
): number {
  return size === 'full' ? sizes.raidFull : size === 'middle' ? sizes.raidMiddle : sizes.raidSmall;
}

/** The icon of a raid's marker: an element of ours (`raidMarkerNode`), never a string. */
export function raidIcon(element: HTMLElement, circle: number, max = false): L.DivIcon {
  // Never a tap target under 32 pixels: a clear margin round a small circle (`tapBox`).
  const box = tapBox(circle);
  return L.divIcon({
    html: element,
    // A max battle's (plan 8M-9A) is told apart for the Report button's step 2 (`map.css`).
    className: max ? 'raid-icon max-icon' : 'raid-icon',
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    popupAnchor: [0, -circle / 2],
  });
}

/** Whether the map is in use by the page's visibility alone (no region editor on the page). */
/** The part of an open popup that scrolls, Leaflet's. */
function popupContent(popup: L.Popup | undefined): Element | null | undefined {
  return popup?.getElement()?.querySelector('.leaflet-popup-content');
}

/** Draws a popup anew where it is scrolled: Leaflet lets its height go to measure it, losing that. */
function updateKeepingScroll(popup: L.Popup): void {
  const content = popupContent(popup);
  const scroll = content?.scrollTop;
  popup.update();
  if (content && scroll !== undefined) content.scrollTop = scroll;
}

function visibleActivity(): MapActivity {
  const activity = new MapActivity(() => document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', () => {
    activity.changed();
  });
  return activity;
}

/**
 * `mayReport`: a member who may report raids and spawns by what `/api/me` said at the load (not
 * while the map is read-only), who gets "Report raid" and "Report spawn here" also in the popups
 * of gyms that show raids, and the spawn form on a long press or right click on the map (plan
 * 8M-4S); from the first list on, it follows whether the list is read-only (`reportOffered`).
 * `regions` are the server's regions with their outlines, which say where a point lies.
 */
export function showParties(
  map: L.Map,
  guild: string,
  me: Extract<Me, { loggedIn: true }>,
  gyms: ReadonlyMap<number, MapGym>,
  regionNames: ReadonlyMap<number, string>,
  regions: GeoView['regions'],
  mayReport: boolean,
  frame: PartyFrame,
): MapRaids {
  const { registry, afterDraw } = frame;
  // Whether the lists are asked for (plan 8M-10): the page's own, else the page's visibility.
  const activity = frame.activity ?? visibleActivity();
  // One group per layer of the registry (plan 8M-7): on the map while the layer is on.
  const groups = { raids: L.layerGroup(), trains: L.layerGroup(), meetups: L.layerGroup() };
  for (const [id, group] of Object.entries(groups)) {
    if (registry.isOn(id)) group.addTo(map);
  }
  /**
   * The parties' list until the first one comes (review F11: the reports at stops are drawn
   * without it): none of them, reports offered as at the load (`reportOffered`), and the map not
   * said to be read-only for it.
   */
  const noParties: PartiesView = {
    zone: 'UTC',
    readOnly: !mayReport,
    raids: [],
    maxes: [],
    trains: [],
    meetups: [],
  };
  /**
   * The reports at stops (plan 8M-9B): their own poll, drawn with the parties (one hold, one
   * redraw, one list of the things at a place).
   */
  const stopReports = stopReportLayer({
    map,
    guild,
    registry,
    activity,
    spread: () => live.latestSpread,
    stopped: () => {
      live.stop();
    },
    // Not waiting for the parties' list (review F11): until it comes, drawn with none.
    redraw: () => {
      redrawParties();
    },
  });
  /**
   * The parties drawn anew with the list the page has (none until the first comes, review F11):
   * for the reports at stops, a layer, a filter, the zoom, the theme. Under a form a newer list
   * that waits keeps its place (branch review W1, `FormHold.redraw`); only the parties' poll gives
   * a new one (`hold.shown`).
   */
  const redrawParties = (): void => {
    // A list that came while the region editor was on is the newest (W1).
    hold.redraw(() => hiddenDraw ?? view ?? noParties);
  };
  /** The party the Report button's step 3 opened (R2-1), by its popup's key, while it shows. */
  let openedForStep3: string | undefined;
  /** That party is being opened: the parties drawn with it before its popup opens (R3-1). */
  let openingStep3 = false;
  /**
   * Whether a layer's things are drawn: the layer is on; for the raids also (`raidsDrawn`) while
   * the Report button's step 2 of a raid picks gyms (C1), and while the party its step 3 opened is
   * shown in a popup or the card (R2-1); as the layer says once they end.
   */
  const layerShown = (id: string): boolean =>
    id === 'raids'
      ? raidsDrawn({
          layerOn: registry.isOn('raids'),
          picking: report.picks('gyms'),
          opened: openedForStep3,
          opening: openingStep3,
          shown: [showing.key, card.key],
        })
      : registry.isOn(id);
  const raidsShown = (): boolean => layerShown('raids');
  /**
   * The party step 3 opened is no longer shown: the raids' layer as its toggle says again; after
   * Leaflet's handling of the close (or the card's opening in its place on a phone).
   */
  const openedClosed = (): void => {
    if (openedForStep3 === undefined) return;
    window.setTimeout(() => {
      const key = openedForStep3;
      if (key === undefined || showing.key === key || card.key === key) return;
      openedForStep3 = undefined;
      // Drawn anew as the Raids toggle draws them (R3-1): spots, gyms and rings as the layer says.
      redrawParties();
    }, 0);
  };
  registry.onChange((id) => {
    // The reports at stops are drawn with the parties (plan 8M-9B): a stop's marker holds both.
    if (id === 'research' || id === 'rocket') redrawParties();
    const group = (groups as Record<string, L.LayerGroup | undefined>)[id];
    if (!group) return;
    if (layerShown(id)) group.addTo(map);
    else group.remove();
    counted();
    // The rings go round a raid's circle only while raids are shown (`ringSizes`).
    if (id === 'raids') redrawParties();
  });
  /** How many of each layer's things are in view, for the sheet of the layers. */
  const counted = (): void => {
    const view = map.getBounds();
    for (const [id, group] of Object.entries(groups)) {
      let count = 0;
      group.eachLayer((layer) => {
        if (
          (layer instanceof L.Marker || layer instanceof L.CircleMarker) &&
          // A ring's tap disc is no thing of its own (`ringTapDisc`).
          layer.options.pane !== RING_TAP_PANE &&
          view.contains(layer.getLatLng())
        )
          count += 1;
      });
      registry.setCount(id, count);
    }
  };
  map.on('moveend', counted);
  // Leaflet sets the pane's place by its style from the script (no style element).
  map.createPane(RING_PANE).style.zIndex = String(RING_PANE_Z);
  // The selected train's numbers above everything drawn on the map, taking no taps.
  const badgesPane = map.createPane(BADGE_PANE);
  badgesPane.style.zIndex = String(BADGE_PANE_Z);
  badgesPane.style.pointerEvents = 'none';
  // The rings are SVG whatever the map prefers: a canvas takes a click inside an unfilled circle
  // as the circle's, and the gym's marker inside would get none.
  const rings = L.svg({ pane: RING_PANE });
  map.createPane(RING_TAP_PANE).style.zIndex = String(RING_TAP_PANE_Z);
  const ringTaps = L.svg({ pane: RING_TAP_PANE });
  // A train's line under the places' dots (review SEL-1): each draw adds it anew, and on the
  // overlay pane, the dots' one SVG, it would come over the dots a draw leaves in place.
  map.createPane(TRAIN_LINE_PANE).style.zIndex = String(TRAIN_LINE_PANE_Z);
  const lineRenderer = L.svg({ pane: TRAIN_LINE_PANE });
  /** What every path of a train's line is drawn on. */
  const onLinePane = { pane: TRAIN_LINE_PANE, renderer: lineRenderer };
  const panel = byId('parties');
  /** The trains' box at the top of the side panel: "New train", or the form or editor open. */
  const tools = document.createElement('div');
  tools.className = 'train-tools';
  tools.append(renderNode(newTrainButton(), document));
  const readOnly = byId('read-only');
  let csrf = me.csrf;
  let shown = '';
  let view: PartiesView | undefined;
  /** A draw asked for while the region editor was on (W1): drawn once it is off. */
  let hiddenDraw: PartiesView | undefined;
  /**
   * The popup that is open, whose size follows a form drawn into it, and its layer's key, to open
   * it again after a redraw.
   */
  const showing = new OpenPopup<L.Popup>();
  /**
   * A raid form is open, one at a time: the popup's content is held (Leaflet's `update()` would
   * draw it anew and wipe the form), the list is not drawn anew under it but once it closes
   * (after its popup closed, once Leaflet is through with the close), and the controls that open
   * the other forms are off meanwhile. Under a form of the trains' box (the start form, route
   * mode), which a redraw keeps, the list is drawn (`aside`).
   */
  const hold = new FormHold<PartiesView>({
    draw: (next) => {
      // The live map hidden under the region editor is not drawn (branch review W1: no size,
      // no posts asked for): the last list waits, and is drawn once the editor is off.
      if (activity.editingRegions()) {
        hiddenDraw = next;
        return;
      }
      hiddenDraw = undefined;
      redraw(next);
    },
    popup: () => {
      const { popup } = showing;
      if (!popup) return undefined;
      return {
        update: () => {
          keepingFocus(document, () => {
            updateKeepingScroll(popup);
          });
        },
      };
    },
    later: (run) => {
      window.setTimeout(run, 0);
    },
    controls: (on) => {
      formControls(document, on);
    },
    // A form took the hold or let it go (fix round 1): the pane shows the form or the list, and
    // what waited of the list is drawn; Find takes the box back where it stood aside (N1).
    changed: () => {
      paneShown();
      listRefresh.released();
      findFollows();
      report.formChanged();
    },
  });
  const popups = new Map<string, L.Layer>();

  /**
   * The reports at stops' controls (plan 8M-9B): Take back, held as the other forms; after it, the
   * reports asked for at once.
   */
  const stopControls = stopUi({
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    hold,
    refresh: () => stopReports.now(),
  });
  /**
   * Team GO Rocket's form in a stop's popup or card (plan 8M-9B, goal 9): after a report, the
   * reports at once, then the stop's popup (B15: after the poll, not from the answer).
   */
  const rocketForms = rocketUi({
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    hold,
    done: async (stopKey) => {
      await stopReports.now();
      if (stopKey !== undefined) popups.get(`stop:${stopKey}`)?.openPopup();
    },
  });
  /**
   * Where the nearest places' distances are from: your location only where the map may go
   * (review B5, as `startView` takes it), else the map's middle; step 2 of a max battle flies
   * there.
   */
  const origin = (): LatLon => {
    const center = map.getCenter();
    const at = frame.located();
    return at && withinReach(regions, at) ? at : { lat: center.lat, lon: center.lng };
  };
  /**
   * "Your regions" (plan 8M-20): the member's view of the regions, asked as the party layer is
   * made (and again when the list comes back from read-only, B10), and its box in the side pane,
   * an aside claim of the hold; a change asks the parties again.
   */
  const regionsBox = regionsUi({
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    hold,
    tools,
    idle: () => {
      tools.replaceChildren(renderNode(newTrainButton(), document));
    },
    names: regionNames,
    shown: (regionsView) => {
      frame.regionsShown?.(regionsView);
    },
    highlight: (regionId) => {
      frame.highlightRegion?.(regionId);
    },
    partiesChanged: () => {
      void poller.now();
    },
    // The side pane shows the box while it is open, the list again once it closes (B4).
    redrawn: () => {
      redrawParties();
    },
    closePopup: () => {
      map.closePopup();
      card.close();
    },
    // Escape is a popup's, the card's, the layers' sheet's or the tour's while one is open (B3).
    escapeTaken: () =>
      showing.popup !== undefined ||
      card.key !== undefined ||
      document.querySelector('.sheet-wrap:not([hidden]), .tour:not([hidden])') !== null,
    outlinesShown: () => registry.isOn('outlines'),
    nextFrame: (run) => {
      requestAnimationFrame(run);
    },
    focusBack: () => {
      document.querySelector<HTMLElement>('#account summary')?.focus();
    },
    ask: (url) => getJson(url),
    post: async (url, token, body) => {
      const reply = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
        body: JSON.stringify(body),
      });
      return { status: reply.status, body: (await reply.json().catch(() => undefined)) as unknown };
    },
    me: () => getJson<Me>(`/s/${guild}/api/me`),
    say,
  });
  // The first view's answer, which the tour that opens by itself waits for (B1).
  const regionsLoaded: Promise<unknown> = mayReport ? regionsBox.load() : Promise.resolve();
  // Back on the map's tab (Matt, 2026-11-07): a role changed on Discord meanwhile is drawn
  // without a reload; not while the list is read-only, which asks it as it comes back (B10).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !mayReport || view?.readOnly === true) return;
    void regionsBox.again();
  });
  /**
   * Field research's form in the side pane (plan 8M-9B, goals 7 and 8, B8): after a report, the
   * reports at once, then the first stop's popup (B15).
   */
  const researchForms = researchUi({
    // The research reports the map has: a stop holding the form's task is not offered (S18).
    research: () => stopReports.view?.research ?? [],
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    hold,
    tools,
    closePopup: () => {
      map.closePopup();
      card.close();
    },
    done: async (stopKey) => {
      await stopReports.now();
      if (stopKey !== undefined) popups.get(`stop:${stopKey}`)?.openPopup();
    },
    // "Add stops…": the stops drawn whatever their layer and ringed, the reports' markers taking
    // taps, the docked pane shown (B9's picking, as the Report button's step 2).
    picking: (on) => {
      const container = map.getContainer();
      container.classList.toggle('report-picking', on);
      container.classList.toggle('pick-stops', on);
      frame.placesChanged?.();
      redrawParties();
    },
    // Branch review W6: to the zoom the PokéStops are drawn from, as step 2 flies; at the form's
    // last stop (re-review X2, Matt 2026-10-27), else in place.
    zoomIn: (at, landed) => {
      const center = map.getCenter();
      map.once('moveend', landed);
      map.flyTo(
        at ? [at.lat, at.lon] : [center.lat, center.lng],
        Math.max(map.getZoom(), PLACES_FROM),
      );
    },
    onStops: (listener) => {
      frame.onStops?.(listener);
    },
    origin,
    units: frame.units,
  });
  /**
   * A PokéStop tapped, its dot or its reports' marker: added by the research form's "Add stops…",
   * else the Report button's step 2's (step 3 of a report at a stop, a pin of a spawn or a max
   * battle); true: its popup is not wanted.
   */
  const stopClicked = (stop: MapSpot): boolean =>
    researchForms.stopClicked(stop) || report.stopClicked(stop);
  /**
   * What a stop's popup needs of the map now: the clock, your location, the units, and for a
   * member who may report (not read-only, as 8M-9A's `reportOffered`) its own actions and a
   * research report's "Same task at more stops…" (B15: offered once the poll shows the report).
   */
  const stopContext = (stop: PickedStop): StopPopupContext => {
    const offered = reportOffered(mayReport, view);
    return {
      now: Date.now(),
      zone: readerZone(),
      located: frame.located(),
      units: frame.units,
      actions: offered ? [researchButton(stop), rocketBox(stop), meetupAtStopBox(stop)] : [],
      more: (report, kind) => (offered && kind === 'research' ? [sameTaskButton(report)] : []),
    };
  };
  /** A Power Spot's popup without its controls: how every place's opens. */
  const spotHead = (spot: {
    title: string;
    address?: string | null;
    lat: number;
    lon: number;
  }): PageNode => ({
    tag: 'div',
    className: 'place-popup',
    children: placeHead(
      { name: spot.title, address: spot.address ?? null, lat: spot.lat, lon: spot.lon },
      { located: frame.located(), units: frame.units },
    ),
  });
  /** A report shown by its id (an ended one too: its popup stays, B14). */
  const stopReportById = (id: string | undefined): StopReport | undefined => {
    const reports = stopReports.view;
    if (id === undefined || !reports) return undefined;
    return [...reports.research, ...reports.grunts, ...reports.hideouts].find(
      (report) => String(report.id) === id,
    );
  };

  /**
   * A gym clicked on the map: while a meetup's place is picked it is the place, in route mode the
   * next stop; true when its popup is not wanted. While the research form's "Add stops…" picks
   * stops, taken and nothing done (review F9: dimmed, as in the Report button's step 2).
   */
  const gymClicked = (gym: MapGym): boolean =>
    researchForms.adding() ||
    report.gymClicked(gym) ||
    meetupForms.gymClicked(gym) ||
    trainForms.gymClicked(gym);

  const context = (): ShowContext => ({
    now: Date.now(),
    zone: readerZone(),
    gym: (id) => (id === null ? undefined : gyms.get(id)),
  });

  /**
   * The parties' posts the page has (plan 8M-8A): asked for by their keys as their popups are
   * drawn; one that comes draws the popup that shows its party anew (not under a form).
   */
  /** The spread of the signal that caused the list about to be drawn; none otherwise. */
  let listSpread: number | undefined;
  const postViews = new PostViews({
    active: () => activity.active(),
    setTimer: (run, ms) => {
      const timer = window.setTimeout(run, ms);
      return () => {
        window.clearTimeout(timer);
      };
    },
    load: async (id, key) => {
      const answer = await fetch(
        `/s/${guild}/api/parties/${encodeURIComponent(id)}/post?k=${encodeURIComponent(key)}`,
        { credentials: 'same-origin' },
      );
      return answer.ok ? ((await answer.json()) as PostView) : undefined;
    },
    loaded: (id) => {
      if (hold.editing) return;
      // Which popup or card shows the party: the one rule (`showsParty`, review N-3).
      const party = partyById(id);
      const showsIt = (key: string | undefined): boolean =>
        party !== undefined && key !== undefined && showsParty(key, party);
      const shown = showing.popup;
      if (showsIt(showing.key) && shown) {
        // Drawn anew where it stands: the map does not pan for the post (review 8A-3).
        const { autoPan } = shown.options;
        shown.options.autoPan = false;
        updateKeepingScroll(shown);
        shown.options.autoPan = autoPan;
      }
      // A line of the list shown with its popup draws it anew (review 8A-9).
      for (const kind of ['raid', 'max', 'train', 'meetup']) whatIsOn.redrawLine(`${kind}:${id}`);
      const onCard = card.key;
      if (onCard !== undefined && showsIt(onCard)) card.refresh(contents.get(onCard));
    },
  });

  /** Where a party is on the map, for its popup's line (distance, Directions). */
  const placeOf = (party: MapParty): Place | undefined => {
    switch (party.kind) {
      case 'raid':
        return (
          (party.gymId === null ? undefined : gyms.get(party.gymId)) ?? party.place ?? undefined
        );
      case 'max':
        return party.place;
      case 'train':
        return party.stop === null ? undefined : stopPlace(party, party.route[party.stop], gyms);
      case 'meetup': {
        const { place } = party;
        if (!place) return undefined;
        return (place.gymId === null ? undefined : gyms.get(place.gymId)) ?? place;
      }
    }
  };

  /** What a post's popup needs of the map for this party. */
  const placedFor = (party: MapParty): PlacedContext => ({
    now: Date.now(),
    origin: location.origin,
    guild,
    ...(panelsOpen.has(party.id) ? { opened: panelsOpen.get(party.id) } : {}),
    ...answerOf(party.id),
    stopName: (key) =>
      stopName(gyms.get(Number(key)), key, party.kind === 'train' ? party.spots : []),
    place: placeOf(party),
    located: frame.located(),
    units: frame.units,
  });

  /**
   * A party's popup (plan 8M-8A): its post as Discord shows it, with the member's part and the
   * map's line, once the page has the post; until then (or for a party whose post was not shown
   * yet) the map's own summary as before (`fallback`).
   */
  const partyPopup = (
    party: MapParty,
    fallback: () => PageNode,
    extras: readonly PageNode[] = [],
  ): PageNode => {
    const shown = postViews.of(party);
    return shown ? postPopup(shown, party, placedFor(party), extras) : fallback();
  };

  /** Asks ahead for the posts of the parties a popup's key shows (`partiesAtKey`, review 8A-3). */
  const prefetchKey = (key: string): void => {
    const shown = partiesAtKey(view, key);
    postViews.prefetch(shown, shown.length);
  };

  /** Which raid's post a gym of several raids shows, by gym; none: the list of them. */
  const chosenRaid = new Map<number, string>();
  /** Whether the next list drawn is the page's first (review N6). */
  let firstList = true;
  /** What is open under each party's post, by party (review 8A-10), kept across redraws. */
  const panelsOpen = new Map<string, PanelsOpen>();
  /** The answers of the member's presses, by party, kept across redraws (plan 8M-11A, S9). */
  const answers = new PressAnswers(() => Date.now());
  /** A party's answer for its post's context, while it is kept. */
  const answerOf = (partyId: string): { answer?: PressAnswer } => {
    const answer = answers.of(partyId);
    return answer === undefined ? {} : { answer };
  };
  /**
   * An answer of a press or a form on a party (plan 8M-11A, S9, S20): kept for its post's answer
   * line, written into the lines drawn now (the notice where the party shows none: its popup not
   * drawn from its post yet), its popup shaken or its card nudged for a refusal (plan 8M-13, A2:
   * the card that shows the party, though the control pressed was drawn anew), and taken out of the lines
   * after `ANSWER_MS` unless a newer one came.
   */
  const answered = (partyId: string, answer: PressAnswer, from: Element): void => {
    answers.set(partyId, answer);
    if (!writeAnswer(document, partyId, answer)) say(answer.text);
    if (!answer.ok) refusalMoves(from, partyId, card);
    window.setTimeout(() => {
      if (answers.of(partyId) === undefined) writeAnswer(document, partyId, undefined);
    }, ANSWER_MS);
  };

  /**
   * A gym's raids' popup: the one raid's post, or with several the list of their heading lines,
   * each opening its post with a way back to the list (ruling 14); then `extras`.
   */
  const gymPopup = (
    gymId: number,
    raids: readonly MapRaid[],
    extras: readonly PageNode[],
  ): PageNode => {
    const several = raids.length > 1;
    const chosen = several ? raids.find((raid) => raid.id === chosenRaid.get(gymId)) : raids[0];
    if (!chosen) {
      const now = Date.now();
      return raidChoices(
        gyms.get(gymId)?.name ?? 'Unknown gym',
        raids.map((raid) => ({
          id: raid.id,
          picture: raid.picture,
          heading: raid.heading,
          time: raidBadge(raid, now, readerZone()),
        })),
        extras,
      );
    }
    return partyPopup(
      chosen,
      () =>
        gymRaidsPopup(gymId, [chosen], context(), [
          ...(several ? [ALL_RAIDS_HERE] : []),
          ...extras,
        ]),
      [...(several ? [ALL_RAIDS_HERE] : []), ...extras],
    );
  };

  /** A party of the list by its id, of any kind. */
  const partyById = (id: string): MapParty | undefined =>
    [
      ...(view?.raids ?? []),
      ...(view?.maxes ?? []),
      ...(view?.trains ?? []),
      ...(view?.meetups ?? []),
    ].find((party) => party.id === id);

  /**
   * The post's controls that open a dialog on Discord, as the map's forms (plan 8M-8B): in the
   * place of the post, held like the other forms; after one went through, the list at once.
   */
  const postForms = postFormsUi({
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    hold,
    origin: () => location.origin,
    times: () => ({ now: Date.now() }),
    done: async () => {
      await poller.now();
    },
    // Only the popup or card that shows the party closed (review W-6).
    // The party the form holds (review N-3), not looked up in a list a poll may have changed.
    closeParty: (party) => {
      if (showing.key !== undefined && showsParty(showing.key, party)) map.closePopup();
      if (card.key !== undefined && showsParty(card.key, party)) card.close();
    },
    answered: (party, answer, from) => {
      answered(party.id, answer, from);
    },
    // A refusal said under a form that stays: its card nudged, its popup shaken (plan 8M-13, A2).
    refused: (party, form) => {
      refusalMoves(form, party.id, card);
    },
  });

  const press = async (button: HTMLButtonElement): Promise<void> => {
    const { party, action } = button.dataset;
    if (party === undefined || action === undefined) return;
    // The group a newcomer chose in the popup (plan 8X-1B), with Interested, Join and Here;
    // empty for any group with room. A button of its own group (drawn before) names it. In a
    // post (plan 8M-8A) the menu is in the member's part under its buttons: the whole popup is
    // the scope, and its buttons are off while the press is on its way.
    const scope = button.closest('.post-popup') ?? button.parentElement;
    const picked = scope?.querySelector<HTMLSelectElement>('select[data-group-pick]');
    const asks = action === 'interested' || action === 'join' || action === 'here';
    const group = button.dataset.group ?? (asks && picked?.value ? picked.value : undefined);
    // An answer to the completion question (plan 8M-8B): "Yes, done" or "Not yet".
    const sent =
      action === 'answer'
        ? { yes: button.dataset.yes === 'true' }
        : group === undefined
          ? {}
          : { group };
    const buttons = [...(scope?.querySelectorAll('button') ?? [])].filter((each) => !each.disabled);
    for (const each of buttons) each.disabled = true;
    const pressed = await pressParty(csrf, {
      post: async (token) => {
        const answer = await fetch(
          `/s/${guild}/api/parties/${encodeURIComponent(party)}/${encodeURIComponent(action)}`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
            body: JSON.stringify(sent),
          },
        );
        const body = (await answer.json().catch(() => undefined)) as unknown;
        return { status: answer.status, body };
      },
      me: () => getJson<Me>(`/s/${guild}/api/me`),
    });
    csrf = pressed.csrf;
    for (const each of buttons) each.disabled = false;
    // In the post's answer line, where the member looks (plan 8M-11A, S9); a refusal shakes.
    answered(
      party,
      { text: pressed.text, ok: pressed.ok },
      button.isConnected ? button : (scope ?? button),
    );
    await poller.now();
  };

  /** The group a member chose in each party's menu, carried across draws. */
  const groupPicks = new GroupPicks();
  const draw: Draw = (node) => {
    const element = renderNode(node, document);
    groupPicks.carry(element);
    element.addEventListener('change', (event) => {
      if (!(event.target instanceof Element)) return;
      const menu = event.target as HTMLSelectElement;
      const party = menu.dataset.groupPick;
      if (party !== undefined) groupPicks.chose(party, menu.value);
    });
    // A place's or post's picture that does not load is left out, not drawn broken (review
    // 8A-15). (`error` does not bubble: caught on the way down.)
    element.addEventListener(
      'error',
      (event) => {
        if (event.target instanceof HTMLImageElement && event.target.classList.contains('beside')) {
          event.target.hidden = true;
        }
      },
      true,
    );
    element.addEventListener('click', (event) => {
      // A button, or what is drawn in it (the list of things at one place: a picture, words).
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.open !== undefined) {
        const open = choices.get(target.dataset.open);
        map.closePopup();
        open?.();
      } else if (target.dataset.changeRaid !== undefined) raidForms.changeClicked(target);
      else if (target.dataset.report !== undefined) {
        const gym = gyms.get(Number(target.dataset.report));
        if (gym) raidForms.reportClicked(target, gym);
      } else if (target.dataset.spawn !== undefined) {
        const gym = gyms.get(Number(target.dataset.spawn));
        if (gym) spawnForms.spawnClicked(target, gym);
      } else if (target.dataset.meetupHere !== undefined) {
        const gym = gyms.get(Number(target.dataset.meetupHere));
        if (gym) meetupForms.meetupHereClicked(gym, target);
      } else if (target.dataset.trainHere !== undefined) {
        const gym = gyms.get(Number(target.dataset.trainHere));
        if (gym) trainHereAt(firstStopAtGym(gym), gym, target);
      } else if (target.dataset.editMeetup !== undefined) {
        const meetup = view?.meetups.find((each) => each.id === target.dataset.editMeetup);
        if (meetup) meetupForms.editClicked(target, meetup);
      } else if (
        target.dataset.routeTrain !== undefined ||
        target.dataset.conductor !== undefined
      ) {
        const id = target.dataset.routeTrain ?? target.dataset.train;
        const train = view?.trains.find((each) => each.id === id);
        if (train) trainForms.actionClicked(target, train);
      } else if (target.dataset.moveTrain !== undefined) {
        // A train's Move… (plan 8M-8C, R1): the post's dialog as a form in the place of the post.
        const party = partyById(target.dataset.moveTrain);
        if (party) postForms.moveClicked(target, party);
      } else if (target.dataset.regroup !== undefined) {
        // Group… (plan 8M-8B): its form in the place of the post.
        const party = partyById(target.dataset.regroup);
        if (party) postForms.regroupClicked(target, party);
      } else if (target.dataset.meet !== undefined) {
        // Meet… (plan 8M-8B): its form, from what the server offers now.
        const party = partyById(target.dataset.meet);
        if (party) postForms.meetClicked(target, party);
      } else if (target.dataset.splitTrain !== undefined) {
        // A train's Split… (plan 8M-8C): the post's dialog as a form in the place of the post.
        const party = partyById(target.dataset.splitTrain);
        if (party) postForms.splitClicked(target, party);
      } else if (target.dataset.manageTrain !== undefined) {
        // A train's Manage… (plan 8M-8C): the post's dialog as a form in the place of the post.
        const party = partyById(target.dataset.manageTrain);
        if (party) postForms.manageClicked(target, party);
      } else if (target.dataset.closeParty !== undefined) {
        // Staff's Delete… (plan 8M-8B): `/delete`'s question in the place of the post.
        const party = partyById(target.dataset.closeParty);
        if (party) postForms.closeClicked(target, party);
      } else if (target.dataset.reportParty !== undefined) {
        // Report… (plan 8M-8B): `/report`'s form in the place of the post.
        const party = partyById(target.dataset.reportParty);
        if (party) postForms.reportClicked(target, party);
      } else if (target.dataset.reportResearch !== undefined) {
        // "Report research here" (plan 8M-9B): the research form in the place of the control.
        researchForms.researchClicked(target);
      } else if (target.dataset.meetupAtStop !== undefined) {
        // "Hold meetup here": the form of a new meetup in the place of the button.
        meetupForms.meetupAtStopClicked(target);
      } else if (target.dataset.sameTask !== undefined) {
        // "Same task at more stops…" (goal 8): the report's task at more stops picked on the map.
        const report = stopReportById(target.dataset.sameTask);
        if (report && 'task' in report) researchForms.sameTaskClicked(report);
      } else if (target.dataset.reportRocket !== undefined) {
        // "Report Rocket here" (plan 8M-9B): its form in the place of the button.
        rocketForms.rocketClicked(target);
      } else if (target.dataset.takeBack !== undefined) {
        // A report at a stop taken back (plan 8M-9B): its question in the place of its actions.
        const report = stopReportById(target.dataset.takeBack);
        if (report) stopControls.takeBackClicked(target, report);
      } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
        void press(target);
      } else postButton(target);
    });
    return element;
  };

  /**
   * The map's side of a post's buttons (plan 8M-8A): one the map has no form for opens the note
   * box with the post's link, or says why the member may not as a refusal in the answer line (plan
   * 8M-11A, S9, S20); Group… for a newcomer goes to the menu of groups; Route shows its part under the post; a raid's line in the list
   * of a gym's raids opens its post in the popup, and "All raids here" goes back to the list.
   */
  const postButton = (target: HTMLButtonElement): void => {
    const popup = target.closest<HTMLElement>('.party-popup');
    const partyId = target.closest<HTMLElement>('.post-popup')?.querySelector<HTMLElement>('.post')
      ?.dataset.post;
    // What is open under the post is kept by party across redraws (review 8A-10).
    const open = (change: PanelsOpen): void => {
      if (partyId !== undefined) panelsOpen.set(partyId, { ...panelsOpen.get(partyId), ...change });
    };
    const { onDiscord, focusPick, toggle, showRaid } = target.dataset;
    if (onDiscord !== undefined) {
      // Why not (reviews 8A-12, N1) as a refusal in the answer line, the popup or card shaken;
      // else the note box in the form's place, with the post's link (plan 8M-11A, S9, S20).
      const why = target.dataset.why ?? '';
      const party = partyId === undefined ? undefined : partyById(partyId);
      if (party === undefined) return;
      if (why !== '') answered(party.id, { text: why, ok: false }, target);
      else postForms.noteClicked(target, party, target.dataset.note ?? '');
    } else if (focusPick !== undefined) {
      popup?.querySelector<HTMLSelectElement>('select[data-group-pick]')?.focus();
    } else if (toggle === 'route') {
      const part = popup?.querySelector<HTMLElement>('section.route');
      if (part) {
        part.hidden = !part.hidden;
        open({ route: !part.hidden });
      }
    } else if (showRaid !== undefined) {
      chooseRaid(showRaid, {
        editing: hold.editing,
        cardKey: card.key,
        popupKey: showing.key,
        chosen: chosenRaid,
        refreshCard: (key) => {
          card.refresh(contents.get(key));
        },
        updatePopup: () => {
          if (showing.popup) updateKeepingScroll(showing.popup);
        },
      });
    }
  };

  /**
   * Binds a popup to a layer under a key that names it across redraws (`gym:<id>`,
   * `train:<id>`, `route:<id>`), remembering it while it is open; its content is held while a
   * form is open in it. A post (plan 8M-8A) is as wide as Discord's on a phone at most, and no
   * taller than the map leaves room for: it scrolls beyond (Leaflet's `maxHeight`). On a phone
   * the party opens as the card docked at the bottom instead (`PhoneCard`), with the same
   * content: the popup Leaflet opens is closed at once, before anything is painted.
   */
  const withPopup = <T extends L.Layer>(target: T, key: string, popup: () => PageNode): T => {
    const content = () => draw(popup());
    contents.set(key, content);
    target.bindPopup(hold.content(content), {
      minWidth: 280,
      maxWidth: 380,
      maxHeight: popupMaxHeight(map),
      autoPan: !cardWanted(),
    });
    target.on('popupopen', () => {
      if (cardWanted()) {
        const at = target.getPopup()?.getLatLng();
        target.closePopup();
        card.open(key, () => contents.get(key)?.() ?? content());
        // What was tapped stays in sight above the card (review 8A-8).
        if (at) {
          const point = map.latLngToContainerPoint(at);
          const clear = map.getSize().y - card.height - 24;
          if (point.y > clear) map.panBy([0, point.y - clear]);
        }
        drawBadges();
        return;
      }
      showing.openedAs(key);
      drawBadges();
    });
    target.on('popupclose', () => {
      showing.closedAs(key);
      drawBadges();
    });
    popups.set(key, target);
    // Its posts asked for ahead as the pointer comes over it or presses it (review 8A-3). No
    // `contextmenu`: a layer that listens for it takes it from the map (the spawn form).
    target.on('mouseover mousedown', () => {
      prefetchKey(key);
    });
    return target;
  };
  /** What each popup shows, by its key: the phone card draws the same. */
  const contents = new Map<string, () => HTMLElement>();
  /** The phone card (plan 8M-8A): a party narrower than the desktop opens as it. */
  // Its closing takes a form drawn in it (review 8A-1), and only its closing (review N2).
  const card = new PhoneCard(document, {
    onClose: () => {
      hold.cardClosed();
      openedClosed();
      drawBadges();
    },
  });
  // A tap on the map closes it, as a popup closes.
  map.on('click', () => {
    card.close();
  });

  /**
   * The things drawn at a place in the last draw, by the layer that shows them (plan 8M-7): a tap
   * on one that shares its place with others opens the list of them (`sharedPlace`).
   */
  let placed: Array<PlacedThing & { layer: PlacedLayer }> = [];
  /** The gyms whose raids are drawn in place of their dot. */
  let raidGyms: number[] = [];
  /** The Power Spots whose battle is drawn in place of their dot (plan 8M-9A, A6). */
  let battleSpots: ReadonlySet<string> = new Set();
  /** The raids' size drawn last: a zoom into another draws them anew (Matt, 2026-10-25). */
  let drawnSize: MarkerSize | undefined;
  map.on('zoomend', () => {
    if (markerSize(map.getZoom()) !== drawnSize) redrawParties();
    // The arrowheads follow every zoom, also while a form holds the parties (review R2), and so
    // do the selected train's numbers.
    drawArrows();
    drawBadges();
  });
  /** The trains drawn, among which the one selected shows its numbers. */
  let badgeTrains: readonly MapTrain[] = [];
  /** The numbers of the selected train's stops ahead, in the trains' layer. */
  const trainBadges = L.layerGroup();
  /**
   * The selected train's numbers (Matt, 2026-10-30; `selectedTrainId`, `selectedBadges`): each on
   * its stop, on the corner of what is drawn there (`stopMarkerPixels`, `badgeAnchor`), on a pane
   * above every marker and dot, taking no taps. Drawn anew when a popup or the card opens or
   * closes, at every draw of the parties and every zoom.
   */
  const drawBadges = (): void => {
    trainBadges.clearLayers();
    const selected = selectedTrainId(showing.popup !== undefined, showing.key, card.key);
    if (selected === undefined) return;
    const { sizes } = theme();
    const { badgeSize } = sizes;
    // The raids as they were drawn: a form holds them at their size through a zoom (SEL-4).
    const raidPixels = circleOf(drawnSize ?? markerSize(map.getZoom()), sizes);
    const raids = raidsShown() ? raidGyms : [];
    for (const badge of selectedBadges(badgeTrains, selected, map.getZoom(), gyms)) {
      const marker = stopMarkerPixels(badge.stop, raidPixels, raids, battleSpots);
      badgeMarker(badge, badgeSize, badgeAnchor(badge.slot, marker, badgeSize)).addTo(trainBadges);
    }
  };
  /** The legs of each train drawn (plan 8M-11B, S27), whose arrowheads follow the zoom. */
  let trainLines: TrainLeg[][] = [];
  /** The arrowheads of the trains drawn, in the trains' layer, under the markers. */
  const trainArrows = L.layerGroup();
  /**
   * The arrowheads of the trains' legs ahead as the map is zoomed now (`legArrows`): drawn anew at
   * every draw of the parties and every zoom, none on a leg too short on the screen.
   */
  const drawArrows = (): void => {
    trainArrows.clearLayers();
    const project = (place: { lat: number; lon: number }) =>
      map.latLngToContainerPoint([place.lat, place.lon]);
    const colour = theme().colours.train;
    for (const legs of trainLines) {
      for (const arrow of legArrows(legs, project)) {
        L.marker([arrow.lat, arrow.lon], {
          icon: L.divIcon({
            html: arrowElement(document, colour, arrow.angle),
            className: 'train-arrow',
            iconSize: [ARROW_PIXELS, ARROW_PIXELS],
          }),
          interactive: false,
          keyboard: false,
          // Over the line, under the parties' markers.
          pane: 'overlayPane',
        }).addTo(trainArrows);
      }
    }
  };
  const toPixel = (place: { lat: number; lon: number }) =>
    map.latLngToContainerPoint([place.lat, place.lon]);
  const shownThings = () => placed.filter((thing) => layerShown(thing.layer));
  /** The list of the things at one place, a choice opening its own popup (or `own`'s). */
  const openList = (here: readonly PlacedThing[], own?: { key: string; open: () => void }) => {
    const [first] = here;
    if (!first) return;
    choices.clear();
    for (const thing of here) {
      choices.set(thing.key, () => popups.get(thing.key)?.openPopup());
    }
    if (own) choices.set(own.key, own.open);
    L.popup({ className: 'place-list-popup' })
      .setLatLng([first.lat, first.lon])
      .setContent(draw(placeListNode(here)))
      .openOn(map);
  };
  /** What a tap on a thing opens: its own popup, or the list of the things at its place. */
  const openAt = (key: string, layer: L.Layer): void => {
    const shown = shownThings();
    const target = shown.find((thing) => thing.key === key);
    const here = target ? sharedPlace(target, shown, toPixel) : [];
    if (here.length <= 1) layer.openPopup();
    else openList(here);
  };
  /** A ring's own click: the list where it shares its place (plan 8M-7), else its popup. */
  const sharedClicks = (layer: L.Layer, key: string): void => {
    layer.off('click');
    layer.on('click', (event: L.LeafletEvent) => {
      L.DomEvent.stop(event);
      openAt(key, layer);
    });
  };
  /** A tap inside a ring (`ringTapDisc`), which opens what a tap on the ring's line does. */
  const tapInside = (
    ring: L.Layer,
    key: string,
    where: { lat: number; lon: number },
    size: RingSize,
    group: L.LayerGroup,
  ): void => {
    const disc = ringTapDisc(where, size, ringTaps);
    disc.on('mouseover mousedown', () => {
      prefetchKey(key);
    });
    disc.on('click', (event: L.LeafletEvent) => {
      L.DomEvent.stop(event);
      openAt(key, ring);
    });
    disc.addTo(group);
  };
  /** The choices of the list open: a thing's key and what opens it. */
  const choices = new Map<string, () => void>();

  // The list of what is on (plan 8M-7), under the trains' box of the side pane.
  const listSection = document.createElement('section');
  listSection.className = 'what-is-on';
  /** The element of a marker or ring, for the highlight of its line. */
  const elementOf = (key: string | null): Element | undefined => {
    const layer = key === null ? undefined : popups.get(key);
    if (layer instanceof L.Marker || layer instanceof L.Path) return layer.getElement();
    return undefined;
  };
  /**
   * The filters of the reports at stops (plan 8M-9B, goal 5): in the list's groups, in sight on the
   * map and on the toggles; a change draws the reports anew.
   */
  const stopFilters = stopFilterUi({
    map,
    guild,
    storage: frame.storage,
    view: () => stopReports.view,
    changed: () => {
      redrawParties();
    },
    render: () => {
      whatIsOn.render();
    },
    ...(frame.filtered === undefined ? {} : { filtered: frame.filtered }),
  });
  for (const type of ['click', 'change']) {
    listSection.addEventListener(type, (event) => {
      if (stopFilters.handled(event.target)) event.stopPropagation();
    });
  }
  /**
   * A line of the list tapped: where the map draws its thing (its layer on), the map flies there
   * (street level or closer) and its popup opens once the map rests; false where it does not.
   */
  const openLine = (line: ListLine): boolean => {
    const layer = line.marker === null ? undefined : popups.get(line.marker);
    if (!layer || !line.point || !layerShown(line.kind)) return false;
    const { marker } = line;
    frame.showMap();
    map.once('moveend', () => {
      // The list may have been drawn anew meanwhile: the popup of its key as it is now.
      if (marker !== null) popups.get(marker)?.openPopup();
    });
    map.flyTo([line.point.lat, line.point.lon], Math.max(map.getZoom(), STREET_ZOOM + 1));
    return true;
  };
  /** Where the list measures from: your location, else the map's middle. */
  const listOrigin = (): LatLon => {
    const center = map.getCenter();
    return frame.located() ?? { lat: center.lat, lon: center.lng };
  };
  /** Find's groups for a search, over what the page holds now (plan 8M-12). */
  const findGroups = (state: FindState) =>
    foundGroups(state, {
      parties: view === noParties ? undefined : view,
      gyms,
      reports: stopReports.view,
      now: Date.now(),
      origin: listOrigin(),
    });
  /**
   * A place Find found by name (plan 8M-12): its layer turned on, the map flown there, its own
   * popup opened once the map rests (a gym's dot kept for it, a stop's or Power Spot's popup at
   * its point), whatever the layers draw.
   */
  const pickPlace = (line: ListLine): boolean => {
    if (!line.point) return false;
    const { lat, lon } = line.point;
    const spot = { id: line.id, title: line.name, lat, lon };
    const gym = line.kind === 'gyms' ? gyms.get(Number(line.id)) : undefined;
    // What the map shows there, as a tap on it opens it (branch review BR-2): a stop's reports
    // (`openStopAt`), a Power Spot's battle, a gym's raids or the list of what shares its place;
    // the bare popup only where nothing else stands.
    const opener =
      line.kind === 'gyms'
        ? gym &&
          (() => {
            // The raids' popup while they are drawn; with the Raids layer off, the gym's own
            // (re-review N2).
            const raids = popups.get(`gym:${String(gym.id)}`);
            if (raids && raidsShown()) raids.openPopup();
            else tapGym(gym, () => frame.openGym?.(gym));
          })
        : line.kind === 'stops'
          ? () => {
              if (popups.has(`stop:${spot.id}`)) openStopAt(spot);
              else tapDot('stops', spot, () => frame.openStop?.(spot));
            }
          : () => {
              if (!openBattle(spot.id)) tapDot('spots', spot, () => frame.openSpot?.(spot));
            };
    if (!opener) return false;
    // Its own popup, whatever its layer says (ruling R3: the Gyms layer is off by default).
    frame.findPicked?.();
    frame.showMap();
    map.once('moveend', () => {
      opener();
    });
    map.flyTo([lat, lon], Math.max(map.getZoom(), STREET_ZOOM + 1));
    return true;
  };
  /**
   * A line Find found picked (plan 8M-12): its layer turned on (a report a filter hides lifts that
   * filter), then flown to and opened as the list's lines are; a thing the map cannot draw shows
   * its popup under its line.
   */
  const pickLine = (line: ListLine): boolean => {
    if (line.key.startsWith('place:')) return pickPlace(line);
    if (line.kind === 'research' || line.kind === 'rocket') {
      const layer = line.kind;
      const all = stopReports.view;
      const report = [
        ...(all?.research ?? []),
        ...(all?.grunts ?? []),
        ...(all?.hideouts ?? []),
      ].find((one) => String(one.id) === line.id);
      if (report && !stopFilters.shows(report, layer)) stopFilters.clear(layer);
    }
    if (!registry.isOn(line.kind)) registry.set(line.kind, true);
    const opened = openLine(line);
    if (opened) frame.findPicked?.();
    return opened;
  };
  /**
   * Find (plan 8M-12): the server asked for places once a pause after the text changed, with the
   * point distances are measured from; what it holds drawn in the list pane.
   */
  const finder = new FindSearch({
    places: async (text) => {
      const at = listOrigin();
      const near = `${at.lat.toFixed(6)},${at.lon.toFixed(6)}`;
      const found = await getJson<FoundPlacesView>(
        `/s/${guild}/api/find-places?q=${encodeURIComponent(text)}&near=${near}`,
      );
      return found.places;
    },
    changed: (state, why) => {
      whatIsOn.render();
      // The phone's list opens when a search begins, never when its places come (review F1: it
      // reopened over the map after a pick).
      if (why !== 'settled') frame.finding?.(state !== undefined);
    },
    pick: (state) => {
      const first = firstFound(findGroups(state));
      if (first) pickLine(first);
    },
  });
  /**
   * The popup under a line Find found that the map did not open (review F6): a report's stop with
   * every report there, as its marker's popup; a stop or Power Spot by name, as its own; a gym's.
   */
  const foundDetail = (line: ListLine): PageNode | undefined => {
    if (line.kind === 'research' || line.kind === 'rocket') {
      const at = stopReports.all(Date.now()).find((one) => line.marker === `stop:${one.stop.key}`);
      if (!at) return undefined;
      return stopPopup(
        at,
        stopContext({
          key: at.stop.key,
          name: at.stop.name,
          at: { lat: at.stop.lat, lon: at.stop.lon },
        }),
      );
    }
    if (!line.key.startsWith('place:') || !line.point) return undefined;
    if (line.kind === 'gyms') {
      const gym = gyms.get(Number(line.id));
      return gym && gymOwnPopup(gym, { located: frame.located(), units: frame.units });
    }
    const place = { id: line.id, title: line.name, address: line.address, ...line.point };
    return line.kind === 'stops'
      ? plainStopPopup(place, stopContext({ key: place.id, name: place.title, at: line.point }))
      : spotHead(place);
  };
  const whatIsOn = new WhatIsOn({
    section: listSection,
    // Find's results in place of the list while the box holds a search (plan 8M-12).
    found: () => {
      const state = finder.state;
      return state && { text: state.text, groups: findGroups(state) };
    },
    pick: pickLine,
    ...(frame.findCleared === undefined ? {} : { back: frame.findCleared }),
    scroller: panel,
    rendered: () => {
      hold.checkGone();
    },
    // Not "Nothing is on just now." while the reports at stops are drawn without the parties.
    partiesKnown: () => view !== undefined && view !== noParties,
    // The line to Campfire's official meetups at the foot (plan 8V-1), as the layer is offered.
    officialMeetups: () => registry.isOffered('meetups', true),
    groupHead: (kind) => stopFilters.head(kind),
    groupBody: (kind) => stopFilters.body(kind),
    units: frame.units,
    registry,
    storage: frame.storage,
    origin: listOrigin,
    zone: () => readerZone(),
    open: openLine,
    highlight: (line, on) => {
      elementOf(line.marker)?.classList.toggle('highlighted', on);
      // Its post asked for ahead, so that it opens drawn (review 8A-3).
      if (on && line.marker !== null) prefetchKey(line.marker);
    },
    detail: (line) => {
      // As the side panel showed it before (plan 8M-3 to 8M-6): its popup, with its actions.
      const ctx = context();
      let node: PageNode | undefined;
      if (line.key.startsWith('max:')) {
        // A max battle's line (plan 8M-9A) in the raids' group: its post, else its summary.
        const max = view?.maxes.find((one) => one.id === line.id);
        if (max) node = partyPopup(max, () => maxPopup(max, ctx));
      } else if (line.kind === 'raids') {
        const raid = view?.raids.find((one) => one.id === line.id);
        if (raid) node = partyPopup(raid, () => raidPopup(raid, ctx));
      } else if (line.kind === 'trains') {
        const train = view?.trains.find((one) => one.id === line.id);
        if (train) node = partyPopup(train, () => trainPopup(train, ctx, trainActions(train)));
      } else if (line.kind === 'meetups') {
        const meetup = view?.meetups.find((one) => one.id === line.id);
        if (meetup)
          node = partyPopup(meetup, () => meetupPopup(meetup, ctx, meetupActions(meetup)));
      }
      // A line Find found that the map could not open (review F6): its stop's popup with its
      // reports, or the place's own.
      node ??= foundDetail(line);
      if (!node) return undefined;
      const element = draw(node);
      element.classList.add('line-detail');
      // A Power Spot's line, or its battle's: the spot's address asked for where it has none.
      const max = line.key.startsWith('max:')
        ? view?.maxes.find((one) => one.id === line.id)
        : undefined;
      if (max) frame.spotAddress?.(element, { id: max.spotId, address: max.place.address });
      else if (line.kind === 'spots' && line.key.startsWith('place:'))
        frame.spotAddress?.(element, { id: line.id, address: line.address });
      return element;
    },
  });
  // Kept current between lists, never under a form (`ListRefresh`, fix round 1).
  const listRefresh = new ListRefresh({
    held: () => hold.editing,
    draw: () => {
      whatIsOn.render();
    },
  });
  map.on('moveend', () => {
    listRefresh.moved();
  });
  registry.onChange(() => {
    listRefresh.layers();
  });
  frame.onMove(() => {
    const at = frame.located();
    if (at) listRefresh.fixed(at, whatIsOn.sorted);
  });
  /**
   * Whether Find stands aside (BR-1): a gym is to be clicked, or a form holds the pane and hides
   * the list.
   */
  const findOff = (): boolean =>
    trainForms.routing() !== undefined ||
    meetupForms.picking() ||
    report.picks('gyms') ||
    listSection.hidden === true;
  /** Whether Find stood aside when last looked at (`findFollows`). */
  let findWasOff = false;
  /**
   * Find takes the box back once it no longer stands aside (re-review N1): the text in the box
   * now is searched, as if typed. Looked at after each draw of the parties and each change of
   * the form's hold, where route mode, a place picked, the Report button's step 2 and the forms
   * of the pane begin and end.
   */
  const findFollows = (): void => {
    const off = findOff();
    if (findWasOff && !off) {
      const thinned = typedAside;
      typedAside = false;
      // Text typed during the mode was a gym filter (re-review M2, the controller's ruling): the
      // box emptied, no search; a Find search held through the mode is Find's again (N1).
      if (thinned) frame.findCleared?.();
      finder.typed(thinned ? '' : (frame.findText?.() ?? ''));
      frame.boxChanged?.();
    }
    findWasOff = off;
  };
  /** Whether text was typed in the box while Find stood aside (re-review M2). */
  let typedAside = false;
  /** Whether the box thins the gyms: by text typed while Find stands aside (N1). */
  const boxThins = (): boolean => findOff() && finder.state === undefined;
  /**
   * The side pane shows a form of its box over the list (`paneShows`), recomputed as a form takes
   * the hold or lets it go; on a phone a form that needs the map docks the pane under it (fix
   * round 1: `body.form-docked`, whatever "List" says).
   */
  const paneShown = (): void => {
    const formOpen =
      hold.asideHeld || trainForms.inTools() || meetupForms.inTools() || researchForms.inTools();
    listSection.hidden = paneShows({ loggedIn: true, formOpen }) === 'form';
    document.body.classList.toggle('form-docked', formOpen);
    map.invalidateSize();
  };

  const redraw = (next: PartiesView): void => {
    // Discord answers again (B10): how the member stands to the regions is asked anew.
    if (view?.readOnly === true && !next.readOnly) void regionsBox.load();
    view = next;
    // Whether Report is still offered, asked first (R1-9): a step 2 that ends here ends before
    // anything is drawn, with nothing drawn anew inside this draw.
    report.refresh();
    // The raids drawn while a raid's step 2 picks gyms, whatever their layer (C1).
    if (raidsShown()) groups.raids.addTo(map);
    else groups.raids.remove();
    const reopen = showing.key;
    // A train's line reopens where its popup was opened (branch review BR-1): a group of pieces
    // opened without a place opens at its first piece on the map, and autoPan would move the map
    // there. Only `route:` keys, which only an opened popup sets (`openNext` names others).
    const reopenAt = reopen?.startsWith('route:') === true ? showing.popup?.getLatLng() : undefined;
    // A tall popup stays where the member scrolled it: lists are drawn anew at every signal.
    const reopenScroll = popupContent(showing.popup)?.scrollTop;
    for (const group of Object.values(groups)) group.clearLayers();
    popups.clear();
    contents.clear();
    placed = [];
    const now = Date.now();
    const { atGyms } = raidsAtGyms(next.raids, (id) => gyms.has(id));
    raidGyms = [...atGyms.keys()];
    /** Whether a raid's circle is drawn at a gym: the rings go round it (fix round 1). */
    // The size of the raids' circles at this zoom (Matt, 2026-10-25), which the rings round them
    // follow; none where no raid's circle is drawn at the gym.
    const size = markerSize(map.getZoom());
    const { sizes } = theme();
    const circle = circleOf(size, sizes);
    const raidAt = (gymId: number | undefined): number | undefined =>
      gymId !== undefined && raidsShown() && atGyms.has(gymId) ? circle : undefined;
    drawnSize = size;
    for (const [gymId, raids] of atGyms) {
      const gym = gyms.get(gymId);
      // One lead raid draws the marker, every fact of it (fix round 1).
      const lead = leadRaid(raids);
      if (!gym || !lead) continue;
      // No "Report raid" where the gym shows its raid (review 8A-2): the popup offers the raid.
      const extras = reportOffered(mayReport, next) ? gymWithRaidBoxes(gymId) : [];
      const key = `gym:${gymId}`;
      const marker: L.Marker = raidsMarker(
        gym,
        raidIcon(renderNode(raidMarkerNode(lead, now, readerZone(), size), document), circle),
        lead.heading,
        (made) => withPopup(made, key, () => gymPopup(gymId, raids, extras)),
        () => gymClicked(gym),
        () => {
          openAt(key, marker);
        },
      ).addTo(groups.raids);
      placed.push({
        key,
        layer: 'raids',
        gymId,
        lat: gym.lat,
        lon: gym.lon,
        picture: lead.picture,
        name: lead.heading + (raids.length > 1 ? ` (and ${raids.length - 1} more)` : ''),
        time: raidBadge(lead, now, readerZone()),
        place: { key: `gym:${String(gymId)}`, name: gym.name },
      });
    }
    // Max battles (plan 8M-9A, A2): at their Power Spot or pin, drawn as a raid is (the boss in a
    // ring of Dynamax's or Gigantamax's color, the time badge, the count), under the raids'
    // layer; one marker each, keyed `max:<id>`; in route mode a battle at a Power Spot is that
    // spot to add as a stop (the spot's own dot is not drawn under it).
    for (const max of next.maxes) {
      const key = `max:${max.id}`;
      const marker: L.Marker = raidsMarker(
        max.place,
        raidIcon(renderNode(raidMarkerNode(max, now, readerZone(), size), document), circle, true),
        max.title,
        (made) => withPopup(made, key, () => partyPopup(max, () => maxPopup(max, context()))),
        () =>
          // Dimmed while "Add stops…" picks stops: the tap does nothing (review F9).
          researchForms.adding() ||
          report.spotClicked(max.place, true) ||
          (max.spotId !== null &&
            trainForms.spotClicked({ id: max.spotId, title: max.place.name })),
        () => {
          openAt(key, marker);
        },
      ).addTo(groups.raids);
      // Its Power Spot's address asked for as its popup (or the phone card) opens, where it has none.
      marker.on('popupopen', () => {
        if (max.spotId === null) return;
        const shown = cardWanted() ? card.content() : showing.popup?.getElement();
        frame.spotAddress?.(shown, { id: max.spotId, address: max.place.address });
      });
      placed.push({
        key,
        layer: 'raids',
        gymId: null,
        lat: max.place.lat,
        lon: max.place.lon,
        picture: max.picture,
        name: max.title,
        time: raidBadge(max, now, readerZone()),
        // A Power Spot's name; a pin names no place.
        ...(max.spotId === null
          ? {}
          : { place: { key: `spot:${max.spotId}`, name: max.place.name } }),
      });
    }
    // The Power Spots whose battle is drawn (the raids' layer on): their own dot is not (A6), and
    // a train's ring at one goes round the battle's circle.
    battleSpots = new Set(
      raidsShown() ? next.maxes.flatMap((max) => (max.spotId === null ? [] : [max.spotId])) : [],
    );
    const circleAtStop = (stop: string | undefined): number | undefined => {
      if (stop?.startsWith('w') === true)
        return battleSpots.has(stop.slice(1)) ? circle : undefined;
      return raidAt(gymOfStop(stop) ?? undefined);
    };
    // The train being routed is left to route mode, which draws its stops as they are edited.
    // While a train is routed, a meetup's place picked or the research form adds stops (review
    // round 2, R2), the trains' and meetups' lines and markers let clicks through to the gyms,
    // the stops and the map.
    const drawn = drawnTrains(next.trains, trainForms.routing()?.id);
    const interactive = drawn.clickable && !pickingPlace();
    // Meetups at their place (plan 8M-5M): at the gym as the map has it now, else the snapshot's
    // point; listed in the side panel too. A ring without a fill: a gym's dot inside it stays a
    // dot to click, and a tap beside the dot is the disc's under it (`tapInside`). On a pane of
    // its own under the markers and over the gyms' dots (plan 8M-11A, S2): a raid's time badge is
    // drawn over the ring.
    for (const meetup of next.meetups) {
      const { place } = meetup;
      if (!place) continue;
      const gym = place.gymId === null ? undefined : gyms.get(place.gymId);
      const at = gym ?? place;
      const key = `meetup:${meetup.id}`;
      const size = ringSizes(raidAt(gym?.id)).meetup;
      const ring = withPopup(
        L.circleMarker([at.lat, at.lon], {
          ...size,
          renderer: rings,
          color: theme().colours.meetup,
          fill: false,
          interactive,
          pane: RING_PANE,
        }),
        key,
        () => partyPopup(meetup, () => meetupPopup(meetup, context(), meetupActions(meetup))),
      ).addTo(groups.meetups);
      sharedClicks(ring, key);
      if (interactive) tapInside(ring, key, at, size, groups.meetups);
      placed.push({
        key,
        layer: 'meetups',
        gymId: gym ? gym.id : null,
        lat: at.lat,
        lon: at.lon,
        picture: null,
        name: meetup.name,
        time: startWords(meetup.startTime, now, readerZone()),
        // At a gym as the map has it now; at a PokéStop or Power Spot by its key (plan 8M-15).
        ...(gym
          ? { place: { key: `gym:${String(gym.id)}`, name: gym.name } }
          : place.at === null
            ? {}
            : { place: place.at }),
      });
    }
    trainLines = [];
    trainArrows.clearLayers();
    trainArrows.addTo(groups.trains);
    badgeTrains = drawn.trains;
    trainBadges.addTo(groups.trains);
    for (const train of drawn.trains) {
      // Through its gyms and the power spots its data gives (plan 8X-4).
      const { ring } = trainPlaces(train, gyms);
      const popup = () =>
        partyPopup(train, () => trainPopup(train, context(), trainActions(train)));
      // Its way (plan 8M-11B, S27): the legs done faint, those ahead as before, a loop's closing
      // leg dashed, all in one group with one popup under the key `route:<id>` (review R1: the
      // post's rules, `showsParty`, know it, and a piece gone after a move takes no popup with
      // it); the arrowheads ahead drawn for the zoom (`drawArrows`).
      const legs = trainLegs(train, gyms);
      const { colours, opacities } = theme();
      const line = L.featureGroup();
      const pieces = [
        { legs: legs.filter((leg) => leg.done), faint: true },
        { legs: legs.filter((leg) => !leg.done && !leg.closing), faint: false },
      ];
      for (const piece of pieces) {
        const [first] = piece.legs;
        if (!first) continue;
        L.polyline(
          [first.from, ...piece.legs.map((leg) => leg.to)].map((place) =>
            L.latLng(place.lat, place.lon),
          ),
          {
            color: colours.train,
            weight: 4,
            opacity: piece.faint ? opacities.trainDone : opacities.trainAhead,
            interactive,
            ...onLinePane,
          },
        ).addTo(line);
      }
      // Its flow (plan 8M-13, T1): one thin line over the legs ahead, and a faint one over those
      // done (Matt, 2026-10-30), whose dashes move along the way (`map.css`, `.train-flow`: their
      // pattern, color and motion, hidden where the device asks for less motion), letting clicks
      // through to the line under it.
      const flows = [
        { legs: doneFlowLegs(legs, train.stop === null), faint: true },
        { legs: pieces[1]?.legs ?? [], faint: false },
      ];
      for (const piece of flows) {
        const [first] = piece.legs;
        if (!first) continue;
        inFlowStep(
          L.polyline(
            [first.from, ...piece.legs.map((leg) => leg.to)].map((place) =>
              L.latLng(place.lat, place.lon),
            ),
            {
              color: colours.train,
              weight: 2,
              className: `train-flow train-flow-line${piece.faint ? ' train-flow-done' : ''}`,
              interactive: false,
              ...onLinePane,
            },
          ),
        ).addTo(line);
      }
      const closing = legs.find((leg) => leg.closing);
      if (closing) {
        // Its own dashes move (`.train-flow`), where motion is welcome.
        inFlowStep(
          L.polyline(
            [
              L.latLng(closing.from.lat, closing.from.lon),
              L.latLng(closing.to.lat, closing.to.lon),
            ],
            {
              color: colours.train,
              weight: 4,
              opacity: opacities.trainAhead,
              dashArray: '8 8',
              className: 'train-flow',
              interactive,
              ...onLinePane,
            },
          ),
        ).addTo(line);
      }
      if (line.getLayers().length > 0) {
        // Its wide line for taps (Matt, 2026-10-30): invisible, over every leg, a tap on it
        // opening the popup as the line's does; a stroke of no opacity still takes taps. Under
        // the dots and markers, whose taps win; none while the line takes none.
        L.polyline(
          [...pieces.map((piece) => piece.legs), closing ? [closing] : []].flatMap((part) => {
            const [first] = part;
            return first
              ? [
                  [first.from, ...part.map((leg) => leg.to)].map((place) =>
                    L.latLng(place.lat, place.lon),
                  ),
                ]
              : [];
          }),
          { weight: TRAIN_HIT_PIXELS, opacity: 0, interactive, ...onLinePane },
        ).addTo(line);
        withPopup(line, `route:${train.id}`, popup).addTo(groups.trains);
      }
      trainLines.push(legs);
      // A ring around the stop it is at (or its first stop before it starts): a gym's own marker
      // inside it stays a marker to click (plan 8S-4).
      if (ring) {
        const key = `train:${train.id}`;
        const size = ringSizes(
          circleAtStop(train.stop === null ? train.route[0] : train.route[train.stop]),
        ).train;
        const marker = withPopup(
          trainMarker(ring.at, ring.here, interactive, theme().colours.train, rings, size),
          key,
          popup,
        ).addTo(groups.trains);
        sharedClicks(marker, key);
        if (interactive) tapInside(marker, key, ring.at, size, groups.trains);
        const stopKey = train.stop === null ? train.route[0] : train.route[train.stop];
        const place = trainPlace(train, gyms);
        placed.push({
          key,
          layer: 'trains',
          gymId: gymOfStop(stopKey),
          lat: ring.at.lat,
          lon: ring.at.lon,
          picture: null,
          name: train.name,
          time: startWords(train.startTime, now, readerZone()),
          ...(place === undefined ? {} : { place }),
        });
      }
    }
    drawArrows();
    drawBadges();
    // The reports at stops (plan 8M-9B): a marker per stop with reports of the layers on, its
    // popup bound as a party's (the card, the held content), the stop whose popup or card is open
    // kept with its ended reports (B14).
    const openStop = (key: string | undefined): string[] =>
      key?.startsWith('stop:') === true ? [key.slice('stop:'.length)] : [];
    placed.push(
      ...stopReports.draw({
        now,
        size,
        circles: { full: sizes.raidMiddle, small: sizes.raidSmall },
        keep: new Set([...openStop(showing.key), ...openStop(card.key)]),
        // A stop with reports is pickable in the Report button's step 2 of a report at a stop
        // (B9): its marker takes the tap then, the other kinds' let it through as the rings do.
        interactive:
          drawn.clickable &&
          !meetupForms.picking() &&
          (!report.inTools() || report.picks('stops') || researchForms.adding()),
        // A filter's reports are neither drawn nor listed (goal 5).
        shows: (report, layer) => stopFilters.shows(report, layer),
        bind: (marker, key, popup) => withPopup(marker, key, popup),
        // Taken by the research form's "Add stops…" first, then by the Report button's step 2.
        tapped: (at) =>
          stopClicked({ id: at.stop.key, title: at.stop.name, lat: at.stop.lat, lon: at.stop.lon }),
        open: (key, marker) => {
          openAt(key, marker);
        },
        popup: (at) =>
          stopPopup(
            at,
            stopContext({
              key: at.stop.key,
              name: at.stop.name,
              at: { lat: at.stop.lat, lon: at.stop.lon },
            }),
          ),
      }),
    );
    // "New train" (or the form or route editor open in its place) for a member who may; a form
    // open there stays whatever the list says, and is shown over the list (plan 8M-7), which
    // comes back when it closes.
    const formOpen =
      trainForms.inTools() ||
      meetupForms.inTools() ||
      report.inTools() ||
      researchForms.inTools() ||
      regionsBox.inTools();
    const reporting = reportOffered(mayReport, next);
    // The phone list's own Report line (plan 8M-9A, A7), over the list, while Report is offered
    // (review B2: not for a form left open while the list went read-only). The list stays in the
    // page while it is drawn anew (plan 8M-11A, S11): a focused line whose party ended gives its
    // focus to the sort.
    keepTools<ChildNode>(panel, [
      ...(reporting || formOpen ? [tools] : []),
      ...(reporting ? [report.line] : []),
      listSection,
    ]);
    paneShown();
    // The list of what is on (plan 8M-7): every party the layers on show, across the server;
    // trains and raids the map cannot draw, and meetups without a place, keep their line.
    // The reports at stops after the parties (plan 8M-9B), every layer's: the list keeps the
    // groups of the layers on; the research group says when the day's research comes back (B5).
    // A filter's reports are left out, and the group says how many it hides (goal 5).
    const noteOf = (...parts: Array<string | undefined>): string | undefined => {
      const said = parts.filter((part): part is string => part !== undefined);
      return said.length === 0 ? undefined : said.join(' ');
    };
    const research = noteOf(
      waitingNote(stopReports.view, now, readerZone()),
      stopFilters.hiddenNote('research', now),
    );
    const rocket = noteOf(stopFilters.hiddenNote('rocket', now));
    whatIsOn.show(
      [
        ...listLines(next, gyms),
        ...stopReportLines(
          stopReports.all(now, (report, layer) => stopFilters.shows(report, layer)),
        ),
      ],
      {
        ...(research === undefined ? {} : { research }),
        ...(rocket === undefined ? {} : { rocket }),
      },
    );
    stopFilters.shown();
    // The posts of the parties in view, then (after the page's first list, review N6) the rest,
    // asked for ahead, at most `PREFETCH_POSTS` a list (review 8A-3), so that a popup that opens
    // has its post. Not for the reports drawn without the parties (review round 2, R1): the
    // parties' first list is still to come.
    if (next !== noParties) {
      const bounds = map.getBounds();
      const all: MapParty[] = [...next.raids, ...next.maxes, ...next.trains, ...next.meetups];
      const inView = (party: MapParty): boolean => {
        const at = placeOf(party);
        return at !== undefined && bounds.contains([at.lat, at.lon]);
      };
      postViews.keepOnly(all);
      groupPicks.keepOnly(all);
      // Where a signal caused this list every map asks: what a popup or card shows at once, the
      // rest spread out. The first list of a visit and a press's list as ever.
      const spread = firstList ? undefined : listSpread;
      listSpread = undefined;
      const open = new Set(
        [reopen, card.key].flatMap((key) =>
          key === undefined ? [] : partiesAtKey(next, key).map((party) => party.id),
        ),
      );
      postViews.prefetch(
        prefetchOrder(all, inView, firstList),
        PREFETCH_POSTS,
        spread === undefined ? undefined : { ms: spread, atOnce: (id) => open.has(id) },
      );
      firstList = false;
    }
    panel.hidden = false;
    map.invalidateSize();
    const line = readOnlyLine(next !== noParties && next.readOnly);
    readOnly.textContent = line ?? '';
    readOnly.hidden = line === undefined;
    // Drawn under a form of the trains' box: the controls that open another form stay off.
    if (hold.editing) formControls(document, false);
    counted();
    // The gyms follow: route mode or a place picked shows every gym (plan 8M-7).
    afterDraw();
    tellPicks();
    // A real list was drawn (plan 8M-17), told once this draw has returned.
    if (next !== noParties) {
      queueMicrotask(() => {
        frame.listDrawn?.(next);
      });
    }
    // A gym to be clicked or a form ended with this draw: the box's text is Find's again (N1).
    findFollows();
    if (reopen !== undefined) popups.get(reopen)?.openPopup(reopenAt);
    const reopened = popupContent(showing.popup);
    if (reopened && reopenScroll !== undefined) reopened.scrollTop = reopenScroll;
    // The phone card shows the party as it is now (none once it is gone).
    if (card.key !== undefined) card.refresh(contents.get(card.key));
  };

  // Leaflet tells the map first, then the layer (`OpenPopup`).
  // A popup opened while a form is open elsewhere (the side panel's) shows its controls off. Its
  // clicks stay in it (`keepClicksInPopup`): a button a click takes out of the page would
  // otherwise close the popup.
  map.on('popupopen', (event) => {
    showing.opened(event.popup);
    // Anything else opened clears a train's numbers; a train's popup draws them under its key.
    drawBadges();
    const element = event.popup.getElement();
    if (element) {
      keepClicksInPopup(element);
      formControls(element, !hold.editing);
    }
  });
  // A popup closed with a form in it: the form is gone with it, and what came meanwhile is drawn
  // once Leaflet is through (a redraw inside its close would open the popup again).
  map.on('popupclose', (event) => {
    showing.closed(event.popup);
    hold.popupClosed();
    openedClosed();
    drawBadges();
  });

  // Reporting and changing raids (plan 8M-4): after a success the list at once, and the raid's
  // gym opened; while a form is open nothing is drawn anew under it.
  const raidForms = raidUi({
    // A change's answer in its post's answer line, a refusal shaking its form (review fix F4).
    answered: (raidId, answer, from) => {
      answered(raidId, answer, from);
    },
    refused: (form) => {
      refusalMoves(form, undefined, card);
    },
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    regionNames,
    hold,
    done: async (raid) => {
      if (raid?.gymId != null) {
        map.closePopup();
        showing.openNext(`gym:${raid.gymId}`);
      }
      await poller.now();
      reopenRaids();
    },
  });

  /**
   * After a raid's or a max battle's form (review B1): the popup to open, on its own marker with
   * the raids drawn while it shows whatever their layer says (`openParty`), as step 3 opens one.
   */
  const reopenRaids = (): void => {
    const open = showing.key;
    if (open === undefined) return;
    const raidsLayer = open.startsWith('gym:') || open.startsWith('max:');
    if (!raidsLayer || !openParty(open)) popups.get(open)?.openPopup();
  };

  // Reporting wild Pokémon (plan 8M-4S): a long press or a right click on the map opens the form
  // in a popup at that point (Leaflet's `contextmenu`, which it also fires for a long press on a
  // phone), "Report spawn here" in a gym's popup in its place; held like the raid forms. Not
  // while the map is read-only. Also on a raid's picture or dot, at the pointer: Leaflet gives a
  // layer a mouse event only when the layer listens for it, so no layer here listens for
  // `contextmenu` (one that did would take it from the map, a marker at its own position).
  const spawnForms = spawnUi({
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    regions,
    hold,
    popupAt: (point, content) => {
      const popup = L.popup().setLatLng([point.lat, point.lon]).setContent(content).openOn(map);
      return {
        close: () => {
          map.closePopup(popup);
        },
      };
    },
  });
  // Reporting max battles (plan 8M-9A): "Report max battle here" in a Power Spot's popup opens
  // the form in its place, a point picked in the Report button's step 2 in a popup there; held
  // like the other forms. After a battle was made or found there, the list at once and its popup.
  const maxForms = maxUi({
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    regions,
    hold,
    popupAt: (point, content) => {
      const popup = L.popup().setLatLng([point.lat, point.lon]).setContent(content).openOn(map);
      return {
        close: () => {
          map.closePopup(popup);
        },
      };
    },
    // "← Pick a Power Spot" of a pin refused (R1-4): the Report button's step 2 of a max battle.
    pickSpot: () => {
      report.pickSpots();
    },
    done: async (max) => {
      if (max) {
        map.closePopup();
        showing.openNext(`max:${max.id}`);
      }
      await poller.now();
      reopenRaids();
    },
  });
  map.on('contextmenu', (event) => {
    // In step 2 of the Report button it puts the pin there, as a tap does (review B6).
    if (report.mapClicked({ lat: event.latlng.lat, lon: event.latlng.lng })) return;
    if (!reportOffered(mayReport, view)) return;
    spawnForms.spawnAt(spawnPoint(event.latlng.lat, event.latlng.lng));
  });

  // Trains (plan 8M-5): "New train" in the side panel, route mode (the editor in the side panel,
  // the stops numbered on the map, a gym clicked added as the next stop), the conductor's buttons
  // (Move… and Manage… are forms of the post, plan 8M-8C); held like the raid forms. After a success the list
  // at once, and the train's popup opened.
  const routeLayer = L.layerGroup().addTo(map);
  /** A dragged stop's new legs (plan 8M-11B, S24), over route mode's line. */
  const dragLayer = L.layerGroup().addTo(map);
  const trainForms = trainUi({
    answered: (partyId, answer, from) => {
      answered(partyId, answer, from);
    },
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    regions,
    zone: () => view?.zone ?? 'UTC',
    gyms,
    hold,
    tools,
    overlay: {
      show: (train) => {
        routeLayer.clearLayers();
        const stops = placedStops(train, gyms);
        if (stops.length > 1) {
          L.polyline(
            stops.map(({ place }) => L.latLng(place.lat, place.lon)),
            { color: theme().colours.train, weight: 4, dashArray: '6 6', interactive: false },
          ).addTo(routeLayer);
        }
        for (const { place, number, here } of stops) {
          // The number as text of an element of ours: Leaflet sets a string as HTML.
          const label = document.createElement('span');
          label.textContent = String(number);
          L.marker([place.lat, place.lon], {
            icon: L.divIcon({
              html: label,
              className: here ? 'stop-number here' : 'stop-number',
              iconSize: [22, 22],
            }),
            interactive: false,
            keyboard: false,
          }).addTo(routeLayer);
        }
      },
      clear: () => {
        routeLayer.clearLayers();
      },
    },
    // A stop dragged in the route editor (plan 8M-11B, S24): its new legs, dotted in the train's
    // color on a layer of their own over route mode's dashed line.
    dragLine: {
      show: (train, from, to) => {
        dragLayer.clearLayers();
        for (const leg of dropLegs(train, from, to, gyms)) {
          L.polyline([L.latLng(leg.from.lat, leg.from.lon), L.latLng(leg.to.lat, leg.to.lon)], {
            color: theme().colours.train,
            weight: 5,
            dashArray: '2 9',
            lineCap: 'round',
            interactive: false,
          }).addTo(dragLayer);
        }
      },
      clear: () => {
        dragLayer.clearLayers();
      },
    },
    // A stop's handle held (S25): Leaflet counts every finger on the screen, so the map's touch
    // zoom and dragging are off meanwhile, and back on after only where they were on.
    holdMap: () => holdMap([map.touchZoom, map.dragging]),
    // Route mode starts with nothing over its editor: on a phone a card stands in front of the
    // docked pane, and only a train's own goes with the draw that takes its line off the map.
    closePopup: () => {
      map.closePopup();
      card.close();
    },
    done: async (train) => {
      if (train) {
        map.closePopup();
        showing.openNext(`train:${train.id}`);
      }
      await poller.now();
      const open = showing.key;
      if (open !== undefined) popups.get(open)?.openPopup();
    },
    refresh: () => poller.now(),
    // The list the page has, at once: the poller draws only a list that changed.
    redrawn: () => {
      redrawParties();
    },
    // Whether the map draws Power Spots to tap in route mode (plan 8M-8C, R5), by the rule the
    // Power Spots layer draws them by (`placesWanted`: on, zoomed in; the member's map).
    spotsShown: () => placesWanted(registry.isOn('spots'), map.getZoom(), true),
    ...(frame.routeMode === undefined ? {} : { routeMode: frame.routeMode }),
  });
  // The route editor's hint follows the Power Spots layer and the zoom (R5).
  registry.onChange((id) => {
    if (id === 'spots') trainForms.placesChanged();
  });
  map.on('zoomend', () => {
    trainForms.placesChanged();
  });
  tools.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.newTrain !== undefined) trainForms.newTrainClicked();
    else if (target.dataset.newMeetup !== undefined) meetupForms.newMeetupClicked();
  });

  // Meetups (plan 8M-5M): "New meetup" in the side panel's box and "Hold meetup here" in a gym's popup
  // open the form there; "Pick on the map" shows the PokéStops of the view (from `/api/stops`,
  // asked again after the map moves) and takes a gym, a stop or a point clicked as the place;
  // "Manage…" opens a meetup's editor there. Held like the other forms; after a success the list at
  // once, and the meetup's popup opened.
  const stopLayer = L.layerGroup().addTo(map);
  const meetupForms = meetupUi({
    guild,
    csrf: {
      get: () => csrf,
      set: (token) => {
        csrf = token;
      },
    },
    regions,
    gyms,
    hold,
    tools,
    zone: () => view?.zone ?? 'UTC',
    answered: (meetupId, answer, from) => {
      answered(meetupId, answer, from);
    },
    refused: (form) => {
      refusalMoves(form, undefined, card);
    },
    stops: {
      box: () => {
        const bounds = map.getBounds();
        return {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        };
      },
      show: (stops, picked) => {
        stopLayer.clearLayers();
        for (const stop of stops) {
          const [, lat, lon, title] = stop;
          const marker = L.circleMarker([lat, lon], {
            radius: 6,
            weight: 2,
            color: theme().colours.stop,
            fillOpacity: 0.8,
          });
          // The title as text of an element of ours: Leaflet sets a string as HTML.
          marker.bindTooltip(renderNode({ tag: 'span', text: title }, document));
          marker.on('click', (event: L.LeafletMouseEvent) => {
            L.DomEvent.stop(event);
            picked(stop);
          });
          marker.addTo(stopLayer);
        }
      },
      clear: () => {
        stopLayer.clearLayers();
      },
      moved: (run) => {
        map.on('moveend', run);
        return () => {
          map.off('moveend', run);
        };
      },
    },
    // Nothing over the form in the side pane: on a phone a card stands in front of the docked pane.
    closePopup: () => {
      map.closePopup();
      card.close();
    },
    done: async (meetup) => {
      if (meetup?.place) {
        map.closePopup();
        showing.openNext(`meetup:${meetup.id}`);
      }
      await poller.now();
      const open = showing.key;
      if (open !== undefined) popups.get(open)?.openPopup();
    },
    redrawn: () => {
      redrawParties();
    },
  });
  /** "Hold meetup here" for a gym's own popup (`gymControls`), which opens the form with the gym. */
  const meetupHereControl = (gym: MapGym): HTMLElement => {
    const box = renderNode(meetupHereBox(gym.id), document);
    // On the button: the form is drawn into the box, and its clicks bubble there.
    const button = box.querySelector('button');
    button?.addEventListener('click', () => {
      meetupForms.meetupHereClicked(gym, button);
    });
    return box;
  };
  /** The start form at a place, its region prefilled where one region alone holds the place. */
  const trainHereAt = (
    first: FirstStop,
    place: LatLon,
    control: HTMLButtonElement | null,
  ): void => {
    trainForms.trainHereClicked(first, regionHolding(place, regions), control);
  };
  /** "Start train here" for a gym's own popup or a Power Spot's, which opens the form at the place. */
  const trainHereControl = (id: string, first: FirstStop, place: LatLon): HTMLElement => {
    const box = renderNode(trainHereBox(id), document);
    const button = box.querySelector('button');
    button?.addEventListener('click', () => {
      trainHereAt(first, place, button);
    });
    return box;
  };
  // A point of the map clicked while a meetup's place is picked: a pin there.
  map.on('click', (event: L.LeafletMouseEvent) => {
    const point = { lat: event.latlng.lat, lon: event.latlng.lng };
    if (!report.mapClicked(point) && !researchForms.mapClicked()) meetupForms.mapClicked(point);
  });

  /**
   * A party's popup opened by its key for the Report button's step 3, after a raid's or a max
   * battle's form, or for a Power Spot's battle (review B1), on its own marker (R2-1): the raids'
   * layer drawn while it shows, its toggle off or not.
   */
  const openParty = (key: string): boolean => {
    if (!popups.has(key)) return false;
    // Its own marker, its layer drawn while it shows (R2-1): the popup, or on a phone the card,
    // of every party, with its forms and its redraws. The parties drawn anew with it first (R3-1):
    // its Power Spot's dot, the gyms with raids and the rings as with the layer on; its popup
    // from the markers drawn then.
    openedForStep3 = key;
    openingStep3 = true;
    try {
      redrawParties();
      const layer = popups.get(key);
      if (!layer) {
        openedForStep3 = undefined;
        return false;
      }
      groups.raids.addTo(map);
      layer.openPopup();
      return true;
    } finally {
      openingStep3 = false;
    }
  };

  /**
   * A PokéStop's own popup opened at it (plan 8M-9B, B9: step 3 of a report at a stop): the popup
   * or card of its reports where they are drawn, else its plain popup; the element that shows it.
   */
  const openStopAt = (stop: MapSpot): HTMLElement | undefined => {
    const layer = popups.get(`stop:${stop.id}`);
    if (!layer) return frame.openStop?.(stop);
    layer.openPopup();
    return (
      document.querySelector<HTMLElement>('.party-card:not([hidden]) .stop-popup') ??
      showing.popup?.getElement() ??
      undefined
    );
  };

  /**
   * A gym's dot tapped (not taken by route mode or a place picked): the list of the things at its
   * place where parties share it (plan 8M-7), else `own`, its own popup. Find's pick of a gym by
   * name opens it so too (branch review BR-2).
   */
  const tapGym = (gym: MapGym, own: () => void): void => {
    tapPlaced(
      {
        key: `gym-dot:${gym.id}`,
        gymId: gym.id,
        lat: gym.lat,
        lon: gym.lon,
        picture: null,
        name: gym.name,
        time: 'Gym',
        // The list heads with the gym and lists what is at it first (plan 8M-15).
        place: { key: `gym:${String(gym.id)}`, name: gym.name },
      },
      own,
    );
  };
  /** Whether a place or a point is picked: the activity layer's circles give way (review P4). */
  const picksPlace = (): boolean => pickingPlace() || trainForms.routing() !== undefined;
  /** Whether a place or a point is picked, as the page was last told (`picksChanged`). */
  let picksTold = false;
  /** The page told when whether a place or a point is picked changed (review R1). */
  const tellPicks = (): void => {
    const now = picksPlace();
    if (now === picksTold) return;
    picksTold = now;
    frame.picksChanged?.();
  };
  /** While a place is picked the trains' and meetups' rings and lines let taps through. */
  const pickingPlace = (): boolean =>
    meetupForms.picking() || report.inTools() || researchForms.adding();
  /** A dot tapped: its own popup, or the list of what is at its place with the dot's own. */
  const tapPlaced = (target: PlacedThing, own: () => void): void => {
    const here = sharedPlace(target, [target, ...shownThings()], toPixel);
    if (here.length <= 1) own();
    else openList(here, { key: target.key, open: own });
  };
  /**
   * A PokéStop's or Power Spot's dot, as a gym's (Matt, 2026-10-30): it names its place by the key
   * a meetup or a train there has. A battle at the spot, drawn as a dot with the Raids layer off,
   * is what `own` opens, so its choice names the battle (review R4).
   */
  const tapDot = (layer: 'stops' | 'spots', place: MapSpot, own: () => void): void => {
    const stop = layer === 'stops';
    const standing = stop ? undefined : view?.maxes.find((one) => one.spotId === place.id);
    tapPlaced(
      {
        key: `${stop ? 'stop' : 'spot'}-dot:${place.id}`,
        gymId: null,
        lat: place.lat,
        lon: place.lon,
        picture: null,
        name: standing?.title ?? place.title,
        time: stop ? 'PokéStop' : 'Power Spot',
        place: { key: `${stop ? 'stop' : 'spot'}:${place.id}`, name: place.title },
      },
      own,
    );
  };

  /** The battle that stands at a Power Spot opened on its own marker (true), where there is one. */
  const openBattle = (spotId: string): boolean => {
    const max = view?.maxes.find((one) => one.spotId === spotId);
    return max ? openParty(`max:${max.id}`) : false;
  };

  // The Report button (plan 8M-9A): step 1's menu, step 2 in the side pane's box with the fitting
  // places drawn (the gyms through `forced`, the Power Spots through `forcedPlaces`), and step 3
  // the kind's own form, as a tap on its place opens it.
  const report = reportUi({
    // Step 2's five nearest Power Spots or PokéStops wherever they are (plan 8M-11A), as the
    // server's search of nearby places finds them; the view's places stay what the map draws.
    nearest: async (pick, at) => {
      const query = `near=${at.lat.toFixed(6)},${at.lon.toFixed(6)}&count=${String(NEAREST_COUNT)}`;
      try {
        const rows =
          pick === 'spots'
            ? (await getJson<PowerSpotsView>(`/s/${guild}/api/powerspots?${query}`)).spots
            : (await getJson<StopsView>(`/s/${guild}/api/stops?${query}`)).stops;
        return rows.map(([id, lat, lon, title]) => ({ id, lat, lon, title }));
      } catch {
        return 'failed';
      }
    },
    map,
    hold,
    tools,
    offered: () => reportOffered(mayReport, view),
    placesChanged: () => {
      frame.placesChanged?.();
    },
    // The parties drawn anew (R1-9: not from inside their own draw): the raids drawn while a raid's
    // step 2 picks gyms (C1), the trains' and meetups' lines and rings letting taps through.
    redrawn: () => {
      redrawParties();
    },
    // The phone card is a popup here (review B7): Escape and step 2's start close it as well.
    closePopup: () => {
      map.closePopup();
      card.close();
    },
    closeCard: () => {
      card.close();
    },
    showMap: () => {
      frame.showMap();
    },
    popupOpen: () => showing.popup !== undefined || card.key !== undefined,
    startTrain: (region) => {
      trainForms.newTrainClicked(region, true);
    },
    startMeetup: () => {
      // Its place picked at once by the form's own picking (A5), not a second picker.
      meetupForms.newMeetupClicked(true);
    },
    spawnAt: (point) => {
      spawnForms.spawnAt(spawnPoint(point.lat, point.lon), true);
    },
    regions,
    gyms,
    origin,
    units: frame.units,
    openRaid: (gym) => {
      // The raid that stands at the gym, on its own marker (C1, R2-1: its layer drawn while it
      // shows, also with the Raids layer off).
      if (!view?.raids.some((raid) => raid.gymId === gym.id)) return false;
      return openParty(`gym:${String(gym.id)}`);
    },
    toRaidForm: (gym) => {
      // The gym's popup, drawn now, and its "Report raid" pressed (A6: the form in its place).
      const button = frame.openGym?.(gym)?.querySelector<HTMLButtonElement>('button[data-report]');
      if (button) raidForms.reportClicked(button, gym, true, 'raid');
    },
    openBattle,
    toMaxForm: (spot) => {
      const button = frame
        .openSpot?.(spot)
        ?.querySelector<HTMLButtonElement>('button[data-report-max]');
      if (button) maxForms.maxClicked(button, spot, true, 'max');
    },
    maxAt: (point) => {
      maxForms.maxAt(point, true);
    },
    onSpots: (listener) => {
      frame.onSpots?.(listener);
    },
    onStops: (listener) => {
      frame.onStops?.(listener);
    },
    // A report at a stop's step 3 (B9): the stop's own popup (or card) opened at it, and its
    // kind's form in it, its first field focused (B8).
    toStop: (kind, stop) => {
      const shown = openStopAt(stop);
      if (kind === 'research') {
        const research = shown?.querySelector<HTMLButtonElement>('button[data-report-research]');
        if (research) researchForms.researchClicked(research, 'input[name="query"]');
        else {
          researchForms.researchAt({
            key: stop.id,
            name: stop.title,
            at: { lat: stop.lat, lon: stop.lon },
          });
        }
        return;
      }
      const button = shown?.querySelector<HTMLButtonElement>('button[data-report-rocket]');
      if (button) rocketForms.rocketClicked(button, true, 'rocket');
    },
  });
  report.refresh();

  const pageTimer = (run: () => void, ms: number): (() => void) => {
    const timer = window.setTimeout(run, ms);
    return () => {
      window.clearTimeout(timer);
    };
  };
  /** The list as the server last gave it, drawn or waiting under a form. */
  let listed: PartiesView | undefined;
  const poller = new Poller({
    now: () => Date.now(),
    everyMs: EVERY_MS,
    active: () => activity.active(),
    setTimer: pageTimer,
    // Who is refused here is refused on the stream too, which says no status of its own.
    stopped: () => {
      live.stop();
    },
    load: async (spreadMs) => {
      try {
        // The browser asks again with the ETag it has; a 304 gives the body it kept.
        const answer = await fetch(`/s/${guild}/api/parties`, {
          credentials: 'same-origin',
          ...listAskLimit(),
        });
        if (answer.status === 401 || answer.status === 403) return 'stop';
        if (!answer.ok) {
          partiesPace.answered(false, listed?.readOnly ?? false);
          return 'go';
        }
        const text = await answer.text();
        if (text !== shown) {
          shown = text;
          const next = JSON.parse(text) as PartiesView;
          listed = next;
          listSpread = spreadMs;
          // Not under a form that is being filled in: once it closes.
          hold.shown(next);
        }
        partiesPace.answered(true, listed?.readOnly ?? false);
        partiesPace.atNext(nextPartyMoment(listed, Date.now()));
      } catch {
        // Offline for a moment: the next turn asks again.
        partiesPace.answered(false, listed?.readOnly ?? false);
      }
      return 'go';
    },
  });
  const partiesPace = new LiveList({
    poller,
    now: () => Date.now(),
    setTimer: pageTimer,
    spread: () => live.latestSpread,
  });
  // Live updates: a list changed asks for it at once, within the crowd's spread; the 20 seconds'
  // polling stays for whatever the stream does not reach.
  const live = new LiveConnection({
    open: () => liveSource(guild),
    active: () => activity.active(),
    now: () => Date.now(),
    random: () => Math.random(),
    setTimer: pageTimer,
    changed: (list, spread) => {
      (list === 'parties' ? partiesPace : stopReports.pace).signal(spread);
    },
    liveChanged: (on, spread) => {
      partiesPace.setLive(on, spread);
      stopReports.pace.setLive(on, spread);
    },
  });
  activity.onChange(() => {
    live.activeChanged();
  });
  activity.onChange(() => {
    // The region editor off: what was asked to be drawn meanwhile is drawn (W1).
    if (!activity.editingRegions() && hiddenDraw !== undefined) {
      const next = hiddenDraw;
      hiddenDraw = undefined;
      redraw(next);
    }
    poller.activeChanged();
  });
  // The device changed between light and dark (plan 8M-7): the parties drawn anew in the new
  // colors (not under a form being filled in: once it closes, as for a new list).
  onThemeChange(() => {
    redrawParties();
  });
  window.setInterval(() => {
    const now = Date.now();
    for (const element of document.querySelectorAll<HTMLElement>('[data-until]')) {
      element.textContent = countdown(Number(element.dataset.until), now);
    }
    // A post's relative times (plan 8M-8A), as Discord keeps them current.
    for (const element of document.querySelectorAll<HTMLElement>('time[data-relative]')) {
      element.textContent = postTime(Number(element.dataset.at), 'R', now);
    }
    // The raids' badges and their last minutes (plan 8M-7), between two lists, by the rules they
    // were drawn by (`markerNow`).
    const zone = readerZone();
    // A stop's popup or card (plan 8M-9B): a grunt's minutes, a report ended "Ended" (B14).
    stopControls.tick(document, now);
    // A stop's marker with a grunt (plan 8M-9B) by the same rules, by its grunt's end.
    for (const marker of document.querySelectorAll<HTMLElement>(
      '.raid-marker[data-stage], .stop-marker[data-stage]',
    )) {
      const shown = markerNow(marker.dataset, now, zone);
      const badge = marker.querySelector('.badge');
      if (badge) badge.textContent = shown.badge;
      marker.classList.toggle('dim', shown.dimmed);
    }
  }, COUNTDOWN_MS);
  void poller.start();
  stopReports.start();
  live.start();
  return {
    closeOpen: () => {
      map.closePopup();
      card.close();
    },
    openRegions: () => {
      regionsBox.open();
    },
    regionsLoaded,
    // Find takes no word while it stands aside (BR-1): the box thins the gyms then, and a search
    // shown before ends, so that nothing draws into the hidden list.
    find: (text) => {
      const thinned = boxThins();
      if (findOff()) typedAside = true;
      finder.typed(findOff() ? '' : text);
      // The first word during a mode ends Find's search and thins the gyms (M1): drawn anew.
      if (boxThins() !== thinned) frame.boxChanged?.();
    },
    findOff: () => findOff(),
    boxThins,
    finding: () => finder.state !== undefined,
    findFirst: () => {
      if (findOff() || !finder.now()) return;
      const state = finder.state;
      const first = state && firstFound(findGroups(state));
      if (first) pickLine(first);
      else finder.pickWhenFound();
    },
    reportStops: () => stopReports.stops(),
    stopPopup: (stop) =>
      draw(
        plainStopPopup(
          stop,
          stopContext({ key: stop.id, name: stop.title, at: { lat: stop.lat, lon: stop.lon } }),
        ),
      ),
    spotPopup: (spot) => draw(spotHead(spot)),
    gymControls: (gym) =>
      reportOffered(mayReport, view)
        ? [
            raidForms.reportControl(gym),
            spawnForms.spawnControl(gym),
            meetupHereControl(gym),
            trainHereControl(String(gym.id), firstStopAtGym(gym), gym),
          ]
        : [],
    editing: () => hold.editing,
    gymClicked: (gym) => gymClicked(gym),
    spotClicked: (spot) => report.spotClicked(spot) || trainForms.spotClicked(spot),
    forced: () =>
      trainForms.routing() !== undefined || meetupForms.picking() || report.picks('gyms'),
    // The PokéStops are drawn to pick also while the research form adds stops (plan 8M-9B).
    forcedPlaces: (layer) => report.picks(layer) || (layer === 'stops' && researchForms.adding()),
    picksPlace,
    raidsShown,
    raidGyms: () => raidGyms,
    spotControls: (spot) =>
      reportOffered(mayReport, view)
        ? [maxForms.maxControl(spot), trainHereControl(spot.id, firstStopAtSpot(spot), spot)]
        : [],
    battleSpots: () => battleSpots,
    openBattle,
    // A PokéStop's dot in step 2: step 3 of a report at a stop (B9), the pin of a spawn or a max
    // battle at its place (review B6).
    stopTapped: (stop) => stopClicked(stop),
    gymTapped: (gym, own) => {
      tapGym(gym, own);
    },
    placeTapped: (layer, place, own) => {
      // While a place is picked or a train routed, as the rings: no list of parties (review R2).
      if (trainForms.routing() !== undefined || pickingPlace()) own();
      else tapDot(layer, place, own);
    },
  };
}
