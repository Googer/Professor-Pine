import * as L from 'leaflet';
// Leaflet first: Geoman's script adds itself to the global `L` that Leaflet's sets.
import '@geoman-io/leaflet-geoman-free';
import { readKml, writeKml } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  applyEdits,
  exportAreas,
  hasArea,
  kmlEdit,
  newKey,
  rebaseAfterSave,
  record,
  redo,
  regionsChanged,
  saveRequest,
  toLatLons,
  undo,
  type Applied,
  type Bases,
  type Draft,
  type Edit,
  type EditState,
  type LoadedRegion,
} from '../../domain/regions/edits.js';
import type { FixChoice } from '../../domain/regions/fix.js';
import type { DistanceUnits } from './distance.js';
import { MAX_NEW_CATEGORY, MAX_NEW_CHANNEL_NAME } from '../../domain/regions/save-plan.js';
import {
  cornerSharers,
  movedCorner,
  cornerRemoval,
  sharedCornerEdit,
} from '../../domain/regions/shared-corners.js';
import { splitOutline, type Split } from '../../domain/regions/split.js';
import { normalisedOutline, roundSix } from '../../domain/regions/version.js';
import type { EditorData, Point, Worded } from '../../domain/web/editor-data.js';
import { addTiles, getJson, say as sayOnPage, whoIsAsking } from './common.js';
import type {
  CoverageAnswer,
  CoverageRegion,
  CoverageRequest,
  PlaceKind,
  ShownOption,
  ShownOutline,
  ShownPiece,
  ShownStretch,
} from './coverage-check.js';
import {
  cannotFixWords,
  channelChoices,
  choiceWords,
  count,
  coverageSummary,
  outsideLine,
  theirsLine,
  type Swatched,
  draftLabel,
  exportFileName,
  FIX_FAILED_WORDS,
  fixAllWords,
  fixBoxPadding,
  fixFocus,
  fixesOffered,
  firstView,
  reopenRefusal,
  fixPick,
  fixWaiting,
  landingWords,
  loadedRegions,
  outlineProblems,
  pickerChange,
  pickerShown,
  pieceLine,
  pieceOrder,
  placeCounts,
  readSaveAnswer,
  reloadFailedLine,
  saveBody,
  saveReadiness,
  splitPartner,
  stretchTitle,
  type PickerState,
  type PlaceCounts,
  placeLayers,
  type PlaceLayer,
  unsavedLine,
  notChangedWords,
  notDeletedWords,
  KML_PROBLEMS,
  KML_TOO_LARGE,
  NO_STORAGE,
  removalWords,
  REMOVAL_MARK,
  fixedAsOneWords,
  kmlLoadedWords,
  OUTCOME_UNKNOWN,
  OUTCOME_UNKNOWN_RELOAD,
  type ReadAnswer,
} from './editor-view.js';
import {
  CLOSE_FORM_FIRST,
  EDITOR_FAILED,
  type EditorClosed,
  type EditorHosts,
} from './editor-mount.js';
import { ClusteredPlaces } from './editor-places.js';
import type { Me } from './notice.js';
import { regionLabel, renderNode } from './popup.js';
import { failureWords, timed } from './request-error.js';
import {
  browserStorage,
  readMoveTogether,
  readStaged,
  storageKey,
  writeMoveTogether,
  writeStaged,
} from './staged-storage.js';
import { onThemeChange, theme, type Theme } from './theme.js';

/**
 * The region editor (spec 4, plans 8M-2 and 8M-10), bundled by `scripts/web/build.ts` beside the
 * map, whose page loads it when the editor is first turned on and opens it through the mount it
 * registers (`editor-mount.ts`), in its hosts (its own map, the tool row, the side panel):
 * Leaflet (on a canvas, for thousands of places) with Geoman's tools to draw, reshape and move
 * regions, snapping to the corners and edges of every outline; the server's regions labelled
 * with their channels and gym counts, other servers' in grey; the gyms, stops, power spots and
 * Wayfarer gyms, those in no region in a warning colour; the overlaps and gaps (worked out in a
 * worker) shaded and listed. Every change is a staged edit (`edits.ts`), kept in the browser,
 * undone and redone, and saved through a preview. Everything from data is set as text. Its
 * colours are the page's theme (`theme.css`, read by `theme.ts`).
 */

/** The colours the editor draws, from the page's theme. */
const colours = (): Theme['colours'] => theme().colours;

/** Whether the editor's hosts are shown: hidden, it says nothing over the live map (F2). */
let shownNow = false;

/**
 * Says a line on the page while the editor is shown; a lasting state (read-only, the browser's
 * storage: review fix F1) stays until its × or the editor's closing hides it.
 */
function say(text: string, options: { lasting?: boolean } = {}): void {
  if (shownNow) sayOnPage(text, options);
}

/** "Back to the map"'s title while a preview or a save is being sent (review 1, F2). */
const BACK_WAITS = 'Wait for the answer of the preview or the save.';

/** How long the editor waits after an edit before the overlaps and gaps are worked out again. */
const CHECK_DELAY_MS = 400;
/** How many overlaps and gaps the panel lists; the map shades them all. */
const LISTED_PIECES = 200;
/** The largest KML file the editor reads, as `/region import` takes. */
const MAX_KML_BYTES = 1_000_000;

const SPLIT_PROBLEMS: Readonly<Record<Extract<Split, { ok: false }>['reason'], string>> = {
  'not-across': 'Draw the line across the region: from outside it, through it, to outside it.',
  'several-crossings':
    'The line crosses the region more than once: draw one that goes across it once.',
  'crosses-itself': 'The line crosses itself inside the region.',
  'too-many-corners': 'A part would have more than 5,000 corners.',
};

/** An element with a class and text. */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  if (text !== undefined) made.textContent = text;
  if (className !== undefined) made.className = className;
  return made;
}

/**
 * A button in Discord's look (plan 8M-10): gray by default, blurple for the step it leads to
 * (`primary`: Save…, Apply, Save these changes), red for what deletes (`danger`).
 */
function button(
  text: string,
  onClick: () => void,
  disabled = false,
  kind: 'primary' | 'danger' | undefined = undefined,
): HTMLButtonElement {
  const made = element('button', text, kind);
  made.type = 'button';
  made.disabled = disabled;
  made.addEventListener('click', onClick);
  return made;
}

/**
 * A sentence with the swatch of what it refers to on the map before it (plan 8M-10, C10): the
 * sentence names no color; the swatch, colored by `theme.css`, is no word for a screen reader.
 */
function swatched(tag: 'p' | 'li' | 'span', line: Swatched, className?: string): HTMLElement {
  const made = element(tag, undefined, className);
  if (line.swatch !== undefined) {
    const swatch = element('span', undefined, `swatch swatch-${line.swatch}`);
    swatch.setAttribute('aria-hidden', 'true');
    made.append(swatch);
  }
  made.append(line.text);
  return made;
}

/** A polygon's outer ring as places, closed, as the staged edits keep it (`normalisedOutline`). */
function ringOf(layer: L.Polygon): LatLon[] {
  const rings = layer.getLatLngs() as L.LatLng[][];
  const ring = (rings[0] ?? []).map(({ lat, lng }) => ({ lat, lon: lng }));
  const first = ring[0];
  if (first) ring.push({ ...first });
  return normalisedOutline(ring);
}

/** Places as Leaflet takes them (`lng`, not `lon`). */
const latLngs = (outline: readonly LatLon[]): L.LatLngTuple[] =>
  outline.map(({ lat, lon }) => [lat, lon]);

const sameRing = (a: readonly LatLon[] | null, b: readonly LatLon[]): boolean =>
  a !== null &&
  a.length === b.length &&
  a.every((p, i) => p.lat === b[i]?.lat && p.lon === b[i]?.lon);

/** A fix's outlines as one staged edit (one step of undo). */
const fixEdit = (outlines: readonly ShownOutline[], bases: (keys: string[]) => Bases): Edit => ({
  kind: 'batch',
  edits: outlines.map(({ key, outline }) => ({
    kind: 'outline',
    key,
    outline: toLatLons(outline),
    bases: bases([key]),
  })),
});

/**
 * The corner marker's place above other markers: above Geoman's vertex and hint markers (whose
 * offsets go to 150), so that it is the one a drag takes.
 */
const CORNER_Z_OFFSET = 1_000;

/** Shows a preview's or an outcome's sentences and lists in an element, as text. */
function showWorded(target: HTMLElement, worded: Worded): void {
  for (const line of worded.lines) target.append(element('p', line));
  for (const list of worded.lists) {
    target.append(element('h3', list.title));
    const items = element('ul');
    for (const item of list.items) items.append(element('li', item));
    target.append(items);
  }
}

