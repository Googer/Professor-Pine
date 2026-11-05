import { describe, expect, it } from 'vitest';
import { CLUSTER_BELOW } from './cluster.js';
import {
  HEAT_FULL_ZOOM,
  heatCells,
  heatLook,
  heatValue,
  zoomScale,
  zoomTransform,
} from './heat.js';

describe("the activity glow's look (plan 8H-4H)", () => {
  it("draws a place by the square root of the server's weight", () => {
    expect(heatValue(1)).toBe(1);
    expect(heatValue(0.25)).toBe(0.5);
    expect(heatValue(0)).toBe(0);
    expect(heatValue(-1)).toBe(0);
    expect(heatValue(4)).toBe(1);
  });

  // Review P10: Matt approved the demo's look; it grows only at street level.
  it("is the demo's up to its full zoom, and wider at street level", () => {
    const demo = { radius: 22, blur: 20, max: 0.6, minOpacity: 0.25 };
    expect(heatLook(HEAT_FULL_ZOOM)).toEqual(demo);
    expect(heatLook(11)).toEqual(demo);
    expect(heatLook(8)).toEqual(demo);
    const region = heatLook(11);
    const street = heatLook(CLUSTER_BELOW);
    const close = heatLook(18);
    expect(street.radius).toBeGreaterThan(heatLook(HEAT_FULL_ZOOM).radius);
    expect(close.radius).toBeGreaterThan(street.radius);
    for (const look of [region, street, close]) {
      expect(look.blur).toBeLessThan(look.radius);
      expect(look.max).toBe(0.6);
      expect(look.minOpacity).toBe(0.25);
    }
  });

  it('counts a place whole from its full zoom and half for each zoom out, as Leaflet.heat', () => {
    expect(zoomScale(HEAT_FULL_ZOOM)).toBe(1);
    expect(zoomScale(18)).toBe(1);
    expect(zoomScale(13)).toBe(0.5);
    expect(zoomScale(11)).toBe(0.125);
    // At most twelve halvings.
    expect(zoomScale(0)).toBe(2 ** -12);
  });
});

// Review P1: the canvas follows an animated zoom, a pinch and a flight alike.
describe("the glow's canvas while the map zooms", () => {
  const size = { x: 1000, y: 800 };
  /** Where a canvas pixel stands in the map's container once the canvas is moved and scaled. */
  const inContainer = (
    { offset, scale }: { offset: { x: number; y: number }; scale: number },
    pixel: { x: number; y: number },
    pane: { x: number; y: number },
  ) => ({ x: offset.x + scale * pixel.x + pane.x, y: offset.y + scale * pixel.y + pane.y });

  it("keeps the zoom's middle under the middle of the map, scaled from the zoom it was drawn at", () => {
    // Drawn at 12 with its top left at (1000, 2000); the map zooms to 13 round (1500, 2400).
    const pane = { x: 7, y: -3 };
    const moved = zoomTransform({
      zoom: 13,
      drawnZoom: 12,
      topLeft: { x: 2000, y: 4000 },
      center: { x: 3000, y: 4800 },
      size,
      pane,
    });
    expect(moved.scale).toBe(2);
    expect(inContainer(moved, { x: 500, y: 400 }, pane)).toEqual({ x: 500, y: 400 });
    // A pinch half way: by the zoom drawn, not by the map's last whole zoom.
    expect(
      zoomTransform({
        zoom: 12.5,
        drawnZoom: 12,
        topLeft: { x: 0, y: 0 },
        center: { x: 0, y: 0 },
        size,
        pane,
      }).scale,
    ).toBeCloseTo(Math.SQRT2);
  });

  it('leaves the canvas where it stands while nothing changed', () => {
    const pane = { x: 30, y: -20 };
    const still = zoomTransform({
      zoom: 15,
      drawnZoom: 15,
      topLeft: { x: 4000, y: 3000 },
      center: { x: 4500, y: 3400 },
      size,
      pane,
    });
    expect(still.scale).toBe(1);
    expect(inContainer(still, { x: 0, y: 0 }, pane)).toEqual({ x: 0, y: 0 });
  });
});

describe("the glow's points on the canvas (Leaflet.heat's grid, plan 8H-4H)", () => {
  const options = { cell: 10, offset: { x: 0, y: 0 }, width: 100, height: 100, reach: 20, max: 1 };

  it('merges the places of a cell at their weighted middle, their values summed up to the most', () => {
    expect(
      heatCells(
        [
          { x: 11, y: 11, value: 0.3 },
          { x: 19, y: 19, value: 0.1 },
        ],
        options,
      ),
    ).toEqual([[13, 13, 0.4]]);
    const [merged] = heatCells(
      [
        { x: 12, y: 12, value: 0.8 },
        { x: 14, y: 14, value: 0.8 },
      ],
      options,
    );
    expect(merged?.[2]).toBe(1);
  });

  it('keeps the places of other cells apart, and rounds them to whole pixels', () => {
    expect(
      heatCells(
        [
          { x: 12.4, y: 12.6, value: 0.3 },
          { x: 42, y: 12, value: 0.5 },
        ],
        options,
      ),
    ).toEqual([
      [12, 13, 0.3],
      [42, 12, 0.5],
    ]);
  });

  it('leaves out what lies beyond the reach of a circle round the canvas, and keeps what reaches in', () => {
    const drawn = heatCells(
      [
        { x: -15, y: 50, value: 1 },
        { x: -25, y: 50, value: 1 },
        { x: 50, y: 119, value: 1 },
        { x: 50, y: 121, value: 1 },
      ],
      options,
    );
    expect(drawn.map(([x, y]) => [x, y])).toEqual([
      [-15, 50],
      [50, 119],
    ]);
  });

  it("lays its grid by the map's offset, so that a pan does not regroup the places", () => {
    const points = [
      { x: 8, y: 5, value: 0.2 },
      { x: 12, y: 5, value: 0.2 },
    ];
    expect(heatCells(points, options)).toHaveLength(2);
    expect(heatCells(points, { ...options, offset: { x: 5, y: 0 } })).toHaveLength(1);
  });
});
