import * as L from 'leaflet';
import type { MapSpawn, SpawnsView } from '../../domain/web/spawn-data.js';
import type { LayerRegistry } from './layer-registry.js';
import { listAskLimit, LiveList } from './live.js';
import { Poller, type MapActivity } from './parties.js';
import { renderNode, type PageNode } from './popup.js';
import { tapBox, type MarkerSize } from './raid-marker.js';
import { drawShapes } from './report-ui.js';
import type { PlacedThing } from './shared-place.js';
import {
  nextSpawnEnd,
  SPAWN_LAYER,
  spawnMarkerNode,
  spawnName,
  spawnPlaced,
  spawnPopupKey,
  spawnsInView,
  spawnsShown,
} from './spawns.js';

/*
 * The wild spawns of the live map in the page (Matt, 2026-11-07): `/api/spawns` asked as the
 * reports at stops are (`Poller`: while the page is visible every 20 seconds, or while it is live,
 * `live.ts`, at each signal of the list "spawns" and every 2 minutes; at once after a report from
 * this page; stopped by a 401 or 403, drawn only when its JSON changed; the browser revalidates it
 * by its ETag), each spawn with a point a marker of ours (`spawnMarkerNode`) drawn with the parties
 * (`draw`, inside their draw: one hold, one redraw, one list of things at a place), its popup bound
 * by the parties' `withPopup` (the phone card, the held content), its tap the parties' (`open`: the
 * list of the things at its place where it shares it). A spawn drops when it goes away without
 * waiting for the poll: the parties are drawn anew at the next end.
 */

const EVERY_MS = 20_000;
/** The longest delay `setTimeout` takes. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * How far a spawn's marker is stacked under the others (review S1): a raid, a battle or a report
 * at the same place stays on top, as a spawn passes while they stand.
 */
export const SPAWN_Z_OFFSET = -1000;

export interface SpawnLayerDeps {
  map: L.Map;
  guild: string;
  registry: LayerRegistry;
  /** Whether the live map is in use: nothing is asked for while the region editor is on (8M-10). */
  activity: MapActivity;
  /** Draws the parties anew, through their hold (not under a form being filled in). */
  redraw(): void;
  /** A 401 or a 403: the list is not asked for again. */
  stopped(): void;
  /** The server's latest spread (`LiveConnection.latestSpread`). */
  spread(): number;
}

/** What a draw of the spawns needs of the parties' draw. */
export interface SpawnDraw {
  now: number;
  size: MarkerSize;
  /** The circle of a full marker and of a small one, in pixels (`theme.css`). */
  circles: { full: number; small: number };
  /** The spawns whose popup or card is open (by id): they stay past their end, saying "Ended". */
  keep: ReadonlySet<string>;
  /** Whether the markers take taps (not while a place is picked or a train routed). */
  interactive: boolean;
  /** Binds the spawn's popup (`withPopup`) under its key. */
  bind(marker: L.Marker, key: string, popup: () => PageNode): L.Marker;
  /** Opens what a tap on the marker opens (`openAt`: the list where it shares its place). */
  open(key: string, marker: L.Marker): void;
  /** The popup of a spawn. */
  popup(spawn: MapSpawn): PageNode;
}

