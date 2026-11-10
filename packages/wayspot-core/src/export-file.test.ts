import { describe, expect, it } from 'vitest';
import { MAX_KML_CORNERS } from './kml.js';
import type { LatLon } from './lat-lon.js';
import { MAX_OUTLINE_CORNERS } from './outline.js';
import { wayfarerCellAt } from './s2.js';
import {
  coveredCells,
  exportParts,
  isWayfarerId,
  MAX_EXPORT_CELLS,
  MAX_EXPORT_PARTS,
  MAX_EXPORT_WAYSPOTS,
  MAX_WAYSPOT_TEXT,
  mergeExportParts,
  withGameKinds,
  readWayspotExport,
  writeWayspotExport,
  type ExportedWayspot,
  type WayspotExport,
} from './export-file.js';

/** A closed ring of an invented area (a triangle). */
const area = (lat: number): LatLon[] => [
  { lat, lon: -79.93 },
  { lat: lat + 0.01, lon: -79.93 },
  { lat: lat + 0.01, lon: -79.92 },
  { lat, lon: -79.93 },
];

/** Invented Wayspots; the cells are real level-14 tokens of Pittsburgh. */
const wayspot = (n: number, overrides: Partial<ExportedWayspot> = {}): ExportedWayspot => ({
  id: `${n.toString(16).padStart(32, '0')}.16`,
  kind: 'gym',
  status: 'ACTIVE',
  lat: 40.437 + n / 10_000,
  lon: -79.9 - n / 10_000,
  title: `Mural ${n}`,
  address: `${n} Example St, Pittsburgh, PA`,
  description: '',
  image: '',
  ...overrides,
});

const exported = (overrides: Partial<WayspotExport> = {}): WayspotExport => ({
  format: 'pine-wayspots',
  version: 1,
  script: '1.0.0',
  startedAt: '2026-10-20T14:02:11Z',
  finishedAt: '2026-10-20T18:40:52Z',
  regions: ['squirrel-hill', 'greenfield'],
  outlines: [area(40.43), area(40.41)],
  margin: 500,
  cells: ['8834ede1', '8834ede3'],
  bareCells: ['8834edfd'],
  wayspots: [wayspot(1), wayspot(2, { kind: 'stop' }), wayspot(3, { kind: 'powerspot' })],
  ...overrides,
});

/** The file as JSON with a change made to its plain object. */
const text = (change: (json: Record<string, unknown>) => void): string => {
  const json = JSON.parse(writeWayspotExport(exported())) as Record<string, unknown>;
  change(json);
  return JSON.stringify(json);
};

const problemOf = (source: string) => {
  const reading = readWayspotExport(source);
  return reading.ok ? undefined : reading.problem;
};

