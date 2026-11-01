import type {
  MapGrunt,
  MapHideout,
  MapResearch,
  MapStop,
  StopReportsView,
} from '../../domain/web/stop-report-data.js';
import type { PageNode } from './popup.js';
import { badgeWords, isDimmed, type MarkerSize } from './raid-marker.js';
import { iconNode } from './report-menu.js';
import { REPORT_ICONS } from './report-icons.js';
import type { PlacedThing } from './shared-place.js';
import type { LatLon } from './view.js';

/*
 * The reports at stops on the live map (plan 8M-9B; design "Markers"): two live layers, Field
 * research and Team GO Rocket, from `/api/stop-reports`; one marker per stop holding every report
 * shown there (research, a grunt, a hideout), a plain circle centered on the stop, never
 * clustered. Its picture a hideout's, else the research's (its reward line's in the post: the one
 * reward's, the encounter picture for "one of"), else the Rocket icon for a grunt (B2), the
 * research icon for a typed task without its reward; its ring of `--research` or `--rocket`, half
 * and half where it has both; a grunt's minutes left as a raid's badge, dimmed in its last five
 * minutes by the raids' rule (`isDimmed`, the domain's `endsSoon`). A report drops at its end
 * without waiting for the list, but at the stop whose popup or card is open, which says "Ended"
 * (B14). The pure part; `stop-report-layer.ts` draws it.
 */

/** The two layers of the reports at stops (their ids in `MAP_LAYERS`). */
export type StopLayer = 'research' | 'rocket';

/** A report of either layer. */
export type StopReport = MapResearch | MapGrunt | MapHideout;

/** What is shown at a stop: its snapshot and its reports by kind, in the list's order. */
export interface StopReports {
  stop: MapStop;
  research: MapResearch[];
  grunts: MapGrunt[];
  hideouts: MapHideout[];
}

/** How the reports are picked: the layers on, the clock, the stops kept open, a filter. */
export interface StopPick {
  on(layer: StopLayer): boolean;
  now: number;
  /** The stops whose popup or card is open: their reports stay past their end (B14). */
  keep?: ReadonlySet<string>;
  /** Whether a report passes the filters (plan 8M-9B, goal 5); all where none is given. */
  shows?(report: StopReport, layer: StopLayer): boolean;
}

/** A stop's popup key on the map (`stop:<key>`), as the parties' are `gym:<id>`. */
export const stopPopupKey = (stopKey: string): string => `stop:${stopKey}`;

/** The reports of the view shown now, gathered by stop in the order the view lists them. */
export function reportsAtStops(view: StopReportsView | undefined, pick: StopPick): StopReports[] {
  if (!view) return [];
  const byStop = new Map<string, StopReports>();
  const at = (stop: MapStop): StopReports => {
    let found = byStop.get(stop.key);
    if (!found) {
      found = { stop, research: [], grunts: [], hideouts: [] };
      byStop.set(stop.key, found);
    }
    return found;
  };
  const shown = (report: StopReport, layer: StopLayer): boolean =>
    pick.on(layer) &&
    (report.endsAt > pick.now || pick.keep?.has(report.stop.key) === true) &&
    (pick.shows?.(report, layer) ?? true);
  // Every stop that has a report shown (of a layer on, not ended or kept, passing the filters) is
  // placed, in the view's order; a stop whose reports a filter hides all is not.
  for (const report of view.research)
    if (shown(report, 'research')) at(report.stop).research.push(report);
  for (const report of view.grunts)
    if (shown(report, 'rocket')) at(report.stop).grunts.push(report);
  for (const report of view.hideouts) {
    if (shown(report, 'rocket')) at(report.stop).hideouts.push(report);
  }
  return [...byStop.values()];
}

/** The soonest end still to come of the view's reports: when to draw them anew (B14). */
export function nextEnd(view: StopReportsView | undefined, now: number): number | undefined {
  if (!view) return undefined;
  const ends = [...view.research, ...view.grunts, ...view.hideouts]
    .map((report) => report.endsAt)
    .filter((end) => end > now);
  return ends.length === 0 ? undefined : Math.min(...ends);
}

/** A stop marker's picture: one of the server's, or an icon of the Report menu's. */
export type StopPicture = { kind: 'picture'; src: string } | { kind: 'icon'; icon: StopLayer };

/** What a stop's marker is drawn from. */
export interface StopMarkerFacts {
  picture: StopPicture;
  ring: StopLayer | 'both';
  /** The soonest grunt's end: its badge and its last minutes; none without a grunt. */
  end?: number;
  /** A grunt's minutes left (`12m`), as a raid's badge says them. */
  badge?: string;
  dimmed: boolean;
}

