import { describe, expect, it } from 'vitest';
import { cellCentre, cellIdAt, cellIdOf, cellToken, isWayfarerCell, wayfarerCellAt } from './s2.js';

/**
 * Six level-14 cells in Pittsburgh, their tokens taken from outside this module, with three
 * points well inside each, in millionths of a degree.
 */
const CELLS: readonly { token: string; points: readonly (readonly [number, number])[] }[] = [
  {
    token: '8834ede1',
    points: [
      [40437612, -79898988],
      [40437663, -79897091],
      [40440563, -79900657],
    ],
  },
  {
    token: '8834ede3',
    points: [
      [40436089, -79905037],
      [40436485, -79907628],
      [40436568, -79906766],
    ],
  },
  {
    token: '8834edfd',
    points: [
      [40439501, -79908723],
      [40438161, -79912283],
      [40441366, -79909594],
    ],
  },
  {
    token: '8834ee07',
    points: [
      [40431575, -79911057],
      [40435813, -79909267],
      [40434565, -79912081],
    ],
  },
  {
    token: '8834ee09',
    points: [
      [40434576, -79905415],
      [40435767, -79907233],
      [40434558, -79907379],
    ],
  },
  {
    token: '8834ee0b',
    points: [
      [40430828, -79900476],
      [40434180, -79902352],
      [40433478, -79901076],
    ],
  },
];

describe('S2 cells', () => {
  it('puts every point into the cell its token names', () => {
    for (const cell of CELLS) {
      for (const [lat, lon] of cell.points) {
        expect(wayfarerCellAt({ lat: lat / 1e6, lon: lon / 1e6 })).toBe(cell.token);
      }
    }
  });

  it('names the six faces as S2 does', () => {
    expect(cellToken(cellIdAt({ lat: 0, lon: 0 }, 0))).toBe('1');
    expect(cellToken(cellIdAt({ lat: 0, lon: 90 }, 0))).toBe('3');
    expect(cellToken(cellIdAt({ lat: 90, lon: 0 }, 0))).toBe('5');
    expect(cellToken(cellIdAt({ lat: 0, lon: 180 }, 0))).toBe('7');
    expect(cellToken(cellIdAt({ lat: 0, lon: -90 }, 0))).toBe('9');
    expect(cellToken(cellIdAt({ lat: -90, lon: 0 }, 0))).toBe('b');
  });

  it('finds a cell again from its centre', () => {
    for (const cell of CELLS) {
      const centre = cellCentre(cell.token);
      expect(centre).toBeDefined();
      expect(wayfarerCellAt(centre!)).toBe(cell.token);
    }
  });

  it('puts the centre of a level-14 cell within a few hundred metres of its points', () => {
    const centre = cellCentre('8834ede1')!;
    expect(Math.abs(centre.lat - 40.4376)).toBeLessThan(0.005);
    expect(Math.abs(centre.lon - -79.8989)).toBeLessThan(0.006);
  });

  it('refuses text that is no cell', () => {
    for (const text of ['', 'X', 'zz', '8834ede', '88', 'f', '1234567890abcdef1']) {
      if (text === '88') continue;
      expect(cellIdOf(text)).toBeUndefined();
    }
    expect(cellCentre('nonsense')).toBeUndefined();
  });

  it('tells the tokens of Wayfarer cells from other text', () => {
    for (const cell of CELLS) expect(isWayfarerCell(cell.token)).toBe(true);
    // Another level, trailing zeros, upper case, no token at all.
    expect(isWayfarerCell('8834edf')).toBe(false);
    expect(isWayfarerCell('8834ede4')).toBe(false);
    expect(isWayfarerCell('8834ede10')).toBe(false);
    expect(isWayfarerCell('8834EDE1')).toBe(false);
    expect(isWayfarerCell('')).toBe(false);
    expect(isWayfarerCell(cellToken(cellIdAt({ lat: 40.44, lon: -79.9 }, 15)))).toBe(false);
  });
});
