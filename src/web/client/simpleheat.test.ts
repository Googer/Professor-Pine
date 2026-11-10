import { describe, expect, it } from 'vitest';
import {
  colorize,
  DEFAULT_MIN_OPACITY,
  pointAlpha,
  SimpleHeat,
  type HeatCanvas,
  type HeatContext,
  type HeatStop,
} from './simpleheat.js';

/**
 * A canvas of the test's: its pixels a real RGBA buffer. Of the drawing it keeps what the heat
 * needs: `drawImage` of a point's circle writes the alpha it is drawn with at the circle's middle
 * (so that the middle of each point holds its strength), `fillRect` of a gradient writes each
 * stop's colour from its place on to the next one's, and the first stop's below it, as a canvas does
 * (a ramp in steps, enough to tell them apart).
 */
class TestCanvas implements HeatCanvas<TestCanvas> {
  private size = { width: 0, height: 0 };
  pixels = new Uint8ClampedArray(0);
  readonly context: TestContext;
  constructor(width = 0, height = 0) {
    this.context = new TestContext(this);
    this.resize(width, height);
  }
  /** As a page's canvas, a new size clears its pixels. */
  resize(width: number, height: number): void {
    this.size = { width, height };
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }
  get width(): number {
    return this.size.width;
  }
  set width(width: number) {
    this.resize(width, this.size.height);
  }
  get height(): number {
    return this.size.height;
  }
  set height(height: number) {
    this.resize(this.size.width, height);
  }
  /** What its context was asked with. */
  readonly asked: Array<{ willReadFrequently?: boolean } | undefined> = [];
  getContext(_id: '2d', options?: { willReadFrequently?: boolean }): HeatContext<TestCanvas> {
    this.asked.push(options);
    return this.context;
  }
}

/** A stop of a gradient as the test's canvas keeps it: its place and its colour as RGB. */
type Ramp = Array<{ at: number; rgb: [number, number, number] }>;

/** The test's colours are `rgb r g b`, read back as numbers. */
const rgbOf = (colour: string): [number, number, number] => {
  const [, r = '0', g = '0', b = '0'] = colour.split(' ');
  return [Number(r), Number(g), Number(b)];
};

class TestContext implements HeatContext<TestCanvas> {
  globalAlpha = 1;
  fillStyle: unknown = 'initial';
  shadowColor = '';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  readonly drawn: Array<{ x: number; y: number; alpha: number }> = [];
  /** The circle's radius as `arc` drew it. */
  arcRadius: number | undefined;
  constructor(private readonly canvas: TestCanvas) {}
  clearRect(): void {
    this.canvas.pixels.fill(0);
    this.drawn.length = 0;
  }
  drawImage(image: TestCanvas, x: number, y: number): void {
    this.drawn.push({ x, y, alpha: this.globalAlpha });
    const cx = Math.round(x + image.width / 2);
    const cy = Math.round(y + image.height / 2);
    if (cx < 0 || cy < 0 || cx >= this.canvas.width || cy >= this.canvas.height) return;
    const at = (cy * this.canvas.width + cx) * 4 + 3;
    // Painted over: what is under it shows through the rest.
    const under = (this.canvas.pixels[at] ?? 0) / 255;
    this.canvas.pixels[at] = Math.round((this.globalAlpha + under * (1 - this.globalAlpha)) * 255);
  }
  createLinearGradient(): { addColorStop(at: number, colour: string): void } {
    const ramp: Ramp = [];
    return Object.assign(
      {
        addColorStop: (at: number, colour: string) => {
          ramp.push({ at, rgb: rgbOf(colour) });
        },
      },
      { ramp },
    );
  }
  fillRect(): void {
    const style = this.fillStyle as { ramp?: Ramp };
    const ramp = [...(style.ramp ?? [])].sort((a, b) => a.at - b.at);
    for (let y = 0; y < this.canvas.height; y++) {
      const place = y / (this.canvas.height - 1);
      const stop = ramp.filter((one) => one.at <= place).at(-1) ?? ramp[0];
      const rgb = stop?.rgb ?? [0, 0, 0];
      const at = y * 4;
      this.canvas.pixels.set([...rgb, stop === undefined ? 0 : 255], at);
    }
  }
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(this.canvas.pixels) };
  }
  putImageData(image: { data: Uint8ClampedArray }): void {
    this.canvas.pixels.set(image.data);
  }
  beginPath(): void {}
  closePath(): void {}
  arc(_x: number, _y: number, radius: number): void {
    this.arcRadius = radius;
  }
  fill(): void {}
}

const STOPS: HeatStop[] = [
  { stop: 0.4, colour: 'rgb 0 0 255' },
  { stop: 0.7, colour: 'rgb 0 255 0' },
  { stop: 1, colour: 'rgb 255 0 0' },
];