/** The soonest-ending grunt at a stop, if any. */
function soonestGrunt(at: StopReports): MapGrunt | undefined {
  return [...at.grunts].sort((a, b) => a.endsAt - b.endsAt)[0];
}

/**
 * A stop's marker facts (goal 2, B2): its picture (a hideout's, else the research's, else the
 * Rocket icon for a grunt; the research icon for research without a picture), its ring, and a
 * grunt's minutes and last minutes as a raid's (`badgeWords`, `isDimmed`).
 */
export function stopMarkerFacts(at: StopReports, now: number): StopMarkerFacts {
  const hideoutPicture = at.hideouts.find((one) => one.picture !== undefined)?.picture;
  const researchPicture = at.research.find((one) => one.picture !== undefined)?.picture;
  const src = hideoutPicture ?? researchPicture;
  const picture: StopPicture =
    src !== undefined
      ? { kind: 'picture', src }
      : { kind: 'icon', icon: at.research.length > 0 ? 'research' : 'rocket' };
  const rocket = at.grunts.length + at.hideouts.length > 0;
  const research = at.research.length > 0;
  const grunt = soonestGrunt(at);
  return {
    picture,
    ring: research && rocket ? 'both' : research ? 'research' : 'rocket',
    ...(grunt === undefined
      ? {}
      : {
          end: grunt.endsAt,
          badge: badgeWords('end', grunt.endsAt, now, 'UTC'),
        }),
    dimmed:
      grunt !== undefined &&
      isDimmed({ stage: 'hatched', hatchTime: null, endTime: grunt.endsAt }, now),
  };
}

/** A marker's picture as nodes: the server's picture, or the icon of the Report menu. */
export function stopPictureNode(picture: StopPicture): PageNode {
  return picture.kind === 'picture'
    ? { tag: 'img', attributes: { src: picture.src, alt: '', draggable: 'false' } }
    : iconNode(REPORT_ICONS[picture.icon]);
}

/**
 * A stop's marker as a tree of nodes: a circle of ours with its picture in the ring of its layers
 * (`map.css`), a grunt's minutes under it from zoom 15 (`markerSize` 'full'), dimmed in its last
 * minutes. A grunt's end is on it (`data-stage`, `data-end`) for the page to keep the badge and
 * the dimming current between two lists, as a raid's (`markerNow`).
 */
export function stopMarkerNode(at: StopReports, now: number, size: MarkerSize): PageNode {
  const facts = stopMarkerFacts(at, now);
  const small = size === 'full' ? '' : ' size-small';
  return {
    tag: 'div',
    className: `stop-marker ${facts.ring}${small}${facts.dimmed ? ' dim' : ''}`,
    attributes:
      facts.end === undefined ? {} : { 'data-stage': 'hatched', 'data-end': String(facts.end) },
    children: [
      { tag: 'span', className: 'ring', children: [stopPictureNode(facts.picture)] },
      ...(facts.badge !== undefined && size === 'full'
        ? [{ tag: 'span', className: 'badge', text: facts.badge }]
        : []),
    ],
  };
}

/** A grunt's or hideout's words in the list of things at one place: `Water-type grunt 25 min`. */
function rocketWords(at: StopReports, now: number): string[] {
  return [
    ...at.grunts.map((grunt) => `${grunt.name} ${badgeWords('end', grunt.endsAt, now, 'UTC')}`),
    ...at.hideouts.map((hideout) => hideout.name),
  ];
}

/**
 * A stop as the list of things at one place names it (B3: a report and a party at one stop, one
 * tap lists both): its popup's key, its place, its picture, its name, and what it has.
 */
export function stopPlaced(at: StopReports, now: number): PlacedThing & { layer: StopLayer } {
  const facts = stopMarkerFacts(at, now);
  return {
    key: stopPopupKey(at.stop.key),
    layer: at.research.length > 0 ? 'research' : 'rocket',
    gymId: null,
    lat: at.stop.lat,
    lon: at.stop.lon,
    picture: facts.picture.kind === 'picture' ? facts.picture.src : null,
    name: at.stop.name,
    place: { key: `stop:${at.stop.key}`, name: at.stop.name },
    time: [...(at.research.length > 0 ? ['Field research'] : []), ...rocketWords(at, now)].join(
      ' · ',
    ),
  };
}

/** How many reports of each layer are at stops in view (`inView`), for the sheet of the layers. */
export function reportsInView(
  stops: readonly StopReports[],
  inView: (point: LatLon) => boolean,
): Record<StopLayer, number> {
  const counts = { research: 0, rocket: 0 };
  for (const at of stops) {
    if (!inView(at.stop)) continue;
    counts.research += at.research.length;
    counts.rocket += at.grunts.length + at.hideouts.length;
  }
  return counts;
}
