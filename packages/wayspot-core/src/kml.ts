import type { LatLon } from './lat-lon.js';
import { MAX_OUTLINE_CORNERS, tidyOutline, type OutlineProblem } from './outline.js';
import { childNamed, childrenNamed, readXml, type XmlElement } from './xml.js';

/**
 * How many areas one file may hold. A server has tens of regions (56 in one file is a real
 * case); a file with thousands of polygons is something else than a set of regions.
 */
export const MAX_KML_AREAS = 200;

/**
 * How many corners the outlines of one file may have in all: four of the longest outline
 * there may be. Every outline is checked for crossings, and every gym is placed in every new
 * outline, on the one thread the bot has: this keeps a file to well under a second of that.
 */
export const MAX_KML_CORNERS = 4 * MAX_OUTLINE_CORNERS;

/** How long the name and the description of an area are kept at most. */
const MAX_TEXT = 200;

/** An area of a KML file: a placemark with one polygon. */
export interface KmlArea {
  /** The placemark's `<name>`, white space tidied; empty when it has none. */
  name: string;
  /**
   * The placemark's `<description>` as plain text (`plainDescription`): its first line, without
   * HTML; null when nothing is left.
   */
  description: string | null;
  /** The outer ring, tidied and closed (`tidyOutline`). */
  outline: LatLon[];
  /** Whether the polygon had inner rings (holes), which are ignored. */
  holes: boolean;
}

/** Why a placemark with a polygon is no area. */
export type KmlSkipReason =
  /** A `MultiGeometry` with several polygons: one region is one area. */
  | { kind: 'several-areas' }
  /** The polygon has no outer ring with coordinates. */
  | { kind: 'no-outline' }
  /** The outer ring cannot be the outline of a region (`tidyOutline`). */
  | { kind: 'outline'; problem: OutlineProblem };

export interface KmlSkipped {
  name: string;
  reason: KmlSkipReason;
}

/**
 * Why a text is no KML to read areas from. `kmz`: a zip archive (it starts with `PK`);
 * `not-xml`: not well-formed XML; `doctype`: it declares a document type, which is never read;
 * `too-deep`: nested deeper than any KML; `not-kml`: its root is not `kml`; `no-areas`: no
 * placemark has a polygon; `too-many-areas`: more than `MAX_KML_AREAS` have one;
 * `too-many-corners`: their outlines have more than `MAX_KML_CORNERS` corners in all.
 */
export type KmlProblem =
  | 'kmz'
  | 'not-xml'
  | 'doctype'
  | 'too-deep'
  | 'not-kml'
  | 'no-areas'
  | 'too-many-areas'
  | 'too-many-corners';

export type KmlReading =
  | {
      ok: true;
      areas: KmlArea[];
      /** The placemarks with a polygon that are no area, each with the reason. */
      skipped: KmlSkipped[];
      /** How many placemarks have no polygon (points, lines). */
      others: number;
    }
  | { ok: false; reason: KmlProblem };

/** Text of a file with its white space tidied: runs of it are one blank, none at the ends. */
function tidy(text: string): string {
  return text.split(/\s+/u).filter(Boolean).join(' ').slice(0, MAX_TEXT);
}

/** The named entities of HTML a description of a map editor is likely to have. */
const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: String.fromCharCode(0xa0),
};

/** HTML entities as the characters they stand for; one that is none of those stays as it is. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/giu, (whole, name: string) => {
    if (!name.startsWith('#')) return ENTITIES[name.toLowerCase()] ?? whole;
    const code =
      name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    const character = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    return character ? String.fromCodePoint(code) : whole;
  });
}

/**
 * The text of a KML description as a line of plain text. A description is HTML (Google My
 * Maps writes the fields of a placemark there as lines, `<br>` between them): it is cut at the
 * first line break or `<br`, its tags are dropped, its entities decoded and its white space
 * tidied. Empty when nothing is left.
 */
export function plainDescription(text: string): string {
  const line = text.split(/[\r\n]|<br\b/iu, 1)[0] ?? '';
  // `[^<>]`: a `<` that no `>` closes is text, and finding that out never goes past the next `<`.
  return tidy(decodeEntities(line.replace(/<[^<>]*>/gu, '')));
}

/** A decimal number as KML writes one; anything else is no number. */
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;
/** No number of a coordinate is longer than this. */
const MAX_NUMBER_LENGTH = 40;

function numberOf(text: string): number {
  return text.length <= MAX_NUMBER_LENGTH && NUMBER.test(text) ? Number(text) : Number.NaN;
}

/**
 * The points of a `<coordinates>` text: `lon,lat[,alt]` tuples separated by white space. A
 * tuple that is none becomes a point that is no number, which `tidyOutline` refuses.
 */
