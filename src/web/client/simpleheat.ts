/*! @license simpleheat, as Pine's own TypeScript module (plan 8H-4H)
 *
 * Copyright (c) 2015, Vladimir Agafonkin
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

/*
 * simpleheat (github.com/mourner/simpleheat) written again as typed TypeScript for the activity
 * layer's glow (plan 8H-4H); no package. What differs from it: the gradient is a list of stops
 * from the theme (`theme.css`'s `--heat-*`), with no default (no colour is written in the pages'
 * code, `page-theme.test.ts`), so nothing is drawn before one is set; the circle's shadow takes
 * the context's initial fill, whose alpha alone counts; the canvas to draw on and the one that
 * makes the circle and the gradient are given (the page's `document.createElement('canvas')`, a
 * test's own), never looked up by id.
 */

/** A stop of the gradient: its place from 0 to 1 by a pixel's strength, and its CSS colour. */
export interface HeatStop {
  stop: number;
  colour: string;
}

/** A point to draw: x and y in the canvas's pixels, and its value (by `max`). */
export type HeatPoint = readonly [x: number, y: number, value: number];

/** What the heat needs of a canvas's 2D context (`CanvasRenderingContext2D` on the page). */
export interface HeatContext<C> {
  globalAlpha: number;
  fillStyle: unknown;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  clearRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: C, x: number, y: number): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { addColorStop(offset: number, colour: string): void };
  fillRect(x: number, y: number, width: number, height: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  putImageData(image: { data: Uint8ClampedArray }, x: number, y: number): void;
  beginPath(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    start: number,
    end: number,
    counterclockwise?: boolean,
  ): void;
  closePath(): void;
  fill(): void;
}

/** What the heat needs of a canvas (`HTMLCanvasElement` on the page). */
export interface HeatCanvas<C> {
  width: number;
  height: number;
  getContext(id: '2d', options?: { willReadFrequently?: boolean }): HeatContext<C> | null;
}

/** simpleheat's own: the radius and blur of a point's circle until `radius` is called. */
const DEFAULT_RADIUS = 25;
const DEFAULT_BLUR = 15;
/** simpleheat's own: how faint the faintest point is drawn. */
export const DEFAULT_MIN_OPACITY = 0.05;

/** How strongly a point is drawn: its value over the maximum, at least `minOpacity`, at most 1. */
export function pointAlpha(
  value: number,
  max: number,
  minOpacity: number = DEFAULT_MIN_OPACITY,
): number {
  return Math.min(Math.max(value / max, minOpacity), 1);
}

/**
 * The pixels coloured by their alpha (RGBA, four bytes each): each pixel with some alpha takes
 * the gradient's colour at that alpha (`gradient`, 256 RGBA pixels), its alpha kept; an empty one
 * stays empty.
 */
export function colorize(pixels: Uint8ClampedArray, gradient: Uint8ClampedArray): void {
  for (let at = 0; at < pixels.length; at += 4) {
    const from = (pixels[at + 3] ?? 0) * 4;
    if (from === 0) continue;
    pixels[at] = gradient[from] ?? 0;
    pixels[at + 1] = gradient[from + 1] ?? 0;
    pixels[at + 2] = gradient[from + 2] ?? 0;
  }
}

export class SimpleHeat<C extends HeatCanvas<C>> {
  private readonly context: HeatContext<C>;
  private width: number;
  private height: number;
  private maximum = 1;
  private points: readonly HeatPoint[] = [];
  private circle: C | undefined;
  /** The circle's reach from its point: the radius and the blur. */
  private reach = 0;
  private palette: Uint8ClampedArray | undefined;

  constructor(
    private readonly canvas: C,
    /** Makes a canvas of its own for the circle and the gradient. */
    private readonly makeCanvas: () => C,
  ) {
    // Its pixels are read back at every draw (`getImageData`): the browser keeps them where the
    // script reads them rather than on the graphics card (review P8).
    this.context = contextOf(canvas, true);
    this.width = canvas.width;
    this.height = canvas.height;
  }

  /** The points to draw at the next `draw`. */
  data(points: readonly HeatPoint[]): this {
    this.points = points;
    return this;
  }

  /** The value drawn whole; more is drawn as much. */
  max(max: number): this {
    this.maximum = max;
    return this;
  }

  /** A point's circle: its radius and its blur beyond it, in pixels. */
  radius(radius: number, blur: number = DEFAULT_BLUR): this {
    const circle = this.makeCanvas();
    const reach = radius + blur;
    circle.width = reach * 2;
    circle.height = reach * 2;
    const context = contextOf(circle);
    // The circle is drawn off the canvas and its blurred shadow on it: its alpha is the mask.
    context.shadowOffsetX = reach * 2;
    context.shadowOffsetY = reach * 2;
    context.shadowBlur = blur;
    // Only the shadow's alpha counts: the context's own initial fill (opaque black on a page)
    // serves, and no colour is written here.
    context.shadowColor = String(context.fillStyle);
    context.beginPath();
    context.arc(-reach, -reach, radius, 0, Math.PI * 2, true);
    context.closePath();
    context.fill();
    this.circle = circle;
    this.reach = reach;
    return this;
  }

  /** How far a point's circle reaches from it, radius and blur, in pixels. */
  span(): number {
    return this.reach;
  }

  /** The canvas was resized: drawn at its new size from now. */
  resize(): void {
    this.width = this.canvas.width;
    this.height = this.canvas.height;
  }

  /** The colours by a pixel's strength, from its stops (each from 0 to 1). */
  gradient(stops: readonly HeatStop[]): this {
    const canvas = this.makeCanvas();
    canvas.width = 1;
    canvas.height = 256;
    const context = contextOf(canvas);
    const ramp = context.createLinearGradient(0, 0, 0, 256);
    for (const { stop, colour } of stops) ramp.addColorStop(Math.min(1, Math.max(0, stop)), colour);
    context.fillStyle = ramp;
    context.fillRect(0, 0, 1, 256);
    this.palette = context.getImageData(0, 0, 1, 256).data;
    return this;
  }

  /**
   * The points drawn anew on a cleared canvas, each its circle at `pointAlpha`, then every pixel
   * coloured by its strength; nothing before a gradient is set.
   */
  draw(minOpacity: number = DEFAULT_MIN_OPACITY): this {
    const palette = this.palette;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    if (palette === undefined || this.width === 0 || this.height === 0) return this;
    if (this.circle === undefined) this.radius(DEFAULT_RADIUS);
    const circle = this.circle;
    if (circle === undefined) return this;
    for (const [x, y, value] of this.points) {
      context.globalAlpha = pointAlpha(value, this.maximum, minOpacity);
      context.drawImage(circle, x - this.reach, y - this.reach);
    }
    const image = context.getImageData(0, 0, this.width, this.height);
    colorize(image.data, palette);
    context.putImageData(image, 0, 0);
    return this;
  }
}

function contextOf<C>(canvas: HeatCanvas<C>, readOften = false): HeatContext<C> {
  const context = readOften
    ? canvas.getContext('2d', { willReadFrequently: true })
    : canvas.getContext('2d');
  if (context === null) throw new Error('This browser draws no 2D canvas.');
  return context;
}
