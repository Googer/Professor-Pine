import * as L from 'leaflet';
import type { GeoView } from '../../domain/web/geo-data.js';
import { addTiles, byId, getJson, hideNotice, say, showAccount, tileSetting } from './common.js';
import {
  addressWith,
  editorByAddress,
  EditorToggle,
  editingAsked,
  editingOffered,
  editItemLabel,
  editItemPressed,
  unsavedCount,
  loadOnce,
} from './editor-toggle.js';
import { editorFits } from './editor-media.js';
import { FIND_MAX_TEXT } from '../../domain/web/find-data.js';
import { FIND_PLACEHOLDER } from './find.js';
import { browserStorage as stagedStorage, stagedRegions } from './staged-storage.js';
import { showGymDots, type GymDots } from './gyms-ui.js';
import { LayerRegistry, MAP_LAYERS, regionLabelsShown } from './layer-registry.js';
import { showLayerControls } from './layers-ui.js';
import { loggedOutPane } from './list-ui.js';
import {
  historyItemNode,
  historyOffered,
  loginNotice,
  loginNoticeFor,
  meItemNode,
  type Me,
} from './notice.js';
import { MapActivity } from './parties.js';
import { showParties } from './party-layer.js';
import { quietLine, showPlaces, type PlacesHooks } from './places-ui.js';
import { showActivity, type ActivityShown } from './activity-ui.js';
import { addressWithoutTrain, trainOfAddress } from './train-address.js';
import { REGION_OUTLINE } from './panes.js';
import { outlineStyle, regionsOffered } from './regions.js';
import type { RegionAccess, RegionsMineView } from '../../domain/web/region-data.js';
import { popupPanPadding, regionLabel, renderNode, type MapGym } from './popup.js';
import { RouteFocus } from './route-focus.js';
import { pageSpotAddresses } from './spot-address.js';
import { hiddenGyms } from './shared-place.js';
import { onThemeChange, theme } from './theme.js';
import { BOUNDS_VISCOSITY, browserStorage, placeTheMap } from './view-ui.js';
import {
  EDITOR_TOUR_STEPS,
  editorTourOpens,
  keepTourSeen,
  readTourSeen,
  settledWithin,
  TOUR_WAITS_FOR_REGIONS_MS,
  tourAudience,
  tourOpensByItself,
  tourSteps,
} from './tour.js';
import { quietPage, tourUi } from './tour-ui.js';
import { showWhereYouAre, type You } from './you-ui.js';

/**
 * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
 * `layers.ts`, the server's regions labelled with their channels, its gyms as dots with a popup
 * each (clustered when zoomed out), a filter box, and the header with the login and the layers
 * (plan 8M-7: everything drawn is a layer of `LayerRegistry` the member toggles);
 * for a member, the server's parties (`party-layer.ts`, plan 8M-3) and the PokéStops and Power
 * Spots of the view from street level (`places-ui.ts`).
 * Everything from data is set as text (`renderNode`, `textContent`): Leaflet sets string
 * content of tooltips, popups and attributions as HTML, so data goes to it as nodes.
 */

/**
 * The pane of the regions' names: under the overlay pane (400) of the outlines and of the gyms',
 * stops' and spots' circles, and under the markers (600): a name never covers a place (round 2).
 */
const LABELS_PANE = 'region-labels';
const LABELS_PANE_Z = 350;

/** The gyms' and Power Spots' dots as Tab stops while route mode is on, and only then (re-review N1). */
const routeFocus = new RouteFocus();

/**
 * What a gym's popup shows beyond the gym itself, once the page knows who is asking: "Report raid"
 * (plan 8M-4) and "Report spawn here" (plan 8M-4S) for a member, and whether a form is open (the
 * popup's content is held then: `heldContent`), and in route mode a click that adds the gym as
 * a stop instead of opening its popup (plan 8M-5); whether every gym must be drawn (route mode,
 * a place picked: plan 8M-7). Nothing until then.
 */
const gymExtras: {
  of: (gym: MapGym) => HTMLElement[];
  editing: () => boolean;
  clicked: (gym: MapGym) => boolean;
  forced: () => boolean;
  raidGyms: () => readonly number[];
  /** Whether the raids are drawn (their layer, or a raid's step 2: C1). */
  raidsShown: () => boolean;
  tapped: (gym: MapGym, own: () => void) => void;
  /** Whether the box is "Find a gym", thinning the dots: not a member's Find (plan 8M-12). */
  thins: () => boolean;
} = {
  of: () => [],
  editing: () => false,
  clicked: () => false,
  forced: () => false,
  raidGyms: () => [],
  raidsShown: () => false,
  tapped: (_gym, own) => {
    own();
  },
  thins: () => true,
};

