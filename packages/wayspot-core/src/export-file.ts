import { MAX_KML_AREAS, MAX_KML_CORNERS } from './kml.js';
import { isClosedRing, type LatLon } from './lat-lon.js';
import { MAX_OUTLINE_CORNERS } from './outline.js';
import { isWayfarerCell, wayfarerCellAt } from './s2.js';
import { isScanMargin } from './scan-area.js';

/**
 * The Wayspot export, the file the Pine Wayfarer export tool saves and `/gym import` reads: the
 * gyms, PokéStops and power spots of Wayfarer over an area, and the level-14 cells whose
 * Wayspots it holds in full, which is what makes a Wayspot's absence mean something. Version 1
 * is pinned by `fixtures/export-v1.json`.
 */

/** What a Wayspot is in Pokémon GO. */
export type WayspotKind = 'gym' | 'stop' | 'powerspot';

const KINDS: ReadonlySet<string> = new Set<WayspotKind>(['gym', 'stop', 'powerspot']);

/** A Wayspot that is in Pokémon GO, as Wayfarer has it. */
export interface ExportedWayspot {
  /** Wayfarer's `poiId` (`isWayfarerId`). */
  id: string;
  kind: WayspotKind;
  /** The game's status as observed (`ACTIVE`, `INACTIVE`): acted on only by `withGameKinds`. */
  status: string;
  lat: number;
  lon: number;
  /** Texts as Wayfarer has them; empty where it has none. */
  title: string;
  address: string;
  description: string;
  /** The address of its main picture; empty where it has none. */
  image: string;
}

/**
 * Which part of a saved export a file is: an export too large for one upload (Discord takes
 * 10 MB) is saved in `count` parts, each a whole export of its own cells and their Wayspots.
 * `runId` names the one saving the parts were made by; `/gym import` merges only the parts of
 * one, and only all of them.
 */
export interface ExportPart {
  /** 1 to `count`. */
  index: number;
  /** 2 to `MAX_EXPORT_PARTS` (an export of one part has no `part`). */
  count: number;
  runId: string;
}

export interface WayspotExport {
  format: 'pine-wayspots';
  version: 1;
  /** The version of the tool that made the file. */
  script: string;
  /** When the export began and when the file was saved, as ISO 8601 texts (not checked). */
  startedAt: string;
  finishedAt: string;
  /** The names of the KML file's areas the export covers. */
  regions: string[];
  /**
   * The outline of each of those areas, in the same order (closed rings, latitude first): with
   * `margin` they are the export's area (`scanArea`), whatever the server's regions are when the
   * file is imported (ruled 2026-10-15). Empty for an export of listed cells.
   */
  outlines: LatLon[][];
  /**
   * How far beyond the areas' outlines the export's area reaches, in metres (`scan-area.ts`); 0
   * for an export of listed cells.
   */
  margin: number;
  /** Level-14 cells whose Wayspots the file holds in full. */
  cells: string[];
  /** Level-14 cells known to hold no Wayspot. */
  bareCells: string[];
  wayspots: ExportedWayspot[];
  /** Absent for an export saved in one file. */
  part?: ExportPart;
}

/** The format this code writes; a newer one is refused. */
export const WAYSPOT_EXPORT_VERSION = 1;

/** How many Wayspots, and how many cells, a file may hold. */
export const MAX_EXPORT_WAYSPOTS = 250_000;
export const MAX_EXPORT_CELLS = 250_000;

/** How many parts an export may be saved in: `/gym import` takes five files at once. */
export const MAX_EXPORT_PARTS = 5;

/** How large a packed part may be: under Discord's 10 MB upload limit, with room to spare. */
export const MAX_PART_BYTES = 9_000_000;

/** How long the id of a saving in parts may be. */
const MAX_RUN_ID = 100;

/** How long a text of a Wayspot or a region's name may be. */
export const MAX_WAYSPOT_TEXT = 4_000;

