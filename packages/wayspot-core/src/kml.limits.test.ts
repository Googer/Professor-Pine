import { describe, expect, it } from 'vitest';
import {
  kmlFiles,
  MAX_KML_AREAS,
  MAX_KML_CORNERS,
  MAX_KML_FILE_BYTES,
  readKml,
  writeKml,
} from './kml.js';
import type { LatLon } from './lat-lon.js';
import { MAX_OUTLINE_CORNERS } from './outline.js';

/** A traced boundary: a circle of many corners with a wobble, so that few lie on a line. */
function traced(corners: number, lat = 40, lon = -80): LatLon[] {
  const ring = Array.from({ length: corners }, (_unused, i) => {
    const angle = (2 * Math.PI * i) / corners;
    const radius = 0.2 + 0.01 * Math.sin(angle * 97);
    return { lat: lat + radius * Math.sin(angle), lon: lon + radius * Math.cos(angle) };
  });
  return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
}

/**
 * The same text, counting the characters read of it: one for each character looked at, those an
 * `indexOf` passes over, those `startsWith` compares, and the length of every piece cut out (a
 * piece is then read as a whole). The work, by count rather than by the clock (a clock fails on
 * a loaded machine). Past `budget` a read throws, so that a slow way fails at once.
 */
function countingText(text: string, budget: number): { text: string; count: () => number } {
  let read = 0;
  const add = (characters: number): void => {
    read += characters;
    if (read > budget) throw new Error('too many characters read');
  };
  const cost = (method: string, args: unknown[], result: unknown): number => {
    if (method === 'indexOf') {
      const [needle, from] = args as [string, number | undefined];
      const start = Math.max(0, from ?? 0);
      return (
        (typeof result === 'number' && result >= 0 ? result + needle.length : text.length) - start
      );
    }
    if (method === 'startsWith') return String(args[0]).length;
    if (typeof result === 'string') return result.length;
    return text.length;
  };
  const counted = new Proxy(new String(text), {
    get(_target, key) {
      if (key === 'length') return text.length;
      if (typeof key === 'string' && /^\d+$/u.test(key)) {
        add(1);
        return text[Number(key)];
      }
      const value: unknown = Reflect.get(String.prototype, key);
      if (typeof value !== 'function' || typeof key !== 'string') return value;
      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(value, text, args);
        add(cost(key, args, result));
        return result;
      };
    },
  });
  return { text: counted as unknown as string, count: () => read };
}

describe('readKml: what a file may cost', () => {
  it('never throws, also for a file of a quarter of a million siblings', () => {
    const placemarks = `<kml>${'<Placemark/>'.repeat(250_000)}</kml>`;
    expect(() => readKml(placemarks)).not.toThrow();
    expect(readKml(placemarks)).toEqual({ ok: false, reason: 'no-areas' });
    const folders = `<kml><Document>${'<Folder/>'.repeat(250_000)}</Document></kml>`;
    expect(readKml(folders)).toEqual({ ok: false, reason: 'no-areas' });
    const geometries = `<kml><Placemark><MultiGeometry>${'<Point/>'.repeat(250_000)}</MultiGeometry></Placemark></kml>`;
    expect(readKml(geometries)).toEqual({ ok: false, reason: 'no-areas' });
  });

  it('refuses a file with more corners in all than it reads, before it reads them', () => {
    const areas = (count: number, corners: number) =>
      Array.from({ length: count }, (_unused, i) => ({
        name: `R${i}`,
        description: null,
        outline: traced(corners, 40 + i),
      }));
    // Four outlines of the most corners one may have are as much as a file may hold.
    expect(MAX_KML_CORNERS).toBe(4 * MAX_OUTLINE_CORNERS);
    const most = writeKml(areas(4, MAX_OUTLINE_CORNERS));
    // About a megabyte, its text read twice a character, at most ten allowed (counted, not timed: a clock
    // fails on a loaded machine). Checking the outlines is held to its work in outline.test.ts.
    expect(most.length).toBeGreaterThan(700_000);
    const counting = countingText(most, 10 * most.length);
    const reading = readKml(counting.text);
    expect(reading.ok && reading.areas.length).toBe(4);
    expect(readKml(writeKml(areas(5, MAX_OUTLINE_CORNERS)))).toEqual({
      ok: false,
      reason: 'too-many-corners',
    });
  });
});

describe('kmlFiles: an export that reads back', () => {
  const areas = (count: number, corners: number) =>
    Array.from({ length: count }, (_unused, i) => ({
      name: `R${i}`,
      description: i % 2 === 0 ? 'Town' : null,
      outline: traced(corners, 40 + i / 10),
    }));

  /** Every file reads back within the limits, and together they hold every area in order. */
  function readBack(files: string[], maxBytes = MAX_KML_FILE_BYTES) {
    return files.flatMap((file) => {
      expect(new TextEncoder().encode(file).length).toBeLessThanOrEqual(maxBytes);
      const reading = readKml(file);
      if (!reading.ok) throw new Error(reading.reason);
      expect(reading.skipped).toEqual([]);
      expect(reading.areas.length).toBeLessThanOrEqual(MAX_KML_AREAS);
      return reading.areas.map((area) => area.name);
    });
  }

  it('writes one file when everything fits, and none for no areas', () => {
    const few = areas(3, 10);
    expect(kmlFiles(few)).toEqual([writeKml(few)]);
    expect(kmlFiles([])).toEqual([]);
  });

  it('begins a new file before one would hold more areas than an import takes', () => {
    const many = areas(MAX_KML_AREAS * 2 + 5, 4);
    const files = kmlFiles(many);
    expect(files).toHaveLength(3);
    expect(readBack(files)).toEqual(many.map((area) => area.name));
  });

  it('begins a new file before one would hold more corners than an import takes', () => {
    const long = areas(9, MAX_OUTLINE_CORNERS);
    const files = kmlFiles(long);
    // Four of the longest outlines are as much as one file may hold.
    expect(files).toHaveLength(3);
    expect(readBack(files)).toEqual(long.map((area) => area.name));
  });

  it('begins a new file before one would pass the size given', () => {
    const some = areas(10, 50);
    const one = new TextEncoder().encode(writeKml(some.slice(0, 1))).length;
    const files = kmlFiles(some, one * 3);
    expect(files.length).toBeGreaterThan(3);
    expect(readBack(files, one * 3)).toEqual(some.map((area) => area.name));
  });
});