/**
 * What the Activity layer adds to the gyms' and Power Spots' popups and to the gyms' clusters
 * (plan 8H-4H): a place's line and a cluster's sum on hover, once the layer is made for a member;
 * nothing until then.
 */
const activityShown: { now: ActivityShown | undefined } = { now: undefined };
/** A place's activity line for its popup: none before the layer is made. */
const activityLine = (kind: 'gym' | 'spot', id: string): HTMLElement[] =>
  activityShown.now === undefined ? [] : [activityShown.now.line(kind, id)];

/**
 * Shows the regions (the layer Region outlines) and the gyms (the layer Gyms); gives the gyms by
 * id, where the parties are put, the regions' names by id, the regions with their outlines
 * (where a point of the map lies), and the gyms' layer.
 */
async function showGeo(
  map: L.Map,
  guild: string,
  you: You,
  registry: LayerRegistry,
  activity: MapActivity,
): Promise<{
  gyms: Map<number, MapGym>;
  names: Map<number, string>;
  regions: GeoView['regions'];
  dots: GymDots;
  outlines: RegionOutlines;
}> {
  const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
  const names = new Map(view.regions.map((region) => [region.id, region.name]));
  const drawnOutlines = new Map<number, L.Polygon>();
  const regions = L.featureGroup();
  // The regions' names on a pane of their own under the markers, taking no clicks: a label never
  // covers a raid or a gym (fix round 1). Leaflet sets the pane's place by its style from the script.
  const labelsPane = map.createPane(LABELS_PANE);
  labelsPane.style.zIndex = String(LABELS_PANE_Z);
  labelsPane.style.pointerEvents = 'none';
  const outlines = view.regions.map((region) =>
    L.polygon(region.outline, { color: theme().colours.region, ...REGION_OUTLINE })
      .bindTooltip(renderNode(regionLabel(region.name), document), {
        permanent: true,
        direction: 'center',
        className: 'region-label',
        pane: LABELS_PANE,
      })
      .addTo(regions),
  );
  // The layer Region outlines, their labels with them.
  if (registry.isOn('outlines')) regions.addTo(map);
  // Each by its region, for "Your regions" (plan 8M-20): restyled by how the member stands to it.
  view.regions.forEach((region, index) => {
    const outline = outlines[index];
    if (outline) drawnOutlines.set(region.id, outline);
  });
  registry.onChange((id, on) => {
    if (id !== 'outlines') return;
    if (on) regions.addTo(map);
    else regions.remove();
  });
  const outlinesInView = (): void => {
    const shown = map.getBounds();
    registry.setCount(
      'outlines',
      outlines.filter((outline) => shown.intersects(outline.getBounds())).length,
    );
  };
  map.on('moveend', outlinesInView);
  // The device changed between light and dark (plan 8M-7): what Leaflet drew takes the new set.
  onThemeChange(({ colours }) => {
    for (const outline of outlines) outline.setStyle({ color: colours.region });
  });

  const dots = showGymDots({
    map,
    gyms: view.gyms,
    where: () => ({
      located: you.located(),
      units: document.body.dataset.distanceUnits === 'metric' ? 'metric' : 'imperial',
    }),
    registry,
    filter: byId('filter') as HTMLInputElement,
    extras: (gym) => [...activityLine('gym', String(gym.id)), ...gymExtras.of(gym)],
    editing: () => gymExtras.editing(),
    clicked: (gym) => gymExtras.clicked(gym),
    forced: () => gymExtras.forced(),
    hidden: () => hiddenGyms(gymExtras.raidGyms(), gymExtras.raidsShown()),
    focus: routeFocus,
    tapped: (gym, own) => {
      gymExtras.tapped(gym, own);
    },
    thins: () => gymExtras.thins(),
    area: (shown) => activityShown.now?.area(shown.map((gym) => String(gym.id))),
    counting: () => activityShown.now?.active() ?? false,
    // The Activity layer's circles follow the gyms' dots drawn (review 8H4H-3).
    drawn: () => {
      activityShown.now?.refresh();
    },
  });

  // Where the map starts, and how far it may go (plan 8M-7).
  const gymsBox = L.latLngBounds(view.gyms.map((gym) => [gym.lat, gym.lon]));
  placeTheMap(map, guild, view.regions, gymsBox, you, say, activity);
  dots.refresh();
  outlinesInView();

  const labels = (): void => {
    map.getContainer().classList.toggle('labels-hidden', !regionLabelsShown(map.getZoom()));
  };
  map.on('zoomend', labels);
  labels();
  return {
    gyms: new Map(view.gyms.map((gym) => [gym.id, gym])),
    names,
    regions: view.regions,
    dots,
    outlines: regionOutlines(drawnOutlines),
  };
}