function pointsOf(coordinates: string): LatLon[] {
  return coordinates
    .split(/\s+/u)
    .filter(Boolean)
    .map((tuple) => {
      const parts = tuple.split(',');
      if (parts.length < 2 || parts.length > 3) return { lat: Number.NaN, lon: Number.NaN };
      return { lat: numberOf(parts[1] ?? ''), lon: numberOf(parts[0] ?? '') };
    });
}

/** The polygons of a placemark: its own, and those of its `MultiGeometry`, however nested. */
function polygonsOf(placemark: XmlElement): XmlElement[] {
  const found: XmlElement[] = [];
  const pending = [placemark];
  for (let next = pending.pop(); next; next = pending.pop()) {
    // One at a time, never spread into a call: a file may have more siblings than a call
    // takes arguments.
    for (const child of next.children) if (child.name === 'Polygon') found.push(child);
    // In reverse, so that they are looked at in the order of the file.
    for (let i = next.children.length - 1; i >= 0; i--) {
      const child = next.children[i];
      if (child?.name === 'MultiGeometry') pending.push(child);
    }
  }
  return found;
}

/** Every placemark of a document, in the order of the file, wherever it is nested. */
function placemarksOf(root: XmlElement): XmlElement[] {
  const found: XmlElement[] = [];
  const pending = [root];
  for (let next = pending.pop(); next; next = pending.pop()) {
    if (next.name === 'Placemark') {
      found.push(next);
      continue;
    }
    for (let i = next.children.length - 1; i >= 0; i--) {
      const child = next.children[i];
      if (child) pending.push(child);
    }
  }
  return found;
}

/**
 * Reads the areas of a KML file. An area is a `Placemark` with a `Polygon`, wherever it stands
 * (in the `Document`, in nested `Folder`s); its name is the placemark's `<name>`, its outline
 * the polygon's outer ring, tidied and checked (`tidyOutline`). Inner rings are ignored, and the
 * area says that it had some. A `MultiGeometry` with one polygon is that polygon; with several,
 * the placemark is skipped. A placemark with a polygon that is no area is listed in `skipped`
 * with the reason; placemarks without a polygon are only counted. A file whose placemarks with
 * a polygon were all skipped is read all the same (`areas` is empty), so that the reasons can
 * be told.
 */
export function readKml(text: string): KmlReading {
  if (text.startsWith('PK')) return { ok: false, reason: 'kmz' };
  const xml = readXml(text);
  if (!xml.ok) {
    return { ok: false, reason: xml.reason === 'malformed' ? 'not-xml' : xml.reason };
  }
  if (xml.root.name !== 'kml') return { ok: false, reason: 'not-kml' };
  const areas: KmlArea[] = [];
  const skipped: KmlSkipped[] = [];
  let others = 0;
  /**
   * The placemarks with a polygon, in the order of the file: with the points of the outer ring
   * to check, or why they are no area.
   */
  const found: (
    { name: string; placemark: XmlElement; polygon: XmlElement; points: LatLon[] } | KmlSkipped
  )[] = [];
  let corners = 0;
  for (const placemark of placemarksOf(xml.root)) {
    const polygons = polygonsOf(placemark);
    const [polygon] = polygons;
    if (!polygon) {
      others++;
      continue;
    }
    if (found.length >= MAX_KML_AREAS) {
      return { ok: false, reason: 'too-many-areas' };
    }
    const name = tidy(childNamed(placemark, 'name')?.text ?? '');
    if (polygons.length > 1) {
      found.push({ name, reason: { kind: 'several-areas' } });
      continue;
    }
    const outer = childNamed(polygon, 'outerBoundaryIs');
    const ring = outer && childNamed(outer, 'LinearRing');
    const coordinates = ring && childNamed(ring, 'coordinates');
    if (!coordinates) {
      found.push({ name, reason: { kind: 'no-outline' } });
      continue;
    }
    const points = pointsOf(coordinates.text);
    const first = points[0];
    const last = points[points.length - 1];
    const closed = first && last && first.lat === last.lat && first.lon === last.lon;
    corners += points.length - (closed && points.length > 1 ? 1 : 0);
    // Counted before any outline is checked: the check is what costs.
    if (corners > MAX_KML_CORNERS) return { ok: false, reason: 'too-many-corners' };
    found.push({ name, placemark, polygon, points });
  }
  for (const one of found) {
    if ('reason' in one) {
      skipped.push(one);
      continue;
    }
    const { name, placemark, polygon, points } = one;
    const outline = tidyOutline(points);
    if (!outline.ok) {
      skipped.push({ name, reason: { kind: 'outline', problem: outline.problem } });
      continue;
    }
    const described = childNamed(placemark, 'description');
    const description = described ? plainDescription(described.text) : '';
    areas.push({
      name,
      description: description === '' ? null : description,
      outline: outline.ring,
      holes: childrenNamed(polygon, 'innerBoundaryIs').length > 0,
    });
  }
  if (areas.length === 0 && skipped.length === 0) return { ok: false, reason: 'no-areas' };
  return { ok: true, areas, skipped, others };
}