class Editor {
  private loaded: LoadedRegion[];
  private state: EditState;
  private applied: Applied;
  private counts: PlaceCounts;
  private selected: string | undefined;
  private splitting: string | undefined;
  private pieces: ShownPiece[] = [];
  private checking = false;
  private checkFailed = false;
  /** Whether a check of the overlaps and gaps went through since the editor opened. */
  private checkedOnce = false;
  private seq = 0;
  private timer: number | undefined;
  /** How many previews and saves are being sent (`whileSending`). */
  private sending = 0;
  /** What became of the staged edits in the browser the last time (`writeStaged`). */
  private stored: 'kept' | 'full' | 'none' = 'kept';
  /** The body the last preview was of: Save sends it, and only it. */
  private previewed: string | undefined;
  private dialog: HTMLElement | undefined;
  /**
   * A new region's channel picker as it is being filled in (`pickerShown`): kept while the
   * panel is drawn anew, dropped by any other edit, undo, redo or a reload.
   */
  private picker: PickerState | undefined;
  /**
   * Whether the list of overlaps and gaps is worst first: the page was opened with nothing
   * staged for the server (spec 4.3, "the first time … worst first").
   */
  private readonly worstFirst: boolean;
  /**
   * The Fix of one stretch (plan 8M-2F): its id, the worker's answer once it came, the choice
   * shown, where three regions meet as dragged, and how many answers are still to come (Apply
   * waits for the answer to the last drag).
   */
  private fixing:
    | {
        stretch: string;
        answer?: Extract<CoverageAnswer, { kind: 'fix-options' }>;
        picked?: FixChoice;
        corner?: Point;
        waiting: number;
      }
    | undefined;
  /**
   * A shared corner being dragged (plan 8M-10, C13): the region dragged, where the corner was,
   * the regions that share it, and where it was let go.
   */
  private cornerDrag: { key: string; from: LatLon; sharers: string[]; to?: LatLon } | undefined;
  /**
   * A shared corner being deleted (plan 8M-11C, S32): the region Geoman deletes it from and the
   * batch that deletes it in every region that has it, for the `pm:edit` of that deletion.
   */
  private pendingRemoval: { key: string; edit: Edit } | undefined;
  /** "Move shared corners together": on unless the browser keeps it off (`readMoveTogether`). */
  private moveTogether: boolean;
  /** Fix all: waiting for the worker, or its question. */
  private fixingAll: 'working' | Extract<CoverageAnswer, { kind: 'fix-all' }> | undefined;
  /** The number of the page's last request of Fix all: only the answer to it is taken. */
  private fixAsk = 0;
  /** The number of Fix all's question the Fix box shows, none while none (re-review V3). */
  private fixQuestion: number | undefined;
  /** What a fix would make, dashed, and the corner where three regions meet. */
  private readonly fixPreview = L.layerGroup();
  /** The Fix box over the map's top right corner (plan 8M-10, C12), hidden while no fix is open. */
  private readonly fixHost = element('div', undefined, 'fix-box');
  private corner: L.Marker | undefined;
  /** The parts of the panel an answer of the worker changes (`checked`), as last drawn. */
  private readonly checkedParts = {
    reasons: element('div'),
    warning: element('div'),
    pieces: element('div'),
  };
  private readonly key: string;
  /** The member it was opened for: its staged edits are theirs (`reopenRefusal`, W6). */
  readonly userId: string;
  private readonly regions = L.featureGroup();
  private readonly removed = L.layerGroup();
  private readonly theirs = L.layerGroup();
  private readonly shaded = L.layerGroup();
  private readonly regionLayers = new Map<string, L.Polygon>();
  /** The layers of the places and of other servers' outlines (the stops off at first). */
  private readonly places = {
    gyms: L.layerGroup(),
    stops: L.layerGroup(),
    powerspots: L.layerGroup(),
    wayfarerGyms: L.layerGroup(),
    others: L.layerGroup(),
  };
  /** The places of each layer, clustered when zoomed out (plan 8M-11C, S30). */
  private readonly clustered: Record<PlaceLayer, ClusteredPlaces>;
  private readonly versions = new WeakMap<readonly LatLon[], string>();
  private versionCount = 0;
  /** The browser's storage, or none where it keeps nothing for the page. */
  private readonly storage = browserStorage(() => window.localStorage);

  constructor(
    private readonly map: L.Map,
    private data: EditorData,
    private me: Me,
    private readonly worker: Worker,
    /** The units distances are said in (`data-distance-units`; review fix 8). */
    private readonly units: DistanceUnits,
    /** Where it draws on the map page (plan 8M-10). */
    private readonly hosts: EditorHosts,
  ) {
    this.userId = data.userId;
    this.key = storageKey(data.guild.id, data.userId);
    this.moveTogether = readMoveTogether(this.storage);
    this.loaded = loadedRegions(data);
    this.state = readStaged(this.storage, this.key);
    this.worstFirst = this.state.edits.length === 0 && this.state.undone.length === 0;
    this.applied = applyEdits(this.loaded, this.state);
    this.counts = placeCounts(this.applied.drafts, data);
    const layer = (
      group: L.LayerGroup,
      className: string,
      word: string,
      colour: () => string,
      radius: number,
    ): ClusteredPlaces =>
      new ClusteredPlaces(map, group, {
        className,
        title: (n) => count(n, word),
        colour: (outside) => (outside ? colours().outside : colour()),
        dot: (place, outside) =>
          L.circleMarker([place.lat, place.lon], {
            radius,
            weight: 1,
            color: outside ? colours().outside : colour(),
            fillColor: colour(),
            fillOpacity: 0.8,
            pmIgnore: true,
          }),
      });
    this.clustered = {
      gyms: layer(this.places.gyms, 'places-gyms', 'gym', () => colours().editorGym, 5),
      stops: layer(this.places.stops, 'places-stops', 'PokéStop', () => colours().editorStop, 3),
      powerspots: layer(
        this.places.powerspots,
        'places-powerspots',
        'Power Spot',
        () => colours().powerSpot,
        4,
      ),
      wayfarerGyms: layer(
        this.places.wayfarerGyms,
        'places-wayfarer-gyms',
        'Wayfarer gym',
        () => colours().wayfarerGym,
        4,
      ),
    };
    worker.addEventListener('message', (event: MessageEvent<CoverageAnswer>) => {
      const answer = event.data;
      if (answer.kind === 'check') this.answered(answer);
      else if (answer.kind === 'fix-options') this.fixAnswered(answer);
      else this.fixAllAnswered(answer);
    });
    // A worker that does not load works nothing out: Save then waits for nothing (the server
    // checks the overlaps and gaps of a save itself). Nor are fixes offered until a check is
    // through (`fixesOffered`): the pieces listed may be those of the regions before.
    worker.addEventListener('error', () => {
      this.checking = false;
      this.checkFailed = true;
      this.toolbar();
      this.checked();
    });
  }

