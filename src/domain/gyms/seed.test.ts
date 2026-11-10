import { describe, expect, it } from 'vitest';
import { GYM_SEED_COLUMNS, planGymSeed, readGymSeedCsv, type GymSeedGym } from './seed.js';

const HEADER = GYM_SEED_COLUMNS.join(',');

const gym = (over: Partial<GymSeedGym> = {}): GymSeedGym => ({
  id: 7,
  name: 'Coffee',
  lat: 40,
  lon: -80,
  pogoId: 'abc.16',
  marked: false,
  ...over,
});

describe('reading the file of sponsored gyms', () => {
  it('reads a row naming a gym and a row to add, with a BOM and Windows line ends', () => {
    const { rows, problems } = readGymSeedCsv(
      `\uFEFF${HEADER}\r\n7,,Coffee,40,-80,#west,brand\r\n,abc.16,"Tea, Bar",40.5,-80.5,#east,ruled\r\n`,
    );
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        gym: 7,
        id: '',
        name: 'Coffee',
        lat: 40,
        lon: -80,
        region: '#west',
        basis: 'brand',
      },
      {
        line: 3,
        gym: null,
        id: 'abc.16',
        name: 'Tea, Bar',
        lat: 40.5,
        lon: -80.5,
        region: '#east',
        basis: 'ruled',
      },
    ]);
  });

  it('says why it cannot read a row', () => {
    const { rows, problems } = readGymSeedCsv(
      [
        HEADER,
        ',,No Id,40,-80,,',
        'x,,Bad Gym,40,-80,,',
        '7,,,40,-80,,',
        '7,,Bad Lat,north,-80,,',
        '7,,Bad Lon,40,east,,',
        '7,,Short',
        `7,,${'x'.repeat(300)},40,-80,,`,
      ].join('\n'),
    );
    expect(rows).toEqual([]);
    expect(problems).toEqual([
      'line 2: neither a gym nor an id',
      'line 3: the gym must be a number',
      'line 4: no name',
      'line 5: the latitude must be a number from -90 to 90',
      'line 6: the longitude must be a number from -180 to 180',
      'line 7: 3 columns, not 7',
      expect.stringMatching(/^line 8: the name is longer than \d+ characters$/u),
    ]);
  });

  it('wants the columns named', () => {
    expect(readGymSeedCsv('id,name,lat,lon,region,basis\n').problems).toEqual([
      `The first line must name the columns: ${HEADER}`,
    ]);
  });
});

describe('what becomes of a row', () => {
  const row = (over: Partial<Parameters<typeof planGymSeed>[0][number]> = {}) => ({
    line: 2,
    gym: null,
    id: 'new.16',
    name: 'New',
    lat: 40.01,
    lon: -80,
    region: '',
    basis: '',
    ...over,
  });
  const inRegion = () => ['west'];

  it('marks the gym a row names, or says it is marked', () => {
    const named = row({ gym: 7, id: '', lat: 40, lon: -80 });
    expect(planGymSeed([named], { gyms: [gym()], regionsAt: inRegion }, 10)[0]?.kind).toBe('mark');
    expect(
      planGymSeed([named], { gyms: [gym({ marked: true })], regionsAt: inRegion }, 10)[0]?.kind,
    ).toBe('marked');
  });

  it('takes a gym that holds the id for the row, wherever a run left it', () => {
    const again = row({ id: 'abc.16' });
    expect(planGymSeed([again], { gyms: [gym()], regionsAt: () => [] }, 10)[0]?.kind).toBe('mark');
  });

  it('marks a named gym outside every region: the region says where to add, not what to mark', () => {
    const named = row({ gym: 7, id: '', lat: 40, lon: -80 });
    expect(planGymSeed([named], { gyms: [gym()], regionsAt: () => [] }, 10)[0]?.kind).toBe('mark');
  });

  it('refuses a named gym that is not there, or lies more than 100 m from the row', () => {
    expect(
      planGymSeed([row({ gym: 8, id: '' })], { gyms: [gym()], regionsAt: inRegion }, 10)[0]?.kind,
    ).toBe('no-gym');
    expect(
      planGymSeed([row({ gym: 7, id: '' })], { gyms: [gym()], regionsAt: inRegion }, 10)[0],
    ).toMatchObject({ kind: 'far', metres: 1112 });
  });

  it('adds a row in a region clear of gyms, and only there', () => {
    expect(planGymSeed([row()], { gyms: [gym()], regionsAt: inRegion }, 10)[0]).toMatchObject({
      kind: 'add',
      regions: ['west'],
    });
    expect(planGymSeed([row()], { gyms: [gym()], regionsAt: () => [] }, 10)[0]?.kind).toBe(
      'outside',
    );
  });

  it('stands no gym on a gym or on a row added before it', () => {
    const beside = row({ lat: 40.00005 });
    expect(planGymSeed([beside], { gyms: [gym()], regionsAt: inRegion }, 10)[0]).toMatchObject({
      kind: 'near',
      gym: 'Coffee',
      metres: 6,
    });
    const plan = planGymSeed(
      [row(), row({ line: 3, id: 'other.16', lat: 40.01005 })],
      { gyms: [], regionsAt: inRegion },
      10,
    );
    expect(plan[1]).toMatchObject({ kind: 'near', gym: 'New (line 2 of this file)', metres: 6 });
  });
});