describe('the Wayspot export file', () => {
  it('reads what it wrote', () => {
    const file = exported();
    expect(readWayspotExport(writeWayspotExport(file))).toEqual({ ok: true, file });
  });

  it('writes the same export as the same text, keys in a fixed order', () => {
    const file = exported();
    const shuffled = {
      ...file,
      wayspots: file.wayspots.map(({ image, title, id, ...rest }) => ({
        image,
        ...rest,
        title,
        id,
      })),
    };
    expect(writeWayspotExport(shuffled)).toBe(writeWayspotExport(file));
    expect(writeWayspotExport(file)).toMatch(/^\{"format":"pine-wayspots","version":1,"script"/);
    expect(writeWayspotExport(file)).toContain('{"id":"');
    expect(writeWayspotExport(file)).not.toContain('\n');
  });

  it('refuses text that is no JSON, or JSON of another format', () => {
    expect(problemOf('{"format": "pine-wayspots",')).toEqual({ kind: 'not-json' });
    expect(problemOf('[]')).toEqual({ kind: 'not-an-export' });
    expect(problemOf('null')).toEqual({ kind: 'not-an-export' });
    expect(problemOf(text((json) => (json.format = 'wayfarer')))).toEqual({
      kind: 'not-an-export',
    });
    expect(problemOf(text((json) => delete json.cells))).toEqual({ kind: 'not-an-export' });
    expect(problemOf(text((json) => (json.regions = [1])))).toEqual({ kind: 'not-an-export' });
    expect(problemOf(text((json) => (json.script = 2)))).toEqual({ kind: 'not-an-export' });
    expect(problemOf(text((json) => (json.version = 0)))).toEqual({ kind: 'not-an-export' });
    expect(problemOf(text((json) => (json.version = '1')))).toEqual({ kind: 'not-an-export' });
  });

  it('writes the outlines and the margin after the regions, and needs both', () => {
    expect(writeWayspotExport(exported())).toContain(
      '"regions":["squirrel-hill","greenfield"],"outlines":[[{"lat":40.43,"lon":-79.93},',
    );
    expect(writeWayspotExport(exported())).toContain('-79.93}]],"margin":500,"cells"');
    expect(problemOf(text((json) => delete json.margin))).toEqual({ kind: 'not-an-export' });
  });

  it('refuses a file without outlines as one of an older tool', () => {
    expect(problemOf(text((json) => delete json.outlines))).toEqual({ kind: 'no-outlines' });
  });

  it('takes an export of listed cells, which has neither regions nor outlines', () => {
    const file = exported({ regions: [], outlines: [], margin: 0 });
    expect(readWayspotExport(writeWayspotExport(file))).toEqual({ ok: true, file });
  });

  it('refuses outlines that are not one closed ring of places per region', () => {
    const refused = { kind: 'not-an-export' };
    const withOutlines = (outlines: unknown) =>
      problemOf(text((json) => (json.outlines = outlines)));
    expect(withOutlines([area(40.43)])).toEqual(refused);
    expect(withOutlines([area(40.43), area(40.41), area(40.39)])).toEqual(refused);
    expect(withOutlines([area(40.43), area(40.41).slice(0, 3)])).toEqual(refused);
    expect(withOutlines([area(40.43), [...area(40.41).slice(0, 3), { lat: 1, lon: 1 }]])).toEqual(
      refused,
    );
    expect(withOutlines([area(40.43), area(91)])).toEqual(refused);
    expect(withOutlines([area(40.43), [[40.41, -79.93]]])).toEqual(refused);
    expect(withOutlines('none')).toEqual(refused);
    expect(withOutlines([area(40.43), area(40.41)])).toBeUndefined();
  });

  it('refuses outlines with more corners than a KML file of regions holds', () => {
    const ring = (corners: number, lat: number): LatLon[] => {
      const made = Array.from({ length: corners }, (_, n) => ({
        lat: lat + Math.sin((2 * Math.PI * n) / corners) / 100,
        lon: -79.9 + Math.cos((2 * Math.PI * n) / corners) / 100,
      }));
      return [...made, made[0]!];
    };
    const many = (outlines: LatLon[][]) =>
      problemOf(
        text((json) => {
          json.regions = outlines.map((_, n) => `area-${n}`);
          json.outlines = outlines;
        }),
      );
    expect(many([ring(MAX_OUTLINE_CORNERS, 40.4)])).toBeUndefined();
    expect(many([ring(MAX_OUTLINE_CORNERS + 1, 40.4)])).toEqual({ kind: 'not-an-export' });
    const rings = MAX_KML_CORNERS / MAX_OUTLINE_CORNERS;
    const full = Array.from({ length: rings }, (_, n) => ring(MAX_OUTLINE_CORNERS, 40 + n / 10));
    expect(many(full)).toBeUndefined();
    expect(many([...full, area(41)])).toEqual({ kind: 'not-an-export' });
  });

  it('refuses a margin that is no number of metres from 0 to 2,000', () => {
    for (const margin of [-1, 2_001, '500', null]) {
      expect(problemOf(text((json) => (json.margin = margin)))).toEqual({
        kind: 'not-an-export',
      });
    }
    expect(problemOf(text((json) => (json.margin = 2_000)))).toBeUndefined();
  });

  it('refuses a newer version and names it', () => {
    expect(problemOf(text((json) => (json.version = 2)))).toEqual({ kind: 'version', version: 2 });
  });

  it('refuses a file with too many Wayspots or cells', () => {
    const many = Array.from({ length: MAX_EXPORT_WAYSPOTS + 1 }, () => ({}));
    expect(problemOf(text((json) => (json.wayspots = many)))).toEqual({ kind: 'too-many' });
    const cells = Array.from({ length: MAX_EXPORT_CELLS / 2 + 1 }, () => '8834ede1');
    expect(
      problemOf(
        text((json) => {
          json.cells = cells;
          json.bareCells = cells;
        }),
      ),
    ).toEqual({ kind: 'too-many' });
  });

  it('names the first Wayspot that is wrong, and what is wrong with it', () => {
    const withSecond = (change: Record<string, unknown>) =>
      problemOf(
        text((json) => {
          const list = json.wayspots as Record<string, unknown>[];
          list[1] = { ...list[1], ...change };
        }),
      );
    const fault = (fault: string) => ({ kind: 'bad-wayspot', index: 1, fault });
    expect(withSecond({ id: '5c1e0b7a2d9f4e6b8a3c7d1e9f2b4a60' })).toEqual(fault('id'));
    expect(withSecond({ id: '5C1E0B7A2D9F4E6B8A3C7D1E9F2B4A60.16' })).toEqual(fault('id'));
    expect(withSecond({ id: '123456' })).toEqual(fault('id'));
    expect(withSecond({ kind: 'pokestop' })).toEqual(fault('kind'));
    expect(withSecond({ lat: 91 })).toEqual(fault('place'));
    expect(withSecond({ lon: -180.5 })).toEqual(fault('place'));
    expect(withSecond({ lat: '40.4' })).toEqual(fault('place'));
    expect(withSecond({ lat: null })).toEqual(fault('place'));
    expect(withSecond({ title: 'x'.repeat(MAX_WAYSPOT_TEXT + 1) })).toEqual(fault('text'));
    expect(withSecond({ description: null })).toEqual(fault('text'));
    expect(problemOf(text((json) => ((json.wayspots as unknown[])[1] = 'a Wayspot')))).toEqual(
      fault('shape'),
    );
    // A text of the longest length is fine.
    expect(withSecond({ title: 'x'.repeat(MAX_WAYSPOT_TEXT) })).toBeUndefined();
  });

  it('refuses a cell that is no level-14 token, naming its list', () => {
    expect(problemOf(text((json) => (json.cells = ['8834ede1', '8834ede'])))).toEqual({
      kind: 'bad-cell',
      list: 'cells',
      index: 1,
    });
    expect(problemOf(text((json) => (json.bareCells = [7])))).toEqual({
      kind: 'bad-cell',
      list: 'bareCells',
      index: 0,
    });
  });

  it('keeps the last of several Wayspots with one id, where the first stood', () => {
    const reading = readWayspotExport(
      writeWayspotExport(
        exported({
          wayspots: [wayspot(1), wayspot(2), wayspot(1, { title: 'Renamed', kind: 'stop' })],
        }),
      ),
    );
    expect(reading.ok && reading.file.wayspots.map((w) => [w.title, w.kind])).toEqual([
      ['Renamed', 'stop'],
      ['Mural 2', 'gym'],
    ]);
  });

  it('counts covered and empty cells as covered', () => {
    expect([...coveredCells(exported())].sort()).toEqual(['8834ede1', '8834ede3', '8834edfd']);
  });

  it('counts no cell as covered that the file lists empty while a Wayspot of it lies there', () => {
    // A file can say both: content wins over empty.
    const shown = wayspot(1);
    const cut = wayfarerCellAt(shown);
    const empty = wayfarerCellAt({ lat: 40.6, lon: -80.2 });
    expect(empty).not.toBe(cut);
    const file = exported({ cells: [], bareCells: [cut, empty], wayspots: [shown] });
    expect([...coveredCells(file)]).toEqual([empty]);
  });

  it("knows Wayfarer's ids", () => {
    expect(isWayfarerId('5c1e0b7a2d9f4e6b8a3c7d1e9f2b4a60.16')).toBe(true);
    expect(isWayfarerId('5c1e0b7a2d9f4e6b8a3c7d1e9f2b4a60.1')).toBe(true);
    expect(isWayfarerId('5c1e0b7a2d9f4e6b8a3c7d1e9f2b4a60.1234')).toBe(false);
    expect(isWayfarerId('5c1e0b7a2d9f4e6b8a3c7d1e9f2b4a60')).toBe(false);
    expect(isWayfarerId('1234567890')).toBe(false);
    expect(isWayfarerId('')).toBe(false);
  });
});

describe('an export in parts', () => {
  /** Wayspots spread over many cells, and cells whole and empty around them. */
  const spread = (): WayspotExport => {
    const wayspots = Array.from({ length: 40 }, (_, n) =>
      wayspot(n + 1, { lat: 40.4 + n * 0.01, lon: -79.9 - (n % 7) * 0.01 }),
    );
    const cells = [...new Set(wayspots.map(wayfarerCellAt))].sort();
    return exported({ cells: cells.slice(1), bareCells: ['8834edfd'], wayspots });
  };
  const RUN = 'run-1760500000000-1760510000000';

  it('reads and writes the part a file is', () => {
    const file = exported({ part: { index: 2, count: 3, runId: RUN } });
    const written = writeWayspotExport(file);
    expect(written).toContain(`"part":{"index":2,"count":3,"runId":"${RUN}"}`);
    expect(readWayspotExport(written)).toEqual({ ok: true, file });
    expect(writeWayspotExport(exported())).not.toContain('"part"');
  });

  it('refuses a part that cannot be', () => {
    const withPart = (part: unknown) => problemOf(text((json) => (json.part = part)));
    const refused = { kind: 'not-an-export' };
    expect(withPart({ index: 0, count: 2, runId: RUN })).toEqual(refused);
    expect(withPart({ index: 3, count: 2, runId: RUN })).toEqual(refused);
    expect(withPart({ index: 1.5, count: 2, runId: RUN })).toEqual(refused);
    expect(withPart({ index: 1, count: MAX_EXPORT_PARTS + 1, runId: RUN })).toEqual(refused);
    expect(withPart({ index: 1, count: 2, runId: '' })).toEqual(refused);
    expect(withPart({ index: 1, count: 2, runId: 'x'.repeat(101) })).toEqual(refused);
    expect(withPart({ index: 1, count: 2 })).toEqual(refused);
    expect(withPart('1 of 2')).toEqual(refused);
    expect(withPart({ index: 1, count: 2, runId: RUN })).toBeUndefined();
  });

  it('splits an export into whole exports of their own cells and their Wayspots', () => {
    const file = spread();
    const parts = exportParts(file, 3, RUN);
    expect(parts.map((part) => part.part)).toEqual(
      [1, 2, 3].map((index) => ({
        index,
        count: 3,
        runId: RUN,
      })),
    );
    for (const part of parts) {
      expect(part.wayspots.length).toBeGreaterThan(0);
      expect(part.regions).toEqual(file.regions);
      expect(part.outlines).toEqual(file.outlines);
      expect(part.margin).toBe(500);
      expect(part.startedAt).toBe(file.startedAt);
      // Every Wayspot of a part lies in a cell of that part, never in another part's.
      const own = new Set([...part.cells, ...part.bareCells]);
      const others = parts
        .filter((other) => other !== part)
        .flatMap((other) => [...other.cells, ...other.bareCells]);
      for (const one of part.wayspots) expect(others).not.toContain(wayfarerCellAt(one));
      for (const cell of own) expect(others).not.toContain(cell);
    }
    expect(
      parts
        .flatMap((part) => part.wayspots)
        .map((one) => one.id)
        .sort(),
    ).toEqual(file.wayspots.map((one) => one.id).sort());
    expect(parts.flatMap((part) => part.cells).sort()).toEqual([...file.cells].sort());
    expect(parts.flatMap((part) => part.bareCells)).toEqual(file.bareCells);
    // Of similar size: no part has more than twice its share of Wayspots.
    for (const part of parts) expect(part.wayspots.length).toBeLessThanOrEqual((2 * 40) / 3);
  });

  it('keeps an export of one part as it is', () => {
    const file = spread();
    expect(exportParts(file, 1, RUN)).toEqual([file]);
  });

  it('merges the parts of one run, in any order, into the export they were made of', () => {
    const file = spread();
    const parts = exportParts(file, 3, RUN);
    const merged = mergeExportParts([parts[2]!, parts[0]!, parts[1]!]);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.file.part).toBeUndefined();
    expect([...merged.file.cells].sort()).toEqual([...file.cells].sort());
    expect(merged.file.bareCells).toEqual(file.bareCells);
    expect(merged.file.wayspots.map((one) => one.id).sort()).toEqual(
      file.wayspots.map((one) => one.id).sort(),
    );
    expect(merged.file.regions).toEqual(file.regions);
    expect(merged.file.outlines).toEqual(file.outlines);
    expect(merged.file.margin).toBe(file.margin);
    // The merged export reads back as it is.
    expect(readWayspotExport(writeWayspotExport(merged.file))).toEqual({
      ok: true,
      file: merged.file,
    });
  });

  it('counts a cell empty in one part as covered only while no part shows something in it', () => {
    const shown = wayspot(1, { lat: 40.6, lon: -80.2 });
    const cut = wayfarerCellAt(shown);
    const whole = '8834ede1';
    expect(cut).not.toBe(whole);
    const part = (index: number, overrides: Partial<WayspotExport>): WayspotExport =>
      exported({
        cells: [],
        bareCells: [],
        wayspots: [],
        part: { index, count: 2, runId: RUN },
        ...overrides,
      });
    const merged = mergeExportParts([
      part(1, { bareCells: [cut, whole] }),
      part(2, { cells: [whole], wayspots: [shown] }),
    ]);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    // Read empty in one part and cut with a Wayspot in the other: not covered (as within one
    // run); empty in one and whole in the other: whole.
    expect(merged.file.bareCells).toEqual([cut]);
    expect(merged.file.cells).toEqual([whole]);
    expect(coveredCells(merged.file)).toEqual(new Set([whole]));
  });

  it('takes a whole export alone as it is', () => {
    const file = spread();
    expect(mergeExportParts([file])).toEqual({ ok: true, file });
  });

  it('refuses parts of different runs, a part twice, a missing part, or a whole export beside parts', () => {
    const file = spread();
    const parts = exportParts(file, 3, RUN);
    const other = exportParts(file, 3, 'run-2');
    expect(mergeExportParts([parts[0]!, other[1]!, parts[2]!])).toEqual({
      ok: false,
      problem: { kind: 'mixed-runs' },
    });
    expect(mergeExportParts([parts[0]!, exportParts(file, 2, RUN)[1]!])).toEqual({
      ok: false,
      problem: { kind: 'mixed-runs' },
    });
    expect(mergeExportParts([parts[0]!, parts[0]!, parts[2]!])).toEqual({
      ok: false,
      problem: { kind: 'same-part', index: 1 },
    });
    expect(mergeExportParts([parts[2]!])).toEqual({
      ok: false,
      problem: { kind: 'missing-parts', missing: [1, 2], count: 3 },
    });
    expect(mergeExportParts([parts[0]!, file])).toEqual({
      ok: false,
      problem: { kind: 'not-parts' },
    });
    expect(mergeExportParts([file, file])).toEqual({ ok: false, problem: { kind: 'not-parts' } });
  });

  describe('the Wayspots and cells of all parts together', () => {
    // The parts of one saving hold together what one export may (the tool cuts one export of at
    // most the maxima): five parts of a full export each would be five times that (plan 8Z-2).
    const many = Array.from({ length: MAX_EXPORT_WAYSPOTS / MAX_EXPORT_PARTS }, (_, n) =>
      wayspot(n),
    );
    const tokens = Array.from({ length: MAX_EXPORT_CELLS / MAX_EXPORT_PARTS }, () => '8834ede1');
    const part = (index: number, overrides: Partial<WayspotExport> = {}): WayspotExport =>
      exported({
        cells: [],
        bareCells: [],
        wayspots: many,
        part: { index, count: MAX_EXPORT_PARTS, runId: RUN },
        ...overrides,
      });
    const parts = (last: Partial<WayspotExport>): WayspotExport[] =>
      Array.from({ length: MAX_EXPORT_PARTS }, (_, n) =>
        part(n + 1, n === MAX_EXPORT_PARTS - 1 ? last : {}),
      );

    it('merges parts that hold exactly as many Wayspots and cells as one export may', () => {
      expect(mergeExportParts(parts({})).ok).toBe(true);
      const cells = Array.from({ length: MAX_EXPORT_PARTS }, (_, n) =>
        part(n + 1, { wayspots: [], cells: tokens.slice(1), bareCells: ['8834edfd'] }),
      );
      expect(mergeExportParts(cells).ok).toBe(true);
    });

    it('refuses parts that hold one Wayspot or one cell more together', () => {
      const tooMany = { ok: false, problem: { kind: 'too-many' } };
      expect(mergeExportParts(parts({ wayspots: [...many, wayspot(0)] }))).toEqual(tooMany);
      const cells = (last: Partial<WayspotExport>) =>
        Array.from({ length: MAX_EXPORT_PARTS }, (_, n) =>
          part(n + 1, {
            wayspots: [],
            cells: tokens,
            ...(n === MAX_EXPORT_PARTS - 1 ? last : {}),
          }),
        );
      expect(mergeExportParts(cells({ bareCells: ['8834edfd'] }))).toEqual(tooMany);
      expect(mergeExportParts(cells({ cells: [...tokens, '8834ede3'] }))).toEqual(tooMany);
    });
  });
});

