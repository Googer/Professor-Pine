import * as L from 'leaflet';
import { heatCells, heatLook, zoomScale, zoomTransform, type HeatLook } from './heat.js';
import { SimpleHeat, type HeatStop } from './simpleheat.js';

/*
 * The activity layer's glow on the map (plan 8H-4H): a Leaflet layer over simpleheat
 * (`simpleheat.ts`), Leaflet.heat's thin logic written anew (its notice in `heat.ts`). One canvas
 * the size of the map in a pane of its own (`HEAT_PANE`, taking no taps), at the map's top left;
 * drawn again from the places once the map has moved or been resized, in the canvas's own pixels
 * from where it was set (so a frame drawn while the map is dragged lands where the canvas is), and
 * moved and scaled with the map while it zooms: an animated zoom (`zoomanim`), a pinch or a flight
 * (`zoom`), as Leaflet's own renderers are (review P1). The places are set all at once
 * (`setPlaces`: Play's next step) and drawn in the next frame, in one go on the same canvas, so
 * nothing blinks; a frame that comes while the map is between zooms waits for its `moveend`.
 * Drawn at one canvas pixel per CSS pixel, on a high-density screen too (a glow is a blur).
 * Decorative: the canvas is hidden from screen readers; the counts are in the popups and the
 * panel. Its pure part is `heat.ts`; this is tried at staging.
 */

/** A place on the glow: where it is and its strength (`heatValue` of its weight). */
export interface HeatPlace {
  lat: number;
  lon: number;
  value: number;
}

export class HeatLayer extends L.Layer {
  private places: readonly HeatPlace[] = [];
  private canvas: HTMLCanvasElement | undefined;
  private heat: SimpleHeat<HTMLCanvasElement> | undefined;
  /** The look the circle was last made with: made again only when the zoom changes it. */
  private look: HeatLook | undefined;
  /** Where the canvas's top left stands as last set: in the pane's pixels, and on the earth. */
  private origin: L.Point | undefined;
  private topLeft: L.LatLng | undefined;
  /** The zoom the canvas was set at, which a zoom under way scales from (review P1). */
  private drawnZoom: number | undefined;
  private frame: number | undefined;

  constructor(
    pane: string,
    private stops: readonly HeatStop[],
  ) {
    super();
    L.Util.setOptions(this, { pane, interactive: false });
  }

  /** The places to draw, in place of those before, drawn in the next frame. */
  setPlaces(places: readonly HeatPlace[]): this {
    this.places = places;
    this.redraw();
    return this;
  }

  /** The gradient's colours (the theme turned light or dark), drawn in the next frame. */
  setStops(stops: readonly HeatStop[]): this {
    this.stops = stops;
    this.heat?.gradient(stops);
    this.redraw();
    return this;
  }

