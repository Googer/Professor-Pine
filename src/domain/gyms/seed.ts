import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { csvRecords, seedCoordinate } from '../stops/seed.js';
import { GYM_TEXT_LIMITS, tidyLine } from './gym-text.js';

/**
 * The sponsored gyms seeded from a file (`npm run gyms:seed`, `./pine seed-gyms`), before a
 * server's first Wayfarer import: a CSV, one gym a row, with the columns `GYM_SEED_COLUMNS`. A
 * row with `gym` (a gym's number) marks that gym "not in Wayfarer"; a row without adds a gym
 * with `id` as its `pogoId`, and marks it. `region` and `basis` are the file's notes.
 */
export const GYM_SEED_COLUMNS = ['gym', 'id', 'name', 'lat', 'lon', 'region', 'basis'] as const;

/** How far from a row's place the gym it names may lie: further, and the file has it wrong. */
export const GYM_SEED_SAME_METRES = 100;

/** A row of the file, by the line it starts on. */
export interface GymSeedRow {
  line: number;
  /** The gym it names, or null for a gym to add. */
  gym: number | null;
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  basis: string;
}

/** What a file holds: the rows it could read, and why it could not read the others. */
export interface GymSeedFile {
  rows: GymSeedRow[];
  problems: string[];
}

/** Reads the file of gyms: the rows it can read, and a line for each it cannot. */
export function readGymSeedCsv(text: string): GymSeedFile {
  const [header, ...rest] = csvRecords(text.replace(/^\uFEFF/u, ''));
  const names = header?.fields.map((one) => one.trim().toLowerCase());
  if (names?.join(',') !== GYM_SEED_COLUMNS.join(',')) {
    return {
      rows: [],
      problems: [`The first line must name the columns: ${GYM_SEED_COLUMNS.join(',')}`],
    };
  }
  const rows: GymSeedRow[] = [];
  const problems: string[] = [];
  for (const { line, fields } of rest) {
    const problem = (why: string) => problems.push(`line ${String(line)}: ${why}`);
    if (fields.length !== GYM_SEED_COLUMNS.length) {
      problem(`${String(fields.length)} columns, not ${String(GYM_SEED_COLUMNS.length)}`);
      continue;
    }
    const [
      gymText = '',
      idText = '',
      typed = '',
      latText = '',
      lonText = '',
      region = '',
      basis = '',
    ] = fields;
    const gymTrimmed = gymText.trim();
    const id = idText.trim();
    const name = tidyLine(typed);
    const lat = seedCoordinate(latText, 90);
    const lon = seedCoordinate(lonText, 180);
    if (gymTrimmed !== '' && !/^[1-9]\d*$/u.test(gymTrimmed)) problem('the gym must be a number');
    else if (gymTrimmed === '' && id === '') problem('neither a gym nor an id');
    else if (name === '') problem('no name');
    else if (name.length > GYM_TEXT_LIMITS.name) {
      problem(`the name is longer than ${String(GYM_TEXT_LIMITS.name)} characters`);
    } else if (lat === undefined) problem('the latitude must be a number from -90 to 90');
    else if (lon === undefined) problem('the longitude must be a number from -180 to 180');
    else {
      rows.push({
        line,
        gym: gymTrimmed === '' ? null : Number(gymTrimmed),
        id,
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

/** What the seed needs of a gym. */
export interface GymSeedGym extends LatLon {
  id: number;
  name: string;
  pogoId: string | null;
  /** Whether it is marked "not in Wayfarer" already. */
  marked: boolean;
}

/** What the seed knows of a server. */
export interface GymSeedPlace {
  gyms: readonly GymSeedGym[];
  /** The regions of the server a point lies in (by any name that tells them apart). */
  regionsAt(point: LatLon): string[];
}

/**
 * What becomes of a row: its gym marked (or marked already), a gym added, or skipped (outside
 * every region, or beside a gym); `no-gym` and `far` are a file that names the wrong gym.
 */
export type GymSeedOutcome =
  | { kind: 'mark'; row: GymSeedRow; gym: GymSeedGym }
  | { kind: 'marked'; row: GymSeedRow; gym: GymSeedGym }
  | { kind: 'add'; row: GymSeedRow; regions: string[] }
  | { kind: 'outside'; row: GymSeedRow }
  | { kind: 'near'; row: GymSeedRow; gym: string; metres: number }
  | { kind: 'no-gym'; row: GymSeedRow }
  | { kind: 'far'; row: GymSeedRow; gym: GymSeedGym; metres: number };

/**
 * What the seed does with each row, in order. A row that names a gym marks it. A row whose `id`
 * a gym holds is that gym (so a second run adds nothing, and marks what a failed run did not).
 * The rest is added, unless it lies outside every region or within `nearMetres` of a gym or of a
 * row added before it: as `/gym add`, it does not stand one gym on another.
 */
export function planGymSeed(
  rows: readonly GymSeedRow[],
  place: GymSeedPlace,
  nearMetres: number,
): GymSeedOutcome[] {
  const added: GymSeedRow[] = [];
  return rows.map((row): GymSeedOutcome => {
    const named =
      row.gym === null
        ? place.gyms.find((gym) => gym.pogoId === row.id)
        : place.gyms.find((gym) => gym.id === row.gym);
    if (row.gym !== null && !named) return { kind: 'no-gym', row };
    if (named) {
      const metres = metresBetween(named, row);
      if (row.gym !== null && metres > GYM_SEED_SAME_METRES) {
        return { kind: 'far', row, gym: named, metres: Math.round(metres) };
      }
      return { kind: named.marked ? 'marked' : 'mark', row, gym: named };
    }
    const regions = place.regionsAt(row);
    if (regions.length === 0) return { kind: 'outside', row };
    const nearest = [
      ...place.gyms.map((gym) => ({ name: gym.name, metres: metresBetween(gym, row) })),
      ...added.map((other) => ({
        name: `${other.name} (line ${String(other.line)} of this file)`,
        metres: metresBetween(other, row),
      })),
    ]
      .filter(({ metres }) => metres <= nearMetres)
      .sort((a, b) => a.metres - b.metres)[0];
    if (nearest) {
      return { kind: 'near', row, gym: nearest.name, metres: Math.round(nearest.metres) };
    }
    added.push(row);
    return { kind: 'add', row, regions };
  });
}