  /** Opened the first time: everything drawn at the map's view (the live map's, plan 8M-10). */
  start(): void {
    const { map } = this;
    this.places.gyms.addTo(map);
    this.places.powerspots.addTo(map);
    this.places.wayfarerGyms.addTo(map);
    this.places.others.addTo(map);
    this.regions.addTo(map);
    this.removed.addTo(map);
    this.theirs.addTo(map);
    this.shaded.addTo(map);
    this.fixPreview.addTo(map);
    // The names are constants of ours: Leaflet sets them as HTML.
    L.control
      .layers(
        undefined,
        {
          Gyms: this.places.gyms,
          'Stops (many: off at first)': this.places.stops,
          'Power Spots': this.places.powerspots,
          'Wayfarer gyms Pine did not take': this.places.wayfarerGyms,
          "Other servers' regions": this.places.others,
          'Overlaps and gaps': this.shaded,
        },
        { position: 'topright', collapsed: true },
      )
      .addTo(map);
    // The Fix box, under the layer switch: a press or a scroll in it never reaches the map.
    this.fixHost.hidden = true;
    L.DomEvent.disableClickPropagation(this.fixHost);
    L.DomEvent.disableScrollPropagation(this.fixHost);
    const fixBox = new L.Control({ position: 'topright' });
    fixBox.onAdd = () => this.fixHost;
    fixBox.addTo(map);
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, exitModeOnEscape: true });
    map.on('pm:create', (event: { shape: string; layer: L.Layer }) => {
      this.created(event.shape, event.layer);
    });
    // The places of the view, clustered when zoomed out (S30): at each move, and a layer the
    // switch turns on at once.
    map.on('moveend overlayadd', () => {
      this.refreshPlaces();
    });
    this.drawPlaces();
    this.tools();
    this.toolbar();
    this.drawRegions();
    this.recolour();
    this.noRegionsYet();
    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.placeList() });
    this.check();
    this.panel();
    // The device changed between light and dark (plan 8M-7): the regions drawn anew in the new
    // set (the places keep their colors in both: `theme.css`). Listened for last (review 2, R5):
    // a first build that failed before this leaves no listener behind.
    onThemeChange(() => {
      this.redraw();
    });
  }

  /**
   * Opened again (plan 8M-10): the data as the server has it now (asked fresh at every opening),
   * the staged edits as the browser keeps them, rebased on nothing (a conflict is a conflict).
   */
  reopened(data: EditorData, me: Me): void {
    this.me = me;
    const placesChanged = placesKey(data) !== placesKey(this.data);
    this.took(data, false);
    if (placesChanged) this.drawPlaces();
    this.tools();
    this.recolour();
    this.noRegionsYet();
  }

  /**
   * Turned off (plan 8M-10; the map hides its hosts): a drawing under way is dropped, the staged
   * edits stay. Where its map was, and how many regions the staged edits change (review C4).
   */
  hidden(): EditorClosed {
    this.splitting = undefined;
    if (!this.data.readOnly) this.map.pm.disableDraw();
    // Work in flight is not taken once hidden (review 1, F2): a fix shown or asked for is
    // dropped, the worker's late answers are of an older request, no check waits to be asked.
    window.clearTimeout(this.timer);
    this.seq += 1;
    this.fixAsk += 1;
    this.closeFix();
    const center = this.map.getCenter();
    return {
      view: { lat: center.lat, lon: center.lng, zoom: this.map.getZoom() },
      unsaved: regionsChanged(this.state),
    };
  }

  /** Its map fitted to the regions drawn, where there are any (W2). */
  fitRegions(): void {
    const bounds = this.regions.getBounds();
    if (bounds.isValid()) this.map.fitBounds(bounds);
  }

  private noRegionsYet(): void {
    if (!this.regions.getBounds().isValid()) {
      say('This server has no regions yet: draw the first one.');
    }
  }

  /**
   * The places and other servers' outlines of the data, drawn anew into their layers (kept, so
   * that the layer switch keeps them): a place in no region is colored anew (`recolour`).
   */
  private drawPlaces(): void {
    const { data } = this;
    const { gyms, stops, powerspots, wayfarerGyms, others } = this.places;
    for (const group of [gyms, stops, powerspots, wayfarerGyms, others]) group.clearLayers();
    for (const other of data.others) {
      // Not editable, but snapped to: shared borders meet.
      L.polygon(other.outline, {
        color: colours().others,
        weight: 1,
        dashArray: '4 4',
        fillOpacity: 0.03,
        pmIgnore: true,
        snapIgnore: false,
      }).addTo(others);
    }
    const layers = placeLayers(data);
    for (const [name, places] of Object.entries(this.clustered) as [
      PlaceLayer,
      ClusteredPlaces,
    ][]) {
      places.setPlaces(layers[name]);
    }
    this.recolour();
    this.refreshPlaces();
  }

  /** The places of the view drawn anew in every layer that is on (S30). */
  private refreshPlaces(): void {
    for (const places of Object.values(this.clustered)) places.refresh();
  }

  /** A shape drawn with Geoman's tools: a new region, or the line of a split. */
  private created(shape: string, layer: L.Layer): void {
    layer.remove();
    if (shape === 'Line' && this.splitting !== undefined) {
      this.split(this.splitting, (layer as L.Polyline).getLatLngs() as L.LatLng[]);
      return;
    }
    if (shape !== 'Polygon' && shape !== 'Rectangle') return;
    const key = newKey(this.state.next);
    this.edit({
      kind: 'add',
      key,
      outline: ringOf(layer as L.Polygon),
      channel: null,
      description: null,
    });
    this.selected = key;
    this.redraw();
  }

  /**
   * Geoman's tools: draw a polygon or a rectangle, reshape, move; snapping on. None while the
   * editor is read-only (Discord away), shown again when it is not at a later opening.
   */
  private tools(): void {
    const { map } = this;
    if (this.data.readOnly) {
      if (map.pm.controlsVisible()) map.pm.removeControls();
      return;
    }
    if (map.pm.controlsVisible()) return;
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawCircle: false,
      drawText: false,
      drawRectangle: true,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });
  }

  /** The header's tools: undo, redo, a KML file in and out, Save. */
  private toolbar(): void {
    const tools = this.hosts.tools;
    tools.replaceChildren();
    const readOnly = this.data.readOnly;
    const file = element('input');
    file.type = 'file';
    file.accept = '.kml';
    file.hidden = true;
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (chosen) void this.loadKml(chosen);
    });
    const ready = this.readiness();
    const fixable = this.pieces.some((piece) => 'stretch' in piece.fix);
    tools.append(
      button('Undo', () => this.step(undo), readOnly || this.state.edits.length === 0),
      button('Redo', () => this.step(redo), readOnly || this.state.undone.length === 0),
      button(
        'Fix all slivers…',
        () => this.startFixAll(),
        !fixesOffered({ readOnly, checkFailed: this.checkFailed }) ||
          this.checking ||
          !fixable ||
          this.fixingAll !== undefined,
      ),
      button('Load KML', () => file.click(), readOnly),
      file,
      button('Export KML', () => this.exportKml()),
      button('Save…', () => void this.whileSending(() => this.preview()), !ready.ready, 'primary'),
    );
    if (!readOnly) tools.append(this.moveTogetherSwitch());
  }

  /**
   * "Move shared corners together" (plan 8M-10, C13): on, a corner several regions share moves in
   * all of them; off, a region's corner is dragged apart. Remembered per browser.
   */
  private moveTogetherSwitch(): HTMLElement {
    const label = element('label', undefined, 'tool-switch');
    const box = element('input');
    box.type = 'checkbox';
    box.checked = this.moveTogether;
    box.addEventListener('change', () => {
      this.moveTogether = box.checked;
      writeMoveTogether(this.storage, box.checked);
    });
    label.append(box, 'Move shared corners together');
    return label;
  }

  /** The versions of the loaded regions these keys stand for, as an edit carries them. */
  private bases(keys: readonly string[]): Bases {
    const bases: Bases = {};
    for (const key of keys) {
      const region = this.loaded.find((one) => `r${one.id}` === key);
      if (region) bases[key] = region.version;
    }
    return bases;
  }

  /**
   * Records an edit, keeps the state in the browser and shows what it changed. An edit that is
   * not the channel picker's own drops what was being typed into it.
   */
  private edit(made: Edit, fromPicker = false): void {
    if (!fromPicker) this.picker = undefined;
    this.state = record(this.state, made, { at: Date.now() });
    this.changed();
  }

  private step(move: (state: EditState) => EditState): void {
    this.picker = undefined;
    this.state = move(this.state);
    this.changed();
    this.redraw();
  }

  /** After every change of the staged edits: kept, counted, coloured, checked, shown. */
  private changed(): void {
    // A fix shown was worked out on the regions before: it is dropped.
    this.dropFixes();
    this.applied = applyEdits(this.loaded, this.state);
    const stored = writeStaged(this.storage, this.key, this.state);
    if (stored !== this.stored) {
      if (stored === 'full') {
        say("This browser's storage for the page is full: save or discard some changes.", {
          lasting: true,
        });
      } else if (stored === 'none') {
        say(NO_STORAGE, {
          lasting: true,
        });
      }
    }
    this.stored = stored;
    this.counts = placeCounts(this.applied.drafts, this.data);
    this.recolour();
    this.labels();
    this.check();
    this.toolbar();
    this.panel();
  }

  private draft(key: string): Draft | undefined {
    return this.applied.drafts.find((draft) => draft.key === key);
  }

  /** The colour of a region: its own, or red when its outline cannot be saved. */
  private colour(draft: Draft, index: number, problems: ReadonlyMap<string, string>): string {
    const { palette } = theme();
    return problems.has(draft.key)
      ? colours().broken
      : (palette[index % palette.length] ?? colours().region);
  }

  /** Draws every region anew (after an undo, a split, a file): Geoman's modes are kept. */
  private redraw(): void {
    const { pm } = this.map;
    const editing = !this.data.readOnly && pm.globalEditModeEnabled();
    const dragging = !this.data.readOnly && pm.globalDragModeEnabled();
    if (editing) pm.disableGlobalEditMode();
    if (dragging) pm.disableGlobalDragMode();
    this.drawRegions();
    if (editing) pm.enableGlobalEditMode();
    if (dragging) pm.enableGlobalDragMode();
  }

  private drawRegions(): void {
    this.regions.clearLayers();
    this.removed.clearLayers();
    this.theirs.clearLayers();
    this.regionLayers.clear();
    const problems = outlineProblems(this.applied.drafts);
    this.applied.drafts.forEach((draft, index) => {
      if (draft.outline === null) return;
      if (draft.removed !== null) {
        L.polygon(latLngs(draft.outline), {
          color: colours().others,
          weight: 2,
          dashArray: '6 6',
          fillOpacity: 0,
          pmIgnore: true,
        })
          .on('click', () => this.select(draft.key))
          .addTo(this.removed);
        return;
      }
      const layer = L.polygon(latLngs(draft.outline), {
        color: this.colour(draft, index, problems),
        weight: draft.key === this.selected ? 4 : 2,
        fillOpacity: 0.06,
        pmIgnore: this.data.readOnly,
      });
      layer.bindTooltip(renderNode(regionLabel(this.labelText(draft)), document), {
        permanent: true,
        direction: 'center',
        className: 'region-label',
      });
      layer.on('click', () => this.select(draft.key));
      const reshaped = (): void => this.reshaped(draft.key, layer);
      layer.on('pm:edit', reshaped);
      layer.on('pm:dragend', reshaped);
      // A corner dragged: where others share it, they follow (plan 8M-10, C13).
      layer.on('pm:markerdragstart', (event: { markerEvent: L.LeafletEvent }) => {
        this.cornerDragStarted(draft.key, event.markerEvent.target as L.Marker);
      });
      layer.on('pm:markerdrag', (event: { markerEvent: L.LeafletEvent }) => {
        this.cornerDragged(event.markerEvent.target as L.Marker);
      });
      layer.on('pm:markerdragend', (event: { markerEvent: L.LeafletEvent }) => {
        this.cornerDropped(event.markerEvent.target as L.Marker);
      });
      // A corner deleted (a right click in Geoman's edit mode): where others share it, they lose
      // it too, or nothing is deleted (plan 8M-11C, S32).
      if (!this.data.readOnly) {
        layer.pm.setOptions({
          removeVertexValidation: ({ marker }) => this.cornerRemovable(draft.key, marker),
          // Never the whole outline taken with its third corner (branch review BR-1): a backstop
          // to the ring rule of `cornerRemoval`, which refuses such a deletion first.
          removeLayerBelowMinVertexCount: false,
        });
      }
      layer.addTo(this.regions);
      this.regionLayers.set(draft.key, layer);
    });
    // Regions changed by somebody else: how they are now, dashed beside the staged ones.
    for (const id of this.applied.conflicts) {
      const region = this.loaded.find((one) => one.id === id);
      if (region?.outline) {
        L.polygon(latLngs(region.outline), {
          color: colours().theirs,
          weight: 2,
          dashArray: '2 6',
          fillOpacity: 0,
          pmIgnore: true,
        }).addTo(this.theirs);
      }
    }
  }

  private labelText(draft: Draft): string {
    return `${draftLabel(draft)} · ${count(this.counts.gyms.get(draft.key) ?? 0, 'gym')}`;
  }

  /** The labels and colours of the regions, without drawing them anew (during an edit). */
  private labels(): void {
    const problems = outlineProblems(this.applied.drafts);
    this.applied.drafts.forEach((draft, index) => {
      const layer = this.regionLayers.get(draft.key);
      if (!layer) return;
      layer.setTooltipContent(renderNode(regionLabel(this.labelText(draft)), document));
      layer.setStyle({
        color: this.colour(draft, index, problems),
        weight: draft.key === this.selected ? 4 : 2,
      });
    });
  }

  /** A region reshaped or moved with Geoman's tools: its outline, staged. */
  private reshaped(key: string, layer: L.Polygon): void {
    const removal = this.pendingRemoval;
    this.pendingRemoval = undefined;
    // A shared corner deleted (S32): the batch worked out before Geoman deleted it, one step of
    // undo; every region drawn anew once Geoman is through (it took the corner from one alone).
    if (removal?.key === key) {
      this.edit(removal.edit);
      window.setTimeout(() => {
        this.redraw();
      }, 0);
      return;
    }
    const outline = ringOf(layer);
    const drag = this.cornerDrag;
    this.cornerDrag = undefined;
    // A shared corner dragged with "Move shared corners together" on: one batch, every region
    // that had the corner moved with it (one step of undo), drawn anew once Geoman is through.
    if (drag?.key === key && drag.to !== undefined && drag.sharers.length > 0) {
      const made = sharedCornerEdit(
        this.applied.drafts,
        { key, outline },
        drag.from,
        drag.to,
        (keys) => this.bases(keys),
      );
      if (made.kind === 'batch') {
        this.reshapedTo(made);
        return;
      }
    }
    if (sameRing(this.draft(key)?.outline ?? null, outline)) return;
    this.reshapedTo({ kind: 'outline', key, outline, bases: this.bases([key]) });
  }

  /**
   * A reshape staged, unless it leaves an outline of fewer than three distinct corners (`hasArea`;
   * branch review BR-1): then nothing is staged, the first such region is named (BR-4: "Not
   * changed: …"), and the regions are drawn again as they were once Geoman is through.
   */
  private reshapedTo(made: Edit): void {
    const outlines = (edit: Edit): { key: string; outline: LatLon[] }[] =>
      edit.kind === 'outline'
        ? [{ key: edit.key, outline: edit.outline }]
        : edit.kind === 'batch'
          ? edit.edits.flatMap(outlines)
          : [];
    const flat = outlines(made).find(({ outline }) => !hasArea(outline));
    if (!flat) {
      this.edit(made);
      return;
    }
    say(notChangedWords(this.name(flat.key)));
    window.setTimeout(() => {
      this.redraw();
    }, 0);
  }

  /**
   * A corner's drag began (Geoman's vertex marker): with "Move shared corners together" on, the
   * regions that have the same corner (`cornerSharers`) are its sharers, and no longer snapped to
   * while it is dragged (their corner moves with it: the marker would snap to itself).
   */
  private cornerDragStarted(key: string, marker: L.Marker): void {
    this.cornerDrag = undefined;
    if (!this.moveTogether) return;
    const at = marker.getLatLng();
    const from = { lat: roundSix(at.lat), lon: roundSix(at.lng) };
    const sharers = cornerSharers(this.applied.drafts, key, from);
    if (sharers.length === 0) return;
    for (const sharer of sharers) {
      const layer = this.regionLayers.get(sharer);
      if (layer) layer.options.snapIgnore = true;
    }
    this.cornerDrag = { key, from, sharers };
  }

  /**
   * Whether Geoman may delete a region's corner (its `removeVertexValidation`, S32). Never where
   * the region itself would keep fewer than three corners (branch review BR-1; why is said). With
   * "Move shared corners together" off, or a corner nobody shares, yes: the region's own edit, as
   * before. Shared, the deletion in every region that has it is worked out first: refused when
   * one of them would keep fewer than three corners (nothing deleted, and why said), else kept
   * for the `pm:edit` Geoman fires at once, and forgotten after this turn whatever Geoman did.
   */
  private cornerRemovable(key: string, marker: L.Marker): boolean {
    this.pendingRemoval = undefined;
    const at = marker.getLatLng();
    const decided = cornerRemoval(
      this.moveTogether,
      this.applied.drafts,
      key,
      { lat: roundSix(at.lat), lon: roundSix(at.lng) },
      (keys) => this.bases(keys),
    );
    if (decided.kind === 'allow') return true;
    if (decided.kind === 'refuse') {
      say(notDeletedWords(this.name(decided.region)));
      return false;
    }
    this.pendingRemoval = { key, edit: decided.edit };
    window.setTimeout(() => {
      this.pendingRemoval = undefined;
    }, 0);
    return true;
  }

  /** The corner dragged on: the sharers' outlines drawn with it where it is now. */
  private cornerDragged(marker: L.Marker): void {
    const drag = this.cornerDrag;
    if (!drag) return;
    const at = marker.getLatLng();
    const to = { lat: roundSix(at.lat), lon: roundSix(at.lng) };
    for (const sharer of drag.sharers) {
      const outline = this.draft(sharer)?.outline;
      const layer = this.regionLayers.get(sharer);
      if (outline && layer) layer.setLatLngs(latLngs(movedCorner(outline, drag.from, to)));
    }
  }

  /**
   * The corner let go: where it ends up, for the edit `pm:edit` stages next (`reshaped`); every
   * region drawn anew on the next turn, after Geoman is through with the drag (its markers of the
   * sharers are where they were, and a drag Geoman takes back stages nothing).
   */
  private cornerDropped(marker: L.Marker): void {
    const drag = this.cornerDrag;
    if (!drag) return;
    const at = marker.getLatLng();
    drag.to = { lat: roundSix(at.lat), lon: roundSix(at.lng) };
    window.setTimeout(() => {
      this.redraw();
    }, 0);
  }

  /**
   * The places in no region in the warning color, and the rings of the clusters that hold one
   * (S30); only the dots whose state changed are touched.
   */
  private recolour(): void {
    const gyms = new Set(this.counts.outsideGyms);
    const wayspots = new Set(this.counts.outsideWayspots);
    this.clustered.gyms.setOutside(gyms);
    this.clustered.stops.setOutside(wayspots);
    this.clustered.powerspots.setOutside(wayspots);
    this.clustered.wayfarerGyms.setOutside(wayspots);
  }

  private select(key: string | undefined): void {
    this.selected = key;
    this.labels();
    this.panel();
  }

  /** Splits a region along the line drawn (spec 4.2): the larger part keeps it. */
  private split(key: string, line: L.LatLng[]): void {
    this.splitting = undefined;
    const draft = this.draft(key);
    if (!draft?.outline) return;
    const split = splitOutline(
      draft.outline,
      line.map(({ lat, lng }) => ({ lat, lon: lng })),
    );
    if (!split.ok) {
      say(SPLIT_PROBLEMS[split.reason]);
      return;
    }
    const other = newKey(this.state.next);
    this.edit({
      kind: 'split',
      key,
      keep: split.parts[0],
      newKey: other,
      other: split.parts[1],
      bases: this.bases([key]),
    });
    this.selected = other;
    this.redraw();
    say('Split: the larger part keeps the region; give the new one its channel, or swap them.');
  }

  /** The loaded regions as the worker is told them once. */
  private loadedCoverage(): CoverageRegion[] {
    return this.loaded.flatMap((region) =>
      region.outline
        ? [
            {
              key: `r${region.id}`,
              version: this.version(region.outline),
              outline: region.outline.map(({ lat, lon }): [number, number] => [lat, lon]),
            },
          ]
        : [],
    );
  }

  /** A version of an outline for the worker: by the list itself, which an edit replaces. */
  private version(outline: readonly LatLon[]): string {
    let version = this.versions.get(outline);
    if (version === undefined) {
      version = `${++this.versionCount}`;
      this.versions.set(outline, version);
    }
    return version;
  }

  private placeList(): [PlaceKind, number, number][] {
    return [
      ...this.data.gyms.map(([, lat, lon]): [PlaceKind, number, number] => ['gym', lat, lon]),
      ...this.data.wayspots.map(([kind, lat, lon]): [PlaceKind, number, number] => [
        kind === 'gym' ? 'wayfarerGym' : kind,
        lat,
        lon,
      ]),
    ];
  }

  private post(message: CoverageRequest): void {
    this.worker.postMessage(message);
  }

  /** Asks the worker for the overlaps and gaps of the staged regions, once edits rest. */
  private check(): void {
    this.checking = true;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.seq += 1;
      this.post({
        kind: 'check',
        seq: this.seq,
        regions: this.applied.drafts.flatMap((draft) =>
          draft.removed === null && draft.outline !== null && draft.outline.length >= 4
            ? [
                {
                  key: draft.key,
                  version: this.version(draft.outline),
                  outline: draft.outline.map(({ lat, lon }): [number, number] => [lat, lon]),
                },
              ]
            : [],
        ),
      });
    }, CHECK_DELAY_MS);
  }

  private answered(answer: Extract<CoverageAnswer, { kind: 'check' }>): void {
    if (answer.seq !== this.seq) return;
    this.checking = false;
    this.checkFailed = answer.failed;
    if (!answer.failed) this.checkedOnce = true;
    this.pieces = answer.pieces;
    this.shaded.clearLayers();
    for (const piece of this.pieces) {
      L.polygon(piece.rings, {
        color: piece.kind === 'overlap' ? colours().overlap : colours().gap,
        weight: piece.fresh ? 3 : 1,
        fillOpacity: piece.fresh ? 0.5 : 0.3,
        pmIgnore: true,
      }).addTo(this.shaded);
    }
    this.toolbar();
    this.checked();
  }

  private readiness(): { ready: boolean; reasons: Swatched[] } {
    const { request, missingChannel } = saveRequest(this.loaded, this.applied.drafts);
    const changes = request.changes.length + request.additions.length + request.removals.length > 0;
    return saveReadiness({
      readOnly: this.data.readOnly,
      changes: changes || missingChannel.length > 0,
      problems: outlineProblems(this.applied.drafts),
      missingChannel,
      conflicts: this.applied.conflicts.length + this.applied.gone.length,
      fresh: {
        overlaps: this.pieces.filter((piece) => piece.fresh && piece.kind === 'overlap').length,
        gaps: this.pieces.filter((piece) => piece.fresh && piece.kind === 'gap').length,
      },
      checking: this.checking,
      checkFailed: this.checkFailed,
    });
  }

  private name(key: string): string {
    const draft = this.draft(key);
    return draft ? draftLabel(draft) : key;
  }

  /** The side panel: the dialog of a save, conflicts, the selected region, the lists. */
  private panel(): void {
    const panel = this.hosts.panel;
    panel.replaceChildren();
    // What waits in the browser, first under the tools (plan 8M-11C, S31): by the regions the
    // staged edits change, as "Edit regions · 3 unsaved" counts them on the map.
    const unsaved = unsavedLine(regionsChanged(this.state));
    if (unsaved !== undefined) panel.append(element('p', unsaved, 'unsaved'));
    if (this.dialog) panel.append(this.dialog);
    this.fixBox();
    const { reasons, warning, pieces } = this.checkedParts;
    panel.append(reasons, warning);
    this.conflictSection(panel);
    this.selectedSection(panel);
    this.regionList(panel);
    panel.append(pieces);
    this.checked();
    const outside = outsideLine(this.counts.outsideGyms.length, this.counts.outsideWayspots.length);
    if (outside) panel.append(swatched('p', outside, 'warning'));
  }

  /**
   * The parts of the panel that the overlaps and gaps change: why Save is off, whether they
   * could be worked out, their list. An answer of the worker draws only these, so that the
   * selected region's section (and what is being typed into it) stays as it is.
   */
  private checked(): void {
    const { reasons, warning, pieces } = this.checkedParts;
    reasons.replaceChildren();
    const ready = this.readiness();
    if (!ready.ready && !this.dialog) {
      const list = element('ul', undefined, 'reasons');
      for (const reason of ready.reasons) list.append(swatched('li', reason));
      reasons.append(list);
    }
    warning.replaceChildren();
    if (this.checkFailed)
      warning.append(element('p', 'The overlaps and gaps could not be worked out.', 'warning'));
    pieces.replaceChildren();
    this.pieceList(pieces);
  }

  private conflictSection(panel: HTMLElement): void {
    const { conflicts, gone } = this.applied;
    if (conflicts.length + gone.length === 0) return;
    panel.append(element('h2', 'Changed by somebody else'));
    for (const id of conflicts) {
      const region = this.loaded.find((one) => one.id === id);
      if (!region) continue;
      const row = element('div', undefined, 'conflict');
      row.append(
        swatched('span', theirsLine(region.name)),
        button('Take theirs', () => {
          this.edit({ kind: 'take-theirs', key: `r${id}`, version: region.version });
          this.redraw();
        }),
        button('Keep mine', () => {
          this.edit({ kind: 'keep-mine', key: `r${id}`, version: region.version });
          this.redraw();
        }),
      );
      panel.append(row);
    }
    for (const id of gone) {
      const row = element('div', undefined, 'conflict');
      row.append(
        element('span', `Region ${id} was removed meanwhile.`),
        button('Drop my changes of it', () => {
          this.edit({ kind: 'take-theirs', key: `r${id}`, version: '' });
          this.redraw();
        }),
      );
      panel.append(row);
    }
  }

  private selectedSection(panel: HTMLElement): void {
    const key = this.selected;
    const draft = key === undefined ? undefined : this.draft(key);
    if (!key || !draft) return;
    const readOnly = this.data.readOnly;
    const section = element('section', undefined, 'selected');
    section.append(element('h2', draftLabel(draft)));
    const loaded =
      draft.regionId === null ? undefined : this.loaded.find((one) => one.id === draft.regionId);
    if (loaded) {
      section.append(
        element(
          'p',
          `Category: ${loaded.category ?? 'none'}. ${count(this.counts.gyms.get(key) ?? 0, 'gym')}.`,
        ),
      );
    } else {
      section.append(element('p', count(this.counts.gyms.get(key) ?? 0, 'gym')));
      if (!readOnly) this.channelPicker(section, draft);
    }
    const problem = outlineProblems([draft]).get(key);
    if (problem !== undefined)
      section.append(element('p', `This region cannot be saved: ${problem}.`, 'warning'));
    if (!readOnly) {
      const actions = element('div', undefined, 'actions');
      if (draft.removed !== null) {
        actions.append(
          element('span', removalWords(draft.removed)),
          button('Restore', () => {
            this.edit({ kind: 'restore', key, bases: this.bases([key]) });
            this.redraw();
          }),
        );
      } else {
        actions.append(
          button('Split along a line', () => {
            this.splitting = key;
            this.map.pm.enableDraw('Line', { snappable: true });
            say(
              `Draw a line across ${draftLabel(draft)}, from outside it to outside it; click its last point again to finish.`,
            );
          }),
        );
        const partner = splitPartner(this.state, key);
        if (partner !== undefined && this.draft(partner)) {
          actions.append(
            button(`Swap with ${this.name(partner)}`, () => {
              this.edit({ kind: 'swap', a: key, b: partner, bases: this.bases([key, partner]) });
              this.redraw();
            }),
          );
        }
        if (draft.regionId === null) {
          actions.append(button('Remove', () => this.remove(key, 'keep')));
        } else {
          actions.append(button('Remove, keep its forum', () => this.remove(key, 'keep')));
          if (this.data.mayManageChannels) {
            actions.append(
              button(
                'Remove and delete its forum',
                () => this.remove(key, 'delete'),
                false,
                'danger',
              ),
            );
          }
        }
      }
      section.append(actions);
    }
    panel.append(section);
  }

  private remove(key: string, forum: 'keep' | 'delete'): void {
    this.edit({ kind: 'remove', key, forum, bases: this.bases([key]) });
    if (this.draft(key) === undefined) this.selected = undefined;
    this.redraw();
  }

  /** A new region's channel: a text channel that is no region yet, or a new name (spec 4.2). */
  private channelPicker(section: HTMLElement, draft: Draft): void {
    const choices = channelChoices(this.data.channels, this.applied.drafts, draft.key);
    // As it was being filled in when the panel was drawn anew, or as the region has it.
    const shown = pickerShown(this.picker, draft);
    this.picker = shown;
    const select = element('select');
    select.append(new Option('Choose its channel', ''));
    for (const channel of choices)
      select.append(new Option(`#${channel.name}`, `id:${channel.id}`));
    if (this.data.mayManageChannels) select.append(new Option('A new channel…', 'new'));
    select.value = shown.choice;
    const name = element('input');
    name.placeholder = 'Name of the new channel';
    name.maxLength = MAX_NEW_CHANNEL_NAME;
    name.value = shown.name;
    const category = element('input');
    category.placeholder = 'Its category (empty: a category named after the channel)';
    category.maxLength = MAX_NEW_CATEGORY;
    category.value = shown.category;
    const refusal = element('p', shown.refusal, 'warning');
    const showFields = (): void => {
      const isNew = select.value === 'new';
      name.hidden = !isNew;
      category.hidden = !isNew;
      refusal.hidden = this.picker?.refusal === undefined;
    };
    showFields();
    /** What is in the picker now, kept on the editor. */
    const typed = (): PickerState => ({
      key: draft.key,
      choice: select.value,
      name: name.value,
      category: category.value,
      refusal: this.picker?.refusal,
    });
    const save = (): void => {
      // A name the server would refuse is shown refused, and takes off the channel staged before.
      const staged = this.draft(draft.key)?.channel ?? null;
      const change = pickerChange(typed(), staged, choices, this.data.channels, this.loaded);
      this.picker = change.state;
      refusal.textContent = change.state.refusal ?? '';
      showFields();
      if (change.details) {
        this.edit({ kind: 'details', key: draft.key, ...change.details }, true);
        this.labels();
      }
    };
    select.addEventListener('change', () => {
      this.picker = typed();
      showFields();
      if (select.value !== 'new') save();
    });
    for (const field of [name, category]) {
      field.addEventListener('input', () => {
        this.picker = typed();
      });
      field.addEventListener('change', save);
    }
    section.append(select, name, category, refusal);
    if (!this.data.mayManageChannels) {
      section.append(
        element(
          'p',
          'Creating channels takes Manage Channels, which you lack: pick a channel that exists.',
        ),
      );
    }
  }

  private regionList(panel: HTMLElement): void {
    panel.append(element('h2', `Regions (${this.applied.drafts.length})`));
    const list = element('ul', undefined, 'region-list');
    const problems = outlineProblems(this.applied.drafts);
    for (const draft of this.applied.drafts) {
      const item = element(
        'li',
        `${this.labelText(draft)}${draft.removed !== null ? REMOVAL_MARK : ''}${problems.has(draft.key) ? ' (cannot be saved)' : ''}`,
      );
      if (draft.key === this.selected) item.className = 'chosen';
      item.addEventListener('click', () => {
        this.select(draft.key);
        const layer = this.regionLayers.get(draft.key);
        if (layer) this.map.fitBounds(layer.getBounds(), { padding: [30, 30] });
      });
      list.append(item);
    }
    panel.append(list);
  }

  private pieceList(panel: HTMLElement): void {
    const summary = coverageSummary({
      pieces: this.pieces.length,
      overlaps: this.pieces.filter((piece) => piece.kind === 'overlap').length,
      checking: this.checking,
      checkFailed: this.checkFailed,
      checked: this.checkedOnce,
    });
    // A clean set of regions reads as clean (plan 8M-10, C11).
    if (summary.kind === 'none') panel.append(element('p', summary.text, 'clean'));
    if (summary.kind !== 'list') return;
    const sorted = [...this.pieces].sort(pieceOrder(this.worstFirst));
    panel.append(element('h2', summary.text));
    const list = element('ul', undefined, 'piece-list');
    for (const piece of sorted.slice(0, LISTED_PIECES)) {
      const item = element(
        'li',
        pieceLine(piece, (key) => this.name(key)),
        piece.fresh ? 'fresh' : undefined,
      );
      item.addEventListener('click', () => {
        this.map.fitBounds(L.latLngBounds(piece.rings[0] ?? []), {
          padding: [40, 40],
          maxZoom: 18,
        });
      });
      const { fix } = piece;
      if ('cannot' in fix) {
        item.append(element('div', cannotFixWords(fix.cannot, this.units), 'cannot-fix'));
      } else if (fixesOffered({ readOnly: this.data.readOnly, checkFailed: this.checkFailed })) {
        const open = button('Fix…', () => this.openFix(fix.stretch));
        open.addEventListener('click', (event) => event.stopPropagation());
        item.append(' ', open);
      }
      list.append(item);
    }
    panel.append(list);
    if (sorted.length > LISTED_PIECES) {
      panel.append(element('p', `…and ${sorted.length - LISTED_PIECES} more, smaller.`));
    }
  }

  /** Fix of one stretch (plan 8M-2F): its choices, asked of the worker. */
  private openFix(stretch: string): void {
    if (this.checking) {
      say('Wait until the overlaps and gaps are worked out.');
      return;
    }
    this.dropFixes();
    this.fixing = { stretch, waiting: fixWaiting(0, 'asked') };
    this.post({ kind: 'fix-options', seq: this.seq, stretch });
    this.panel();
    this.toolbar();
  }

  private fixAnswered(answer: Extract<CoverageAnswer, { kind: 'fix-options' }>): void {
    const fixing = this.fixing;
    if (!fixing || answer.seq !== this.seq) return;
    fixing.waiting = fixWaiting(fixing.waiting, 'answered');
    if (answer.failed) {
      this.closeFix();
      say(FIX_FAILED_WORDS);
      return;
    }
    if (!answer.stretch) {
      this.dropFixes();
      say('Those slivers changed meanwhile: pick them from the list again.');
      this.panel();
      return;
    }
    // An answer to a drag before the last: the last one's is coming.
    if (answer.stretch.id !== fixing.stretch || fixing.waiting > 0) return;
    const first = fixing.answer === undefined;
    fixing.answer = answer;
    fixing.picked = fixPick(answer.options, fixing.picked, fixing.corner !== undefined);
    this.drawFix();
    this.panel();
    // Fitted once the box shows its choices: the stretch beside it (C12).
    if (first) this.fitStretch(answer.stretch);
  }

  /** The map fitted to a stretch in the part the Fix box leaves free (plan 8M-10, C12). */
  private fitStretch(stretch: ShownStretch): void {
    // Hidden, its map is not moved (review 1, F2).
    if (!shownNow) return;
    const size = this.map.getSize();
    const padding = fixBoxPadding(
      { width: this.fixHost.offsetWidth, height: this.fixHost.offsetHeight },
      { x: size.x, y: size.y },
    );
    this.map.fitBounds(L.latLngBounds(stretch.box), {
      paddingTopLeft: padding.topLeft,
      paddingBottomRight: padding.bottomRight,
      maxZoom: 18,
    });
  }

  /**
   * Fix… and Fix all slivers… in a box pinned over the map's top right corner (plan 8M-10, C12;
   * Matt's note d: at the top of a scrolled panel they were out of sight): its choices scroll
   * inside it, its buttons (Apply, Cancel, …) always in sight at its foot. Hidden while no fix
   * is open.
   *
   * The focus is never dropped to the page by its redraws (branch review W3): the box shown, or
   * its title changed, the focus goes to its title (or its first choice where it has none); drawn
   * anew with the focus inside, it stays on the button of the same words where there is one; the
   * box closed with the focus in it (or lost), it goes to the panel, which is never replaced.
   */
  private fixBox(): void {
    const host = this.fixHost;
    const wasShown = !host.hidden;
    const titleBefore = host.querySelector('h2')?.textContent;
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && host.contains(active);
    const words = inside && active instanceof HTMLButtonElement ? active.textContent : null;
    const lost = inside || active === null || active === document.body;
    host.replaceChildren();
    this.fixSection(host);
    host.hidden = host.childElementCount === 0;
    // Fix all's question shown, by its number: none while it works or is closed (re-review V3).
    const step = this.fixingAll;
    const question =
      step !== undefined && step !== 'working' && step.question ? step.question.number : undefined;
    const newQuestion = question !== undefined && question !== this.fixQuestion;
    this.fixQuestion = question;
    // Hidden, the editor moves no focus (the map's toggle does).
    if (!shownNow) return;
    const title = host.querySelector<HTMLElement>('h2');
    const same = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (one) => words !== null && one.textContent === words && !one.disabled,
    );
    const focus = fixFocus({
      wasShown,
      shown: !host.hidden,
      inside,
      lost,
      sameTitle: title?.textContent === titleBefore,
      sameButton: same !== undefined,
      newQuestion,
    });
    if (focus === 'question') {
      host.querySelector<HTMLElement>('.fix-lead')?.focus({ preventScroll: true });
    } else if (focus === 'same-button') {
      same?.focus({ preventScroll: true });
    } else if (focus === 'title') {
      const first =
        title ??
        host.querySelector<HTMLElement>('.fix-body button:not(:disabled)') ??
        host.querySelector<HTMLElement>('button:not(:disabled)');
      first?.focus({ preventScroll: true });
    } else if (focus === 'panel') {
      const panel = this.hosts.panel;
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
    }
  }

  /**
   * What the choice shown would make, dashed; the corner where three meet, to drag. The marker
   * is made once per fix and moved after (a fix shown is dropped with its marker, `dropFixes`).
   */
  private drawFix(): void {
    this.fixPreview.clearLayers();
    const fixing = this.fixing;
    const option = fixing?.answer?.options.find((one) => one.choice === fixing.picked);
    if (option) this.previewOutlines(option.outlines);
    const corner = fixing?.answer?.stretch?.corner;
    if (!fixing || !corner || fixing.picked !== 'midline') {
      this.corner?.remove();
      this.corner = undefined;
      return;
    }
    if (this.corner) {
      this.corner.setLatLng(corner);
      return;
    }
    const marker = L.marker(corner, {
      draggable: true,
      icon: L.divIcon({ className: 'fix-corner', iconSize: [14, 14] }),
      zIndexOffset: CORNER_Z_OFFSET,
      pmIgnore: true,
    });
    // An answer that comes while the corner is dragged is not shown (`fixWaiting`).
    marker.on('dragstart', () => {
      fixing.waiting = fixWaiting(fixing.waiting, 'drag-started');
      this.panel();
    });
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      const moved: Point = [roundSix(lat), roundSix(lng)];
      fixing.corner = moved;
      // Apply waits for the choices at the new corner, counted since the drag started.
      fixing.waiting = fixWaiting(fixing.waiting, 'drag-ended');
      this.post({ kind: 'fix-options', seq: this.seq, stretch: fixing.stretch, corner: moved });
      this.panel();
    });
    marker.addTo(this.map);
    this.corner = marker;
  }

  private previewOutlines(outlines: readonly ShownOutline[]): void {
    this.fixPreview.clearLayers();
    for (const { outline } of outlines) {
      L.polygon(outline, {
        color: colours().preview,
        weight: 2,
        dashArray: '6 4',
        fill: false,
        pmIgnore: true,
      }).addTo(this.fixPreview);
    }
  }

  /** Any fix shown is dropped: its preview, its corner, its dialog. */
  private dropFixes(): void {
    this.fixing = undefined;
    this.fixingAll = undefined;
    this.fixPreview.clearLayers();
    this.corner?.remove();
    this.corner = undefined;
  }

  private closeFix(): void {
    this.dropFixes();
    this.panel();
    this.toolbar();
  }

  /**
   * The dialog of a fix or of Fix all, in the Fix box (C12): its title, what it says and its
   * choices in a part that scrolls, its buttons at its foot, always in sight.
   */
  private fixSection(host: HTMLElement): void {
    const name = (key: string): string => this.name(key);
    const dialog = (title: string | undefined, body: Node[], actions: HTMLElement[]): void => {
      const section = element('section', undefined, 'fix-dialog');
      if (title !== undefined) {
        // Where the focus goes as the box shows (W3): read, not a Tab stop.
        const heading = element('h2', title);
        heading.tabIndex = -1;
        section.append(heading);
      }
      const scrolled = element('div', undefined, 'fix-body');
      scrolled.append(...body);
      const foot = element('div', undefined, 'fix-actions');
      foot.append(...actions);
      section.append(scrolled, foot);
      host.append(section);
    };
    if (this.fixingAll !== undefined) {
      const step = this.fixingAll;
      if (step === 'working' || step.question === null) {
        dialog(
          'Fix all slivers',
          [element('p', 'Fixing the slivers with nothing in them…')],
          [button('Cancel', () => this.closeFix())],
        );
        return;
      }
      const { stretch, options } = step.question;
      // Where the focus goes as a new question shows (re-review V3): read, not a Tab stop.
      const lead = element(
        'p',
        `${count(step.fixed, 'stretch', 'stretches')} fixed so far.`,
        'fix-lead',
      );
      lead.tabIndex = -1;
      const body: Node[] = [
        lead,
        element(
          'p',
          `${stretchTitle(stretch.sides, name)}: ${count(stretch.places.length, 'place')} would change region. Which line do the regions take?`,
        ),
      ];
      for (const option of options) {
        const row = element('div', undefined, 'fix-option');
        const take = button(
          `Take ${choiceWords(option.choice, stretch.sides, name)}`,
          () => this.answerFixAll(option.choice),
          !option.ok,
        );
        take.addEventListener('mouseenter', () => this.previewOutlines(option.outlines));
        row.append(take, this.landings(option, name));
        body.push(row);
      }
      dialog('Fix all slivers', body, [
        button('Leave it', () => this.answerFixAll('skip')),
        button('Stop here', () => this.answerFixAll('stop')),
        button('Cancel', () => this.closeFix()),
      ]);
      return;
    }
    const fixing = this.fixing;
    if (!fixing) return;
    const answer = fixing.answer;
    const stretch = answer?.stretch;
    if (!answer || !stretch) {
      dialog(
        undefined,
        [element('p', 'Working out the fixes…')],
        [button('Cancel', () => this.closeFix())],
      );
      return;
    }
    const body: Node[] = [element('p', 'The shared line is one of these (dashed on the map):')];
    for (const option of answer.options) {
      const row = element(
        'div',
        undefined,
        option.choice === fixing.picked ? 'fix-option chosen' : 'fix-option',
      );
      row.append(
        button(
          `Take ${choiceWords(option.choice, stretch.sides, name)}`,
          () => {
            fixing.picked = option.choice;
            this.drawFix();
            this.panel();
          },
          !option.ok,
        ),
        this.landings(option, name),
      );
      body.push(row);
    }
    if (stretch.corner && fixing.picked === 'midline') {
      body.push(
        element(
          'p',
          fixing.waiting > 0
            ? 'Working out the fix at the corner as dragged…'
            : 'Drag the round marker to move where the three regions meet, inside the sliver.',
        ),
      );
    }
    const picked = answer.options.find((option) => option.choice === fixing.picked);
    dialog(stretchTitle(stretch.sides, name), body, [
      button('Apply', () => this.applyFix(), !picked?.ok || fixing.waiting > 0, 'primary'),
      button('Cancel', () => this.closeFix()),
    ]);
  }

  /** Where each place ends up under a choice, or why it cannot be made. */
  private landings(option: ShownOption, name: (key: string) => string): HTMLElement {
    if (!option.ok)
      return element('p', cannotFixWords(option.reason ?? 'stale', this.units), 'warning');
    const list = element('ul');
    for (const landing of option.landings) {
      list.append(element('li', landingWords(landing, this.data, name)));
    }
    return list;
  }

  /** The choice shown, staged as one edit. */
  private applyFix(): void {
    const fixing = this.fixing;
    const option = fixing?.answer?.options.find((one) => one.choice === fixing.picked);
    if (!option?.ok || fixing?.waiting !== 0) return;
    this.edit(fixEdit(option.outlines, (keys) => this.bases(keys)));
    this.redraw();
    say('Fixed, as one change: Undo takes it back.');
  }

  /** Fix all slivers (plan 8M-2F): the worker fixes the empty stretches and asks about the rest. */
  private startFixAll(): void {
    if (this.checking) {
      say('Wait until the overlaps and gaps are worked out.');
      return;
    }
    this.dropFixes();
    this.fixingAll = 'working';
    this.fixAsk += 1;
    this.post({ kind: 'fix-all', seq: this.seq, ask: this.fixAsk });
    this.panel();
    this.toolbar();
  }

  /** An answer to Fix all's question shown: sent once (a second click finds none shown). */
  private answerFixAll(choice: FixChoice | 'skip' | 'stop'): void {
    const step = this.fixingAll;
    if (step === undefined || step === 'working' || !step.question) return;
    this.fixingAll = 'working';
    this.fixAsk += 1;
    this.fixPreview.clearLayers();
    this.post({
      kind: 'fix-all-answer',
      seq: this.seq,
      ask: this.fixAsk,
      question: step.question.number,
      choice,
    });
    this.panel();
  }

  private fixAllAnswered(answer: Extract<CoverageAnswer, { kind: 'fix-all' }>): void {
    // Only the answer to the page's last request of this Fix all.
    if (this.fixingAll !== 'working' || answer.seq !== this.seq || answer.ask !== this.fixAsk) {
      return;
    }
    if (answer.failed) {
      this.dropFixes();
      this.showDialog(FIX_FAILED_WORDS);
      this.toolbar();
      return;
    }
    if (answer.question) {
      this.fixingAll = answer;
      const first = fixPick(answer.question.options, undefined, false);
      const shown = answer.question.options.find((option) => option.choice === first);
      this.previewOutlines(shown?.outlines ?? []);
      this.panel();
      // Fitted once the box shows the question: the stretch beside it (C12).
      this.fitStretch(answer.question.stretch);
      return;
    }
    this.dropFixes();
    const words = fixAllWords(answer.fixed, answer.skipped, answer.refused, answer.undone);
    if (answer.outlines.length > 0) {
      this.edit(fixEdit(answer.outlines, (keys) => this.bases(keys)));
      this.redraw();
      this.showDialog(fixedAsOneWords(words));
    } else {
      this.showDialog(words);
    }
    this.toolbar();
  }

  /** A KML file into the staged edits (spec 4.2), as one edit. */
  private async loadKml(file: File): Promise<void> {
    if (file.size > MAX_KML_BYTES) {
      say(KML_TOO_LARGE);
      return;
    }
    const reading = readKml(await file.text());
    if (!reading.ok) {
      say(KML_PROBLEMS[reading.reason]);
      return;
    }
    const made = kmlEdit(
      reading.areas,
      this.loaded,
      this.applied.drafts,
      this.data.channels,
      this.state,
    );
    this.edit(made);
    this.redraw();
    say(kmlLoadedWords(reading.areas.length, reading.skipped.length));
  }

  /** What the editor shows as a KML file (spec 4.7). */
  private exportKml(): void {
    const text = writeKml(exportAreas(this.loaded, this.applied.drafts));
    const url = URL.createObjectURL(
      new Blob([text], { type: 'application/vnd.google-earth.kml+xml' }),
    );
    const link = element('a');
    link.href = url;
    link.download = exportFileName(this.data.guild);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /**
   * POSTs a body (`saveBody`) with the CSRF token; asks for a new token once when it was
   * refused. What came back, read (`readSaveAnswer`); `unknown` also when nothing came back, or
   * not within the time limit (`timed`, review 2, R2).
   */
  private async send(what: 'preview' | 'save', body: string): Promise<ReadAnswer> {
    const post = async (): Promise<Response> =>
      fetch(
        `/s/${this.data.guild.id}/api/regions/${what}`,
        timed({
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-pine-csrf': this.me.loggedIn ? this.me.csrf : '',
          },
          body,
        }),
      );
    try {
      let response = await post();
      if (response.status === 403) {
        // The token of a page loaded before a restart: ask for the new one, once.
        this.me = await whoIsAsking(this.data.guild.id);
        response = await post();
      }
      return readSaveAnswer(response.status, await response.text());
    } catch {
      return { kind: 'unknown' };
    }
  }

  /**
   * A preview or a save, "Back to the map" off until it is through (review 1, F2): its answer,
   * the reload after it and a preview again land in the editor, never over the live map.
   */
  private async whileSending(work: () => Promise<void>): Promise<void> {
    const { back } = this.hosts;
    this.sending += 1;
    back.disabled = true;
    back.title = BACK_WAITS;
    try {
      await work();
    } finally {
      this.sending -= 1;
      if (this.sending === 0) {
        back.disabled = false;
        back.removeAttribute('title');
      }
    }
  }

  /** Save, step one: what the server would do (spec 4.5), of the body Save then sends. */
  private async preview(): Promise<void> {
    this.showDialog('Asking what would be saved…');
    const body = saveBody(this.loaded, this.applied.drafts);
    this.previewed = body;
    const read = await this.send('preview', body);
    if (read.kind === 'unknown') {
      this.showDialog('The preview could not be asked for. Try again in a moment.');
      return;
    }
    await this.shown(read, true);
  }

  /**
   * Save, step two: the body previewed, carried out; the outcome shown, the editor loaded anew.
   * When the drafts changed since the preview, it is previewed again instead. When it cannot be
   * known what the server did (the answer failed or cannot be read), the editor is loaded anew
   * and what the server has is no longer staged (`rebaseAfterSave`).
   */
  private async save(): Promise<void> {
    const body = saveBody(this.loaded, this.applied.drafts);
    if (body !== this.previewed) {
      this.closeDialog();
      await this.preview();
      return;
    }
    this.showDialog('Saving…');
    const read = await this.send('save', body);
    if (read.kind !== 'unknown') {
      await this.shown(read, false);
      return;
    }
    try {
      await this.reload(true);
      this.showDialog(OUTCOME_UNKNOWN);
    } catch {
      this.showDialog(OUTCOME_UNKNOWN_RELOAD);
    }
  }

  private async shown(
    read: Exclude<ReadAnswer, { kind: 'unknown' }>,
    previewing: boolean,
  ): Promise<void> {
    if (read.kind === 'refused') {
      this.showDialog(read.text);
      return;
    }
    const { answer } = read;
    const dialog = element('section', undefined, 'dialog');
    switch (answer.kind) {
      case 'preview':
        dialog.append(element('h2', 'What saving would do'));
        showWorded(dialog, answer.worded);
        if (answer.changes) {
          dialog.append(
            button(
              'Save these changes',
              () => void this.whileSending(() => this.save()),
              false,
              'primary',
            ),
          );
        }
        dialog.append(button('Cancel', () => this.closeDialog()));
        break;
      case 'saved': {
        dialog.append(element('h2', 'Saved'));
        showWorded(dialog, answer.worded);
        dialog.append(button('Close', () => this.closeDialog()));
        await this.reloadFor(dialog, 'saved');
        break;
      }
      case 'refused':
        dialog.append(element('h2', previewing ? 'This cannot be saved' : 'Nothing was saved'));
        for (const line of answer.lines) dialog.append(element('p', line));
        dialog.append(button('Close', () => this.closeDialog()));
        break;
      case 'conflicts':
        dialog.append(
          element('h2', 'Changed by somebody else'),
          element(
            'p',
            `${count(answer.conflicts.length, 'region')} changed since you loaded the page: nothing was saved. Choose for each below, then save again.`,
          ),
          button('Close', () => this.closeDialog()),
        );
        await this.reloadFor(dialog, 'conflicts');
        break;
      case 'stale':
        // Other regions changed between the check and the save: load them, and preview again.
        dialog.append(
          element('p', answer.line),
          button('Close', () => this.closeDialog()),
        );
        if (await this.reloadFor(dialog, 'conflicts')) {
          say(answer.line);
          this.closeDialog();
          await this.preview();
          return;
        }
        break;
    }
    this.dialog = dialog;
    this.panel();
  }

  /**
   * The editor's data again after an outcome shown in `dialog` (`reload`); when it cannot be
   * loaded, the outcome is shown all the same, with what to do (`reloadFailedLine`). Whether it
   * was loaded.
   */
  private async reloadFor(dialog: HTMLElement, after: 'saved' | 'conflicts'): Promise<boolean> {
    try {
      await this.reload(after === 'saved');
      return true;
    } catch {
      dialog.append(element('p', reloadFailedLine(after), 'warning'));
      return false;
    }
  }

  private showDialog(text: string): void {
    const dialog = element('section', undefined, 'dialog');
    dialog.append(
      element('p', text),
      button('Close', () => this.closeDialog()),
    );
    this.dialog = dialog;
    this.panel();
  }

  private closeDialog(): void {
    this.dialog = undefined;
    this.previewed = undefined;
    this.panel();
  }

  /**
   * The editor's data again. After a save, what the server has as staged is no longer staged
   * (`rebaseAfterSave`; also after a partial save). After a conflict the staged edits stay as
   * they are: their versions tell which regions changed meanwhile.
   */
  private async reload(saved: boolean): Promise<void> {
    // Within the time limit (R2): a reload that stalls fails as one that could not be made.
    const data = await getJson<EditorData>(
      `/s/${this.data.guild.id}/api/regions/edit`,
      timed({ cache: 'no-cache' }),
    );
    this.took(data, saved);
  }

  /**
   * The editor's data as loaded anew: the regions as the server has them, the staged edits
   * applied to them (after a save rebased: `rebaseAfterSave`), the worker told, everything shown.
   */
  private took(data: EditorData, saved: boolean): void {
    const drafts = this.applied.drafts;
    this.data = data;
    this.loaded = loadedRegions(data);
    this.picker = undefined;
    if (saved) this.state = rebaseAfterSave(drafts, this.loaded, this.state);
    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.placeList() });
    this.changed();
    this.redraw();
  }
}