/** How many region names and outlines a file may hold: as many areas as a KML file. */
const MAX_EXPORT_REGIONS = MAX_KML_AREAS;

/** What about a Wayspot is wrong. */
export type WayspotFault = 'shape' | 'id' | 'kind' | 'place' | 'text';

/**
 * Why a text is no export to import. `not-json`: no JSON; `not-an-export`: JSON, but not the
 * `pine-wayspots` format or its fields not of their types (outlines that are not closed rings
 * of places, or not one per region name, included); `no-outlines`: a file of an older
 * tool, without its areas' outlines (no new format version for it: Pine is the only user,
 * ruled 2026-10-15: such an export is saved again); `version`: a newer version
 * than this code reads; `too-many`: more Wayspots than `MAX_EXPORT_WAYSPOTS` or more cells (both
 * lists) than `MAX_EXPORT_CELLS`, or a text with more objects, lists or entries than an export of
 * that many has (told without parsing it); `bad-wayspot`: the Wayspot at `index` of the file's list is
 * wrong (`fault`); `bad-cell`: an entry of `cells` or `bareCells` is no level-14 token.
 */
export type ExportProblem =
  | { kind: 'not-json' }
  | { kind: 'not-an-export' }
  | { kind: 'no-outlines' }
  | { kind: 'version'; version: number }
  | { kind: 'too-many' }
  | { kind: 'bad-wayspot'; index: number; fault: WayspotFault }
  | { kind: 'bad-cell'; list: 'cells' | 'bareCells'; index: number };

export type ExportReading =
  { ok: true; file: WayspotExport } | { ok: false; problem: ExportProblem };

/** Wayfarer's id of a Wayspot: 32 hexadecimal digits, a dot and a number (`…b4a60.16`). */
export function isWayfarerId(text: string): boolean {
  return /^[0-9a-f]{32}\.\d{1,3}$/.test(text);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown, max = MAX_WAYSPOT_TEXT): value is string =>
  typeof value === 'string' && value.length <= max;

const isWayspotText = (value: unknown): value is string => isText(value);

/** The Wayspot an entry of the file stands for, or what is wrong with it. */
function readWayspot(value: unknown): ExportedWayspot | WayspotFault {
  if (!isRecord(value)) return 'shape';
  const { id, kind, status, lat, lon, title, address, description, image } = value;
  if (typeof id !== 'string' || !isWayfarerId(id)) return 'id';
  if (typeof kind !== 'string' || !KINDS.has(kind)) return 'kind';
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return 'place';
  }
  if (
    !isText(status) ||
    !isText(title) ||
    !isText(address) ||
    !isText(description) ||
    !isText(image)
  ) {
    return 'text';
  }
  return { id, kind: kind as WayspotKind, status, lat, lon, title, address, description, image };
}

/** The part a file says it is; null for none, undefined for one that cannot be. */
function readPart(value: unknown): ExportPart | null | undefined {
  if (value === undefined) return null;
  if (!isRecord(value)) return undefined;
  const { index, count, runId } = value;
  if (
    typeof index !== 'number' ||
    typeof count !== 'number' ||
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > MAX_EXPORT_PARTS ||
    index < 1 ||
    index > count ||
    typeof runId !== 'string' ||
    runId === '' ||
    runId.length > MAX_RUN_ID
  ) {
    return undefined;
  }
  return { index, count, runId };
}

/** A corner of an outline as the file holds it: a place on earth; undefined otherwise. */
function readCorner(value: unknown): LatLon | undefined {
  if (!isRecord(value)) return undefined;
  const { lat, lon } = value;
  return typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
    ? { lat, lon }
    : undefined;
}

/**
 * The outlines of a file: closed rings of places, each of at most `MAX_OUTLINE_CORNERS` corners
 * (with its closing one beside them), `MAX_KML_CORNERS` in all, as a KML file of regions holds
 * at most; undefined when the value is anything else.
 */
