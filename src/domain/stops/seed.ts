import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { tidyLine } from '../gyms/gym-text.js';
import { MAX_PINE_STOP_NAME } from './pine-stop.js';

/**
 * The stops of Pine's own seeded from a file (`npm run stops:seed`, `./pine seed-stops`; a
 * follow-up of plan 8R-1): a CSV of sponsored stops, one a row, with the columns `SEED_COLUMNS`.
 * Only `name`, `lat` and `lon` make the stop; `id` (the export's), `region` (the channel's name)
 * and `basis` (why it is thought sponsored) are the file's notes, read and shown, never kept.
 */
export const SEED_COLUMNS = ['id', 'name', 'lat', 'lon', 'region', 'basis'] as const;

/** A row of the file, by the line it starts on. */
export interface SeedRow {
  line: number;
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  basis: string;
}

/** What a file holds: the rows it could read, and why it could not read the others. */
export interface SeedFile {
  rows: SeedRow[];
  problems: string[];
}

/** A CSV record (RFC 4180: quoted fields, `""` for a quote, line breaks inside quotes). */
export interface CsvRecord {
  line: number;
  fields: string[];
}

export function csvRecords(text: string): CsvRecord[] {
  const found: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const end = () => {
    fields.push(field);
    // A blank line is no record.
    if (fields.length > 1 || fields[0] !== '') found.push({ line: start, fields });
    fields = [];
    field = '';
  };
  for (let at = 0; at < text.length; at++) {
    const character = text[at];
    if (quoted) {
      if (character === '"' && text[at + 1] === '"') {
        field += '"';
        at++;
      } else if (character === '"') quoted = false;
      else {
        if (character === '\n') line++;
        field += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      fields.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[at + 1] === '\n') at++;
      end();
      line++;
      start = line;
    } else field += character;
  }
  if (field !== '' || fields.length > 0) end();
  return found;
}

/** A number of the file within its bounds, or undefined. */
export function seedCoordinate(text: string, limit: number): number | undefined {
  const trimmed = text.trim();
  if (!/^[-+]?\d+(\.\d+)?$/u.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Math.abs(value) <= limit ? value : undefined;
}

/** Reads the file of stops: the rows it can read, and a line for each it cannot. */
export function readSeedCsv(text: string): SeedFile {
  const [header, ...rest] = csvRecords(text.replace(/^\uFEFF/u, ''));
  const names = header?.fields.map((one) => one.trim().toLowerCase());
  if (names?.join(',') !== SEED_COLUMNS.join(',')) {
    return {
      rows: [],
      problems: [`The first line must name the columns: ${SEED_COLUMNS.join(',')}`],
    };
  }
  const rows: SeedRow[] = [];
  const problems: string[] = [];
  for (const { line, fields } of rest) {
    const problem = (why: string) => problems.push(`line ${String(line)}: ${why}`);
    if (fields.length !== SEED_COLUMNS.length) {
      problem(`${String(fields.length)} columns, not ${String(SEED_COLUMNS.length)}`);
      continue;
    }
    const [id = '', typed = '', latText = '', lonText = '', region = '', basis = ''] = fields;
    const name = tidyLine(typed);
    const lat = seedCoordinate(latText, 90);
    const lon = seedCoordinate(lonText, 180);
    if (name === '') problem('no name');
    else if (name.length > MAX_PINE_STOP_NAME) {
      problem(`the name is longer than ${String(MAX_PINE_STOP_NAME)} characters`);
    } else if (lat === undefined) problem('the latitude must be a number from -90 to 90');
    else if (lon === undefined) problem('the longitude must be a number from -180 to 180');
    else {
      rows.push({
        line,
        id: id.trim(),
        name,
        lat,
        lon,
        region: region.trim(),
        basis: tidyLine(basis),
      });
    }
  }
  return { rows, problems };
}

/** What the seed knows of a server's places. */
export interface SeedPlace {
  /** The regions of the server a point lies in (by any name that tells them apart). */
  regionsAt(point: LatLon): string[];
  /** The nearest known stop within the seed's distance (imported, or the server's own), if any. */
  nearestStop(point: LatLon): { name: string; metres: number } | undefined;
}

/** What becomes of a row: added, or skipped (outside every region, or beside a stop). */
export type SeedOutcome =
  | { kind: 'add'; row: SeedRow; regions: string[] }
  | { kind: 'outside'; row: SeedRow }
  | { kind: 'near'; row: SeedRow; stop: string; metres: number };

/**
 * What the seed does with each row, in order: a row outside every region of the server is
 * skipped, and so is one within `nearMetres` of a known stop, or one with the id of a row added
 * before it (a stop listed twice; a row without an id: one within `nearMetres` of such a row).
 * So a second run adds nothing: what the first added is a known stop.
 */
export function planSeed(
  rows: readonly SeedRow[],
  place: SeedPlace,
  nearMetres: number,
): SeedOutcome[] {
  const added: SeedRow[] = [];
  return rows.map((row): SeedOutcome => {
    const regions = place.regionsAt(row);
    if (regions.length === 0) return { kind: 'outside', row };
    const known = place.nearestStop(row);
    if (known) return { kind: 'near', row, stop: known.name, metres: Math.round(known.metres) };
    // A row listed twice has the same id; rows with ids of their own are places of their own,
    // however close (two sponsored stops at one store or mall). Only a row without an id is
    // taken for one beside it.
    const twin = added
      .map((other) => ({ other, metres: metresBetween(other, row) }))
      .filter(({ other, metres }) => (row.id === '' ? metres <= nearMetres : other.id === row.id))
      .sort((a, b) => a.metres - b.metres)[0];
    if (twin) {
      return {
        kind: 'near',
        row,
        stop: `${twin.other.name} (line ${String(twin.other.line)} of this file)`,
        metres: Math.round(twin.metres),
      };
    }
    added.push(row);
    return { kind: 'add', row, regions };
  });
}