export function spawnLayer(deps: SpawnLayerDeps) {
  const { map, guild, registry, activity } = deps;
  const group = L.layerGroup().addTo(map);
  let view: SpawnsView | undefined;
  let shown = '';
  /** The spawns drawn last, for the count in view. */
  let drawn: MapSpawn[] = [];
  let timer: number | undefined;

  const pageTimer = (run: () => void, ms: number): (() => void) => {
    const handle = window.setTimeout(run, ms);
    return () => {
      window.clearTimeout(handle);
    };
  };
  const poller = new Poller({
    now: () => Date.now(),
    everyMs: EVERY_MS,
    active: () => activity.active(),
    setTimer: pageTimer,
    stopped: () => {
      deps.stopped();
    },
    load: async () => {
      try {
        // The browser asks again with the ETag it has; a 304 gives the body it kept.
        const answer = await fetch(`/s/${guild}/api/spawns`, {
          credentials: 'same-origin',
          ...listAskLimit(),
        });
        if (answer.status === 401 || answer.status === 403) return 'stop';
        // 503 (Discord cannot say who the member is just now) and the rest: asked again later.
        if (!answer.ok) {
          pace.answered(false, false);
          return 'go';
        }
        const text = await answer.text();
        if (text !== shown) {
          shown = text;
          view = JSON.parse(text) as SpawnsView;
          deps.redraw();
        }
        pace.answered(true, false);
      } catch {
        // Offline for a moment: the next turn asks again.
        pace.answered(false, false);
      }
      return 'go';
    },
  });
  const pace = new LiveList({
    poller,
    now: () => Date.now(),
    setTimer: pageTimer,
    spread: () => deps.spread(),
  });
  activity.onChange(() => {
    poller.activeChanged();
  });

  /** The parties drawn anew when the next spawn goes away, once. */
  const atNextEnd = (now: number): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    const end = nextSpawnEnd(view, now);
    if (end === undefined) return;
    timer = window.setTimeout(
      () => {
        timer = undefined;
        deps.redraw();
      },
      Math.min(end - now + 1_000, MAX_TIMER_MS),
    );
  };

  const counted = (): void => {
    const bounds = map.getBounds();
    registry.setCount(
      SPAWN_LAYER,
      spawnsInView(drawn, (point) => bounds.contains([point.lat, point.lon])),
    );
  };
  map.on('moveend', counted);

  return {
    /** The list's pace, told by the page's live connection. */
    pace,

    /** The spawns as the last answer gave them. */
    get view(): SpawnsView | undefined {
      return view;
    },

    start(): void {
      void poller.start();
    },

    /** Asks at once (after a report from this page). */
    now: (): Promise<void> => poller.now(),

    /** Every spawn that has not gone away (those whose popup is open too): the list's. */
    all(now: number, keep?: ReadonlySet<string>): MapSpawn[] {
      return registry.isOn(SPAWN_LAYER)
        ? spawnsShown(view, { now, ...(keep === undefined ? {} : { keep }) })
        : [];
    },

    /**
     * Draws a marker per spawn with a point while the layer is on (inside the parties' draw);
     * gives the things it placed, for the list of the things at one place.
     */
    draw(how: SpawnDraw): Array<PlacedThing & { layer: typeof SPAWN_LAYER }> {
      group.clearLayers();
      drawn = registry.isOn(SPAWN_LAYER)
        ? spawnsShown(view, { now: how.now, keep: how.keep }).filter((one) => one.point !== null)
        : [];
      const circle = how.size === 'full' ? how.circles.full : how.circles.small;
      const placed = drawn.flatMap((spawn): Array<PlacedThing & { layer: typeof SPAWN_LAYER }> => {
        const at = spawnPlaced(spawn, how.now);
        if (!at) return [];
        const key = spawnPopupKey(spawn.id);
        const element = renderNode(spawnMarkerNode(spawn, how.now, how.size), document);
        drawShapes(element);
        const box = tapBox(circle);
        const marker: L.Marker = L.marker([at.lat, at.lon], {
          icon: L.divIcon({
            html: element,
            className: 'stop-icon',
            iconSize: [box, box],
            iconAnchor: [box / 2, box / 2],
            popupAnchor: [0, -circle / 2],
          }),
          keyboard: how.interactive,
          interactive: how.interactive,
          // Under every raid, battle and report at the same place (review S1): Leaflet stacks
          // markers by their latitude in pixels plus this.
          zIndexOffset: SPAWN_Z_OFFSET,
          // Named for a screen reader by its Pokémon, as Leaflet sets it: as text.
          title: spawnName(spawn),
        });
        how.bind(marker, key, () => how.popup(spawn));
        // Opened by our own handler: a tap where it shares its place lists what is there.
        marker.off('click').off('keypress');
        const clicked = (event: L.LeafletEvent): void => {
          L.DomEvent.stop(event);
          how.open(key, marker);
        };
        marker.on('click', clicked);
        marker.on('keypress', (event: L.LeafletKeyboardEvent) => {
          if (event.originalEvent.key === 'Enter') clicked(event);
        });
        marker.addTo(group);
        return [{ ...at, layer: SPAWN_LAYER }];
      });
      counted();
      atNextEnd(how.now);
      return placed;
    },
  };
}

export type SpawnLayer = ReturnType<typeof spawnLayer>;