function readOutlines(value: unknown): LatLon[][] | undefined {
  if (!Array.isArray(value) || value.length > MAX_EXPORT_REGIONS) return undefined;
  const outlines: LatLon[][] = [];
  let corners = 0;
  for (const ring of value) {
    if (!Array.isArray(ring) || ring.length > MAX_OUTLINE_CORNERS + 1) return undefined;
    corners += ring.length - 1;
    if (corners > MAX_KML_CORNERS) return undefined;
    const read: LatLon[] = [];
    for (const corner of ring) {
      const place = readCorner(corner);
      if (!place) return undefined;
      read.push(place);
    }
    if (!isClosedRing(read)) return undefined;
    outlines.push(read);
  }
  return outlines;
}

/** The tokens of a list of cells, or the index of the first entry that is none. */
function readCells(values: readonly unknown[]): string[] | number {
  const cells: string[] = [];
  for (const [index, value] of values.entries()) {
    if (typeof value !== 'string' || !isWayfarerCell(value)) return index;
    cells.push(value);
  }
  return cells;
}

/**
 * How many fields the file itself has (with `part`), and a part, a corner of an outline and a
 * Wayspot: the keys `writeWayspotExport` writes. `export-file.limits.test.ts` reads the largest
 * export the writer makes, so a field added there without its count here fails.
 */
const FILE_FIELDS = 12;
const PART_FIELDS = 3;
const CORNER_FIELDS = 2;
const WAYSPOT_FIELDS = 9;

/** The corners the outlines of a file hold at most: each ring's closing one beside its corners. */
const MAX_CORNER_ENTRIES = MAX_KML_CORNERS + MAX_EXPORT_REGIONS;

/** The commas of a list of this many entries, or of an object of this many fields. */
const commasAmong = (entries: number): number => entries - 1;

/**
 * How many objects, lists and commas the text of the largest export has outside its texts, each
 * worked out from the format's own maxima and from nothing else: a text with more of one cannot
 * be an export, however it is read.
 */
const MAX_STRUCTURE = {
  // The file, its part, the corners of its outlines, its Wayspots.
  objects: 1 + 1 + MAX_CORNER_ENTRIES + MAX_EXPORT_WAYSPOTS,
  // `regions`, `outlines`, `cells`, `bareCells`, `wayspots`, and each outline.
  lists: 5 + MAX_EXPORT_REGIONS,
  commas:
    commasAmong(FILE_FIELDS) +
    commasAmong(PART_FIELDS) +
    // Between the names of the regions, and between their outlines.
    2 * commasAmong(MAX_EXPORT_REGIONS) +
    // Between the corners of every outline (its closing corner is the one more), and in each.
    MAX_KML_CORNERS +
    MAX_CORNER_ENTRIES * commasAmong(CORNER_FIELDS) +
    // Between the cells: the two lists share `MAX_EXPORT_CELLS`, most commas with all in one.
    commasAmong(MAX_EXPORT_CELLS) +
    // Between the Wayspots, and in each.
    commasAmong(MAX_EXPORT_WAYSPOTS) +
    MAX_EXPORT_WAYSPOTS * commasAmong(WAYSPOT_FIELDS),
} as const;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const OPEN_BRACE = 0x7b;
const OPEN_BRACKET = 0x5b;

/**
 * Whether a text has no more objects, lists and commas than the largest export
 * (`MAX_STRUCTURE`): one pass over its characters, which passes over the texts in it (a
 * backslash takes the character after it along, so an escaped quote ends no text) and stops at
 * the first count that is over. It keeps nothing, and is asked before `JSON.parse`, which makes
 * an object of every `{}` of a text, however small the text was packed (plan 8Z-2: 64 MB of
 * `{}` took seconds and over a gigabyte). On JSON it counts exactly what the parser would
 * build; what is no JSON, the parser refuses at its first wrong character, and up to there the
 * count holds as well.
 */