/** The regions' outlines as "Your regions" restyles them (plan 8M-20). */
interface RegionOutlines {
  /** By how the member stands to each region (R14); undefined: as the map always drew them. */
  restyle(view: RegionsMineView | undefined): void;
  /** One region's outline marked (its row hovered); undefined: none. */
  highlight(regionId: number | undefined): void;
}

/** The weight of an outline whose row of "Your regions" is hovered. */
const MARKED_WEIGHT = 4;

function regionOutlines(drawn: ReadonlyMap<number, L.Polygon>): RegionOutlines {
  let access = new Map<number, RegionAccess>();
  let marked: number | undefined;
  const styleOf = (id: number): L.PathOptions => ({
    ...outlineStyle(access.get(id)),
    weight: id === marked ? MARKED_WEIGHT : REGION_OUTLINE.weight,
  });
  const restyleAll = (): void => {
    for (const [id, outline] of drawn) outline.setStyle(styleOf(id));
  };
  return {
    restyle: (view) => {
      access = new Map(
        view === undefined || view.readOnly
          ? []
          : view.regions.map((region) => [region.id, region.access]),
      );
      restyleAll();
    },
    highlight: (regionId) => {
      marked = regionId;
      restyleAll();
    },
  };
}

/** Said when the live map's data could not be loaded. */
const MAP_FAILED = 'The map could not be loaded. Try again in a moment.';

/** Said when "Map tour" is pressed while a form holds. */
const FORM_OPEN = 'Close the form that is open first.';

/** Whether the live map's data failed to load (review 2, R3): its line is not lost. */
interface MapLoad {
  failed: boolean;
}

/**
 * A line of the editor's toggle over the live map (a refusal, a screen too narrow), with the
 * live map's failure to load after it while that holds (review 2, R3): one line replaces the
 * other on the page.
 */
function sayOverMap(text: string, load: MapLoad): void {
  // The map that did not load is a lasting state (review fix F1): no timer then.
  say(load.failed ? `${text} ${MAP_FAILED}` : text, { lasting: load.failed });
}

/**
 * The region editor as a toggle of the map (plan 8M-10): "Edit regions" in the account's menu
 * for a member `/api/me` says may edit them, on a screen of the header's row; on, the live map's
 * parts make way for the editor's (its own map, tools and panel, loaded the first time), nothing
 * is polled, and the address says `?edit=regions`; "Back to the map" turns it off at its view.
 * Whether a form holds is the parties' to say, once they are drawn.
 */
function editorToggle(
  map: L.Map,
  guild: string,
  activity: MapActivity,
  account: { me: Me; held: () => boolean },
  load: MapLoad,
  /** "Edit regions" drawn again with what the browser holds now (S31). */
  editLabel: { redraw(): void },
  /** The editor is up (plan 8M-17: its tour, the first time). */
  editorUp: { tell(): void },
): EditorToggle {
  const data = document.body.dataset;
  const back = byId('editor-back') as HTMLButtonElement;
  const toggle = new EditorToggle({
    opened: () => {
      editorUp.tell();
    },
    held: () => account.held(),
    mount: loadOnce(
      document,
      { script: data.editorScript ?? '', style: data.editorStyle ?? '' },
      () => window.pineRegionEditor,
    ),
    opening: () => {
      // The live map's view, none while it could not be loaded (branch review W2: its fallback
      // view is not the server's; the editor fits its regions) or has none yet (still loading).
      const center = load.failed || !map.getZoom() ? undefined : map.getCenter();
      return {
        hosts: {
          map: byId('editor-map'),
          tools: byId('editor-tools'),
          panel: byId('editor-panel'),
          back,
        },
        guild,
        me: account.me,
        worker: data.worker ?? '',
        units: data.distanceUnits === 'metric' ? 'metric' : 'imperial',
        tiles: tileSetting(data.tiles),
        googleKey: data.googleKey,
        view:
          center === undefined
            ? undefined
            : { lat: center.lat, lon: center.lng, zoom: map.getZoom() },
      };
    },
    shown: (on, focus) => {
      // A line of one side is not left over the other (review 1, F3); back on the live map, its
      // failure to load is said again (review 2, R3).
      hideNotice();
      if (!on && load.failed) say(MAP_FAILED, { lasting: true });
      document.body.classList.toggle('editing-regions', on);
      for (const id of ['editor-bar', 'editor-map', 'editor-panel']) byId(id).hidden = !on;
      history.replaceState(
        null,
        '',
        addressWith(location.pathname, location.search, location.hash, on),
      );
      activity.setEditing(on);
      if (!on) {
        map.invalidateSize();
        // What the editor left staged, counted again in the account menu (plan 8M-11C, S31).
        editLabel.redraw();
      }
      // The focus where the member goes on (F7): "Back to the map", or the account's menu; left
      // where it is on a refusal before the editor was shown (review 2, R1).
      if (!focus) return;
      if (on) back.focus();
      else document.querySelector<HTMLElement>('#account summary')?.focus();
    },
    // Leaflet's `setView` keeps the view within the live map's own limits (its least zoom and
    // its bounds).
    handBack: (view) => {
      if (view) map.setView([view.lat, view.lon], view.zoom, { animate: false });
    },
    say: (text) => {
      sayOverMap(text, load);
    },
  });
  back.addEventListener('click', () => {
    toggle.turnOff();
  });
  return toggle;
}

