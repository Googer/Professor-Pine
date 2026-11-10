import { describe, expect, it, vi } from 'vitest';
import { MAX_KML_AREAS, MAX_KML_CORNERS } from './kml.js';
import type { LatLon } from './lat-lon.js';
import {
  fitsStructure,
  MAX_EXPORT_CELLS,
  MAX_EXPORT_WAYSPOTS,
  MAX_KEY_NAMES,
  MAX_STRUCTURE,
  MAX_WAYSPOT_TEXT,
  readWayspotExport,
  structureBound,
  writeWayspotExport,
  type ExportProblem,
  type ExportReading,
  type WayspotExport,
} from './export-file.js';

/** A closed ring of `corners` corners (and its closing one), around a place of its own. */
function ring(corners: number, n: number): LatLon[] {
  const made = Array.from({ length: corners }, (_unused, i) => ({
    lat: 40 + n / 100 + Math.sin((2 * Math.PI * i) / corners) / 1_000,
    lon: -80 + Math.cos((2 * Math.PI * i) / corners) / 1_000,
  }));
  return [...made, made[0]!];
}

/**
 * The maxima of a small format: as many areas, corners, cells and Wayspots as the export below
 * has. `structureBound` of these is what the writer's text of it has, exactly.
 */
const SMALL = { wayspots: 3, cells: 4, areas: 2, corners: 7 };

/**
 * An export at `SMALL`'s maxima, as the tool would write it: two areas of 3 and 4 corners, every
 * cell in `cells` (the commas of the two lists are most with all in one), and a part of a saving
 * in parts. `text` fills every text of its Wayspots.
 */
function smallExport(text: (n: number) => string = () => ''): WayspotExport {
  return {
    format: 'pine-wayspots',
    version: 1,
    script: '1.0.0',
    startedAt: '2026-10-20T14:02:11Z',
    finishedAt: '2026-10-20T18:40:52Z',
    regions: ['area-0', 'area-1'],
    outlines: [ring(3, 0), ring(4, 1)],
    margin: 500,
    // Level-14 tokens: eight hexadecimal digits that end in the cell's own bit.
    cells: Array.from({ length: SMALL.cells }, (_unused, n) => (0x8834_0001 + 2 * n).toString(16)),
    bareCells: [],
    wayspots: Array.from({ length: SMALL.wayspots }, (_unused, n) => ({
      id: `${n.toString(16).padStart(32, '0')}.16`,
      kind: 'stop' as const,
      status: 'ACTIVE',
      lat: 40.4,
      lon: -79.9,
      title: text(n),
      address: text(n),
      description: text(n),
      image: text(n),
    })),
    part: { index: 1, count: 5, runId: 'run-1' },
  };
}

/** What reading a text gives, and whether the text was parsed for it. */
function reading(text: string): { read: ExportReading; parsed: boolean } {
  const parse = vi.spyOn(JSON, 'parse');
  try {
    const read = readWayspotExport(text);
    return { read, parsed: parse.mock.calls.length > 0 };
  } finally {
    parse.mockRestore();
  }
}

const problemOf = (read: ExportReading): ExportProblem | undefined =>
  read.ok ? undefined : read.problem;