function fitsAnExport(text: string): boolean {
  let objects = 0;
  let lists = 0;
  let commas = 0;
  let inText = false;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (inText) {
      if (code === BACKSLASH) at++;
      else if (code === QUOTE) inText = false;
    } else if (code === QUOTE) {
      inText = true;
    } else if (code === COMMA) {
      if (++commas > MAX_STRUCTURE.commas) return false;
    } else if (code === OPEN_BRACE) {
      if (++objects > MAX_STRUCTURE.objects) return false;
    } else if (code === OPEN_BRACKET) {
      if (++lists > MAX_STRUCTURE.lists) return false;
    }
  }
  return true;
}

/**
 * The export a text holds, checked: its format and version, its sizes, every Wayspot (an id of
 * Wayfarer's form, a known kind, a place in range, texts of at most `MAX_WAYSPOT_TEXT`) and
 * every cell. Of several Wayspots with one id the last one counts (it stays where the first
 * stood in the list). Nothing of a file that fails is used. A text with more objects, lists or
 * entries than the largest export has is `too-many` before any of it is parsed (`fitsAnExport`).
 */
export function readWayspotExport(text: string): ExportReading {
  if (!fitsAnExport(text)) return { ok: false, problem: { kind: 'too-many' } };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problem: { kind: 'not-json' } };
  }
  if (!isRecord(json) || json.format !== 'pine-wayspots') {
    return { ok: false, problem: { kind: 'not-an-export' } };
  }
  const { version, script, startedAt, finishedAt, regions, margin, cells, bareCells, wayspots } =
    json;
  const part = readPart(json.part);
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, problem: { kind: 'not-an-export' } };
  }
  if (version > WAYSPOT_EXPORT_VERSION) return { ok: false, problem: { kind: 'version', version } };
  if (json.outlines === undefined) return { ok: false, problem: { kind: 'no-outlines' } };
  const outlines = readOutlines(json.outlines);
  if (
    !isText(script, 100) ||
    !isText(startedAt, 100) ||
    !isText(finishedAt, 100) ||
    !Array.isArray(regions) ||
    regions.length > MAX_EXPORT_REGIONS ||
    !regions.every(isWayspotText) ||
    !outlines ||
    outlines.length !== regions.length ||
    !isScanMargin(margin) ||
    !Array.isArray(cells) ||
    !Array.isArray(bareCells) ||
    !Array.isArray(wayspots) ||
    part === undefined
  ) {
    return { ok: false, problem: { kind: 'not-an-export' } };
  }
  if (wayspots.length > MAX_EXPORT_WAYSPOTS || cells.length + bareCells.length > MAX_EXPORT_CELLS) {
    return { ok: false, problem: { kind: 'too-many' } };
  }
  const covered = readCells(cells);
  if (typeof covered === 'number') {
    return { ok: false, problem: { kind: 'bad-cell', list: 'cells', index: covered } };
  }
  const bare = readCells(bareCells);
  if (typeof bare === 'number') {
    return { ok: false, problem: { kind: 'bad-cell', list: 'bareCells', index: bare } };
  }
  const byId = new Map<string, ExportedWayspot>();
  for (const [index, value] of wayspots.entries()) {
    const wayspot = readWayspot(value);
    if (typeof wayspot === 'string') {
      return { ok: false, problem: { kind: 'bad-wayspot', index, fault: wayspot } };
    }
    byId.set(wayspot.id, wayspot);
  }
  return {
    ok: true,
    file: {
      format: 'pine-wayspots',
      version: 1,
      script,
      startedAt,
      finishedAt,
      regions,
      outlines,
      margin,
      cells: [...new Set(covered)],
      bareCells: [...new Set(bare)],
      wayspots: [...byId.values()],
      ...(part === null ? {} : { part }),
    },
  };
}

/**
 * The text of an export: JSON on one line (a file of Pittsburgh is tens of megabytes before it
 * is packed), every object's keys in the order of the types above, so the same export is always
 * the same text.
 */
