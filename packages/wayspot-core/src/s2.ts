import type { LatLon } from './lat-lon.js';

/**
 * S2 cells, as Google's S2 geometry numbers the sphere: six cube faces, each cut into four
 * along a Hilbert curve, level after level. A Wayspot export counts by cells of level 14 (about
 * 0.3 km² each), each named by its token (`8834edf9`), so whether a place was covered by an
 * export is whether the token of its level-14 cell is among the export's cells.
 *
 * Only what Pine needs: the cell of a point, and the centre of a cell. Checked
 * against known cells (`s2.test.ts`).
 */

/** The deepest level: cells of about a square centimetre. */
const MAX_LEVEL = 30;
const MAX_SIZE = 1 << MAX_LEVEL;

/** The level of the cells of a Wayspot export. */
export const WAYFARER_CELL_LEVEL = 14;

/** Hilbert curve: the position of a sub-square (i bit, j bit) by orientation. */
const IJ_TO_POS = [
  [0, 1, 3, 2],
  [0, 3, 1, 2],
  [2, 3, 1, 0],
  [2, 1, 3, 0],
] as const;
/** Hilbert curve: the sub-square (i bit << 1 | j bit) at a position, by orientation. */
const POS_TO_IJ = [
  [0, 1, 3, 2],
  [0, 2, 3, 1],
  [3, 2, 0, 1],
  [3, 1, 0, 2],
] as const;
/** How the orientation changes after a position. */
const POS_TO_ORIENTATION = [1, 0, 0, 3] as const;

type Xyz = readonly [number, number, number];

function toXyz(point: LatLon): Xyz {
  const lat = (point.lat * Math.PI) / 180;
  const lon = (point.lon * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

function faceOf([x, y, z]: Xyz): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  const axis = ax > ay ? (ax > az ? 0 : 2) : ay > az ? 1 : 2;
  const value = axis === 0 ? x : axis === 1 ? y : z;
  return value < 0 ? axis + 3 : axis;
}

function faceUv(face: number, [x, y, z]: Xyz): [number, number] {
  switch (face) {
    case 0:
      return [y / x, z / x];
    case 1:
      return [-x / y, z / y];
    case 2:
      return [-x / z, -y / z];
    case 3:
      return [z / x, y / x];
    case 4:
      return [z / y, -x / y];
    default:
      return [-y / z, -x / z];
  }
}

function faceXyz(face: number, u: number, v: number): Xyz {
  switch (face) {
    case 0:
      return [1, u, v];
    case 1:
      return [-u, 1, v];
    case 2:
      return [-u, -v, 1];
    case 3:
      return [-1, -v, -u];
    case 4:
      return [v, -1, -u];
    default:
      return [v, u, -1];
  }
}

/** S2's quadratic projection from u or v to s or t (both in [0, 1]). */
function uvToSt(u: number): number {
  return u >= 0 ? 0.5 * Math.sqrt(1 + 3 * u) : 1 - 0.5 * Math.sqrt(1 - 3 * u);
}

function stToUv(s: number): number {
  return s >= 0.5 ? (4 * s * s - 1) / 3 : (1 - 4 * (1 - s) * (1 - s)) / 3;
}

function stToIj(s: number): number {
  return Math.max(0, Math.min(MAX_SIZE - 1, Math.floor(s * MAX_SIZE)));
}

/** The id of the cell of `level` (0 to 30) that a point lies in. */
export function cellIdAt(point: LatLon, level: number): bigint {
  const xyz = toXyz(point);
  const face = faceOf(xyz);
  const [u, v] = faceUv(face, xyz);
  const i = stToIj(uvToSt(u));
  const j = stToIj(uvToSt(v));
  let orientation = face & 1;
  let pos = 0n;
  for (let k = MAX_LEVEL - 1; k >= 0; k--) {
    const ij = (((i >> k) & 1) << 1) | ((j >> k) & 1);
    const step = IJ_TO_POS[orientation]![ij]!;
    pos = (pos << 2n) | BigInt(step);
    orientation ^= POS_TO_ORIENTATION[step];
  }
  const leaf = (BigInt(face) << 61n) | (pos << 1n) | 1n;
  return parentAt(leaf, level);
}

/** The cell of `level` that a cell of level 30 lies in. */
function parentAt(leaf: bigint, level: number): bigint {
  const lsb = 1n << BigInt(2 * (MAX_LEVEL - level));
  return (leaf & -lsb) | lsb;
}

/** A cell id as S2 writes it short: hexadecimal without the trailing zeros. */
export function cellToken(id: bigint): string {
  const hex = id.toString(16).padStart(16, '0').replace(/0+$/, '');
  return hex === '' ? 'X' : hex;
}

/** The id a token stands for; undefined for text that is no token. */
export function cellIdOf(token: string): bigint | undefined {
  if (!/^[0-9a-f]{1,16}$/.test(token)) return undefined;
  const id = BigInt(`0x${token.padEnd(16, '0')}`);
  return id === 0n || levelOf(id) === undefined ? undefined : id;
}

/** The level of a cell id: where its lowest set bit is. */
function levelOf(id: bigint): number | undefined {
  if (id >> 61n > 5n) return undefined;
  let lsb = 0;
  while (((id >> BigInt(lsb)) & 1n) === 0n) lsb++;
  return lsb % 2 === 0 ? MAX_LEVEL - lsb / 2 : undefined;
}

/**
 * Whether a text is the token of a cell of Wayfarer's level, written as S2 writes it (lower
 * case, without trailing zeros): what an export's lists of cells must hold.
 */
export function isWayfarerCell(token: string): boolean {
  const id = cellIdOf(token);
  return id !== undefined && levelOf(id) === WAYFARER_CELL_LEVEL && cellToken(id) === token;
}

/** The token of the cell of Wayfarer's level that a point lies in. */
export function wayfarerCellAt(point: LatLon): string {
  return cellToken(cellIdAt(point, WAYFARER_CELL_LEVEL));
}

/** Where a cell lies on its face: its face, its lowest i and j at level 30, and its size there. */
interface FacePlace {
  face: number;
  i: number;
  j: number;
  size: number;
}

/** The place of a cell on its face, or undefined for a token that names no cell. */
function facePlace(token: string): FacePlace | undefined {
  const id = cellIdOf(token);
  if (id === undefined) return undefined;
  const level = levelOf(id)!;
  const face = Number(id >> 61n);
  let orientation = face & 1;
  let i = 0;
  let j = 0;
  for (let k = 0; k < level; k++) {
    const step = Number((id >> BigInt(59 - 2 * k)) & 3n);
    const ij = POS_TO_IJ[orientation]![step]!;
    i = (i << 1) | (ij >> 1);
    j = (j << 1) | (ij & 1);
    orientation ^= POS_TO_ORIENTATION[step]!;
  }
  const size = 1 << (MAX_LEVEL - level);
  return { face, i: i * size, j: j * size, size };
}

/** The point of a face at s and t (both in [0, 1]). */
function pointAt(face: number, s: number, t: number): LatLon {
  const [x, y, z] = faceXyz(face, stToUv(s), stToUv(t));
  return {
    lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    lon: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

/** The centre of a cell, or undefined for a token that names no cell. */
export function cellCentre(token: string): LatLon | undefined {
  const place = facePlace(token);
  if (!place) return undefined;
  const { face, i, j, size } = place;
  return pointAt(face, (i + size / 2) / MAX_SIZE, (j + size / 2) / MAX_SIZE);
}
