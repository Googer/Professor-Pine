import type { MapSpawn, SpawnsView } from '../../domain/web/spawn-data.js';
import type { DistanceUnits, Place } from './distance.js';
import { mapLine, type PageNode } from './popup.js';
import { badgeWords, isDimmed, timeLeft, type MarkerSize } from './raid-marker.js';
import { iconNode } from './report-menu.js';
import { REPORT_ICONS } from './report-icons.js';
import type { PlacedThing } from './shared-place.js';
import { spawnName, spawnPopupKey } from './spawn-names.js';
import { ENDED } from './stop-popup.js';
import type { LatLon } from './view.js';

/*
 * The wild spawns on the live map (Matt, 2026-11-07: "Should wild spawns appear on the map?
 * yes"): the layer Wild spawns, from `/api/spawns`. A spawn with a point (its pin, or the place
 * it was reported near) is a marker of ours at it, drawn as a stop's is (a circle with its
 * picture, else the Report menu's Poké Ball, in a ring of `--ball`; its minutes left under it
 * from street level, dimmed in its last minutes by the raids' rule), until it goes away; one
 * without a point is listed, not drawn. Its popup says what its region message says. The pure
 * part; `spawn-layer.ts` draws it.
 */

/** The layer of the spawns (its id in `MAP_LAYERS`). */
export const SPAWN_LAYER = 'spawns';

/** What a spawn's popup needs of the map. */
export interface SpawnPopupContext {
  now: number;
  /** Your location once the browser said: how far the spawn is (the parties' rule). */
  located: Place | undefined;
  units: DistanceUnits;
}

/**
 * The spawns of the view shown now, in its order: those that have not gone away, and those whose
 * popup or card is open (`keep`, by id), which say "Ended" once they have.
 */
export function spawnsShown(
  view: SpawnsView | undefined,
  pick: { now: number; keep?: ReadonlySet<string> },
): MapSpawn[] {
  if (!view) return [];
  return view.spawns.filter(
    (spawn) => spawn.goneAt > pick.now || pick.keep?.has(spawn.id) === true,
  );
}

/** The soonest a spawn of the view goes away, still to come: when to draw them anew. */
export function nextSpawnEnd(view: SpawnsView | undefined, now: number): number | undefined {
  const ends = (view?.spawns ?? []).map((spawn) => spawn.goneAt).filter((end) => end > now);
  return ends.length === 0 ? undefined : Math.min(...ends);
}

/** Whether a spawn is in its last minutes, by the raids' rule (`isDimmed`). */
function lastMinutes(spawn: MapSpawn, now: number): boolean {
  return isDimmed({ stage: 'hatched', hatchTime: null, endTime: spawn.goneAt }, now);
}

/**
 * A spawn's marker as a tree of nodes: a circle of ours (the stops' markers', `map.css`) with its
 * picture in a ring of the Poké Ball's color, its minutes left under it from zoom 15 (`markerSize`
 * 'full'), dimmed in its last minutes; its end on it (`data-stage`, `data-end`) for the page to keep
 * the badge and the dimming current between two lists, as a raid's (`markerNow`).
 */
export function spawnMarkerNode(spawn: MapSpawn, now: number, size: MarkerSize): PageNode {
  const small = size === 'full' ? '' : ' size-small';
  return {
    tag: 'div',
    className: `stop-marker spawn${small}${lastMinutes(spawn, now) ? ' dim' : ''}`,
    attributes: { 'data-stage': 'hatched', 'data-end': String(spawn.goneAt) },
    children: [
      {
        tag: 'span',
        className: 'ring',
        children: [
          spawn.picture === undefined
            ? iconNode(REPORT_ICONS.spawn)
            : { tag: 'img', attributes: { src: spawn.picture, alt: '', draggable: 'false' } },
        ],
      },
      ...(size === 'full'
        ? [{ tag: 'span', className: 'badge', text: badgeWords('end', spawn.goneAt, now, 'UTC') }]
        : []),
    ],
  };
}

