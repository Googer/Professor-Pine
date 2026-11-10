import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { describe, expect, it } from 'vitest';
import { planSeed, readSeedCsv, type SeedPlace } from './seed.js';

const HEADER = 'id,name,lat,lon,region,basis';

describe('readSeedCsv', () => {
  it('reads the rows of the file, quoted fields and Windows line ends included', () => {
    const text =
      `\uFEFF${HEADER}\r\n` +
      'a1.16,Corner Café,40.05,-80.05,#west,local business\r\n' +
      '\r\n' +
      'b2,"Smith, Jones & ""Sons""",40.06,-80.04,#west,"brand name; sponsored"\r\n';
    expect(readSeedCsv(text)).toEqual({
      rows: [
        {
          line: 2,
          id: 'a1.16',
          name: 'Corner Café',
          lat: 40.05,
          lon: -80.05,
          region: '#west',
          basis: 'local business',
        },
        {
          line: 4,
          id: 'b2',
          name: 'Smith, Jones & "Sons"',
          lat: 40.06,
          lon: -80.04,
          region: '#west',
          basis: 'brand name; sponsored',
        },
      ],
      problems: [],
    });
  });

  it('refuses a file whose first line is not the columns it reads', () => {
    expect(readSeedCsv('name,lat,lon\nCafé,40,-80\n')).toEqual({
      rows: [],
      problems: [`The first line must name the columns: ${HEADER}`],
    });
  });

  it('passes over a row it cannot read, saying why, and reads the others', () => {
    const text = [
      HEADER,
      'a1,Corner Café,40.05,-80.05,#west,x',
      'a2,,40.05,-80.05,#west,x',
      'a3,Far Away,95,-80.05,#west,x',
      'a4,No Longitude,40.05,east,#west,x',
      'a5,Too Few,40.05',
      `a6,${'N'.repeat(101)},40.05,-80.05,#west,x`,
    ].join('\n');
    const read = readSeedCsv(text);
    expect(read.rows.map((row) => row.id)).toEqual(['a1']);
    expect(read.problems).toEqual([
      'line 3: no name',
      'line 4: the latitude must be a number from -90 to 90',
      'line 5: the longitude must be a number from -180 to 180',
      'line 6: 3 columns, not 6',
      'line 7: the name is longer than 100 characters',
    ]);
  });

  it('tidies a name: its white space as one line', () => {
    const [row] = readSeedCsv(`${HEADER}\na1,"  Corner \n Café ",40,-80,#w,x`).rows;
    expect(row?.name).toBe('Corner Café');
  });
});

describe('planSeed', () => {
  /** West's square (40.0–40.1, -80.1 to -80.0), one known stop at (40.05, -80.05). */
  const place: SeedPlace = {
    regionsAt: (point: LatLon) =>
      point.lat > 40 && point.lat < 40.1 && point.lon > -80.1 && point.lon < -80 ? ['west'] : [],
    nearestStop: (point: LatLon) => {
      const metres = Math.abs(point.lat - 40.05) * 111_000 + Math.abs(point.lon + 80.05) * 85_000;
      return metres <= 30 ? { name: 'Fountain Stop', metres } : undefined;
    },
  };
  const row = (n: number, lat: number, lon: number) => ({
    line: n + 1,
    id: `a${String(n)}`,
    name: `Stop ${String(n)}`,
    lat,
    lon,
    region: '#west',
    basis: 'x',
  });

  it('adds a row in a region with no stop near, and skips one outside or beside a known stop', () => {
    const plan = planSeed(
      [row(1, 40.07, -80.07), row(2, 40.5, -80.07), row(3, 40.0501, -80.05)],
      place,
      30,
    );
    expect(plan).toEqual([
      { kind: 'add', row: row(1, 40.07, -80.07), regions: ['west'] },
      { kind: 'outside', row: row(2, 40.5, -80.07) },
      { kind: 'near', row: row(3, 40.0501, -80.05), stop: 'Fountain Stop', metres: 11 },
    ]);
  });

  it('skips a row the same file lists before it, by its id wherever it is', () => {
    const again = { ...row(2, 40.08, -80.07), id: 'a1' };
    const plan = planSeed([row(1, 40.07, -80.07), again], place, 30);
    expect(plan.map((one) => one.kind)).toEqual(['add', 'near']);
    expect(plan[1]).toMatchObject({ stop: 'Stop 1 (line 2 of this file)', metres: 1112 });
  });

  it('adds a row beside another of the file with an id of its own (two stops at one store)', () => {
    // Pittsburgh's seed of 2026-11-09 skipped four second Walmart stops and the LEGO Store beside
    // a Starbucks this way: sponsored stops of one store or mall stand a few meters apart.
    const plan = planSeed([row(1, 40.07, -80.07), row(2, 40.0701, -80.07)], place, 30);
    expect(plan.map((one) => one.kind)).toEqual(['add', 'add']);
  });

  it('skips a row without an id beside one the same file adds before it', () => {
    const plan = planSeed(
      [row(1, 40.07, -80.07), { ...row(2, 40.0701, -80.07), id: '' }],
      place,
      30,
    );
    expect(plan.map((one) => one.kind)).toEqual(['add', 'near']);
    expect(plan[1]).toMatchObject({ stop: 'Stop 1 (line 2 of this file)', metres: 11 });
  });
});