/** Whether the region editor is offered on this browser now (S29). */
const editorHere = (): boolean => editorFits((query) => window.matchMedia(query).matches);

/**
 * The account menu's "Edit regions" (plan 8M-10, C7): built for the hint, shown where the editor
 * is offered (`map.css` under `EDITOR_MEDIA`, plan 8M-11C, S29), asked again at the click
 * (branch review W5). It says how many regions the browser holds unsaved changes of for this
 * server and member (plan 8M-11C, S31: `/api/me`'s `userId`), drawn again when the editor closes.
 */
function editItem(
  toggle: EditorToggle,
  load: MapLoad,
  guild: string,
  me: Me,
  editLabel: { redraw(): void },
): HTMLElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'edit-regions';
  editLabel.redraw = () => {
    // The editor's own count once it was opened (review C4), else what the browser keeps.
    const unsaved = unsavedCount(toggle.unsaved, () =>
      me.loggedIn && me.userId !== undefined
        ? stagedRegions(
            stagedStorage(() => window.localStorage),
            guild,
            me.userId,
          )
        : 0,
    );
    item.textContent = editItemLabel(unsaved);
  };
  editLabel.redraw();
  item.addEventListener('click', () => {
    editItemPressed({
      fits: editorHere,
      turnOn: () => {
        void toggle.turnOn();
      },
      say: (text) => {
        sayOverMap(text, load);
      },
    });
  });
  return item;
}