export function writeWayspotExport(file: WayspotExport): string {
  return JSON.stringify({
    format: file.format,
    version: file.version,
    script: file.script,
    startedAt: file.startedAt,
    finishedAt: file.finishedAt,
    ...(file.part === undefined
      ? {}
      : { part: { index: file.part.index, count: file.part.count, runId: file.part.runId } }),
    regions: file.regions,
    outlines: file.outlines.map((ring) => ring.map(({ lat, lon }) => ({ lat, lon }))),
    margin: file.margin,
    cells: file.cells,
    bareCells: file.bareCells,
    wayspots: file.wayspots.map((wayspot) => ({
      id: wayspot.id,
      kind: wayspot.kind,
      status: wayspot.status,
      lat: wayspot.lat,
      lon: wayspot.lon,
      title: wayspot.title,
      address: wayspot.address,
      description: wayspot.description,
      image: wayspot.image,
    })),
  });
}

/**
 * The cells whose Wayspots the file knows in full: `cells` and the empty ones (`bareCells`),
 * but an empty one that a Wayspot of the file lies in (content wins over empty, also across the
 * parts of an export: one rule for every file). A Wayspot absent from the file is gone only in
 * these.
 */
export function coveredCells(file: WayspotExport): Set<string> {
  const shown = new Set(file.wayspots.map((wayspot) => wayfarerCellAt(wayspot)));
  return new Set([...file.cells, ...file.bareCells.filter((token) => !shown.has(token))]);
}

/** The status of a Wayspot that is not in the game as Wayfarer lists it. */
const INACTIVE = 'INACTIVE';

/**
 * An export with each Wayspot as it is in the game (Matt, 2026-11-02): a stop Wayfarer has as
 * inactive is a Power Spot (Rammummy, in Squirrel Hill: a Power Spot in the game, `POKESTOP`,
 * `INACTIVE` in Wayfarer, and no PokéStop on the game's map). An inactive Power Spot stays one:
 * Power Spots come and go from day to day. The same file where nothing changes.
 */
export function withGameKinds(file: WayspotExport): WayspotExport {
  const isOne = (wayspot: ExportedWayspot): boolean =>
    wayspot.kind === 'stop' && wayspot.status === INACTIVE;
  if (!file.wayspots.some(isOne)) return file;
  return {
    ...file,
    wayspots: file.wayspots.map((wayspot) =>
      isOne(wayspot) ? { ...wayspot, kind: 'powerspot' } : wayspot,
    ),
  };
}

/**
 * An export with only what an import reads of it: every Wayspot without its description (the
 * longest text of a Wayspot, which nothing of Pine keeps) and its status (`withGameKinds` has
 * read it by then).
 * `/gym import` keeps this while its preview waits for Import (half an hour, three at most).
 */
export function forImport(file: WayspotExport): WayspotExport {
  return {
    ...file,
    wayspots: file.wayspots.map((wayspot) => ({ ...wayspot, description: '', status: '' })),
  };
}

/**
 * An export in `count` parts (for a file too large for one upload): the cells (whole, empty, and those its Wayspots lie in) in the order of their tokens,
 * which keeps neighbours together, cut where each part has about its share of Wayspots. Each
 * part is a whole export of its own cells and the Wayspots that lie in them, with the export's
 * texts and `part`. One part is the export as it is.
 */
