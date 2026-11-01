import { describe, expect, it } from 'vitest';
import { gymsTsv, TSV_HEADER } from './gym-export.js';

const gym = (id: number, name: string, lat = 40.5, lon = -80.25) => ({ id, name, lat, lon });

describe('gymsTsv', () => {
  it('writes the header and one line per gym, longitude before latitude', () => {
    expect(gymsTsv([gym(1, 'Big Fountain', 40.4406, -79.9959)])).toBe(
      'Gym Name\tLongitude\tLatitude\nBig Fountain\t-79.9959\t40.4406\n',
    );
  });

  it('writes only the header for no gyms', () => {
    expect(gymsTsv([])).toBe(`${TSV_HEADER}\n`);
  });

  it('sorts by name, and gyms of one name by id', () => {
    const lines = gymsTsv([
      gym(9, 'Starbucks', 1, 1),
      gym(5, 'Starbucks', 2, 2),
      gym(3, 'old stone fountain'),
      gym(4, 'Café Élan'),
      gym(7, 'Cafe Luna'),
    ])
      .trimEnd()
      .split('\n')
      .slice(1);
    expect(lines.map((line) => line.split('\t')[0])).toEqual([
      'Café Élan',
      'Cafe Luna',
      'old stone fountain',
      'Starbucks',
      'Starbucks',
    ]);
    expect(lines[3]).toBe('Starbucks\t2\t2');
  });

  it('keeps a name in its cell and on its line', () => {
    const [, line] = gymsTsv([gym(1, ' The "Old"\tMill\r\nby the\n\nriver ')]).split('\n');
    expect(line).toBe("The 'Old' Mill by the river\t-80.25\t40.5");
  });

  it('makes a space of every other control character too, and leaves a leading sign alone', () => {
    const [, line] = gymsTsv([gym(1, 'Old\u0000Mill\u001b[0m\u0085End')]).split('\n');
    expect(line).toBe('Old Mill [0m End\t-80.25\t40.5');
    const [, formula] = gymsTsv([gym(1, '=SUM(A1)')]).split('\n');
    expect(formula).toBe('=SUM(A1)\t-80.25\t40.5');
  });

  it('does not turn the input around', () => {
    const gyms = [gym(2, 'B'), gym(1, 'A')];
    gymsTsv(gyms);
    expect(gyms.map((one) => one.id)).toEqual([2, 1]);
  });
});
