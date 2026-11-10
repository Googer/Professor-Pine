import { describe, expect, it } from 'vitest';
import { decideRocket, rocketDay } from './reports.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const NOW = at('2026-10-22T12:00');

/** What stands at the stop, as far as the decision looks at it. */
const standing = (subjectKey: string, endsAt: number, id = 7, lineup?: string) => ({
  id,
  kind: 'rocket' as const,
  subjectKey,
  endsAt,
  ...(lineup === undefined ? {} : { rocket: { lineup } }),
});

/** A new report of `subjectKey`, of a lineup whose first slot in short is `lineup`. */
const who = (subjectKey: string, lineup?: string) => ({
  subjectKey,
  ...(lineup === undefined ? {} : { rocket: { lineup } }),
});

describe('decideRocket', () => {
  it('reports at a stop with nothing standing, or only what has ended', () => {
    expect(decideRocket(undefined, who('grunt:water'), NOW)).toBe('report');
    expect(decideRocket(standing('grunt:water', NOW), who('grunt:water'), NOW)).toBe('report');
    expect(decideRocket(standing('leader:arlo', NOW - 1), who('grunt:water'), NOW)).toBe('report');
  });

  it('answers the same grunt standing as reported already, another grunt replaces it', () => {
    expect(decideRocket(standing('grunt:water', NOW + 1), who('grunt:water'), NOW)).toBe('already');
    expect(decideRocket(standing('grunt:none', NOW + 1), who('grunt:water'), NOW)).toBe('report');
  });

  it('decides two lineups of one grunt type and "not sure which" (plan 8R-4L)', () => {
    const stands = (key: string) => standing(key, NOW + 1);
    // Not sure which, then a lineup: it refines the report standing, in place.
    expect(decideRocket(stands('grunt:water'), who('grunt:water:male'), NOW)).toBe('refine');
    // A lineup, then not sure which: the lineup says more already.
    expect(decideRocket(stands('grunt:water:male'), who('grunt:water'), NOW)).toBe('already');
    // One lineup over the other: it replaces it, in place.
    expect(decideRocket(stands('grunt:water:male'), who('grunt:water:female'), NOW)).toBe('refine');
    // The same key twice.
    expect(decideRocket(stands('grunt:water:female'), who('grunt:water:female'), NOW)).toBe(
      'already',
    );
    // Another type is another grunt, whatever its lineup.
    expect(decideRocket(stands('grunt:water:male'), who('grunt:none:male'), NOW)).toBe('report');
    expect(decideRocket(stands('grunt:none'), who('grunt:water:male'), NOW)).toBe('report');
    // Ended, it is a report of its own.
    expect(decideRocket(standing('grunt:water', NOW), who('grunt:water:male'), NOW)).toBe('report');
    // A hideout stands: a lineup asks as any grunt does.
    expect(decideRocket(stands('leader:arlo'), who('grunt:water:male'), NOW)).toBe('asks');
  });

  it('refines the same lineup key whose first slot rotated within the 30 minutes (L5)', () => {
    const male = (lineup: string) => standing('grunt:water:male', NOW + 1, 7, lineup);
    const table: [ReturnType<typeof standing>, ReturnType<typeof who>, string][] = [
      // The same key and the same first slot: reported already.
      [male('Magikarp, Feebas'), who('grunt:water:male', 'Magikarp, Feebas'), 'already'],
      // The same key, another first slot (the lineups rotated meanwhile): it refines.
      [male('Magikarp, Feebas'), who('grunt:water:male', 'Magikarp, Goldeen'), 'refine'],
      // A label where none stood (a report of before) is news of the lineup too.
      [standing('grunt:water:male', NOW + 1), who('grunt:water:male', 'Magikarp'), 'refine'],
      // Not sure which over a lineup stays "already", whatever the label.
      [male('Magikarp, Feebas'), who('grunt:water'), 'already'],
      // The other lineup over one: refines.
      [male('Magikarp, Feebas'), who('grunt:water:female', 'Mudkip'), 'refine'],
    ];
    for (const [stands, report, outcome] of table) {
      expect(decideRocket(stands, report, NOW)).toBe(outcome);
    }
  });

  it('asks before a grunt replaces a hideout, unless that very hideout was asked about', () => {
    const arlo = standing('leader:arlo', at('2026-10-23T00:00'), 7);
    expect(decideRocket(arlo, who('grunt:water'), NOW)).toBe('asks');
    expect(decideRocket(arlo, who('grunt:water'), NOW, 7)).toBe('report');
    // Another hideout came while the question was open: asked again.
    expect(decideRocket(arlo, who('grunt:water'), NOW, 6)).toBe('asks');
    expect(decideRocket(standing('decoy', NOW + 1), who('grunt:none'), NOW)).toBe('asks');
  });

  it('lets a hideout replace whatever stands, the same hideout too', () => {
    for (const before of ['grunt:water', 'leader:arlo', 'giovanni', 'decoy']) {
      expect(decideRocket(standing(before, NOW + 1), who('giovanni'), NOW)).toBe('report');
    }
  });
});

describe('rocketDay', () => {
  it('is the local day, ending at the next local midnight', () => {
    expect(rocketDay(NOW, ZONE)).toEqual({
      key: 'day:2026-10-22',
      end: at('2026-10-23T00:00'),
    });
    expect(rocketDay(at('2026-10-22T23:59'), ZONE).key).toBe('day:2026-10-22');
    expect(rocketDay(at('2026-10-23T00:00'), ZONE).key).toBe('day:2026-10-23');
  });

  it('ends at midnight on a day of a change of the clocks', () => {
    // 2026-11-01 has 25 hours in New York.
    expect(rocketDay(at('2026-11-01T09:00'), ZONE).end).toBe(at('2026-11-02T00:00'));
  });
});