export function exportParts(file: WayspotExport, count: number, runId: string): WayspotExport[] {
  if (count <= 1) return [file];
  const weightOf = new Map<string, number>();
  const cellOf = new Map<string, string>();
  for (const token of [...file.cells, ...file.bareCells]) weightOf.set(token, 1);
  for (const wayspot of file.wayspots) {
    const token = wayfarerCellAt(wayspot);
    cellOf.set(wayspot.id, token);
    // A Wayspot is far longer in the file than a cell's token.
    weightOf.set(token, (weightOf.get(token) ?? 1) + 40);
  }
  const tokens = [...weightOf.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const total = tokens.reduce((sum, token) => sum + (weightOf.get(token) ?? 0), 0);
  const partOf = new Map<string, number>();
  let before = 0;
  for (const token of tokens) {
    const weight = weightOf.get(token) ?? 0;
    // A cell goes to the part its middle falls in.
    partOf.set(token, Math.min(count - 1, Math.floor(((before + weight / 2) * count) / total)));
    before += weight;
  }
  const { part: _whole, ...meta } = file;
  return Array.from({ length: count }, (_, index) => ({
    ...meta,
    regions: [...file.regions],
    outlines: file.outlines,
    cells: file.cells.filter((token) => partOf.get(token) === index),
    bareCells: file.bareCells.filter((token) => partOf.get(token) === index),
    wayspots: file.wayspots.filter((one) => partOf.get(cellOf.get(one.id) ?? '') === index),
    part: { index: index + 1, count, runId },
  }));
}

/**
 * Why files cannot be merged into one export. `not-parts`: several files, and one of them is a
 * whole export; `mixed-runs`: parts of different savings (another `runId` or `count`);
 * `same-part`: the part `index` twice; `missing-parts`: the parts `missing` of `count` are not
 * there.
 */
export type PartsProblem =
  | { kind: 'not-parts' }
  | { kind: 'mixed-runs' }
  | { kind: 'same-part'; index: number }
  | { kind: 'missing-parts'; missing: number[]; count: number };

export type PartsReading = { ok: true; file: WayspotExport } | { ok: false; problem: PartsProblem };

/**
 * The export that files make together: a whole export alone as it is, or every part of one
 * saving, in any order, merged (the texts of the first part, the cells of all, of several
 * Wayspots with one id the one of the later part; a cell empty in one part but whole, or with a
 * Wayspot, in another is not empty). Anything else is refused.
 */
export function mergeExportParts(files: readonly WayspotExport[]): PartsReading {
  const [first] = files;
  if (first === undefined) {
    return { ok: false, problem: { kind: 'missing-parts', missing: [], count: 0 } };
  }
  if (files.length === 1 && first.part === undefined) return { ok: true, file: first };
  const parts: { file: WayspotExport; part: ExportPart }[] = [];
  for (const file of files) {
    if (file.part === undefined) return { ok: false, problem: { kind: 'not-parts' } };
    parts.push({ file, part: file.part });
  }
  const { runId, count } = parts[0]!.part;
  if (parts.some(({ part }) => part.runId !== runId || part.count !== count)) {
    return { ok: false, problem: { kind: 'mixed-runs' } };
  }
  const seen = new Set<number>();
  for (const { part } of parts) {
    if (seen.has(part.index)) {
      return { ok: false, problem: { kind: 'same-part', index: part.index } };
    }
    seen.add(part.index);
  }
  const missing = Array.from({ length: count }, (_, n) => n + 1).filter((n) => !seen.has(n));
  if (missing.length > 0) return { ok: false, problem: { kind: 'missing-parts', missing, count } };
  const ordered = [...parts].sort((a, b) => a.part.index - b.part.index).map(({ file }) => file);
  const byId = new Map<string, ExportedWayspot>();
  for (const file of ordered) for (const one of file.wayspots) byId.set(one.id, one);
  const { part: _part, ...meta } = ordered[0]!;
  const cells = new Set(ordered.flatMap((file) => file.cells));
  // A cell read empty in one part and whole in another is whole; one with a Wayspot of another
  // part in it is not covered either (`coveredCells`, the rule for every file).
  return {
    ok: true,
    file: {
      ...meta,
      cells: [...cells],
      bareCells: [
        ...new Set(ordered.flatMap((file) => file.bareCells.filter((token) => !cells.has(token)))),
      ],
      wayspots: [...byId.values()],
    },
  };
}