describe('simpleheat as our module', () => {
  it('draws a point at least at the floor and at most whole, by its value over the maximum', () => {
    expect(pointAlpha(0.3, 0.6, 0.25)).toBeCloseTo(0.5);
    expect(pointAlpha(0.06, 0.6, 0.25)).toBe(0.25);
    expect(pointAlpha(2, 0.6, 0.25)).toBe(1);
    expect(pointAlpha(0.01, 1)).toBe(DEFAULT_MIN_OPACITY);
  });

  it('colours each pixel by its alpha from the gradient, leaving the alpha and empty pixels', () => {
    const gradient = new Uint8ClampedArray(256 * 4);
    for (let alpha = 0; alpha < 256; alpha++) gradient.set([alpha, 255 - alpha, 7, 255], alpha * 4);
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 200, 9, 9, 9, 255]);
    colorize(pixels, gradient);
    expect([...pixels]).toEqual([0, 0, 0, 0, 200, 55, 7, 200, 255, 0, 7, 255]);
  });

  it("draws each point's circle round it, in the gradient's colour for its strength", () => {
    const canvas = new TestCanvas(100, 100);
    const heat = new SimpleHeat(canvas, () => new TestCanvas())
      .radius(10, 5)
      .gradient(STOPS)
      .max(1)
      .data([
        [20, 20, 1],
        [60, 60, 0.5],
        [80, 30, 0.1],
      ]);
    heat.draw(0.25);
    // The circle reaches radius + blur from the point.
    expect(canvas.context.drawn.map(({ x, y }) => [x, y])).toEqual([
      [5, 5],
      [45, 45],
      [65, 15],
    ]);
    expect(canvas.context.drawn.map(({ alpha }) => alpha)).toEqual([1, 0.5, 0.25]);
    const pixel = (x: number, y: number): number[] => {
      const at = (y * 100 + x) * 4;
      return [...canvas.pixels.slice(at, at + 4)];
    };
    // Whole: the last stop's colour; half and at the floor (under the first stop, 0.4): the first
    // one's, faint by its alpha.
    expect(pixel(20, 20)).toEqual([255, 0, 0, 255]);
    expect(pixel(60, 60)).toEqual([0, 0, 255, 128]);
    expect(pixel(80, 30)).toEqual([0, 0, 255, 64]);
    expect(pixel(50, 50)).toEqual([0, 0, 0, 0]);
  });

  // Review P8 of 8H-4H: its pixels are read back at every draw.
  it('asks its canvas for a context whose pixels are read often', () => {
    const canvas = new TestCanvas(10, 10);
    new SimpleHeat(canvas, () => new TestCanvas())
      .gradient(STOPS)
      .data([[5, 5, 1]])
      .draw();
    expect(canvas.asked.length).toBeGreaterThan(0);
    expect(canvas.asked.every((options) => options?.willReadFrequently === true)).toBe(true);
  });

  it('draws anew from nothing: what was drawn before is cleared', () => {
    const canvas = new TestCanvas(50, 50);
    const heat = new SimpleHeat(canvas, () => new TestCanvas()).radius(4, 2).gradient(STOPS);
    heat.data([[10, 10, 1]]).draw();
    heat.data([[30, 30, 1]]).draw();
    expect(canvas.context.drawn).toHaveLength(1);
    expect(canvas.pixels[(10 * 50 + 10) * 4 + 3]).toBe(0);
    expect(canvas.pixels[(30 * 50 + 30) * 4 + 3]).toBe(255);
  });

  it("makes its circle of the radius and blur asked, its shadow in the context's own first fill", () => {
    const made: TestCanvas[] = [];
    const heat = new SimpleHeat(new TestCanvas(10, 10), () => {
      const one = new TestCanvas();
      made.push(one);
      return one;
    }).radius(22, 20);
    const [circle] = made;
    expect(circle?.width).toBe(84);
    expect(circle?.height).toBe(84);
    expect(circle?.context.arcRadius).toBe(22);
    expect(circle?.context.shadowBlur).toBe(20);
    // No colour written in the code (`page-theme.test.ts`): the shadow takes the context's
    // initial fill, which only lends its alpha.
    expect(circle?.context.shadowColor).toBe('initial');
    expect(heat.span()).toBe(42);
  });

  it('draws nothing before it has a gradient, and follows a canvas that was resized', () => {
    const canvas = new TestCanvas(20, 20);
    const heat = new SimpleHeat(canvas, () => new TestCanvas()).radius(2, 1).data([[5, 5, 1]]);
    heat.draw();
    expect(canvas.context.drawn).toEqual([]);
    heat.gradient(STOPS);
    canvas.resize(40, 40);
    heat.resize();
    heat.data([[30, 30, 1]]).draw();
    expect(canvas.pixels[(30 * 40 + 30) * 4]).toBe(255);
  });
});