describe('the Wayspot export file: what a text may cost before it is parsed', () => {
  // The audit's file was 64 MB of `{}` (65 KB packed): 7.5 s and 1.4 GB in `JSON.parse`. A
  // smaller one shows the same without costing the test run that much.
  it('refuses a text of more objects than any export holds, without parsing it', () => {
    const bomb = `[${'{},'.repeat(1_000_000)}{}]`;
    const { read, parsed } = reading(bomb);
    expect(problemOf(read)).toEqual({ kind: 'too-many' });
    expect(parsed).toBe(false);
  });

  it('refuses a text of more lists or more entries than any export holds, without parsing it', () => {
    for (const bomb of [`[${'[],'.repeat(1_000_000)}[]]`, `[${'1,'.repeat(5_000_000)}1]`]) {
      const { read, parsed } = reading(bomb);
      expect(problemOf(read)).toEqual({ kind: 'too-many' });
      expect(parsed).toBe(false);
    }
  });

  it('bounds the text by exactly what the writer writes of an export at the maxima', () => {
    // The bound of small maxima, against the real writer's text of an export at them: equal in
    // each count (it fits, and fits no bound one less), so a field the writer gains fails here.
    const text = writeWayspotExport(smallExport());
    const bound = structureBound(SMALL);
    expect(fitsStructure(text, bound)).toBe(true);
    for (const count of ['objects', 'lists', 'commas'] as const) {
      expect(fitsStructure(text, { ...bound, [count]: bound[count] - 1 })).toBe(false);
    }
    // The same text with one object, one list or one entry more than the format has room for.
    const more = [
      text.replace('"margin":500', '"margin":{}'),
      text.replace('"margin":500', '"margin":[]'),
      text.replace('"margin":500', '"margin":500,"more":1'),
    ];
    for (const one of more) {
      expect(one).not.toBe(text);
      expect(fitsStructure(one, bound)).toBe(false);
    }
  });

  it('bounds a text by the format’s own maxima', () => {
    expect(MAX_STRUCTURE).toEqual(
      structureBound({
        wayspots: MAX_EXPORT_WAYSPOTS,
        cells: MAX_EXPORT_CELLS,
        areas: MAX_KML_AREAS,
        corners: MAX_KML_CORNERS,
      }),
    );
    // By hand, from 250,000 Wayspots and cells, 200 areas and 20,000 corners (each ring's
    // closing corner one more, 20,200 corner objects): the file, its part, the corners, the
    // Wayspots; five lists and each outline; the file's 12 fields and the part's 3, between
    // the region names and between the outlines, between the corners of the outlines and in
    // each, between the cells, between the Wayspots and in each of their 9 fields.
    expect(MAX_STRUCTURE).toEqual({
      objects: 1 + 1 + 20_200 + 250_000,
      lists: 5 + 200,
      commas: 11 + 2 + 2 * 199 + 20_000 + 20_200 + 249_999 + 249_999 + 250_000 * 8,
    });
  });

  // Objects of key names of their own cost the parser most within the other bounds (plan 8Z-2,
  // fix round: 250,000 objects of nine unique keys each, 4.9 s on the audit's laptop).
  it('refuses a text of more distinct key names than the format has room for, without parsing it', () => {
    const objects = Array.from(
      { length: 1_000 },
      (_unused, n) => `{${Array.from({ length: 9 }, (_none, k) => `"k${n}_${k}":1`).join(',')}}`,
    );
    const bomb = `[${objects.join(',')}]`;
    expect(fitsStructure(bomb)).toBe(false);
    const { read, parsed } = reading(bomb);
    expect(problemOf(read)).toEqual({ kind: 'too-many' });
    expect(parsed).toBe(false);
    // 64 names pass (the format has 24: room for fields to come), the 65th does not.
    const names = (count: number): string =>
      `{${Array.from({ length: count }, (_unused, k) => `"name${k}" : ${k}`).join(',')}}`;
    expect(fitsStructure(names(MAX_KEY_NAMES))).toBe(true);
    expect(fitsStructure(names(MAX_KEY_NAMES + 1))).toBe(false);
    // A name used again is no new one, however often.
    expect(
      fitsStructure(`[${Array.from({ length: 100 }, () => names(MAX_KEY_NAMES)).join(',')}]`),
    ).toBe(true);
  });

  it('counts no key name inside a text', () => {
    // Every text of the Wayspots holds names followed by colons: a hundred each.
    const words = (n: number): string =>
      Array.from({ length: 100 }, (_unused, k) => `"w${n}_${k}": `).join('');
    const file = smallExport(words);
    const text = writeWayspotExport(file);
    expect(fitsStructure(text, structureBound(SMALL))).toBe(true);
    expect(readWayspotExport(text)).toEqual({ ok: true, file });
  });

  it('counts nothing inside a text, whatever the text holds', () => {
    // Braces, brackets and commas in every text of the Wayspots, after escaped quotes and before
    // a text's last backslash: thousands of each, far more than the small format has room for
    // outside its texts.
    const words = (n: number): string => `${n} `.padEnd(MAX_WAYSPOT_TEXT - 1, '{[,"\\') + '\\';
    const file = smallExport(words);
    const text = writeWayspotExport(file);
    expect(fitsStructure(text, structureBound(SMALL))).toBe(true);
    const { read } = reading(text);
    expect(problemOf(read)).toBeUndefined();
    expect(read.ok && read.file.wayspots).toEqual(file.wayspots);
  });
});