/** The places and other servers' outlines of the data, to tell whether they changed. */
const placesKey = (data: EditorData): string =>
  JSON.stringify([data.gyms, data.wayspots, data.others]);

/** What the page says when the editor's data cannot be loaded and the server said no words. */
const LOAD_FAILED = 'The regions could not be loaded. Try again in a moment.';

/** The editor once opened: its own map (kept while hidden, C4) and the editor on it. */
let opened: { map: L.Map; editor: Editor } | undefined;

/**
 * The editor's side of the map page (plan 8M-10, `editor-mount.ts`): registered as this script
 * runs. Every opening asks for the data anew (the staff check, fresh); the first builds the map
 * in its host at the live map's view, a later one moves it there and takes the data. It never
 * rejects (review 1, F1): a failure once shown answers `EDITOR_FAILED` (the map closes it), and a
 * first build that failed is taken down, so that the next opening builds anew.
 */
window.pineRegionEditor = {
  async open(opening) {
    let data: EditorData;
    try {
      // Within the time limit (R2): an opening never waits for good.
      data = await getJson<EditorData>(
        `/s/${opening.guild}/api/regions/edit`,
        timed({ cache: 'no-cache' }),
      );
    } catch (err) {
      return { ok: false, words: failureWords(err, LOAD_FAILED) };
    }
    // Another account than the editor was opened for (branch review W6): its staged edits are
    // not shown or saved as this one's; nothing is shown.
    const refusal = reopenRefusal(opened?.editor.userId, data.userId);
    if (refusal !== undefined) return { ok: false, words: refusal };
    // A form of the map opened while the data came (F4): nothing is shown over it.
    if (!opening.show()) return { ok: false, words: CLOSE_FORM_FIRST };
    shownNow = true;
    let built: { map: L.Map; worker?: Worker } | undefined;
    try {
      if (opened) {
        opened.map.invalidateSize();
        // Without the live map's view (W2) its own view is kept.
        const { view } = opening;
        if (view) opened.map.setView([view.lat, view.lon], view.zoom, { animate: false });
        opened.editor.reopened(data, opening.me);
      } else {
        const { view, fitRegions } = firstView(opening.view);
        const map = L.map(opening.hosts.map, {
          center: [view.lat, view.lon],
          zoom: view.zoom,
          preferCanvas: true,
        });
        built = { map };
        addTiles(map, opening.tiles, opening.googleKey);
        const worker = new Worker(opening.worker);
        built.worker = worker;
        const editor = new Editor(map, data, opening.me, worker, opening.units, opening.hosts);
        editor.start();
        if (fitRegions) editor.fitRegions();
        opened = { map, editor };
      }
    } catch {
      built?.worker?.terminate();
      built?.map.remove();
      return { ok: false, words: EDITOR_FAILED };
    }
    if (data.readOnly) {
      say('Discord cannot be reached just now, so the editor is read-only.', { lasting: true });
    }
    return { ok: true };
  },
  close: () => {
    shownNow = false;
    return opened?.editor.hidden();
  },
};
