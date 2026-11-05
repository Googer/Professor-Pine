/*! @license Leaflet.heat, its grid and layer logic written anew in Pine (plan 8H-4H)
 *
 * Copyright (c) 2014, Vladimir Agafonkin
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 *
 *    1. Redistributions of source code must retain the above copyright notice, this list of
 *       conditions and the following disclaimer.
 *
 *    2. Redistributions in binary form must reproduce the above copyright notice, this list
 *       of conditions and the following disclaimer in the documentation and/or other materials
 *       provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS
 * OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import type { HeatPoint } from './simpleheat.js';

/*
 * The activity layer's glow (plan 8H-4H), its pure part: how a place's weight is drawn, the look
 * of the glow at each zoom, where the canvas stands while the map zooms, and the points handed to
 * simpleheat (`simpleheat.ts`) for a view, gathered on a grid as Leaflet.heat (its notice above)
 * gathers them, written here anew. The weights are the server's (0–1); the Leaflet layer is
 * `heat-layer.ts`.
 */

/** A place's strength on the glow: the square root of its weight (0–1), as the demo drew it. */
export function heatValue(weight: number): number {
  return Math.sqrt(Math.min(1, Math.max(0, weight)));
}

/** The glow at a zoom: a point's radius and blur in pixels, the value drawn whole, the floor. */
export interface HeatLook {
  radius: number;
  blur: number;
  max: number;
  minOpacity: number;
}

/**
 * From this zoom a place counts whole on the glow; each zoom out halves it (Leaflet.heat's
 * `maxZoom`, the demo's 14), so that the places a cell gathers zoomed out do not all glow red.
 */
export const HEAT_FULL_ZOOM = 14;

/** What the demo Matt saw drew with (Leaflet.heat 0.2.0, 2026-11-05). */
const DEMO = { max: 0.6, minOpacity: 0.25 } as const;

/**
 * The glow's look at a zoom: the demo's (radius 22, blur 20), which Matt approved, up to 15 (review
 * P10); wider at street level (16, where the gyms are drawn one by one, `CLUSTER_BELOW`, and 17
 * on), where the gyms stand far apart in pixels and a small glow reads as a dot. Tuned at staging.
 */
export function heatLook(zoom: number): HeatLook {
  if (zoom >= 17) return { radius: 34, blur: 28, ...DEMO };
  if (zoom >= 16) return { radius: 28, blur: 24, ...DEMO };
  return { radius: 22, blur: 20, ...DEMO };
}

/** A point in pixels. */
export interface Pixel {
  x: number;
  y: number;
}

/** Where the map stands as it zooms, for `zoomTransform`. */
export interface ZoomMoment {
  /** The zoom the map is going to (an animated zoom's) or at (a pinch's, a flight's). */
  zoom: number;
  /** The zoom the canvas was drawn at. */
  drawnZoom: number;
  /** The canvas's top left, projected at `zoom`. */
  topLeft: Pixel;
  /** The map's middle at `zoom`, projected at `zoom`. */
  center: Pixel;
  /** The map's size. */
  size: Pixel;
  /** Where the map's pane stands in the container (Leaflet's `_getMapPanePos`). */
  pane: Pixel;
}

/**
 * How the canvas is moved and scaled while the map zooms (review P1; Leaflet's
 * `Renderer._updateTransform` and `_latLngToNewLayerPoint`, from their arithmetic): scaled from
 * the zoom it was drawn at, its top left where it stands at the new zoom in the pane's pixels.
 */
export function zoomTransform(at: ZoomMoment): { offset: Pixel; scale: number } {
  const origin = {
    x: Math.round(at.center.x - at.size.x / 2 + at.pane.x),
    y: Math.round(at.center.y - at.size.y / 2 + at.pane.y),
  };
  return {
    offset: { x: at.topLeft.x - origin.x, y: at.topLeft.y - origin.y },
    scale: 2 ** (at.zoom - at.drawnZoom),
  };
}

/** How much a place counts at a zoom: whole from `HEAT_FULL_ZOOM`, halved for each zoom out (12 at most). */
export function zoomScale(zoom: number): number {
  return 2 ** -Math.max(0, Math.min(HEAT_FULL_ZOOM - zoom, 12));
}

/** A place in the canvas's pixels with its value (`heatValue` by `zoomScale`). */
export interface ScreenPoint {
  x: number;
  y: number;
  value: number;
}

/** The grid of `heatCells`: its cell, the map's offset, the canvas, a circle's reach, the most. */
export interface HeatGrid {
  /** A cell's side in pixels (Leaflet.heat's: half the circle's reach). */
  cell: number;
  /** Where the map's pane stands, in pixels: the grid is laid by it, fixed to the map. */
  offset: { x: number; y: number };
  width: number;
  height: number;
  /** How far a point's circle reaches (radius and blur): beyond the canvas by more, left out. */
  reach: number;
  /** A cell's value at most (the look's `max`). */
  max: number;
}

/**
 * The points simpleheat draws for a view: those whose circle reaches the canvas, the places of
 * one cell of the grid gathered at their middle weighted by value, their values summed up to
 * `max`, rounded to whole pixels; in the order their cells were first met.
 */
export function heatCells(points: readonly ScreenPoint[], grid: HeatGrid): HeatPoint[] {
  const { cell, offset, width, height, reach, max } = grid;
  const ox = offset.x % cell;
  const oy = offset.y % cell;
  const cells = new Map<string, { x: number; y: number; value: number }>();
  for (const { x, y, value } of points) {
    if (x < -reach || y < -reach || x > width + reach || y > height + reach) continue;
    const key = `${String(Math.floor((x - ox) / cell))}:${String(Math.floor((y - oy) / cell))}`;
    const there = cells.get(key);
    if (there === undefined) {
      cells.set(key, { x, y, value });
      continue;
    }
    const sum = there.value + value;
    if (sum > 0) {
      there.x = (there.x * there.value + x * value) / sum;
      there.y = (there.y * there.value + y * value) / sum;
    }
    there.value = sum;
  }
  return [...cells.values()].map(
    ({ x, y, value }) => [Math.round(x), Math.round(y), Math.min(value, max)] as const,
  );
}