/**
 * The text of a file that should be KML, from its bytes. A zip archive (the bytes `PK`) is a
 * KMZ; anything that is not UTF-8 is no text this reader knows.
 */
export function kmlText(
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false; reason: 'kmz' | 'not-text' } {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { ok: false, reason: 'kmz' };
  try {
    // `fatal`: bytes that are no UTF-8 are refused, not replaced. The decoder drops a byte
    // order mark by itself.
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'not-text' };
  }
}

/** Plain text as HTML: what would be read as markup, escaped. */
function htmlText(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

/** Text as the content of an XML element: escaped, and without what XML cannot hold. */
function xmlText(text: string): string {
  let escaped = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x9 && code !== 0xa && code !== 0xd) continue;
    if (code === 0xfffe || code === 0xffff) continue;
    if (char === '&') escaped += '&amp;';
    else if (char === '<') escaped += '&lt;';
    else if (char === '>') escaped += '&gt;';
    else escaped += char;
  }
  return escaped;
}

/**
 * A KML document of named polygons, which `readKml` reads back to the same names, descriptions
 * and outlines: longitude first, the numbers as JavaScript writes them (which it reads back to
 * the very same numbers).
 */
export function writeKml(areas: readonly WrittenArea[]): string {
  return kmlDocument(areas.map(placemarkText));
}

/** What `writeKml` writes of an area. */
type WrittenArea = Pick<KmlArea, 'name' | 'description' | 'outline'>;

/** One area as a placemark of `writeKml`. */
function placemarkText({ name, description, outline }: WrittenArea): string {
  const coordinates = outline.map(({ lat, lon }) => `${lon},${lat},0`).join(' ');
  return [
    '    <Placemark>',
    `      <name>${xmlText(name)}</name>`,
    // The description as HTML (`plainDescription` reads it back), then as XML.
    ...(description === null
      ? []
      : [`      <description>${xmlText(htmlText(description))}</description>`]),
    '      <Polygon>',
    '        <outerBoundaryIs>',
    '          <LinearRing>',
    `            <coordinates>${coordinates}</coordinates>`,
    '          </LinearRing>',
    '        </outerBoundaryIs>',
    '      </Polygon>',
    '    </Placemark>',
  ].join('\n');
}

/** Placemarks as a whole KML document. */
function kmlDocument(placemarks: readonly string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    ...placemarks,
    '  </Document>',
    '</kml>',
    '',
  ].join('\n');
}

/**
 * How large a file of an export may be: Discord takes larger attachments only in servers with
 * boosts.
 */
export const MAX_KML_FILE_BYTES = 8_000_000;

/** The corners of an outline as `readKml` counts them: the closing point is none. */
function cornersOf(outline: readonly LatLon[]): number {
  const first = outline[0];
  const last = outline[outline.length - 1];
  const closed =
    outline.length > 1 && first && last && first.lat === last.lat && first.lon === last.lon;
  return outline.length - (closed ? 1 : 0);
}

/**
 * Areas as KML files (`writeKml`) that `readKml` reads again whole: in the order given, a new
 * file is begun whenever the next area would make one hold more than `MAX_KML_AREAS` areas,
 * more than `MAX_KML_CORNERS` corners or more than `maxBytes` bytes of UTF-8. No areas, no file.
 */
export function kmlFiles(areas: readonly WrittenArea[], maxBytes = MAX_KML_FILE_BYTES): string[] {
  const bytes = (text: string): number => new TextEncoder().encode(text).length;
  // The document without placemarks, and the line break each placemark adds.
  const frame = bytes(kmlDocument([]));
  const files: string[] = [];
  let placemarks: string[] = [];
  let corners = 0;
  let size = frame;
  for (const area of areas) {
    const placemark = placemarkText(area);
    const its = { corners: cornersOf(area.outline), size: bytes(placemark) + 1 };
    const full =
      placemarks.length >= MAX_KML_AREAS ||
      corners + its.corners > MAX_KML_CORNERS ||
      size + its.size > maxBytes;
    if (placemarks.length > 0 && full) {
      files.push(kmlDocument(placemarks));
      placemarks = [];
      corners = 0;
      size = frame;
    }
    placemarks.push(placemark);
    corners += its.corners;
    size += its.size;
  }
  if (placemarks.length > 0) files.push(kmlDocument(placemarks));
  return files;
}
