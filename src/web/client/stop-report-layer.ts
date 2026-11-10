import * as L from 'leaflet';
import type { StopReportsView } from '../../domain/web/stop-report-data.js';
import type { LayerRegistry } from './layer-registry.js';
import { listAskLimit, LiveList } from './live.js';
import { Poller, type MapActivity } from './parties.js';
import { renderNode, type PageNode } from './popup.js';
import { tapBox, type MarkerSize } from './raid-marker.js';
import { drawShapes } from './report-ui.js';
import type { PlacedThing } from './shared-place.js';
import {
  nextEnd,
  reportsAtStops,
  reportsInView,
  stopMarkerNode,
  stopPlaced,
  stopPopupKey,
  type StopLayer,
  type StopPick,
  type StopReports,
} from './stop-reports.js';

/*
 * The reports at stops of the live map in the page (plan 8M-9B): `/api/stop-reports` asked as the
 * parties are (`Poller`: while the page is visible every 20 seconds, or while it is live, `live.ts`,
 * at each signal and every 2 minutes; at once after a report or a take-back from this page, stopped
 * by a 401 or 403, drawn only when its JSON changed; the browser
 * revalidates it by its ETag), each stop with reports a marker of ours (`stopMarkerNode`) drawn
 * with the parties (`draw`, inside their draw: one hold, one redraw, one list of things at a
 * place), its popup bound by the parties' `withPopup` (the phone card, the held content), its tap
 * the parties' (`open`: the list of the things at its place where it shares it, B3). A report
 * drops at its end without waiting for the poll: the parties are drawn anew at the next end.
 */

const EVERY_MS = 20_000;
/** The longest delay `setTimeout` takes. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export interface StopReportLayerDeps {
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

/** What a draw of the reports needs of the parties' draw. */
export interface StopDraw {
  now: number;
  size: MarkerSize;
  /** The circle of a full marker and of a small one, in pixels (`theme.css`). */
  circles: { full: number; small: number };
  /** The stops whose popup or card is open: their reports stay past their end (B14). */
  keep: ReadonlySet<string>;
  /** Whether the markers take taps (not while route mode or a meetup's place lets them through). */
  interactive: boolean;
  /** Whether a report passes the filters; all where none is given. */
  shows?: StopPick['shows'];
  /** Binds the stop's popup (`withPopup`) under its key. */
  bind(marker: L.Marker, key: string, popup: () => PageNode): L.Marker;
  /** A tap taken before its popup (the Report button's step 2, a form's picking): true takes it. */
  tapped(at: StopReports): boolean;
  /** Opens what a tap on the marker opens (`openAt`: the list where it shares its place). */
  open(key: string, marker: L.Marker): void;
  /** The popup of a stop with reports. */
  popup(at: StopReports): PageNode;
}

export function stopReportLayer(deps: StopReportLayerDeps) {
  const { map, guild, registry, activity } = deps;
  const group = L.layerGroup().addTo(map);
  let view: StopReportsView | undefined;
  let shown = '';
  /** The stops drawn last, for the counts in view and the PokéStops left out under them. */
  let drawn: StopReports[] = [];
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
        const answer = await fetch(`/s/${guild}/api/stop-reports`, {
          credentials: 'same-origin',
          ...listAskLimit(),
        });
        if (answer.status === 401 || answer.status === 403) return 'stop';
        // 503 (Discord cannot say who the member is just now) and the rest: asked again later.
        if (!answer.ok) {
          pace.answered(false, view?.readOnly ?? false);
          return 'go';
        }
        const text = await answer.text();
        if (text !== shown) {
          shown = text;
          view = JSON.parse(text) as StopReportsView;
          deps.redraw();
        }
        pace.answered(true, view?.readOnly ?? false);
      } catch {
        // Offline for a moment: the next turn asks again.
        pace.answered(false, view?.readOnly ?? false);
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

  /** The parties drawn anew at the next end of a report (B14), once. */
  const atNextEnd = (now: number): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    const end = nextEnd(view, now);
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
    const counts = reportsInView(drawn, (point) => bounds.contains([point.lat, point.lon]));
    for (const layer of ['research', 'rocket'] as const) registry.setCount(layer, counts[layer]);
  };
  map.on('moveend', counted);

  return {
    /** The list's pace, told by the page's live connection. */
    pace,

    /** The reports as the last answer gave them. */
    get view(): StopReportsView | undefined {
      return view;
    },

    start(): void {
      void poller.start();
    },

    /** Asks at once (after a report or a take-back from this page). */
    now: (): Promise<void> => poller.now(),

    /** Every report that has not ended and passes the filters, of both layers, by stop: the list's. */
    all(now: number, shows?: StopPick['shows']): StopReports[] {
      return reportsAtStops(view, {
        on: () => true,
        now,
        ...(shows === undefined ? {} : { shows }),
      });
    },

    /**
     * Draws a marker per stop with reports of the layers on (inside the parties' draw); gives the
     * things it placed, for the list of the things at one place.
     */
    draw(how: StopDraw): Array<PlacedThing & { layer: StopLayer }> {
      group.clearLayers();
      drawn = reportsAtStops(view, {
        on: (layer) => registry.isOn(layer),
        now: how.now,
        keep: how.keep,
        ...(how.shows === undefined ? {} : { shows: how.shows }),
      });
      const circle = how.size === 'full' ? how.circles.full : how.circles.small;
      const placed = drawn.map((at) => {
        const key = stopPopupKey(at.stop.key);
        const element = renderNode(stopMarkerNode(at, how.now, how.size), document);
        drawShapes(element);
        const box = tapBox(circle);
        const marker: L.Marker = L.marker([at.stop.lat, at.stop.lon], {
          icon: L.divIcon({
            html: element,
            className: 'stop-icon',
            iconSize: [box, box],
            iconAnchor: [box / 2, box / 2],
            popupAnchor: [0, -circle / 2],
          }),
          keyboard: how.interactive,
          interactive: how.interactive,
          // Named for a screen reader by its stop, as Leaflet sets it: as text.
          title: at.stop.name,
        });
        how.bind(marker, key, () => how.popup(at));
        // Opened by our own handler (`gymClicks` of the parties): a tap the Report button's step 2
        // or a form takes is not a popup.
        marker.off('click').off('keypress');
        const clicked = (event: L.LeafletEvent): void => {
          L.DomEvent.stop(event);
          if (!how.tapped(at)) how.open(key, marker);
        };
        marker.on('click', clicked);
        marker.on('keypress', (event: L.LeafletKeyboardEvent) => {
          if (event.originalEvent.key === 'Enter') clicked(event);
        });
        marker.addTo(group);
        return stopPlaced(at, how.now);
      });
      counted();
      atNextEnd(how.now);
      return placed;
    },

    /** The stops whose marker is drawn: their plain PokéStop dot is left out (`occupied`). */
    stops(): ReadonlySet<string> {
      return new Set(drawn.map((at) => at.stop.key));
    },
  };
}

export type StopReportLayer = ReturnType<typeof stopReportLayer>;