function start(): void {
  const data = document.body.dataset;
  const guild = data.guild ?? '';
  const map = L.map(byId('map'), { maxBoundsViscosity: BOUNDS_VISCOSITY });
  // Every popup of the page, however it is made, pans clear of the zoom buttons.
  const popupRoom = (): void => {
    L.Popup.mergeOptions({ autoPanPaddingTopLeft: popupPanPadding(map) });
  };
  popupRoom();
  // Leaflet tells of no size change before the map has a view, and the side pane opens after this.
  map.on('load resize', popupRoom);
  addTiles(map, tileSetting(data.tiles), data.googleKey);
  // `?login=` taken out of the address at once, said once `/api/me` answers logged out (review
  // fix 5).
  const notice = loginNotice(location.search);
  if (notice) {
    history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
  }
  // Whether the live map is in use (plan 8M-10): visible, and the region editor off.
  const activity = new MapActivity(() => document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', () => {
    activity.changed();
  });
  const asker: { me: Me; held: () => boolean } = { me: { loggedIn: false }, held: () => false };
  const load: MapLoad = { failed: false };
  const editLabel = {
    redraw: () => {
      // Drawn once "Edit regions" is built (`editItem`).
    },
  };
  const editorUp = {
    tell: () => {
      // Given below, once the tour is made.
    },
  };
  const toggle = editorToggle(map, guild, activity, asker, load, editLabel, editorUp);
  /** What the map's tour (plan 8M-17) asks of what is made further down. */
  const tourHooks = {
    /** The map is drawn or could not be: the press of "Map tour" waits for it. */
    settled: Promise.resolve() as Promise<unknown>,
    /** Clears the page for a tour by hand: popups, the card, the phone's list, Find. */
    clear: () => {
      // Given below, once they are made.
    },
    /** The box is a member's Find (plan 8M-12), not "Find a gym". */
    finds: false,
    /** The last list said the map is read-only. */
    listReadOnly: false,
    /** "Your regions…" is offered to this member (plan 8M-20, R15). */
    regions: false,
  };
  const tour = tourUi();
  map.on('move zoomend', () => {
    tour.replace();
  });
  /** The steps for who is asking now, and where the browser is told it saw them. */
  const tourFor = (me: Me) => {
    const audience = tourAudience(me);
    return {
      audience,
      steps: tourSteps({
        audience,
        finds: tourHooks.finds,
        regions: tourHooks.regions,
        more: me.loggedIn ? 'lacking' : data.login === 'discord' ? 'discord' : 'links',
      }),
    };
  };
  const editorBack = (): HTMLElement => byId('editor-back');
  editorUp.tell = () => {
    if (editorTourOpens(browserStorage())) tour.open(EDITOR_TOUR_STEPS, editorBack());
  };
  /** "Editor tour" in the account's menu, shown while the editor is on (`map.css`). */
  const editorTourItem = (): HTMLElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'editor-tour-item';
    item.textContent = 'Editor tour';
    item.addEventListener('click', () => {
      tour.open(EDITOR_TOUR_STEPS, editorBack());
    });
    return item;
  };
  const tourItem = (): HTMLElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tour-item';
    item.textContent = 'Map tour';
    item.addEventListener('click', () => {
      if (asker.held()) {
        sayOverMap(FORM_OPEN, load);
        return;
      }
      void tourHooks.settled.then(() => {
        if (load.failed) {
          say(MAP_FAILED, { lasting: true });
          return;
        }
        tourHooks.clear();
        const { audience, steps } = tourFor(asker.me);
        // A tour by hand while Discord is away is not the tour of a normal visit.
        if (!tourHooks.listReadOnly && !(asker.me.loggedIn && asker.me.readOnly)) {
          keepTourSeen(browserStorage(), audience);
        }
        tour.open(steps, document.querySelector<HTMLElement>('#account summary') ?? undefined);
      });
    });
    return item;
  };
  /** The region editor was asked by address: read now, the address changes as it opens. */
  const editorAsked = editingAsked(location.search);
  /**
   * The tour opens by itself once, on a quiet page; else it stays due for the next visit. Marked
   * seen as it opens: a browser that cannot keep that does not get it at every load.
   */
  const tourByItself = (me: Me, readOnly: boolean): void => {
    const storage = browserStorage();
    const { audience, steps } = tourFor(me);
    const open = tourOpensByItself(readTourSeen(storage), audience, {
      readOnly,
      editorAlone: !toggle.used && !editorAsked,
      quiet: !asker.held() && quietPage(byId('filter') as HTMLInputElement),
    });
    if (open && !tour.running() && keepTourSeen(storage, audience)) tour.open(steps);
  };
  // The layers (plan 8M-7): the member's choice kept per browser.
  const registry = new LayerRegistry(browserStorage());
  for (const layer of MAP_LAYERS) registry.register(layer);
  const controls = showLayerControls(registry, byId('layers'));
  const quiet = quietLine(map);
  // "Your regions…" in the account's menu (plan 8M-20, R10): shown once the member's view of the
  // regions says the server offers a role that opens or closes one of them (R11), and not while
  // the last list is read-only (B4).
  const regionsHooks = {
    open: () => {
      // Given below, once the parties are drawn.
    },
    offered: false,
    /** The first view of the regions, which the tour that opens by itself waits for (B1). */
    loaded: Promise.resolve() as Promise<unknown>,
  };
  const showRegionsItem = (): void => {
    regionsItem.hidden = !regionsHooks.offered || tourHooks.listReadOnly;
  };
  const regionsItem = document.createElement('button');
  regionsItem.type = 'button';
  regionsItem.className = 'regions-item';
  regionsItem.textContent = 'Your regions…';
  regionsItem.hidden = true;
  regionsItem.addEventListener('click', () => {
    regionsHooks.open();
  });
  // Light, Dark or Device for the map and its region editor (plan 8M-13, S10).
  const account = showAccount(
    guild,
    data.login === 'discord' ? 'discord' : 'links',
    'map',
    // The server's history page (plan 8H-5) and "Your history" (plan 8H-6) for a member, then the
    // region editor's items.
    (me) => [
      ...(historyOffered(me)
        ? [
            renderNode(historyItemNode(guild), document),
            renderNode(meItemNode(guild), document),
            regionsItem,
          ]
        : []),
      ...(editingOffered(me)
        ? [editItem(toggle, load, guild, me, editLabel), editorTourItem()]
        : []),
    ],
    true,
    () => [tourItem()],
  ).then((me) => {
    asker.me = me;
    return me;
  });
  void account.then((me) => {
    const text = loginNoticeFor(notice, me);
    if (text !== undefined) say(text);
  });
  const you = showWhereYouAre(map, say);
  // The notice band's × (plan 8M-11A): hidden at once.
  byId('notice-close').addEventListener('click', () => {
    hideNotice();
  });
  // On a phone (`map.css`) "List" swaps the map for the list of what is on, and back (plan 8M-7).
  const listButton = byId('list-button');
  const showList = (open: boolean): void => {
    document.body.classList.toggle('list-open', open);
    // Its words say what a press shows next; no `aria-pressed` beside them, which would read
    // "Map, pressed" (review fix 9).
    listButton.textContent = open ? 'Map' : 'List';
    if (!open) map.invalidateSize();
  };
  listButton.addEventListener('click', () => {
    listByFind = false;
    showList(!document.body.classList.contains('list-open'));
  });
  /** Whether Find opened the phone's list (plan 8M-12): it closes it again when cleared. */
  let listByFind = false;
  // On a phone "Find a gym" opens over the map from the search button of the one row (fix round 1).
  const searchButton = byId('search-button');
  const filterBox = byId('filter') as HTMLInputElement;
  /** Whether a member's Find holds a search (plan 8M-12), once the parties are drawn. */
  const findHooks = { finding: () => false };
  const showSearch = (open: boolean): void => {
    document.body.classList.toggle('search-open', open);
    searchButton.setAttribute('aria-expanded', String(open));
    if (open) {
      filterBox.focus();
      // The box brought back after a pick hid it (ruling R1): its results with it.
      if (findHooks.finding() && !document.body.classList.contains('list-open')) {
        listByFind = true;
        showList(true);
      }
    } else if (filterBox.value !== '') {
      // Closed, its words no longer filter the map unseen (round 2).
      filterBox.value = '';
      filterBox.dispatchEvent(new Event('input'));
    }
  };
  tourHooks.clear = () => {
    map.closePopup();
    showList(false);
    showSearch(false);
  };
  searchButton.addEventListener('click', () => {
    showSearch(!document.body.classList.contains('search-open'));
  });
  filterBox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      showSearch(false);
      searchButton.focus();
    }
  });
  const loading = showGeo(map, guild, you, registry, activity).then(
    async ({ gyms, names, regions, dots, outlines }) => {
      // The parties of the server for a member who is logged in (plan 8M-3); while Discord
      // cannot be reached the server says whether it still knows them as a member. A member
      // may report raids at gyms (plan 8M-4) and spawns at any point (plan 8M-4S), not while
      // the map is read-only: by `/api/me` at first, then by the list of parties at each draw.
      const me = await account;
      const member = me.loggedIn && (me.member || me.readOnly);
      controls.refresh(member);
      // A Power Spot tapped is a stop in route mode (plan 8M-8C, R5), once the parties are drawn.
      const spotTaps: {
        clicked: (spot: { id: string; title: string; lat: number; lon: number }) => boolean;
      } = {
        clicked: () => false,
      };
      // A Power Spot's popup offers "Report max battle here", and a spot whose battle is drawn
      // shows the battle (plan 8M-9A), once the parties are drawn.
      const placesHooks: PlacesHooks = {
        spotControls: () => [],
        occupied: () => new Set(),
        forced: () => false,
        openBattle: () => false,
        stopTapped: () => false,
        stopPopup: () => undefined,
        spotPopup: () => undefined,
      };
      const places = showPlaces(
        map,
        guild,
        registry,
        quiet,
        () => member,
        (spot) => spotTaps.clicked(spot),
        routeFocus,
        {
          spotControls: (spot) => [
            ...activityLine('spot', spot.id),
            ...placesHooks.spotControls(spot),
          ],
          occupied: (layer) => placesHooks.occupied(layer),
          forced: (layer) => placesHooks.forced(layer),
          openBattle: (spotId) => placesHooks.openBattle(spotId),
          stopTapped: (stop) => placesHooks.stopTapped(stop),
          stopPopup: (stop) => placesHooks.stopPopup?.(stop),
          spotPopup: (spot) => placesHooks.spotPopup?.(spot),
          spotAddress: (spot, popup) => {
            void spotAddresses.fill(popup, spot);
          },
          placeTapped: (layer, place, own) => {
            if (placesHooks.placeTapped) placesHooks.placeTapped(layer, place, own);
            else own();
          },
          // The Activity layer's circles follow the Power Spots drawn (review 8H4H-3).
          drawn: (layer) => {
            if (layer === 'spots') activityShown.now?.refresh();
          },
        },
        activity,
      );
      // A Power Spot's address asked for as one of its popups opens (design 2026-11-04), once per
      // spot while the page lives, kept in the places' last list when it comes.
      const spotAddresses = pageSpotAddresses({ guild, getJson, places, document });
      if (!me.loggedIn || !member) {
        // The side pane says how to see what is on (plan 8M-7).
        const pane = byId('parties');
        const section = document.createElement('section');
        section.className = 'what-is-on';
        loggedOutPane(
          section,
          me.loggedIn ? 'member-only' : data.login === 'discord' ? 'discord' : 'links',
          // Campfire's official meetups are public (plan 8V-1): the line stands whatever the
          // layers offer a visitor (plan 8M-13, L1).
          true,
        );
        pane.replaceChildren(section);
        pane.hidden = false;
        map.invalidateSize();
        tourByItself(me, false);
        return;
      }
      // The party history as a heatmap (plan 8H-4): a member's layer, under More; its counts in
      // the gyms' and Power Spots' popups and on the gyms' clusters (plan 8H-4H).
      // No circle takes a tap while a place is picked (review P4), once the parties are drawn.
      const picks = { now: (): boolean => false };
      // A circle only where the place's own dot is not drawn (review 8H4H-3): by what is drawn.
      // An ended train the address names (plan 8H-7B, the post's "Route on the map"): History
      // opens at it, and the address forgets it once asked (a reload opens the map as usual).
      const train = trainOfAddress(location.search);
      activityShown.now = showActivity(
        map,
        guild,
        registry,
        () => picks.now(),
        (kind, id) => (kind === 'gym' ? dots.drawn(Number(id)) : places.spotDrawn(id)),
        train === undefined
          ? undefined
          : {
              train,
              taken: () => {
                history.replaceState(
                  null,
                  '',
                  addressWithoutTrain(location.pathname, location.search, location.hash),
                );
              },
            },
      );
      // The gyms' clusters are named anew as the counts change (review R3).
      activityShown.now.onCounts(() => {
        dots.names();
      });
      /** Only the first list opens the map's tour (plan 8M-17). */
      let listSeen = false;
      const mayReport = me.member && !me.readOnly;
      const raids = showParties(map, guild, me, gyms, names, regions, mayReport, {
        registry,
        // A filter of the reports at stops in sight on its layer's toggle (plan 8M-9B).
        filtered: (layer, words) => {
          controls.filtered(layer, words);
        },
        afterDraw: () => {
          dots.refresh();
          places.redrawn();
        },
        listDrawn: (list) => {
          tour.replace();
          tourHooks.listReadOnly = list.readOnly;
          showRegionsItem();
          if (listSeen) return;
          listSeen = true;
          // Once the view of the regions came, or within its wait (B1): its step needs it.
          void settledWithin(regionsHooks.loaded, TOUR_WAITS_FOR_REGIONS_MS, (run, ms) => {
            window.setTimeout(run, ms);
          }).then(() => {
            tourByItself(me, list.readOnly || (me.loggedIn && me.readOnly));
          });
        },
        located: () => you.located(),
        onMove: (listener) => {
          you.onMove(listener);
        },
        storage: browserStorage(),
        showMap: () => {
          showList(false);
        },
        // Find's results open the list on a phone (plan 8M-12), and close it again where Find
        // opened it.
        finding: (on) => {
          if (on && !document.body.classList.contains('list-open')) {
            listByFind = true;
            showList(true);
          } else if (!on && listByFind) {
            listByFind = false;
            showList(false);
          }
        },
        // Find's "Back to the list" (BR-3): the box emptied, so that its input ends the search.
        findCleared: () => {
          filterBox.value = '';
          filterBox.dispatchEvent(new Event('input'));
        },
        // Find's again once it no longer stands aside (re-review N1).
        findText: () => filterBox.value,
        // Whether the box thins the gyms changed (re-review M1): drawn anew.
        boxChanged: () => {
          dots.refresh();
        },
        // A pick hides the phone's floating box, its text kept (ruling R1): the search button
        // brings it and its results back.
        findPicked: () => {
          document.body.classList.remove('search-open');
          searchButton.setAttribute('aria-expanded', 'false');
        },
        // The settings' units (task 7), as Discord says distances.
        units: data.distanceUnits === 'metric' ? 'metric' : 'imperial',
        // The Report button's step 2 (plan 8M-9A): the gyms and places it draws follow.
        placesChanged: () => {
          dots.refresh();
          places.refresh();
          // Their targets to tap follow whether step 2 picks them (R1-10).
          places.redrawn();
          activityShown.now?.refresh();
        },
        // Its step 3 (A6): a gym's or Power Spot's own popup, whatever the layers draw.
        openGym: (gym) => dots.open(gym),
        openSpot: (spot) => places.openSpot(spot),
        onSpots: (listener) => {
          places.onSpots(listener);
        },
        // A report at a stop's step 2 and 3 (plan 8M-9B, B9), as the Power Spots'.
        onStops: (listener) => {
          places.onStops(listener);
        },
        openStop: (stop) => places.openStop(stop),
        // A battle's popup or a Power Spot's line asks the spot's address (design 2026-11-04).
        spotAddress: (popup, spot) => {
          void spotAddresses.fill(popup, spot);
        },
        routeMode: (on) => {
          routeFocus.set(on);
          activityShown.now?.refresh();
        },
        // A place picked or no longer (a meetup's too, review R1): the circles give way or come back.
        picksChanged: () => {
          activityShown.now?.refresh();
        },
        // Nothing polled while the region editor is on (plan 8M-10).
        activity,
        // "Your regions" (plan 8M-20): the outlines by how the member stands to each region, and
        // "Your regions…" in the account's menu where the server offers a role that opens one.
        regionsShown: (view) => {
          outlines.restyle(view);
          regionsHooks.offered = regionsOffered(view);
          showRegionsItem();
          tourHooks.regions = regionsOffered(view);
        },
        highlightRegion: (regionId) => {
          outlines.highlight(regionId);
        },
      });
      regionsHooks.open = () => {
        raids.openRegions();
      };
      regionsHooks.loaded = raids.regionsLoaded;
      picks.now = () => raids.picksPlace();
      activityShown.now.refresh();
      // "Edit regions" is refused while a form of the map holds (plan 8M-10, C8).
      asker.held = () => raids.editing();
      const clearPage = tourHooks.clear;
      tourHooks.clear = () => {
        raids.closeOpen();
        clearPage();
      };
      tourHooks.finds = mayReport;
      gymExtras.editing = () => raids.editing();
      gymExtras.of = (gym) => raids.gymControls(gym);
      gymExtras.clicked = (gym) => raids.gymClicked(gym);
      spotTaps.clicked = (spot) => raids.spotClicked(spot);
      placesHooks.spotControls = (spot) => raids.spotControls(spot);
      // A Power Spot with a battle shows the battle (A6), a PokéStop with reports their marker
      // (plan 8M-9B).
      placesHooks.occupied = (layer) =>
        layer === 'spots' ? raids.battleSpots() : raids.reportStops();
      placesHooks.forced = (layer) => raids.forcedPlaces(layer);
      placesHooks.openBattle = (spotId) => raids.openBattle(spotId);
      placesHooks.stopTapped = (stop) => raids.stopTapped(stop);
      // A PokéStop's popup: how far, Directions, its actions (plan 8M-9B, B11).
      placesHooks.stopPopup = (stop) => raids.stopPopup(stop);
      placesHooks.spotPopup = (spot) => raids.spotPopup(spot);
      placesHooks.placeTapped = (layer, place, own) => {
        raids.placeTapped(layer, place, own);
      };
      places.redrawn();
      gymExtras.forced = () => raids.forced();
      gymExtras.raidGyms = () => raids.raidGyms();
      gymExtras.raidsShown = () => raids.raidsShown();
      gymExtras.tapped = (gym, own) => {
        raids.gymTapped(gym, own);
      };
      if (mayReport) {
        // Find (plan 8M-12): for a member, the box finds reports, parties and places, its results
        // in the list pane, and the map stays as it is while typing; visitors, members without the
        // map's role and a read-only map keep "Find a gym", which thins the dots.
        // While a gym is to be clicked or a form holds the pane, text typed meanwhile thins the
        // gyms as "Find a gym" does (branch review BR-1); a Find search left in the box does not
        // (re-review N1).
        gymExtras.thins = () => raids.boxThins();
        findHooks.finding = () => raids.finding();
        filterBox.placeholder = FIND_PLACEHOLDER;
        filterBox.setAttribute('aria-label', FIND_PLACEHOLDER);
        // No more than Find's route takes (branch review BR-4).
        filterBox.maxLength = FIND_MAX_TEXT;
        filterBox.addEventListener('input', () => {
          raids.find(filterBox.value);
        });
        filterBox.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !raids.findOff()) raids.findFirst();
        });
        raids.find(filterBox.value);
      }
      dots.refresh();
    },
  );
  const loaded = loading.catch(() => {
    // Leaflet draws nothing until the map has a view.
    if (!map.getZoom()) map.setView([40.44, -79.99], 11);
    load.failed = true;
    say(MAP_FAILED, { lasting: true });
  });
  tourHooks.settled = loaded;
  // `/s/<guild>/regions/edit` led here (plan 8M-10, C5): once the map is drawn or could not be
  // (review 1, F8: the editor opens at its view either way), and the member is known.
  void editorByAddress(editingAsked(location.search), [loaded, account], {
    fits: editorHere,
    turnOn: () => {
      void toggle.turnOn();
    },
    leave: () => {
      history.replaceState(
        null,
        '',
        addressWith(location.pathname, location.search, location.hash, false),
      );
    },
    say: (text) => {
      sayOverMap(text, load);
    },
  });
}

start();