  override onAdd(): this {
    const canvas = L.DomUtil.create('canvas', 'heat-layer leaflet-layer');
    canvas.setAttribute('aria-hidden', 'true');
    // Scaled with the map while it zooms where Leaflet animates the zoom, else hidden meanwhile.
    canvas.classList.add(this.animated() ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide');
    this.getPane()?.appendChild(canvas);
    this.canvas = canvas;
    this.heat = new SimpleHeat(canvas, () => document.createElement('canvas')).gradient(this.stops);
    this.look = undefined;
    this.reset();
    return this;
  }

  override onRemove(): this {
    if (this.frame !== undefined) L.Util.cancelAnimFrame(this.frame);
    this.frame = undefined;
    this.canvas?.remove();
    this.canvas = undefined;
    this.heat = undefined;
    return this;
  }

  override getEvents(): Record<string, L.LeafletEventHandlerFn> {
    const reset = (): void => {
      this.reset();
    };
    const events: Record<string, L.LeafletEventHandlerFn> = {
      moveend: reset,
      resize: reset,
      viewreset: reset,
      // A pinch and a flight change the zoom frame by frame, without `zoomanim` (review P1).
      zoom: () => {
        const map = this._map as L.Map | undefined;
        if (map) this.transform(map.getCenter(), map.getZoom());
      },
    };
    if (this.animated()) {
      events.zoomanim = (event) => {
        const { center, zoom } = event as L.ZoomAnimEvent;
        this.transform(center, zoom);
      };
    }
    return events;
  }

  /**
   * Whether the map animates its zoom: Leaflet sets the layer's `_zoomAnimated` from the map's as
   * the layer is added, before `getEvents` and `onAdd` (it is in no type of `@types/leaflet`).
   */
  private animated(): boolean {
    return (this as unknown as { _zoomAnimated?: boolean })._zoomAnimated === true;
  }

  /** Drawn in the next frame, once however often it is asked meanwhile. */
  private redraw(): void {
    if (this.heat === undefined || this.frame !== undefined) return;
    this.frame = L.Util.requestAnimFrame(() => {
      this.frame = undefined;
      this.draw();
    });
  }

  /** The canvas set at the map's top left at the map's size and zoom, and drawn there at once. */
  private reset(): void {
    const map = this._map as L.Map | undefined;
    const canvas = this.canvas;
    if (map === undefined || canvas === undefined) return;
    const origin = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, origin);
    this.origin = origin;
    this.topLeft = map.layerPointToLatLng(origin);
    this.drawnZoom = map.getZoom();
    const size = map.getSize();
    // A new size clears the canvas: set only when it changed.
    if (canvas.width !== size.x) canvas.width = size.x;
    if (canvas.height !== size.y) canvas.height = size.y;
    this.heat?.resize();
    if (this.frame !== undefined) L.Util.cancelAnimFrame(this.frame);
    this.frame = undefined;
    this.draw();
  }

  /**
   * The places drawn on the canvas where it was set (review P2): in its own pixels from its top
   * left, so a frame drawn while the map is dragged or still gliding lands where the canvas is;
   * none while the map is between zooms (a pinch, a flight), whose `moveend` sets it anew.
   */
  private draw(): void {
    const map = this._map as L.Map | undefined;
    const heat = this.heat;
    const origin = this.origin;
    const canvas = this.canvas;
    if (map === undefined || heat === undefined || origin === undefined || canvas === undefined) {
      return;
    }
    const zoom = map.getZoom();
    if (zoom !== this.drawnZoom) return;
    const look = heatLook(zoom);
    if (this.look?.radius !== look.radius || this.look.blur !== look.blur) {
      heat.radius(look.radius, look.blur);
    }
    this.look = look;
    const scale = zoomScale(zoom);
    const reach = heat.span();
    const points = this.places.map(({ lat, lon, value }) => {
      const at = map.latLngToLayerPoint([lat, lon]).subtract(origin);
      return { x: at.x, y: at.y, value: value * scale };
    });
    heat
      .max(look.max)
      .data(
        heatCells(points, {
          cell: reach / 2,
          // The grid laid by the pane's pixels, fixed to the map while it pans.
          offset: origin.multiplyBy(-1),
          width: canvas.width,
          height: canvas.height,
          reach,
          max: look.max,
        }),
      )
      .draw(look.minOpacity);
  }

  /**
   * The canvas moved and scaled to where it stands with the map's middle at `center` at `zoom`
   * (`zoomTransform`), from the zoom it was drawn at; drawn anew at `moveend`.
   */
  private transform(center: L.LatLng, zoom: number): void {
    const map = this._map as L.Map | undefined;
    const canvas = this.canvas;
    const topLeft = this.topLeft;
    const drawnZoom = this.drawnZoom;
    if (map === undefined || canvas === undefined || topLeft === undefined) return;
    if (drawnZoom === undefined) return;
    const { offset, scale } = zoomTransform({
      zoom,
      drawnZoom,
      topLeft: map.project(topLeft, zoom),
      center: map.project(center, zoom),
      size: map.getSize(),
      pane: map.containerPointToLayerPoint([0, 0]).multiplyBy(-1),
    });
    L.DomUtil.setTransform(canvas, L.point(offset.x, offset.y), scale);
  }
}
