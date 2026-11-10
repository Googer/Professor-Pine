import { describe, expect, it, vi } from 'vitest';
import { MAX_KML_AREAS, MAX_KML_CORNERS } from './kml.js';
import type { LatLon } from './lat-lon.js';
import {
  MAX_EXPORT_CELLS,
  MAX_EXPORT_PARTS,
  MAX_EXPORT_WAYSPOTS,
  MAX_WAYSPOT_TEXT,
  readWayspotExport,
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
 * The largest export the format allows, as the tool would write it: as many areas as a KML file
 * holds, with as many corners in all, as many cells and Wayspots as a file may list, and a part
 * of a saving in parts. Its texts are short: only the structure is at its maximum.
 */
function largestExport(): WayspotExport {
  const corners = MAX_KML_CORNERS / MAX_KML_AREAS;
  return {
    format: 'pine-wayspots',
    version: 1,
    script: '1.0.0',
    startedAt: '2026-10-20T14:02:11Z',
    finishedAt: '2026-10-20T18:40:52Z',
    regions: Array.from({ length: MAX_KML_AREAS }, (_unused, n) => `area-${n}`),
    outlines: Array.from({ length: MAX_KML_AREAS }, (_unused, n) => ring(corners, n)),
    margin: 500,
    // Level-14 tokens: eight hexadecimal digits that end in the cell's own bit.
    cells: Array.from({ length: MAX_EXPORT_CELLS }, (_unused, n) =>
      (0x8834_0001 + 2 * n).toString(16),
    ),
    bareCells: [],
    wayspots: Array.from({ length: MAX_EXPORT_WAYSPOTS }, (_unused, n) => ({
      id: `${n.toString(16).padStart(32, '0')}.16`,
      kind: 'stop' as const,
      status: 'ACTIVE',
      lat: 40.4,
      lon: -79.9,
      title: '',
      address: '',
      description: '',
      image: '',
    })),
    part: { index: 1, count: MAX_EXPORT_PARTS, runId: 'run-1' },
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

  it('counts nothing inside a text, whatever the text holds', () => {
    // Braces, brackets and commas in the texts of a thousand Wayspots, after escaped quotes and
    // before a text's last backslash: over three million of each, more than a whole export may
    // have outside its texts.
    const words = (n: number): string => `${n} `.padEnd(MAX_WAYSPOT_TEXT - 1, '{[,"\\') + '\\';
    const largest = largestExport();
    const file: WayspotExport = {
      ...largest,
      cells: [],
      wayspots: largest.wayspots.slice(0, 1_000).map((wayspot, n) => ({
        ...wayspot,
        title: words(n),
        address: words(n),
        description: words(n),
        image: words(n),
      })),
    };
    const { read } = reading(writeWayspotExport(file));
    expect(problemOf(read)).toBeUndefined();
    expect(read.ok && read.file.wayspots).toEqual(file.wayspots);
  });

  // The whole of a largest export is read here, 42 MB of text: about three seconds on a quiet
  // machine (over one of them checking a quarter of a million cell tokens), so it gets more time
  // than a unit test has, for a machine that is busy.
  it(
    'reads the largest export the format allows, and parses nothing with one thing more',
    {
      timeout: 60_000,
    },
    () => {
      const file = largestExport();
      const text = writeWayspotExport(file);
      const { read, parsed } = reading(text);
      expect(parsed).toBe(true);
      expect(problemOf(read)).toBeUndefined();
      expect(read.ok && read.file.wayspots.length).toBe(MAX_EXPORT_WAYSPOTS);
      expect(read.ok && read.file.cells.length).toBe(MAX_EXPORT_CELLS);
      expect(read.ok && read.file.outlines.length).toBe(MAX_KML_AREAS);

      // The same text with one object, one list or one entry more than the format has room for.
      const more = [
        text.replace('"margin":500', '"margin":{}'),
        text.replace('"margin":500', '"margin":[]'),
        text.replace('"margin":500', '"margin":500,"more":1'),
      ];
      for (const one of more) {
        expect(one).not.toBe(text);
        const refused = reading(one);
        expect(problemOf(refused.read)).toEqual({ kind: 'too-many' });
        expect(refused.parsed).toBe(false);
      }
    },
  );
});