/**
 * A spawn as the list of the things at one place names it: its key, point, picture, name, time;
 * none for a spawn without a point, which is not drawn.
 */
export function spawnPlaced(spawn: MapSpawn, now: number): PlacedThing | undefined {
  const { point } = spawn;
  if (point === null) return undefined;
  return {
    key: spawnPopupKey(spawn.id),
    gymId: null,
    lat: point.lat,
    lon: point.lon,
    picture: spawn.picture ?? null,
    name: spawnName(spawn),
    time: timeLeft(spawn.goneAt, now) ?? ENDED,
  };
}

/** How many of the spawns drawn are in view (`inView`), for the sheet of the layers. */
export function spawnsInView(
  spawns: readonly MapSpawn[],
  inView: (point: LatLon) => boolean,
): number {
  return spawns.filter((spawn) => spawn.point !== null && inView(spawn.point)).length;
}

/**
 * The place a spawn is near as its region message says it (staging of 2026-11-07): `Near Cathy
 * (gym) · 1617 Cathedral of Learning, …`, the address the server gave after the place's name, and
 * the place's picture beside them where the server names one (Pine's address, as a post's Where).
 */
function nearNode(spawn: MapSpawn, near: string): PageNode {
  return {
    tag: 'div',
    className: 'near',
    children: [
      ...(spawn.placePicture === undefined
        ? []
        : [
            {
              tag: 'img',
              className: 'place-picture',
              attributes: { src: spawn.placePicture, alt: '', draggable: 'false' },
            },
          ]),
      { tag: 'span', text: spawn.address === undefined ? near : `${near} · ${spawn.address}` },
    ],
  };
}

/**
 * A spawn's popup and phone card, as its region message says it: its picture and "Wild spawn" with
 * the region's channel; the Pokémon (costumed where an event lists it so) and the IVs the reporter
 * checked; where it is in the reporter's words and the place it is near; how far it is and
 * Directions where it has a point, and Open on Discord; its minutes left (kept current by the page,
 * `data-left`; "Ended" once it went away, `data-ends`, as a report at a stop) and who reported it.
 * Nothing to take back: its message has no such control.
 */
export function spawnPopup(spawn: MapSpawn, ctx: SpawnPopupContext): PageNode {
  const name = spawnName(spawn);
  return {
    tag: 'div',
    className: 'stop-popup spawn-popup',
    attributes: { 'data-spawn': spawn.id },
    children: [
      {
        tag: 'section',
        className: 'stop-report spawn',
        attributes: { 'data-report': spawn.id, 'data-ends': String(spawn.goneAt) },
        children: [
          {
            tag: 'div',
            className: 'report-head',
            children: [
              spawn.picture === undefined
                ? iconNode(REPORT_ICONS.spawn)
                : {
                    tag: 'img',
                    className: 'report-picture',
                    attributes: { src: spawn.picture, alt: '', draggable: 'false' },
                  },
              { tag: 'span', className: 'report-kind', text: `Wild spawn · ${spawn.region}` },
            ],
          },
          {
            tag: 'div',
            className: 'report-name',
            text: spawn.ivs === undefined ? name : `${name} · ${spawn.ivs}`,
          },
          ...(spawn.details === null
            ? []
            : [{ tag: 'div', className: 'details', text: spawn.details }]),
          ...(spawn.near === undefined ? [] : [nearNode(spawn, spawn.near)]),
          mapLine(spawn.point ?? undefined, spawn.link, ctx.located, ctx.units),
          {
            tag: 'div',
            className: 'small',
            children: [
              {
                tag: 'span',
                className: 'left',
                text: timeLeft(spawn.goneAt, ctx.now) ?? ENDED,
                attributes: { 'data-left': String(spawn.goneAt) },
              },
              { tag: 'span', text: ` · reported by ${spawn.reporter}` },
            ],
          },
        ],
      },
    ],
  };
}