describe('what a Wayspot of an export is in the game', () => {
  const kinds = (...wayspots: ExportedWayspot[]) =>
    withGameKinds(exported({ wayspots })).wayspots.map(({ kind, status }) => [kind, status]);

  it('takes a stop Wayfarer has as inactive for a Power Spot', () => {
    expect(kinds(wayspot(1, { kind: 'stop', status: 'INACTIVE' }))).toEqual([
      ['powerspot', 'INACTIVE'],
    ]);
  });

  it('leaves everything else as Wayfarer has it', () => {
    expect(
      kinds(
        wayspot(1, { kind: 'stop', status: 'ACTIVE' }),
        wayspot(2, { kind: 'powerspot', status: 'INACTIVE' }),
        wayspot(3, { kind: 'gym', status: 'INACTIVE' }),
      ),
    ).toEqual([
      ['stop', 'ACTIVE'],
      ['powerspot', 'INACTIVE'],
      ['gym', 'INACTIVE'],
    ]);
  });

  it('keeps the rest of the file, and answers the same file where nothing changes', () => {
    const file = exported({ wayspots: [wayspot(1, { kind: 'stop', status: 'INACTIVE' })] });
    const { wayspots, ...rest } = withGameKinds(file);
    const { wayspots: _before, ...before } = file;
    expect(rest).toEqual(before);
    expect(wayspots[0]).toEqual({ ...file.wayspots[0], kind: 'powerspot' });
    const plain = exported();
    expect(withGameKinds(plain)).toBe(plain);
  });
});
